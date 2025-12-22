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
pub async fn create_unit(pool: State<'_, SqlitePool>, unit: CreateUnit) -> Result<Unit, String> {
    let result = sqlx::query("INSERT INTO units (name, symbol) VALUES (?, ?)")
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
    sqlx::query("UPDATE units SET name = ?, symbol = ? WHERE id = ?")
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
         ORDER BY created_at DESC",
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
         VALUES (?, ?, ?, ?, ?, ?)",
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
         FROM products WHERE id = ?",
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
         WHERE id = ?",
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
    // Check for references in voucher_items
    let ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM voucher_items WHERE product_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if ref_count > 0 {
        return Err("Cannot delete product as it is referenced in vouchers.".to_string());
    }

    // Check for references in stock_movements
    let stock_ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements WHERE product_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if stock_ref_count > 0 {
        return Err("Cannot delete product as it has stock movement records.".to_string());
    }

    sqlx::query(
        "UPDATE products 
         SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, is_active = 0 
         WHERE id = ?",
    )
    .bind(deleted_by)
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_deleted_products(pool: State<'_, SqlitePool>) -> Result<Vec<Product>, String> {
    sqlx::query_as::<_, Product>(
        "SELECT id, code, name, unit_id, purchase_rate, sales_rate, mrp, is_active, created_at 
         FROM products
         WHERE deleted_at IS NOT NULL 
         ORDER BY deleted_at DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_product(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query(
        "UPDATE products 
         SET deleted_at = NULL, deleted_by = NULL, is_active = 1 
         WHERE id = ?",
    )
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_product(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    // Reference checks (same as soft delete)
    let ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM voucher_items WHERE product_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if ref_count > 0 {
        return Err(
            "Cannot permanently delete product as it is referenced in vouchers.".to_string(),
        );
    }

    let stock_ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements WHERE product_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if stock_ref_count > 0 {
        return Err(
            "Cannot permanently delete product as it has stock movement records.".to_string(),
        );
    }

    sqlx::query("DELETE FROM products WHERE id = ?")
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
    pub deleted_at: Option<String>,
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
    sqlx::query_as::<_, Customer>(
        "SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY name ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_customer(
    pool: State<'_, SqlitePool>,
    customer: CreateCustomer,
) -> Result<Customer, String> {
    let result =
        sqlx::query("INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)")
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
    sqlx::query("UPDATE customers SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?")
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
    // Check for references in vouchers
    let voucher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vouchers WHERE party_id = ? AND party_type = 'customer' AND deleted_at IS NULL")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if voucher_count > 0 {
        return Err("Cannot delete customer as they have associated vouchers.".to_string());
    }

    // Check for journal entries in the corresponding COA
    let account_code = format!("1003-{}", id);
    let journal_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM journal_entries WHERE account_id = (SELECT id FROM chart_of_accounts WHERE account_code = ?)",
    )
    .bind(&account_code)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err("Cannot delete customer as their account has ledger entries.".to_string());
    }

    sqlx::query("UPDATE customers SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    // Delete corresponding account from chart of accounts
    sqlx::query(
        "UPDATE chart_of_accounts SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE account_code = ?",
    )
    .bind(&account_code)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_deleted_customers(pool: State<'_, SqlitePool>) -> Result<Vec<Customer>, String> {
    sqlx::query_as::<_, Customer>(
        "SELECT * FROM customers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_customer(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE customers SET is_active = 1, deleted_at = NULL WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let account_code = format!("1003-{}", id);
    sqlx::query(
        "UPDATE chart_of_accounts SET is_active = 1, deleted_at = NULL WHERE account_code = ?",
    )
    .bind(&account_code)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_customer(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    // Reference checks (same as soft delete)
    let voucher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vouchers WHERE party_id = ? AND party_type = 'customer' AND deleted_at IS NULL")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if voucher_count > 0 {
        return Err(
            "Cannot permanently delete customer as they have associated vouchers.".to_string(),
        );
    }

    let account_code = format!("1003-{}", id);
    let journal_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM journal_entries WHERE account_id = (SELECT id FROM chart_of_accounts WHERE account_code = ?)",
    )
    .bind(&account_code)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err(
            "Cannot permanently delete customer as their account has ledger entries.".to_string(),
        );
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM customers WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM chart_of_accounts WHERE account_code = ?")
        .bind(&account_code)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

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
    pub deleted_at: Option<String>,
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
    sqlx::query_as::<_, Supplier>(
        "SELECT * FROM suppliers WHERE deleted_at IS NULL ORDER BY name ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_supplier(
    pool: State<'_, SqlitePool>,
    supplier: CreateSupplier,
) -> Result<Supplier, String> {
    let result =
        sqlx::query("INSERT INTO suppliers (name, email, phone, address) VALUES (?, ?, ?, ?)")
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
    sqlx::query("UPDATE suppliers SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?")
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
    // Check for references in vouchers
    let voucher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vouchers WHERE party_id = ? AND party_type = 'supplier' AND deleted_at IS NULL")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if voucher_count > 0 {
        return Err("Cannot delete supplier as they have associated vouchers.".to_string());
    }

    // Check for journal entries in the corresponding COA
    let account_code = format!("2001-{}", id);
    let journal_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM journal_entries WHERE account_id = (SELECT id FROM chart_of_accounts WHERE account_code = ?)",
    )
    .bind(&account_code)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err("Cannot delete supplier as their account has ledger entries.".to_string());
    }

    sqlx::query("UPDATE suppliers SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    // Delete corresponding account from chart of accounts
    sqlx::query(
        "UPDATE chart_of_accounts SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE account_code = ?",
    )
    .bind(&account_code)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_deleted_suppliers(pool: State<'_, SqlitePool>) -> Result<Vec<Supplier>, String> {
    sqlx::query_as::<_, Supplier>(
        "SELECT * FROM suppliers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_supplier(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE suppliers SET is_active = 1, deleted_at = NULL WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let account_code = format!("2001-{}", id);
    sqlx::query(
        "UPDATE chart_of_accounts SET is_active = 1, deleted_at = NULL WHERE account_code = ?",
    )
    .bind(&account_code)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_supplier(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    // Reference checks (same as soft delete)
    let voucher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vouchers WHERE party_id = ? AND party_type = 'supplier' AND deleted_at IS NULL")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if voucher_count > 0 {
        return Err(
            "Cannot permanently delete supplier as they have associated vouchers.".to_string(),
        );
    }

    let account_code = format!("2001-{}", id);
    let journal_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM journal_entries WHERE account_id = (SELECT id FROM chart_of_accounts WHERE account_code = ?)",
    )
    .bind(&account_code)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err(
            "Cannot permanently delete supplier as their account has ledger entries.".to_string(),
        );
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM suppliers WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM chart_of_accounts WHERE account_code = ?")
        .bind(&account_code)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

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
    pub opening_balance_type: String,
    pub is_active: i64,
    pub deleted_at: Option<String>,
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
    pub opening_balance_type: Option<String>,
}

#[tauri::command]
pub async fn get_chart_of_accounts(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ChartOfAccount>, String> {
    sqlx::query_as::<_, ChartOfAccount>(
        "SELECT id, account_code, account_name, account_type, account_group, description, CAST(opening_balance AS REAL) as opening_balance, opening_balance_type, is_active, deleted_at, created_at, updated_at FROM chart_of_accounts WHERE deleted_at IS NULL ORDER BY account_code ASC"
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
    let opening_balance_type = account
        .opening_balance_type
        .unwrap_or_else(|| "Dr".to_string());

    let result = sqlx::query(
        "INSERT INTO chart_of_accounts (account_code, account_name, account_type, account_group, description, opening_balance, opening_balance_type) 
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&account.account_code)
    .bind(&account.account_name)
    .bind(&account.account_type)
    .bind(&account.account_group)
    .bind(&account.description)
    .bind(opening_balance)
    .bind(&opening_balance_type)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let id = result.last_insert_rowid();

    // If opening balance is provided, create voucher and journal entries
    if opening_balance > 0.0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        // Get next voucher number
        let voucher_no = get_next_voucher_number(&pool, "opening_balance").await?;

        // Create voucher entry
        let voucher_result = sqlx::query(
            "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, reference, narration, status)
             VALUES (?, ?, ?, ?, ?, 'posted')"
        )
        .bind(&voucher_no)
        .bind("opening_balance")
        .bind("2025-12-21")
        .bind(format!("Opening balance for {}", account.account_name))
        .bind(format!("Initial balance for account: {}", account.account_name))
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let voucher_id = voucher_result.last_insert_rowid();

        // Find Opening Balance Adjustment account (code 3004)
        let ob_account = sqlx::query_as::<_, (i64,)>(
            "SELECT id FROM chart_of_accounts WHERE account_code = '3004' LIMIT 1",
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Opening Balance Adjustment account not found".to_string())?;

        let ob_account_id = ob_account.0;

        // Create journal entry for the account
        if opening_balance_type == "Dr" {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
                 VALUES (?, ?, ?, ?, ?, 0)"
            )
            .bind(voucher_id)
            .bind(id)
            .bind(opening_balance)
            .bind(0.0)
            .bind(format!("Opening balance: {}", account.account_name))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            // Create balancing entry in Opening Balance Adjustment account
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
                 VALUES (?, ?, ?, ?, ?, 0)"
            )
            .bind(voucher_id)
            .bind(ob_account_id)
            .bind(0.0)
            .bind(opening_balance)
            .bind("Auto-generated balancing entry")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        } else {
            // Credit balance
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
                 VALUES (?, ?, ?, ?, ?, 0)"
            )
            .bind(voucher_id)
            .bind(id)
            .bind(0.0)
            .bind(opening_balance)
            .bind(format!("Opening balance: {}", account.account_name))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            // Create balancing entry in Opening Balance Adjustment account
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
                 VALUES (?, ?, ?, ?, ?, 0)"
            )
            .bind(voucher_id)
            .bind(ob_account_id)
            .bind(opening_balance)
            .bind(0.0)
            .bind("Auto-generated balancing entry")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }

        tx.commit().await.map_err(|e| e.to_string())?;
    }

    sqlx::query_as::<_, ChartOfAccount>("SELECT * FROM chart_of_accounts WHERE id = ?")
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
    let opening_balance_type = account
        .opening_balance_type
        .unwrap_or_else(|| "Dr".to_string());

    sqlx::query(
        "UPDATE chart_of_accounts 
         SET account_code = ?, account_name = ?, account_type = ?, account_group = ?, description = ?, opening_balance = ?, opening_balance_type = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?"
    )
    .bind(&account.account_code)
    .bind(&account.account_name)
    .bind(&account.account_type)
    .bind(&account.account_group)
    .bind(&account.description)
    .bind(account.opening_balance.unwrap_or(0.0))
    .bind(&opening_balance_type)
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_chart_of_account(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    // Get the account to check if it's a default account
    let account =
        sqlx::query_as::<_, ChartOfAccount>("SELECT * FROM chart_of_accounts WHERE id = ?")
            .bind(id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Account not found".to_string())?;

    // List of default account codes that cannot be deleted
    let default_codes = vec![
        "1001", "1002", "1003", "2001", "3001", "4001", "4002", "5001", "5002", "5003",
    ];

    if default_codes.contains(&account.account_code.as_str()) {
        return Err("Cannot delete default accounts".to_string());
    }

    // Check for references in journal_entries
    let journal_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM journal_entries WHERE account_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err("Cannot delete account as it has associated journal entries.".to_string());
    }

    // Check for references in opening_balances
    let ob_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM opening_balances WHERE account_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if ob_count > 0 {
        return Err("Cannot delete account as it has opening balance records.".to_string());
    }

    // Check if account is linked to a customer (code pattern: 1003-{customer_id})
    if account.account_code.starts_with("1003-") {
        let customer_id_str = account.account_code.strip_prefix("1003-").unwrap_or("");
        if let Ok(customer_id) = customer_id_str.parse::<i64>() {
            let customer_exists = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM customers WHERE id = ? AND is_active = 1",
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
                "SELECT COUNT(*) FROM suppliers WHERE id = ? AND is_active = 1",
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

    sqlx::query(
        "UPDATE chart_of_accounts SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_deleted_chart_of_accounts(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ChartOfAccount>, String> {
    sqlx::query_as::<_, ChartOfAccount>(
        "SELECT * FROM chart_of_accounts WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_chart_of_account(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE chart_of_accounts SET is_active = 1, deleted_at = NULL WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_chart_of_account(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<(), String> {
    // Reference checks (same as soft delete)
    let account =
        sqlx::query_as::<_, ChartOfAccount>("SELECT * FROM chart_of_accounts WHERE id = ?")
            .bind(id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Account not found".to_string())?;

    let default_codes = vec![
        "1001", "1002", "1003", "2001", "3001", "4001", "4002", "5001", "5002", "5003",
    ];

    if default_codes.contains(&account.account_code.as_str()) {
        return Err("Cannot permanently delete default accounts".to_string());
    }

    let journal_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM journal_entries WHERE account_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err(
            "Cannot permanently delete account as it has associated journal entries.".to_string(),
        );
    }

    let ob_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM opening_balances WHERE account_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if ob_count > 0 {
        return Err(
            "Cannot permanently delete account as it has opening balance records.".to_string(),
        );
    }

    sqlx::query("DELETE FROM chart_of_accounts WHERE id = ?")
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
        "SELECT name FROM account_groups WHERE is_active = 1 ORDER BY account_type, name ASC",
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
pub async fn get_all_account_groups(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<AccountGroup>, String> {
    sqlx::query_as::<_, AccountGroup>(
        "SELECT * FROM account_groups WHERE is_active = 1 ORDER BY account_type, name ASC",
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
    let result = sqlx::query("INSERT INTO account_groups (name, account_type) VALUES (?, ?)")
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

// ============= CASH & BANK ACCOUNTS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct CashBankAccount {
    pub id: i64,
    pub name: String,
}

#[tauri::command]
pub async fn get_cash_bank_accounts(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<CashBankAccount>, String> {
    sqlx::query_as::<_, CashBankAccount>(
        "SELECT id, account_name as name FROM chart_of_accounts WHERE is_active = 1 AND (account_group = 'Cash' OR account_group = 'Bank Account') ORDER BY account_code ASC"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

// ============= PURCHASE INVOICE =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PurchaseInvoice {
    pub id: i64,
    pub voucher_no: String,
    pub voucher_date: String,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub party_type: String,
    pub reference: Option<String>,
    pub total_amount: f64,
    pub tax_amount: f64,
    pub grand_total: f64,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub narration: Option<String>,
    pub status: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
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
    pub deduction_per_unit: f64,
    pub final_quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub tax_rate: f64,
    pub tax_amount: f64,
    pub remarks: Option<String>,
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
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct CreatePurchaseInvoice {
    pub supplier_id: i64,
    pub party_type: String,
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub items: Vec<CreatePurchaseInvoiceItem>,
}

async fn get_next_voucher_number(pool: &SqlitePool, voucher_type: &str) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let seq = sqlx::query_as::<_, (String, i64)>(
        "SELECT prefix, next_number FROM voucher_sequences WHERE voucher_type = ?",
    )
    .bind(voucher_type)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let voucher_no = format!("{}-{:04}", seq.0, seq.1);

    sqlx::query(
        "UPDATE voucher_sequences SET next_number = next_number + 1 WHERE voucher_type = ?",
    )
    .bind(voucher_type)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(voucher_no)
}

#[tauri::command]
pub async fn get_purchase_invoices(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<PurchaseInvoice>, String> {
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
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at
        FROM vouchers v
        LEFT JOIN suppliers s ON v.party_id = s.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.voucher_type = 'purchase_invoice'
        GROUP BY v.id
        ORDER BY v.voucher_date DESC, v.id DESC",
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
            COALESCE(s.name, c.name) as supplier_name,
            v.party_type,
            v.reference,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total,
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at
        FROM vouchers v
        LEFT JOIN suppliers s ON v.party_id = s.id AND v.party_type = 'supplier'
        LEFT JOIN customers c ON v.party_id = c.id AND v.party_type = 'customer'
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.id = ? AND v.voucher_type = 'purchase_invoice'
        GROUP BY v.id",
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
    sqlx::query_as::<_, PurchaseInvoiceItem>(
        "SELECT vi.*, p.name as product_name 
         FROM voucher_items vi
         JOIN products p ON vi.product_id = p.id
         WHERE vi.voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
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
    let mut subtotal = 0.0;

    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;

        subtotal += amount;
    }

    // Apply discounts
    let discount_amount = invoice.discount_amount.unwrap_or(0.0);
    let total_amount = subtotal - discount_amount;

    // Create voucher
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, party_id, party_type, reference, subtotal, discount_rate, discount_amount, total_amount, narration, status)
         VALUES (?, 'purchase_invoice', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted')"
    )
    .bind(&voucher_no)
    .bind(&invoice.voucher_date)
    .bind(invoice.supplier_id)
    .bind(&invoice.party_type)
    .bind(&invoice.reference)
    .bind(subtotal)
    .bind(invoice.discount_rate.unwrap_or(0.0))
    .bind(discount_amount)
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
            "INSERT INTO voucher_items (voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, rate, amount, tax_rate, tax_amount, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
        .bind(&item.remarks)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= CREATE JOURNAL ENTRIES =============

    let party_id = invoice.supplier_id;
    let party_type = invoice.party_type;

    // Calculate total tax
    let total_tax: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(tax_amount), 0) FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let grand_total = total_amount + total_tax;

    // Get account IDs
    let purchases_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5001'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let tax_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let party_account_code = if party_type == "supplier" {
        format!("2001-{}", party_id)
    } else {
        format!("1003-{}", party_id)
    };
    let party_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = ?")
            .bind(&party_account_code)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| format!("Supplier account not found: {}", e))?;

    // Debit: Purchases Account
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, 'Purchase of goods')",
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
             VALUES (?, ?, ?, 0, 'Input tax on purchases')",
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
         VALUES (?, ?, 0, ?, 'Amount payable to supplier')",
    )
    .bind(voucher_id)
    .bind(party_account)
    .bind(grand_total)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Discount Received (if discount applied)
    if discount_amount > 0.0 {
        let discount_account: i64 =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4004'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, 0, ?, 'Discount received from supplier')",
        )
        .bind(voucher_id)
        .bind(discount_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Create stock movements
    let items_for_stock: Vec<(i64, f64, f64, f64)> = sqlx::query_as(
        "SELECT product_id, final_quantity, rate, amount FROM voucher_items WHERE voucher_id = ?",
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
pub async fn delete_purchase_invoice(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'purchase_invoice'")
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
    pub deleted_at: Option<String>,
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

    // Create voucher metadata
    let metadata = serde_json::json!({ "method": payment.payment_method }).to_string();

    // Create voucher
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, party_id, party_type, reference, total_amount, metadata, narration, status)
         VALUES (?, 'payment', ?, ?, 'account', ?, ?, ?, ?, 'posted')"
    )
    .bind(&voucher_no)
    .bind(&payment.voucher_date)
    .bind(payment.account_id)
    .bind(&payment.reference_number)
    .bind(total_amount)
    .bind(metadata)
    .bind(&payment.narration)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let voucher_id = result.last_insert_rowid();

    // Insert items
    for item in &payment.items {
        let tax_amount = item.amount * (item.tax_rate / 100.0);

        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, description, amount, tax_rate, tax_amount, remarks, initial_quantity, count, rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(voucher_id)
        .bind(&item.description)
        .bind(item.amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .bind(&item.remarks)
        .bind(1.0)
        .bind(1.0)
        .bind(item.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Create journal entries
    // Credit: Cash/Bank Account (the account user selected to pay from)
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, 0, ?, 'Payment made')",
    )
    .bind(voucher_id)
    .bind(payment.account_id)
    .bind(grand_total)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Debit: Each Payee/Ledger Account from items
    for item in &payment.items {
        // Look up the account by name
        let payee_account: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM chart_of_accounts WHERE account_name = ? AND is_active = 1",
        )
        .bind(&item.description)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(payee_acc) = payee_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0, ?)",
            )
            .bind(voucher_id)
            .bind(payee_acc)
            .bind(item.amount)
            .bind(format!("Payment to {}", item.description))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    // Debit: Tax Account if applicable
    if total_tax > 0.0 {
        let tax_account: Option<i64> =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        if let Some(tax_acc) = tax_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0, 'Tax on payment')",
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
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.voucher_type = 'payment' AND v.deleted_at IS NULL
        GROUP BY v.id
        ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(payments)
}

#[tauri::command]
pub async fn get_payment_items(
    pool: State<'_, SqlitePool>,
    voucher_id: i64,
) -> Result<Vec<PaymentItem>, String> {
    let items = sqlx::query_as::<_, PaymentItem>(
        "SELECT 
            id,
            voucher_id,
            description,
            amount,
            tax_rate,
            tax_amount,
            remarks
        FROM voucher_items
        WHERE voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub async fn delete_payment(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'payment'")
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
    pub deleted_at: Option<String>,
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

    // Create voucher metadata
    let metadata = serde_json::json!({ "method": receipt.receipt_method }).to_string();

    // Create voucher
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, party_id, party_type, reference, total_amount, metadata, narration, status)
         VALUES (?, 'receipt', ?, ?, 'account', ?, ?, ?, ?, 'posted')"
    )
    .bind(&voucher_no)
    .bind(&receipt.voucher_date)
    .bind(receipt.account_id)
    .bind(&receipt.reference_number)
    .bind(total_amount)
    .bind(metadata)
    .bind(&receipt.narration)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let voucher_id = result.last_insert_rowid();

    // Insert items
    for item in &receipt.items {
        let tax_amount = item.amount * (item.tax_rate / 100.0);

        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, description, amount, tax_rate, tax_amount, remarks, initial_quantity, count, rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(voucher_id)
        .bind(&item.description)
        .bind(item.amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .bind(&item.remarks)
        .bind(1.0)
        .bind(1.0)
        .bind(item.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Create journal entries
    // Debit: Cash/Bank Account (the account user selected to receive payment)
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, 'Receipt received')",
    )
    .bind(voucher_id)
    .bind(receipt.account_id)
    .bind(grand_total)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Each Payer/Ledger Account from items
    for item in &receipt.items {
        // Look up the account by name
        let payer_account: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM chart_of_accounts WHERE account_name = ? AND is_active = 1",
        )
        .bind(&item.description)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(payer_acc) = payer_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, 0, ?, ?)",
            )
            .bind(voucher_id)
            .bind(payer_acc)
            .bind(item.amount)
            .bind(format!("Receipt from {}", item.description))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    // Credit: Tax Account if applicable
    if total_tax > 0.0 {
        let tax_account: Option<i64> =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        if let Some(tax_acc) = tax_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, 0, ?, 'Tax on receipt')",
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
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.voucher_type = 'receipt' AND v.deleted_at IS NULL
        GROUP BY v.id
        ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(receipts)
}

#[tauri::command]
pub async fn get_receipt_items(
    pool: State<'_, SqlitePool>,
    voucher_id: i64,
) -> Result<Vec<ReceiptItem>, String> {
    let items = sqlx::query_as::<_, ReceiptItem>(
        "SELECT 
            id,
            voucher_id,
            description,
            amount,
            tax_rate,
            tax_amount,
            remarks
        FROM voucher_items
        WHERE voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub async fn delete_receipt(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'receipt'")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============= JOURNAL ENTRY COMMANDS =============

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct JournalEntry {
    pub id: i64,
    pub voucher_no: String,
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub total_debit: f64,
    pub total_credit: f64,
    pub status: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct JournalEntryLine {
    pub id: i64,
    pub voucher_id: i64,
    pub account_id: i64,
    pub account_name: String,
    pub debit: f64,
    pub credit: f64,
    pub narration: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateJournalEntryLine {
    pub account_id: i64,
    pub debit: f64,
    pub credit: f64,
    pub narration: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateJournalEntry {
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub lines: Vec<CreateJournalEntryLine>,
}

#[tauri::command]
pub async fn create_journal_entry(
    pool: State<'_, SqlitePool>,
    entry: CreateJournalEntry,
) -> Result<i64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Generate voucher number
    let voucher_no = get_next_voucher_number(&pool, "journal").await?;

    // Calculate totals
    let total_debit: f64 = entry.lines.iter().map(|l| l.debit).sum();
    let total_credit: f64 = entry.lines.iter().map(|l| l.credit).sum();

    // Validate balanced entry
    let difference = (total_debit - total_credit).abs();
    if difference > 0.01 {
        return Err("Journal entry must be balanced (debits must equal credits)".to_string());
    }

    // Validate all lines
    for line in &entry.lines {
        if line.debit == 0.0 && line.credit == 0.0 {
            return Err("Each line must have either debit or credit amount".to_string());
        }
        if line.debit > 0.0 && line.credit > 0.0 {
            return Err("Each line cannot have both debit and credit amounts".to_string());
        }
    }

    // Create voucher
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, reference, total_amount, narration, status)
         VALUES (?, 'journal', ?, ?, ?, ?, 'posted')"
    )
    .bind(&voucher_no)
    .bind(&entry.voucher_date)
    .bind(&entry.reference)
    .bind(total_debit) // or total_credit, they should be equal
    .bind(&entry.narration)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let voucher_id = result.last_insert_rowid();

    // Insert journal entries
    for line in &entry.lines {
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, is_manual, narration)
             VALUES (?, ?, ?, ?, 1, ?)"
        )
        .bind(voucher_id)
        .bind(line.account_id)
        .bind(line.debit)
        .bind(line.credit)
        .bind(&line.narration)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(voucher_id)
}

#[tauri::command]
pub async fn get_journal_entries(pool: State<'_, SqlitePool>) -> Result<Vec<JournalEntry>, String> {
    let entries = sqlx::query_as::<_, JournalEntry>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.reference,
            v.narration,
            COALESCE(SUM(je.debit), 0) as total_debit,
            COALESCE(SUM(je.credit), 0) as total_credit,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN journal_entries je ON v.id = je.voucher_id
        WHERE v.voucher_type = 'journal' AND v.deleted_at IS NULL
        GROUP BY v.id
        ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(entries)
}

#[tauri::command]
pub async fn get_journal_entry(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<JournalEntry, String> {
    let entry = sqlx::query_as::<_, JournalEntry>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.reference,
            v.narration,
            COALESCE(SUM(je.debit), 0) as total_debit,
            COALESCE(SUM(je.credit), 0) as total_credit,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN journal_entries je ON v.id = je.voucher_id
        WHERE v.id = ? AND v.voucher_type = 'journal' AND v.deleted_at IS NULL
        GROUP BY v.id",
    )
    .bind(id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(entry)
}

#[tauri::command]
pub async fn get_journal_entry_lines(
    pool: State<'_, SqlitePool>,
    voucher_id: i64,
) -> Result<Vec<JournalEntryLine>, String> {
    let lines = sqlx::query_as::<_, JournalEntryLine>(
        "SELECT 
            je.id,
            je.voucher_id,
            je.account_id,
            coa.account_name,
            je.debit,
            je.credit,
            je.narration
        FROM journal_entries je
        LEFT JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE je.voucher_id = ? AND je.is_manual = 1
        ORDER BY je.id ASC",
    )
    .bind(voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(lines)
}

#[tauri::command]
pub async fn delete_journal_entry(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    // Check if this is a manual journal entry
    let voucher_type: String = sqlx::query_scalar("SELECT voucher_type FROM vouchers WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    if voucher_type != "journal" {
        return Err("Can only delete manual journal entries".to_string());
    }

    // Soft delete voucher
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============= OPENING BALANCE COMMANDS =============

#[derive(Serialize, Deserialize)]
pub struct OpeningBalanceLine {
    pub account_id: i64,
    pub account_name: String,
    pub debit: f64,
    pub credit: f64,
    pub narration: String,
}

#[derive(Deserialize)]
pub struct CreateOpeningBalance {
    pub form: serde_json::Value,
    pub lines: Vec<OpeningBalanceLine>,
}

#[tauri::command]
pub async fn create_opening_balance(
    pool: State<'_, SqlitePool>,
    entry: CreateOpeningBalance,
) -> Result<i64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get next voucher number
    let voucher_no = get_next_voucher_number(&pool, "opening_balance").await?;

    // Create voucher master record
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, reference, narration, status)
         VALUES (?, ?, ?, ?, ?, 'posted')"
    )
    .bind(&voucher_no)
    .bind("opening_balance")
    .bind(entry.form.get("voucher_date").and_then(|v| v.as_str()).unwrap_or(""))
    .bind(entry.form.get("reference").and_then(|v| v.as_str()).unwrap_or(""))
    .bind(entry.form.get("narration").and_then(|v| v.as_str()).unwrap_or(""))
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let voucher_id = result.last_insert_rowid();

    // Find Opening Balance Adjustment account (code 3004)
    let ob_account = sqlx::query_as::<_, (i64,)>(
        "SELECT id FROM chart_of_accounts WHERE account_code = '3004' LIMIT 1",
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Opening Balance Adjustment account not found".to_string())?;

    let ob_account_id = ob_account.0;

    // Insert journal entries for each line - create dual entries
    for line in entry.lines {
        // First entry: user's account with their debit/credit (auto-generated, not manual)
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
             VALUES (?, ?, ?, ?, ?, 0)"
        )
        .bind(voucher_id)
        .bind(line.account_id)
        .bind(line.debit)
        .bind(line.credit)
        .bind(&line.narration)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Second entry: balancing entry in Opening Balance Adjustment account (auto-generated)
        // If user has debit, this is credit (and vice versa)
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
             VALUES (?, ?, ?, ?, ?, 0)"
        )
        .bind(voucher_id)
        .bind(ob_account_id)
        .bind(line.credit)  // Reverse: credit becomes debit
        .bind(line.debit)   // Reverse: debit becomes credit
        .bind("Auto-generated balancing entry")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_id)
}

#[tauri::command]
pub async fn get_opening_balances(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<serde_json::Value>, String> {
    sqlx::query_as::<_, (i64, String)>(
        "SELECT v.id, v.voucher_no FROM vouchers v WHERE v.voucher_type = 'opening_balance' AND v.deleted_at IS NULL ORDER BY v.voucher_date DESC"
    )
    .fetch_all(pool.inner())
    .await
    .map(|rows| rows.into_iter().map(|(id, no)| serde_json::json!({"id": id, "voucher_no": no})).collect())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_opening_balance(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'opening_balance'")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============= SALES INVOICE =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct SalesInvoice {
    pub id: i64,
    pub voucher_no: String,
    pub voucher_date: String,
    pub customer_id: i64,
    pub customer_name: String,
    pub party_type: String,
    pub reference: Option<String>,
    pub total_amount: f64,
    pub tax_amount: f64,
    pub grand_total: f64,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub narration: Option<String>,
    pub status: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct SalesInvoiceItem {
    pub id: i64,
    pub voucher_id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub final_quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub tax_rate: f64,
    pub tax_amount: f64,
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateSalesInvoiceItem {
    pub product_id: i64,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub rate: f64,
    pub tax_rate: f64,
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateSalesInvoice {
    pub customer_id: i64,
    pub party_type: String,
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub items: Vec<CreateSalesInvoiceItem>,
}

#[tauri::command]
pub async fn get_sales_invoices(pool: State<'_, SqlitePool>) -> Result<Vec<SalesInvoice>, String> {
    sqlx::query_as::<_, SalesInvoice>(
        "SELECT v.*, 
                CASE 
                    WHEN v.party_type = 'customer' THEN c.name 
                    ELSE s.name 
                END as customer_name,
                v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total
         FROM vouchers v
         LEFT JOIN customers c ON v.party_id = c.id AND v.party_type = 'customer'
         LEFT JOIN suppliers s ON v.party_id = s.id AND v.party_type = 'supplier'
         LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
         WHERE v.voucher_type = 'sales_invoice' AND v.deleted_at IS NULL
         GROUP BY v.id
         ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sales_invoice(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<SalesInvoice, String> {
    let invoice = sqlx::query_as::<_, SalesInvoice>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as customer_id,
            COALESCE(c.name, s.name) as customer_name,
            v.party_type,
            v.reference,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total,
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN customers c ON v.party_id = c.id AND v.party_type = 'customer'
        LEFT JOIN suppliers s ON v.party_id = s.id AND v.party_type = 'supplier'
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.id = ? AND v.voucher_type = 'sales_invoice' AND v.deleted_at IS NULL
        GROUP BY v.id",
    )
    .bind(id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(invoice)
}

#[tauri::command]
pub async fn get_sales_invoice_items(
    pool: State<'_, SqlitePool>,
    voucher_id: i64,
) -> Result<Vec<SalesInvoiceItem>, String> {
    sqlx::query_as::<_, SalesInvoiceItem>(
        "SELECT vi.*, p.name as product_name
        FROM voucher_items vi
        LEFT JOIN products p ON vi.product_id = p.id
        WHERE vi.voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_sales_invoice(
    pool: State<'_, SqlitePool>,
    invoice: CreateSalesInvoice,
) -> Result<i64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Generate voucher number
    let voucher_no = get_next_voucher_number(pool.inner(), "sales_invoice").await?;

    // Calculate totals
    let mut subtotal = 0.0;

    for item in &invoice.items {
        let final_quantity = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_quantity * item.rate;
        subtotal += amount;
    }

    // Apply discounts
    let discount_amount = invoice.discount_amount.unwrap_or(0.0);
    let total_amount = subtotal - discount_amount;

    // Create voucher
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, party_id, party_type, reference, subtotal, discount_rate, discount_amount, total_amount, narration, status)
         VALUES (?, 'sales_invoice', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted')"
    )
    .bind(&voucher_no)
    .bind(&invoice.voucher_date)
    .bind(invoice.customer_id)
    .bind(&invoice.party_type)
    .bind(&invoice.reference)
    .bind(subtotal)
    .bind(invoice.discount_rate.unwrap_or(0.0))
    .bind(discount_amount)
    .bind(total_amount)
    .bind(&invoice.narration)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let voucher_id = result.last_insert_rowid();

    // Insert items
    for item in &invoice.items {
        let final_quantity = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_quantity * item.rate;
        let tax_amount = amount * (item.tax_rate / 100.0);

        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, rate, amount, tax_rate, tax_amount, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(voucher_id)
        .bind(item.product_id)
        .bind(&item.description)
        .bind(item.initial_quantity)
        .bind(item.count)
        .bind(item.deduction_per_unit)
        .bind(final_quantity)
        .bind(item.rate)
        .bind(amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .bind(&item.remarks)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= CREATE JOURNAL ENTRIES =============

    let party_id = invoice.customer_id;
    let party_type = invoice.party_type;

    // Calculate total tax
    let total_tax: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(tax_amount), 0) FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let grand_total = total_amount + total_tax;

    // Get account IDs
    let sales_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4001'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let tax_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '2002'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let party_account_code = if party_type == "customer" {
        format!("1003-{}", party_id)
    } else {
        format!("2001-{}", party_id)
    };

    let party_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = ?")
            .bind(&party_account_code)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| format!("Party account not found: {}", e))?;

    // Debit: Accounts Receivable/Payable (Party)
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, 'Amount receivable from/payable to party')",
    )
    .bind(voucher_id)
    .bind(party_account)
    .bind(grand_total)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Sales Account
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, 0, ?, 'Sales of goods')",
    )
    .bind(voucher_id)
    .bind(sales_account)
    .bind(total_amount)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Tax Payable (GST Output)
    if total_tax > 0.0 {
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, 0, ?, 'Output tax on sales')",
        )
        .bind(voucher_id)
        .bind(tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Debit: Discount Allowed (if discount applied)
    if discount_amount > 0.0 {
        let discount_account: i64 =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5007'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, 'Discount allowed to customer')",
        )
        .bind(voucher_id)
        .bind(discount_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Create stock movements (OUT)
    let items_for_stock: Vec<(i64, f64, f64, f64)> = sqlx::query_as(
        "SELECT product_id, final_quantity, rate, amount FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for item in items_for_stock {
        sqlx::query(
            "INSERT INTO stock_movements (voucher_id, product_id, movement_type, quantity, rate, amount)
             VALUES (?, ?, 'OUT', ?, ?, ?)"
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
pub async fn delete_sales_invoice(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'sales_invoice'")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============= REPORTS =============

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct TrialBalanceRow {
    pub account_code: String,
    pub account_name: String,
    pub debit: f64,
    pub credit: f64,
}

#[tauri::command]
pub async fn get_trial_balance(
    pool: State<'_, SqlitePool>,
    from_date: Option<String>,
    to_date: String,
) -> Result<Vec<TrialBalanceRow>, String> {
    let date_filter = if let Some(from) = from_date {
        format!(
            "AND v.voucher_date >= '{}' AND v.voucher_date <= '{}'",
            from, to_date
        )
    } else {
        format!("AND v.voucher_date <= '{}'", to_date)
    };

    let query = format!(
        "SELECT 
            coa.account_code,
            coa.account_name,
            COALESCE(SUM(je.debit), 0) + coa.opening_balance * CASE WHEN coa.opening_balance_type = 'Dr' THEN 1 ELSE 0 END as debit,
            COALESCE(SUM(je.credit), 0) + coa.opening_balance * CASE WHEN coa.opening_balance_type = 'Cr' THEN 1 ELSE 0 END as credit
        FROM chart_of_accounts coa
        LEFT JOIN journal_entries je ON coa.id = je.account_id
        LEFT JOIN vouchers v ON je.voucher_id = v.id
        WHERE coa.is_active = 1 AND v.deleted_at IS NULL {}
        GROUP BY coa.id, coa.account_code, coa.account_name, coa.opening_balance, coa.opening_balance_type
        HAVING debit > 0 OR credit > 0
        ORDER BY coa.account_code ASC",
        date_filter
    );

    sqlx::query_as::<_, TrialBalanceRow>(&query)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct LedgerEntry {
    pub date: String,
    pub voucher_no: String,
    pub voucher_type: String,
    pub narration: String,
    pub debit: f64,
    pub credit: f64,
    pub balance: f64,
}

#[derive(Serialize, Deserialize)]
pub struct LedgerReport {
    pub entries: Vec<LedgerEntry>,
    pub opening_balance: f64,
    pub closing_balance: f64,
}

#[tauri::command]
pub async fn get_ledger_report(
    pool: State<'_, SqlitePool>,
    account_id: i64,
    from_date: Option<String>,
    to_date: String,
) -> Result<LedgerReport, String> {
    // Get account details including opening balance
    let account = sqlx::query_as::<_, (f64, String)>(
        "SELECT CAST(opening_balance AS REAL), opening_balance_type FROM chart_of_accounts WHERE id = ?"
    )
    .bind(account_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch account {}: {}", account_id, e))?;

    let opening_balance = if account.1 == "Dr" {
        account.0
    } else {
        -account.0
    };

    // Calculate balance before from_date if specified
    let mut running_balance = opening_balance;

    if let Some(ref from) = from_date {
        let balance_before: Option<(f64, f64)> = sqlx::query_as(
            "SELECT CAST(COALESCE(SUM(je.debit), 0) AS REAL), CAST(COALESCE(SUM(je.credit), 0) AS REAL)
             FROM journal_entries je
             JOIN vouchers v ON je.voucher_id = v.id
             WHERE je.account_id = ? AND v.voucher_date < ? AND v.deleted_at IS NULL",
        )
        .bind(account_id)
        .bind(from)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

        if let Some((dr, cr)) = balance_before {
            running_balance += dr - cr;
        }
    }

    // Get entries
    let date_filter = if let Some(ref from) = from_date {
        format!(
            "AND v.voucher_date >= '{}' AND v.voucher_date <= '{}'",
            from, to_date
        )
    } else {
        format!("AND v.voucher_date <= '{}'", to_date)
    };

    let query = format!(
        "SELECT 
            v.voucher_date as date,
            v.voucher_no,
            v.voucher_type,
            je.narration,
            CAST(je.debit AS REAL) as debit,
            CAST(je.credit AS REAL) as credit,
            0.0 as balance
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        WHERE je.account_id = ? AND v.deleted_at IS NULL {}
        ORDER BY v.voucher_date ASC, v.id ASC",
        date_filter
    );

    let mut entries: Vec<LedgerEntry> = sqlx::query_as(&query)
        .bind(account_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    // Calculate running balance
    for entry in &mut entries {
        running_balance += entry.debit - entry.credit;
        entry.balance = running_balance;
    }

    // Calculate opening balance for report
    let report_opening_balance = if from_date.is_some() {
        running_balance - entries.iter().map(|e| e.debit - e.credit).sum::<f64>()
    } else {
        opening_balance
    };

    Ok(LedgerReport {
        entries,
        opening_balance: report_opening_balance,
        closing_balance: running_balance,
    })
}

// ============= VOUCHER NAVIGATION =============

#[derive(Serialize, sqlx::FromRow)]
pub struct VoucherSummary {
    pub id: i64,
    pub voucher_no: String,
    pub voucher_date: String,
    pub party_name: Option<String>,
    pub total_amount: f64,
    pub status: String,
    pub voucher_type: String,
}

#[tauri::command]
pub async fn list_vouchers(
    pool: State<'_, SqlitePool>,
    voucher_type: String,
    limit: i64,
    offset: i64,
    search_query: Option<String>,
) -> Result<Vec<VoucherSummary>, String> {
    let mut query = String::from(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            CASE 
                WHEN v.voucher_type = 'purchase_invoice' THEN s.name
                WHEN v.voucher_type = 'sales_invoice' THEN c.name
                WHEN v.voucher_type IN ('payment', 'receipt') THEN coa.account_name
                ELSE NULL
            END as party_name,
            v.total_amount,
            v.status,
            v.voucher_type
        FROM vouchers v
        LEFT JOIN suppliers s ON v.party_id = s.id AND v.party_type = 'supplier'
        LEFT JOIN customers c ON v.party_id = c.id AND v.party_type = 'customer'
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id AND v.party_type = 'account'
        WHERE v.voucher_type = ? AND v.deleted_at IS NULL ",
    );

    if let Some(search) = &search_query {
        if !search.is_empty() {
            query.push_str("AND (v.voucher_no LIKE ? OR party_name LIKE ?) ");
        }
    }

    query.push_str("ORDER BY v.voucher_date DESC, v.id DESC LIMIT ? OFFSET ?");

    let search_pattern = search_query
        .as_ref()
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{}%", s));

    let mut q = sqlx::query_as::<_, VoucherSummary>(&query).bind(&voucher_type);

    if let Some(ref p) = search_pattern {
        q = q.bind(p).bind(p);
    }

    q = q.bind(limit).bind(offset);

    q.fetch_all(pool.inner()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_previous_voucher_id(
    pool: State<'_, SqlitePool>,
    voucher_type: String,
    current_id: i64,
) -> Result<Option<i64>, String> {
    sqlx::query_scalar::<_, i64>(
        "SELECT id FROM vouchers WHERE voucher_type = ? AND id < ? ORDER BY id DESC LIMIT 1",
    )
    .bind(voucher_type)
    .bind(current_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_next_voucher_id(
    pool: State<'_, SqlitePool>,
    voucher_type: String,
    current_id: i64,
) -> Result<Option<i64>, String> {
    sqlx::query_scalar::<_, i64>(
        "SELECT id FROM vouchers WHERE voucher_type = ? AND id > ? ORDER BY id ASC LIMIT 1",
    )
    .bind(voucher_type)
    .bind(current_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_voucher_by_id(
    pool: State<'_, SqlitePool>,
    voucher_type: String,
    id: i64,
) -> Result<serde_json::Value, String> {
    // Fetch generic voucher data
    let voucher = sqlx::query_as::<_, (i64, String, String, Option<String>, Option<String>, f64, String, String, i64, String)>(
        "SELECT id, voucher_no, voucher_date, reference, narration, total_amount, status, created_at, party_id, party_type FROM vouchers WHERE id = ? AND voucher_type = ?"
    )
    .bind(id)
    .bind(&voucher_type)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if let Some(v) = voucher {
        // Fetch items - basic info
        let items = sqlx::query_as::<_, (i64, String, f64, f64, f64)>(
             "SELECT id, description, final_quantity, rate, amount FROM voucher_items WHERE voucher_id = ?"
        )
        .bind(id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

        Ok(serde_json::json!({
            "id": v.0,
            "voucher_no": v.1,
            "voucher_date": v.2,
            "reference": v.3,
            "narration": v.4,
            "total_amount": v.5,
            "status": v.6,
            "party_id": v.8,
            "party_type": v.9,
            "items": items.iter().map(|i| serde_json::json!({
                "id": i.0,
                "description": i.1,
                "quantity": i.2,
                "rate": i.3,
                "amount": i.4
            })).collect::<Vec<_>>()
        }))
    } else {
        Err("Voucher not found".to_string())
    }
}

#[tauri::command]
pub async fn update_purchase_invoice(
    pool: State<'_, SqlitePool>,
    id: i64,
    invoice: CreatePurchaseInvoice,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Check if voucher exists and is not posted (unless we allow editing posted)
    // For now assuming we can edit encoded ID

    // Calculate totals
    let mut subtotal = 0.0;

    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        subtotal += amount;
    }

    // Apply discounts
    let discount_amount = invoice.discount_amount.unwrap_or(0.0);
    let total_amount = subtotal - discount_amount;

    // Update voucher header
    sqlx::query(
        "UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, party_type = ?, reference = ?, subtotal = ?, discount_rate = ?, discount_amount = ?, total_amount = ?, narration = ?, status = 'posted'
         WHERE id = ? AND voucher_type = 'purchase_invoice'"
    )
    .bind(&invoice.voucher_date)
    .bind(invoice.supplier_id)
    .bind(&invoice.party_type)
    .bind(&invoice.reference)
    .bind(subtotal)
    .bind(invoice.discount_rate.unwrap_or(0.0))
    .bind(discount_amount)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Delete existing related data
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Re-insert items
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        let tax_amount = amount * (item.tax_rate / 100.0);

        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, rate, amount, tax_rate, tax_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(id)
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

    // ============= RE-CREATE JOURNAL ENTRIES =============

    // Calculate total tax from new items
    let total_tax: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(tax_amount), 0) FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let grand_total = total_amount + total_tax;

    // Get account IDs (same as create)
    let purchases_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5001'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let tax_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let party_id = invoice.supplier_id;
    let party_type = invoice.party_type;

    let party_account_code = if party_type == "supplier" {
        format!("2001-{}", party_id)
    } else {
        format!("1003-{}", party_id)
    };

    let party_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = ?")
            .bind(&party_account_code)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| format!("Supplier account not found: {}", e))?;

    // Debit: Purchases Account
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, 'Purchase of goods')",
    )
    .bind(id)
    .bind(purchases_account)
    .bind(total_amount)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Debit: Tax Receivable (GST Input)
    if total_tax > 0.0 {
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, 'Input tax on purchases')",
        )
        .bind(id)
        .bind(tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Credit: Accounts Payable (Party)
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, 0, ?, 'Amount payable to/receivable from party')",
    )
    .bind(id)
    .bind(party_account)
    .bind(grand_total)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Discount Received (if discount applied)
    if discount_amount > 0.0 {
        let discount_account: i64 =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4004'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, 0, ?, 'Discount received from supplier')",
        )
        .bind(id)
        .bind(discount_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= RE-CREATE STOCK MOVEMENTS =============
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;

        sqlx::query(
            "INSERT INTO stock_movements (voucher_id, product_id, movement_type, quantity, rate, amount)
             VALUES (?, ?, 'in', ?, ?, ?)"
        )
        .bind(id)
        .bind(item.product_id)
        .bind(final_qty)
        .bind(item.rate)
        .bind(amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
