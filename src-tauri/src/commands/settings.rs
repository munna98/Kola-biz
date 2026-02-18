use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePool;
use tauri::{Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Serialize, Deserialize)]
pub struct PrintSettings {
    pub silent_print: bool,
    pub default_printer: Option<String>,
}

impl Default for PrintSettings {
    fn default() -> Self {
        PrintSettings {
            silent_print: false,
            default_printer: None,
        }
    }
}

/// Get a specific app setting by key
#[tauri::command]
pub async fn get_app_setting(
    pool: State<'_, SqlitePool>,
    key: String,
) -> Result<Option<String>, String> {
    let result = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = ?",
    )
    .bind(&key)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(result)
}

/// Set an app setting (upsert)
#[tauri::command]
pub async fn set_app_setting(
    pool: State<'_, SqlitePool>,
    key: String,
    value: String,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO app_settings (id, setting_key, setting_value, updated_at) 
         VALUES (hex(randomblob(16)), ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(setting_key) DO UPDATE SET 
         setting_value = excluded.setting_value,
         updated_at = CURRENT_TIMESTAMP",
    )
    .bind(&key)
    .bind(&value)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get print settings
#[tauri::command]
pub async fn get_print_settings(pool: State<'_, SqlitePool>) -> Result<PrintSettings, String> {
    let silent = get_app_setting(pool.clone(), "silent_print".to_string()).await?;
    let printer = get_app_setting(pool.clone(), "default_printer".to_string()).await?;

    Ok(PrintSettings {
        silent_print: silent.map(|v| v == "true").unwrap_or(false),
        default_printer: printer,
    })
}

/// Save print settings
#[tauri::command]
pub async fn save_print_settings(
    pool: State<'_, SqlitePool>,
    settings: PrintSettings,
) -> Result<(), String> {
    set_app_setting(
        pool.clone(),
        "silent_print".to_string(),
        settings.silent_print.to_string(),
    )
    .await?;
    if let Some(printer) = settings.default_printer {
        set_app_setting(pool.clone(), "default_printer".to_string(), printer).await?;
    }
    Ok(())
}

/// Get list of available system printers (Windows)
#[tauri::command]
pub async fn get_system_printers() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        // Use PowerShell to get printer list
        let output = Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "-Command",
                "Get-Printer | Select-Object -ExpandProperty Name",
            ])
            .output()
            .map_err(|e| format!("Failed to get printers: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let printers: Vec<String> = stdout
                .lines()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            Ok(printers)
        } else {
            Err("Failed to enumerate printers".to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // For non-Windows, return empty or use lpstat
        Ok(vec![])
    }
}

/// Get the default system printer (Windows)
#[tauri::command]
pub async fn get_default_printer() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let output = Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["-Command", "Get-Printer | Where-Object {$_.IsDefault -eq $true} | Select-Object -ExpandProperty Name"])
            .output()
            .map_err(|e| format!("Failed to get default printer: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() {
                Ok(None)
            } else {
                Ok(Some(stdout))
            }
        } else {
            Ok(None)
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

/// Print HTML content silently to the default printer (Windows)
#[tauri::command]
pub async fn print_silently(
    app_handle: tauri::AppHandle,
    html_content: String,
    printer_name: Option<String>,
) -> Result<(), String> {
    use std::io::Write;
    use std::process::Command;

    // Get temp directory
    let temp_dir = app_handle
        .path()
        .temp_dir()
        .map_err(|e| format!("Failed to get temp dir: {}", e))?;

    // Create temp HTML file
    let temp_file = temp_dir.join("print_temp.html");
    let mut file = std::fs::File::create(&temp_file)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    file.write_all(html_content.as_bytes())
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    #[cfg(target_os = "windows")]
    {
        // Use PowerShell to print the HTML file
        // This uses the default browser's print functionality
        let printer = printer_name.unwrap_or_else(|| "".to_string());

        // If no specific printer, use system default - print via rundll32
        if printer.is_empty() {
            // Open print dialog (not truly silent, but uses system default)
            let result = Command::new("rundll32")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["mshtml.dll,PrintHTML", temp_file.to_str().unwrap()])
                .spawn();

            match result {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("Print failed: {}", e)),
            }
        } else {
            // Print to specific printer using PowerShell
            let ps_script = format!(
                r#"
                $ie = New-Object -ComObject InternetExplorer.Application
                $ie.Navigate('{}')
                while ($ie.Busy) {{ Start-Sleep -Milliseconds 100 }}
                $ie.ExecWB(6, 2)
                Start-Sleep -Seconds 2
                $ie.Quit()
                "#,
                temp_file.to_str().unwrap().replace("\\", "/")
            );

            let result = Command::new("powershell")
                .creation_flags(CREATE_NO_WINDOW)
                .args(["-Command", &ps_script])
                .spawn();

            match result {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("Print failed: {}", e)),
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Silent printing is only supported on Windows".to_string())
    }
}

