use crate::company_db::{CompanyListItem, DbRegistry};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ===================== TYPES =====================

#[derive(Deserialize)]
pub struct CreateCompanyInput {
    pub name: String,
    pub custom_path: Option<String>,
}

#[derive(Deserialize)]
pub struct FirstCompanyInput {
    pub name: String,
    pub country: String,
}

// ===================== COMMANDS =====================

/// Check if this is a fresh installation (no companies registered yet).
#[tauri::command]
pub async fn check_first_run(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<bool, String> {
    Ok(!registry.has_any_company().await)
}

/// Create the first company on a fresh installation:
/// 1. Creates the company DB and seeds it (default admin/admin + chart of accounts etc.)
/// 2. Updates company_profile with the given name and country
/// 3. Marks it as primary and activates it
#[tauri::command]
pub async fn create_first_company(
    registry: State<'_, Arc<DbRegistry>>,
    app_handle: tauri::AppHandle,
    input: FirstCompanyInput,
) -> Result<String, String> {
    if input.name.trim().is_empty() {
        return Err("Company name cannot be empty.".to_string());
    }

    // 1. Create company DB
    let company_id = registry
        .create_company(input.name.trim(), None, &app_handle)
        .await?;

    // 2. Activate it so pool is reachable
    registry
        .set_active_company(&company_id, &app_handle)
        .await?;

    // 3. Seed initial data (accounts, admin user, countries, units …)
    let pool = registry.active_pool().await?;
    crate::seeds::data::seed_initial_data(&pool)
        .await
        .map_err(|e| format!("Failed to seed initial data: {}", e))?;

    // 4. Update company_profile with the chosen name and country
    sqlx::query(
        "UPDATE company_profile SET company_name = ?, country = ? WHERE id = 1",
    )
    .bind(input.name.trim())
    .bind(input.country.trim())
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to update company profile: {}", e))?;

    // 5. Mark as primary
    registry.set_primary_company(&company_id).await?;

    Ok(company_id)
}

/// List all available companies (only those whose DB file exists on disk).
#[tauri::command]
pub async fn list_companies(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<CompanyListItem>, String> {
    registry.list_companies().await
}

/// Get the currently active company info (for the current app instance).
#[tauri::command]
pub async fn get_active_company(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Option<crate::company_db::CompanyInfo>, String> {
    registry.get_active_company_info().await
}

/// Switch to a specific company. Requires subsequent re-login on the frontend.
#[tauri::command]
pub async fn switch_company(
    registry: State<'_, Arc<DbRegistry>>,
    app_handle: tauri::AppHandle,
    company_id: String,
) -> Result<crate::company_db::CompanyInfo, String> {
    registry.set_active_company(&company_id, &app_handle).await
}

/// Create a new company with its own database.
#[tauri::command]
pub async fn create_company(
    registry: State<'_, Arc<DbRegistry>>,
    app_handle: tauri::AppHandle,
    input: CreateCompanyInput,
) -> Result<String, String> {
    if input.name.trim().is_empty() {
        return Err("Company name cannot be empty.".to_string());
    }
    registry
        .create_company(input.name.trim(), input.custom_path, &app_handle)
        .await
}


/// Rename an existing company.
#[tauri::command]
pub async fn rename_company(
    registry: State<'_, Arc<DbRegistry>>,
    company_id: String,
    new_name: String,
) -> Result<(), String> {
    if new_name.trim().is_empty() {
        return Err("Company name cannot be empty.".to_string());
    }
    registry.rename_company(&company_id, new_name.trim()).await
}

/// Soft-delete a company (level 1 — hidden but file kept).
#[tauri::command]
pub async fn soft_delete_company(
    registry: State<'_, Arc<DbRegistry>>,
    company_id: String,
) -> Result<(), String> {
    registry.soft_delete_company(&company_id).await
}

/// Hard-delete a company (level 2 — permanently deletes the DB file).
#[tauri::command]
pub async fn hard_delete_company(
    registry: State<'_, Arc<DbRegistry>>,
    company_id: String,
) -> Result<(), String> {
    registry.hard_delete_company(&company_id).await
}

/// Mark a company as the primary (auto-selected on login).
#[tauri::command]
pub async fn set_primary_company(
    registry: State<'_, Arc<DbRegistry>>,
    company_id: String,
) -> Result<(), String> {
    registry.set_primary_company(&company_id).await
}

/// Mark a company as the secondary (occasional switch target).
#[tauri::command]
pub async fn set_secondary_company(
    registry: State<'_, Arc<DbRegistry>>,
    company_id: String,
) -> Result<(), String> {
    registry.set_secondary_company(&company_id).await
}

/// Pick a .db backup file using native file browser (Windows PowerShell)
#[tauri::command]
pub async fn pick_database_file() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let script = r#"
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        $dialog.Filter = 'SQLite Database (*.db)|*.db|All Files (*.*)|*.*'
        $dialog.Title = 'Select Backup Database File'
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            Write-Output $dialog.FileName
        }
        "#;

        let output = Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .output()
            .map_err(|e| format!("Failed to open file dialog: {}", e))?;

        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                Ok(None)
            } else {
                Ok(Some(path))
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

/// Import / Register a .db backup file as a new company.
#[tauri::command]
pub async fn import_company_database(
    registry: State<'_, Arc<DbRegistry>>,
    app_handle: tauri::AppHandle,
    source_db_path: String,
    custom_name: Option<String>,
) -> Result<String, String> {
    use tauri::Manager;
    let source_path = std::path::PathBuf::from(&source_db_path);
    if !source_path.exists() {
        return Err(format!("Database file not found at: {}", source_db_path));
    }

    let company_name = match custom_name {
        Some(name) if !name.trim().is_empty() => name.trim().to_string(),
        _ => {
            let db_url = format!("sqlite:{}?mode=ro", source_db_path);
            if let Ok(pool) = sqlx::sqlite::SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&db_url)
                .await
            {
                let name_row: Option<(String,)> = sqlx::query_as(
                    "SELECT company_name FROM company_profile LIMIT 1",
                )
                .fetch_optional(&pool)
                .await
                .unwrap_or(None);
                pool.close().await;

                name_row
                    .map(|(n,)| n)
                    .filter(|n| !n.trim().is_empty())
                    .unwrap_or_else(|| {
                        source_path
                            .file_stem()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_else(|| "Restored Company".to_string())
                    })
            } else {
                "Restored Company".to_string()
            }
        }
    };

    let id = uuid::Uuid::now_v7().to_string();
    let slug = source_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "restored".to_string());

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let companies_dir = app_dir.join("companies");
    if !companies_dir.exists() {
        std::fs::create_dir_all(&companies_dir).map_err(|e| e.to_string())?;
    }

    let mut dest_path = companies_dir.join(format!("{}.db", slug));
    let mut counter = 1u32;
    while dest_path.exists() {
        dest_path = companies_dir.join(format!("{}_{}.db", slug, counter));
        counter += 1;
    }

    std::fs::copy(&source_path, &dest_path)
        .map_err(|e| format!("Failed to copy database file: {}", e))?;

    let dest_path_str = dest_path.to_string_lossy().to_string();

    // Register in master.db
    sqlx::query(
        "INSERT INTO companies (id, name, slug, db_path) VALUES (?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&company_name)
    .bind(&slug)
    .bind(&dest_path_str)
    .execute(&registry.master_pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(id)
}

/// Restore the active company by overwriting its database file with a backup .db snapshot file.
#[tauri::command]
pub async fn restore_active_company_from_backup(
    registry: State<'_, Arc<DbRegistry>>,
    app_handle: tauri::AppHandle,
    backup_file_path: String,
) -> Result<(), String> {
    let source_path = std::path::PathBuf::from(&backup_file_path);
    if !source_path.exists() {
        return Err(format!("Backup file not found at: {}", backup_file_path));
    }

    let active_info = registry
        .get_active_company_info()
        .await?
        .ok_or_else(|| "No active company selected.".to_string())?;

    let dest_path_str = active_info.db_path.clone();
    let dest_path = std::path::PathBuf::from(&dest_path_str);

    // 1. Close active company connection pool to release file handles
    registry.close_company_pool(&active_info.id).await;

    // 2. Remove lingering WAL (-wal) and SHM (-shm) files
    let wal_path = format!("{}-wal", dest_path_str);
    let shm_path = format!("{}-shm", dest_path_str);
    let _ = std::fs::remove_file(&wal_path);
    let _ = std::fs::remove_file(&shm_path);

    // 3. Overwrite database file with backup snapshot
    std::fs::copy(&source_path, &dest_path)
        .map_err(|e| format!("Failed to restore database file: {}", e))?;

    // 4. Re-open connection pool and re-activate company
    registry
        .set_active_company(&active_info.id, &app_handle)
        .await?;

    Ok(())
}

// ===================== SYNC =====================

#[derive(Serialize)]
pub struct SyncResult {
    pub units: u64,
    pub groups: u64,
    pub customers: u64,
    pub suppliers: u64,
    pub employees: u64,
    pub ledgers: u64,
    pub products: u64,
    pub unit_conversions: u64,
}

/// Sync master data from the secondary company DB into the primary company DB.
/// Copies records that exist in secondary but not in primary (matched by code).
/// Scope: customers, suppliers, employees, chart_of_accounts ledgers, and
/// products that have a GST slab assigned.
#[tauri::command]
pub async fn sync_secondary_to_primary(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<SyncResult, String> {
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    // ── 1. Resolve primary & secondary paths ─────────────────────────────────
    let (primary_path, secondary_path) = {
        let master = &registry.master_pool;

        let primary: Option<(String,)> = sqlx::query_as(
            "SELECT db_path FROM companies WHERE is_primary = 1 AND is_deleted = 0 LIMIT 1",
        )
        .fetch_optional(master)
        .await
        .map_err(|e| e.to_string())?;

        let secondary: Option<(String,)> = sqlx::query_as(
            "SELECT db_path FROM companies WHERE is_secondary = 1 AND is_deleted = 0 LIMIT 1",
        )
        .fetch_optional(master)
        .await
        .map_err(|e| e.to_string())?;

        match (primary, secondary) {
            (Some(p), Some(s)) => (p.0, s.0),
            (None, _) => return Err("No primary company is set.".to_string()),
            (_, None) => return Err("No secondary company is set.".to_string()),
        }
    };

    // ── 2. Init secondary schema so all columns (incl. gst_slab_id) exist ────
    {
        let sec_url = format!("sqlite:{}?mode=rwc", secondary_path);
        let sec_opts = SqliteConnectOptions::from_str(&sec_url)
            .map_err(|e| format!("Bad secondary path: {}", e))?;
        let sec_pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(sec_opts)
            .await
            .map_err(|e| format!("Failed to open secondary DB: {}", e))?;
        crate::db::init_schema(&sec_pool)
            .await
            .map_err(|e| format!("Secondary schema init failed: {}", e))?;
        sec_pool.close().await;
    }

    // ── 3. Open primary DB and ATTACH secondary ───────────────────────────────
    let pri_url = format!("sqlite:{}?mode=rwc", primary_path);
    let pri_opts =
        SqliteConnectOptions::from_str(&pri_url).map_err(|e| format!("Bad primary path: {}", e))?;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(pri_opts)
        .await
        .map_err(|e| format!("Failed to open primary DB: {}", e))?;

    // Escape backslashes for SQLite ATTACH on Windows
    let sec_path_escaped = secondary_path.replace('\'', "''");
    sqlx::query(&format!("ATTACH DATABASE '{}' AS sec", sec_path_escaped))
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to attach secondary DB: {}", e))?;

    // Disable FK enforcement — safety net for same-name-different-ID edge cases
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&pool)
        .await
        .map_err(|e| format!("Could not disable FK checks: {}", e))?;

    // ── 4. UNITS ──────────────────────────────────────────────────────────────
    // Copy by secondary ID so products' unit_id FK references resolve correctly.
    let units = sqlx::query(
        "INSERT OR IGNORE INTO units (id, name, symbol, is_default, created_at, updated_at)
         SELECT s.id, s.name, s.symbol, 0, s.created_at, s.updated_at
         FROM sec.units s
         WHERE s.id NOT IN (SELECT id FROM units)",
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Unit sync failed: {}", e))?
    .rows_affected();

    // ── 5. PRODUCT GROUPS ─────────────────────────────────────────────────────
    // Copy by secondary ID so products' group_id FK references resolve correctly.
    let groups = sqlx::query(
        "INSERT OR IGNORE INTO product_groups (id, name, description, is_active, created_at, updated_at)
         SELECT s.id, s.name, s.description, s.is_active, s.created_at, s.updated_at
         FROM sec.product_groups s
         WHERE s.id NOT IN (SELECT id FROM product_groups)
           AND s.deleted_at IS NULL",
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Product group sync failed: {}", e))?
    .rows_affected();

    // ── 6. CUSTOMERS ──────────────────────────────────────────────────────────
    let customers = sqlx::query(
        "INSERT OR IGNORE INTO customers
            (id, code, name, email, phone,
             address_line_1, address_line_2, address_line_3,
             city, state, postal_code, country, gstin,
             is_active, created_at, updated_at)
         SELECT s.id, s.code, s.name, s.email, s.phone,
                s.address_line_1, s.address_line_2, s.address_line_3,
                s.city, s.state, s.postal_code, s.country, s.gstin,
                s.is_active, s.created_at, s.updated_at
         FROM sec.customers s
         WHERE s.code IS NOT NULL
           AND s.deleted_at IS NULL
           AND s.code NOT IN (SELECT code FROM customers WHERE code IS NOT NULL)",
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Customer sync failed: {}", e))?
    .rows_affected();

    // ── 7. SUPPLIERS ──────────────────────────────────────────────────────────
    let suppliers = sqlx::query(
        "INSERT OR IGNORE INTO suppliers
            (id, code, name, email, phone,
             address_line_1, address_line_2, address_line_3,
             city, state, postal_code, country, gstin,
             is_active, created_at, updated_at)
         SELECT s.id, s.code, s.name, s.email, s.phone,
                s.address_line_1, s.address_line_2, s.address_line_3,
                s.city, s.state, s.postal_code, s.country, s.gstin,
                s.is_active, s.created_at, s.updated_at
         FROM sec.suppliers s
         WHERE s.code IS NOT NULL
           AND s.deleted_at IS NULL
           AND s.code NOT IN (SELECT code FROM suppliers WHERE code IS NOT NULL)",
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Supplier sync failed: {}", e))?
    .rows_affected();

    // ── 8. EMPLOYEES ──────────────────────────────────────────────────────────
    let employees = sqlx::query(
        "INSERT OR IGNORE INTO employees
            (id, code, name, designation, phone, email, address, joining_date, status, created_at, updated_at)
         SELECT s.id, s.code, s.name, s.designation, s.phone, s.email, s.address,
                s.joining_date, s.status, s.created_at, s.updated_at
         FROM sec.employees s
         WHERE s.code IS NOT NULL
           AND s.deleted_at IS NULL
           AND s.code NOT IN (SELECT code FROM employees WHERE code IS NOT NULL)",
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Employee sync failed: {}", e))?
    .rows_affected();

    // ── 9. CHART OF ACCOUNTS (non-system ledgers) ─────────────────────────────
    let ledgers = sqlx::query(
        "INSERT OR IGNORE INTO chart_of_accounts
            (id, account_code, account_name, account_type, account_group, description,
             opening_balance, opening_balance_type, gstin,
             address_line_1, address_line_2, city, state, postal_code,
             party_id, party_type,
             is_active, is_system, created_at, updated_at)
         SELECT s.id, s.account_code, s.account_name, s.account_type, s.account_group,
                s.description, s.opening_balance, s.opening_balance_type, s.gstin,
                s.address_line_1, s.address_line_2, s.city, s.state, s.postal_code,
                s.party_id, s.party_type,
                s.is_active, s.is_system, s.created_at, s.updated_at
         FROM sec.chart_of_accounts s
         WHERE s.is_system = 0
           AND s.deleted_at IS NULL
           AND s.account_code NOT IN (SELECT account_code FROM chart_of_accounts)",
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Ledger sync failed: {}", e))?
    .rows_affected();

    // ── 10. PRODUCTS with GST slab ────────────────────────────────────────────
    // Resolve unit_id and group_id by NAME so they always point to the correct
    // primary record — even when primary has the same unit/group with a different UUID.
    let products = sqlx::query(
        "INSERT OR IGNORE INTO products
            (id, code, name, group_id, unit_id, purchase_rate, sales_rate, mrp,
             barcode, gst_slab_id, is_active, created_at, updated_at)
         SELECT
             s.id, s.code, s.name,
             -- resolve group: prefer primary's ID matched by name, else secondary's ID
             COALESCE(
                 (SELECT p_pg.id FROM product_groups p_pg
                  JOIN sec.product_groups s_pg ON s_pg.id = s.group_id
                  WHERE p_pg.name = s_pg.name LIMIT 1),
                 s.group_id
             ),
             -- resolve unit: prefer primary's ID matched by name, else secondary's ID
             COALESCE(
                 (SELECT p_u.id FROM units p_u
                  JOIN sec.units s_u ON s_u.id = s.unit_id
                  WHERE p_u.name = s_u.name LIMIT 1),
                 s.unit_id
             ),
             s.purchase_rate, s.sales_rate, s.mrp, s.barcode,
             s.gst_slab_id, s.is_active, s.created_at, s.updated_at
         FROM sec.products s
         WHERE s.gst_slab_id IS NOT NULL
           AND s.gst_slab_id != 'gst_0'
           AND s.deleted_at IS NULL
           AND s.code NOT IN (SELECT code FROM products WHERE code IS NOT NULL)",
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Product sync failed: {}", e))?
    .rows_affected();

    // ── 11. PRODUCT UNIT CONVERSIONS ──────────────────────────────────────────
    // Match by secondary ID and ensure unit_id references are resolved to primary IDs by name.
    let unit_conversions = sqlx::query(
        "INSERT OR IGNORE INTO product_unit_conversions
            (id, product_id, unit_id, factor_to_base, purchase_rate, sales_rate,
             is_default_sale, is_default_purchase, is_default_report, created_at, updated_at)
         SELECT
             s.id, s.product_id,
             -- resolve unit: prefer primary's ID matched by name, else secondary's ID
             COALESCE(
                 (SELECT p_u.id FROM units p_u
                  JOIN sec.units s_u ON s_u.id = s.unit_id
                  WHERE p_u.name = s_u.name LIMIT 1),
                 s.unit_id
             ),
             s.factor_to_base, s.purchase_rate, s.sales_rate,
             s.is_default_sale, s.is_default_purchase, s.is_default_report,
             s.created_at, s.updated_at
         FROM sec.product_unit_conversions s
         WHERE s.product_id IN (SELECT id FROM products)
           AND s.id NOT IN (SELECT id FROM product_unit_conversions)",
    )
    .execute(&pool)
    .await
    .map_err(|e| format!("Product unit conversion sync failed: {}", e))?
    .rows_affected();

    // ── 9. Re-enable FK checks & detach ──────────────────────────────────────
    let _ = sqlx::query("PRAGMA foreign_keys = ON").execute(&pool).await;
    let _ = sqlx::query("DETACH DATABASE sec").execute(&pool).await;
    pool.close().await;

    Ok(SyncResult {
        units,
        groups,
        customers,
        suppliers,
        employees,
        ledgers,
        products,
        unit_conversions,
    })
}
