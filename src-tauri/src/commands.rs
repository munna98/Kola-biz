use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

// ============= UNITS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Unit {
    pub id: i64,
    pub name: String,
    pub symbol: String,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateUnit {
    pub name: String,
    pub symbol: String,
}

#[tauri::command]
pub async fn get_units(pool: State<'_, SqlitePool>) -> Result<Vec<Unit>, String> {
    sqlx::query_as::<_, Unit>("SELECT * FROM units ORDER BY name ASC")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_unit(
    pool: State<'_, SqlitePool>,
    unit: CreateUnit,
) -> Result<Unit, String> {
    let result = sqlx::query(
        "INSERT INTO units (name, symbol) VALUES (?, ?)"
    )
    .bind(&unit.name)
    .bind(&unit.symbol)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    let id = result.last_insert_rowid();
    
    sqlx::query_as::<_, Unit>("SELECT * FROM units WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_unit(
    pool: State<'_, SqlitePool>,
    id: i64,
    unit: CreateUnit,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE units SET name = ?, symbol = ? WHERE id = ?"
    )
    .bind(&unit.name)
    .bind(&unit.symbol)
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn delete_unit(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("DELETE FROM units WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

// ============= PRODUCTS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Product {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub unit_id: i64,
    pub purchase_rate: f64,
    pub sales_rate: f64,
    pub mrp: f64,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateProduct {
    pub code: String,
    pub name: String,
    pub unit_id: i64,
    pub purchase_rate: f64,
    pub sales_rate: f64,
    pub mrp: f64,
}

#[tauri::command]
pub async fn get_products(pool: State<'_, SqlitePool>) -> Result<Vec<Product>, String> {
    sqlx::query_as::<_, Product>(
        "SELECT id, code, name, unit_id, purchase_rate, sales_rate, mrp, is_active, created_at 
         FROM products 
         WHERE deleted_at IS NULL 
         ORDER BY created_at DESC"
    )
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_product(
    pool: State<'_, SqlitePool>,
    product: CreateProduct,
) -> Result<Product, String> {
    let result = sqlx::query(
        "INSERT INTO products (code, name, unit_id, purchase_rate, sales_rate, mrp) 
         VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&product.code)
    .bind(&product.name)
    .bind(product.unit_id)
    .bind(product.purchase_rate)
    .bind(product.sales_rate)
    .bind(product.mrp)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    let id = result.last_insert_rowid();
    
    sqlx::query_as::<_, Product>(
        "SELECT id, code, name, unit_id, purchase_rate, sales_rate, mrp, is_active, created_at 
         FROM products WHERE id = ?"
    )
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_product(
    pool: State<'_, SqlitePool>,
    id: i64,
    product: CreateProduct,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE products 
         SET code = ?, name = ?, unit_id = ?, purchase_rate = ?, sales_rate = ?, mrp = ? 
         WHERE id = ?"
    )
    .bind(&product.code)
    .bind(&product.name)
    .bind(product.unit_id)
    .bind(product.purchase_rate)
    .bind(product.sales_rate)
    .bind(product.mrp)
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn delete_product(
    pool: State<'_, SqlitePool>,
    id: i64,
    deleted_by: String,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE products 
         SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, is_active = 0 
         WHERE id = ?"
    )
    .bind(deleted_by)
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

// ============= CUSTOMERS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Customer {
    pub id: i64,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateCustomer {
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
}

#[tauri::command]
pub async fn get_customers(pool: State<'_, SqlitePool>) -> Result<Vec<Customer>, String> {
    sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE is_active = 1 ORDER BY name ASC")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_customer(
    pool: State<'_, SqlitePool>,
    customer: CreateCustomer,
) -> Result<Customer, String> {
    let result = sqlx::query(
        "INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)"
    )
    .bind(&customer.name)
    .bind(&customer.email)
    .bind(&customer.phone)
    .bind(&customer.address)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    let id = result.last_insert_rowid();
    
    // Create corresponding account in Chart of Accounts
    let account_code = format!("1003-{}", id);
    sqlx::query(
        "INSERT INTO chart_of_accounts (account_code, account_name, account_type, account_group, description) 
         VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&account_code)
    .bind(&customer.name)
    .bind("Asset")
    .bind("Accounts Receivable")
    .bind("Customer account")
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_customer(
    pool: State<'_, SqlitePool>,
    id: i64,
    customer: CreateCustomer,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE customers SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?"
    )
    .bind(&customer.name)
    .bind(&customer.email)
    .bind(&customer.phone)
    .bind(&customer.address)
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    // Update corresponding account in Chart of Accounts
    let account_code = format!("1003-{}", id);
    sqlx::query(
        "UPDATE chart_of_accounts SET account_name = ?, updated_at = CURRENT_TIMESTAMP WHERE account_code = ?"
    )
    .bind(&customer.name)
    .bind(&account_code)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn delete_customer(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE customers SET is_active = 0 WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    // Delete corresponding account from chart of accounts
    let account_code = format!("1003-{}", id);
    sqlx::query("UPDATE chart_of_accounts SET is_active = 0 WHERE account_code = ?")
        .bind(&account_code)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

// ============= SUPPLIERS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Supplier {
    pub id: i64,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateSupplier {
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
}

#[tauri::command]
pub async fn get_suppliers(pool: State<'_, SqlitePool>) -> Result<Vec<Supplier>, String> {
    sqlx::query_as::<_, Supplier>("SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name ASC")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_supplier(
    pool: State<'_, SqlitePool>,
    supplier: CreateSupplier,
) -> Result<Supplier, String> {
    let result = sqlx::query(
        "INSERT INTO suppliers (name, email, phone, address) VALUES (?, ?, ?, ?)"
    )
    .bind(&supplier.name)
    .bind(&supplier.email)
    .bind(&supplier.phone)
    .bind(&supplier.address)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    let id = result.last_insert_rowid();
    
    // Create corresponding account in Chart of Accounts
    let account_code = format!("2001-{}", id);
    sqlx::query(
        "INSERT INTO chart_of_accounts (account_code, account_name, account_type, account_group, description) 
         VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&account_code)
    .bind(&supplier.name)
    .bind("Liability")
    .bind("Accounts Payable")
    .bind("Supplier account")
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    sqlx::query_as::<_, Supplier>("SELECT * FROM suppliers WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_supplier(
    pool: State<'_, SqlitePool>,
    id: i64,
    supplier: CreateSupplier,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE suppliers SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?"
    )
    .bind(&supplier.name)
    .bind(&supplier.email)
    .bind(&supplier.phone)
    .bind(&supplier.address)
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    // Update corresponding account in Chart of Accounts
    let account_code = format!("2001-{}", id);
    sqlx::query(
        "UPDATE chart_of_accounts SET account_name = ?, updated_at = CURRENT_TIMESTAMP WHERE account_code = ?"
    )
    .bind(&supplier.name)
    .bind(&account_code)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn delete_supplier(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE suppliers SET is_active = 0 WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    // Delete corresponding account from chart of accounts
    let account_code = format!("2001-{}", id);
    sqlx::query("UPDATE chart_of_accounts SET is_active = 0 WHERE account_code = ?")
        .bind(&account_code)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

// ============= CHART OF ACCOUNTS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ChartOfAccount {
    pub id: i64,
    pub account_code: String,
    pub account_name: String,
    pub account_type: String,
    pub account_group: String,
    pub description: Option<String>,
    pub opening_balance: f64,
    pub is_active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateChartOfAccount {
    pub account_code: String,
    pub account_name: String,
    pub account_type: String,
    pub account_group: String,
    pub description: Option<String>,
    pub opening_balance: Option<f64>,
}

#[tauri::command]
pub async fn get_chart_of_accounts(pool: State<'_, SqlitePool>) -> Result<Vec<ChartOfAccount>, String> {
    sqlx::query_as::<_, ChartOfAccount>(
        "SELECT * FROM chart_of_accounts WHERE is_active = 1 ORDER BY account_code ASC"
    )
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_chart_of_account(
    pool: State<'_, SqlitePool>,
    account: CreateChartOfAccount,
) -> Result<ChartOfAccount, String> {
    let opening_balance = account.opening_balance.unwrap_or(0.0);
    
    let result = sqlx::query(
        "INSERT INTO chart_of_accounts (account_code, account_name, account_type, account_group, description, opening_balance) 
         VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&account.account_code)
    .bind(&account.account_name)
    .bind(&account.account_type)
    .bind(&account.account_group)
    .bind(&account.description)
    .bind(opening_balance)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    let id = result.last_insert_rowid();
    
    sqlx::query_as::<_, ChartOfAccount>(
        "SELECT * FROM chart_of_accounts WHERE id = ?"
    )
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_chart_of_account(
    pool: State<'_, SqlitePool>,
    id: i64,
    account: CreateChartOfAccount,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE chart_of_accounts 
         SET account_code = ?, account_name = ?, account_type = ?, account_group = ?, description = ?, opening_balance = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?"
    )
    .bind(&account.account_code)
    .bind(&account.account_name)
    .bind(&account.account_type)
    .bind(&account.account_group)
    .bind(&account.description)
    .bind(account.opening_balance.unwrap_or(0.0))
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn delete_chart_of_account(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    // Get the account to check if it's a default account
    let account = sqlx::query_as::<_, ChartOfAccount>(
        "SELECT * FROM chart_of_accounts WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Account not found".to_string())?;
    
    // List of default account codes that cannot be deleted
    let default_codes = vec!["1001", "1002", "1003", "2001", "3001", "4001", "4002", "5001", "5002", "5003"];
    
    if default_codes.contains(&account.account_code.as_str()) {
        return Err("Cannot delete default accounts".to_string());
    }
    
    // Check if account is linked to a customer (code pattern: 1003-{customer_id})
    if account.account_code.starts_with("1003-") {
        let customer_id_str = account.account_code.strip_prefix("1003-").unwrap_or("");
        if let Ok(customer_id) = customer_id_str.parse::<i64>() {
            let customer_exists = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM customers WHERE id = ? AND is_active = 1"
            )
            .bind(customer_id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;
            
            if customer_exists > 0 {
                return Err("Cannot delete account linked to an active customer. Delete the customer first.".to_string());
            }
        }
    }
    
    // Check if account is linked to a supplier (code pattern: 2001-{supplier_id})
    if account.account_code.starts_with("2001-") {
        let supplier_id_str = account.account_code.strip_prefix("2001-").unwrap_or("");
        if let Ok(supplier_id) = supplier_id_str.parse::<i64>() {
            let supplier_exists = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM suppliers WHERE id = ? AND is_active = 1"
            )
            .bind(supplier_id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;
            
            if supplier_exists > 0 {
                return Err("Cannot delete account linked to an active supplier. Delete the supplier first.".to_string());
            }
        }
    }
    
    sqlx::query("UPDATE chart_of_accounts SET is_active = 0 WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_account_types() -> Result<Vec<String>, String> {
    Ok(vec![
        "Asset".to_string(),
        "Liability".to_string(),
        "Equity".to_string(),
        "Income".to_string(),
        "Expense".to_string(),
    ])
}

#[tauri::command]
pub async fn get_account_groups(pool: State<'_, SqlitePool>) -> Result<Vec<String>, String> {
    let groups = sqlx::query_scalar::<_, String>(
        "SELECT name FROM account_groups WHERE is_active = 1 ORDER BY account_type, name ASC"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(groups)
}

// ============= ACCOUNT GROUPS MANAGEMENT =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct AccountGroup {
    pub id: i64,
    pub name: String,
    pub account_type: String,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateAccountGroup {
    pub name: String,
    pub account_type: String,
}

#[tauri::command]
pub async fn get_all_account_groups(pool: State<'_, SqlitePool>) -> Result<Vec<AccountGroup>, String> {
    sqlx::query_as::<_, AccountGroup>(
        "SELECT * FROM account_groups WHERE is_active = 1 ORDER BY account_type, name ASC"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_account_group(
    pool: State<'_, SqlitePool>,
    group: CreateAccountGroup,
) -> Result<AccountGroup, String> {
    let result = sqlx::query(
        "INSERT INTO account_groups (name, account_type) VALUES (?, ?)"
    )
    .bind(&group.name)
    .bind(&group.account_type)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    let id = result.last_insert_rowid();
    
    sqlx::query_as::<_, AccountGroup>("SELECT * FROM account_groups WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_account_group(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE account_groups SET is_active = 0 WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}