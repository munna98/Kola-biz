use crate::company_db::DbRegistry;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::State;

use super::invoices::{finalize_processed_items, prepare_voucher_line};
use crate::voucher_seq::get_next_voucher_number;
use uuid::Uuid;

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct SalesQuotation {
    pub id: String,
    pub voucher_no: String,
    pub voucher_date: String,
    pub customer_id: String,
    pub customer_name: String,
    pub salesperson_id: Option<String>,
    pub party_type: String,
    pub reference: Option<String>,
    pub total_amount: f64,
    pub tax_amount: f64,
    pub grand_total: f64,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub narration: Option<String>,
    pub status: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
    pub created_by_name: Option<String>,
    pub tax_inclusive: i64,
    pub valid_until: Option<String>, // Added for quotations
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct SalesQuotationItem {
    pub id: String,
    pub voucher_id: String,
    pub item_type: Option<String>,
    pub product_id: Option<String>,
    pub service_id: Option<String>,
    pub product_code: Option<String>,
    pub product_name: Option<String>,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub final_quantity: f64,
    pub unit_id: Option<String>,
    pub base_quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub net_amount: f64,
    pub tax_rate: f64,
    pub tax_amount: f64,
    pub discount_percent: f64,
    pub discount_amount: f64,
    pub invoice_discount_amount: f64,
    pub remarks: Option<String>,
    pub cgst_rate: f64,
    pub sgst_rate: f64,
    pub igst_rate: f64,
    pub cgst_amount: f64,
    pub sgst_amount: f64,
    pub igst_amount: f64,
    pub hsn_sac_code: Option<String>,
    pub gst_slab_id: Option<String>,
    pub resolved_gst_rate: f64,
}

#[derive(Deserialize)]
pub struct CreateSalesQuotationItem {
    #[serde(default = "default_item_type")]
    pub item_type: String,
    pub product_id: Option<String>,
    pub service_id: Option<String>,
    pub unit_id: Option<String>,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub rate: f64,
    pub tax_rate: f64,
    pub discount_percent: Option<f64>,
    pub discount_amount: Option<f64>,
    pub remarks: Option<String>,
}

fn default_item_type() -> String {
    "product".to_string()
}

#[derive(Deserialize)]
pub struct CreateSalesQuotation {
    pub customer_id: String,
    pub salesperson_id: Option<String>,
    pub party_type: String,
    pub voucher_date: String,
    pub valid_until: Option<String>, // Added for quotations
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub items: Vec<CreateSalesQuotationItem>,
    pub user_id: Option<String>,
    pub tax_inclusive: Option<bool>,
    pub gst_disabled: Option<bool>,
}

#[tauri::command]
pub async fn get_sales_quotations(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<SalesQuotation>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, SalesQuotation>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as customer_id,
            coa.account_name as customer_name,
            v.salesperson_id,
            v.party_type,
            v.reference,
            v.total_amount,
            ROUND(COALESCE(v.tax_amount, COALESCE(SUM(vi.tax_amount), 0), 0), 2) as tax_amount,
            ROUND(COALESCE(v.subtotal, v.total_amount, 0) - COALESCE(v.discount_amount, 0) + COALESCE(v.tax_amount, COALESCE(SUM(vi.tax_amount), 0), 0), 2) as grand_total,
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at,
            u.full_name as created_by_name,
            COALESCE(v.tax_inclusive, 0) as tax_inclusive,
            json_extract(v.metadata, '$.valid_until') as valid_until
         FROM vouchers v
         LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
         LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
         LEFT JOIN users u ON v.created_by = u.id
         WHERE v.voucher_type = 'sales_quotation' AND v.deleted_at IS NULL
         GROUP BY v.id
         ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sales_quotation(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<SalesQuotation, String> {
    let pool = registry.active_pool().await?;
    get_sales_quotation_with_pool(&pool, &id).await
}

#[tauri::command]
pub async fn get_sales_quotation_items(
    registry: State<'_, Arc<DbRegistry>>,
    voucher_id: String,
) -> Result<Vec<SalesQuotationItem>, String> {
    let pool = registry.active_pool().await?;
    get_sales_quotation_items_with_pool(&pool, &voucher_id).await
}

#[tauri::command]
pub async fn create_sales_quotation(
    registry: State<'_, Arc<DbRegistry>>,
    quotation: CreateSalesQuotation,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let voucher_no = get_next_voucher_number(&pool, "sales_quotation").await?;

    let company_state: Option<String> =
        sqlx::query_scalar("SELECT state FROM company_profile ORDER BY id DESC LIMIT 1")
            .fetch_optional(&mut *tx)
            .await
            .ok()
            .flatten();
    let party_state: Option<String> =
        sqlx::query_scalar("SELECT state FROM chart_of_accounts WHERE id = ?")
            .bind(&quotation.customer_id)
            .fetch_optional(&mut *tx)
            .await
            .ok()
            .flatten();
    let is_inter_state = crate::commands::tax_utils::is_inter_state(
        company_state.as_deref(),
        party_state.as_deref(),
    );
    let tax_inclusive = quotation.tax_inclusive.unwrap_or(false);
    let gst_disabled_by_voucher = quotation.gst_disabled.unwrap_or(false);
    let gst_enabled_globally: bool = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'gst_enabled'",
    )
    .fetch_optional(&mut *tx)
    .await
    .ok()
    .flatten()
    .map(|v| v == "true")
    .unwrap_or(false);
    let gst_disabled = gst_disabled_by_voucher || !gst_enabled_globally;

    let mut prepared_lines = Vec::new();
    for item in &quotation.items {
        let item_id = if item.item_type == "service" {
            item.service_id.as_deref().unwrap_or("")
        } else {
            item.product_id.as_deref().unwrap_or("")
        };
        prepared_lines.push(
            prepare_voucher_line(
                &mut tx,
                &pool,
                "sale",
                &item.item_type,
                item_id,
                item.unit_id.as_deref(),
                item.description.clone(),
                item.initial_quantity,
                item.count,
                item.deduction_per_unit,
                item.rate,
                item.tax_rate,
                item.discount_percent,
                item.discount_amount,
                item.remarks.clone(),
                tax_inclusive,
                gst_disabled,
            )
            .await?,
        );
    }

    let (processed, discount_rate, discount_amount) = finalize_processed_items(
        prepared_lines,
        is_inter_state,
        quotation.discount_rate,
        quotation.discount_amount,
    );
    let processed_items = processed.items;
    let subtotal = processed.subtotal;
    let total_cgst = processed.total_cgst;
    let total_sgst = processed.total_sgst;
    let total_igst = processed.total_igst;
    let total_amount = round2(subtotal - discount_amount);
    let total_tax = round2(total_cgst + total_sgst + total_igst);
    let grand_total = round2(total_amount + total_tax);

    let metadata = match &quotation.valid_until {
        Some(date) => serde_json::json!({ "valid_until": date }).to_string(),
        None => "{}".to_string(),
    };

    let voucher_id = Uuid::now_v7().to_string();
    let _ = sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, salesperson_id, party_type, reference, subtotal, discount_rate, discount_amount, tax_amount, total_amount, narration, status, created_by, tax_inclusive, cgst_amount, sgst_amount, igst_amount, grand_total, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&voucher_id).bind(&voucher_no).bind("sales_quotation").bind(&quotation.voucher_date).bind(&quotation.customer_id)
    .bind(&quotation.salesperson_id).bind(&quotation.party_type).bind(&quotation.reference).bind(subtotal).bind(discount_rate)
    .bind(discount_amount).bind(total_tax).bind(total_amount).bind(&quotation.narration)
    .bind(&quotation.user_id).bind(tax_inclusive as i64).bind(total_cgst).bind(total_sgst).bind(total_igst).bind(grand_total).bind(&metadata).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Insert items
    for item in &processed_items {
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, item_type, product_id, service_id, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, net_amount, tax_rate, tax_amount, discount_percent, discount_amount, invoice_discount_amount, remarks, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, gst_slab_id, resolved_gst_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&item.id).bind(&voucher_id).bind(&item.item_type).bind(&item.product_id).bind(&item.service_id)
        .bind(&item.description).bind(item.initial_quantity)
        .bind(item.count).bind(item.deduction_per_unit).bind(item.final_quantity).bind(&item.unit_id).bind(item.base_quantity)
        .bind(item.rate).bind(item.amount).bind(item.net_amount).bind(item.tax_rate).bind(item.tax_amount).bind(item.discount_percent).bind(item.discount_amount)
        .bind(item.invoice_discount_amount).bind(&item.remarks).bind(item.cgst_rate).bind(item.sgst_rate).bind(item.igst_rate).bind(item.cgst_amount).bind(item.sgst_amount)
        .bind(item.igst_amount).bind(&item.hsn_sac_code).bind(&item.gst_slab_id).bind(item.resolved_gst_rate)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // NO STOCK MOVEMENTS for Sales Quotation
    // NO JOURNAL ENTRIES for Sales Quotation

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_id.to_string())
}

