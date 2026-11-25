use libsql::Builder;
use serde::Serialize;
use sqlx::SqlitePool;
use sqlx::{Row, ValueRef};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, OnceLock, RwLock};
use tokio::time::{sleep, timeout, Duration};

use crate::company_db::DbRegistry;
use crate::voucher_seq::{format_voucher_no, target_table_and_col, VoucherSeqRow};

#[derive(Debug, Clone)]
pub struct ActiveCloudConfig {
    pub company_id: String,
    pub url: String,
    pub token: String,
}

static ACTIVE_CLOUD_CONFIG: OnceLock<RwLock<Option<ActiveCloudConfig>>> = OnceLock::new();
static SYNC_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

fn sync_mutex() -> &'static tokio::sync::Mutex<()> {
    SYNC_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

pub fn set_active_cloud_config(config: Option<ActiveCloudConfig>) {
    let lock = ACTIVE_CLOUD_CONFIG.get_or_init(|| RwLock::new(None));
    if let Ok(mut guard) = lock.write() {
        *guard = config;
    }
}

pub fn get_active_cloud_config() -> Option<ActiveCloudConfig> {
    let lock = ACTIVE_CLOUD_CONFIG.get_or_init(|| RwLock::new(None));
    lock.read().ok().and_then(|g| g.clone())
}

fn val_to_string(v: Result<libsql::Value, libsql::Error>) -> String {
    match v {
        Ok(libsql::Value::Text(s)) => s,
        Ok(libsql::Value::Integer(n)) => n.to_string(),
        Ok(libsql::Value::Real(f)) => f.to_string(),
        _ => String::new(),
    }
}

fn val_to_i64(v: Result<libsql::Value, libsql::Error>) -> i64 {
    match v {
        Ok(libsql::Value::Integer(n)) => n,
        Ok(libsql::Value::Text(s)) => s.parse::<i64>().unwrap_or(0),
        Ok(libsql::Value::Real(f)) => f as i64,
        _ => 0,
    }
}

async fn connect_remote(url: &str, token: &str) -> Result<libsql::Connection, String> {
    let clean_url = url.trim();
    let clean_token = token.trim();
    if clean_url.is_empty() || clean_token.is_empty() {
        return Err("Database URL and Auth Token are required.".to_string());
    }
    let db = Builder::new_remote(clean_url.to_string(), clean_token.to_string())
        .build()
        .await
        .map_err(|e| format!("Failed to initialize cloud client: {}", e))?;
    db.connect().map_err(|e| format!("Connection error: {}", e))
}

/// Atomically allocate the next sequential number on Turso for a given voucher_type.
pub async fn reserve_next_cloud_number_conn(
    conn: &libsql::Connection,
    seed: &VoucherSeqRow,
    voucher_type: &str,
) -> Result<(i64, String), String> {
    // Ensure the sequence row exists on Turso before updating
    conn.execute(
        "INSERT OR IGNORE INTO voucher_sequences
         (id, voucher_type, prefix, suffix, separator, next_number, padding, include_financial_year, reset_yearly)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            libsql::Value::Text(seed.id.clone()),
            libsql::Value::Text(voucher_type.to_string()),
            libsql::Value::Text(seed.prefix.clone()),
            libsql::Value::Text(seed.suffix.clone()),
            libsql::Value::Text(seed.separator.clone()),
            libsql::Value::Integer(seed.next_number),
            libsql::Value::Integer(seed.padding),
            libsql::Value::Integer(if seed.include_financial_year { 1 } else { 0 }),
            libsql::Value::Integer(if seed.reset_yearly { 1 } else { 0 }),
        ],
    )
    .await
    .map_err(|e| format!("Failed to ensure cloud sequence row: {}", e))?;

    let (table, col) = target_table_and_col(voucher_type);

    for _ in 0..500 {
        let mut rows = conn
            .query(
                "UPDATE voucher_sequences
                 SET next_number = next_number + 1
                 WHERE voucher_type = ?
                 RETURNING prefix, COALESCE(suffix, ''), COALESCE(separator, '-'),
                           next_number - 1, padding, COALESCE(include_financial_year, 0)",
                vec![libsql::Value::Text(voucher_type.to_string())],
            )
            .await
            .map_err(|e| format!("Failed to increment cloud sequence: {}", e))?;

        let row = rows
            .next()
            .await
            .map_err(|e| format!("Failed to read cloud sequence response: {}", e))?
            .ok_or_else(|| format!("Cloud voucher sequence missing for '{}'", voucher_type))?;

        let prefix = val_to_string(row.get_value(0));
        let suffix = val_to_string(row.get_value(1));
        let separator = {
            let s = val_to_string(row.get_value(2));
            if s.is_empty() { "-".to_string() } else { s }
        };
        let allocated_num = val_to_i64(row.get_value(3));
        let padding = val_to_i64(row.get_value(4));
        let include_fy = val_to_i64(row.get_value(5)) != 0;

        let candidate = format_voucher_no(
            &prefix,
            &suffix,
            &separator,
            padding,
            include_fy,
            allocated_num,
            None,
        );

        let check_sql = format!("SELECT EXISTS(SELECT 1 FROM {} WHERE {} = ?)", table, col);
        let exists_remote = match conn
            .query(&check_sql, vec![libsql::Value::Text(candidate.clone())])
            .await
        {
            Ok(mut check_rows) => match check_rows.next().await {
                Ok(Some(r)) => val_to_i64(r.get_value(0)) != 0,
                _ => false,
            },
            // Target table might not exist on Turso yet (e.g., custom_orders); treat as free
            Err(_) => false,
        };

        if !exists_remote {
            return Ok((allocated_num, candidate));
        }
    }

    Err(format!(
        "Exhausted cloud sequence retries finding unused number for '{}'",
        voucher_type
    ))
}

/// Fast timeout-bounded atomic reservation on Turso for interactive voucher saving.
pub async fn reserve_next_cloud_number(
    url: &str,
    token: &str,
    seed: &VoucherSeqRow,
    voucher_type: &str,
) -> Result<(i64, String), String> {
    timeout(Duration::from_secs(3), async {
        let conn = connect_remote(url, token).await?;
        reserve_next_cloud_number_conn(&conn, seed, voucher_type).await
    })
    .await
    .map_err(|_| "Cloud sequence request timed out".to_string())?
}

/// Non-mutating peek at the next cloud voucher number for preview badges.
pub async fn peek_next_cloud_number(
    url: &str,
    token: &str,
    voucher_type: &str,
) -> Result<Option<String>, String> {
    timeout(Duration::from_millis(1500), async {
        let conn = connect_remote(url, token).await?;
        let mut rows = conn
            .query(
                "SELECT prefix, COALESCE(suffix, ''), COALESCE(separator, '-'),
                        next_number, padding, COALESCE(include_financial_year, 0)
                 FROM voucher_sequences WHERE voucher_type = ?",
                vec![libsql::Value::Text(voucher_type.to_string())],
            )
            .await
            .map_err(|e| format!("Cloud peek failed: {}", e))?;

        let Some(row) = rows
            .next()
            .await
            .map_err(|e| format!("Cloud peek read failed: {}", e))?
        else {
            return Ok(None);
        };

        let prefix = val_to_string(row.get_value(0));
        let suffix = val_to_string(row.get_value(1));
        let separator = {
            let s = val_to_string(row.get_value(2));
            if s.is_empty() { "-".to_string() } else { s }
        };
        let mut next_num = val_to_i64(row.get_value(3));
        let padding = val_to_i64(row.get_value(4));
        let include_fy = val_to_i64(row.get_value(5)) != 0;

        let (table, col) = target_table_and_col(voucher_type);
        let check_sql = format!("SELECT EXISTS(SELECT 1 FROM {} WHERE {} = ?)", table, col);
        for _ in 0..20 {
            let candidate = format_voucher_no(
                &prefix,
                &suffix,
                &separator,
                padding,
                include_fy,
                next_num,
                None,
            );
            let exists_remote = match conn
                .query(&check_sql, vec![libsql::Value::Text(candidate.clone())])
                .await
            {
                Ok(mut r_rows) => match r_rows.next().await {
                    Ok(Some(r)) => val_to_i64(r.get_value(0)) != 0,
                    _ => false,
                },
                Err(_) => false,
            };
            if !exists_remote {
                return Ok(Some(candidate));
            }
            next_num += 1;
        }

        Ok(Some(format_voucher_no(
            &prefix,
            &suffix,
            &separator,
            padding,
            include_fy,
            next_num,
            None,
        )))
    })
    .await
    .map_err(|_| "Cloud sequence peek timed out".to_string())?
}

