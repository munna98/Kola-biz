use crate::company_db::DbRegistry;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

async fn get_next_party_code(
    pool: &SqlitePool,
    party_table: &str,
    code_column: &str,
    ledger_prefix: &str,
) -> Result<String, String> {
    let query = format!(
        "SELECT MAX(CAST(SUBSTR(code_value, 2) AS INTEGER)) FROM (
            SELECT {code_column} AS code_value
            FROM {party_table}
            WHERE {code_column} GLOB ?1
            UNION ALL
            SELECT account_code AS code_value
            FROM chart_of_accounts
            WHERE account_code GLOB ?1
        )",
    );

    let max_num: Option<i64> = sqlx::query_scalar(&query)
        .bind(format!("{ledger_prefix}[0-9]*"))
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!("{ledger_prefix}{}", max_num.unwrap_or(100) + 1))
}

// ============= CUSTOMERS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Customer {
    pub id: String,
    pub code: Option<String>,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address_line_1: Option<String>,
    pub address_line_2: Option<String>,
    pub address_line_3: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub country: Option<String>,
    pub gstin: Option<String>,
    pub currency: Option<String>,
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
    pub address_line_1: Option<String>,
    pub address_line_2: Option<String>,
    pub address_line_3: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub country: Option<String>,
    pub gstin: Option<String>,
    pub currency: Option<String>,
}

#[tauri::command]
pub async fn get_customers(registry: State<'_, Arc<DbRegistry>>) -> Result<Vec<Customer>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, Customer>(
        "SELECT id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency, is_active, deleted_at, created_at FROM customers WHERE deleted_at IS NULL ORDER BY name ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_customer(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<Customer, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, Customer>("SELECT id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency, is_active, deleted_at, created_at FROM customers WHERE id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())
}

async fn generate_customer_code(pool: &SqlitePool) -> Result<String, String> {
    get_next_party_code(pool, "customers", "code", "C").await
}

#[tauri::command]
pub async fn get_next_customer_code(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    generate_customer_code(&pool).await
}

