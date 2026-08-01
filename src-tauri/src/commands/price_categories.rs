use crate::company_db::DbRegistry;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ============= DATA MODELS =============

#[derive(Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct PriceCategory {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_default: i64,
    pub is_active: i64,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreatePriceCategory {
    pub name: String,
    pub description: Option<String>,
    pub is_default: Option<bool>,
    pub sort_order: Option<i64>,
}

#[derive(Deserialize)]
pub struct UpdatePriceCategory {
    pub name: String,
    pub description: Option<String>,
    pub is_default: Option<bool>,
    pub sort_order: Option<i64>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct ProductPriceListEntry {
    pub id: String,
    pub price_category_id: String,
    pub product_id: String,
    pub unit_id: String,
    pub sales_rate: f64,
    pub is_active: i64,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct UpsertPriceListItem {
    pub price_category_id: String,
    pub product_id: String,
    pub unit_id: String,
    pub sales_rate: f64,
}

/// Full price matrix row returned for a product (all categories × all units)
#[derive(Serialize, sqlx::FromRow)]
pub struct ProductCategoryPriceRow {
    pub category_id: String,
    pub category_name: String,
    pub unit_id: String,
    pub unit_name: String,
    pub unit_symbol: String,
    pub sales_rate: f64,
}

// ============= COMMANDS =============

/// List all active price categories ordered by sort_order, then name.
#[tauri::command]
pub async fn list_price_categories(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<PriceCategory>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, PriceCategory>(
        "SELECT id, name, description, is_default, is_active, sort_order, created_at, updated_at
         FROM price_categories
         WHERE is_active = 1
         ORDER BY sort_order ASC, name ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

/// Create a new price category. Returns the created record.
#[tauri::command]
pub async fn create_price_category(
    registry: State<'_, Arc<DbRegistry>>,
    category: CreatePriceCategory,
) -> Result<PriceCategory, String> {
    let pool = registry.active_pool().await?;
    let id = Uuid::now_v7().to_string();
    let is_default = category.is_default.unwrap_or(false) as i64;
    let sort_order = category.sort_order.unwrap_or(0);

    // If this is being set as default, clear other defaults first
    if is_default == 1 {
        sqlx::query("UPDATE price_categories SET is_default = 0")
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        "INSERT INTO price_categories (id, name, description, is_default, sort_order)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&category.name)
    .bind(&category.description)
    .bind(is_default)
    .bind(sort_order)
    .execute(&pool)
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE constraint") {
            format!("A price category with the name '{}' already exists.", category.name)
        } else {
            e.to_string()
        }
    })?;

    sqlx::query_as::<_, PriceCategory>(
        "SELECT id, name, description, is_default, is_active, sort_order, created_at, updated_at
         FROM price_categories WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())
}

/// Update an existing price category.
#[tauri::command]
pub async fn update_price_category(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    category: UpdatePriceCategory,
) -> Result<PriceCategory, String> {
    let pool = registry.active_pool().await?;
    let is_default = category.is_default.unwrap_or(false) as i64;
    let sort_order = category.sort_order.unwrap_or(0);

    // If this is being set as default, clear other defaults first
    if is_default == 1 {
        sqlx::query("UPDATE price_categories SET is_default = 0 WHERE id != ?")
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        "UPDATE price_categories
         SET name = ?, description = ?, is_default = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?",
    )
    .bind(&category.name)
    .bind(&category.description)
    .bind(is_default)
    .bind(sort_order)
    .bind(&id)
    .execute(&pool)
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE constraint") {
            format!("A price category with the name '{}' already exists.", category.name)
        } else {
            e.to_string()
        }
    })?;

    sqlx::query_as::<_, PriceCategory>(
        "SELECT id, name, description, is_default, is_active, sort_order, created_at, updated_at
         FROM price_categories WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())
}