/// Push updated voucher sequence formatting/counter settings to Turso when in Cloud Online mode.
pub async fn push_voucher_sequence_update(pool: &SqlitePool, id: &str) {
    let Some(cfg) = get_active_cloud_config() else {
        return;
    };
    let row = sqlx::query(
        "SELECT id, voucher_type, prefix, COALESCE(suffix, '') as suffix, COALESCE(separator, '-') as separator,
                next_number, padding, COALESCE(include_financial_year, 0) as include_financial_year,
                COALESCE(reset_yearly, 0) as reset_yearly
         FROM voucher_sequences WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let Some(r) = row else { return };
    let seq_id: String = r.get("id");
    let vtype: String = r.get("voucher_type");
    let prefix: String = r.get("prefix");
    let suffix: String = r.get("suffix");
    let separator: String = r.get("separator");
    let next_number: i64 = r.get("next_number");
    let padding: i64 = r.get("padding");
    let include_fy: i64 = r.get("include_financial_year");
    let reset_yearly: i64 = r.get("reset_yearly");

    let _ = timeout(Duration::from_secs(3), async {
        if let Ok(conn) = connect_remote(&cfg.url, &cfg.token).await {
            let _ = conn
                .execute(
                    "INSERT INTO voucher_sequences
                     (id, voucher_type, prefix, suffix, separator, next_number, padding, include_financial_year, reset_yearly)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(voucher_type) DO UPDATE SET
                       prefix = excluded.prefix,
                       suffix = excluded.suffix,
                       separator = excluded.separator,
                       next_number = excluded.next_number,
                       padding = excluded.padding,
                       include_financial_year = excluded.include_financial_year,
                       reset_yearly = excluded.reset_yearly",
                    vec![
                        libsql::Value::Text(seq_id),
                        libsql::Value::Text(vtype),
                        libsql::Value::Text(prefix),
                        libsql::Value::Text(suffix),
                        libsql::Value::Text(separator),
                        libsql::Value::Integer(next_number),
                        libsql::Value::Integer(padding),
                        libsql::Value::Integer(include_fy),
                        libsql::Value::Integer(reset_yearly),
                    ],
                )
                .await;
        }
    })
    .await;
}

#[derive(Debug, Serialize)]
pub struct SyncReport {
    pub success: bool,
    pub pushed_count: usize,
    pub pulled_count: usize,
    pub message: String,
    pub timestamp: String,
    #[serde(skip)]
    pub remote_seq: i64,
}

fn table_pk_col(table: &str) -> &'static str {
    match table {
        "voucher_settings" => "voucher_type",
        "user_permissions" => "user_id",
        _ => "id",
    }
}

/// Returns `true` for parent tables that own child rows with `ON DELETE CASCADE`.
/// We must NEVER run `INSERT OR REPLACE` on these tables because SQLite implements
/// `REPLACE` as `DELETE` + `INSERT`, which cascade-wipes child rows whenever
/// `PRAGMA foreign_keys = ON` is active on a connection.
fn has_cascade_children(table: &str) -> bool {
    matches!(
        table,
        "vouchers"
            | "products"
            | "users"
            | "price_categories"
            | "custom_orders"
            | "service_orders"
    )
}

/// Builds an in-place UPSERT statement (`INSERT ... ON CONFLICT(pk) DO UPDATE SET ...`)
/// so updating existing records never deletes parent rows or fires `ON DELETE CASCADE`.
fn build_upsert_sql(table: &str, col_names: &[String], pk_col: &str) -> String {
    let cols_joined = col_names.join(", ");
    let placeholders = vec!["?"; col_names.len()].join(", ");
    if col_names.iter().any(|c| c == pk_col) {
        let update_cols: Vec<String> = col_names
            .iter()
            .filter(|c| c.as_str() != pk_col)
            .map(|c| format!("{} = excluded.{}", c, c))
            .collect();
        if update_cols.is_empty() {
            format!(
                "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT({}) DO NOTHING",
                table, cols_joined, placeholders, pk_col
            )
        } else {
            format!(
                "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT({}) DO UPDATE SET {}",
                table,
                cols_joined,
                placeholders,
                pk_col,
                update_cols.join(", ")
            )
        }
    } else {
        format!(
            "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
            table, cols_joined, placeholders
        )
    }
}

fn libsql_val_as_pk(val: &libsql::Value) -> Option<String> {
    match val {
        libsql::Value::Text(s) if !s.is_empty() => Some(s.clone()),
        libsql::Value::Integer(n) => Some(n.to_string()),
        _ => None,
    }
}

