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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
            status TEXT DEFAULT 'draft',
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
        ('1003', 'Accounts Receivable', 'Asset', 'Accounts Receivable', 'Customer receivables'),
        ('1004', 'Inventory', 'Asset', 'Inventory', 'Stock of goods for sale'),
        ('1005', 'GST Input / Tax Receivable', 'Asset', 'Tax Receivable', 'Tax paid on purchases'),
        ('1006', 'Prepaid Expenses', 'Asset', 'Current Assets', 'Expenses paid in advance'),
        ('1007', 'Undeposited Funds', 'Asset', 'Current Assets', 'Cash receipts not yet deposited'),
        
        -- LIABILITIES
        ('2001', 'Accounts Payable', 'Liability', 'Accounts Payable', 'Supplier payables'),
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

    Ok(pool)
}
