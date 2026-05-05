use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use crate::company_db::DbRegistry;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

// ============= SERVICE =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Service {
    pub id: String,
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub unit_id: Option<String>,
    pub unit_symbol: Option<String>,
    pub hsn_sac_code: Option<String>,
    pub gst_slab_id: Option<String>,
    pub sales_rate: f64,
    pub purchase_rate: f64,
    pub is_active: i64,
    pub created_at: String,
    pub has_transactions: bool,
}

#[derive(Deserialize)]
pub struct CreateService {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub unit_id: Option<String>,
    pub hsn_sac_code: Option<String>,
    pub gst_slab_id: Option<String>,
    pub sales_rate: f64,
    pub purchase_rate: f64,
}

async fn generate_service_code(pool: &SqlitePool) -> Result<String, String> {
    let last_code: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(CAST(code AS INTEGER)) FROM services WHERE code GLOB '[0-9]*'",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten();

    let next_code = last_code.unwrap_or(1999) + 1; // start from 2000 to avoid colliding with product codes
    Ok(next_code.to_string())
}

#[tauri::command]
pub async fn get_next_service_code(registry: State<'_, Arc<DbRegistry>>) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    generate_service_code(&pool).await
}

#[tauri::command]
pub async fn get_services(registry: State<'_, Arc<DbRegistry>>) -> Result<Vec<Service>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, Service>(
        "SELECT
            s.id, s.code, s.name, s.description,
            s.unit_id, u.symbol as unit_symbol,
            s.hsn_sac_code, s.gst_slab_id,
            s.sales_rate, s.purchase_rate,
            s.is_active, s.created_at,
            EXISTS(SELECT 1 FROM voucher_items vi WHERE vi.service_id = s.id) as has_transactions
         FROM services s
         LEFT JOIN units u ON s.unit_id = u.id
         WHERE s.deleted_at IS NULL
         ORDER BY s.name ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_service(
    registry: State<'_, Arc<DbRegistry>>,
    service: CreateService,
) -> Result<Service, String> {
    let pool = registry.active_pool().await?;
    let id = Uuid::now_v7().to_string();
    let code = if service.code.trim().is_empty() {
        generate_service_code(&pool).await?
    } else {
        service.code.trim().to_string()
    };

    sqlx::query(
        "INSERT INTO services (id, code, name, description, unit_id, hsn_sac_code, gst_slab_id, sales_rate, purchase_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&code)
    .bind(&service.name)
    .bind(&service.description)
    .bind(&service.unit_id)
    .bind(&service.hsn_sac_code)
    .bind(&service.gst_slab_id)
    .bind(round2(service.sales_rate))
    .bind(round2(service.purchase_rate))
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Service>(
        "SELECT
            s.id, s.code, s.name, s.description,
            s.unit_id, u.symbol as unit_symbol,
            s.hsn_sac_code, s.gst_slab_id,
            s.sales_rate, s.purchase_rate,
            s.is_active, s.created_at,
            EXISTS(SELECT 1 FROM voucher_items vi WHERE vi.service_id = s.id) as has_transactions
         FROM services s
         LEFT JOIN units u ON s.unit_id = u.id
         WHERE s.id = ?",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_service(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    service: CreateService,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    sqlx::query(
        "UPDATE services
         SET code = ?, name = ?, description = ?, unit_id = ?, hsn_sac_code = ?,
             gst_slab_id = ?, sales_rate = ?, purchase_rate = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?",
    )
    .bind(&service.code)
    .bind(&service.name)
    .bind(&service.description)
    .bind(&service.unit_id)
    .bind(&service.hsn_sac_code)
    .bind(&service.gst_slab_id)
    .bind(round2(service.sales_rate))
    .bind(round2(service.purchase_rate))
    .bind(&id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_service(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Block deletion if service has transactions
    let ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM voucher_items WHERE service_id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

    if ref_count > 0 {
        return Err("Cannot delete service — it has existing transactions.".to_string());
    }

    sqlx::query(
        "UPDATE services SET deleted_at = CURRENT_TIMESTAMP, is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}
