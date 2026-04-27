"""
Step 4 of refactor: Replace pool.inner() and pool.begin() usage patterns.

The strategy:
- Each #[tauri::command] async fn that receives `registry: State<'_, Arc<DbRegistry>>`
  needs `let pool = registry.active_pool().await?;` added as the first line.
- All `pool.inner()` → `&pool`
- All `pool.begin()` → `pool.begin()`  (same, since pool is now owned, not &State)
- registry.inner() usages that exist from old pool.inner() → &pool
"""

import os
import re

commands_dir = r"d:\MunnaProjects\Kola-biz\src-tauri\src\commands"
skip_files = {'company_cmds.rs', 'license.rs', 'mod.rs'}

def insert_active_pool_call(func_body: str) -> str:
    """Insert `let pool = registry.active_pool().await?;` as first statement in function body."""
    # Find the opening brace and insert after it
    # Pattern: find `{` then insert on next line
    stripped = func_body.lstrip()
    if stripped.startswith('{'):
        return func_body.replace('{', '{\n    let pool = registry.active_pool().await?;', 1)
    return func_body

for fname in os.listdir(commands_dir):
    if not fname.endswith('.rs') or fname in skip_files:
        continue
    
    fpath = os.path.join(commands_dir, fname)
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'Arc<DbRegistry>' not in content:
        continue
    
    original = content
    
    # 1. For each tauri::command function that uses registry: State<'_, Arc<DbRegistry>>
    #    inject `let pool = registry.active_pool().await?;` at the start.
    #    We match the function body opening brace after the signature.
    
    # Pattern: find async fn ... registry: State<'_, Arc<DbRegistry>> ... -> Result<...> {
    # This is complex, so we use a simpler heuristic:
    # For every function body that contains `registry.inner()` or `registry.begin()` or
    # `registry.active_pool()` is NOT already there — add the pool extraction.
    
    # Replace registry.inner() → &pool  (leftover from previous State rename)
    content = content.replace('registry.inner()', '&pool')
    
    # Replace pool.inner() → &pool  (some files may still have this)
    content = content.replace('pool.inner()', '&pool')
    
    # Replace pool.begin() → pool.begin() (pool is now owned SqlitePool, not &State)
    # No change needed for .begin() since SqlitePool::begin() takes &self
    
    # Now we need to inject `let pool = registry.active_pool().await?;` into each
    # tauri::command function that uses registry and doesn't already have it.
    
    # Find all tauri command function bodies
    # We look for the pattern: `#[tauri::command]` followed by `pub async fn` 
    # and then the function body
    
    def add_pool_extraction(match):
        full_match = match.group(0)
        # Only add if `registry` is a parameter AND pool extraction not already present
        if 'registry: State' in full_match and 'active_pool()' not in full_match:
            # Find the opening brace of the function body
            brace_pos = full_match.index('{')
            return full_match[:brace_pos+1] + '\n    let pool = registry.active_pool().await?;' + full_match[brace_pos+1:]
        return full_match
    
    # Match each complete tauri command function 
    # Strategy: find #[tauri::command] ... pub async fn NAME(...) -> Result<...> { ... }
    # This is hard with simple regex due to nested braces.
    # Use a line-by-line state machine instead.
    
    lines = content.split('\n')
    result_lines = []
    i = 0
    in_tauri_command = False
    brace_depth = 0
    func_start = False
    inserted = False
    func_has_registry = False
    
    while i < len(lines):
        line = lines[i]
        
        if '#[tauri::command]' in line:
            in_tauri_command = True
            func_has_registry = False
            inserted = False
        
        if in_tauri_command and 'registry: State' in line:
            func_has_registry = True
        
        if in_tauri_command and func_has_registry and not inserted:
            if line.strip() == '{' or line.rstrip().endswith(' {'):
                # Opening brace of function body
                result_lines.append(line)
                # Check if next line already has active_pool
                next_line = lines[i+1] if i+1 < len(lines) else ''
                if 'active_pool()' not in next_line:
                    result_lines.append('    let pool = registry.active_pool().await?;')
                inserted = True
                i += 1
                continue
        
        result_lines.append(line)
        i += 1
    
    content = '\n'.join(result_lines)
    
    if content != original:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"UPDATED: {fname}")
    else:
        print(f"NO CHANGE: {fname}")

print("\nDone. pool.inner() replaced, active_pool() injected into command functions.")