fn quote_sql_list(items: &[String]) -> String {
    items
        .iter()
        .map(|s| format!("'{}'", s.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(", ")
}

pub const SYNC_TABLES: &[&str] = &[
    "company_profile",
    "users",
    "user_roles",
    "user_permissions",
    "countries",
    "currencies",
    "units",
    "price_categories",
    "product_price_list",
    "gst_tax_slabs",
    "product_groups",
    "product_brands",
    "product_colors",
    "products",
    "product_images",
    "services",
    "account_groups",
    "chart_of_accounts",
    "customers",
    "suppliers",
    "routes",
    "opening_balances",
    "vouchers",
    "voucher_items",
    "product_unit_conversions",
    "journal_entries",
    "stock_movements",
    "payment_allocations",
    "voucher_sequences",
    "voucher_settings",
    "app_settings",
    "invoice_templates",
    "employees",
    "custom_orders",
    "custom_order_materials",
    "custom_order_purchases",
    "custom_order_services",
    "service_orders",
    "service_order_parts",
    "service_order_labour",
    "service_order_status_log",
];

/// Test connection to a remote Turso/libSQL database.
pub async fn test_cloud_connection(url: &str, token: &str) -> Result<String, String> {
    let clean_url = url.trim();
    let clean_token = token.trim();

    if clean_url.is_empty() || clean_token.is_empty() {
        return Err("Database URL and Auth Token are required.".to_string());
    }

    let db = Builder::new_remote(clean_url.to_string(), clean_token.to_string())
        .build()
        .await
        .map_err(|e| format!("Failed to initialize cloud client: {}", e))?;

    let conn = db.connect().map_err(|e| format!("Connection error: {}", e))?;

    let mut rows = conn
        .query("SELECT 1", ())
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    if rows.next().await.map_err(|e| format!("Row read error: {}", e))?.is_some() {
        Ok("Connected to Turso Cloud database successfully!".to_string())
    } else {
        Err("No response received from remote database.".to_string())
    }
}

/// Initialize the cloud database schema so that all tables exist in Turso Cloud.
pub async fn bootstrap_cloud_schema(url: &str, token: &str) -> Result<String, String> {
    let clean_url = url.trim();
    let clean_token = token.trim();

    let db = Builder::new_remote(clean_url.to_string(), clean_token.to_string())
        .build()
        .await
        .map_err(|e| format!("Failed to connect to cloud database: {}", e))?;

    let conn = db.connect().map_err(|e| format!("Connection error: {}", e))?;

    let schema_statements: &[&str] = &[
        r#"CREATE TABLE IF NOT EXISTS company_profile (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            business_type TEXT,
            address_line1 TEXT,
            address_line2 TEXT,
            address_line3 TEXT,
            city TEXT,
            state TEXT,
            pincode TEXT,
            country TEXT,
            phone TEXT,
            email TEXT,
            website TEXT,
            gstin TEXT,
            pan TEXT,
            cin TEXT,
            logo_data TEXT,
            bank_name TEXT,
            bank_account_no TEXT,
            bank_ifsc TEXT,
            bank_branch TEXT,
            terms_and_conditions TEXT,
            base_currency TEXT DEFAULT 'INR',
            currency_display TEXT DEFAULT 'symbol',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        , lut_no TEXT)"#,
        r#"CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            role TEXT DEFAULT 'user',
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )"#,
        r#"CREATE TABLE IF NOT EXISTS countries (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            code TEXT UNIQUE NOT NULL
        )"#,
        r#"CREATE TABLE IF NOT EXISTS currencies (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            symbol TEXT,
            country TEXT
        )"#,
        r#"CREATE TABLE IF NOT EXISTS units (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            symbol TEXT NOT NULL,
            is_default INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"#,
        r#"CREATE TABLE IF NOT EXISTS price_categories (
            id          TEXT PRIMARY KEY,
            name        TEXT UNIQUE NOT NULL,
            description TEXT,
            is_default  INTEGER DEFAULT 0,
            is_active   INTEGER DEFAULT 1,
            sort_order  INTEGER DEFAULT 0,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )"#,
        r#"CREATE TABLE IF NOT EXISTS product_price_list (
            id                TEXT PRIMARY KEY,
            price_category_id TEXT NOT NULL,
            product_id        TEXT NOT NULL,
            unit_id           TEXT NOT NULL,
            sales_rate        REAL NOT NULL DEFAULT 0,
            is_active         INTEGER DEFAULT 1,
            updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (price_category_id, product_id, unit_id),
            FOREIGN KEY (price_category_id) REFERENCES price_categories(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (unit_id) REFERENCES units(id)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS gst_tax_slabs (
            id            TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            is_dynamic    INTEGER DEFAULT 0,
            fixed_rate    REAL DEFAULT 0,
            threshold     REAL DEFAULT 0,
            below_rate    REAL DEFAULT 0,
            above_rate    REAL DEFAULT 0,
            is_active     INTEGER DEFAULT 1,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        )"#,
        r#"CREATE TABLE IF NOT EXISTS product_groups (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )"#,
        r#"CREATE TABLE IF NOT EXISTS product_brands (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )"#,
        r#"CREATE TABLE IF NOT EXISTS product_colors (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            hex_code TEXT,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )"#,
        r#"CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            group_id TEXT,
            unit_id TEXT NOT NULL,
            purchase_rate REAL NOT NULL,
            sales_rate REAL NOT NULL,
            mrp REAL NOT NULL,
            barcode TEXT,
            brand_id TEXT REFERENCES product_brands(id),
            part_number TEXT,
            supplier_id TEXT REFERENCES chart_of_accounts(id),
            is_master INTEGER NOT NULL DEFAULT 0,
            parent_product_id TEXT REFERENCES products(id),
            vehicle_make TEXT,
            vehicle_odometer REAL,
            vehicle_fuel_type TEXT,
            vehicle_transmission TEXT,
            vehicle_owner TEXT,
            vehicle_color TEXT,
            vehicle_manufacturer TEXT,
            vehicle_model TEXT,
            vehicle_year INTEGER,
            cost REAL,
            is_margin_scheme_default INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            deleted_at DATETIME,
            deleted_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, hsn_sac_code TEXT, gst_slab_id TEXT REFERENCES gst_tax_slabs(id), purchase_deduction REAL DEFAULT 0, sales_deduction REAL DEFAULT 0, color_id TEXT REFERENCES product_colors(id), serial_number TEXT, imei TEXT, warranty_months INTEGER, battery_health TEXT,
            FOREIGN KEY (group_id) REFERENCES product_groups(id),
            FOREIGN KEY (unit_id) REFERENCES units(id)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS services (
            id            TEXT PRIMARY KEY,
            code          TEXT UNIQUE NOT NULL,
            name          TEXT NOT NULL,
            description   TEXT,
            unit_id       TEXT,
            hsn_sac_code  TEXT,
            gst_slab_id   TEXT,
            sales_rate    REAL DEFAULT 0,
            purchase_rate REAL DEFAULT 0,
            is_active     INTEGER DEFAULT 1,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at    DATETIME,
            FOREIGN KEY (unit_id) REFERENCES units(id)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS account_groups (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            account_type TEXT NOT NULL,
            parent_group_id TEXT REFERENCES account_groups(id),
            is_system INTEGER DEFAULT 0,
            base_type TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"#,
        r#"CREATE TABLE IF NOT EXISTS chart_of_accounts (
            id TEXT PRIMARY KEY,
            account_code TEXT UNIQUE NOT NULL,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            account_group TEXT NOT NULL,
            description TEXT,
            opening_balance REAL DEFAULT 0.0,
            opening_balance_type TEXT DEFAULT 'Dr',
            party_id TEXT,
            party_type TEXT,
            gstin TEXT,
            address_line_1 TEXT,
            address_line_2 TEXT,
            state TEXT,
            city TEXT,
            postal_code TEXT,
            price_category_id TEXT REFERENCES price_categories(id),
            is_active INTEGER DEFAULT 1,
            is_system INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        , phone TEXT, country TEXT)"#,
        r#"CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            code TEXT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME,
            currency TEXT
        , gstin TEXT, address_line_1 TEXT, address_line_2 TEXT, address_line_3 TEXT, state TEXT, city TEXT, postal_code TEXT, country TEXT, route_id TEXT REFERENCES routes(id))"#,
        r#"CREATE TABLE IF NOT EXISTS suppliers (
            id TEXT PRIMARY KEY,
            code TEXT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME,
            currency TEXT
        , gstin TEXT, address_line_1 TEXT, address_line_2 TEXT, address_line_3 TEXT, state TEXT, city TEXT, postal_code TEXT, country TEXT, route_id TEXT REFERENCES routes(id))"#,
        r#"CREATE TABLE IF NOT EXISTS routes (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL UNIQUE,
            description TEXT,
            is_active   INTEGER DEFAULT 1,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )"#,
        r#"CREATE TABLE IF NOT EXISTS vouchers (
            id TEXT PRIMARY KEY,
            voucher_no TEXT UNIQUE NOT NULL,
            voucher_type TEXT NOT NULL,
            voucher_date DATE NOT NULL,
            reference TEXT,
            party_id TEXT,
            party_type TEXT,
            salesperson_id TEXT,
            account_id TEXT,
            subtotal REAL DEFAULT 0,
            discount_rate REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            tax_amount REAL DEFAULT 0,
            total_amount REAL DEFAULT 0,
            cgst_amount REAL DEFAULT 0,
            sgst_amount REAL DEFAULT 0,
            igst_amount REAL DEFAULT 0,
            grand_total REAL DEFAULT 0,
            tax_inclusive INTEGER NOT NULL DEFAULT 0,
            gst_disabled INTEGER DEFAULT 0,
            narration TEXT,
            status TEXT DEFAULT 'posted',
            payment_status TEXT DEFAULT 'unpaid',
            created_from_invoice_id TEXT,
            linked_return_id TEXT,
            irn TEXT,
            ack_no TEXT,
            ack_date DATE,
            is_margin_scheme_invoice INTEGER DEFAULT 0,
            currency_id TEXT REFERENCES currencies(id),
            exchange_rate REAL DEFAULT 1.0,
            foreign_total REAL DEFAULT 0,
            price_category_id TEXT REFERENCES price_categories(id),
            metadata TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        , freight_charge REAL DEFAULT 0.0, round_off REAL DEFAULT 0.0)"#,
        r#"CREATE TABLE IF NOT EXISTS voucher_items (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            product_id TEXT,
            service_id TEXT,
            ledger_id TEXT,
            item_type TEXT DEFAULT 'product',
            description TEXT,
            initial_quantity REAL NOT NULL,
            count INTEGER NOT NULL,
            deduction_per_unit REAL DEFAULT 0,
            final_quantity REAL,
            unit_id TEXT,
            base_quantity REAL,
            rate REAL NOT NULL,
            amount REAL NOT NULL,
            net_amount REAL DEFAULT 0,
            original_amount REAL DEFAULT 0,
            discount_percent REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            invoice_discount_amount REAL DEFAULT 0,
            tax_rate REAL DEFAULT 0,
            tax_amount REAL DEFAULT 0,
            cgst_rate REAL DEFAULT 0,
            sgst_rate REAL DEFAULT 0,
            igst_rate REAL DEFAULT 0,
            cgst_amount REAL DEFAULT 0,
            sgst_amount REAL DEFAULT 0,
            igst_amount REAL DEFAULT 0,
            hsn_sac_code TEXT,
            gst_slab_id TEXT,
            resolved_gst_rate REAL DEFAULT 0,
            is_margin_scheme INTEGER DEFAULT 0,
            purchase_cost REAL DEFAULT 0,
            margin_amount REAL DEFAULT 0,
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (service_id) REFERENCES services(id)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS product_unit_conversions (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            unit_id TEXT NOT NULL,
            factor_to_base REAL NOT NULL,
            purchase_rate REAL NOT NULL DEFAULT 0,
            sales_rate REAL NOT NULL DEFAULT 0,
            is_default_sale INTEGER DEFAULT 0,
            is_default_purchase INTEGER DEFAULT 0,
            is_default_report INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(product_id, unit_id),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (unit_id) REFERENCES units(id)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS journal_entries (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            debit REAL DEFAULT 0,
            credit REAL DEFAULT 0,
            foreign_debit REAL DEFAULT 0,
            foreign_credit REAL DEFAULT 0,
            currency_id TEXT,
            exchange_rate REAL DEFAULT 1.0,
            is_manual INTEGER DEFAULT 0,
            narration TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS stock_movements (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            movement_type TEXT NOT NULL,
            quantity REAL NOT NULL,
            count INTEGER DEFAULT 0,
            rate REAL NOT NULL,
            amount REAL NOT NULL,
            cost_rate REAL DEFAULT 0,
            cost_amount REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS payment_allocations (
            id TEXT PRIMARY KEY,
            payment_voucher_id TEXT NOT NULL,
            invoice_voucher_id TEXT NOT NULL,
            allocated_amount REAL NOT NULL,
            allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
            remarks TEXT,
            party_id TEXT,
            party_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP, exchange_rate REAL DEFAULT 1.0, forex_difference REAL DEFAULT 0,
            FOREIGN KEY (payment_voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (invoice_voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE
        )"#,
        r#"CREATE TABLE IF NOT EXISTS voucher_sequences (
            id TEXT PRIMARY KEY,
            voucher_type TEXT UNIQUE NOT NULL,
            prefix TEXT NOT NULL DEFAULT '',
            suffix TEXT NOT NULL DEFAULT '',
            separator TEXT NOT NULL DEFAULT '-',
            next_number INTEGER DEFAULT 1,
            padding INTEGER DEFAULT 4,
            include_financial_year INTEGER DEFAULT 0,
            reset_yearly INTEGER DEFAULT 0
        )"#,
        r#"CREATE TABLE IF NOT EXISTS employees (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            account_id TEXT,
            code TEXT UNIQUE,
            name TEXT NOT NULL,
            designation TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            joining_date DATE,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME, account_group TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS user_roles (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            is_builtin INTEGER DEFAULT 0,
            permissions TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"#,
        r#"CREATE TABLE IF NOT EXISTS user_permissions (
            user_id TEXT PRIMARY KEY,
            role_id TEXT NOT NULL DEFAULT 'user',
            overrides TEXT NOT NULL DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )"#,
        r#"CREATE TABLE IF NOT EXISTS voucher_settings (
            voucher_type TEXT PRIMARY KEY,
            settings TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"#,
        r#"CREATE TABLE IF NOT EXISTS app_settings (
            id TEXT PRIMARY KEY,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"#,
        r#"CREATE TABLE IF NOT EXISTS opening_balances (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            opening_debit REAL DEFAULT 0,
            opening_credit REAL DEFAULT 0,
            financial_year TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(account_id, financial_year),
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        )"#,
        r#"CREATE TABLE IF NOT EXISTS product_images (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            image_path TEXT NOT NULL,
            display_order INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )"#,
    ];

    for stmt in schema_statements {
        conn.execute(stmt, ())
            .await
            .map_err(|e| format!("Failed to create table: {}", e))?;
    }

    Ok("Cloud schema bootstrapped successfully!".to_string())
}

