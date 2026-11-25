use libsql::Builder;
use serde::Serialize;
use sqlx::{Row, ValueRef};
use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::time::{sleep, Duration};

use crate::company_db::DbRegistry;

#[derive(Debug, Serialize)]
pub struct SyncReport {
    pub success: bool,
    pub pushed_count: usize,
    pub pulled_count: usize,
    pub message: String,
    pub timestamp: String,
}

pub const SYNC_TABLES: &[&str] = &[
    "company_profile",
    "users",
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
    "services",
    "account_groups",
    "chart_of_accounts",
    "customers",
    "suppliers",
    "routes",
    "vouchers",
    "voucher_items",
    "product_unit_conversions",
    "journal_entries",
    "stock_movements",
    "payment_allocations",
    "voucher_sequences",
    "employees",
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

        let local_cols: Vec<String> = pragma_rows
            .iter()
            .map(|r| r.get::<String, _>("name"))
            .collect();

        if local_cols.is_empty() {
            continue;
        }

        // ── 2b. Check if table exists on Turso; if not, create it from local DDL!
        let table_exists_remote: bool = {
            let mut check_rows = match conn.query(&format!("SELECT 1 FROM sqlite_master WHERE type='table' AND name='{}'", table), ()).await {
                Ok(r) => r,
                Err(_) => continue,
            };
            check_rows.next().await.unwrap_or(None).is_some()
        };

        if !table_exists_remote {
            let create_sql: Option<String> = sqlx::query_scalar(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?"
            )
            .bind(table)
            .fetch_optional(pool)
            .await
            .unwrap_or(None);

            if let Some(ddl) = create_sql {
                let _ = conn.execute(&ddl, ()).await;
            }
        }

        // Get remote column names on Turso
        let mut remote_cols: Vec<String> = Vec::new();
        if let Ok(mut r_rows) = conn.query(&format!("PRAGMA table_info({})", table), ()).await {
            while let Ok(Some(r)) = r_rows.next().await {
                if let Ok(libsql::Value::Text(cname)) = r.get_value(1) {
                    remote_cols.push(cname);
                }
            }
        }

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

                match conn.execute(&insert_sql, values).await {
                    Ok(_) => pushed_count += 1,
                    Err(e) => eprintln!("Push error on table {}: {}", table, e),
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

                match q.execute(pool).await {
                    Ok(_) => pulled_count += 1,
                    Err(e) => eprintln!("Pull error on table {}: {}", table, e),
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
        message: format!(
            "Synchronization completed successfully. Pushed: {}, Pulled: {}.",
            pushed_count, pulled_count
        ),
        timestamp: now_str,
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
                                    match sync_company_data(
                                        &pool,
                                        url,
                                        token,
                                        company.last_synced_at.as_deref(),
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
                                            let _ = registry.update_last_synced(&company_id).await;
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
