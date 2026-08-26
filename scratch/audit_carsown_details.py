import sqlite3
import os

db_path = r"C:\Users\SHADOWSNAPS\AppData\Roaming\com.shadowsnaps.kolabiz\companies\carsown_20260826_124417.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("=== AUDITING CARSOWN DB ===")

# 1. Check unbalanced vouchers (Debit != Credit)
cursor.execute("""
    SELECT v.id, v.voucher_no, v.voucher_type, v.voucher_date,
           SUM(je.debit) as total_debit, SUM(je.credit) as total_credit
    FROM vouchers v
    JOIN journal_entries je ON v.id = je.voucher_id
    WHERE v.deleted_at IS NULL
    GROUP BY v.id
    HAVING ABS(total_debit - total_credit) > 0.01
""")
unbalanced = cursor.fetchall()
print(f"\n1. Unbalanced Vouchers: {len(unbalanced)}")

# 2. Check stock movements vs inventory balances
cursor.execute("""
    SELECT p.name, 
           SUM(CASE WHEN sm.movement_type = 'IN' THEN sm.quantity ELSE -sm.quantity END) as qty,
           p.purchase_rate, p.sales_rate
    FROM products p
    LEFT JOIN stock_movements sm ON p.id = sm.product_id
    LEFT JOIN vouchers v ON sm.voucher_id = v.id AND v.deleted_at IS NULL
    WHERE p.deleted_at IS NULL
    GROUP BY p.id
    HAVING qty < 0
""")
neg_stock = cursor.fetchall()
print(f"\n2. Negative Stock Items: {len(neg_stock)}")

# 3. Check for Expense accounts
cursor.execute("""
    SELECT account_code, account_name, account_type, account_group, opening_balance 
    FROM chart_of_accounts 
    WHERE deleted_at IS NULL
    ORDER BY account_type, account_code
""")
accounts = cursor.fetchall()
print(f"\n3. Total Accounts in COA: {len(accounts)}")

# 4. Check special vouchers
cursor.execute("""
    SELECT v.voucher_no, v.voucher_type, v.voucher_date, v.total_amount
    FROM vouchers v
    WHERE v.deleted_at IS NULL AND v.voucher_type IN ('opening_balance', 'journal', 'opening_stock')
""")
ob_vouchers = cursor.fetchall()
print(f"\n4. Special Vouchers (opening/journal): {len(ob_vouchers)}")
for ob in ob_vouchers:
    print(dict(ob))

# 5. Check Sales Invoices detail (Total Sales vs COGS for each invoice)
cursor.execute("""
    SELECT v.voucher_no, v.voucher_date, v.total_amount as invoice_amount,
           (SELECT SUM(je.debit) FROM journal_entries je JOIN chart_of_accounts coa ON je.account_id = coa.id WHERE je.voucher_id = v.id AND coa.account_code = '5002') as cogs_debited,
           (SELECT SUM(sm.cost_amount) FROM stock_movements sm WHERE sm.voucher_id = v.id) as sm_cost
    FROM vouchers v
    WHERE v.deleted_at IS NULL AND v.voucher_type = 'sales_invoice'
""")
sales_invs = cursor.fetchall()
print(f"\n5. Sales Invoices breakdown ({len(sales_invs)} invoices):")
total_sales_val = 0
total_cogs_val = 0
for s in sales_invs:
    print(dict(s))
    total_sales_val += s['invoice_amount'] or 0
    total_cogs_val += s['cogs_debited'] or 0

print(f"\nTotal Sales Invoices Sum: {total_sales_val}, Total COGS debited: {total_cogs_val}")

conn.close()
