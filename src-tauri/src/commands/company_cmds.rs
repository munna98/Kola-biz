use crate::company_db::{DbRegistry, CompanyListItem};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

// ===================== TYPES =====================

#[derive(Deserialize)]
pub struct CreateCompanyInput {
    pub name: String,
    pub custom_path: Option<String>,
}

// ===================== COMMANDS =====================

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
    let pri_opts = SqliteConnectOptions::from_str(&pri_url)
        .map_err(|e| format!("Bad primary path: {}", e))?;
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
             is_active, is_system, created_at, updated_at)
         SELECT s.id, s.account_code, s.account_name, s.account_type, s.account_group,
                s.description, s.opening_balance, s.opening_balance_type, s.gstin,
                s.address_line_1, s.address_line_2, s.city, s.state, s.postal_code,
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
