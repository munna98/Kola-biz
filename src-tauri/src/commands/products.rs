use serde::{Deserialize, Serialize};
use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::company_db::DbRegistry;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::primitives::ByteStream;
use image::GenericImageView;

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

// ============= PRODUCT BRANDS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ProductBrand {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateProductBrand {
    pub name: String,
    pub description: Option<String>,
}

pub(crate) async fn generate_product_code(pool: &SqlitePool) -> Result<String, String> {
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

/// Like generate_product_code but runs inside a transaction so it sees
/// uncommitted inserts made earlier in the same tx (prevents duplicate codes
/// when multiple master-product lines are in one purchase invoice).
pub(crate) async fn generate_product_code_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
) -> Result<String, String> {
    let last_code: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(CAST(code AS INTEGER)) FROM products WHERE code GLOB '[0-9]*'",
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())?
    .flatten();

    let next_code = last_code.unwrap_or(100) + 1;
    Ok(next_code.to_string())
}

/// Create a child product (batch) inside an existing transaction.
/// Inherits name/group/unit/GST from the master and uses the supplied rates.
/// Returns the new child product's ID.
pub(crate) async fn create_child_product_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    master_product_id: &str,
    purchase_rate: f64,
    sales_rate: f64,
    mrp: f64,
) -> Result<String, String> {
    // Fetch master fields needed for the child
    let master: Option<(
        String,
        Option<String>,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
    )> = sqlx::query_as(
        "SELECT name, group_id, brand_id, unit_id, hsn_sac_code, gst_slab_id FROM products WHERE id = ?",
    )
    .bind(master_product_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    let (name, group_id, brand_id, unit_id, hsn_sac_code, gst_slab_id) =
        master.ok_or_else(|| format!("Master product '{}' not found", master_product_id))?;

    // Generate next sequential code within the same transaction
    let code = generate_product_code_in_tx(tx).await?;
    let child_id = Uuid::now_v7().to_string();

    sqlx::query(
        "INSERT INTO products \
         (id, code, name, group_id, brand_id, unit_id, purchase_rate, sales_rate, mrp, \
          barcode, hsn_sac_code, gst_slab_id, is_master, parent_product_id, is_active) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, 1)",
    )
    .bind(&child_id)
    .bind(&code)
    .bind(&name)
    .bind(&group_id)
    .bind(&brand_id)
    .bind(&unit_id)
    .bind(purchase_rate)
    .bind(sales_rate)
    .bind(mrp)
    .bind(&hsn_sac_code)
    .bind(&gst_slab_id)
    .bind(master_product_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| format!("Failed to insert child product: {}", e))?;

    // Insert base unit conversion row for the child
    let puc_id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO product_unit_conversions \
         (id, product_id, unit_id, factor_to_base, purchase_rate, sales_rate, \
          is_default_sale, is_default_purchase, is_default_report) \
         VALUES (?, ?, ?, 1.0, ?, ?, 1, 1, 1)",
    )
    .bind(&puc_id)
    .bind(&child_id)
    .bind(&unit_id)
    .bind(purchase_rate)
    .bind(sales_rate)
    .execute(&mut **tx)
    .await
    .map_err(|e| format!("Failed to insert child product unit conversion: {}", e))?;

    Ok(child_id)
}

#[tauri::command]
pub async fn get_next_product_code(registry: State<'_, Arc<DbRegistry>>) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    generate_product_code(&pool).await
}

