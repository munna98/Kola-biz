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

    // Units table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS units (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            symbol TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Products table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            unit_id INTEGER NOT NULL,
            purchase_rate REAL NOT NULL,
            sales_rate REAL NOT NULL,
            mrp REAL NOT NULL,
            is_active INTEGER DEFAULT 1,
            deleted_at DATETIME,
            deleted_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (unit_id) REFERENCES units(id)
        )",
    )
    .execute(&pool)
    .await?;

    // Customers table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            address TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
    .execute(&pool)
    .await?;

    // Suppliers table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            address TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
    .execute(&pool)
    .await?;

    // Account Groups table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS account_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            account_type TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Chart of Accounts table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS chart_of_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT UNIQUE NOT NULL,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            account_group TEXT NOT NULL,
            description TEXT,
            opening_balance REAL DEFAULT 0.0,
            opening_balance_type TEXT DEFAULT 'Dr',
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
    .execute(&pool)
    .await?;

    // ==================== TRANSACTION TABLES ====================

    // Vouchers (Master Transaction Table)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS vouchers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_no TEXT UNIQUE NOT NULL,
            voucher_type TEXT NOT NULL,
            voucher_date DATE NOT NULL,
            reference TEXT,
            party_id INTEGER,
            party_type TEXT,
            subtotal REAL DEFAULT 0,
            discount_rate REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            tax_amount REAL DEFAULT 0,
            total_amount REAL DEFAULT 0,
            metadata TEXT,
            narration TEXT,
            status TEXT DEFAULT 'posted',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
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

    // Migration: Add metadata column to vouchers if it doesn't exist
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN metadata TEXT")
        .execute(&pool)
        .await;

    // Migration: Add deleted_at to customers, suppliers, chart_of_accounts
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN deleted_at DATETIME")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN deleted_at DATETIME")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN deleted_at DATETIME")
        .execute(&pool)
        .await;

    // Voucher Items (Invoice Line Items)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS voucher_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_id INTEGER NOT NULL,
            product_id INTEGER,
            description TEXT,
            initial_quantity REAL NOT NULL,
            count INTEGER NOT NULL,
            deduction_per_unit REAL DEFAULT 0,
            final_quantity REAL,
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
        "CREATE INDEX IF NOT EXISTS idx_voucher_items_voucher ON voucher_items(voucher_id)",
    )
    .execute(&pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_voucher_items_product ON voucher_items(product_id)",
    )
    .execute(&pool)
    .await?;

    // Migration: Add remarks column to voucher_items if it doesn't exist
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN remarks TEXT")
        .execute(&pool)
        .await;

    // Journal Entries (Double Entry Records)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_id INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
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
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            movement_type TEXT NOT NULL,
            quantity REAL NOT NULL,
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

    // Opening Balances
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS opening_balances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
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

    // Voucher Sequences (Auto Number Generation)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS voucher_sequences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_type TEXT UNIQUE NOT NULL,
            prefix TEXT NOT NULL,
            next_number INTEGER DEFAULT 1,
            padding INTEGER DEFAULT 4
        )",
    )
    .execute(&pool)
    .await?;

    // Insert default sequences
    sqlx::query(
        "INSERT OR IGNORE INTO voucher_sequences (voucher_type, prefix) VALUES
        ('sales_invoice', 'SI'),
        ('sales_return', 'SR'),
        ('sales_quotation', 'SQ'),
        ('purchase_invoice', 'PI'),
        ('purchase_return', 'PR'),
        ('purchase_quotation', 'PQ'),
        ('payment', 'PAY'),
        ('receipt', 'RCP'),
        ('journal', 'JV'),
        ('opening_balance', 'OB')",
    )
    .execute(&pool)
    .await?;

    // ==================== SEED DATA ====================

    // Insert default account groups
    sqlx::query(
        "INSERT OR IGNORE INTO account_groups (name, account_type) VALUES
        ('Current Assets', 'Asset'),
        ('Bank Account', 'Asset'),
        ('Cash', 'Asset'),
        ('Non-Current Assets', 'Asset'),
        ('Accounts Receivable', 'Asset'),
        ('Inventory', 'Asset'),
        ('Tax Receivable', 'Asset'),
        ('Current Liabilities', 'Liability'),
        ('Non-Current Liabilities', 'Liability'),
        ('Accounts Payable', 'Liability'),
        ('Tax Payable', 'Liability'),
        ('Equity', 'Equity'),
        ('Revenue', 'Income'),
        ('Other Income', 'Income'),
        ('Cost of Sales', 'Expense'),
        ('Operating Expenses', 'Expense'),
        ('Financial Expenses', 'Expense'),
        ('Discounts', 'Expense')",
    )
    .execute(&pool)
    .await?;

    // Insert default chart of accounts
    sqlx::query(
        "INSERT OR IGNORE INTO chart_of_accounts (account_code, account_name, account_type, account_group, description) VALUES
        -- ASSETS
        ('1001', 'Cash', 'Asset', 'Cash', 'Cash and cash equivalents'),
        ('1002', 'Bank Account', 'Asset', 'Bank Account', 'Bank deposits and accounts'),
        ('1004', 'Inventory', 'Asset', 'Inventory', 'Stock of goods for sale'),
        ('1005', 'GST Input / Tax Receivable', 'Asset', 'Tax Receivable', 'Tax paid on purchases'),
        ('1006', 'Prepaid Expenses', 'Asset', 'Current Assets', 'Expenses paid in advance'),
        ('1007', 'Undeposited Funds', 'Asset', 'Current Assets', 'Cash receipts not yet deposited'),
        
        -- LIABILITIES
        ('2002', 'GST Output / Tax Payable', 'Liability', 'Tax Payable', 'Tax collected on sales'),
        ('2003', 'Accrued Expenses', 'Liability', 'Current Liabilities', 'Expenses incurred but not paid'),
        
        -- EQUITY
        ('3001', 'Capital', 'Equity', 'Equity', 'Owner capital'),
        ('3002', 'Retained Earnings', 'Equity', 'Equity', 'Accumulated profits'),
        ('3003', 'Drawings', 'Equity', 'Equity', 'Owner withdrawals'),
        ('3004', 'Opening Balance Adjustment', 'Equity', 'Equity', 'System account for opening balance auto-balancing'),
        
        -- INCOME / REVENUE
        ('4001', 'Sales', 'Income', 'Revenue', 'Product sales revenue'),
        ('4002', 'Services', 'Income', 'Revenue', 'Service revenue'),
        ('4003', 'Sales Returns', 'Income', 'Revenue', 'Contra revenue - goods returned by customers'),
        ('4004', 'Discount Received', 'Income', 'Other Income', 'Discounts received from suppliers'),
        
        -- EXPENSES
        ('5001', 'Purchases', 'Expense', 'Cost of Sales', 'Raw purchases of goods'),
        ('5002', 'Cost of Goods Sold', 'Expense', 'Cost of Sales', 'Cost of products sold'),
        ('5003', 'Purchase Returns', 'Expense', 'Cost of Sales', 'Contra expense - goods returned to supplier'),
        ('5004', 'Operating Expenses', 'Expense', 'Operating Expenses', 'General operating expenses'),
        ('5005', 'Salary Expenses', 'Expense', 'Operating Expenses', 'Employee salaries'),
        ('5006', 'Bank Charges', 'Expense', 'Financial Expenses', 'Bank fees and charges'),
        ('5007', 'Discount Allowed', 'Expense', 'Discounts', 'Discounts given to customers'),
        ('5008', 'Delivery Expenses', 'Expense', 'Operating Expenses', 'Shipping and delivery costs'),
        ('5009', 'Rent Expense', 'Expense', 'Operating Expenses', 'Office or shop rent'),
        ('5010', 'Utilities Expense', 'Expense', 'Operating Expenses', 'Electricity, water, internet')"
    ).execute(&pool).await?;

    // Insert default units
    sqlx::query("INSERT OR IGNORE INTO units (name, symbol) VALUES ('Piece', 'Pcs'), ('Kilogram', 'Kg'), ('Liter', 'L')")
        .execute(&pool).await?;

    // ==================== COMPANY PROFILE ====================

    // Company/Business Profile table
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
            country TEXT DEFAULT 'India',
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

    // Insert default company profile record
    sqlx::query(
        "INSERT OR IGNORE INTO company_profile (id, company_name) VALUES (1, 'My Company')",
    )
    .execute(&pool)
    .await?;

    // ==================== INVOICE TEMPLATES ====================

    // Invoice Templates table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS invoice_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_number TEXT UNIQUE NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            description TEXT,
            voucher_type TEXT NOT NULL, -- 'sales_invoice', 'purchase_invoice', etc.
            template_format TEXT NOT NULL, -- 'a4_portrait', 'a4_landscape', 'thermal_58mm', 'thermal_80mm'
            design_mode TEXT DEFAULT 'standard', -- 'standard', 'compact', 'modern', 'minimal'
            
            -- Layout Configuration (JSON)
            layout_config TEXT DEFAULT '{}', -- header height, footer height, margins, etc.
            
            -- Template Content
            header_html TEXT NOT NULL,
            body_html TEXT NOT NULL,
            footer_html TEXT NOT NULL,
            styles_css TEXT NOT NULL,
            
            -- Features
            show_logo INTEGER DEFAULT 1,
            show_company_address INTEGER DEFAULT 1,
            show_party_address INTEGER DEFAULT 1,
            show_gstin INTEGER DEFAULT 1,
            show_item_images INTEGER DEFAULT 0,
            show_item_hsn INTEGER DEFAULT 0,
            show_bank_details INTEGER DEFAULT 1,
            show_qr_code INTEGER DEFAULT 0,
            show_signature INTEGER DEFAULT 1,
            show_terms INTEGER DEFAULT 1,
            
            -- Print Settings
            auto_print INTEGER DEFAULT 0,
            copies INTEGER DEFAULT 1,
            
            -- Status
            is_default INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_templates_voucher_type ON invoice_templates(voucher_type)",
    )
    .execute(&pool)
    .await?;

    // Migration: Add template_number column if it doesn't exist
    let _ = sqlx::query(
        "ALTER TABLE invoice_templates ADD COLUMN template_number TEXT UNIQUE NOT NULL DEFAULT ''",
    )
    .execute(&pool)
    .await;

    // Create a unique index on (name, voucher_type) combination for additional safety
    let _ = sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_name_type ON invoice_templates(name, voucher_type)"
    )
    .execute(&pool)
    .await;

    // 3. Voucher Template Assignments
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS voucher_template_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            voucher_type TEXT UNIQUE NOT NULL,
            template_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (template_id) REFERENCES invoice_templates(id) ON DELETE RESTRICT
        )",
    )
    .execute(&pool)
    .await?;

    // 4. Template Variables/Fields (for drag-drop builder)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS template_fields (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            field_name TEXT UNIQUE NOT NULL,
            field_label TEXT NOT NULL,
            field_category TEXT NOT NULL, -- 'company', 'party', 'voucher', 'items', 'totals'
            field_type TEXT NOT NULL, -- 'text', 'number', 'date', 'currency', 'image', 'table'
            format_pattern TEXT, -- e.g., 'DD/MM/YYYY' for dates, '#,##0.00' for numbers
            is_required INTEGER DEFAULT 0,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Insert default template fields
    sqlx::query(
        "INSERT OR IGNORE INTO template_fields (field_name, field_label, field_category, field_type) VALUES
        -- Company Fields
        ('company_name', 'Company Name', 'company', 'text'),
        ('company_address', 'Company Address', 'company', 'text'),
        ('company_phone', 'Company Phone', 'company', 'text'),
        ('company_email', 'Company Email', 'company', 'text'),
        ('company_gstin', 'Company GSTIN', 'company', 'text'),
        ('company_logo', 'Company Logo', 'company', 'image'),
        
        -- Party Fields
        ('party_name', 'Customer/Supplier Name', 'party', 'text'),
        ('party_address', 'Customer/Supplier Address', 'party', 'text'),
        ('party_phone', 'Customer/Supplier Phone', 'party', 'text'),
        ('party_gstin', 'Customer/Supplier GSTIN', 'party', 'text'),
        
        -- Voucher Fields
        ('voucher_no', 'Invoice Number', 'voucher', 'text'),
        ('voucher_date', 'Invoice Date', 'voucher', 'date'),
        ('reference', 'Reference/PO Number', 'voucher', 'text'),
        ('narration', 'Narration/Notes', 'voucher', 'text'),
        
        -- Items Table
        ('items_table', 'Items Table', 'items', 'table'),
        
        -- Totals
        ('subtotal', 'Subtotal', 'totals', 'currency'),
        ('discount_rate', 'Discount %', 'totals', 'number'),
        ('discount_amount', 'Discount Amount', 'totals', 'currency'),
        ('tax_total', 'Total Tax', 'totals', 'currency'),
        ('grand_total', 'Grand Total', 'totals', 'currency'),
        ('grand_total_words', 'Amount in Words', 'totals', 'text')",
    )
    .execute(&pool)
    .await?;

    // 5. Printer Configuration
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS printer_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_name TEXT NOT NULL,
            printer_type TEXT NOT NULL, -- 'pdf', 'thermal', 'laser', 'inkjet'
            printer_name TEXT, -- System printer name
            paper_size TEXT DEFAULT 'A4', -- 'A4', 'A5', '58mm', '80mm', 'Letter'
            orientation TEXT DEFAULT 'portrait', -- 'portrait', 'landscape'
            margin_top REAL DEFAULT 10,
            margin_bottom REAL DEFAULT 10,
            margin_left REAL DEFAULT 10,
            margin_right REAL DEFAULT 10,
            dpi INTEGER DEFAULT 300,
            color_mode TEXT DEFAULT 'color', -- 'color', 'grayscale', 'bw'
            
            -- Thermal Printer Specific
            characters_per_line INTEGER, -- for thermal printers
            line_spacing INTEGER DEFAULT 1,
            cut_paper INTEGER DEFAULT 1,
            open_drawer INTEGER DEFAULT 0,
            
            is_default INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(&pool)
    .await?;

    // Insert default printer profiles
    sqlx::query(
        "INSERT OR IGNORE INTO printer_profiles (profile_name, printer_type, paper_size) VALUES
        ('Default PDF (A4)', 'pdf', 'A4'),
        ('Thermal 58mm', 'thermal', '58mm'),
        ('Thermal 80mm', 'thermal', '80mm')",
    )
    .execute(&pool)
    .await?;

    // Seed default invoice templates
    crate::db_seed::seed_handlebars_templates(&pool).await?;

    Ok(pool)
}
