import sqlite3
import os
import json

db_path = r"C:\Users\SHADOWSNAPS\AppData\Roaming\com.shadowsnaps.kolabiz\companies\carsown_20260826_124417.db"
if not os.path.exists(db_path):
    db_path = r"C:\Users\SHADOWSNAPS\Downloads\carsown_20260826_124417.db"

print(f"Using DB at: {db_path}")

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# 1. Inspect tables in DB
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [row['name'] for row in cursor.fetchall()]
print("\n=== Tables in Database ===")
print(tables)

# 2. Company details if any
if 'company_profile' in tables or 'companies' in tables:
    try:
        cursor.execute("SELECT * FROM company_profile")
        print("\n=== Company Profile ===")
        for r in cursor.fetchall():
            print(dict(r))
    except Exception as e:
        print("Company profile query error:", e)

# 3. Check Vouchers summary (by type and year/month)
print("\n=== Voucher Summary by Type ===")
cursor.execute("""
    SELECT voucher_type, COUNT(*) as count, MIN(voucher_date) as min_date, MAX(voucher_date) as max_date 
    FROM vouchers 
    WHERE deleted_at IS NULL 
    GROUP BY voucher_type
""")
for r in cursor.fetchall():
    print(dict(r))

# 4. Check Chart of Accounts (Income & Expense accounts)
print("\n=== Income & Expense Accounts ===")
cursor.execute("""
    SELECT id, account_code, account_name, account_type, account_group, opening_balance, opening_balance_type 
    FROM chart_of_accounts 
    WHERE deleted_at IS NULL AND account_type IN ('Income', 'Expense')
""")
for r in cursor.fetchall():
    print(dict(r))

# 5. Check Journal Entries totals by account type for active vouchers
print("\n=== Journal Entries Summary for Income/Expense Accounts ===")
cursor.execute("""
    SELECT coa.account_type, coa.account_code, coa.account_name, coa.account_group,
           SUM(je.debit) as total_debit, SUM(je.credit) as total_credit
    FROM chart_of_accounts coa
    JOIN journal_entries je ON coa.id = je.account_id
    JOIN vouchers v ON je.voucher_id = v.id
    WHERE v.deleted_at IS NULL AND v.voucher_type != 'opening_balance' AND coa.account_type IN ('Income', 'Expense')
    GROUP BY coa.id
""")
for r in cursor.fetchall():
    print(dict(r))

# 6. Check Stock / Products
print("\n=== Products & Stock Summary ===")
cursor.execute("""
    SELECT COUNT(*) as total_products, 
           SUM(purchase_rate) as total_purchase_rate,
           SUM(sales_rate) as total_sales_rate
    FROM products WHERE deleted_at IS NULL
""")
print(dict(cursor.fetchone()))

# 7. Check Stock Movements
print("\n=== Stock Movements Summary ===")
cursor.execute("""
    SELECT sm.movement_type, v.voucher_type, COUNT(*) as count, SUM(sm.quantity) as total_qty, SUM(sm.cost_amount) as total_cost
    FROM stock_movements sm
    JOIN vouchers v ON sm.voucher_id = v.id
    WHERE v.deleted_at IS NULL
    GROUP BY sm.movement_type, v.voucher_type
""")
for r in cursor.fetchall():
    print(dict(r))

conn.close()
