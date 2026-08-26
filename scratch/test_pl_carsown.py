import sqlite3
import os
import json

db_path = r"C:\Users\SHADOWSNAPS\AppData\Roaming\com.shadowsnaps.kolabiz\companies\carsown_20260826_124417.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Get date range of vouchers
cursor.execute("SELECT MIN(voucher_date) as min_date, MAX(voucher_date) as max_date FROM vouchers WHERE deleted_at IS NULL")
date_range = cursor.fetchone()
from_date = date_range['min_date'] or "2000-01-01"
to_date = date_range['max_date'] or "2099-12-31"

print(f"Date range in DB: {from_date} to {to_date}")

# Let's run the exact stock value calculation as of from_date (opening) and to_date (closing)
def get_stock_value_as_of_date(as_of_date, is_opening):
    if is_opening:
        date_cond = "v.voucher_date < ? OR (v.voucher_type = 'opening_stock' AND v.voucher_date = ?)"
        params = (as_of_date, as_of_date, as_of_date, as_of_date)
    else:
        date_cond = "v.voucher_date <= ?"
        params = (as_of_date, as_of_date)

    query = f"""
        SELECT 
            p.id, p.name,
            COALESCE(SUM(CASE WHEN sm.movement_type = 'IN' THEN sm.quantity ELSE -sm.quantity END), 0) as net_qty,
            COALESCE(
                (
                    SELECT CASE WHEN SUM(sm_in.quantity) > 0 THEN SUM(sm_in.cost_amount) / SUM(sm_in.quantity) ELSE NULL END
                    FROM stock_movements sm_in
                    JOIN vouchers v_in ON sm_in.voucher_id = v_in.id
                    WHERE sm_in.product_id = p.id
                      AND sm_in.movement_type = 'IN'
                      AND v_in.voucher_type IN ('purchase_invoice', 'opening_stock', 'stock_journal')
                      AND v_in.deleted_at IS NULL
                      AND ({date_cond})
                ),
                p.purchase_rate,
                0.0
            ) as unit_cost
        FROM products p
        JOIN stock_movements sm ON p.id = sm.product_id
        JOIN vouchers v ON sm.voucher_id = v.id AND v.deleted_at IS NULL AND ({date_cond})
        WHERE p.deleted_at IS NULL
        GROUP BY p.id
        HAVING net_qty != 0
    """
    cursor.execute(query, params)
    rows = cursor.fetchall()
    total_val = 0.0
    items = []
    for r in rows:
        val = r['net_qty'] * r['unit_cost']
        total_val += val
        items.append((r['name'], r['net_qty'], r['unit_cost'], val))
    return round(total_val, 2), items

opening_stock, op_items = get_stock_value_as_of_date(from_date, True)
closing_stock, cl_items = get_stock_value_as_of_date(to_date, False)

print(f"\nOpening Stock Value: {opening_stock}")
print(f"Closing Stock Value: {closing_stock} (Count: {len(cl_items)} items)")

# Purchases query from stock movements
cursor.execute("""
    SELECT CAST(COALESCE(SUM(sm.cost_amount), 0.0) AS REAL)
    FROM stock_movements sm
    JOIN vouchers v ON sm.voucher_id = v.id
    WHERE v.voucher_type = 'purchase_invoice'
      AND sm.movement_type = 'IN'
      AND v.voucher_date >= ? AND v.voucher_date <= ?
      AND v.deleted_at IS NULL
""", (from_date, to_date))
period_purchases = cursor.fetchone()[0]
print(f"Period Purchases from stock_movements: {period_purchases}")

