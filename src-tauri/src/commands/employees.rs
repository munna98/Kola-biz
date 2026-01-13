use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri::State;
use uuid::Uuid;

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
    pool: State<'_, SqlitePool>,
    data: CreateEmployeeRequest,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let employee_id = Uuid::now_v7().to_string();
    let account_id = Uuid::now_v7().to_string();

    // 1. Create Ledger Account (in Current Liabilities -> Employees)
    // First check if 'Employees' group exists, if not use 'Current Liabilities'
    // For simplicity, we'll put them directly under 'Current Liabilities' with account_group='Current Liabilities'
    // In a real app we might want a specific 'Employees' group.
    // Let's create an "Employees" group if it doesn't exist?
    // Actually, `seeds/data.rs` doesn't have "Employees" group.
    // We'll use "Current Liabilities" as the group.

    // We ideally want a 'Employees' group but for now 'Current Liabilities' is safe.
    let account_group = "Current Liabilities";
    let account_type = "Liability";

    // Create Ledger
    sqlx::query("INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, is_system, party_id, party_type) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'Employee')")
        .bind(&account_id)
        .bind(format!("EMP-{}", &employee_id[0..6])) // Temp code, user should probably set this or we auto-gen better
        .bind(&data.name)
        .bind(account_type)
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
    .bind(data.code)
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
pub async fn get_employees(pool: State<'_, SqlitePool>) -> Result<Vec<Employee>, String> {
    sqlx::query_as::<_, Employee>(
        r#"SELECT 
            id, user_id, account_id, code, name, designation, phone, email, address, 
            status, created_at,
            joining_date
        FROM employees 
        WHERE deleted_at IS NULL 
        ORDER BY name"#,
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_employee(
    pool: State<'_, SqlitePool>,
    data: UpdateEmployeeRequest,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. Update Employee
    sqlx::query(
        "UPDATE employees SET 
            code = ?, name = ?, designation = ?, phone = ?, email = ?, 
            address = ?, joining_date = ?, status = ?
         WHERE id = ?",
    )
    .bind(data.code)
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

    // 2. Update Linked Ledger Name
    // We first need to get account_id
    let account_id: Option<String> = sqlx::query("SELECT account_id FROM employees WHERE id = ?")
        .bind(&data.id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .map(|row| row.get(0));

    if let Some(acc_id) = account_id {
        sqlx::query("UPDATE chart_of_accounts SET account_name = ? WHERE id = ?")
            .bind(&data.name)
            .bind(acc_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to update ledger name: {}", e))?;
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
pub async fn delete_employee(pool: State<'_, SqlitePool>, id: String) -> Result<String, String> {
    // Soft delete
    sqlx::query("UPDATE employees SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok("Employee deleted successfully".to_string())
}
