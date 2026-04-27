"""
Fix invoices.rs: the create/update functions for purchase and sales invoices
have `registry: State<'_, Arc<DbRegistry>>` signature but no pool extraction.
Add `let pool = registry.active_pool().await?;` to each.

Also fix auth.rs mismatched type.
Also fix db.rs unused import.
Also fix parties.rs and entries.rs cross-module calls in templates.rs.
"""

import os
import re

commands_dir = r"d:\MunnaProjects\Kola-biz\src-tauri\src\commands"

# Fix invoices.rs - the create/update commands that got State<Arc<DbRegistry>> 
# but still use `pool` in body
invoices_path = os.path.join(commands_dir, 'invoices.rs')
with open(invoices_path, 'r', encoding='utf-8') as f:
    content = f.read()

original = content

# Find all tauri::command functions that have registry: State but no active_pool call
lines = content.split('\n')
result = []
i = 0
in_tauri_cmd = False
fn_has_registry = False
brace_depth = 0
in_fn_body = False

while i < len(lines):
    line = lines[i]
    
    if '#[tauri::command]' in line:
        in_tauri_cmd = True
        fn_has_registry = False
        brace_depth = 0
        in_fn_body = False
    
    if in_tauri_cmd and 'registry: State' in line and 'Arc<DbRegistry>' in line:
        fn_has_registry = True
    
    # Detect start of function body
    if in_tauri_cmd and fn_has_registry and not in_fn_body:
        stripped = line.rstrip()
        if stripped.endswith('{') and 'fn ' in ''.join(lines[max(0,i-10):i+1]):
            # Check if this is the function signature end (not inside an if/match)
            # Count opening parens to see if we're past the signature
            preceding = '\n'.join(lines[max(0,i-5):i+1])
            if 'async fn ' in preceding or 'pub fn ' in preceding:
                in_fn_body = True
                result.append(line)
                # Check if next line already has active_pool
                next_line = lines[i+1] if i+1 < len(lines) else ''
                if 'active_pool()' not in next_line and 'let pool' not in next_line:
                    result.append('    let pool = registry.active_pool().await?;')
                i += 1
                continue
    
    result.append(line)
    i += 1

new_content = '\n'.join(result)
if new_content != content:
    with open(invoices_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("FIXED invoices.rs - added active_pool() calls")
    content = new_content
else:
    print("NO CHANGE to invoices.rs")

# Fix purchase_returns.rs and sales_returns.rs similarly
for fname in ['purchase_returns.rs', 'sales_returns.rs']:
    fpath = os.path.join(commands_dir, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        fc = f.read()
    orig = fc
    lines2 = fc.split('\n')
    result2 = []
    i = 0
    in_tauri_cmd2 = False
    fn_has_registry2 = False
    in_fn_body2 = False
    while i < len(lines2):
        line = lines2[i]
        if '#[tauri::command]' in line:
            in_tauri_cmd2 = True
            fn_has_registry2 = False
            in_fn_body2 = False
        if in_tauri_cmd2 and 'registry: State' in line and 'Arc<DbRegistry>' in line:
            fn_has_registry2 = True
        if in_tauri_cmd2 and fn_has_registry2 and not in_fn_body2:
            stripped = line.rstrip()
            if stripped.endswith('{'):
                preceding = '\n'.join(lines2[max(0,i-5):i+1])
                if 'async fn ' in preceding or 'pub fn ' in preceding:
                    in_fn_body2 = True
                    result2.append(line)
                    next_line = lines2[i+1] if i+1 < len(lines2) else ''
                    if 'active_pool()' not in next_line and 'let pool' not in next_line:
                        result2.append('    let pool = registry.active_pool().await?;')
                    i += 1
                    continue
        result2.append(line)
        i += 1
    new_fc = '\n'.join(result2)
    if new_fc != orig:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(new_fc)
        print(f"FIXED {fname}")

# Fix db.rs - remove unused Sqlite import
db_path = r"d:\MunnaProjects\Kola-biz\src-tauri\src\db.rs"
with open(db_path, 'r', encoding='utf-8') as f:
    db_content = f.read()
# Remove Sqlite from import since we only need SqlitePool now
db_content = db_content.replace(
    'use sqlx::{sqlite::SqlitePool, Sqlite};',
    'use sqlx::sqlite::SqlitePool;'
)
with open(db_path, 'w', encoding='utf-8') as f:
    f.write(db_content)
print("FIXED db.rs - removed unused Sqlite import")

# Fix auth.rs mismatched type at line 100
# The error is likely a function call that's passing wrong type
auth_path = os.path.join(commands_dir, 'auth.rs')
with open(auth_path, 'r', encoding='utf-8') as f:
    auth_content = f.read()
# Show lines around 100
auth_lines = auth_content.split('\n')
for idx in range(90, min(110, len(auth_lines))):
    print(f"auth.rs:{idx+1}: {auth_lines[idx]}")

print("\nDone")