/// Soft-delete a price category (sets is_active = 0).
/// Fails if the category has price list entries referencing it.
#[tauri::command]
pub async fn delete_price_category(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;

    // Check for existing price list entries
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM product_price_list WHERE price_category_id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

    if count > 0 {
        return Err(format!(
            "Cannot delete this price category — it has {} price list entries. Remove the prices first.",
            count
        ));
    }

    sqlx::query("UPDATE price_categories SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Returns all product_price_list rows for a given product (all categories, all units).
#[tauri::command]
pub async fn get_product_price_list(
    registry: State<'_, Arc<DbRegistry>>,
    product_id: String,
) -> Result<Vec<ProductPriceListEntry>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, ProductPriceListEntry>(
        "SELECT id, price_category_id, product_id, unit_id, sales_rate, is_active, updated_at
         FROM product_price_list
         WHERE product_id = ?
         ORDER BY price_category_id, unit_id",
    )
    .bind(&product_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

/// Bulk insert-or-update price list entries. Only processes rows with product_id set.
#[tauri::command]
pub async fn upsert_product_price_list(
    registry: State<'_, Arc<DbRegistry>>,
    entries: Vec<UpsertPriceListItem>,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for entry in entries {
        if entry.product_id.is_empty() || entry.price_category_id.is_empty() || entry.unit_id.is_empty() {
            continue;
        }
        let id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO product_price_list (id, price_category_id, product_id, unit_id, sales_rate, updated_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT (price_category_id, product_id, unit_id)
             DO UPDATE SET sales_rate = excluded.sales_rate, updated_at = CURRENT_TIMESTAMP",
        )
        .bind(&id)
        .bind(&entry.price_category_id)
        .bind(&entry.product_id)
        .bind(&entry.unit_id)
        .bind(entry.sales_rate)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Lookup: given category + product + unit → sales_rate (or None if not found).
#[tauri::command]
pub async fn get_price_for_product_unit(
    registry: State<'_, Arc<DbRegistry>>,
    price_category_id: String,
    product_id: String,
    unit_id: String,
) -> Result<Option<f64>, String> {
    let pool = registry.active_pool().await?;
    let rate: Option<f64> = sqlx::query_scalar(
        "SELECT sales_rate FROM product_price_list
         WHERE price_category_id = ? AND product_id = ? AND unit_id = ? AND is_active = 1",
    )
    .bind(&price_category_id)
    .bind(&product_id)
    .bind(&unit_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten();

    Ok(rate)
}

/// Returns the full price matrix for a product: all categories × all product units.
/// Used by the Quick-Edit Popup in the Purchase Invoice.
#[tauri::command]
pub async fn get_product_all_category_prices(
    registry: State<'_, Arc<DbRegistry>>,
    product_id: String,
) -> Result<Vec<ProductCategoryPriceRow>, String> {
    let pool = registry.active_pool().await?;

    // Build a cross join of (active categories) × (all units for this product).
    // "all units" = base unit from products table UNION all conversion units.
    // This handles products with no conversion rows (base-unit-only products).
    sqlx::query_as::<_, ProductCategoryPriceRow>(
        "WITH product_units AS (
             -- base unit from the product itself
             SELECT p.unit_id AS unit_id
             FROM products p
             WHERE p.id = ?
             UNION
             -- additional units from conversions
             SELECT puc.unit_id
             FROM product_unit_conversions puc
             WHERE puc.product_id = ?
         )
         SELECT
             pc.id          AS category_id,
             pc.name        AS category_name,
             u.id           AS unit_id,
             u.name         AS unit_name,
             u.symbol       AS unit_symbol,
             COALESCE(ppl.sales_rate, 0.0) AS sales_rate
         FROM price_categories pc
         CROSS JOIN product_units pu
         JOIN units u ON u.id = pu.unit_id
         LEFT JOIN product_price_list ppl
             ON ppl.price_category_id = pc.id
            AND ppl.product_id = ?
            AND ppl.unit_id = pu.unit_id
            AND ppl.is_active = 1
         WHERE pc.is_active = 1
         ORDER BY pc.sort_order ASC, pc.name ASC, u.name ASC",
    )
    .bind(&product_id)
    .bind(&product_id)
    .bind(&product_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}
