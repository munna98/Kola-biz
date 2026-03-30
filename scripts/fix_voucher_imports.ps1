# Script to replace duplicate get_next_voucher_number functions with a shared module import
# Files that still need the old function removed (invoices.rs and sales_returns.rs already have the import added
# but we need to verify and remove old functions; others need both)

$files = @(
    "d:\MunnaProjects\Kola-biz\src-tauri\src\commands\invoices.rs",
    "d:\MunnaProjects\Kola-biz\src-tauri\src\commands\sales_returns.rs",
    "d:\MunnaProjects\Kola-biz\src-tauri\src\commands\stock_journal.rs",
    "d:\MunnaProjects\Kola-biz\src-tauri\src\commands\purchase_returns.rs"
)

foreach ($file in $files) {
    Write-Host "Processing: $file"
    $content = Get-Content $file -Raw -Encoding UTF8

    # Remove the old duplicate function block (async fn get_next_voucher_number ... Ok(voucher_no)\n}\n)
    # This regex matches the entire function body
    $oldFn = @'
async fn get_next_voucher_number\(pool: &SqlitePool, voucher_type: &str\) -> Result<String, String> \{[^}]+let mut tx = pool\.begin\(\)\.await\.map_err\(\|e\| e\.to_string\(\)\)\?;[\s\S]*?Ok\(voucher_no\)\r?\n\}\r?\n
'@
    $newContent = $content -replace $oldFn, ""

    # Now ensure the import line is present after "use super::resolve_voucher_line_unit;"
    # (or after the last use statement if resolve_voucher_line_unit isn't present)
    $importLine = "use crate::voucher_seq::get_next_voucher_number;"

    if ($newContent -notmatch [regex]::Escape($importLine)) {
        # Add after "use super::resolve_voucher_line_unit;"
        if ($newContent -match "use super::resolve_voucher_line_unit;") {
            $newContent = $newContent -replace "use super::resolve_voucher_line_unit;", "use super::resolve_voucher_line_unit;`nuse crate::voucher_seq::get_next_voucher_number;"
        } else {
            # Add after last "use " block
            $newContent = $newContent -replace "(use [^\r\n]+\r?\n)\r?\n", "`$1$importLine`n`n"
        }
    }

    Set-Content $file $newContent -Encoding UTF8 -NoNewline
    Write-Host "  Done - import present: $($newContent -match [regex]::Escape($importLine))"
    
    # Verify old function is gone
    $stillHasOldFn = $newContent -match "async fn get_next_voucher_number"
    Write-Host "  Old fn still present: $stillHasOldFn"
}

Write-Host "`nAll done!"