#[tauri::command]
pub async fn delete_sales_quotation(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Delete related voucher items
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Soft delete the voucher
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'sales_quotation'")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn update_sales_quotation(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    quotation: CreateSalesQuotation,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let company_state: Option<String> =
        sqlx::query_scalar("SELECT state FROM company_profile ORDER BY id DESC LIMIT 1")
            .fetch_optional(&mut *tx)
            .await
            .ok()
            .flatten();
    let party_state: Option<String> =
        sqlx::query_scalar("SELECT state FROM chart_of_accounts WHERE id = ?")
            .bind(&quotation.customer_id)
            .fetch_optional(&mut *tx)
            .await
            .ok()
            .flatten();
    let is_inter_state = crate::commands::tax_utils::is_inter_state(
        company_state.as_deref(),
        party_state.as_deref(),
    );
    let tax_inclusive = quotation.tax_inclusive.unwrap_or(false);
    let gst_disabled_by_voucher = quotation.gst_disabled.unwrap_or(false);
    let gst_enabled_globally: bool = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'gst_enabled'",
    )
    .fetch_optional(&mut *tx)
    .await
    .ok()
    .flatten()
    .map(|v| v == "true")
    .unwrap_or(false);
    let gst_disabled = gst_disabled_by_voucher || !gst_enabled_globally;

    let mut prepared_lines = Vec::new();
    for item in &quotation.items {
        let item_id = if item.item_type == "service" {
            item.service_id.as_deref().unwrap_or("")
        } else {
            item.product_id.as_deref().unwrap_or("")
        };
        prepared_lines.push(
            prepare_voucher_line(
                &mut tx,
                &pool,
                "sale",
                &item.item_type,
                item_id,
                item.unit_id.as_deref(),
                item.description.clone(),
                item.initial_quantity,
                item.count,
                item.deduction_per_unit,
                item.rate,
                item.tax_rate,
                item.discount_percent,
                item.discount_amount,
                item.remarks.clone(),
                tax_inclusive,
                gst_disabled,
            )
            .await?,
        );
    }

    let (processed, discount_rate, discount_amount) = finalize_processed_items(
        prepared_lines,
        is_inter_state,
        quotation.discount_rate,
        quotation.discount_amount,
    );
    let processed_items = processed.items;
    let subtotal = processed.subtotal;
    let total_cgst = processed.total_cgst;
    let total_sgst = processed.total_sgst;
    let total_igst = processed.total_igst;
    let total_amount = round2(subtotal - discount_amount);
    let total_tax = round2(total_cgst + total_sgst + total_igst);
    let grand_total = round2(total_amount + total_tax);

    let metadata = match &quotation.valid_until {
        Some(date) => serde_json::json!({ "valid_until": date }).to_string(),
        None => "{}".to_string(),
    };

    sqlx::query(
        "UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, salesperson_id = ?, party_type = ?, reference = ?, subtotal = ?, 
             discount_rate = ?, discount_amount = ?, tax_amount = ?, total_amount = ?, narration = ?,
             tax_inclusive = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?, grand_total = ?, metadata = ?
         WHERE id = ? AND voucher_type = 'sales_quotation'"
    )
    .bind(&quotation.voucher_date).bind(&quotation.customer_id).bind(&quotation.salesperson_id).bind(&quotation.party_type)
    .bind(&quotation.reference).bind(subtotal).bind(discount_rate).bind(discount_amount).bind(total_tax)
    .bind(total_amount).bind(&quotation.narration).bind(tax_inclusive as i64).bind(total_cgst)
    .bind(total_sgst).bind(total_igst).bind(grand_total).bind(&metadata).bind(&id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Delete existing items
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Insert new items
    for item in &processed_items {
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, item_type, product_id, service_id, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, net_amount, tax_rate, tax_amount, discount_percent, discount_amount, invoice_discount_amount, remarks, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, gst_slab_id, resolved_gst_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&item.id).bind(&id).bind(&item.item_type).bind(&item.product_id).bind(&item.service_id)
        .bind(&item.description).bind(item.initial_quantity)
        .bind(item.count).bind(item.deduction_per_unit).bind(item.final_quantity).bind(&item.unit_id).bind(item.base_quantity)
        .bind(item.rate).bind(item.amount).bind(item.net_amount).bind(item.tax_rate).bind(item.tax_amount).bind(item.discount_percent).bind(item.discount_amount)
        .bind(item.invoice_discount_amount).bind(&item.remarks).bind(item.cgst_rate).bind(item.sgst_rate).bind(item.igst_rate).bind(item.cgst_amount).bind(item.sgst_amount)
        .bind(item.igst_amount).bind(&item.hsn_sac_code).bind(&item.gst_slab_id).bind(item.resolved_gst_rate)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // NO STOCK MOVEMENTS
    // NO JOURNAL ENTRIES

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(id)
}

