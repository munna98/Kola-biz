use sqlx::{migrate::MigrateDatabase, sqlite::SqlitePool, Sqlite};
use tauri::Manager;

pub async fn init_db(
    app_handle: &tauri::AppHandle,
) -> Result<SqlitePool, Box<dyn std::error::Error>> {
    let app_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;

    let db_path = app_dir.join("erp.db");
    let db_url = format!("sqlite:{}", db_path.display());

    if !Sqlite::database_exists(&db_url).await? {
        Sqlite::create_database(&db_url).await?;
    }

    let pool = SqlitePool::connect(&db_url).await?;
    println!("DB: Connected successfully");

    // ==================== CORE TABLES ====================

    // Users table
    println!("DB: Creating users table...");
    sqlx::query(
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
    )
    .execute(&pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        .execute(&pool)
        .await?;
    println!("DB: Users table created/checked");

    // Countries
    println!("DB: Creating countries table...");
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS countries (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            code TEXT UNIQUE NOT NULL
        )",
    )
    .execute(&pool)
    .await?;

    // Units
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS units (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            symbol TEXT NOT NULL,
            is_default INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    let _ = sqlx::query("ALTER TABLE units ADD COLUMN is_default INTEGER DEFAULT 0")
        .execute(&pool)
        .await;

    sqlx::query(
        "UPDATE units
         SET is_default = CASE
             WHEN id = (SELECT id FROM units ORDER BY is_default DESC, name ASC LIMIT 1) THEN 1
             ELSE 0
         END
         WHERE EXISTS (SELECT 1 FROM units)",
    )
    .execute(&pool)
    .await?;

    // ==================== PRODUCT MODULE ====================

    // Product Groups
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS product_groups (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
    .execute(&pool)
    .await?;

    // Products
    sqlx::query(
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
            is_active INTEGER DEFAULT 1,
            deleted_at DATETIME,
            deleted_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES product_groups(id),
            FOREIGN KEY (unit_id) REFERENCES units(id)
        )",
    )
    .execute(&pool)
    .await?;

    let _ = sqlx::query("ALTER TABLE products ADD COLUMN barcode TEXT")
        .execute(&pool)
        .await;

    // ==================== ACCOUNTING MODULE ====================

    // Account Groups
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS account_groups (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            account_type TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Chart of Accounts (Parties & Ledgers)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS chart_of_accounts (
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
            is_active INTEGER DEFAULT 1,
            is_system INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
    .execute(&pool)
    .await?;

    // Customers (Legacy - maintained for compatibility if needed, but logic uses chart_of_accounts)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            code TEXT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            address TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
    .execute(&pool)
    .await?;

    // Suppliers (Legacy)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS suppliers (
            id TEXT PRIMARY KEY,
            code TEXT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            address TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
    .execute(&pool)
    .await?;

    // Opening Balances
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS opening_balances (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            opening_debit REAL DEFAULT 0,
            opening_credit REAL DEFAULT 0,
            financial_year TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(account_id, financial_year),
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        )",
    )
    .execute(&pool)
    .await?;

    // ==================== TRANSACTION MODULE ====================

    // Vouchers (Master Transaction Table)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS vouchers (
            id TEXT PRIMARY KEY,
            voucher_no TEXT UNIQUE NOT NULL,
            voucher_type TEXT NOT NULL,
            voucher_date DATE NOT NULL,
            reference TEXT,
            party_id TEXT,
            party_type TEXT,
            subtotal REAL DEFAULT 0,
            discount_rate REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            tax_amount REAL DEFAULT 0,
            total_amount REAL DEFAULT 0,
            narration TEXT,
            status TEXT DEFAULT 'posted',
            payment_status TEXT DEFAULT 'unpaid',
            created_from_invoice_id TEXT,
            account_id TEXT,
            metadata TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
    .execute(&pool)
    .await?;

    // Migration: Add show_less_column if not exists
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN show_less_column INTEGER DEFAULT 1")
            .execute(&pool)
            .await;

    // Migration: Add salesperson_id to vouchers if not exists
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN salesperson_id TEXT")
        .execute(&pool)
        .await;

    // Migration: Add created_by to vouchers if not exists
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN created_by TEXT")
        .execute(&pool)
        .await;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_vouchers_salesperson ON vouchers(salesperson_id)")
        .execute(&pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(voucher_type)")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(voucher_date)")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_vouchers_party ON vouchers(party_id, party_type)")
        .execute(&pool)
        .await?;

    // Voucher Items (Invoice Line Items)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS voucher_items (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            product_id TEXT,
            ledger_id TEXT,
            description TEXT,
            initial_quantity REAL NOT NULL,
            count INTEGER NOT NULL,
            deduction_per_unit REAL DEFAULT 0,
            final_quantity REAL,
            unit_id TEXT,
            base_quantity REAL,
            rate REAL NOT NULL,
            amount REAL NOT NULL,
            tax_rate REAL DEFAULT 0,
            tax_amount REAL DEFAULT 0,
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS product_unit_conversions (
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
        )",
    )
    .execute(&pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_product_unit_conversions_product
         ON product_unit_conversions(product_id)",
    )
    .execute(&pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_product_unit_conversions_unit
         ON product_unit_conversions(unit_id)",
    )
    .execute(&pool)
    .await?;
    let _ = sqlx::query("ALTER TABLE product_unit_conversions ADD COLUMN purchase_rate REAL NOT NULL DEFAULT 0")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE product_unit_conversions ADD COLUMN sales_rate REAL NOT NULL DEFAULT 0")
        .execute(&pool)
        .await;

    // Migration: ensure every product has at least a base unit conversion
    let unmapped_products: Result<Vec<(String, String, f64, f64)>, _> = sqlx::query_as(
        "SELECT p.id, p.unit_id, p.purchase_rate, p.sales_rate 
         FROM products p
         LEFT JOIN product_unit_conversions puc ON p.id = puc.product_id
         WHERE puc.id IS NULL"
    )
    .fetch_all(&pool)
    .await;

    if let Ok(products) = unmapped_products {
        for (product_id, unit_id, purchase_rate, sales_rate) in products {
            let puc_id = uuid::Uuid::now_v7().to_string();
            let _ = sqlx::query(
                "INSERT INTO product_unit_conversions 
                (id, product_id, unit_id, factor_to_base, purchase_rate, sales_rate, is_default_sale, is_default_purchase, is_default_report)
                VALUES (?, ?, ?, 1.0, ?, ?, 1, 1, 1)"
            )
            .bind(puc_id)
            .bind(product_id)
            .bind(unit_id)
            .bind(purchase_rate)
            .bind(sales_rate)
            .execute(&pool)
            .await;
        }
    }

    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN unit_id TEXT")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN base_quantity REAL")
        .execute(&pool)
        .await;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_voucher_items_voucher ON voucher_items(voucher_id)",
    )
    .execute(&pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_voucher_items_product ON voucher_items(product_id)",
    )
    .execute(&pool)
    .await?;

    // Migration: Add discount_percent to voucher_items if not exists
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN discount_percent REAL DEFAULT 0")
        .execute(&pool)
        .await;

    // Migration: Add discount_amount to voucher_items if not exists
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN discount_amount REAL DEFAULT 0")
        .execute(&pool)
        .await;

    // Journal Entries (Ledger Postings)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS journal_entries (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            debit REAL DEFAULT 0,
            credit REAL DEFAULT 0,
            is_manual INTEGER DEFAULT 0,
            narration TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        )",
    )
    .execute(&pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_journal_voucher ON journal_entries(voucher_id)")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_journal_account ON journal_entries(account_id)")
        .execute(&pool)
        .await?;

    // Stock Movements
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS stock_movements (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            movement_type TEXT NOT NULL,
            quantity REAL NOT NULL,
            count INTEGER DEFAULT 0,
            rate REAL NOT NULL,
            amount REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_stock_movements_voucher ON stock_movements(voucher_id)",
    )
    .execute(&pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)",
    )
    .execute(&pool)
    .await?;

    // Payment/Receipt Allocations
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS payment_allocations (
            id TEXT PRIMARY KEY,
            payment_voucher_id TEXT NOT NULL,
            invoice_voucher_id TEXT NOT NULL,
            allocated_amount REAL NOT NULL,
            allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
            remarks TEXT,
            party_id TEXT,
            party_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (payment_voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (invoice_voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE
        )",
    )
    .execute(&pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations(payment_voucher_id)").execute(&pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_allocations_invoice ON payment_allocations(invoice_voucher_id)").execute(&pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_allocations_party ON payment_allocations(party_id, party_type)").execute(&pool).await?;

    // ==================== SETTINGS & CONFIG ====================

    // Invoice Templates
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS invoice_templates (
            id TEXT PRIMARY KEY,
            template_number TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            voucher_type TEXT NOT NULL,
            template_format TEXT NOT NULL,
            design_mode TEXT NOT NULL,
            layout_config TEXT,
            header_html TEXT,
            body_html TEXT,
            footer_html TEXT,
            styles_css TEXT,
            show_logo INTEGER DEFAULT 1,
            show_company_address INTEGER DEFAULT 1,
            show_party_address INTEGER DEFAULT 1,
            show_bank_details INTEGER DEFAULT 1,
            show_gstin INTEGER DEFAULT 1,
            show_item_images INTEGER DEFAULT 0,
            show_item_hsn INTEGER DEFAULT 0,
            show_qr_code INTEGER DEFAULT 0,
            show_signature INTEGER DEFAULT 1,
            show_terms INTEGER DEFAULT 1,
            show_less_column INTEGER DEFAULT 1,
            auto_print INTEGER DEFAULT 0,
            copies INTEGER DEFAULT 1,
            is_default INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Migration: Add show_less_column if not exists
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN show_less_column INTEGER DEFAULT 1")
            .execute(&pool)
            .await;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_voucher_items_voucher ON voucher_items(voucher_id)",
    )
    .execute(&pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_voucher_items_product ON voucher_items(product_id)",
    )
    .execute(&pool)
    .await?;

    // Migration: Add discount_percent to voucher_items if not exists
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN discount_percent REAL DEFAULT 0")
        .execute(&pool)
        .await;

    // Migration: Add discount_amount to voucher_items if not exists
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN discount_amount REAL DEFAULT 0")
        .execute(&pool)
        .await;

    // Journal Entries (Ledger Postings)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS journal_entries (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            debit REAL DEFAULT 0,
            credit REAL DEFAULT 0,
            is_manual INTEGER DEFAULT 0,
            narration TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        )",
    )
    .execute(&pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_journal_voucher ON journal_entries(voucher_id)")
        .execute(&pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_journal_account ON journal_entries(account_id)")
        .execute(&pool)
        .await?;

    // Stock Movements
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS stock_movements (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            movement_type TEXT NOT NULL,
            quantity REAL NOT NULL,
            count INTEGER DEFAULT 0,
            rate REAL NOT NULL,
            amount REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_stock_movements_voucher ON stock_movements(voucher_id)",
    )
    .execute(&pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)",
    )
    .execute(&pool)
    .await?;

    // Payment/Receipt Allocations
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS payment_allocations (
            id TEXT PRIMARY KEY,
            payment_voucher_id TEXT NOT NULL,
            invoice_voucher_id TEXT NOT NULL,
            allocated_amount REAL NOT NULL,
            allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
            remarks TEXT,
            party_id TEXT,
            party_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (payment_voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (invoice_voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE
        )",
    )
    .execute(&pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations(payment_voucher_id)").execute(&pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_allocations_invoice ON payment_allocations(invoice_voucher_id)").execute(&pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_allocations_party ON payment_allocations(party_id, party_type)").execute(&pool).await?;

    // ==================== SETTINGS & CONFIG ====================

    // Invoice Templates
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS invoice_templates (
            id TEXT PRIMARY KEY,
            template_number TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            voucher_type TEXT NOT NULL,
            template_format TEXT NOT NULL,
            design_mode TEXT NOT NULL,
            layout_config TEXT,
            header_html TEXT,
            body_html TEXT,
            footer_html TEXT,
            styles_css TEXT,
            show_logo INTEGER DEFAULT 1,
            show_company_address INTEGER DEFAULT 1,
            show_party_address INTEGER DEFAULT 1,
            show_bank_details INTEGER DEFAULT 1,
            show_gstin INTEGER DEFAULT 1,
            show_item_images INTEGER DEFAULT 0,
            show_item_hsn INTEGER DEFAULT 0,
            show_qr_code INTEGER DEFAULT 0,
            show_signature INTEGER DEFAULT 1,
            show_terms INTEGER DEFAULT 1,
            show_less_column INTEGER DEFAULT 1,
            auto_print INTEGER DEFAULT 0,
            copies INTEGER DEFAULT 1,
            is_default INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Migration: Add show_less_column if not exists
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN show_less_column INTEGER DEFAULT 1")
            .execute(&pool)
            .await;

    // Voucher Sequences
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS voucher_sequences (
            id TEXT PRIMARY KEY,
            voucher_type TEXT UNIQUE NOT NULL,
            prefix TEXT NOT NULL DEFAULT '',
            suffix TEXT NOT NULL DEFAULT '',
            separator TEXT NOT NULL DEFAULT '-',
            next_number INTEGER DEFAULT 1,
            padding INTEGER DEFAULT 4,
            include_financial_year INTEGER DEFAULT 0,
            reset_yearly INTEGER DEFAULT 0
        )",
    )
    .execute(&pool)
    .await?;

    // Migrations: add new columns to voucher_sequences if not exists
    let _ = sqlx::query("ALTER TABLE voucher_sequences ADD COLUMN suffix TEXT NOT NULL DEFAULT ''")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE voucher_sequences ADD COLUMN separator TEXT NOT NULL DEFAULT '-'")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE voucher_sequences ADD COLUMN include_financial_year INTEGER DEFAULT 0")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE voucher_sequences ADD COLUMN reset_yearly INTEGER DEFAULT 0")
        .execute(&pool)
        .await;

    sqlx::query(
        "INSERT OR IGNORE INTO voucher_sequences (id, voucher_type, prefix) VALUES
        ('vs_' || hex(randomblob(16)), 'sales_invoice', 'SI'),
        ('vs_' || hex(randomblob(16)), 'sales_return', 'SR'),
        ('vs_' || hex(randomblob(16)), 'sales_quotation', 'SQ'),
        ('vs_' || hex(randomblob(16)), 'purchase_invoice', 'PI'),
        ('vs_' || hex(randomblob(16)), 'purchase_return', 'PR'),
        ('vs_' || hex(randomblob(16)), 'purchase_quotation', 'PQ'),
        ('vs_' || hex(randomblob(16)), 'payment', 'PAY'),
        ('vs_' || hex(randomblob(16)), 'receipt', 'RCP'),
        ('vs_' || hex(randomblob(16)), 'journal', 'JV'),
        ('vs_' || hex(randomblob(16)), 'opening_balance', 'OB'),
        ('vs_' || hex(randomblob(16)), 'opening_stock', 'OS'),
        ('vs_' || hex(randomblob(16)), 'stock_journal', 'STJ')",
    )
    .execute(&pool)
    .await?;

    // Company Profile & Other Global Settings
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS company_profile (
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Voucher Settings
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS voucher_settings (
            voucher_type TEXT PRIMARY KEY,
            settings TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS app_settings (
            id TEXT PRIMARY KEY,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // ==================== HR & PAYROLL MODULE ====================

    // Employees
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS employees (
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
            deleted_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        )",
    )
    .execute(&pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id)")
        .execute(&pool)
        .await?;

    // ==================== GST MODULE ====================

    // GST Tax Slabs table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS gst_tax_slabs (
            id            TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            is_dynamic    INTEGER DEFAULT 0,
            fixed_rate    REAL DEFAULT 0,
            threshold     REAL DEFAULT 0,
            below_rate    REAL DEFAULT 0,
            above_rate    REAL DEFAULT 0,
            is_active     INTEGER DEFAULT 1,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Seed default GST slabs
    sqlx::query(
        "INSERT OR IGNORE INTO gst_tax_slabs (id, name, is_dynamic, fixed_rate) VALUES
        ('gst_0',   'NIL',   0, 0),
        ('gst_5',   'GST 5%',   0, 5),
        ('gst_18',  'GST 18%',  0, 18),
        ('gst_28',  'GST 28%',  0, 28)",
    )
    .execute(&pool)
    .await?;

    // ==================== GST MODULE MIGRATIONS ====================

    // Migration: rename GST 0% to NIL
    let _ = sqlx::query("UPDATE gst_tax_slabs SET name = 'NIL' WHERE id = 'gst_0' AND name != 'NIL'")
        .execute(&pool)
        .await;

    // Migration: update apparel slab for existing databases
    let _ = sqlx::query(
        "UPDATE gst_tax_slabs
         SET name = 'GST 5/18% @2500', threshold = 2500.0, above_rate = 18.0
         WHERE id = 'gst_apparel' AND (name = 'GST 5/12% @1000' OR above_rate = 12.0)"
    )
    .execute(&pool)
    .await;

    // Migration: retire GST 12% fixed slab
    let _ = sqlx::query("UPDATE gst_tax_slabs SET is_active = 0 WHERE id = 'gst_12'")
    .execute(&pool)
    .await;

    // Migration: Add GST columns to products
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN hsn_sac_code TEXT")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN gst_slab_id TEXT REFERENCES gst_tax_slabs(id)")
        .execute(&pool)
        .await;

    // Migration: Add GST columns to customers
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN gstin TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN address_line_1 TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN address_line_2 TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN address_line_3 TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN state TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN city TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN postal_code TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN country TEXT").execute(&pool).await;

    // Migration: Move legacy address to address_line_1 and drop address column
    let _ = sqlx::query("UPDATE customers SET address_line_1 = address WHERE address_line_1 IS NULL OR address_line_1 = ''").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE customers DROP COLUMN address").execute(&pool).await;

    // Migration: Add GST columns to suppliers
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN gstin TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN address_line_1 TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN address_line_2 TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN address_line_3 TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN state TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN city TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN postal_code TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN country TEXT").execute(&pool).await;

    // Migration: Move legacy address to address_line_1 and drop address column
    let _ = sqlx::query("UPDATE suppliers SET address_line_1 = address WHERE address_line_1 IS NULL OR address_line_1 = ''").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers DROP COLUMN address").execute(&pool).await;

    // Migration: Add GST columns to chart_of_accounts
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN gstin TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN address_line_1 TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN address_line_2 TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN state TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN city TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN postal_code TEXT").execute(&pool).await;

    // Migration: Add GST split columns to voucher_items
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN cgst_rate REAL DEFAULT 0").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN sgst_rate REAL DEFAULT 0").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN igst_rate REAL DEFAULT 0").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN cgst_amount REAL DEFAULT 0").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN sgst_amount REAL DEFAULT 0").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN igst_amount REAL DEFAULT 0").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN hsn_sac_code TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN gst_slab_id TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN resolved_gst_rate REAL DEFAULT 0").execute(&pool).await;

    // Migration: Add e-Invoice columns to vouchers
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN irn TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN ack_no TEXT").execute(&pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN ack_date DATE").execute(&pool).await;

    // ==================== SEEDING ====================

    crate::seeds::seed_initial_data(&pool).await?;
    crate::seeds::seed_handlebars_templates(&pool).await?;

    Ok(pool)
}
