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

// ============= PURCHASE INVOICE =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PurchaseInvoice {
    pub id: i64,
    pub voucher_no: String,
    pub voucher_date: String,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub reference: Option<String>,
    pub total_amount: f64,
    pub tax_amount: f64,
    pub grand_total: f64,
    pub narration: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PurchaseInvoiceItem {
    pub id: i64,
    pub voucher_id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub waste_per_unit: f64,
    pub final_quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub tax_rate: f64,
    pub tax_amount: f64,
}

#[derive(Deserialize)]
pub struct CreatePurchaseInvoiceItem {
    pub product_id: i64,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub rate: f64,
    pub tax_rate: f64,
}

#[derive(Deserialize)]
pub struct CreatePurchaseInvoice {
    pub supplier_id: i64,
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub items: Vec<CreatePurchaseInvoiceItem>,
}

async fn get_next_voucher_number(pool: &SqlitePool, voucher_type: &str) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    
    let seq = sqlx::query_as::<_, (String, i64)>(
        "SELECT prefix, next_number FROM voucher_sequences WHERE voucher_type = ?"
    )
    .bind(voucher_type)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    
    let voucher_no = format!("{}-{:04}", seq.0, seq.1);
    
    sqlx::query("UPDATE voucher_sequences SET next_number = next_number + 1 WHERE voucher_type = ?")
        .bind(voucher_type)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    
    tx.commit().await.map_err(|e| e.to_string())?;
    
    Ok(voucher_no)
}

#[tauri::command]
pub async fn get_purchase_invoices(pool: State<'_, SqlitePool>) -> Result<Vec<PurchaseInvoice>, String> {
    let invoices = sqlx::query_as::<_, PurchaseInvoice>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as supplier_id,
            s.name as supplier_name,
            v.reference,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total,
            v.narration,
            v.status,
            v.created_at
        FROM vouchers v
        LEFT JOIN suppliers s ON v.party_id = s.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.voucher_type = 'purchase_invoice'
        GROUP BY v.id
        ORDER BY v.voucher_date DESC, v.id DESC"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(invoices)
}