async fn fetch_local_seq_seed(
    conn: &mut sqlx::SqliteConnection,
    voucher_type: &str,
) -> Option<VoucherSeqRow> {
    sqlx::query_as::<_, VoucherSeqRow>(
        "SELECT id, prefix, COALESCE(suffix, '') as suffix, COALESCE(separator, '-') as separator,
                next_number, padding, COALESCE(include_financial_year, 0) as include_financial_year,
                COALESCE(reset_yearly, 0) as reset_yearly
         FROM voucher_sequences WHERE voucher_type = ?",
    )
    .bind(voucher_type)
    .fetch_optional(conn)
    .await
    .ok()
    .flatten()
}

/// Promote any locally-saved provisional (`TMP-...`) vouchers to official sequential cloud numbers.
async fn promote_provisional_vouchers(
    local_conn: &mut sqlx::SqliteConnection,
    conn: &libsql::Connection,
) -> Result<usize, String> {
    let rows: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT id, voucher_no, voucher_type
         FROM vouchers
         WHERE voucher_no LIKE 'TMP-%'
         ORDER BY created_at ASC, id ASC",
    )
    .fetch_all(&mut *local_conn)
    .await
    .map_err(|e| format!("Failed to scan provisional vouchers: {}", e))?;

    let mut promoted = 0usize;
    for (id, old_no, voucher_type) in rows {
        let Some(seed) = fetch_local_seq_seed(&mut *local_conn, &voucher_type).await else {
            continue;
        };

        let (allocated_num, new_no) =
            reserve_next_cloud_number_conn(conn, &seed, &voucher_type).await?;

        sqlx::query(
            "UPDATE vouchers
             SET voucher_no = ?, updated_at = datetime('now', '+1 second')
             WHERE id = ?",
        )
        .bind(&new_no)
        .bind(&id)
        .execute(&mut *local_conn)
        .await
        .map_err(|e| format!("Failed to promote voucher {} to {}: {}", old_no, new_no, e))?;

        // Update any offline vouchers that stored the provisional number as `reference`
        let _ = sqlx::query(
            "UPDATE vouchers
             SET reference = ?, updated_at = datetime('now', '+1 second')
             WHERE reference = ?",
        )
        .bind(&new_no)
        .bind(&old_no)
        .execute(&mut *local_conn)
        .await;

        let _ = sqlx::query(
            "UPDATE voucher_sequences SET next_number = MAX(next_number, ?) WHERE voucher_type = ?",
        )
        .bind(allocated_num + 1)
        .bind(&voucher_type)
        .execute(&mut *local_conn)
        .await;

        println!("[CloudSync] Promoted provisional voucher {} -> {}", old_no, new_no);
        promoted += 1;
    }

    Ok(promoted)
}

/// Sync `voucher_sequences` monotonically (`MAX(local.next_number, remote.next_number)`)
/// so a slower/older PC never rolls back the shared sequence counter.
async fn sync_voucher_sequences(
    local_conn: &mut sqlx::SqliteConnection,
    conn: &libsql::Connection,
    pull_only: bool,
) -> Result<(usize, usize), String> {
    // Ensure voucher_sequences exists remotely
    let table_exists_remote: bool = {
        let mut r = conn
            .query(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='voucher_sequences'",
                (),
            )
            .await
            .map_err(|e| e.to_string())?;
        r.next().await.map_err(|e| e.to_string())?.is_some()
    };
    if !table_exists_remote {
        if let Ok(Some(ddl)) = sqlx::query_scalar::<_, String>(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name = 'voucher_sequences'",
        )
        .fetch_optional(&mut *local_conn)
        .await
        {
            conn.execute(&ddl, ())
                .await
                .map_err(|e| format!("Failed to create remote voucher_sequences: {}", e))?;
        }
    }

    #[derive(Clone)]
    struct SeqFull {
        id: String,
        voucher_type: String,
        prefix: String,
        suffix: String,
        separator: String,
        next_number: i64,
        padding: i64,
        include_fy: i64,
        reset_yearly: i64,
    }

    let mut remote_map: HashMap<String, SeqFull> = HashMap::new();
    let mut r_rows = conn
        .query(
            "SELECT id, voucher_type, prefix, COALESCE(suffix, ''), COALESCE(separator, '-'),
                    next_number, padding, COALESCE(include_financial_year, 0), COALESCE(reset_yearly, 0)
             FROM voucher_sequences",
            (),
        )
        .await
        .map_err(|e| format!("Failed to query remote voucher_sequences: {}", e))?;
    loop {
        match r_rows.next().await {
            Ok(Some(r)) => {
                let vtype = val_to_string(r.get_value(1));
                if vtype.is_empty() {
                    continue;
                }
                remote_map.insert(
                    vtype.clone(),
                    SeqFull {
                        id: val_to_string(r.get_value(0)),
                        voucher_type: vtype,
                        prefix: val_to_string(r.get_value(2)),
                        suffix: val_to_string(r.get_value(3)),
                        separator: {
                            let s = val_to_string(r.get_value(4));
                            if s.is_empty() { "-".to_string() } else { s }
                        },
                        next_number: val_to_i64(r.get_value(5)),
                        padding: val_to_i64(r.get_value(6)),
                        include_fy: val_to_i64(r.get_value(7)),
                        reset_yearly: val_to_i64(r.get_value(8)),
                    },
                );
            }
            Ok(None) => break,
            Err(e) => {
                return Err(format!(
                    "Stream error reading remote voucher_sequences: {}",
                    e
                ))
            }
        }
    }

    let local_rows = sqlx::query(
        "SELECT id, voucher_type, prefix, COALESCE(suffix, '') as suffix, COALESCE(separator, '-') as separator,
                next_number, padding, COALESCE(include_financial_year, 0) as include_financial_year,
                COALESCE(reset_yearly, 0) as reset_yearly
         FROM voucher_sequences",
    )
    .fetch_all(&mut *local_conn)
    .await
    .map_err(|e| format!("Failed to query local voucher_sequences: {}", e))?;

    let mut local_map: HashMap<String, SeqFull> = HashMap::new();
    for r in local_rows {
        let vtype: String = r.get("voucher_type");
        local_map.insert(
            vtype.clone(),
            SeqFull {
                id: r.get("id"),
                voucher_type: vtype,
                prefix: r.get("prefix"),
                suffix: r.get("suffix"),
                separator: r.get("separator"),
                next_number: r.get("next_number"),
                padding: r.get("padding"),
                include_fy: r.get("include_financial_year"),
                reset_yearly: r.get("reset_yearly"),
            },
        );
    }

    let mut pushed = 0usize;
    let mut pulled = 0usize;

    let upsert_seq_sql = "INSERT INTO voucher_sequences
         (id, voucher_type, prefix, suffix, separator, next_number, padding, include_financial_year, reset_yearly)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(voucher_type) DO UPDATE SET
            prefix = excluded.prefix,
            suffix = excluded.suffix,
            separator = excluded.separator,
            next_number = CASE WHEN ? THEN excluded.next_number ELSE MAX(voucher_sequences.next_number, excluded.next_number) END,
            padding = excluded.padding,
            include_financial_year = excluded.include_financial_year,
            reset_yearly = excluded.reset_yearly";

    if pull_only {
        for rem in remote_map.values() {
            sqlx::query(upsert_seq_sql)
                .bind(&rem.id)
                .bind(&rem.voucher_type)
                .bind(&rem.prefix)
                .bind(&rem.suffix)
                .bind(&rem.separator)
                .bind(rem.next_number)
                .bind(rem.padding)
                .bind(rem.include_fy)
                .bind(rem.reset_yearly)
                .bind(true)
                .execute(&mut *local_conn)
                .await
                .map_err(|e| format!("Failed to pull voucher_sequence {}: {}", rem.voucher_type, e))?;
            pulled += 1;
        }
        return Ok((0, pulled));
    }

    // Push local-only sequences
    for (vtype, loc) in &local_map {
        if !remote_map.contains_key(vtype) {
            if conn
                .execute(
                    "INSERT OR IGNORE INTO voucher_sequences
                     (id, voucher_type, prefix, suffix, separator, next_number, padding, include_financial_year, reset_yearly)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    vec![
                        libsql::Value::Text(loc.id.clone()),
                        libsql::Value::Text(loc.voucher_type.clone()),
                        libsql::Value::Text(loc.prefix.clone()),
                        libsql::Value::Text(loc.suffix.clone()),
                        libsql::Value::Text(loc.separator.clone()),
                        libsql::Value::Integer(loc.next_number),
                        libsql::Value::Integer(loc.padding),
                        libsql::Value::Integer(loc.include_fy),
                        libsql::Value::Integer(loc.reset_yearly),
                    ],
                )
                .await
                .is_ok()
            {
                pushed += 1;
            }
        }
    }

    // Pull remote-only sequences & merge matching ones monotonically
    for (vtype, rem) in &remote_map {
        match local_map.get(vtype) {
            None => {
                if sqlx::query(upsert_seq_sql)
                    .bind(&rem.id)
                    .bind(&rem.voucher_type)
                    .bind(&rem.prefix)
                    .bind(&rem.suffix)
                    .bind(&rem.separator)
                    .bind(rem.next_number)
                    .bind(rem.padding)
                    .bind(rem.include_fy)
                    .bind(rem.reset_yearly)
                    .bind(false)
                    .execute(&mut *local_conn)
                    .await
                    .is_ok()
                {
                    pulled += 1;
                }
            }
            Some(loc) => {
                let merged = loc.next_number.max(rem.next_number);
                if merged > rem.next_number {
                    if conn
                        .execute(
                            "UPDATE voucher_sequences SET next_number = MAX(next_number, ?) WHERE voucher_type = ?",
                            vec![
                                libsql::Value::Integer(merged),
                                libsql::Value::Text(vtype.clone()),
                            ],
                        )
                        .await
                        .is_ok()
                    {
                        pushed += 1;
                    }
                }
                if merged > loc.next_number {
                    if sqlx::query(
                        "UPDATE voucher_sequences SET next_number = MAX(next_number, ?) WHERE voucher_type = ?",
                    )
                    .bind(merged)
                    .bind(vtype)
                    .execute(&mut *local_conn)
                    .await
                    .is_ok()
                    {
                        pulled += 1;
                    }
                }
            }
        }
    }

    Ok((pushed, pulled))
}

