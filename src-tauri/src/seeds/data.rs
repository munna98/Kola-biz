use bcrypt;
use sqlx::SqlitePool;
use uuid::Uuid;

pub async fn seed_initial_data(pool: &SqlitePool) -> Result<(), Box<dyn std::error::Error>> {
    // Insert default account groups
    let groups = [
        ("Current Assets", "Asset"),
        ("Bank Account", "Asset"),
        ("Cash", "Asset"),
        ("Non-Current Assets", "Asset"),
        ("Accounts Receivable", "Asset"),
        ("Inventory", "Asset"),
        ("Tax Receivable", "Asset"),
        ("Current Liabilities", "Liability"),
        ("Non-Current Liabilities", "Liability"),
        ("Accounts Payable", "Liability"),
        ("Tax Payable", "Liability"),
        ("Equity", "Equity"),
        ("Revenue", "Income"),
        ("Other Income", "Income"),
        ("Cost of Sales", "Expense"),
        ("Operating Expenses", "Expense"),
        ("Financial Expenses", "Expense"),
        ("Discounts", "Expense"),
    ];

    for (name, acc_type) in groups {
        sqlx::query(
            "INSERT OR IGNORE INTO account_groups (id, name, account_type) VALUES (?, ?, ?)",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(name)
        .bind(acc_type)
        .execute(pool)
        .await?;
    }

    // Insert default chart of accounts
    let coas = [
        ("1001", "Cash", "Asset", "Cash", "Cash and cash equivalents"),
        (
            "1002",
            "Bank Account",
            "Asset",
            "Bank Account",
            "Bank deposits and accounts",
        ),
        (
            "1003",
            "Cash Sale",
            "Asset",
            "Accounts Receivable",
            "Default account for cash sales without specific customer",
        ),
        (
            "1004",
            "Inventory",
            "Asset",
            "Inventory",
            "Stock of goods for sale",
        ),
        (
            "1005",
            "GST Input / Tax Receivable",
            "Asset",
            "Tax Receivable",
            "Tax paid on purchases",
        ),
        (
            "1006",
            "Prepaid Expenses",
            "Asset",
            "Current Assets",
            "Expenses paid in advance",
        ),
        (
            "1007",
            "Undeposited Funds",
            "Asset",
            "Current Assets",
            "Cash receipts not yet deposited",
        ),
        (
            "2001",
            "Cash Purchase",
            "Liability",
            "Accounts Payable",
            "Default account for cash purchases without specific supplier",
        ),
        (
            "2002",
            "GST Output / Tax Payable",
            "Liability",
            "Tax Payable",
            "Tax collected on sales",
        ),
        (
            "2003",
            "Accrued Expenses",
            "Liability",
            "Current Liabilities",
            "Expenses incurred but not paid",
        ),
        ("3001", "Capital", "Equity", "Equity", "Owner capital"),
        (
            "3002",
            "Retained Earnings",
            "Equity",
            "Equity",
            "Accumulated profits",
        ),
        ("3003", "Drawings", "Equity", "Equity", "Owner withdrawals"),
        (
            "3004",
            "Opening Balance Adjustment",
            "Equity",
            "Equity",
            "System account for opening balance auto-balancing",
        ),
        (
            "4001",
            "Sales",
            "Income",
            "Revenue",
            "Product sales revenue",
        ),
        ("4002", "Services", "Income", "Revenue", "Service revenue"),
        (
            "4003",
            "Sales Returns",
            "Income",
            "Revenue",
            "Contra revenue - goods returned by customers",
        ),
        (
            "4004",
            "Discount Received",
            "Income",
            "Other Income",
            "Discounts received from suppliers",
        ),
        (
            "5001",
            "Purchases",
            "Expense",
            "Cost of Sales",
            "Raw purchases of goods",
        ),
        (
            "5002",
            "Cost of Goods Sold",
            "Expense",
            "Cost of Sales",
            "Cost of products sold",
        ),
        (
            "5003",
            "Purchase Returns",
            "Expense",
            "Cost of Sales",
            "Contra expense - goods returned to supplier",
        ),
        (
            "5004",
            "Operating Expenses",
            "Expense",
            "Operating Expenses",
            "General operating expenses",
        ),
        (
            "5005",
            "Salary Expenses",
            "Expense",
            "Operating Expenses",
            "Employee salaries",
        ),
        (
            "5006",
            "Bank Charges",
            "Expense",
            "Financial Expenses",
            "Bank fees and charges",
        ),
        (
            "5007",
            "Discount Allowed",
            "Expense",
            "Discounts",
            "Discounts given to customers",
        ),
        (
            "5008",
            "Delivery Expenses",
            "Expense",
            "Operating Expenses",
            "Shipping and delivery costs",
        ),
        (
            "5009",
            "Rent Expense",
            "Expense",
            "Operating Expenses",
            "Office or shop rent",
        ),
        (
            "5010",
            "Utilities Expense",
            "Expense",
            "Operating Expenses",
            "Electricity, water, internet",
        ),
    ];

    for (code, name, acc_type, group, desc) in coas {
        sqlx::query(
            "INSERT OR IGNORE INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, is_system) VALUES (?, ?, ?, ?, ?, ?, 1)"
        )
        .bind(Uuid::now_v7().to_string())
        .bind(code)
        .bind(name)
        .bind(acc_type)
        .bind(group)
        .bind(desc)
        .execute(pool)
        .await?;
    }

    // Insert default units
    let units = [("Piece", "Pcs"), ("Kilogram", "Kg"), ("Liter", "L")];

    for (name, symbol) in units {
        sqlx::query("INSERT OR IGNORE INTO units (id, name, symbol) VALUES (?, ?, ?)")
            .bind(Uuid::now_v7().to_string())
            .bind(name)
            .bind(symbol)
            .execute(pool)
            .await?;
    }

    // Insert countries
    let countries = [
        ("India", "IN"),
        ("United States", "US"),
        ("United Kingdom", "GB"),
        ("Canada", "CA"),
        ("Australia", "AU"),
        ("Germany", "DE"),
        ("France", "FR"),
        ("Japan", "JP"),
        ("China", "CN"),
        ("Singapore", "SG"),
        ("United Arab Emirates", "AE"),
        ("Saudi Arabia", "SA"),
        ("Malaysia", "MY"),
        ("Thailand", "TH"),
        ("Indonesia", "ID"),
        ("Philippines", "PH"),
        ("Vietnam", "VN"),
        ("South Korea", "KR"),
        ("Bangladesh", "BD"),
        ("Pakistan", "PK"),
        ("Sri Lanka", "LK"),
        ("Nepal", "NP"),
        ("Bhutan", "BT"),
        ("Maldives", "MV"),
    ];

    for (name, code) in countries {
        sqlx::query("INSERT OR IGNORE INTO countries (id, name, code) VALUES (?, ?, ?)")
            .bind(Uuid::now_v7().to_string())
            .bind(name)
            .bind(code)
            .execute(pool)
            .await?;
    }

    seed_default_admin(pool).await?;

    Ok(())
}

async fn seed_default_admin(pool: &SqlitePool) -> Result<(), Box<dyn std::error::Error>> {
    // Check if any admin exists
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        .fetch_one(pool)
        .await?;

    if count.0 == 0 {
        let password_hash = bcrypt::hash("admin", bcrypt::DEFAULT_COST)?;
        let id = Uuid::now_v7().to_string();

        sqlx::query(
            "INSERT INTO users (id, username, password_hash, full_name, role, is_active) 
             VALUES (?, 'admin', ?, 'System Admin', 'admin', 1)",
        )
        .bind(id)
        .bind(password_hash)
        .execute(pool)
        .await?;
    }

    Ok(())
}