#[tauri::command]
pub async fn get_product_groups(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<ProductGroup>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, ProductGroup>(
        "SELECT id, name, description, is_active, created_at FROM product_groups WHERE deleted_at IS NULL ORDER BY name ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_product_group(
    registry: State<'_, Arc<DbRegistry>>,
    group: CreateProductGroup,
) -> Result<ProductGroup, String> {
    let pool = registry.active_pool().await?;
    let id = Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO product_groups (id, name, description) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&group.name)
        .bind(&group.description)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, ProductGroup>(
        "SELECT id, name, description, is_active, created_at FROM product_groups WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_product_group(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    group: CreateProductGroup,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    sqlx::query("UPDATE product_groups SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&group.name)
        .bind(&group.description)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_product_group(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Check if any product is using this group
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM products WHERE group_id = ? AND deleted_at IS NULL")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

    if count.0 > 0 {
        return Err("Cannot delete group as it is assigned to one or more products.".to_string());
    }

    sqlx::query(
        "UPDATE product_groups SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ?",
    )
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_product_brands(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<ProductBrand>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, ProductBrand>(
        "SELECT id, name, description, is_active, created_at FROM product_brands WHERE deleted_at IS NULL ORDER BY name ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_product_brand(
    registry: State<'_, Arc<DbRegistry>>,
    brand: CreateProductBrand,
) -> Result<ProductBrand, String> {
    let pool = registry.active_pool().await?;
    let id = Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO product_brands (id, name, description) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&brand.name)
        .bind(&brand.description)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, ProductBrand>(
        "SELECT id, name, description, is_active, created_at FROM product_brands WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_product_brand(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    brand: CreateProductBrand,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    sqlx::query("UPDATE product_brands SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&brand.name)
        .bind(&brand.description)
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_product_brand(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Check if any product is using this brand
    let count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM products WHERE brand_id = ? AND deleted_at IS NULL")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

    if count.0 > 0 {
        return Err("Cannot delete brand as it is assigned to one or more products.".to_string());
    }

    sqlx::query(
        "UPDATE product_brands SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ?",
    )
    .bind(id)
    .execute(&pool)
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
pub async fn get_units(registry: State<'_, Arc<DbRegistry>>) -> Result<Vec<Unit>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, Unit>("SELECT * FROM units ORDER BY is_default DESC, name ASC")
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_unit(
    registry: State<'_, Arc<DbRegistry>>,
    unit: CreateUnit,
) -> Result<Unit, String> {
    let pool = registry.active_pool().await?;
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
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_unit(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    unit: CreateUnit,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
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
pub async fn delete_unit(registry: State<'_, Arc<DbRegistry>>, id: String) -> Result<(), String> {
    let pool = registry.active_pool().await?;
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
    pub brand_id: Option<String>,
    pub unit_id: String,
    pub purchase_rate: f64,
    pub sales_rate: f64,
    pub mrp: f64,
    pub cost: Option<f64>,
    pub barcode: Option<String>,
    pub is_active: i64,
    pub created_at: String,
    pub has_transactions: bool,
    pub hsn_sac_code: Option<String>,
    pub gst_slab_id: Option<String>,
    pub is_master: i64,
    pub parent_product_id: Option<String>,
    // Vehicle fields
    pub vehicle_manufacturer: Option<String>,
    pub vehicle_model: Option<String>,
    pub vehicle_year: Option<i64>,
    pub vehicle_odometer: Option<f64>,
    pub vehicle_fuel_type: Option<String>,
    pub vehicle_transmission: Option<String>,
    pub vehicle_owner: Option<String>,
    pub vehicle_color: Option<String>,
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
    pub brand_id: Option<String>,
    pub unit_id: String,
    pub purchase_rate: f64,
    pub sales_rate: f64,
    pub mrp: f64,
    pub cost: Option<f64>,
    pub barcode: Option<String>,
    #[serde(default)]
    pub conversions: Vec<ProductUnitConversionInput>,
    pub hsn_sac_code: Option<String>,
    pub gst_slab_id: Option<String>,
    /// When true, this product is a master/template. Its code must be set manually
    /// (e.g. "SHIRT-M"). Auto-generation is blocked. Child batches are created
    /// automatically during purchase entry.
    #[serde(default)]
    pub is_master: bool,
    // Vehicle fields
    pub vehicle_manufacturer: Option<String>,
    pub vehicle_model: Option<String>,
    pub vehicle_year: Option<i64>,
    pub vehicle_odometer: Option<f64>,
    pub vehicle_fuel_type: Option<String>,
    pub vehicle_transmission: Option<String>,
    pub vehicle_owner: Option<String>,
    pub vehicle_color: Option<String>,
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

        if let Some(existing) = normalized
            .iter_mut()
            .find(|item| item.unit_id == conversion.unit_id)
        {
            *existing = conversion.clone();
        } else {
            normalized.push(conversion.clone());
        }
    }

    if let Some(base_row) = normalized
        .iter_mut()
        .find(|item| item.unit_id == base_unit_id)
    {
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
        if let Some(base_row) = normalized
            .iter_mut()
            .find(|item| item.unit_id == base_unit_id)
        {
            base_row.is_default_sale = true;
        }
    }
    if !normalized.iter().any(|item| item.is_default_purchase) {
        if let Some(base_row) = normalized
            .iter_mut()
            .find(|item| item.unit_id == base_unit_id)
        {
            base_row.is_default_purchase = true;
        }
    }
    if !normalized.iter().any(|item| item.is_default_report) {
        if let Some(base_row) = normalized
            .iter_mut()
            .find(|item| item.unit_id == base_unit_id)
        {
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
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<ProductUnitConversion>, String> {
    let pool = registry.active_pool().await?;
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
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_product_unit_conversions(
    registry: State<'_, Arc<DbRegistry>>,
    product_id: String,
) -> Result<Vec<ProductUnitConversion>, String> {
    let pool = registry.active_pool().await?;
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
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_products(registry: State<'_, Arc<DbRegistry>>) -> Result<Vec<Product>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, Product>(
        "SELECT id, code, name, group_id, brand_id, unit_id, purchase_rate, sales_rate, mrp, cost, barcode, is_active, created_at,
                EXISTS(SELECT 1 FROM voucher_items vi WHERE vi.product_id = products.id) as has_transactions,
                hsn_sac_code, gst_slab_id,
                COALESCE(is_master, 0) as is_master,
                parent_product_id,
                vehicle_manufacturer, vehicle_model, vehicle_year, vehicle_odometer, vehicle_fuel_type, vehicle_transmission, vehicle_owner, vehicle_color
         FROM products
         WHERE deleted_at IS NULL 
         ORDER BY created_at DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_product(
    registry: State<'_, Arc<DbRegistry>>,
    product: CreateProduct,
) -> Result<Product, String> {
    let pool = registry.active_pool().await?;

    // Check for duplicate names if setting is enabled
    let prevent_duplicates: i64 = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM app_settings WHERE setting_key = 'prevent_duplicate_product_names' AND (setting_value = 'true' OR setting_value = '\"true\"'))"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    if prevent_duplicates == 1 {
        let name_exists: i64 = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM products WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL)"
        )
        .bind(&product.name)
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

        if name_exists == 1 {
            return Err(format!("A product with the name '{}' already exists.", product.name));
        }
    }

    let id = Uuid::now_v7().to_string();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Master products MUST have a manually typed code — no auto-generation
    let code = if product.is_master {
        if product.code.trim().is_empty() {
            return Err("Code is required for master products. Enter a unique alphanumeric code (e.g. SHIRT-M).".to_string());
        }
        product.code.clone()
    } else if product.code.is_empty() {
        generate_product_code(&pool).await?
    } else {
        product.code.clone()
    };

    sqlx::query(
        "INSERT INTO products (id, code, name, group_id, brand_id, unit_id, purchase_rate, sales_rate, mrp, cost, barcode, hsn_sac_code, gst_slab_id, is_master,
                              vehicle_manufacturer, vehicle_model, vehicle_year, vehicle_odometer, vehicle_fuel_type, vehicle_transmission, vehicle_owner, vehicle_color) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&code)
    .bind(&product.name)
    .bind(product.group_id.clone())
    .bind(product.brand_id.clone())
    .bind(&product.unit_id)
    .bind(product.purchase_rate)
    .bind(product.sales_rate)
    .bind(product.mrp)
    .bind(product.cost)
    .bind(&product.barcode)
    .bind(&product.hsn_sac_code)
    .bind(&product.gst_slab_id)
    .bind(if product.is_master { 1i64 } else { 0i64 })
    .bind(&product.vehicle_manufacturer)
    .bind(&product.vehicle_model)
    .bind(product.vehicle_year)
    .bind(product.vehicle_odometer)
    .bind(&product.vehicle_fuel_type)
    .bind(&product.vehicle_transmission)
    .bind(&product.vehicle_owner)
    .bind(&product.vehicle_color)
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
        "SELECT id, code, name, group_id, brand_id, unit_id, purchase_rate, sales_rate, mrp, cost, barcode, is_active, created_at,
                EXISTS(SELECT 1 FROM voucher_items vi WHERE vi.product_id = products.id) as has_transactions,
                hsn_sac_code, gst_slab_id,
                COALESCE(is_master, 0) as is_master,
                parent_product_id,
                vehicle_manufacturer, vehicle_model, vehicle_year, vehicle_odometer, vehicle_fuel_type, vehicle_transmission, vehicle_owner, vehicle_color
         FROM products WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_create_products(
    registry: State<'_, Arc<DbRegistry>>,
    products: Vec<CreateProduct>,
) -> Result<usize, String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let count = products.len();

    for product in products {
        let id = Uuid::now_v7().to_string();

        let code = if product.is_master {
            if product.code.trim().is_empty() {
                return Err("Code is required for master products.".to_string());
            }
            product.code.clone()
        } else if product.code.is_empty() {
            generate_product_code_in_tx(&mut tx).await?
        } else {
            product.code.clone()
        };

        sqlx::query(
            "INSERT INTO products (id, code, name, group_id, brand_id, unit_id, purchase_rate, sales_rate, mrp, barcode, hsn_sac_code, gst_slab_id, is_master) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&code)
        .bind(&product.name)
        .bind(product.group_id.clone())
        .bind(product.brand_id.clone())
        .bind(&product.unit_id)
        .bind(product.purchase_rate)
        .bind(product.sales_rate)
        .bind(product.mrp)
        .bind(&product.barcode)
        .bind(&product.hsn_sac_code)
        .bind(&product.gst_slab_id)
        .bind(if product.is_master { 1i64 } else { 0i64 })
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
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(count)
}

#[tauri::command]
pub async fn update_product(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    product: CreateProduct,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    let existing_unit_id: Option<String> =
        sqlx::query_scalar("SELECT unit_id FROM products WHERE id = ?")
            .bind(&id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

    if let Some(current_unit_id) = existing_unit_id {
        if current_unit_id != product.unit_id {
            let ref_count: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM voucher_items WHERE product_id = ?")
                    .bind(&id)
                    .fetch_one(&pool)
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

    // Check for duplicate names if setting is enabled
    let prevent_duplicates: i64 = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM app_settings WHERE setting_key = 'prevent_duplicate_product_names' AND (setting_value = 'true' OR setting_value = '\"true\"'))"
    )
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    if prevent_duplicates == 1 {
        let name_exists: i64 = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM products WHERE LOWER(name) = LOWER(?) AND id <> ? AND deleted_at IS NULL)"
        )
        .bind(&product.name)
        .bind(&id)
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

        if name_exists == 1 {
            return Err(format!("A product with the name '{}' already exists.", product.name));
        }
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    sqlx::query(
        "UPDATE products 
         SET code = ?, name = ?, group_id = ?, brand_id = ?, unit_id = ?, purchase_rate = ?, sales_rate = ?, mrp = ?, cost = ?,
             barcode = ?, hsn_sac_code = ?, gst_slab_id = ?, is_master = ?,
             vehicle_manufacturer = ?, vehicle_model = ?, vehicle_year = ?, vehicle_odometer = ?, vehicle_fuel_type = ?, vehicle_transmission = ?, vehicle_owner = ?, vehicle_color = ?,
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?",
    )
    .bind(&product.code)
    .bind(&product.name)
    .bind(product.group_id)
    .bind(product.brand_id)
    .bind(&product.unit_id)
    .bind(product.purchase_rate)
    .bind(product.sales_rate)
    .bind(product.mrp)
    .bind(product.cost)
    .bind(&product.barcode)
    .bind(&product.hsn_sac_code)
    .bind(&product.gst_slab_id)
    .bind(if product.is_master { 1i64 } else { 0i64 })
    .bind(&product.vehicle_manufacturer)
    .bind(&product.vehicle_model)
    .bind(product.vehicle_year)
    .bind(product.vehicle_odometer)
    .bind(&product.vehicle_fuel_type)
    .bind(&product.vehicle_transmission)
    .bind(&product.vehicle_owner)
    .bind(&product.vehicle_color)
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

#[derive(Deserialize)]
pub struct UpdateProductRates {
    pub id: String,
    pub purchase_rate: f64,
    pub sales_rate: f64,
    pub mrp: f64,
}

#[tauri::command]
pub async fn update_multiple_product_rates(
    registry: State<'_, Arc<DbRegistry>>,
    rates: Vec<UpdateProductRates>,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for rate in rates {
        sqlx::query(
            "UPDATE products 
             SET purchase_rate = ?, sales_rate = ?, mrp = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?",
        )
        .bind(rate.purchase_rate)
        .bind(rate.sales_rate)
        .bind(rate.mrp)
        .bind(&rate.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Update the base unit conversion too since that's where the rate gets picked up sometimes
        sqlx::query(
            "UPDATE product_unit_conversions
             SET purchase_rate = ?, sales_rate = ?
             WHERE product_id = ? AND factor_to_base = 1.0",
        )
        .bind(rate.purchase_rate)
        .bind(rate.sales_rate)
        .bind(&rate.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_product(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    deleted_by: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Check for references in voucher_items
    let ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM voucher_items WHERE product_id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

    if ref_count > 0 {
        return Err("Cannot delete product as it is referenced in vouchers.".to_string());
    }

    // Check for references in stock_movements
    let stock_ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM stock_movements WHERE product_id = ?")
            .bind(&id)
            .fetch_one(&pool)
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
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_deleted_products(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<Product>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, Product>(
        "SELECT id, code, name, group_id, brand_id, unit_id, purchase_rate, sales_rate, mrp, cost, barcode, is_active, created_at,
                EXISTS(SELECT 1 FROM voucher_items vi WHERE vi.product_id = products.id) as has_transactions,
                hsn_sac_code, gst_slab_id,
                COALESCE(is_master, 0) as is_master,
                parent_product_id,
                vehicle_manufacturer, vehicle_model, vehicle_year, vehicle_odometer, vehicle_fuel_type, vehicle_transmission, vehicle_owner, vehicle_color
         FROM products
         WHERE deleted_at IS NOT NULL 
         ORDER BY deleted_at DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_product(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    sqlx::query(
        "UPDATE products 
         SET deleted_at = NULL, deleted_by = NULL, is_active = 1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?",
    )
    .bind(id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_product(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Reference checks (same as soft delete)
    let ref_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM voucher_items WHERE product_id = ?")
            .bind(&id)
            .fetch_one(&pool)
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
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

    if stock_ref_count > 0 {
        return Err(
            "Cannot permanently delete product as it has stock movement records.".to_string(),
        );
    }

    // Fetch and delete product images on disk
    let image_paths: Vec<String> = sqlx::query_scalar(
        "SELECT image_path FROM product_images WHERE product_id = ?"
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    for path_str in image_paths {
        let path = std::path::Path::new(&path_str);
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }
    }

    sqlx::query("DELETE FROM products WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============= PRODUCT IMAGES =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ProductImage {
    pub id: String,
    pub product_id: String,
    pub image_path: String,
    pub display_order: i64,
    pub created_at: String,
}

#[tauri::command]
pub async fn upload_product_image(
    app_handle: tauri::AppHandle,
    registry: State<'_, Arc<DbRegistry>>,
    product_id: String,
    filename: String,
    base64_data: String,
) -> Result<ProductImage, String> {
    use tauri::Manager;
    use base64::Engine;

    let target_company_id = registry
        .active_company_id()
        .await
        .ok_or_else(|| "No active company selected.".to_string())?;

    let company: crate::company_db::CompanyInfo = sqlx::query_as(
        "SELECT id, name, slug, db_path, is_deleted, is_primary, is_secondary, created_at, last_opened
         FROM companies WHERE id = ?"
    )
    .bind(&target_company_id)
    .fetch_optional(&registry.master_pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Company not found".to_string())?;

    let clean_base64 = if base64_data.contains("base64,") {
        base64_data.split("base64,").nth(1).unwrap_or(&base64_data)
    } else {
        &base64_data
    };

    let bytes = base64::prelude::BASE64_STANDARD
        .decode(clean_base64.trim())
        .map_err(|e| format!("Failed to decode base64 image data: {}", e))?;

    let pool = registry.active_pool().await?;
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM product_images WHERE product_id = ?"
    )
    .bind(&product_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if count >= 10 {
        return Err("Maximum limit of 10 images reached for this product.".to_string());
    }

    let ext = std::path::Path::new(&filename)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png");

    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let image_id = Uuid::now_v7().to_string();
    let file_relative_dir = format!("product_images/{}/{}", company.slug, product_id);
    let target_dir = app_dir.join(&file_relative_dir);
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let filename_saved = format!("{}.{}", image_id, ext);
    let full_image_path = target_dir.join(&filename_saved);
    std::fs::write(&full_image_path, bytes).map_err(|e| e.to_string())?;

    let db_image_path = full_image_path.to_string_lossy().to_string();

    sqlx::query(
        "INSERT INTO product_images (id, product_id, image_path, display_order)
         VALUES (?, ?, ?, ?)"
    )
    .bind(&image_id)
    .bind(&product_id)
    .bind(&db_image_path)
    .bind(count)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, ProductImage>(
        "SELECT id, product_id, image_path, display_order, created_at FROM product_images WHERE id = ?"
    )
    .bind(image_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_product_images(
    registry: State<'_, Arc<DbRegistry>>,
    product_id: String,
) -> Result<Vec<ProductImage>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, ProductImage>(
        "SELECT id, product_id, image_path, display_order, created_at
         FROM product_images
         WHERE product_id = ?
         ORDER BY display_order ASC, created_at ASC"
    )
    .bind(product_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_product_image(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    
    // Fetch image details first
    let img: Option<(String, String)> = sqlx::query_as(
        "SELECT image_path, product_id FROM product_images WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some((image_path, product_id)) = img {
        // Delete file on disk
        let path = std::path::Path::new(&image_path);
        if path.exists() {
            let _ = std::fs::remove_file(path);
        }

        // Delete from database
        sqlx::query("DELETE FROM product_images WHERE id = ?")
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

        // Reorder remaining images
        let remaining_images: Vec<String> = sqlx::query_scalar(
            "SELECT id FROM product_images WHERE product_id = ? ORDER BY display_order ASC, created_at ASC"
        )
        .bind(&product_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        for (idx, img_id) in remaining_images.iter().enumerate() {
            let _ = sqlx::query("UPDATE product_images SET display_order = ? WHERE id = ?")
                .bind(idx as i64)
                .bind(img_id)
                .execute(&pool)
                .await;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn reorder_product_images(
    registry: State<'_, Arc<DbRegistry>>,
    image_ids: Vec<String>,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for (idx, id) in image_ids.iter().enumerate() {
        sqlx::query("UPDATE product_images SET display_order = ? WHERE id = ?")
            .bind(idx as i64)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// ============= R2 / SPA SYNC =============

/// Resize an image to fit within a 1920×1920 boundary (preserving aspect ratio)
/// and return the bytes encoded as WebP.
fn optimize_image_to_webp(raw: &[u8]) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(raw)
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    let (w, h) = img.dimensions();
    let max_side: u32 = 1920;

    let resized = if w > max_side || h > max_side {
        img.resize(max_side, max_side, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    let mut out: Vec<u8> = Vec::new();
    resized
        .write_to(
            &mut std::io::Cursor::new(&mut out),
            image::ImageFormat::WebP,
        )
        .map_err(|e| format!("Failed to encode to WebP: {}", e))?;

    Ok(out)
}

/// Build an S3 client targeting the configured Cloudflare R2 endpoint.
async fn build_r2_client(
    endpoint_url: &str,
    access_key_id: &str,
    secret_access_key: &str,
) -> aws_sdk_s3::Client {
    let creds = Credentials::new(
        access_key_id,
        secret_access_key,
        None,
        None,
        "r2-credentials",
    );

    let config = aws_sdk_s3::Config::builder()
        .credentials_provider(creds)
        .region(Region::new("auto"))
        .endpoint_url(endpoint_url)
        .force_path_style(true)
        .build();

    aws_sdk_s3::Client::from_conf(config)
}

/// Check if a given key already exists in the R2 bucket (head_object).
async fn r2_object_exists(
    client: &aws_sdk_s3::Client,
    bucket: &str,
    key: &str,
) -> bool {
    client
        .head_object()
        .bucket(bucket)
        .key(key)
        .send()
        .await
        .is_ok()
}

#[tauri::command]
pub async fn sync_all_to_r2(
    _app_handle: tauri::AppHandle,
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<(), String> {
    // ── 1. Load R2 config from app_settings ──
    let pool = registry.active_pool().await?;

    let get_setting = |key: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, String>(
                "SELECT setting_value FROM app_settings WHERE setting_key = ?",
            )
            .bind(key)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten()
        }
    };

    let enabled = get_setting("r2_sync_enabled").await.unwrap_or_default();
    if enabled != "true" {
        return Err("Public product pages feature is disabled. Enable it in Product Settings first.".to_string());
    }

    let endpoint_url = get_setting("r2_endpoint_url").await
        .or_else(|| std::env::var("R2_ENDPOINT_URL").ok())
        .ok_or("R2_ENDPOINT_URL is not configured")?;

    let bucket = get_setting("r2_bucket_name").await
        .or_else(|| std::env::var("R2_BUCKET_NAME").ok())
        .ok_or("R2_BUCKET_NAME is not configured")?;

    let access_key_id = get_setting("r2_access_key_id").await
        .or_else(|| std::env::var("R2_ACCESS_KEY_ID").ok())
        .ok_or("R2_ACCESS_KEY_ID is not configured")?;

    let secret_access_key = get_setting("r2_secret_access_key").await
        .or_else(|| std::env::var("R2_SECRET_ACCESS_KEY").ok())
        .ok_or("R2_SECRET_ACCESS_KEY is not configured")?;

    let public_url = get_setting("r2_public_url").await
        .or_else(|| std::env::var("R2_PUBLIC_URL").ok())
        .ok_or("R2_PUBLIC_URL is not configured")?;
    let public_url = public_url.trim_end_matches('/').to_string();

    // ── 2. Fetch company info ──
    let active_company_id = registry
        .active_company_id()
        .await
        .ok_or("No active company selected")?;

    let company: crate::company_db::CompanyInfo = sqlx::query_as(
        "SELECT id, name, slug, db_path, is_deleted, is_primary, is_secondary, created_at, last_opened
         FROM companies WHERE id = ?",
    )
    .bind(&active_company_id)
    .fetch_optional(&registry.master_pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Active company not found")?;

    // Company name used as "location" in the JSON payload
    let company_name = company.name.clone();

    // Fetch company profile for the actual company name display
    let company_display_name: Option<String> = sqlx::query_scalar(
        "SELECT company_name FROM company_profile LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .ok()
    .flatten();

    let location = company_display_name.unwrap_or_else(|| company_name.clone());

    // ── 3. Build S3 / R2 client ──
    let client = build_r2_client(&endpoint_url, &access_key_id, &secret_access_key).await;

    // ── 4. Fetch all active products ──
    #[derive(sqlx::FromRow)]
    struct ProductRow {
        id: String,
        name: String,
        sales_rate: f64,
        vehicle_manufacturer: Option<String>,
        vehicle_model: Option<String>,
        vehicle_year: Option<i64>,
        vehicle_odometer: Option<f64>,
        vehicle_fuel_type: Option<String>,
        vehicle_transmission: Option<String>,
        vehicle_owner: Option<String>,
        vehicle_color: Option<String>,
    }

    let products: Vec<ProductRow> = sqlx::query_as(
        "SELECT id, name, sales_rate,
                vehicle_manufacturer, vehicle_model, vehicle_year,
                vehicle_odometer, vehicle_fuel_type, vehicle_transmission,
                vehicle_owner, vehicle_color
         FROM products
         WHERE deleted_at IS NULL AND is_active = 1",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // ── 5. Process each product ──
    for product in &products {
        // Fetch images for this product
        #[derive(sqlx::FromRow)]
        struct ImageRow {
            id: String,
            image_path: String,
        }

        let images: Vec<ImageRow> = sqlx::query_as(
            "SELECT id, image_path FROM product_images
             WHERE product_id = ?
             ORDER BY display_order ASC, created_at ASC",
        )
        .bind(&product.id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut public_image_urls: Vec<String> = Vec::new();

        for img in &images {
            let r2_key = format!(
                "product_images/{}/{}/{}.webp",
                company.slug, product.id, img.id
            );
            let public_img_url = format!("{}/{}", public_url, r2_key);

            // Smart sync: skip if already exists in R2
            if r2_object_exists(&client, &bucket, &r2_key).await {
                public_image_urls.push(public_img_url);
                continue;
            }

            // Read & optimize
            let raw = std::fs::read(&img.image_path)
                .map_err(|e| format!("Failed to read image {}: {}", img.image_path, e))?;

            let webp_bytes = optimize_image_to_webp(&raw)?;

            // Upload to R2
            client
                .put_object()
                .bucket(&bucket)
                .key(&r2_key)
                .content_type("image/webp")
                .body(ByteStream::from(webp_bytes))
                .send()
                .await
                .map_err(|e| format!("Failed to upload image {}: {}", r2_key, e))?;

            public_image_urls.push(public_img_url);
        }

        // ── 6. Build the JSON payload ──
        let title = {
            let parts: Vec<String> = [
                product.vehicle_manufacturer.clone(),
                product.vehicle_model.clone(),
                product.vehicle_year.map(|y| y.to_string()),
            ]
            .into_iter()
            .flatten()
            .collect();
            if parts.is_empty() {
                product.name.clone()
            } else {
                parts.join(" ")
            }
        };

        let mileage_str = product.vehicle_odometer
            .map(|km| format!("{} km", km))
            .unwrap_or_default();

        let owner_str = product.vehicle_owner
            .as_deref()
            .map(|o| match o {
                "1" => "1st".to_string(),
                "2" => "2nd".to_string(),
                "3" => "3rd".to_string(),
                other => format!("{} Owner", other),
            })
            .unwrap_or_default();

        let payload = serde_json::json!({
            "id": product.id,
            "title": title,
            "price": product.sales_rate,
            "location": location,
            "specs": {
                "manufacturer": product.vehicle_manufacturer,
                "model": product.vehicle_model,
                "year": product.vehicle_year.map(|y| y.to_string()),
                "mileage": mileage_str,
                "fuel": product.vehicle_fuel_type,
                "transmission": product.vehicle_transmission,
                "owners": owner_str,
                "color": product.vehicle_color,
            },
            "images": public_image_urls,
        });

        let json_str = serde_json::to_string_pretty(&payload)
            .map_err(|e| format!("Failed to serialize JSON: {}", e))?;

        // ── 7. Upload JSON to R2 (always refreshed) ──
        let json_key = format!("products/{}.json", product.id);
        client
            .put_object()
            .bucket(&bucket)
            .key(&json_key)
            .content_type("application/json")
            .body(ByteStream::from(json_str.into_bytes()))
            .send()
            .await
            .map_err(|e| format!("Failed to upload JSON for product {}: {}", product.id, e))?;
    }

    Ok(())
}
