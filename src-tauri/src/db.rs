use sqlx::{sqlite::SqlitePool, migrate::MigrateDatabase, Sqlite};
use tauri::Manager;

pub async fn init_db(app_handle: &tauri::AppHandle) -> Result<SqlitePool, Box<dyn std::error::Error>> {
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
        )"
    ).execute(&pool).await?;
    
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
        )"
    ).execute(&pool).await?;
    
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
        )"
    ).execute(&pool).await?;
    
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
        )"
    ).execute(&pool).await?;
    
    // Account Groups table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS account_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            account_type TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(&pool).await?;
    
    // Chart of Accounts table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS chart_of_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT UNIQUE NOT NULL,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            account_group TEXT NOT NULL,
            description TEXT,
            opening_balance REAL DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )"
    ).execute(&pool).await?;
    
    // Insert default account groups
    sqlx::query(
        "INSERT OR IGNORE INTO account_groups (name, account_type) VALUES
        ('Current Assets', 'Asset'),
        ('Bank Account', 'Asset'),
        ('Cash', 'Asset'),
        ('Non-Current Assets', 'Asset'),
        ('Accounts Receivable', 'Asset'),
        ('Current Liabilities', 'Liability'),
        ('Non-Current Liabilities', 'Liability'),
        ('Accounts Payable', 'Liability'),
        ('Equity', 'Equity'),
        ('Revenue', 'Income'),
        ('Cost of Sales', 'Expense'),
        ('Operating Expenses', 'Expense')"
    ).execute(&pool).await?;
    
    // Insert default chart of accounts
    sqlx::query(
        "INSERT OR IGNORE INTO chart_of_accounts (account_code, account_name, account_type, account_group, description) VALUES
        ('1001', 'Cash', 'Asset', 'Current Assets', 'Cash and cash equivalents'),
        ('1002', 'Bank Account', 'Asset', 'Current Assets', 'Bank deposits and accounts'),
        ('1003', 'Accounts Receivable', 'Asset', 'Accounts Receivable', 'Customer receivables'),
        ('2001', 'Accounts Payable', 'Liability', 'Accounts Payable', 'Supplier payables'),
        ('3001', 'Capital', 'Equity', 'Equity', 'Owner capital'),
        ('4001', 'Sales', 'Income', 'Revenue', 'Product sales revenue'),
        ('4002', 'Services', 'Income', 'Revenue', 'Service revenue'),
        ('5001', 'Cost of Goods Sold', 'Expense', 'Cost of Sales', 'Cost of products sold'),
        ('5002', 'Operating Expenses', 'Expense', 'Operating Expenses', 'General operating expenses'),
        ('5003', 'Salary Expenses', 'Expense', 'Operating Expenses', 'Employee salaries')"
    ).execute(&pool).await?;
    
    // Insert default units
    sqlx::query("INSERT OR IGNORE INTO units (name, symbol) VALUES ('Piece', 'Pcs'), ('Kilogram', 'Kg'), ('Liter', 'L')")
        .execute(&pool).await?;
    
    Ok(pool)
}