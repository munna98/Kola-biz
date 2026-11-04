use crate::company_db::DbRegistry;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

pub(crate) async fn generate_employee_code(pool: &SqlitePool) -> Result<String, String> {
    crate::commands::parties::get_next_party_code(pool, "employees", "code", "E").await
}

async fn resolve_account_type(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    group_name: &str,
) -> Option<String> {
    sqlx::query_scalar(
        "WITH RECURSIVE ancestors(id, account_type, parent_group_id, base_type) AS (
             SELECT id, account_type, parent_group_id, base_type FROM account_groups WHERE name = ? AND is_active = 1
             UNION ALL
             SELECT ag.id, ag.account_type, ag.parent_group_id, ag.base_type
             FROM account_groups ag
             JOIN ancestors a ON ag.id = a.parent_group_id
         )
         SELECT COALESCE(base_type, account_type) FROM ancestors
         WHERE parent_group_id IS NULL OR parent_group_id = ''
         LIMIT 1",
    )
    .bind(group_name)
    .fetch_optional(&mut **tx)
    .await
    .unwrap_or(None)
}

#[tauri::command]
pub async fn get_next_employee_code(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    generate_employee_code(&pool).await
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Employee {
    pub id: String,
    pub user_id: Option<String>,
    pub account_id: Option<String>,
    pub code: Option<String>,
    pub name: String,
    pub designation: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub joining_date: Option<String>,
    pub status: String,
    pub created_at: String,
    pub account_group: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateEmployeeRequest {
    pub code: Option<String>,
    pub name: String,
    pub designation: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub joining_date: Option<String>,
    pub account_group: Option<String>,
    pub create_user: bool,
    pub username: Option<String>,
    pub password: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateEmployeeRequest {
    pub id: String,
    pub code: Option<String>,
    pub name: String,
    pub designation: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub joining_date: Option<String>,
    pub status: String,
    pub account_group: Option<String>,
    #[allow(dead_code)]
    pub create_user: bool,
    #[allow(dead_code)]
    pub username: Option<String>,
    #[allow(dead_code)]
    pub password: Option<String>,
    #[allow(dead_code)]
    pub role: Option<String>,
}

#[tauri::command]
pub async fn create_employee(
    registry: State<'_, Arc<DbRegistry>>,
    data: CreateEmployeeRequest,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let employee_id = Uuid::now_v7().to_string();
    let account_id = Uuid::now_v7().to_string();

    let code = if let Some(c) = &data.code {
        if c.trim().is_empty() {
            generate_employee_code(&pool).await?
        } else {
            c.clone()
        }
    } else {
        generate_employee_code(&pool).await?
    };

    // 1. Create Ledger Account
    let account_group = data
        .account_group
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("Emp Benefits & Salaries");

    let account_type = resolve_account_type(&mut tx, account_group)
        .await
        .unwrap_or_else(|| "Expense".to_string());

    // Create Ledger
    sqlx::query("INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, is_system, party_id, party_type) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'Employee')")
        .bind(&account_id)
        .bind(&code)
        .bind(&data.name)
        .bind(&account_type)
        .bind(account_group)
        .bind(format!("Ledger for employee: {}", &data.name))
        .bind(&employee_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to create ledger: {}", e))?;

    // 2. Create User (Optional)
    let mut user_id: Option<String> = None;
    if data.create_user {
        if let (Some(username), Some(password)) = (&data.username, &data.password) {
            let uid = Uuid::now_v7().to_string();
            let password_hash =
                bcrypt::hash(password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;

            sqlx::query("INSERT INTO users (id, username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?, 1)")
                .bind(&uid)
                .bind(username)
                .bind(password_hash)
                .bind(&data.name)
                .bind(data.role.unwrap_or("user".to_string()))
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to create user: {}", e))?;

            user_id = Some(uid);
        }
    }

    // 3. Create Employee
    sqlx::query(
        "INSERT INTO employees (id, user_id, account_id, code, name, designation, phone, email, address, joining_date, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')"
    )
    .bind(&employee_id)
    .bind(user_id)
    .bind(&account_id)
    .bind(&code)
    .bind(&data.name)
    .bind(data.designation)
    .bind(data.phone)
    .bind(data.email)
    .bind(data.address)
    .bind(data.joining_date)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Failed to create employee: {}", e))?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok("Employee created successfully".to_string())
}

#[tauri::command]
pub async fn get_employees(registry: State<'_, Arc<DbRegistry>>) -> Result<Vec<Employee>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, Employee>(
        r#"SELECT 
            e.id, e.user_id, e.account_id, e.code, e.name, e.designation, e.phone, e.email, e.address, 
            e.status, e.created_at, e.joining_date,
            coa.account_group
        FROM employees e
        LEFT JOIN chart_of_accounts coa ON (e.account_id = coa.id OR (e.account_id IS NULL AND coa.party_id = e.id AND coa.party_type = 'Employee'))
        WHERE e.deleted_at IS NULL 
        ORDER BY e.name"#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_employee(
    registry: State<'_, Arc<DbRegistry>>,
    data: UpdateEmployeeRequest,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. Update Employee
    let code_to_update = data.code.clone();
    sqlx::query(
        "UPDATE employees SET 
            code = ?, name = ?, designation = ?, phone = ?, email = ?, 
            address = ?, joining_date = ?, status = ?
         WHERE id = ?",
    )
    .bind(&data.code)
    .bind(&data.name)
    .bind(data.designation)
    .bind(data.phone)
    .bind(data.email)
    .bind(data.address)
    .bind(data.joining_date)
    .bind(data.status)
    .bind(&data.id)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Failed to update employee: {}", e))?;

    // 2. Update Linked Ledger Name, Account Code, and Account Group
    let account_id: Option<String> = sqlx::query("SELECT account_id FROM employees WHERE id = ?")
        .bind(&data.id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .and_then(|row| row.get(0));

    let account_id = match account_id {
        Some(aid) if !aid.is_empty() => Some(aid),
        _ => {
            sqlx::query("SELECT id FROM chart_of_accounts WHERE party_id = ? AND party_type = 'Employee'")
                .bind(&data.id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
                .and_then(|row| row.get(0))
        }
    };

    if let Some(acc_id) = account_id {
        if let Some(group) = &data.account_group {
            let group_trim = group.trim();
            if !group_trim.is_empty() {
                let derived_type = resolve_account_type(&mut tx, group_trim)
                    .await
                    .unwrap_or_else(|| "Expense".to_string());

                sqlx::query(
                    "UPDATE chart_of_accounts 
                     SET account_name = ?, account_code = COALESCE(NULLIF(?, ''), account_code), account_group = ?, account_type = ? 
                     WHERE id = ?"
                )
                .bind(&data.name)
                .bind(code_to_update)
                .bind(group_trim)
                .bind(derived_type)
                .bind(&acc_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to update ledger: {}", e))?;
            } else {
                sqlx::query(
                    "UPDATE chart_of_accounts 
                     SET account_name = ?, account_code = COALESCE(NULLIF(?, ''), account_code) 
                     WHERE id = ?"
                )
                .bind(&data.name)
                .bind(code_to_update)
                .bind(&acc_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to update ledger name: {}", e))?;
            }
        } else {
            sqlx::query(
                "UPDATE chart_of_accounts 
                 SET account_name = ?, account_code = COALESCE(NULLIF(?, ''), account_code) 
                 WHERE id = ?"
            )
            .bind(&data.name)
            .bind(code_to_update)
            .bind(&acc_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to update ledger name: {}", e))?;
        }
    } else {
        // If employee had no linked ledger, create one and link it
        let new_acc_id = Uuid::now_v7().to_string();
        let group_name = data
            .account_group
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .unwrap_or("Emp Benefits & Salaries");

        let derived_type = resolve_account_type(&mut tx, group_name)
            .await
            .unwrap_or_else(|| "Expense".to_string());

        sqlx::query(
            "INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, is_system, party_id, party_type) 
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'Employee')"
        )
        .bind(&new_acc_id)
        .bind(&data.code)
        .bind(&data.name)
        .bind(derived_type)
        .bind(group_name)
        .bind(format!("Ledger for employee: {}", &data.name))
        .bind(&data.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to create missing ledger: {}", e))?;

        sqlx::query("UPDATE employees SET account_id = ? WHERE id = ?")
            .bind(&new_acc_id)
            .bind(&data.id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to link ledger to employee: {}", e))?;
    }

    // 3. Handle User Login Access
    let current_user_id: Option<String> = sqlx::query("SELECT user_id FROM employees WHERE id = ?")
        .bind(&data.id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .map(|row| row.get(0));

    if data.create_user {
        // CASE A: User wants login, but currently has none -> Create User
        if current_user_id.is_none() {
            if let (Some(username), Some(password)) = (&data.username, &data.password) {
                let uid = Uuid::now_v7().to_string();
                let password_hash =
                    bcrypt::hash(password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;

                sqlx::query("INSERT INTO users (id, username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, ?, 1)")
                    .bind(&uid)
                    .bind(username)
                    .bind(password_hash)
                    .bind(&data.name)
                    .bind(data.role.unwrap_or("user".to_string()))
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| format!("Failed to create user: {}", e))?;

                // Link to employee
                sqlx::query("UPDATE employees SET user_id = ? WHERE id = ?")
                    .bind(&uid)
                    .bind(&data.id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| format!("Failed to link new user to employee: {}", e))?;
            } else {
                return Err(
                    "Username and password are required to enable login access.".to_string()
                );
            }
        }
        // CASE B: User wants login, and ALREADY has one -> Update User (Optional logic)
        else if let Some(uid) = current_user_id {
            // Optional: Update role if changed
            if let Some(role) = &data.role {
                sqlx::query("UPDATE users SET role = ?, full_name = ? WHERE id = ?")
                    .bind(role)
                    .bind(&data.name)
                    .bind(&uid)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| format!("Failed to update user role: {}", e))?;
            }

            // Optional: Update password if provided
            if let Some(password) = &data.password {
                if !password.is_empty() {
                    let password_hash =
                        bcrypt::hash(password, bcrypt::DEFAULT_COST).map_err(|e| e.to_string())?;
                    sqlx::query("UPDATE users SET password_hash = ? WHERE id = ?")
                        .bind(password_hash)
                        .bind(&uid)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| format!("Failed to update user password: {}", e))?;
                }
            }
        }
    } else {
        // CASE C: User wants NO login, but CURRENTLY has one -> Delete User (Revoke Access)
        if let Some(uid) = current_user_id {
            // Unlink from employee first
            sqlx::query("UPDATE employees SET user_id = NULL WHERE id = ?")
                .bind(&data.id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to unlink user from employee: {}", e))?;

            // Delete user
            sqlx::query("DELETE FROM users WHERE id = ?")
                .bind(&uid)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to delete associated user: {}", e))?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok("Employee updated successfully".to_string())
}

#[tauri::command]
pub async fn delete_employee(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    // Soft delete
    sqlx::query("UPDATE employees SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok("Employee deleted successfully".to_string())
}
