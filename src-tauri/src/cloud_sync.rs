use libsql::Builder;
use serde::{Deserialize, Serialize};
use sqlx::sqlite::SqlitePool;
use sqlx::{Row, ValueRef};
use std::sync::Arc;
use tokio::time::{sleep, Duration};

use crate::company_db::DbRegistry;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncReport {
    pub success: bool,
    pub pushed_count: usize,
    pub pulled_count: usize,
    pub message: String,
    pub timestamp: String,
}

const SYNC_TABLES: &[&str] = &[
    "company_profile",
    "units",
    "product_groups",
    "product_brands",
    "gst_tax_slabs",
    "chart_of_accounts",
    "parties",
    "products",
    "services",
    "vouchers",
    "voucher_items",
    "stock_movements",
    "ledger_entries",
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

    let schema_statements = [
        // Company Profile
        "CREATE TABLE IF NOT EXISTS company_profile (
            id INTEGER PRIMARY KEY,
            company_name TEXT NOT NULL,
            trade_name TEXT,
            legal_name TEXT,
            tagline TEXT,
            business_type TEXT,
            cin TEXT,
            pan TEXT,
            gstin TEXT,
            lut_arn TEXT,
            msme_reg_no TEXT,
            address_line1 TEXT,
            address_line2 TEXT,
            address_line3 TEXT,
            city TEXT,
            state TEXT,
            pincode TEXT,
            country TEXT DEFAULT 'India',
            phone TEXT,
            mobile TEXT,
            email TEXT,
            website TEXT,
            bank_name TEXT,
            bank_branch TEXT,
            account_number TEXT,
            account_holder_name TEXT,
            ifsc_code TEXT,
            upi_id TEXT,
            qr_code_image_path TEXT,
            logo_image_path TEXT,
            authorized_signatory_name TEXT,
            authorized_signatory_designation TEXT,
            signature_image_path TEXT,
            declaration_text TEXT,
            notes_terms TEXT,
            show_bank_details INTEGER DEFAULT 1,
            show_qr_code INTEGER DEFAULT 1,
            show_signature INTEGER DEFAULT 1,
            show_declaration INTEGER DEFAULT 1,
            show_notes_terms INTEGER DEFAULT 1,
            show_lut INTEGER DEFAULT 0,
            show_pan INTEGER DEFAULT 1,
            show_msme INTEGER DEFAULT 0,
            currency_symbol TEXT DEFAULT '₹',
            currency_code TEXT DEFAULT 'INR',
            e_invoice_username TEXT,
            e_invoice_password TEXT,
            e_invoice_client_id TEXT,
            e_invoice_client_secret TEXT,
            e_invoice_gstin TEXT,
            e_invoice_base_url TEXT,
            e_invoice_environment TEXT DEFAULT 'sandbox',
            e_way_bill_username TEXT,
            e_way_bill_password TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",

        // Users
        "CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            role TEXT DEFAULT 'user',
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )",

        // Roles
        "CREATE TABLE IF NOT EXISTS user_roles (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            is_builtin INTEGER DEFAULT 0,
            permissions TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",

        // Units
        "CREATE TABLE IF NOT EXISTS units (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            symbol TEXT UNIQUE NOT NULL,
            is_default INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",

        // Product Groups
        "CREATE TABLE IF NOT EXISTS product_groups (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",

        // Product Brands
        "CREATE TABLE IF NOT EXISTS product_brands (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",

        // GST Tax Slabs
        "CREATE TABLE IF NOT EXISTS gst_tax_slabs (
            id TEXT PRIMARY KEY,
            rate REAL UNIQUE NOT NULL,
            cgst_rate REAL NOT NULL,
            sgst_rate REAL NOT NULL,
            igst_rate REAL NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",

        // Products
        "CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            group_id TEXT,
            unit_id TEXT NOT NULL,
            purchase_rate REAL NOT NULL,
            sales_rate REAL NOT NULL,
            mrp REAL NOT NULL,
            barcode TEXT,
            brand_id TEXT,
            color_id TEXT,
            part_number TEXT,
            serial_number TEXT,
            imei TEXT,
            warranty_months INTEGER,
            battery_health TEXT,
            supplier_id TEXT,
            is_master INTEGER NOT NULL DEFAULT 0,
            parent_product_id TEXT,
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
            purchase_deduction REAL DEFAULT 0,
            sales_deduction REAL DEFAULT 0,
            hsn_code TEXT,
            gst_slab_id TEXT,
            cess_rate REAL DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",

        // Services
        "CREATE TABLE IF NOT EXISTS services (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            unit_id TEXT,
            hsn_sac_code TEXT,
            gst_slab_id TEXT,
            sales_rate REAL DEFAULT 0,
            purchase_rate REAL DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",

        // Parties (Customers & Suppliers)
        "CREATE TABLE IF NOT EXISTS parties (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            party_type TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            address TEXT,
            city TEXT,
            state TEXT,
            pincode TEXT,
            gstin TEXT,
            pan TEXT,
            credit_limit REAL DEFAULT 0,
            credit_period_days INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",

        // Chart of Accounts (Ledgers)
        "CREATE TABLE IF NOT EXISTS chart_of_accounts (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            parent_id TEXT,
            is_system INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",

        // Vouchers
        "CREATE TABLE IF NOT EXISTS vouchers (
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
            total_discount REAL DEFAULT 0,
            total_tax REAL DEFAULT 0,
            tax_rate REAL DEFAULT 0,
            cgst_rate REAL DEFAULT 0,
            sgst_rate REAL DEFAULT 0,
            igst_rate REAL DEFAULT 0,
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
            currency_id TEXT,
            exchange_rate REAL DEFAULT 1.0,
            foreign_total REAL DEFAULT 0,
            price_category_id TEXT,
            freight_charge REAL DEFAULT 0.0,
            round_off REAL DEFAULT 0.0,
            metadata TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",

        // Voucher Items
        "CREATE TABLE IF NOT EXISTS voucher_items (
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
            quantity REAL NOT NULL,
            unit_id TEXT,
            rate REAL NOT NULL,
            mrp REAL DEFAULT 0,
            discount_percent REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            amount REAL NOT NULL,
            tax_rate REAL DEFAULT 0,
            tax_amount REAL DEFAULT 0,
            cgst_amount REAL DEFAULT 0,
            sgst_amount REAL DEFAULT 0,
            igst_amount REAL DEFAULT 0,
            cess_rate REAL DEFAULT 0,
            cess_amount REAL DEFAULT 0,
            net_amount REAL NOT NULL,
            base_unit_id TEXT,
            conversion_factor REAL DEFAULT 1.0,
            base_quantity REAL,
            barcode TEXT,
            custom_order_id TEXT,
            purchase_cost REAL DEFAULT 0.0,
            margin_scheme INTEGER DEFAULT 0,
            metadata TEXT,
            sort_order INTEGER DEFAULT 0
        )",

        // Stock Movements
        "CREATE TABLE IF NOT EXISTS stock_movements (
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",

        // Ledger Entries (General Ledger)
        "CREATE TABLE IF NOT EXISTS ledger_entries (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            entry_type TEXT NOT NULL,
            amount REAL NOT NULL,
            narration TEXT,
            entry_date DATE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    ];

    for stmt in schema_statements {
        conn.execute(stmt, ())
            .await
            .map_err(|e| format!("Failed to create table: {}", e))?;
    }

    Ok("Cloud schema bootstrapped successfully!".to_string())
}

