use serde::{Deserialize, Serialize};
use sqlx::{Sqlite, SqlitePool, Transaction};

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
    pub is_default: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateUnit {
    pub name: String,
    pub symbol: String,
    #[serde(default)]
    pub is_default: bool,
}

#[tauri::command]
pub async fn get_units(pool: State<'_, SqlitePool>) -> Result<Vec<Unit>, String> {
    sqlx::query_as::<_, Unit>("SELECT * FROM units ORDER BY is_default DESC, name ASC")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_unit(pool: State<'_, SqlitePool>, unit: CreateUnit) -> Result<Unit, String> {
    let id = Uuid::now_v7().to_string();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let has_units = has_any_units(&mut tx).await?;
    let should_be_default = unit.is_default || !has_units;

    if should_be_default {
        clear_default_unit(&mut tx).await?;
    }

    sqlx::query("INSERT INTO units (id, name, symbol, is_default) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&unit.name)
        .bind(&unit.symbol)
        .bind(if should_be_default { 1 } else { 0 })
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

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
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    if unit.is_default {
        clear_default_unit(&mut tx).await?;
    }

    sqlx::query(
        "UPDATE units SET name = ?, symbol = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(&unit.name)
    .bind(&unit.symbol)
    .bind(if unit.is_default { 1 } else { 0 })
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    ensure_default_unit(&mut tx).await?;
    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_unit(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM units WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    ensure_default_unit(&mut tx).await?;
    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

async fn has_any_units(tx: &mut Transaction<'_, Sqlite>) -> Result<bool, String> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM units")
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    Ok(count > 0)
}

async fn clear_default_unit(tx: &mut Transaction<'_, Sqlite>) -> Result<(), String> {
    sqlx::query("UPDATE units SET is_default = 0")
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

async fn ensure_default_unit(tx: &mut Transaction<'_, Sqlite>) -> Result<(), String> {
    let default_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM units WHERE is_default = 1")
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    if default_count == 0 {
        sqlx::query(
            "UPDATE units
             SET is_default = 1
             WHERE id = (SELECT id FROM units ORDER BY name ASC LIMIT 1)",
        )
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    }

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
    pub has_transactions: bool,
}

#[derive(Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct ProductUnitConversion {
    pub id: String,
    pub product_id: String,
    pub unit_id: String,
    pub factor_to_base: f64,
    pub purchase_rate: f64,
    pub sales_rate: f64,
    pub is_default_sale: i64,
    pub is_default_purchase: i64,
    pub is_default_report: i64,
    pub unit_name: String,
    pub unit_symbol: String,
}

#[derive(Deserialize, Clone)]
pub struct ProductUnitConversionInput {
    pub unit_id: String,
    pub factor_to_base: f64,
    #[serde(default)]
    pub purchase_rate: f64,
    #[serde(default)]
    pub sales_rate: f64,
    #[serde(default)]
    pub is_default_sale: bool,
    #[serde(default)]
    pub is_default_purchase: bool,
    #[serde(default)]
    pub is_default_report: bool,
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
    #[serde(default)]
    pub conversions: Vec<ProductUnitConversionInput>,
}

fn normalize_product_unit_conversions(
    base_unit_id: &str,
    base_purchase_rate: f64,
    base_sales_rate: f64,
    conversions: &[ProductUnitConversionInput],
) -> Vec<ProductUnitConversionInput> {
    let mut normalized = Vec::<ProductUnitConversionInput>::new();

    for conversion in conversions {
        if conversion.unit_id.trim().is_empty() {
            continue;
        }

        if let Some(existing) = normalized.iter_mut().find(|item| item.unit_id == conversion.unit_id) {
            *existing = conversion.clone();
        } else {
            normalized.push(conversion.clone());
        }
    }

    if let Some(base_row) = normalized.iter_mut().find(|item| item.unit_id == base_unit_id) {
        base_row.factor_to_base = 1.0;
        base_row.purchase_rate = base_purchase_rate;
        base_row.sales_rate = base_sales_rate;
    } else {
        normalized.push(ProductUnitConversionInput {
            unit_id: base_unit_id.to_string(),
            factor_to_base: 1.0,
            purchase_rate: base_purchase_rate,
            sales_rate: base_sales_rate,
            is_default_sale: normalized.is_empty(),
            is_default_purchase: normalized.is_empty(),
            is_default_report: normalized.is_empty(),
        });
    }

    if normalized.len() == 1 {
        normalized[0].is_default_sale = true;
        normalized[0].is_default_purchase = true;
        normalized[0].is_default_report = true;
    }

    if !normalized.iter().any(|item| item.is_default_sale) {
        if let Some(base_row) = normalized.iter_mut().find(|item| item.unit_id == base_unit_id) {
            base_row.is_default_sale = true;
        }
    }
    if !normalized.iter().any(|item| item.is_default_purchase) {
        if let Some(base_row) = normalized.iter_mut().find(|item| item.unit_id == base_unit_id) {
            base_row.is_default_purchase = true;
        }
    }
    if !normalized.iter().any(|item| item.is_default_report) {
        if let Some(base_row) = normalized.iter_mut().find(|item| item.unit_id == base_unit_id) {
            base_row.is_default_report = true;
        }
    }

    let mut sale_taken = false;
    let mut purchase_taken = false;
    let mut report_taken = false;
    for conversion in &mut normalized {
        if conversion.is_default_sale {
            if sale_taken {
                conversion.is_default_sale = false;
            } else {
                sale_taken = true;
            }
        }
        if conversion.is_default_purchase {
            if purchase_taken {
                conversion.is_default_purchase = false;
            } else {
                purchase_taken = true;
            }
        }
        if conversion.is_default_report {
            if report_taken {
                conversion.is_default_report = false;
            } else {
                report_taken = true;
            }
        }
    }

    normalized
}

async fn replace_product_unit_conversions(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: &str,
    base_unit_id: &str,
    base_purchase_rate: f64,
    base_sales_rate: f64,
    conversions: &[ProductUnitConversionInput],
) -> Result<(), String> {
    let normalized = normalize_product_unit_conversions(
        base_unit_id,
        base_purchase_rate,
        base_sales_rate,
        conversions,
    );

    sqlx::query("DELETE FROM product_unit_conversions WHERE product_id = ?")
        .bind(product_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    for conversion in normalized {
        sqlx::query(
            "INSERT INTO product_unit_conversions (
                id, product_id, unit_id, factor_to_base, purchase_rate, sales_rate, is_default_sale, is_default_purchase, is_default_report
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(product_id)
        .bind(&conversion.unit_id)
        .bind(conversion.factor_to_base)
        .bind(conversion.purchase_rate)
        .bind(conversion.sales_rate)
        .bind(if conversion.is_default_sale { 1 } else { 0 })
        .bind(if conversion.is_default_purchase { 1 } else { 0 })
        .bind(if conversion.is_default_report { 1 } else { 0 })
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_all_product_unit_conversions(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ProductUnitConversion>, String> {
    sqlx::query_as::<_, ProductUnitConversion>(
        "SELECT
            puc.id,
            puc.product_id,
            puc.unit_id,
            puc.factor_to_base,
            puc.purchase_rate,
            puc.sales_rate,
            puc.is_default_sale,
            puc.is_default_purchase,
            puc.is_default_report,
            u.name as unit_name,
            u.symbol as unit_symbol
         FROM product_unit_conversions puc
         JOIN units u ON puc.unit_id = u.id
         ORDER BY puc.product_id, puc.factor_to_base ASC, u.name ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_product_unit_conversions(
    pool: State<'_, SqlitePool>,
    product_id: String,
) -> Result<Vec<ProductUnitConversion>, String> {
    sqlx::query_as::<_, ProductUnitConversion>(
        "SELECT
            puc.id,
            puc.product_id,
            puc.unit_id,
            puc.factor_to_base,
            puc.purchase_rate,
            puc.sales_rate,
            puc.is_default_sale,
            puc.is_default_purchase,
            puc.is_default_report,
            u.name as unit_name,
            u.symbol as unit_symbol
         FROM product_unit_conversions puc
         JOIN units u ON puc.unit_id = u.id
         WHERE puc.product_id = ?
         ORDER BY puc.factor_to_base ASC, u.name ASC",
    )
    .bind(product_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_products(pool: State<'_, SqlitePool>) -> Result<Vec<Product>, String> {
    sqlx::query_as::<_, Product>(
        "SELECT id, code, name, group_id, unit_id, purchase_rate, sales_rate, mrp, is_active, created_at,
                EXISTS(SELECT 1 FROM voucher_items vi WHERE vi.product_id = products.id) as has_transactions
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
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
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
    .bind(product.group_id.clone())
    .bind(&product.unit_id)
    .bind(product.purchase_rate)
    .bind(product.sales_rate)
    .bind(product.mrp)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    replace_product_unit_conversions(
        &mut tx,
        &id,
        &product.unit_id,
        product.purchase_rate,
        product.sales_rate,
        &product.conversions,
    )
    .await?;

    tx.commit().await.map_err(|e| e.to_string())?;

    sqlx::query_as::<_, Product>(
        "SELECT id, code, name, group_id, unit_id, purchase_rate, sales_rate, mrp, is_active, created_at,
                EXISTS(SELECT 1 FROM voucher_items vi WHERE vi.product_id = products.id) as has_transactions
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
    let existing_unit_id: Option<String> =
        sqlx::query_scalar("SELECT unit_id FROM products WHERE id = ?")
            .bind(&id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if let Some(current_unit_id) = existing_unit_id {
        if current_unit_id != product.unit_id {
            let ref_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM voucher_items WHERE product_id = ?")
                    .bind(&id)
                    .fetch_one(pool.inner())
                    .await
                    .map_err(|e| e.to_string())?;

            if ref_count > 0 {
                return Err(
                    "Cannot change the product unit after transactions exist for this product."
                        .to_string(),
                );
            }
        }
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE products 
         SET code = ?, name = ?, group_id = ?, unit_id = ?, purchase_rate = ?, sales_rate = ?, mrp = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?",
    )
    .bind(&product.code)
    .bind(&product.name)
    .bind(product.group_id)
    .bind(&product.unit_id)
    .bind(product.purchase_rate)
    .bind(product.sales_rate)
    .bind(product.mrp)
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    replace_product_unit_conversions(
        &mut tx,
        &id,
        &product.unit_id,
        product.purchase_rate,
        product.sales_rate,
        &product.conversions,
    )
    .await?;

    tx.commit().await.map_err(|e| e.to_string())?;

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
        "SELECT id, code, name, group_id, unit_id, purchase_rate, sales_rate, mrp, is_active, created_at,
                EXISTS(SELECT 1 FROM voucher_items vi WHERE vi.product_id = products.id) as has_transactions
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