# Income and Expense rows from journal_entries
cursor.execute("""
    SELECT 
        coa.id,
        coa.account_name,
        coa.account_code,
        coa.account_type,
        coa.account_group,
        CAST(COALESCE(SUM(je.debit), 0) AS REAL) as dr,
        CAST(COALESCE(SUM(je.credit), 0) AS REAL) as cr
    FROM chart_of_accounts coa
    JOIN journal_entries je ON coa.id = je.account_id
    JOIN vouchers v ON je.voucher_id = v.id
    WHERE v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
    AND v.voucher_type != 'opening_balance'
    AND coa.account_type IN ('Income', 'Expense')
    GROUP BY coa.id
""", (from_date, to_date))
rows = cursor.fetchall()

total_income = 0.0
cogs_from_gl = 0.0
purchases_gl = 0.0
operating_expenses = 0.0

income_list = []
direct_expense_list = []
operating_expense_list = []

for r in rows:
    acc_type = r['account_type']
    code = r['account_code']
    name = r['account_name']
    group_name = r['account_group']
    dr = r['dr']
    cr = r['cr']

    if acc_type == 'Income':
        amt = cr - dr
        total_income += amt
        income_list.append((code, name, amt))
    elif code == '5002': # COGS
        amt = dr - cr
        cogs_from_gl += amt
        direct_expense_list.append((code, name, amt))
    elif code in ('5001', '5003'):
        amt = dr - cr
        purchases_gl += amt
        direct_expense_list.append((code, name, amt))
    else:
        amt = dr - cr
        operating_expenses += amt
        operating_expense_list.append((code, name, amt))

print("\n--- Income Accounts ---")
for item in income_list:
    print(item)
print(f"Total Income: {total_income}")

print("\n--- Direct Expense / COGS GL Accounts ---")
for item in direct_expense_list:
    print(item)
print(f"cogs_from_gl: {cogs_from_gl}")
print(f"purchases_gl: {purchases_gl}")

print("\n--- Operating Expense Accounts ---")
for item in operating_expense_list:
    print(item)
print(f"Total Operating Expenses: {operating_expenses}")

# Current Rust Code logic for COGS:
total_purchases_rust = period_purchases if (period_purchases > 0 and purchases_gl == 0) else purchases_gl
if cogs_from_gl > 0:
    cogs_rust = cogs_from_gl + total_purchases_rust
else:
    cogs_rust = max(0.0, opening_stock + total_purchases_rust - closing_stock)

net_profit_rust = total_income - (cogs_rust + operating_expenses)

print("\n=== CURRENT RUST LOGIC OUTPUT ===")
print(f"total_purchases: {total_purchases_rust}")
print(f"cogs_from_gl: {cogs_from_gl}")
print(f"cogs calculated: {cogs_rust}")
print(f"total operating expenses: {operating_expenses}")
print(f"Total Expenses (cogs + operating): {cogs_rust + operating_expenses}")
print(f"NET PROFIT / (LOSS): {net_profit_rust}")

# Standard Accounting Logic Option 1 (Perpetual Inventory - when COGS is already recorded in GL):
cogs_perpetual = cogs_from_gl
net_profit_perpetual = total_income - (cogs_perpetual + operating_expenses)

print("\n=== CORRECTED PERPETUAL LOGIC OUTPUT ===")
print(f"COGS (from GL): {cogs_perpetual}")
print(f"Operating Expenses: {operating_expenses}")
print(f"Total Expenses: {cogs_perpetual + operating_expenses}")
print(f"NET PROFIT / (LOSS): {net_profit_perpetual}")

# Standard Accounting Logic Option 2 (Periodic Inventory - COGS = Opening + Purchases - Closing):
cogs_periodic = max(0.0, opening_stock + total_purchases_rust - closing_stock)
net_profit_periodic = total_income - (cogs_periodic + operating_expenses)

print("\n=== CORRECTED PERIODIC LOGIC OUTPUT ===")
print(f"COGS (Opening {opening_stock} + Purchases {total_purchases_rust} - Closing {closing_stock}): {cogs_periodic}")
print(f"Operating Expenses: {operating_expenses}")
print(f"Total Expenses: {cogs_periodic + operating_expenses}")
print(f"NET PROFIT / (LOSS): {net_profit_periodic}")

conn.close()
