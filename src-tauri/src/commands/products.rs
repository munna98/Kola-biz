use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

// ============= PRODUCT GROUPS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ProductGroup {
    pub id: i64,
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
    let result = sqlx::query("INSERT INTO product_groups (name, description) VALUES (?, ?)")
        .bind(&group.name)
        .bind(&group.description)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let id = result.last_insert_rowid();

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
    id: i64,
    group: CreateProductGroup,
) -> Result<(), String> {
    sqlx::query("UPDATE product_groups SET name = ?, description = ? WHERE id = ?")
        .bind(&group.name)
        .bind(&group.description)
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_product_group(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    // Check if any product is using this group
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM products WHERE group_id = ? AND deleted_at IS NULL")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if count.0 > 0 {
        return Err("Cannot delete group as it is assigned to one or more products.".to_string());
    }

    sqlx::query(
        "UPDATE product_groups SET deleted_at = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ?",
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
    pub id: i64,
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
    let result = sqlx::query("INSERT INTO units (name, symbol) VALUES (?, ?)")
        .bind(&unit.name)
        .bind(&unit.symbol)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let id = result.last_insert_rowid();

    sqlx::query_as::<_, Unit>("SELECT * FROM units WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_unit(
    pool: State<'_, SqlitePool>,
    id: i64,
    unit: CreateUnit,
) -> Result<(), String> {
    sqlx::query("UPDATE units SET name = ?, symbol = ? WHERE id = ?")
        .bind(&unit.name)
        .bind(&unit.symbol)
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_unit(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
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
    pub id: i64,
    pub code: String,
    pub name: String,
    pub group_id: Option<i64>,
    pub unit_id: i64,
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
    pub group_id: Option<i64>,
    pub unit_id: i64,
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
    let result = sqlx::query(
        "INSERT INTO products (code, name, group_id, unit_id, purchase_rate, sales_rate, mrp) 
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&product.code)
    .bind(&product.name)
    .bind(product.group_id)
    .bind(product.unit_id)
    .bind(product.purchase_rate)
    .bind(product.sales_rate)
    .bind(product.mrp)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let id = result.last_insert_rowid();

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
    id: i64,
    product: CreateProduct,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE products 
         SET code = ?, name = ?, group_id = ?, unit_id = ?, purchase_rate = ?, sales_rate = ?, mrp = ? 
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
    id: i64,
    deleted_by: String,
) -> Result<(), String> {
    // Check for references in voucher_items
    let ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM voucher_items WHERE product_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if ref_count > 0 {
        return Err("Cannot delete product as it is referenced in vouchers.".to_string());
    }

    // Check for references in stock_movements
    let stock_ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements WHERE product_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if stock_ref_count > 0 {
        return Err("Cannot delete product as it has stock movement records.".to_string());
    }

    sqlx::query(
        "UPDATE products 
         SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, is_active = 0 
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
pub async fn restore_product(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query(
        "UPDATE products 
         SET deleted_at = NULL, deleted_by = NULL, is_active = 1 
         WHERE id = ?",
    )
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_product(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    // Reference checks (same as soft delete)
    let ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM voucher_items WHERE product_id = ?")
            .bind(id)
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
            .bind(id)
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
