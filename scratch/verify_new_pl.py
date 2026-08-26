import sqlite3

db_path = r"C:\Users\SHADOWSNAPS\AppData\Roaming\com.shadowsnaps.kolabiz\companies\carsown_20260826_124417.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT MIN(voucher_date) as min_date, MAX(voucher_date) as max_date FROM vouchers WHERE deleted_at IS NULL")
date_range = cursor.fetchone()
from_date = date_range['min_date']
to_date = date_range['max_date']

def get_stock_val(as_of, is_opening):
    cond = "v.voucher_date < ? OR (v.voucher_type = 'opening_stock' AND v.voucher_date = ?)" if is_opening else "v.voucher_date <= ?"
    params = (as_of, as_of, as_of, as_of) if is_opening else (as_of, as_of)
    q = f"""
        SELECT p.id,
            COALESCE(SUM(CASE WHEN sm.movement_type = 'IN' THEN sm.quantity ELSE -sm.quantity END), 0) as net_qty,
            COALESCE((
                SELECT CASE WHEN SUM(sm_in.quantity) > 0 THEN SUM(sm_in.cost_amount) / SUM(sm_in.quantity) ELSE NULL END
                FROM stock_movements sm_in JOIN vouchers v_in ON sm_in.voucher_id = v_in.id
                WHERE sm_in.product_id = p.id AND sm_in.movement_type = 'IN'
                  AND v_in.voucher_type IN ('purchase_invoice', 'opening_stock', 'stock_journal')
                  AND v_in.deleted_at IS NULL AND ({cond})
            ), p.purchase_rate, 0.0) as unit_cost
        FROM products p
        JOIN stock_movements sm ON p.id = sm.product_id
        JOIN vouchers v ON sm.voucher_id = v.id AND v.deleted_at IS NULL AND ({cond})
        WHERE p.deleted_at IS NULL GROUP BY p.id HAVING net_qty != 0
    """
    cursor.execute(q, params)
    return round(sum(r['net_qty'] * r['unit_cost'] for r in cursor.fetchall()), 2)

opening_stock = get_stock_val(from_date, True)
closing_stock = get_stock_val(to_date, False)

cursor.execute("""
    SELECT CAST(COALESCE(SUM(sm.cost_amount), 0.0) AS REAL)
    FROM stock_movements sm JOIN vouchers v ON sm.voucher_id = v.id
    WHERE v.voucher_type = 'purchase_invoice' AND sm.movement_type = 'IN'
      AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
""", (from_date, to_date))
period_purchases = cursor.fetchone()[0]

cursor.execute("""
    SELECT coa.account_code, coa.account_type, SUM(je.debit) as dr, SUM(je.credit) as cr
    FROM chart_of_accounts coa
    JOIN journal_entries je ON coa.id = je.account_id
    JOIN vouchers v ON je.voucher_id = v.id
    WHERE v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
      AND v.voucher_type != 'opening_balance' AND coa.account_type IN ('Income', 'Expense')
    GROUP BY coa.id
""", (from_date, to_date))
rows = cursor.fetchall()

total_income = sum(r['cr'] - r['dr'] for r in rows if r['account_type'] == 'Income')
cogs_from_gl = sum(r['dr'] - r['cr'] for r in rows if r['account_code'] == '5002')
purchases_gl = sum(r['dr'] - r['cr'] for r in rows if r['account_code'] in ('5001', '5003', '6010'))
operating_exp = sum(r['dr'] - r['cr'] for r in rows if r['account_type'] == 'Expense' and r['account_code'] not in ('5002', '5001', '5003', '6010'))

total_purchases = period_purchases if (period_purchases > 0 and purchases_gl == 0) else purchases_gl

if cogs_from_gl > 0:
    cogs = round(cogs_from_gl + purchases_gl, 2)
else:
    cogs = round(max(0.0, opening_stock + total_purchases - closing_stock), 2)

gross_profit = round(total_income - cogs, 2)
total_expenses = round(cogs + operating_exp, 2)
net_profit = round(total_income - total_expenses, 2)

print("=== NEW UNIVERSAL P&L CALCULATION FOR CARSOWN DB ===")
print(f"Total Income: {total_income:,.2f}")
print(f"Opening Stock: {opening_stock:,.2f}")
print(f"Purchases (Display/Stock): {total_purchases:,.2f}")
print(f"Closing Stock: {closing_stock:,.2f}")
print(f"COGS: {cogs:,.2f}")
print(f"Gross Profit: {gross_profit:,.2f}")
print(f"Operating Expenses: {operating_exp:,.2f}")
print(f"Total Expenses: {total_expenses:,.2f}")
print(f"NET PROFIT / (LOSS): {net_profit:,.2f}")

conn.close()