/// Perform a full two-way synchronization run between local SQLite and Turso Cloud.
pub async fn sync_company_data(
    pool: &SqlitePool,
    url: &str,
    token: &str,
    last_synced_at: Option<&str>,
) -> Result<SyncReport, String> {
    sync_company_with_cursor(pool, url, token, last_synced_at, 0, false).await
}

/// Synchronization with explicit `pull_only` support (used when joining a cloud company on a new PC).
pub async fn sync_company_data_with_mode(
    pool: &SqlitePool,
    url: &str,
    token: &str,
    last_synced_at: Option<&str>,
    pull_only: bool,
) -> Result<SyncReport, String> {
    sync_company_with_cursor(pool, url, token, last_synced_at, 0, pull_only).await
}

/// Full synchronization engine combining:
/// 1. Provisional `TMP-` voucher promotion + monotonic `voucher_sequences` merge
/// 2. Server-side `_cloud_sync_log` monotonic `seq` changelog (catches offline-delayed pushes)
/// 3. Single-query table count reconciliation (heals any missing rows automatically)
/// 4. 120s timestamp lookback + voucher-child consistency + collision guards
pub async fn sync_company_with_cursor(
    pool: &SqlitePool,
    url: &str,
    token: &str,
    last_synced_at: Option<&str>,
    last_remote_seq: i64,
    pull_only: bool,
) -> Result<SyncReport, String> {
    let clean_url = url.trim();
    let clean_token = token.trim();

    if clean_url.is_empty() || clean_token.is_empty() {
        return Err("Database URL and Auth Token are required for synchronization.".to_string());
    }

    let db = Builder::new_remote(clean_url.to_string(), clean_token.to_string())
        .build()
        .await
        .map_err(|e| format!("Failed to initialize cloud database: {}", e))?;

    let conn = db.connect().map_err(|e| format!("Failed to connect to cloud: {}", e))?;

    // Serialize sync runs within this app instance so background & manual syncs never overlap
    let _sync_guard = sync_mutex().lock().await;

    // Acquire a SINGLE dedicated local SQLite connection for the entire sync so
    // `PRAGMA foreign_keys = OFF` holds across every local query & upsert.
    let mut local_conn = pool
        .acquire()
        .await
        .map_err(|e| format!("Failed to acquire local SQLite connection for sync: {}", e))?;

    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&mut *local_conn)
        .await
        .map_err(|e| format!("Failed to disable local foreign_keys for sync: {}", e))?;
    let _ = conn.execute("PRAGMA foreign_keys = OFF", ()).await;

    let result = sync_company_with_conn(
        &mut *local_conn,
        &conn,
        last_synced_at,
        last_remote_seq,
        pull_only,
    )
    .await;

    // Always restore foreign_keys = ON on this pooled connection before returning it
    let _ = sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&mut *local_conn)
        .await;
    let _ = conn.execute("PRAGMA foreign_keys = ON", ()).await;

    result
}

