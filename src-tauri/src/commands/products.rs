use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use tauri::State;
use uuid::Uuid;

// ============= PRODUCT GROUPS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ProductGroup {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateProductGroup {
    pub name: String,
    pub description: Option<String>,
}

async fn generate_product_code(pool: &SqlitePool) -> Result<String, String> {
    let last_code: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(CAST(code AS INTEGER)) FROM products WHERE code GLOB '[0-9]*'",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten();

    let next_code = last_code.unwrap_or(100) + 1;
    Ok(next_code.to_string())
}

#[tauri::command]
pub async fn get_next_product_code(pool: State<'_, SqlitePool>) -> Result<String, String> {
    generate_product_code(pool.inner()).await
}

#[tauri::command]
pub async fn get_product_groups(pool: State<'_, SqlitePool>) -> Result<Vec<ProductGroup>, String> {
    sqlx::query_as::<_, ProductGroup>(
        "SELECT id, name, description, is_active, created_at FROM product_groups WHERE deleted_at IS NULL ORDER BY name ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_product_group(
    pool: State<'_, SqlitePool>,
    group: CreateProductGroup,
) -> Result<ProductGroup, String> {
    let id = Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO product_groups (id, name, description) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&group.name)
        .bind(&group.description)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, ProductGroup>(
        "SELECT id, name, description, is_active, created_at FROM product_groups WHERE id = ?",
    )
    .bind(id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_product_group(
    pool: State<'_, SqlitePool>,
    id: String,
    group: CreateProductGroup,
) -> Result<(), String> {
    sqlx::query("UPDATE product_groups SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&group.name)
        .bind(&group.description)
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_product_group(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    // Check if any product is using this group
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM products WHERE group_id = ? AND deleted_at IS NULL")
            .bind(&id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if count.0 > 0 {
        return Err("Cannot delete group as it is assigned to one or more products.".to_string());
    }

    sqlx::query(
        "UPDATE product_groups SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ?",
    )
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ============= UNITS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Unit {
    pub id: String,
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
    let id = Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO units (id, name, symbol) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&unit.name)
        .bind(&unit.symbol)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Unit>("SELECT * FROM units WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_unit(
    pool: State<'_, SqlitePool>,
    id: String,
    unit: CreateUnit,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE units SET name = ?, symbol = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(&unit.name)
    .bind(&unit.symbol)
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_unit(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
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
    pub id: String,
    pub code: String,
    pub name: String,
    pub group_id: Option<String>,
    pub unit_id: String,
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
    pub group_id: Option<String>,
    pub unit_id: String,
    pub purchase_rate: f64,
    pub sales_rate: f64,
    pub mrp: f64,
}

#[tauri::command]
pub async fn get_products(pool: State<'_, SqlitePool>) -> Result<Vec<Product>, String> {
    sqlx::query_as::<_, Product>(
        "SELECT id, code, name, group_id, unit_id, purchase_rate, sales_rate, mrp, is_active, created_at 
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
    let id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO products (id, code, name, group_id, unit_id, purchase_rate, sales_rate, mrp) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(if product.code.is_empty() {
        generate_product_code(pool.inner()).await?
    } else {
        product.code
    })
    .bind(&product.name)
    .bind(product.group_id)
    .bind(product.unit_id)
    .bind(product.purchase_rate)
    .bind(product.sales_rate)
    .bind(product.mrp)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Product>(
        "SELECT id, code, name, group_id, unit_id, purchase_rate, sales_rate, mrp, is_active, created_at 
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
    id: String,
    product: CreateProduct,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE products 
         SET code = ?, name = ?, group_id = ?, unit_id = ?, purchase_rate = ?, sales_rate = ?, mrp = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?",
    )
    .bind(&product.code)
    .bind(&product.name)
    .bind(product.group_id)
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
    id: String,
    deleted_by: String,
) -> Result<(), String> {
    // Check for references in voucher_items
    let ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM voucher_items WHERE product_id = ?")
            .bind(&id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if ref_count > 0 {
        return Err("Cannot delete product as it is referenced in vouchers.".to_string());
    }

    // Check for references in stock_movements
    let stock_ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements WHERE product_id = ?")
            .bind(&id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if stock_ref_count > 0 {
        return Err("Cannot delete product as it has stock movement records.".to_string());
    }

    sqlx::query(
        "UPDATE products 
         SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, is_active = 0, updated_at = CURRENT_TIMESTAMP 
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
        "SELECT id, code, name, group_id, unit_id, purchase_rate, sales_rate, mrp, is_active, created_at 
         FROM products
         WHERE deleted_at IS NOT NULL 
         ORDER BY deleted_at DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_product(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    sqlx::query(
        "UPDATE products 
         SET deleted_at = NULL, deleted_by = NULL, is_active = 1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?",
    )
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_product(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    // Reference checks (same as soft delete)
    let ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM voucher_items WHERE product_id = ?")
            .bind(&id)
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
            .bind(&id)
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