#[tauri::command]
pub async fn get_purchase_invoice(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<PurchaseInvoice, String> {
    let invoice = sqlx::query_as::<_, PurchaseInvoice>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as supplier_id,
            s.name as supplier_name,
            v.reference,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total,
            v.narration,
            v.status,
            v.created_at
        FROM vouchers v
        LEFT JOIN suppliers s ON v.party_id = s.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.id = ? AND v.voucher_type = 'purchase_invoice'
        GROUP BY v.id"
    )
    .bind(id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(invoice)
}

#[tauri::command]
pub async fn get_purchase_invoice_items(
    pool: State<'_, SqlitePool>,
    voucher_id: i64,
) -> Result<Vec<PurchaseInvoiceItem>, String> {
    let items = sqlx::query_as::<_, PurchaseInvoiceItem>(
        "SELECT 
            vi.id,
            vi.voucher_id,
            vi.product_id,
            p.name as product_name,
            vi.description,
            vi.initial_quantity,
            vi.count,
            vi.deduction_per_unit,
            vi.final_quantity,
            vi.rate,
            vi.amount,
            vi.tax_rate,
            vi.tax_amount
        FROM voucher_items vi
        LEFT JOIN products p ON vi.product_id = p.id
        WHERE vi.voucher_id = ?"
    )
    .bind(voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(items)
}

#[tauri::command]
pub async fn create_purchase_invoice(
    pool: State<'_, SqlitePool>,
    invoice: CreatePurchaseInvoice,
) -> Result<i64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    
    // Generate voucher number
    let voucher_no = get_next_voucher_number(pool.inner(), "purchase_invoice").await?;
    
    // Calculate totals
    let mut total_amount = 0.0;
    
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        
        total_amount += amount;
    }
    
    // Create voucher
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, party_id, party_type, reference, total_amount, narration, status)
         VALUES (?, 'purchase_invoice', ?, ?, 'supplier', ?, ?, ?, 'draft')"
    )
    .bind(&voucher_no)
    .bind(&invoice.voucher_date)
    .bind(invoice.supplier_id)
    .bind(&invoice.reference)
    .bind(total_amount)
    .bind(&invoice.narration)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    
    let voucher_id = result.last_insert_rowid();
    
    // Insert items
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        let tax_amount = amount * (item.tax_rate / 100.0);
        
        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, rate, amount, tax_rate, tax_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(voucher_id)
        .bind(item.product_id)
        .bind(&item.description)
        .bind(item.initial_quantity)
        .bind(item.count)
        .bind(item.deduction_per_unit)
        .bind(final_qty)
        .bind(item.rate)
        .bind(amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    
    // ============= CREATE JOURNAL ENTRIES =============
    
    let supplier_id = invoice.supplier_id;
    
    // Calculate total tax
    let total_tax: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(tax_amount), 0) FROM voucher_items WHERE voucher_id = ?"
    )
    .bind(voucher_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    
    let grand_total = total_amount + total_tax;
    
    // Get account IDs
    let purchases_account: i64 = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE account_code = '5001'"
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    
    let tax_account: i64 = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE account_code = '1005'"
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    
    let supplier_account_code = format!("2001-{}", supplier_id);
    let supplier_account: i64 = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE account_code = ?"
    )
    .bind(&supplier_account_code)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| format!("Supplier account not found: {}", e))?;
    
    // Debit: Purchases Account
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, 'Purchase of goods')"
    )
    .bind(voucher_id)
    .bind(purchases_account)
    .bind(total_amount)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    
    // Debit: Tax Receivable (GST Input)
    if total_tax > 0.0 {
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, 'Input tax on purchases')"
        )
        .bind(voucher_id)
        .bind(tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    
    // Credit: Accounts Payable (Supplier)
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, 0, ?, 'Amount payable to supplier')"
    )
    .bind(voucher_id)
    .bind(supplier_account)
    .bind(grand_total)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    
    // Create stock movements
    let items_for_stock: Vec<(i64, f64, f64, f64)> = sqlx::query_as(
        "SELECT product_id, final_quantity, rate, amount FROM voucher_items WHERE voucher_id = ?"
    )
    .bind(voucher_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    
    for item in items_for_stock {
        sqlx::query(
            "INSERT INTO stock_movements (voucher_id, product_id, movement_type, quantity, rate, amount)
             VALUES (?, ?, 'IN', ?, ?, ?)"
        )
        .bind(voucher_id)
        .bind(item.0)
        .bind(item.1)
        .bind(item.2)
        .bind(item.3)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    
    tx.commit().await.map_err(|e| e.to_string())?;
    
    Ok(voucher_id)
}

#[tauri::command]
pub async fn delete_purchase_invoice(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<(), String> {
    sqlx::query("DELETE FROM vouchers WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

// ============= PAYMENT COMMANDS =============

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PaymentVoucher {
    pub id: i64,
    pub voucher_no: String,
    pub voucher_date: String,
    pub account_id: i64,
    pub account_name: String,
    pub payment_method: String, // 'cash' or 'bank'
    pub reference_number: Option<String>,
    pub total_amount: f64,
    pub tax_amount: f64,
    pub grand_total: f64,
    pub narration: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PaymentItem {
    pub id: i64,
    pub voucher_id: i64,
    pub description: String,
    pub amount: f64,
    pub tax_rate: f64,
    pub tax_amount: f64,
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct CreatePaymentItem {
    pub description: String,
    pub amount: f64,
    pub tax_rate: f64,
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct CreatePayment {
    pub account_id: i64,
    pub voucher_date: String,
    pub payment_method: String, // 'cash' or 'bank'
    pub reference_number: Option<String>,
    pub narration: Option<String>,
    pub items: Vec<CreatePaymentItem>,
}

#[tauri::command]
pub async fn create_payment(
    pool: State<'_, SqlitePool>,
    payment: CreatePayment,
) -> Result<i64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    
    // Generate voucher number
    let voucher_no = get_next_voucher_number(&pool, "payment").await?;
    
    // Calculate totals
    let mut total_amount = 0.0;
    let mut total_tax = 0.0;
    
    for item in &payment.items {
        total_amount += item.amount;
        total_tax += item.amount * (item.tax_rate / 100.0);
    }
    
    let grand_total = total_amount + total_tax;
    
    // Create voucher
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, party_id, party_type, reference, total_amount, narration, status, metadata)
         VALUES (?, 'payment', ?, ?, 'account', ?, ?, ?, 'draft', ?)"
    )
    .bind(&voucher_no)
    .bind(&payment.voucher_date)
    .bind(payment.account_id)
    .bind(&payment.reference_number)
    .bind(total_amount)
    .bind(&payment.narration)
    .bind(format!(r#"{{"method":"{}"}}"#, payment.payment_method))
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    
    let voucher_id = result.last_insert_rowid();
    
    // Insert items
    for item in &payment.items {
        let tax_amount = item.amount * (item.tax_rate / 100.0);
        
        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, description, amount, tax_rate, tax_amount)
             VALUES (?, ?, ?, ?, ?)"
        )
        .bind(voucher_id)
        .bind(&item.description)
        .bind(item.amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    
    // Create journal entries
    let account_id = payment.account_id;
    
    // Get or create cash/bank account
    let cash_account: Option<i64> = if payment.payment_method == "cash" {
        sqlx::query_scalar(
            "SELECT id FROM chart_of_accounts WHERE account_code = '1001'"
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query_scalar(
            "SELECT id FROM chart_of_accounts WHERE account_code = '1002'"
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
    };
    
    if let Some(cash_acc) = cash_account {
        // Credit: Cash/Bank Account
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, 0, ?, 'Payment made')"
        )
        .bind(voucher_id)
        .bind(cash_acc)
        .bind(grand_total)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    
    // Debit: Expense/Payee Account
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, 'Payment for expenses')"
    )
    .bind(voucher_id)
    .bind(account_id)
    .bind(total_amount)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    
    // Debit: Tax Account if applicable
    if total_tax > 0.0 {
        let tax_account: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM chart_of_accounts WHERE account_code = '1005'"
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        
        if let Some(tax_acc) = tax_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0, 'Tax on payment')"
            )
            .bind(voucher_id)
            .bind(tax_acc)
            .bind(total_tax)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    
    tx.commit().await.map_err(|e| e.to_string())?;
    
    Ok(voucher_id)
}

#[tauri::command]
pub async fn get_payments(pool: State<'_, SqlitePool>) -> Result<Vec<PaymentVoucher>, String> {
    let payments = sqlx::query_as::<_, PaymentVoucher>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as account_id,
            coa.name as account_name,
            json_extract(v.metadata, '$.method') as payment_method,
            v.reference,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total,
            v.narration,
            v.status,
            v.created_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.voucher_type = 'payment'
        GROUP BY v.id
        ORDER BY v.voucher_date DESC, v.id DESC"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(payments)
}

#[tauri::command]
pub async fn delete_payment(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<(), String> {
    sqlx::query("DELETE FROM vouchers WHERE id = ? AND voucher_type = 'payment'")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

// ============= RECEIPT COMMANDS =============

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ReceiptVoucher {
    pub id: i64,
    pub voucher_no: String,
    pub voucher_date: String,
    pub account_id: i64,
    pub account_name: String,
    pub receipt_method: String, // 'cash' or 'bank'
    pub reference_number: Option<String>,
    pub total_amount: f64,
    pub tax_amount: f64,
    pub grand_total: f64,
    pub narration: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ReceiptItem {
    pub id: i64,
    pub voucher_id: i64,
    pub description: String,
    pub amount: f64,
    pub tax_rate: f64,
    pub tax_amount: f64,
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateReceiptItem {
    pub description: String,
    pub amount: f64,
    pub tax_rate: f64,
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateReceipt {
    pub account_id: i64,
    pub voucher_date: String,
    pub receipt_method: String, // 'cash' or 'bank'
    pub reference_number: Option<String>,
    pub narration: Option<String>,
    pub items: Vec<CreateReceiptItem>,
}

#[tauri::command]
pub async fn create_receipt(
    pool: State<'_, SqlitePool>,
    receipt: CreateReceipt,
) -> Result<i64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    
    // Generate voucher number
    let voucher_no = get_next_voucher_number(&pool, "receipt").await?;
    
    // Calculate totals
    let mut total_amount = 0.0;
    let mut total_tax = 0.0;
    
    for item in &receipt.items {
        total_amount += item.amount;
        total_tax += item.amount * (item.tax_rate / 100.0);
    }
    
    let grand_total = total_amount + total_tax;
    
    // Create voucher
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, party_id, party_type, reference, total_amount, narration, status, metadata)
         VALUES (?, 'receipt', ?, ?, 'account', ?, ?, ?, 'draft', ?)"
    )
    .bind(&voucher_no)
    .bind(&receipt.voucher_date)
    .bind(receipt.account_id)
    .bind(&receipt.reference_number)
    .bind(total_amount)
    .bind(&receipt.narration)
    .bind(format!(r#"{{"method":"{}"}}"#, receipt.receipt_method))
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    
    let voucher_id = result.last_insert_rowid();
    
    // Insert items
    for item in &receipt.items {
        let tax_amount = item.amount * (item.tax_rate / 100.0);
        
        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, description, amount, tax_rate, tax_amount)
             VALUES (?, ?, ?, ?, ?)"
        )
        .bind(voucher_id)
        .bind(&item.description)
        .bind(item.amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    
    // Create journal entries
    let account_id = receipt.account_id;
    
    // Get or create cash/bank account
    let cash_account: Option<i64> = if receipt.receipt_method == "cash" {
        sqlx::query_scalar(
            "SELECT id FROM chart_of_accounts WHERE account_code = '1001'"
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query_scalar(
            "SELECT id FROM chart_of_accounts WHERE account_code = '1002'"
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
    };
    
    if let Some(cash_acc) = cash_account {
        // Debit: Cash/Bank Account
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, 'Receipt received')"
        )
        .bind(voucher_id)
        .bind(cash_acc)
        .bind(grand_total)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    
    // Credit: Income/Payer Account
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, 0, ?, 'Receipt from income')"
    )
    .bind(voucher_id)
    .bind(account_id)
    .bind(total_amount)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;
    
    // Credit: Tax Account if applicable
    if total_tax > 0.0 {
        let tax_account: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM chart_of_accounts WHERE account_code = '1005'"
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
        
        if let Some(tax_acc) = tax_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, 0, ?, 'Tax on receipt')"
            )
            .bind(voucher_id)
            .bind(tax_acc)
            .bind(total_tax)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }
    
    tx.commit().await.map_err(|e| e.to_string())?;
    
    Ok(voucher_id)
}

#[tauri::command]
pub async fn get_receipts(pool: State<'_, SqlitePool>) -> Result<Vec<ReceiptVoucher>, String> {
    let receipts = sqlx::query_as::<_, ReceiptVoucher>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as account_id,
            coa.name as account_name,
            json_extract(v.metadata, '$.method') as receipt_method,
            v.reference,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total,
            v.narration,
            v.status,
            v.created_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.voucher_type = 'receipt'
        GROUP BY v.id
        ORDER BY v.voucher_date DESC, v.id DESC"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;
    
    Ok(receipts)
}

#[tauri::command]
pub async fn delete_receipt(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<(), String> {
    sqlx::query("DELETE FROM vouchers WHERE id = ? AND voucher_type = 'receipt'")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}