import sqlite3
import uuid

try:
    db_path = 'src-tauri/db/kolabiz.db'
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    
    cols = ['id', 'voucher_no', 'voucher_type', 'voucher_date', 'party_id', 'salesperson_id', 'party_type', 'reference', 'subtotal', 'discount_rate', 'discount_amount', 'tax_amount', 'total_amount', 'narration', 'status', 'created_by', 'tax_inclusive', 'cgst_amount', 'sgst_amount', 'igst_amount', 'grand_total']
    
    vals = [str(uuid.uuid4()), 'TEST-001', 'sales_invoice', '2024-01-01', 'party1', 'sales1', 'customer', 'ref1', 100.0, 0.0, 0.0, 18.0, 118.0, 'narr', 'posted', 'user1', 0, 9.0, 9.0, 0.0, 118.0]
    
    q_marks = ','.join(['?'] * len(cols))
    cols_joined = ','.join(cols)
    q = f"INSERT INTO vouchers ({cols_joined}) VALUES ({q_marks})"
    
    cur.execute(q, vals)
    print('SQLite INSERT successful! Schema is matching.')
    conn.commit()
    
    cur.execute("DELETE FROM vouchers WHERE voucher_no = 'TEST-001'")
    conn.commit()

except Exception as e:
    print('SQL ERROR:', e)