#[tauri::command]
pub async fn create_customer(
    registry: State<'_, Arc<DbRegistry>>,
    customer: CreateCustomer,
) -> Result<Customer, String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let id = Uuid::now_v7().to_string();
    let code = if let Some(c) = &customer.code {
        if c.trim().is_empty() {
            generate_customer_code(&pool).await?
        } else {
            c.clone()
        }
    } else {
        generate_customer_code(&pool).await?
    };

    let _ = sqlx::query(
        "INSERT INTO customers (id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&code)
    .bind(&customer.name)
    .bind(&customer.email)
    .bind(&customer.phone)
    .bind(&customer.address_line_1)
    .bind(&customer.address_line_2)
    .bind(&customer.address_line_3)
    .bind(&customer.city)
    .bind(&customer.state)
    .bind(&customer.postal_code)
    .bind(&customer.country)
    .bind(&customer.gstin)
    .bind(&customer.currency)
    .execute(&mut *tx)
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
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Customer>("SELECT id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency, is_active, deleted_at, created_at FROM customers WHERE id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_create_customers(
    registry: State<'_, Arc<DbRegistry>>,
    customers: Vec<CreateCustomer>,
) -> Result<usize, String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let mut next_generated_code = generate_customer_code(&pool)
        .await?
        .trim_start_matches('C')
        .parse::<i64>()
        .unwrap_or(101);

    for customer in customers {
        let id = Uuid::now_v7().to_string();
        let code = if let Some(c) = &customer.code {
            if c.trim().is_empty() {
                let generated = format!("C{}", next_generated_code);
                next_generated_code += 1;
                generated
            } else {
                c.clone()
            }
        } else {
            let generated = format!("C{}", next_generated_code);
            next_generated_code += 1;
            generated
        };

        let _ = sqlx::query(
            "INSERT INTO customers (id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&code)
        .bind(&customer.name)
        .bind(&customer.email)
        .bind(&customer.phone)
        .bind(&customer.address_line_1)
        .bind(&customer.address_line_2)
        .bind(&customer.address_line_3)
        .bind(&customer.city)
        .bind(&customer.state)
        .bind(&customer.postal_code)
        .bind(&customer.country)
        .bind(&customer.gstin)
        .bind(&customer.currency)
        .execute(&mut *tx)
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
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(1)
}

#[tauri::command]
pub async fn update_customer(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    customer: CreateCustomer,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    sqlx::query(
        "UPDATE customers SET name = ?, email = ?, phone = ?, address_line_1 = ?, address_line_2 = ?, address_line_3 = ?, city = ?, state = ?, postal_code = ?, country = ?, gstin = ?, currency = ? WHERE id = ?"
    )
    .bind(&customer.name)
    .bind(&customer.email)
    .bind(&customer.phone)
    .bind(&customer.address_line_1)
    .bind(&customer.address_line_2)
    .bind(&customer.address_line_3)
    .bind(&customer.city)
    .bind(&customer.state)
    .bind(&customer.postal_code)
    .bind(&customer.country)
    .bind(&customer.gstin)
    .bind(&customer.currency)
    .bind(&id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Sync address/gstin to chart_of_accounts
    sqlx::query(
        "UPDATE chart_of_accounts SET account_name = ?, address_line_1 = ?, address_line_2 = ?, city = ?, state = ?, postal_code = ?, gstin = ?, updated_at = CURRENT_TIMESTAMP WHERE party_id = ?"
    )
    .bind(&customer.name)
    .bind(&customer.address_line_1)
    .bind(&customer.address_line_2)
    .bind(&customer.city)
    .bind(&customer.state)
    .bind(&customer.postal_code)
    .bind(&customer.gstin)
    .bind(&id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_customer(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Check for references in vouchers
    let voucher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vouchers WHERE party_id = ? AND party_type = 'customer' AND deleted_at IS NULL")
            .bind(&id)
            .fetch_one(&pool)
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
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err("Cannot delete customer as their account has ledger entries.".to_string());
    }

    sqlx::query("UPDATE customers SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // Delete corresponding account from chart of accounts
    // Delete corresponding account from chart of accounts
    sqlx::query(
        "UPDATE chart_of_accounts SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE party_id = ?",
    )
    .bind(&id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_deleted_customers(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<Customer>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, Customer>(
        "SELECT id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency, is_active, deleted_at, created_at FROM customers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_customer(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    sqlx::query("UPDATE customers SET is_active = 1, deleted_at = NULL WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE chart_of_accounts SET is_active = 1, deleted_at = NULL WHERE party_id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_customer(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Reference checks (same as soft delete)
    let voucher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vouchers WHERE party_id = ? AND party_type = 'customer' AND deleted_at IS NULL")
            .bind(&id)
            .fetch_one(&pool)
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
    .fetch_one(&pool)
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
    pub address_line_1: Option<String>,
    pub address_line_2: Option<String>,
    pub address_line_3: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub country: Option<String>,
    pub gstin: Option<String>,
    pub currency: Option<String>,
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
    pub address_line_1: Option<String>,
    pub address_line_2: Option<String>,
    pub address_line_3: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub country: Option<String>,
    pub gstin: Option<String>,
    pub currency: Option<String>,
}

#[tauri::command]
pub async fn get_suppliers(registry: State<'_, Arc<DbRegistry>>) -> Result<Vec<Supplier>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, Supplier>(
        "SELECT id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency, is_active, deleted_at, created_at FROM suppliers WHERE deleted_at IS NULL ORDER BY name ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_supplier(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<Supplier, String> {
    let pool = registry.active_pool().await?;
    get_supplier_with_pool(&pool, &id).await
}

/// Internal version for use by other modules (e.g., templates.rs)
pub(crate) async fn get_supplier_with_pool(
    pool: &SqlitePool,
    id: &str,
) -> Result<Supplier, String> {
    sqlx::query_as::<_, Supplier>("SELECT id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency, is_active, deleted_at, created_at FROM suppliers WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

/// Internal version for use by other modules (e.g., templates.rs)
pub(crate) async fn get_customer_with_pool(
    pool: &SqlitePool,
    id: &str,
) -> Result<Customer, String> {
    sqlx::query_as::<_, Customer>("SELECT id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency, is_active, deleted_at, created_at FROM customers WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

async fn generate_supplier_code(pool: &SqlitePool) -> Result<String, String> {
    get_next_party_code(pool, "suppliers", "code", "S").await
}

#[tauri::command]
pub async fn get_next_supplier_code(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    generate_supplier_code(&pool).await
}

#[tauri::command]
pub async fn create_supplier(
    registry: State<'_, Arc<DbRegistry>>,
    supplier: CreateSupplier,
) -> Result<Supplier, String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let id = Uuid::now_v7().to_string();
    let code = if let Some(c) = &supplier.code {
        if c.trim().is_empty() {
            generate_supplier_code(&pool).await?
        } else {
            c.clone()
        }
    } else {
        generate_supplier_code(&pool).await?
    };

    let _ = sqlx::query(
        "INSERT INTO suppliers (id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&code)
    .bind(&supplier.name)
    .bind(&supplier.email)
    .bind(&supplier.phone)
    .bind(&supplier.address_line_1)
    .bind(&supplier.address_line_2)
    .bind(&supplier.address_line_3)
    .bind(&supplier.city)
    .bind(&supplier.state)
    .bind(&supplier.postal_code)
    .bind(&supplier.country)
    .bind(&supplier.gstin)
    .bind(&supplier.currency)
    .execute(&mut *tx)
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
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Supplier>("SELECT id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency, is_active, deleted_at, created_at FROM suppliers WHERE id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_create_suppliers(
    registry: State<'_, Arc<DbRegistry>>,
    suppliers: Vec<CreateSupplier>,
) -> Result<usize, String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let mut next_generated_code = generate_supplier_code(&pool)
        .await?
        .trim_start_matches('S')
        .parse::<i64>()
        .unwrap_or(101);

    for supplier in suppliers {
        let id = Uuid::now_v7().to_string();
        let code = if let Some(c) = &supplier.code {
            if c.trim().is_empty() {
                let generated = format!("S{}", next_generated_code);
                next_generated_code += 1;
                generated
            } else {
                c.clone()
            }
        } else {
            let generated = format!("S{}", next_generated_code);
            next_generated_code += 1;
            generated
        };

        let _ = sqlx::query(
            "INSERT INTO suppliers (id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&code)
        .bind(&supplier.name)
        .bind(&supplier.email)
        .bind(&supplier.phone)
        .bind(&supplier.address_line_1)
        .bind(&supplier.address_line_2)
        .bind(&supplier.address_line_3)
        .bind(&supplier.city)
        .bind(&supplier.state)
        .bind(&supplier.postal_code)
        .bind(&supplier.country)
        .bind(&supplier.gstin)
        .bind(&supplier.currency)
        .execute(&mut *tx)
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
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(1)
}

#[tauri::command]
pub async fn update_supplier(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    supplier: CreateSupplier,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    sqlx::query(
        "UPDATE suppliers SET name = ?, email = ?, phone = ?, address_line_1 = ?, address_line_2 = ?, address_line_3 = ?, city = ?, state = ?, postal_code = ?, country = ?, gstin = ?, currency = ? WHERE id = ?"
    )
    .bind(&supplier.name)
    .bind(&supplier.email)
    .bind(&supplier.phone)
    .bind(&supplier.address_line_1)
    .bind(&supplier.address_line_2)
    .bind(&supplier.address_line_3)
    .bind(&supplier.city)
    .bind(&supplier.state)
    .bind(&supplier.postal_code)
    .bind(&supplier.country)
    .bind(&supplier.gstin)
    .bind(&supplier.currency)
    .bind(&id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Sync address/gstin to chart_of_accounts
    sqlx::query(
        "UPDATE chart_of_accounts SET account_name = ?, address_line_1 = ?, address_line_2 = ?, city = ?, state = ?, postal_code = ?, gstin = ?, updated_at = CURRENT_TIMESTAMP WHERE party_id = ?"
    )
    .bind(&supplier.name)
    .bind(&supplier.address_line_1)
    .bind(&supplier.address_line_2)
    .bind(&supplier.city)
    .bind(&supplier.state)
    .bind(&supplier.postal_code)
    .bind(&supplier.gstin)
    .bind(&id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_supplier(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Check for references in vouchers
    let voucher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vouchers WHERE party_id = ? AND party_type = 'supplier' AND deleted_at IS NULL")
            .bind(&id)
            .fetch_one(&pool)
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
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err("Cannot delete supplier as their account has ledger entries.".to_string());
    }

    sqlx::query("UPDATE suppliers SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // Delete corresponding account from chart of accounts
    // Delete corresponding account from chart of accounts
    sqlx::query(
        "UPDATE chart_of_accounts SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE party_id = ?",
    )
    .bind(&id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_deleted_suppliers(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<Supplier>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, Supplier>(
        "SELECT id, code, name, email, phone, address_line_1, address_line_2, address_line_3, city, state, postal_code, country, gstin, currency, is_active, deleted_at, created_at FROM suppliers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_supplier(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    sqlx::query("UPDATE suppliers SET is_active = 1, deleted_at = NULL WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE chart_of_accounts SET is_active = 1, deleted_at = NULL WHERE party_id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_supplier(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Reference checks (same as soft delete)
    let voucher_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM vouchers WHERE party_id = ? AND party_type = 'supplier' AND deleted_at IS NULL")
            .bind(&id)
            .fetch_one(&pool)
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
    .fetch_one(&pool)
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

// ============= COMMON PARTY =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Party {
    pub id: String,
    pub party_name: String,
    pub party_type: String,
}

#[tauri::command]
pub async fn get_all_parties(registry: State<'_, Arc<DbRegistry>>) -> Result<Vec<Party>, String> {
    let pool = registry.active_pool().await?;
    let query = "
        SELECT id, account_name as party_name, party_type 
        FROM chart_of_accounts 
        WHERE party_type IS NOT NULL AND deleted_at IS NULL
        ORDER BY account_name ASC
    ";

    sqlx::query_as::<_, Party>(query)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())
}
