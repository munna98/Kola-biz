use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

// ============= CUSTOMERS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Customer {
    pub id: String,
    pub code: Option<String>,
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
    pub code: Option<String>,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
}

#[tauri::command]
pub async fn get_customers(pool: State<'_, SqlitePool>) -> Result<Vec<Customer>, String> {
    sqlx::query_as::<_, Customer>(
        "SELECT id, code, name, email, phone, address, is_active, deleted_at, created_at FROM customers WHERE deleted_at IS NULL ORDER BY name ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_customer(pool: State<'_, SqlitePool>, id: String) -> Result<Customer, String> {
    sqlx::query_as::<_, Customer>("SELECT id, code, name, email, phone, address, is_active, deleted_at, created_at FROM customers WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

async fn generate_customer_code(pool: &SqlitePool) -> Result<String, String> {
    let last_code: Option<String> = sqlx::query_scalar(
        "SELECT code FROM customers WHERE code GLOB 'C[0-9]*' ORDER BY length(code) DESC, code DESC LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let next_num = if let Some(code) = last_code {
        code.trim_start_matches('C').parse::<i32>().unwrap_or(100) + 1
    } else {
        101
    };
    Ok(format!("C{}", next_num))
}

#[tauri::command]
pub async fn get_next_customer_code(pool: State<'_, SqlitePool>) -> Result<String, String> {
    generate_customer_code(pool.inner()).await
}

#[tauri::command]
pub async fn create_customer(
    pool: State<'_, SqlitePool>,
    customer: CreateCustomer,
) -> Result<Customer, String> {
    let id = Uuid::now_v7().to_string();
    let code = if let Some(c) = &customer.code {
        if c.trim().is_empty() {
            generate_customer_code(pool.inner()).await?
        } else {
            c.clone()
        }
    } else {
        generate_customer_code(pool.inner()).await?
    };

    let _ = sqlx::query(
        "INSERT INTO customers (id, code, name, email, phone, address) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&code)
    .bind(&customer.name)
    .bind(&customer.email)
    .bind(&customer.phone)
    .bind(&customer.address)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    // Create corresponding account in Chart of Accounts
    let account_code = code.clone(); // Use customer code as account code
    let account_id = Uuid::now_v7().to_string();

    sqlx::query(
        "INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, party_id, party_type) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(account_id)
    .bind(&account_code)
    .bind(&customer.name)
    .bind("Asset")
    .bind("Accounts Receivable")
    .bind("Customer account")
    .bind(&id)
    .bind("customer")
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Customer>("SELECT id, code, name, email, phone, address, is_active, deleted_at, created_at FROM customers WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_customer(
    pool: State<'_, SqlitePool>,
    id: String,
    customer: CreateCustomer,
) -> Result<(), String> {
    sqlx::query("UPDATE customers SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?")
        .bind(&customer.name)
        .bind(&customer.email)
        .bind(&customer.phone)
        .bind(&customer.address)
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    // Update corresponding account in Chart of Accounts
    // Update corresponding account in Chart of Accounts
    sqlx::query(
        "UPDATE chart_of_accounts SET account_name = ?, updated_at = CURRENT_TIMESTAMP WHERE party_id = ?"
    )
    .bind(&customer.name)
    .bind(&id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_customer(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    // Check for references in vouchers
    let voucher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vouchers WHERE party_id = ? AND party_type = 'customer' AND deleted_at IS NULL")
            .bind(&id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if voucher_count > 0 {
        return Err("Cannot delete customer as they have associated vouchers.".to_string());
    }

    // Check for journal entries in the corresponding COA
    let journal_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM journal_entries WHERE account_id = (SELECT id FROM chart_of_accounts WHERE party_id = ?)",
    )
    .bind(&id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err("Cannot delete customer as their account has ledger entries.".to_string());
    }

    sqlx::query("UPDATE customers SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    // Delete corresponding account from chart of accounts
    // Delete corresponding account from chart of accounts
    sqlx::query(
        "UPDATE chart_of_accounts SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE party_id = ?",
    )
    .bind(&id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_deleted_customers(pool: State<'_, SqlitePool>) -> Result<Vec<Customer>, String> {
    sqlx::query_as::<_, Customer>(
        "SELECT id, code, name, email, phone, address, is_active, deleted_at, created_at FROM customers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_customer(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query("UPDATE customers SET is_active = 1, deleted_at = NULL WHERE id = ?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE chart_of_accounts SET is_active = 1, deleted_at = NULL WHERE party_id = ?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_customer(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    // Reference checks (same as soft delete)
    let voucher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vouchers WHERE party_id = ? AND party_type = 'customer' AND deleted_at IS NULL")
            .bind(&id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if voucher_count > 0 {
        return Err(
            "Cannot permanently delete customer as they have associated vouchers.".to_string(),
        );
    }

    let journal_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM journal_entries WHERE account_id = (SELECT id FROM chart_of_accounts WHERE party_id = ?)",
    )
    .bind(&id)
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
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM chart_of_accounts WHERE party_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

// ============= SUPPLIERS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Supplier {
    pub id: String,
    pub code: Option<String>,
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
    pub code: Option<String>,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
}

#[tauri::command]
pub async fn get_suppliers(pool: State<'_, SqlitePool>) -> Result<Vec<Supplier>, String> {
    sqlx::query_as::<_, Supplier>(
        "SELECT id, code, name, email, phone, address, is_active, deleted_at, created_at FROM suppliers WHERE deleted_at IS NULL ORDER BY name ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_supplier(pool: State<'_, SqlitePool>, id: String) -> Result<Supplier, String> {
    sqlx::query_as::<_, Supplier>("SELECT id, code, name, email, phone, address, is_active, deleted_at, created_at FROM suppliers WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

async fn generate_supplier_code(pool: &SqlitePool) -> Result<String, String> {
    let last_code: Option<String> = sqlx::query_scalar(
        "SELECT code FROM suppliers WHERE code GLOB 'S[0-9]*' ORDER BY length(code) DESC, code DESC LIMIT 1"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let next_num = if let Some(code) = last_code {
        code.trim_start_matches('S').parse::<i32>().unwrap_or(100) + 1
    } else {
        101
    };
    Ok(format!("S{}", next_num))
}

#[tauri::command]
pub async fn get_next_supplier_code(pool: State<'_, SqlitePool>) -> Result<String, String> {
    generate_supplier_code(pool.inner()).await
}

#[tauri::command]
pub async fn create_supplier(
    pool: State<'_, SqlitePool>,
    supplier: CreateSupplier,
) -> Result<Supplier, String> {
    let id = Uuid::now_v7().to_string();
    let code = if let Some(c) = &supplier.code {
        if c.trim().is_empty() {
            generate_supplier_code(pool.inner()).await?
        } else {
            c.clone()
        }
    } else {
        generate_supplier_code(pool.inner()).await?
    };

    let _ = sqlx::query(
        "INSERT INTO suppliers (id, code, name, email, phone, address) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&code)
    .bind(&supplier.name)
    .bind(&supplier.email)
    .bind(&supplier.phone)
    .bind(&supplier.address)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    // Create corresponding account in Chart of Accounts
    let account_code = code.clone(); // Use supplier code as account code
    let account_id = Uuid::now_v7().to_string();

    sqlx::query(
        "INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, party_id, party_type) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(account_id)
    .bind(&account_code)
    .bind(&supplier.name)
    .bind("Liability")
    .bind("Accounts Payable")
    .bind("Supplier account")
    .bind(&id)
    .bind("supplier")
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Supplier>("SELECT id, code, name, email, phone, address, is_active, deleted_at, created_at FROM suppliers WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_supplier(
    pool: State<'_, SqlitePool>,
    id: String,
    supplier: CreateSupplier,
) -> Result<(), String> {
    sqlx::query("UPDATE suppliers SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?")
        .bind(&supplier.name)
        .bind(&supplier.email)
        .bind(&supplier.phone)
        .bind(&supplier.address)
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    // Update corresponding account in Chart of Accounts
    // Update corresponding account in Chart of Accounts
    sqlx::query(
        "UPDATE chart_of_accounts SET account_name = ?, updated_at = CURRENT_TIMESTAMP WHERE party_id = ?"
    )
    .bind(&supplier.name)
    .bind(&id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_supplier(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    // Check for references in vouchers
    let voucher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vouchers WHERE party_id = ? AND party_type = 'supplier' AND deleted_at IS NULL")
            .bind(&id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if voucher_count > 0 {
        return Err("Cannot delete supplier as they have associated vouchers.".to_string());
    }

    // Check for journal entries in the corresponding COA
    let journal_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM journal_entries WHERE account_id = (SELECT id FROM chart_of_accounts WHERE party_id = ?)",
    )
    .bind(&id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err("Cannot delete supplier as their account has ledger entries.".to_string());
    }

    sqlx::query("UPDATE suppliers SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    // Delete corresponding account from chart of accounts
    // Delete corresponding account from chart of accounts
    sqlx::query(
        "UPDATE chart_of_accounts SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE party_id = ?",
    )
    .bind(&id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_deleted_suppliers(pool: State<'_, SqlitePool>) -> Result<Vec<Supplier>, String> {
    sqlx::query_as::<_, Supplier>(
        "SELECT id, code, name, email, phone, address, is_active, deleted_at, created_at FROM suppliers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_supplier(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query("UPDATE suppliers SET is_active = 1, deleted_at = NULL WHERE id = ?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE chart_of_accounts SET is_active = 1, deleted_at = NULL WHERE party_id = ?")
        .bind(&id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_supplier(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    // Reference checks (same as soft delete)
    let voucher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vouchers WHERE party_id = ? AND party_type = 'supplier' AND deleted_at IS NULL")
            .bind(&id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if voucher_count > 0 {
        return Err(
            "Cannot permanently delete supplier as they have associated vouchers.".to_string(),
        );
    }

    let journal_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM journal_entries WHERE account_id = (SELECT id FROM chart_of_accounts WHERE party_id = ?)",
    )
    .bind(&id)
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
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM chart_of_accounts WHERE party_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}