pub async fn get_sales_quotation_with_pool(
    pool: &SqlitePool,
    id: &str,
) -> Result<SalesQuotation, String> {
    let quotation = sqlx::query_as::<_, SalesQuotation>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as customer_id,
            coa.account_name as customer_name,
            v.salesperson_id,
            v.party_type,
            v.reference,
            v.total_amount,
            ROUND(COALESCE(v.tax_amount, COALESCE(SUM(vi.tax_amount), 0), 0), 2) as tax_amount,
            ROUND(COALESCE(v.subtotal, v.total_amount, 0) - COALESCE(v.discount_amount, 0) + COALESCE(v.tax_amount, COALESCE(SUM(vi.tax_amount), 0), 0), 2) as grand_total,
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at,
            u.full_name as created_by_name,
            COALESCE(v.tax_inclusive, 0) as tax_inclusive,
            json_extract(v.metadata, '$.valid_until') as valid_until
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        LEFT JOIN users u ON v.created_by = u.id
        WHERE v.id = ? AND v.voucher_type = 'sales_quotation' AND v.deleted_at IS NULL
        GROUP BY v.id",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Sales quotation not found".to_string())?;

    Ok(quotation)
}

pub async fn get_sales_quotation_items_with_pool(
    pool: &SqlitePool,
    voucher_id: &str,
) -> Result<Vec<SalesQuotationItem>, String> {
    sqlx::query_as::<_, SalesQuotationItem>(
        "SELECT vi.*,
                COALESCE(p.code, s.code) as product_code,
                COALESCE(p.name, s.name) as product_name
        FROM voucher_items vi
        LEFT JOIN products p ON vi.product_id = p.id
        LEFT JOIN services s ON vi.service_id = s.id
        WHERE vi.voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())
}
