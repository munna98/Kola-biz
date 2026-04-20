
# Count columns vs VALUES ? vs .bind() calls for voucher INSERTs
import re

with open('src-tauri/src/commands/invoices.rs', 'r', encoding='utf-8') as f:
    content = f.read()

def analyze_insert(label, start_offset):
    start = content.find('INSERT INTO vouchers', start_offset)
    end = content.find('.execute(', start)
    chunk = content[start:end]

    # columns
    col_part = re.search(r'\(([^)]+)\)', chunk)
    cols = [c.strip() for c in col_part.group(1).split(',')] if col_part else []

    # value placeholders (? or literals)
    val_part = re.search(r'VALUES\s*\(([^)]+)\)', chunk)
    vals = [v.strip() for v in val_part.group(1).split(',')] if val_part else []

    # .bind( calls
    binds = chunk.count('.bind(')

    print(f"\n{label}")
    print(f"  Columns : {len(cols)}")
    print(f"  Values  : {len(vals)}  (? + literals)")
    print(f"  .bind() : {binds}")
    if len(cols) != binds:
        print(f"  *** MISMATCH: {len(cols)} cols vs {binds} binds ***")
    else:
        print(f"  OK - all match")

analyze_insert("Purchase CREATE", 0)
analyze_insert("Sales CREATE", content.find('INSERT INTO vouchers', 500))