async fn sync_company_with_conn(
    local_conn: &mut sqlx::SqliteConnection,
    conn: &libsql::Connection,
    last_synced_at: Option<&str>,
    last_remote_seq: i64,
    pull_only: bool,
) -> Result<SyncReport, String> {
    let mut pushed_count = 0usize;
    let mut pulled_count = 0usize;
    let mut sync_errors = 0usize;
    let mut pushed_voucher_ids: Vec<String> = Vec::new();
    let mut pulled_voucher_ids: Vec<String> = Vec::new();
    let safe_last_sync = last_synced_at.map(|s| s.trim().replace('\'', ""));

    // Ensure remote changelog exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS _cloud_sync_log (
            seq INTEGER PRIMARY KEY AUTOINCREMENT,
            table_name TEXT NOT NULL,
            row_pk TEXT NOT NULL
        )",
        (),
    )
    .await
    .map_err(|e| format!("Failed to ensure remote _cloud_sync_log: {}", e))?;

    // Capture remote seq cursor BEFORE pushing so concurrent pushes from other PCs are never skipped
    let remote_max_seq: i64 = {
        let mut rows = conn
            .query("SELECT COALESCE(MAX(seq), 0) FROM _cloud_sync_log", ())
            .await
            .map_err(|e| format!("Failed to read remote sync seq: {}", e))?;
        match rows.next().await {
            Ok(Some(r)) => val_to_i64(r.get_value(0)),
            Ok(None) => 0,
            Err(e) => return Err(format!("Failed to fetch remote sync seq: {}", e)),
        }
    };

    // Fetch changed row PKs recorded by other PCs since `last_remote_seq`
    let mut changelog_pks: HashMap<String, HashSet<String>> = HashMap::new();
    if !pull_only && last_remote_seq > 0 && remote_max_seq > last_remote_seq {
        let mut cl_rows = conn
            .query(
                "SELECT DISTINCT table_name, row_pk FROM _cloud_sync_log WHERE seq > ?",
                vec![libsql::Value::Integer(last_remote_seq)],
            )
            .await
            .map_err(|e| format!("Failed to query remote _cloud_sync_log: {}", e))?;
        loop {
            match cl_rows.next().await {
                Ok(Some(r)) => {
                    let tname = val_to_string(r.get_value(0));
                    let rpk = val_to_string(r.get_value(1));
                    if !tname.is_empty() && !rpk.is_empty() {
                        changelog_pks.entry(tname).or_default().insert(rpk);
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    sync_errors += 1;
                    eprintln!("[CloudSync] Error reading _cloud_sync_log stream: {}", e);
                    break;
                }
            }
        }
    }

    if !pull_only {
        // 1. Promote any offline provisional TMP-... vouchers to official cloud numbers before pushing
        if let Err(e) = promote_provisional_vouchers(&mut *local_conn, conn).await {
            eprintln!("[CloudSync] Provisional voucher promotion warning: {}", e);
            sync_errors += 1;
        }
    }

    // 2. Sync voucher_sequences monotonically before regular table sync
    match sync_voucher_sequences(&mut *local_conn, conn, pull_only).await {
        Ok((p, q)) => {
            pushed_count += p;
            pulled_count += q;
        }
        Err(e) => {
            sync_errors += 1;
            eprintln!("[CloudSync] Sequence sync error: {}", e);
        }
    }

    // 3. Batch-fetch local and remote schemas in ONE query each (instead of 80+ PRAGMA calls)
    let mut local_schema: HashMap<String, Vec<String>> = HashMap::new();
    let local_schema_rows = sqlx::query(
        "SELECT m.name as tname, p.name as cname
         FROM sqlite_master m
         JOIN pragma_table_info(m.name) p
         WHERE m.type = 'table'
         ORDER BY m.name, p.cid",
    )
    .fetch_all(&mut *local_conn)
    .await
    .map_err(|e| format!("Failed to inspect local SQLite schema: {}", e))?;
    for r in local_schema_rows {
        let t: String = r.get("tname");
        let c: String = r.get("cname");
        local_schema.entry(t).or_default().push(c);
    }

    let mut remote_schema: HashMap<String, Vec<String>> = HashMap::new();
    let mut rem_schema_rows = conn
        .query(
            "SELECT m.name, p.name
             FROM sqlite_master m
             JOIN pragma_table_info(m.name) p
             WHERE m.type = 'table'
             ORDER BY m.name, p.cid",
            (),
        )
        .await
        .map_err(|e| format!("Failed to inspect remote Turso schema: {}", e))?;
    loop {
        match rem_schema_rows.next().await {
            Ok(Some(r)) => {
                let t = val_to_string(r.get_value(0));
                let c = val_to_string(r.get_value(1));
                if !t.is_empty() && !c.is_empty() {
                    remote_schema.entry(t).or_default().push(c);
                }
            }
            Ok(None) => break,
            Err(e) => return Err(format!("Stream error inspecting remote Turso schema: {}", e)),
        }
    }

    // In initial cloud join (`pull_only`), safely clear local fresh-install random-UUID seed rows
    // ONLY if local has 0 vouchers AND the remote table exists and has rows to replace them.
    if pull_only {
        let local_voucher_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM vouchers")
                .fetch_one(&mut *local_conn)
                .await
                .unwrap_or(0);
        if local_voucher_count == 0 {
            let seed_tables: Vec<&str> = [
                "chart_of_accounts",
                "account_groups",
                "gst_tax_slabs",
                "units",
                "countries",
                "currencies",
                "app_settings",
                "voucher_settings",
                "user_roles",
                "user_permissions",
                "users",
                "invoice_templates",
            ]
            .into_iter()
            .filter(|t| local_schema.contains_key(*t) && remote_schema.contains_key(*t))
            .collect();

            if !seed_tables.is_empty() {
                let exists_union = seed_tables
                    .iter()
                    .map(|t| format!("SELECT '{}' as tname, EXISTS(SELECT 1 FROM {}) as has_rows", t, t))
                    .collect::<Vec<_>>()
                    .join(" UNION ALL ");
                if let Ok(mut e_rows) = conn.query(&exists_union, ()).await {
                    while let Ok(Some(r)) = e_rows.next().await {
                        let tname = val_to_string(r.get_value(0));
                        let has_rows = val_to_i64(r.get_value(1)) != 0;
                        if has_rows && !tname.is_empty() {
                            let _ = sqlx::query(&format!("DELETE FROM {}", tname))
                                .execute(&mut *local_conn)
                                .await;
                        }
                    }
                }
            }
        }
    }

    // 4. Batch-fetch local & remote row counts in ONE query each for missing-row detection
    let count_tables: Vec<&str> = SYNC_TABLES
        .iter()
        .copied()
        .filter(|t| {
            *t != "voucher_sequences"
                && *t != "countries"
                && *t != "currencies"
                && local_schema.contains_key(*t)
                && remote_schema.contains_key(*t)
        })
        .collect();

    let mut local_counts: HashMap<String, i64> = HashMap::new();
    let mut remote_counts: HashMap<String, i64> = HashMap::new();
    if !pull_only && !count_tables.is_empty() {
        let count_union = count_tables
            .iter()
            .map(|t| format!("SELECT '{}' as tname, COUNT(*) as cnt FROM {}", t, t))
            .collect::<Vec<_>>()
            .join(" UNION ALL ");

        match sqlx::query(&count_union).fetch_all(&mut *local_conn).await {
            Ok(rows) => {
                for r in rows {
                    local_counts.insert(r.get::<String, _>("tname"), r.get::<i64, _>("cnt"));
                }
            }
            Err(e) => {
                sync_errors += 1;
                eprintln!("[CloudSync] Failed to read local table counts: {}", e);
            }
        }
        match conn.query(&count_union, ()).await {
            Ok(mut rows) => loop {
                match rows.next().await {
                    Ok(Some(r)) => {
                        remote_counts
                            .insert(val_to_string(r.get_value(0)), val_to_i64(r.get_value(1)));
                    }
                    Ok(None) => break,
                    Err(e) => {
                        sync_errors += 1;
                        eprintln!("[CloudSync] Stream error reading remote table counts: {}", e);
                        break;
                    }
                }
            },
            Err(e) => {
                sync_errors += 1;
                eprintln!("[CloudSync] Failed to query remote table counts: {}", e);
            }
        }
    }

    for table in SYNC_TABLES {
        // Handled separately with monotonic MAX merge above
        if *table == "voucher_sequences" {
            continue;
        }

        let Some(local_cols) = local_schema.get(*table).cloned() else {
            continue;
        };
        if local_cols.is_empty() {
            continue;
        }

        // Create missing remote table on Turso from local DDL if needed
        let remote_cols = if let Some(cols) = remote_schema.get(*table).cloned() {
            cols
        } else {
            let create_sql: Option<String> = sqlx::query_scalar(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?",
            )
            .bind(table)
            .fetch_optional(&mut *local_conn)
            .await
            .unwrap_or(None);

            if let Some(ddl) = create_sql {
                let _ = conn.execute(&ddl, ()).await;
            }
            local_cols.clone()
        };

        // Determine common columns
        let col_names: Vec<String> = local_cols
            .into_iter()
            .filter(|c| remote_cols.contains(c))
            .collect();

        if col_names.is_empty() {
            continue;
        }

        let has_updated_at = col_names.iter().any(|c| c == "updated_at");
        let has_created_at = col_names.iter().any(|c| c == "created_at");
        let has_changed_at = col_names.iter().any(|c| c == "changed_at");

        // Static lookup seed tables without timestamps (countries, currencies) only sync on initial sync
        if !pull_only
            && safe_last_sync.is_some()
            && !has_updated_at
            && !has_created_at
            && !has_changed_at
            && (*table == "countries" || *table == "currencies")
        {
            continue;
        }

        let pk_col = table_pk_col(table);
        let has_pk_col = col_names.iter().any(|c| c == pk_col);
        let is_voucher_child = *table == "voucher_items"
            || *table == "journal_entries"
            || *table == "stock_movements";

        // Reconcile missing PKs if local_count != remote_count
        let mut extra_push_pks: Vec<String> = Vec::new();
        let mut extra_pull_pks: Vec<String> = Vec::new();
        if !pull_only && has_pk_col {
            if let (Some(&lc), Some(&rc)) = (local_counts.get(*table), remote_counts.get(*table)) {
                if lc != rc {
                    let pk_sql = format!("SELECT CAST({} AS TEXT) FROM {}", pk_col, table);
                    let local_pk_set: HashSet<String> = sqlx::query_scalar::<_, String>(&pk_sql)
                        .fetch_all(&mut *local_conn)
                        .await
                        .unwrap_or_default()
                        .into_iter()
                        .collect();

                    let mut remote_pk_set: HashSet<String> = HashSet::new();
                    match conn.query(&pk_sql, ()).await {
                        Ok(mut r_pks) => loop {
                            match r_pks.next().await {
                                Ok(Some(r)) => {
                                    let pk_val = val_to_string(r.get_value(0));
                                    if !pk_val.is_empty() {
                                        remote_pk_set.insert(pk_val);
                                    }
                                }
                                Ok(None) => break,
                                Err(e) => {
                                    sync_errors += 1;
                                    eprintln!("[CloudSync] PK reconciliation stream error on {}: {}", table, e);
                                    break;
                                }
                            }
                        },
                        Err(e) => {
                            sync_errors += 1;
                            eprintln!("[CloudSync] PK reconciliation query error on {}: {}", table, e);
                        }
                    }

                    if !remote_pk_set.is_empty() || rc == 0 {
                        extra_push_pks = local_pk_set.difference(&remote_pk_set).cloned().collect();
                        extra_pull_pks = remote_pk_set.difference(&local_pk_set).cloned().collect();
                    }
                }
            }
        }

        // Merge any remote changelog PKs for this table
        let mut pull_pks_needed: Vec<String> = extra_pull_pks;
        if let Some(cl_set) = changelog_pks.get(*table) {
            for pk in cl_set {
                if !pull_pks_needed.contains(pk) {
                    pull_pks_needed.push(pk.clone());
                }
            }
        }

        let pk_col_idx = col_names.iter().position(|c| c == pk_col);
        let id_col_idx = col_names.iter().position(|c| c == "id");
        let vno_col_idx = col_names.iter().position(|c| c == "voucher_no");
        let vtype_col_idx = col_names.iter().position(|c| c == "voucher_type");
        let upsert_sql = build_upsert_sql(table, &col_names, pk_col);
        let fallback_replace_sql = if !has_cascade_children(table) {
            Some(format!(
                "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
                table,
                col_names.join(", "),
                vec!["?"; col_names.len()].join(", ")
            ))
        } else {
            None
        };

        // ── 5. PUSH: Local -> Turso Cloud (skipped in pull_only initial join mode)
        if !pull_only {
            let push_sql = if let Some(ref last_sync) = safe_last_sync {
                if extra_push_pks.len() > 200 {
                    format!("SELECT {} FROM {}", col_names.join(", "), table)
                } else {
                    let mut conds: Vec<String> = Vec::new();
                    if has_updated_at {
                        conds.push(format!("updated_at >= datetime('{}', '-120 seconds')", last_sync));
                    } else if has_created_at {
                        conds.push(format!("created_at >= datetime('{}', '-120 seconds')", last_sync));
                    } else if has_changed_at {
                        conds.push(format!("changed_at >= datetime('{}', '-120 seconds')", last_sync));
                    }
                    if is_voucher_child && !pushed_voucher_ids.is_empty() {
                        conds.push(format!("voucher_id IN ({})", quote_sql_list(&pushed_voucher_ids)));
                    }
                    if !extra_push_pks.is_empty() && has_pk_col {
                        conds.push(format!(
                            "CAST({} AS TEXT) IN ({})",
                            pk_col,
                            quote_sql_list(&extra_push_pks)
                        ));
                    }

                    if conds.is_empty() {
                        format!("SELECT {} FROM {}", col_names.join(", "), table)
                    } else {
                        format!("SELECT {} FROM {} WHERE {}", col_names.join(", "), table, conds.join(" OR "))
                    }
                }
            } else {
                format!("SELECT {} FROM {}", col_names.join(", "), table)
            };

            match sqlx::query(&push_sql).fetch_all(&mut *local_conn).await {
                Ok(local_rows) => {
                    for row in local_rows {
                        let mut values: Vec<libsql::Value> = Vec::with_capacity(col_names.len());
                        for (i, _) in col_names.iter().enumerate() {
                            let raw = row.try_get_raw(i).ok();
                            let val = match raw {
                                Some(r) if r.is_null() => libsql::Value::Null,
                                Some(r) => {
                                    let type_name = r.type_info().to_string();
                                    match type_name.as_str() {
                                        "INTEGER" | "INT" | "BOOLEAN" => {
                                            if let Ok(v) = row.try_get::<i64, _>(i) {
                                                libsql::Value::Integer(v)
                                            } else if let Ok(v) = row.try_get::<f64, _>(i) {
                                                libsql::Value::Real(v)
                                            } else if let Ok(v) = row.try_get::<String, _>(i) {
                                                libsql::Value::Text(v)
                                            } else {
                                                libsql::Value::Null
                                            }
                                        }
                                        "REAL" | "FLOAT" | "DOUBLE" => {
                                            if let Ok(v) = row.try_get::<f64, _>(i) {
                                                libsql::Value::Real(v)
                                            } else if let Ok(v) = row.try_get::<i64, _>(i) {
                                                libsql::Value::Integer(v)
                                            } else if let Ok(v) = row.try_get::<String, _>(i) {
                                                libsql::Value::Text(v)
                                            } else {
                                                libsql::Value::Null
                                            }
                                        }
                                        _ => {
                                            if let Ok(v) = row.try_get::<String, _>(i) {
                                                libsql::Value::Text(v)
                                            } else if let Ok(v) = row.try_get::<i64, _>(i) {
                                                libsql::Value::Integer(v)
                                            } else if let Ok(v) = row.try_get::<f64, _>(i) {
                                                libsql::Value::Real(v)
                                            } else {
                                                libsql::Value::Null
                                            }
                                        }
                                    }
                                }
                                None => libsql::Value::Null,
                            };
                            values.push(val);
                        }

                        // Guard vouchers against voucher_no collision across distinct UUID ids
                        if *table == "vouchers" {
                            if let (Some(id_i), Some(vno_i), Some(vt_i)) = (id_col_idx, vno_col_idx, vtype_col_idx) {
                                if let (libsql::Value::Text(loc_id), libsql::Value::Text(loc_vno), libsql::Value::Text(loc_vt)) =
                                    (&values[id_i], &values[vno_i], &values[vt_i])
                                {
                                    pushed_voucher_ids.push(loc_id.clone());

                                    let conflict = match conn
                                        .query(
                                            "SELECT id FROM vouchers WHERE voucher_no = ? AND id != ? LIMIT 1",
                                            vec![libsql::Value::Text(loc_vno.clone()), libsql::Value::Text(loc_id.clone())],
                                        )
                                        .await
                                    {
                                        Ok(mut cr) => matches!(cr.next().await, Ok(Some(_))),
                                        Err(_) => false,
                                    };

                                    if conflict {
                                        if let Some(seed) = fetch_local_seq_seed(&mut *local_conn, loc_vt).await {
                                            if let Ok((_, new_no)) = reserve_next_cloud_number_conn(conn, &seed, loc_vt).await {
                                                let _ = sqlx::query("UPDATE vouchers SET voucher_no = ? WHERE id = ?")
                                                    .bind(&new_no)
                                                    .bind(loc_id)
                                                    .execute(&mut *local_conn)
                                                    .await;
                                                println!("[CloudSync] Resolved voucher_no collision on push: {} -> {}", loc_vno, new_no);
                                                values[vno_i] = libsql::Value::Text(new_no);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        let pk_str = pk_col_idx.and_then(|idx| libsql_val_as_pk(&values[idx]));
                        let exec_res = match conn.execute(&upsert_sql, values.clone()).await {
                            Ok(r) => Ok(r),
                            Err(e) => {
                                let err_s = e.to_string();
                                if err_s.contains("UNIQUE constraint failed") {
                                    if let Some(ref rep_sql) = fallback_replace_sql {
                                        conn.execute(rep_sql, values).await
                                    } else {
                                        Err(e)
                                    }
                                } else {
                                    Err(e)
                                }
                            }
                        };

                        match exec_res {
                            Ok(_) => {
                                pushed_count += 1;
                                if let Some(pk) = pk_str {
                                    let _ = conn
                                        .execute(
                                            "INSERT INTO _cloud_sync_log (table_name, row_pk) VALUES (?, ?)",
                                            vec![
                                                libsql::Value::Text((*table).to_string()),
                                                libsql::Value::Text(pk),
                                            ],
                                        )
                                        .await;
                                }
                            }
                            Err(e) => {
                                sync_errors += 1;
                                eprintln!("Push error on table {}: {}", table, e);
                            }
                        }
                    }
                }
                Err(e) => {
                    sync_errors += 1;
                    eprintln!("Local push query error on table {}: {}", table, e);
                }
            }
        }

        // ── 6. PULL: Turso Cloud -> Local
        let pull_sql = if let Some(ref last_sync) = safe_last_sync {
            if pull_pks_needed.len() > 200 {
                format!("SELECT {} FROM {}", col_names.join(", "), table)
            } else {
                let mut conds: Vec<String> = Vec::new();
                if has_updated_at {
                    conds.push(format!("updated_at >= datetime('{}', '-120 seconds')", last_sync));
                } else if has_created_at {
                    conds.push(format!("created_at >= datetime('{}', '-120 seconds')", last_sync));
                } else if has_changed_at {
                    conds.push(format!("changed_at >= datetime('{}', '-120 seconds')", last_sync));
                }
                if is_voucher_child && !pulled_voucher_ids.is_empty() {
                    conds.push(format!("voucher_id IN ({})", quote_sql_list(&pulled_voucher_ids)));
                }
                if !pull_pks_needed.is_empty() && has_pk_col {
                    conds.push(format!(
                        "CAST({} AS TEXT) IN ({})",
                        pk_col,
                        quote_sql_list(&pull_pks_needed)
                    ));
                }

                if conds.is_empty() {
                    format!("SELECT {} FROM {}", col_names.join(", "), table)
                } else {
                    format!("SELECT {} FROM {} WHERE {}", col_names.join(", "), table, conds.join(" OR "))
                }
            }
        } else {
            format!("SELECT {} FROM {}", col_names.join(", "), table)
        };

        match conn.query(&pull_sql, ()).await {
            Ok(mut turso_rows) => {
                loop {
                    let row = match turso_rows.next().await {
                        Ok(Some(r)) => r,
                        Ok(None) => break,
                        Err(e) => {
                            sync_errors += 1;
                            eprintln!("Remote pull stream error on table {}: {}", table, e);
                            break;
                        }
                    };

                    // Guard local vouchers from being silently conflicted by voucher_no clash
                    if *table == "vouchers" {
                        if let (Some(id_i), Some(vno_i)) = (id_col_idx, vno_col_idx) {
                            let rem_id = val_to_string(row.get_value(id_i as i32));
                            let rem_vno = val_to_string(row.get_value(vno_i as i32));
                            if !rem_id.is_empty() {
                                pulled_voucher_ids.push(rem_id.clone());
                            }
                            if !rem_id.is_empty() && !rem_vno.is_empty() {
                                if let Ok(Some((loc_id, loc_vt))) = sqlx::query_as::<_, (String, String)>(
                                    "SELECT id, voucher_type FROM vouchers WHERE voucher_no = ? AND id != ? LIMIT 1"
                                )
                                .bind(&rem_vno)
                                .bind(&rem_id)
                                .fetch_optional(&mut *local_conn)
                                .await
                                {
                                    let short_id = &loc_id[..loc_id.len().min(6)];
                                    let parked = format!("TMP-{}-{}", rem_vno, short_id);
                                    let _ = sqlx::query(
                                        "UPDATE vouchers SET voucher_no = ?, updated_at = datetime('now', '+1 second') WHERE id = ?"
                                    )
                                    .bind(&parked)
                                    .bind(&loc_id)
                                    .execute(&mut *local_conn)
                                    .await;
                                    println!("[CloudSync] Parked colliding local voucher {} ({}) as {} before pull", loc_id, loc_vt, parked);
                                }
                            }
                        }
                    }

                    let mut row_vals: Vec<libsql::Value> = Vec::with_capacity(col_names.len());
                    for i in 0..col_names.len() {
                        row_vals.push(match row.get_value(i as i32) {
                            Ok(v) => v,
                            Err(_) => libsql::Value::Null,
                        });
                    }

                    let mut exec_sql = &upsert_sql;
                    let mut attempted_fallback = false;
                    loop {
                        let mut q = sqlx::query(exec_sql);
                        for v in &row_vals {
                            q = match v {
                                libsql::Value::Null => q.bind(None::<String>),
                                libsql::Value::Integer(n) => q.bind(*n),
                                libsql::Value::Real(f) => q.bind(*f),
                                libsql::Value::Text(s) => q.bind(s.as_str()),
                                libsql::Value::Blob(b) => q.bind(b.as_slice()),
                            };
                        }
                        match q.execute(&mut *local_conn).await {
                            Ok(_) => {
                                pulled_count += 1;
                                break;
                            }
                            Err(e) => {
                                let err_s = e.to_string();
                                if !attempted_fallback && err_s.contains("UNIQUE constraint failed") {
                                    if let Some(ref rep_sql) = fallback_replace_sql {
                                        attempted_fallback = true;
                                        exec_sql = rep_sql;
                                        continue;
                                    }
                                }
                                sync_errors += 1;
                                eprintln!("Pull error on table {}: {}", table, e);
                                break;
                            }
                        }
                    }
                }
            }
            Err(e) => {
                sync_errors += 1;
                eprintln!("Remote pull query error on table {}: {}", table, e);
            }
        }
    }

    // Periodically prune old changelog rows to keep _cloud_sync_log small
    if remote_max_seq > 50_000 {
        let _ = conn
            .execute(
                "DELETE FROM _cloud_sync_log WHERE seq < ?",
                vec![libsql::Value::Integer(remote_max_seq - 20_000)],
            )
            .await;
    }

    let now_str = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    Ok(SyncReport {
        success: sync_errors == 0,
        pushed_count,
        pulled_count,
        message: if sync_errors == 0 {
            format!(
                "Synchronization completed successfully. Pushed: {}, Pulled: {}.",
                pushed_count, pulled_count
            )
        } else {
            format!(
                "Synchronization completed with {} errors. Pushed: {}, Pulled: {}.",
                sync_errors, pushed_count, pulled_count
            )
        },
        timestamp: now_str,
        remote_seq: remote_max_seq,
    })
}

/// Background task that periodically synchronizes the active company's data.
pub fn start_background_sync(registry: Arc<DbRegistry>, interval_secs: u64) {
    tauri::async_runtime::spawn(async move {
        let interval = Duration::from_secs(interval_secs);
        loop {
            sleep(interval).await;

            if let Some(company_id) = registry.active_company_id().await {
                if let Ok(Some(company)) = registry.get_company_by_id(&company_id).await {
                    if company.sync_mode == "online" {
                        if let (Some(url), Some(token)) = (&company.cloud_url, &company.cloud_token) {
                            if !url.trim().is_empty() && !token.trim().is_empty() {
                                if let Ok(pool) = registry.active_pool().await {
                                    match sync_company_with_cursor(
                                        &pool,
                                        url,
                                        token,
                                        company.last_synced_at.as_deref(),
                                        company.last_remote_seq,
                                        false,
                                    )
                                    .await
                                    {
                                        Ok(report) => {
                                            if report.pushed_count > 0 || report.pulled_count > 0 {
                                                println!(
                                                    "[CloudSync] Synced company {} ({}): pushed {}, pulled {}",
                                                    company.name, company.id, report.pushed_count, report.pulled_count
                                                );
                                            }
                                            if report.success {
                                                let _ = registry.update_sync_cursors(&company_id, report.remote_seq).await;
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!(
                                                "[CloudSync] Background sync failed for {} ({}): {}",
                                                company.name, company.id, e
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    #[test]
    fn test_build_upsert_sql_never_uses_replace_for_cascade_tables() {
        let cols = vec![
            "id".to_string(),
            "voucher_no".to_string(),
            "total_amount".to_string(),
        ];
        let sql = build_upsert_sql("vouchers", &cols, "id");
        assert!(sql.starts_with("INSERT INTO vouchers"));
        assert!(sql.contains("ON CONFLICT(id) DO UPDATE SET"));
        assert!(sql.contains("voucher_no = excluded.voucher_no"));
        assert!(sql.contains("total_amount = excluded.total_amount"));
        assert!(!sql.contains("excluded.id"));
        assert!(!sql.contains("OR REPLACE"));
        assert!(has_cascade_children("vouchers"));
        assert!(has_cascade_children("products"));
        assert!(!has_cascade_children("app_settings"));

        let settings_cols = vec!["voucher_type".to_string(), "print_title".to_string()];
        let settings_sql = build_upsert_sql("voucher_settings", &settings_cols, "voucher_type");
        assert!(settings_sql.contains("ON CONFLICT(voucher_type) DO UPDATE SET print_title = excluded.print_title"));
    }

    #[tokio::test]
    async fn test_upsert_vouchers_preserves_children_even_with_fk_on() {
        let db_path = std::env::temp_dir().join(format!(
            "kolabiz_sync_upsert_test_{}.db",
            uuid::Uuid::new_v4()
        ));
        let url = format!("sqlite:{}?mode=rwc", db_path.display());
        let opts = SqliteConnectOptions::from_str(&url)
            .expect("valid sqlite options")
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(opts)
            .await
            .expect("open temp pool");

        sqlx::query(
            "CREATE TABLE vouchers (id TEXT PRIMARY KEY, voucher_no TEXT UNIQUE NOT NULL, total_amount REAL NOT NULL);
             CREATE TABLE voucher_items (id TEXT PRIMARY KEY, voucher_id TEXT NOT NULL, qty REAL NOT NULL,
                 FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE);
             CREATE TABLE journal_entries (id TEXT PRIMARY KEY, voucher_id TEXT NOT NULL, amount REAL NOT NULL,
                 FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE);",
        )
        .execute(&pool)
        .await
        .expect("create schema");

        for idx in 0..10 {
            let vid = format!("v-{}", idx);
            sqlx::query("INSERT INTO vouchers (id, voucher_no, total_amount) VALUES (?, ?, ?)")
                .bind(&vid)
                .bind(format!("SI-{:04}", idx + 1))
                .bind(100.0 + idx as f64)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO voucher_items (id, voucher_id, qty) VALUES (?, ?, ?)")
                .bind(format!("vi-{}", idx))
                .bind(&vid)
                .bind(2.0)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO journal_entries (id, voucher_id, amount) VALUES (?, ?, ?)")
                .bind(format!("je-{}", idx))
                .bind(&vid)
                .bind(100.0 + idx as f64)
                .execute(&pool)
                .await
                .unwrap();
        }

        // Re-upsert all 10 vouchers across random pooled connections (where PRAGMA foreign_keys = ON!)
        let cols = vec![
            "id".to_string(),
            "voucher_no".to_string(),
            "total_amount".to_string(),
        ];
        let upsert_sql = build_upsert_sql("vouchers", &cols, "id");
        for idx in 0..10 {
            sqlx::query(&upsert_sql)
                .bind(format!("v-{}", idx))
                .bind(format!("SI-{:04}", idx + 1))
                .bind(200.0 + idx as f64)
                .execute(&pool)
                .await
                .expect("upsert voucher");
        }

        let item_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM voucher_items")
            .fetch_one(&pool)
            .await
            .unwrap();
        let je_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM journal_entries")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(item_count, 10, "voucher_items must survive voucher upsert");
        assert_eq!(je_count, 10, "journal_entries must survive voucher upsert");

        pool.close().await;
        let _ = std::fs::remove_file(&db_path);
    }
}