/// Get voucher settings for a specific voucher type
#[tauri::command]
pub async fn get_voucher_settings(
    pool: State<'_, SqlitePool>,
    voucher_type: String,
) -> Result<Option<serde_json::Value>, String> {
    let result = sqlx::query_scalar::<_, String>(
        "SELECT settings FROM voucher_settings WHERE voucher_type = ?",
    )
    .bind(&voucher_type)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    match result {
        Some(json_str) => serde_json::from_str(&json_str)
            .map(Some)
            .map_err(|e| e.to_string()),
        None => Ok(None),
    }
}

/// Save voucher settings for a specific voucher type
#[tauri::command]
pub async fn save_voucher_settings(
    pool: State<'_, SqlitePool>,
    voucher_type: String,
    settings: serde_json::Value,
) -> Result<(), String> {
    let settings_json = serde_json::to_string(&settings).map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO voucher_settings (voucher_type, settings, updated_at) 
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(voucher_type) DO UPDATE SET 
         settings = excluded.settings,
         updated_at = CURRENT_TIMESTAMP",
    )
    .bind(&voucher_type)
    .bind(&settings_json)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Reset database data based on selected options
#[tauri::command]
pub async fn reset_database_data(
    pool: State<'_, SqlitePool>,
    mode: String,
    voucher_types: Vec<String>,
    master_tables: Vec<String>,
    reset_sequences: bool,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Enable foreign keys explicitly to ensure data integrity or cascading
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 1. Delete selected Voucher Types first (Child tables)
    // This allows deleting master data later if referenced vouchers are removed
    for v_type in &voucher_types {
        // Delete vouchers of this type
        // Note: voucher_items, journal_entries, etc. are ON DELETE CASCADE in schema
        sqlx::query("DELETE FROM vouchers WHERE voucher_type = ?")
            .bind(v_type)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to delete vouchers of type {}: {}", v_type, e))?;

        // Reset sequence if requested
        if reset_sequences {
            sqlx::query("UPDATE voucher_sequences SET next_number = 1 WHERE voucher_type = ?")
                .bind(v_type)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to reset sequence for {}: {}", v_type, e))?;
        }
    }

    // 2. Delete Master Tables (if mode is full)
    // We execute these in a specific dependency order to avoid FK violations
    if mode == "full" {
        // Defined order: Children first, then Parents
        let deletion_order = [
            "opening_balances", // Refers accounts
            "stock_movements", // Refers vouchers/products (should be gone via vouchers cascade, but just in case)
            "products",        // Refers groups/units
            "product_groups",
            "employees",         // Refers accounts
            "customers",         // Legacy table
            "suppliers",         // Legacy table
            "chart_of_accounts", // Refers nothing (internal self-ref)
        ];

        for table_key in deletion_order.iter() {
            // Check if user selected this table to be reset
            let should_delete = master_tables.contains(&table_key.to_string());

            if should_delete {
                match *table_key {
                    "opening_balances" => {
                        sqlx::query("DELETE FROM opening_balances")
                            .execute(&mut *tx)
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                    "products" => {
                        sqlx::query("DELETE FROM products")
                            .execute(&mut *tx)
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                    "product_groups" => {
                        sqlx::query("DELETE FROM product_groups")
                            .execute(&mut *tx)
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                    "employees" => {
                        sqlx::query("DELETE FROM employees")
                            .execute(&mut *tx)
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                    "customers" => {
                        // Delete from legacy table and Chart of Accounts (party_type='Customer')
                        sqlx::query("DELETE FROM customers")
                            .execute(&mut *tx)
                            .await
                            .map_err(|e| e.to_string())?;
                        sqlx::query("DELETE FROM chart_of_accounts WHERE party_type = 'Customer'")
                            .execute(&mut *tx)
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                    "suppliers" => {
                        // Delete from legacy table and Chart of Accounts (party_type='Supplier')
                        sqlx::query("DELETE FROM suppliers")
                            .execute(&mut *tx)
                            .await
                            .map_err(|e| e.to_string())?;
                        sqlx::query("DELETE FROM chart_of_accounts WHERE party_type = 'Supplier'")
                            .execute(&mut *tx)
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                    "chart_of_accounts" => {
                        // Delete all non-system accounts (excluding those we might have just deleted via customers/suppliers)
                        // This wipes the remaining ledger accounts
                        sqlx::query("DELETE FROM chart_of_accounts WHERE is_system = 0")
                            .execute(&mut *tx)
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                    _ => {}
                }
            }
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok("Database reset completed successfully".to_string())
}
