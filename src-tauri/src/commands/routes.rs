use crate::company_db::DbRegistry;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Route {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateRoute {
    pub name: String,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn list_routes(registry: State<'_, Arc<DbRegistry>>) -> Result<Vec<Route>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, Route>(
        "SELECT id, name, description, is_active, created_at FROM routes WHERE is_active = 1 ORDER BY name ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_route(
    registry: State<'_, Arc<DbRegistry>>,
    route: CreateRoute,
) -> Result<Route, String> {
    let pool = registry.active_pool().await?;
    let id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO routes (id, name, description) VALUES (?, ?, ?)",
    )
    .bind(&id)
    .bind(&route.name)
    .bind(&route.description)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Route>(
        "SELECT id, name, description, is_active, created_at FROM routes WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_route(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    route: CreateRoute,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    sqlx::query(
        "UPDATE routes SET name = ?, description = ? WHERE id = ?",
    )
    .bind(&route.name)
    .bind(&route.description)
    .bind(&id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_route(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    sqlx::query("UPDATE routes SET is_active = 0 WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
