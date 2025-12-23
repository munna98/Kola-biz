use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

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