/// Perform a full two-way synchronization run between local SQLite and Turso Cloud.
pub async fn sync_company_data(
    pool: &SqlitePool,
    url: &str,
    token: &str,
    last_synced_at: Option<&str>,
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

    let mut pushed_count = 0usize;
    let mut pulled_count = 0usize;

    // Disable foreign keys on local SQLite while applying pulled records
    let _ = sqlx::query("PRAGMA foreign_keys = OFF").execute(pool).await;

    for table in SYNC_TABLES {
        // ── 1. Check if table exists locally
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?)"
        )
        .bind(table)
        .fetch_one(pool)
        .await
        .unwrap_or(false);

        if !exists {
            continue;
        }

        // ── 2. Get local column names
        let pragma_rows = match sqlx::query(&format!("PRAGMA table_info({})", table)).fetch_all(pool).await {
            Ok(r) => r,
            Err(_) => continue,
        };

        let col_names: Vec<String> = pragma_rows
            .iter()
            .map(|r| r.get::<String, _>("name"))
            .collect();

        if col_names.is_empty() {
            continue;
        }

        let has_updated_at = col_names.iter().any(|c| c == "updated_at");
        let has_created_at = col_names.iter().any(|c| c == "created_at");

        // ── 3. PUSH: Local -> Turso Cloud
        let push_sql = if let Some(last_sync) = last_synced_at {
            if has_updated_at {
                format!("SELECT {} FROM {} WHERE updated_at > '{}'", col_names.join(", "), table, last_sync)
            } else if has_created_at {
                format!("SELECT {} FROM {} WHERE created_at > '{}'", col_names.join(", "), table, last_sync)
            } else {
                format!("SELECT {} FROM {}", col_names.join(", "), table)
            }
        } else {
            format!("SELECT {} FROM {}", col_names.join(", "), table)
        };

        if let Ok(local_rows) = sqlx::query(&push_sql).fetch_all(pool).await {
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
                                    row.try_get::<i64, _>(i).map(libsql::Value::Integer).unwrap_or(libsql::Value::Null)
                                }
                                "REAL" | "FLOAT" | "DOUBLE" => {
                                    row.try_get::<f64, _>(i).map(libsql::Value::Real).unwrap_or(libsql::Value::Null)
                                }
                                _ => {
                                    row.try_get::<String, _>(i).map(libsql::Value::Text).unwrap_or(libsql::Value::Null)
                                }
                            }
                        }
                        None => libsql::Value::Null,
                    };
                    values.push(val);
                }

                let placeholders = vec!["?"; col_names.len()].join(", ");
                let insert_sql = format!(
                    "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
                    table,
                    col_names.join(", "),
                    placeholders
                );

                if conn.execute(&insert_sql, values).await.is_ok() {
                    pushed_count += 1;
                }
            }
        }

        // ── 4. PULL: Turso Cloud -> Local
        let pull_sql = if let Some(last_sync) = last_synced_at {
            if has_updated_at {
                format!("SELECT {} FROM {} WHERE updated_at > '{}'", col_names.join(", "), table, last_sync)
            } else if has_created_at {
                format!("SELECT {} FROM {} WHERE created_at > '{}'", col_names.join(", "), table, last_sync)
            } else {
                format!("SELECT {} FROM {}", col_names.join(", "), table)
            }
        } else {
            format!("SELECT {} FROM {}", col_names.join(", "), table)
        };

        if let Ok(mut turso_rows) = conn.query(&pull_sql, ()).await {
            while let Ok(Some(row)) = turso_rows.next().await {
                let placeholders = vec!["?"; col_names.len()].join(", ");
                let insert_local_sql = format!(
                    "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
                    table,
                    col_names.join(", "),
                    placeholders
                );

                let mut q = sqlx::query(&insert_local_sql);
                for i in 0..col_names.len() {
                    match row.get_value(i as i32) {
                        Ok(libsql::Value::Null) => {
                            q = q.bind(None::<String>);
                        }
                        Ok(libsql::Value::Integer(n)) => {
                            q = q.bind(n);
                        }
                        Ok(libsql::Value::Real(f)) => {
                            q = q.bind(f);
                        }
                        Ok(libsql::Value::Text(s)) => {
                            q = q.bind(s);
                        }
                        Ok(libsql::Value::Blob(b)) => {
                            q = q.bind(b);
                        }
                        Err(_) => {
                            q = q.bind(None::<String>);
                        }
                    }
                }

                if q.execute(pool).await.is_ok() {
                    pulled_count += 1;
                }
            }
        }
    }

    // Re-enable foreign keys
    let _ = sqlx::query("PRAGMA foreign_keys = ON").execute(pool).await;

    let now_str = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    Ok(SyncReport {
        success: true,
        pushed_count,
        pulled_count,
        message: format!("Sync complete: {} pushed to cloud, {} pulled locally.", pushed_count, pulled_count),
        timestamp: now_str,
    })
}

/// Spawns a background worker that syncs the active company on an automated schedule.
pub fn start_background_sync(registry: Arc<DbRegistry>, interval_secs: u64) {
    let interval = if interval_secs < 5 { 5 } else { interval_secs };

    tauri::async_runtime::spawn(async move {
        loop {
            sleep(Duration::from_secs(interval)).await;

            // Check if active company is online
            if let Some(company_id) = registry.active_company_id().await {
                if let Ok(Some(company)) = registry.get_company_by_id(&company_id).await {
                    if company.sync_mode == "online" {
                        if let (Some(url), Some(token)) = (&company.cloud_url, &company.cloud_token) {
                            if !url.trim().is_empty() && !token.trim().is_empty() {
                                if let Ok(pool) = registry.active_pool().await {
                                    let last_sync = company.last_synced_at.as_deref();
                                    if let Ok(report) = sync_company_data(&pool, url, token, last_sync).await {
                                        if report.pushed_count > 0 || report.pulled_count > 0 {
                                            println!("SYNC: Auto-sync success: {}", report.message);
                                        }
                                        let _ = registry.update_last_synced(&company_id).await;
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
