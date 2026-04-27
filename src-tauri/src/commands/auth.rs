use bcrypt::{hash, verify, DEFAULT_COST};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use crate::company_db::DbRegistry;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// Session storage (in-memory for simplicity)
pub struct SessionStore {
    sessions: Mutex<HashMap<String, String>>, // token -> user_id
}

impl SessionStore {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn create_session(&self, user_id: String) -> String {
        let token = Uuid::new_v4().to_string();
        self.sessions.lock().unwrap().insert(token.clone(), user_id);
        token
    }

    pub fn get_user_id(&self, token: &str) -> Option<String> {
        self.sessions.lock().unwrap().get(token).cloned()
    }

    pub fn remove_session(&self, token: &str) {
        self.sessions.lock().unwrap().remove(token);
    }
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub username: String,
    pub full_name: Option<String>,
    pub role: String,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserRequest {
    pub id: String,
    pub full_name: String,
    pub role: String,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetPasswordRequest {
    pub id: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginResponse {
    pub success: bool,
    pub message: String,
    pub token: Option<String>,
    pub user: Option<User>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionCheckResponse {
    pub valid: bool,
    pub user: Option<User>,
}

// Check if any users exist in the database
#[tauri::command]
pub async fn check_if_users_exist(registry: State<'_, Arc<DbRegistry>>) -> Result<bool, String> {
    let pool = registry.active_pool().await?;
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE is_active = 1")
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    Ok(count.0 > 0)
}

// Create initial admin user
#[tauri::command]
pub async fn create_initial_user(
    registry: State<'_, Arc<DbRegistry>>,
    username: String,
    password: String,
    full_name: String,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    // Check if users already exist
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE is_active = 1")
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;
    let users_exist = count.0 > 0;
    if users_exist {
        return Err("Users already exist. Cannot create initial user.".to_string());
    }

    // Validate input
    if username.trim().is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    if password.len() < 4 {
        return Err("Password must be at least 4 characters".to_string());
    }

    // Hash password
    let password_hash =
        hash(password, DEFAULT_COST).map_err(|e| format!("Failed to hash password: {}", e))?;

    // Generate UUID v7
    let id = Uuid::now_v7().to_string();

    // Insert user
    sqlx::query(
        "INSERT INTO users (id, username, password_hash, full_name, role, is_active) 
         VALUES (?, ?, ?, ?, 'admin', 1)",
    )
    .bind(id)
    .bind(username.trim())
    .bind(password_hash)
    .bind(full_name.trim())
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create user: {}", e))?;

    Ok("Initial admin user created successfully".to_string())
}

#[tauri::command]
pub async fn get_users(registry: State<'_, Arc<DbRegistry>>) -> Result<Vec<User>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, User>(
        "SELECT id, username, full_name, role, is_active FROM users ORDER BY username",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to fetch users: {}", e))
}

#[tauri::command]
pub async fn create_user(
    registry: State<'_, Arc<DbRegistry>>,
    username: String,
    password: String,
    full_name: String,
    role: String,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    // Validate input
    if username.trim().is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    if password.len() < 4 {
        return Err("Password must be at least 4 characters".to_string());
    }

    // Hash password
    let password_hash =
        hash(password, DEFAULT_COST).map_err(|e| format!("Failed to hash password: {}", e))?;

    let id = Uuid::now_v7().to_string();

    sqlx::query(
        "INSERT INTO users (id, username, password_hash, full_name, role, is_active) 
         VALUES (?, ?, ?, ?, ?, 1)",
    )
    .bind(id)
    .bind(username.trim())
    .bind(password_hash)
    .bind(full_name.trim())
    .bind(role)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to create user: {}", e))?;

    Ok("User created successfully".to_string())
}

#[tauri::command]
pub async fn update_user(
    registry: State<'_, Arc<DbRegistry>>,
    data: UpdateUserRequest,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    sqlx::query(
        "UPDATE users SET full_name = ?, role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(data.full_name.trim())
    .bind(data.role)
    .bind(data.is_active)
    .bind(data.id)
    .execute(&pool)
    .await
    .map_err(|e| format!("Failed to update user: {}", e))?;

    Ok("User updated successfully".to_string())
}

#[tauri::command]
pub async fn delete_user(registry: State<'_, Arc<DbRegistry>>, id: String) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    // We'll do a soft delete by setting is_active = 0 for now,
    // or just delete if it's not the last admin?
    // Let's just delete for now but prevent deleting the last admin.

    let admin_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = 1")
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

    let user_to_delete: (String,) = sqlx::query_as("SELECT role FROM users WHERE id = ?")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if user_to_delete.0 == "admin" && admin_count.0 <= 1 {
        return Err("Cannot delete the last active administrator".to_string());
    }

    sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to delete user: {}", e))?;

    Ok("User deleted successfully".to_string())
}

#[tauri::command]
pub async fn reset_user_password(
    registry: State<'_, Arc<DbRegistry>>,
    data: ResetPasswordRequest,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    if data.password.len() < 4 {
        return Err("Password must be at least 4 characters".to_string());
    }

    let password_hash =
        hash(data.password, DEFAULT_COST).map_err(|e| format!("Failed to hash password: {}", e))?;

    sqlx::query("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(password_hash)
        .bind(data.id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to reset password: {}", e))?;

    Ok("Password reset successfully".to_string())
}

// Login command
#[tauri::command]
pub async fn login(
    registry: State<'_, Arc<DbRegistry>>,
    session_store: State<'_, SessionStore>,
    username: String,
    password: String,
) -> Result<LoginResponse, String> {
    let pool = registry.active_pool().await?;
    // Fetch user from database
    let user_result: Result<(String, String, String, Option<String>, String, i64), sqlx::Error> =
        sqlx::query_as(
            "SELECT id, username, password_hash, full_name, role, is_active 
             FROM users WHERE username = ?",
        )
        .bind(username.trim())
        .fetch_one(&pool)
        .await;

    match user_result {
        Ok((id, username, password_hash, full_name, role, is_active_int)) => {
            let is_active = is_active_int != 0;
            // Check if user is active
            if !is_active {
                return Ok(LoginResponse {
                    success: false,
                    message: "User account is disabled".to_string(),
                    token: None,
                    user: None,
                });
            }

            // Verify password
            let password_valid = verify(password, &password_hash)
                .map_err(|e| format!("Password verification error: {}", e))?;

            if !password_valid {
                return Ok(LoginResponse {
                    success: false,
                    message: "Invalid username or password".to_string(),
                    token: None,
                    user: None,
                });
            }

            // Update last login time
            let _ = sqlx::query("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(&id)
                .execute(&pool)
                .await;

            // Create session
            let token = session_store.create_session(id.clone());

            Ok(LoginResponse {
                success: true,
                message: "Login successful".to_string(),
                token: Some(token),
                user: Some(User {
                    id,
                    username,
                    full_name,
                    role,
                    is_active,
                }),
            })
        }
        Err(e) => {
            let error_msg = if let sqlx::Error::RowNotFound = e {
                "Invalid username or password".to_string()
            } else {
                format!("Database error during login: {}", e)
            };

            Ok(LoginResponse {
                success: false,
                message: error_msg,
                token: None,
                user: None,
            })
        }
    }
}

// Logout command
#[tauri::command]
pub async fn logout(
    session_store: State<'_, SessionStore>,
    token: String,
) -> Result<String, String> {
    session_store.remove_session(&token);
    Ok("Logged out successfully".to_string())
}

// Check session validity
#[tauri::command]
pub async fn check_session(
    registry: State<'_, Arc<DbRegistry>>,
    session_store: State<'_, SessionStore>,
    token: String,
) -> Result<SessionCheckResponse, String> {
    let pool = registry.active_pool().await?;
    match session_store.get_user_id(&token) {
        Some(user_id) => {
            // Fetch user details
            let user_result: Result<(String, String, Option<String>, String, i64), sqlx::Error> =
                sqlx::query_as(
                    "SELECT id, username, full_name, role, is_active 
                     FROM users WHERE id = ?",
                )
                .bind(user_id)
                .fetch_one(&pool)
                .await;

            match user_result {
                Ok((id, username, full_name, role, is_active_int)) => {
                    let is_active = is_active_int != 0;
                    if !is_active {
                        session_store.remove_session(&token);
                        return Ok(SessionCheckResponse {
                            valid: false,
                            user: None,
                        });
                    }

                    Ok(SessionCheckResponse {
                        valid: true,
                        user: Some(User {
                            id,
                            username,
                            full_name,
                            role,
                            is_active,
                        }),
                    })
                }
                Err(_) => {
                    session_store.remove_session(&token);
                    Ok(SessionCheckResponse {
                        valid: false,
                        user: None,
                    })
                }
            }
        }
        None => Ok(SessionCheckResponse {
            valid: false,
            user: None,
        }),
    }
}
