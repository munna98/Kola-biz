use crate::company_db::DbRegistry;
use serde::{Deserialize, Serialize};
use sqlx::{Sqlite, SqlitePool, Transaction};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use super::invoices::{
    finalize_processed_items, get_product_purchase_cost_rate, prepare_voucher_line,
    ProcessedVoucherItem,
};
use super::resolve_voucher_line_unit;
use crate::voucher_seq::get_next_voucher_number_in_tx;

// ============= SALES RETURN =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct SalesReturn {
    pub id: String,
    pub voucher_no: String,
    pub voucher_date: String,
    pub customer_id: String,
    pub customer_name: String,
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
    pub tax_inclusive: i64,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct SalesReturnItem {
    pub id: String,
    pub voucher_id: String,
    pub item_type: Option<String>,
    pub product_id: Option<String>,
    pub service_id: Option<String>,
    pub product_name: Option<String>,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub final_quantity: f64,
    pub unit_id: Option<String>,
    pub base_quantity: f64,
    pub rate: f64,
    pub amount: f64,     // gross amount (original, before invoice discount)
    pub net_amount: f64, // net amount (after invoice discount)
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

#[derive(Clone, Deserialize)]
pub struct CreateSalesReturnItem {
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

async fn linked_sales_invoice_id_by_reference(
    tx: &mut Transaction<'_, Sqlite>,
    reference: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(reference) = reference.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    sqlx::query_scalar(
        "SELECT id
         FROM vouchers
         WHERE voucher_type = 'sales_invoice'
           AND voucher_no = ?
           AND deleted_at IS NULL
         ORDER BY voucher_date DESC, id DESC
         LIMIT 1",
    )
    .bind(reference)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())
}

async fn validate_linked_return_quantities(
    tx: &mut Transaction<'_, Sqlite>,
    reference: Option<&str>,
    current_return_id: Option<&str>,
    items: &[ProcessedVoucherItem],
) -> Result<(), String> {
    let Some(reference) = reference.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    let Some(sales_invoice_id) = linked_sales_invoice_id_by_reference(tx, Some(reference)).await?
    else {
        return Ok(());
    };

    let mut requested_by_product = HashMap::<String, f64>::new();
    for item in items {
        if item.item_type == "service" {
            continue;
        }
        if let Some(product_id) = item.product_id.as_deref() {
            *requested_by_product
                .entry(product_id.to_string())
                .or_insert(0.0) += item.base_quantity;
        }
    }

    for (product_id, requested_qty) in requested_by_product {
        let sold_qty: f64 = sqlx::query_scalar(
            "SELECT CAST(COALESCE(SUM(base_quantity), 0) AS REAL)
             FROM voucher_items
             WHERE voucher_id = ?
               AND product_id = ?
               AND COALESCE(item_type, 'product') != 'service'",
        )
        .bind(&sales_invoice_id)
        .bind(&product_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or(0.0);

        let prior_returned_qty: f64 = sqlx::query_scalar(
            "SELECT CAST(COALESCE(SUM(vi.base_quantity), 0) AS REAL)
             FROM voucher_items vi
             JOIN vouchers sr ON vi.voucher_id = sr.id
             WHERE sr.voucher_type = 'sales_return'
               AND sr.deleted_at IS NULL
               AND sr.reference = ?
               AND vi.product_id = ?
               AND COALESCE(vi.item_type, 'product') != 'service'
               AND (? IS NULL OR sr.id != ?)",
        )
        .bind(reference)
        .bind(&product_id)
        .bind(current_return_id)
        .bind(current_return_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or(0.0);

        if requested_qty > (sold_qty - prior_returned_qty) + 0.0001 {
            return Err(format!(
                "Return quantity exceeds original sale quantity for product {}",
                product_id
            ));
        }
    }

    Ok(())
}

async fn sales_return_cost_rate(
    tx: &mut Transaction<'_, Sqlite>,
    linked_sales_invoice_id: Option<&str>,
    product_id: &str,
) -> Result<f64, String> {
    if let Some(invoice_id) = linked_sales_invoice_id {
        let original_cost: Option<f64> = sqlx::query_scalar(
            "SELECT COALESCE(cost_rate, 0)
             FROM stock_movements
             WHERE voucher_id = ?
               AND product_id = ?
               AND movement_type = 'OUT'
             ORDER BY created_at ASC, id ASC
             LIMIT 1",
        )
        .bind(invoice_id)
        .bind(product_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(cost_rate) = original_cost {
            if cost_rate > 0.0 {
                return Ok(cost_rate);
            }
        }
    }

    get_product_purchase_cost_rate(tx, product_id).await
}

#[derive(Deserialize)]
pub struct CreateSalesReturn {
    pub customer_id: String,
    pub party_type: String,
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub items: Vec<CreateSalesReturnItem>,
    pub tax_inclusive: Option<bool>,
    pub gst_disabled: Option<bool>,
}

#[tauri::command]
pub async fn get_sales_returns(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<SalesReturn>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, SalesReturn>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as customer_id,
            coa.account_name as customer_name,
            v.party_type,
            v.reference,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0) as tax_amount,
            v.grand_total,
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at,
            COALESCE(v.tax_inclusive, 0) as tax_inclusive
         FROM vouchers v
         LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
         LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
         WHERE v.voucher_type = 'sales_return' AND v.deleted_at IS NULL
         GROUP BY v.id
         ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sales_return(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<SalesReturn, String> {
    let pool = registry.active_pool().await?;
    let invoice = sqlx::query_as::<_, SalesReturn>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as customer_id,
            coa.account_name as customer_name,
            v.party_type,
            v.reference,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0) as tax_amount,
            v.grand_total,
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at,
            COALESCE(v.tax_inclusive, 0) as tax_inclusive
         FROM vouchers v
         LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
         LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
         WHERE v.id = ? AND v.voucher_type = 'sales_return' AND v.deleted_at IS NULL
         GROUP BY v.id",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Sales return not found".to_string())?;

    Ok(invoice)
}

#[tauri::command]
pub async fn get_sales_return_items(
    registry: State<'_, Arc<DbRegistry>>,
    voucher_id: String,
) -> Result<Vec<SalesReturnItem>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, SalesReturnItem>(
        "SELECT vi.*,
                COALESCE(p.name, s.name) as product_name
         FROM voucher_items vi
         LEFT JOIN products p ON vi.product_id = p.id
         LEFT JOIN services s ON vi.service_id = s.id
         WHERE vi.voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_sales_return(
    registry: State<'_, Arc<DbRegistry>>,
    invoice: CreateSalesReturn,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let voucher_id = create_sales_return_in_tx(&pool, &mut tx, &invoice).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_id)
}

pub(crate) async fn create_sales_return_in_tx(
    pool: &SqlitePool,
    tx: &mut Transaction<'_, Sqlite>,
    invoice: &CreateSalesReturn,
) -> Result<String, String> {
    let voucher_no = get_next_voucher_number_in_tx(tx, "sales_return").await?;
    let company_state: Option<String> =
        sqlx::query_scalar("SELECT state FROM company_profile ORDER BY id DESC LIMIT 1")
            .fetch_optional(&mut **tx)
            .await
            .ok()
            .flatten();
    let party_state: Option<String> =
        sqlx::query_scalar("SELECT state FROM chart_of_accounts WHERE id = ?")
            .bind(&invoice.customer_id)
            .fetch_optional(&mut **tx)
            .await
            .ok()
            .flatten();
    let is_inter_state = crate::commands::tax_utils::is_inter_state(
        company_state.as_deref(),
        party_state.as_deref(),
    );
    let tax_inclusive = invoice.tax_inclusive.unwrap_or(false);
    let gst_disabled_by_voucher = invoice.gst_disabled.unwrap_or(false);
    let gst_enabled_globally: bool = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'gst_enabled'",
    )
    .fetch_optional(&mut **tx)
    .await
    .ok()
    .flatten()
    .map(|v| v == "true")
    .unwrap_or(false);
    let gst_disabled = gst_disabled_by_voucher || !gst_enabled_globally;

    let mut prepared_lines = Vec::new();
    for item in &invoice.items {
        let item_id = if item.item_type == "service" {
            item.service_id.as_deref().unwrap_or("")
        } else {
            item.product_id.as_deref().unwrap_or("")
        };
        prepared_lines.push(
            prepare_voucher_line(
                tx,
                pool,
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
        invoice.discount_rate,
        invoice.discount_amount,
    );
    let processed_items = processed.items;
    let subtotal = processed.subtotal;
    let total_tax = processed.total_cgst + processed.total_sgst + processed.total_igst;
    let total_amount = subtotal - discount_amount;
    let grand_total = total_amount + total_tax;

    validate_linked_return_quantities(tx, invoice.reference.as_deref(), None, &processed_items)
        .await?;

    let voucher_id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type, reference, subtotal, discount_rate, discount_amount, tax_amount, total_amount, narration, status, tax_inclusive, grand_total)
         VALUES (?, ?, 'sales_return', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)",
    )
    .bind(&voucher_id)
    .bind(&voucher_no)
    .bind(&invoice.voucher_date)
    .bind(&invoice.customer_id)
    .bind(&invoice.party_type)
    .bind(&invoice.reference)
    .bind(subtotal)
    .bind(discount_rate)
    .bind(discount_amount)
    .bind(total_tax)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(tax_inclusive as i64)
    .bind(grand_total)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    for item in &processed_items {
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, item_type, product_id, service_id, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, net_amount, tax_rate, tax_amount, discount_percent, discount_amount, invoice_discount_amount, remarks, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, gst_slab_id, resolved_gst_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&item.id)
        .bind(&voucher_id)
        .bind(&item.item_type)
        .bind(&item.product_id)
        .bind(&item.service_id)
        .bind(&item.description)
        .bind(item.initial_quantity)
        .bind(item.count)
        .bind(item.deduction_per_unit)
        .bind(item.final_quantity)
        .bind(&item.unit_id)
        .bind(item.base_quantity)
        .bind(item.rate)
        .bind(item.amount)
        .bind(item.net_amount)
        .bind(item.tax_rate)
        .bind(item.tax_amount)
        .bind(item.discount_percent)
        .bind(item.discount_amount)
        .bind(item.invoice_discount_amount)
        .bind(&item.remarks)
        .bind(item.cgst_rate)
        .bind(item.sgst_rate)
        .bind(item.igst_rate)
        .bind(item.cgst_amount)
        .bind(item.sgst_amount)
        .bind(item.igst_amount)
        .bind(&item.hsn_sac_code)
        .bind(&item.gst_slab_id)
        .bind(item.resolved_gst_rate)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    let party_id = invoice.customer_id.clone();
    let sales_return_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4003'")
            .fetch_one(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
    let tax_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '2002'")
            .fetch_one(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
    let party_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE id = ?")
        .bind(&party_id)
        .fetch_one(&mut **tx)
        .await
        .map_err(|e| format!("Party account not found: {}", e))?;

    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, ?, 0, 'Sales Return (Goods returned)')",
    )
    .bind(Uuid::now_v7().to_string())
    .bind(&voucher_id)
    .bind(&sales_return_account)
    .bind(subtotal)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    if total_tax > 0.0 {
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Tax Reversal on Sales Return')",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(&voucher_id)
        .bind(&tax_account)
        .bind(total_tax)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, ?, 'Credit Note issued to Customer')",
    )
    .bind(Uuid::now_v7().to_string())
    .bind(&voucher_id)
    .bind(&party_account)
    .bind(subtotal - discount_amount + total_tax)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    if discount_amount > 0.0 {
        let discount_allowed_account: String =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5007'")
                .fetch_one(&mut **tx)
                .await
                .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Reversal of Discount Allowed')",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(&voucher_id)
        .bind(&discount_allowed_account)
        .bind(discount_amount)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    let items_for_stock: Vec<(Option<String>, Option<String>, f64, i64, f64, f64)> = sqlx::query_as(
        "SELECT item_type, product_id, base_quantity, count, rate, amount FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(&voucher_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    let linked_sales_invoice_id =
        linked_sales_invoice_id_by_reference(tx, invoice.reference.as_deref()).await?;

    for item in items_for_stock {
        if item.0.as_deref() == Some("service") {
            continue;
        } // skip services
        let product_id = item.1.as_deref().unwrap_or("");
        let base_qty = item.2;
        let rate_per_base = if base_qty > 0.0 {
            item.5 / base_qty
        } else {
            item.4
        };
        let amount = base_qty * rate_per_base;
        let cost_rate =
            sales_return_cost_rate(tx, linked_sales_invoice_id.as_deref(), product_id).await?;
        let cost_amount = base_qty * cost_rate;
        sqlx::query(
            "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount, cost_rate, cost_amount)
             VALUES (?, ?, ?, 'IN', ?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(&voucher_id)
        .bind(&item.1)
        .bind(base_qty)
        .bind(item.3)
        .bind(rate_per_base)
        .bind(amount)
        .bind(cost_rate)
        .bind(cost_amount)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    sync_sales_invoice_link_for_return(tx, &voucher_id, invoice.reference.as_deref()).await?;

    Ok(voucher_id)
}

async fn sync_sales_invoice_link_for_return(
    tx: &mut Transaction<'_, Sqlite>,
    return_id: &str,
    reference: Option<&str>,
) -> Result<(), String> {
    sqlx::query("UPDATE vouchers SET linked_return_id = NULL WHERE linked_return_id = ?")
        .bind(return_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(reference) = reference {
        let trimmed = reference.trim();
        if !trimmed.is_empty() {
            sqlx::query(
                "UPDATE vouchers
                 SET linked_return_id = ?
                 WHERE voucher_type = 'sales_invoice'
                   AND voucher_no = ?
                   AND deleted_at IS NULL",
            )
            .bind(return_id)
            .bind(trimmed)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn update_sales_return(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    invoice: CreateSalesReturn,
) -> Result<(), String> {
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
            .bind(&invoice.customer_id)
            .fetch_optional(&mut *tx)
            .await
            .ok()
            .flatten();
    let is_inter_state = crate::commands::tax_utils::is_inter_state(
        company_state.as_deref(),
        party_state.as_deref(),
    );
    let tax_inclusive = invoice.tax_inclusive.unwrap_or(false);
    let gst_disabled_by_voucher = invoice.gst_disabled.unwrap_or(false);
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
    for item in &invoice.items {
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
        invoice.discount_rate,
        invoice.discount_amount,
    );
    let processed_items = processed.items;
    let subtotal = processed.subtotal;
    let total_tax = processed.total_cgst + processed.total_sgst + processed.total_igst;
    let total_amount = subtotal - discount_amount;
    let grand_total = total_amount + total_tax;

    validate_linked_return_quantities(
        &mut tx,
        invoice.reference.as_deref(),
        Some(&id),
        &processed_items,
    )
    .await?;

    sqlx::query(
        "UPDATE vouchers
         SET voucher_date = ?, party_id = ?, party_type = ?, reference = ?, subtotal = ?, discount_rate = ?, discount_amount = ?, tax_amount = ?, total_amount = ?, narration = ?, status = 'posted', tax_inclusive = ?, grand_total = ?
         WHERE id = ? AND voucher_type = 'sales_return'",
    )
    .bind(&invoice.voucher_date)
    .bind(&invoice.customer_id)
    .bind(&invoice.party_type)
    .bind(&invoice.reference)
    .bind(subtotal)
    .bind(discount_rate)
    .bind(discount_amount)
    .bind(total_tax)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(tax_inclusive as i64)
    .bind(grand_total)
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    for item in &processed_items {
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, item_type, product_id, service_id, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, net_amount, tax_rate, tax_amount, discount_percent, discount_amount, invoice_discount_amount, remarks, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, gst_slab_id, resolved_gst_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&item.id)
        .bind(&id)
        .bind(&item.item_type)
        .bind(&item.product_id)
        .bind(&item.service_id)
        .bind(&item.description)
        .bind(item.initial_quantity)
        .bind(item.count)
        .bind(item.deduction_per_unit)
        .bind(item.final_quantity)
        .bind(&item.unit_id)
        .bind(item.base_quantity)
        .bind(item.rate)
        .bind(item.amount)
        .bind(item.net_amount)
        .bind(item.tax_rate)
        .bind(item.tax_amount)
        .bind(item.discount_percent)
        .bind(item.discount_amount)
        .bind(item.invoice_discount_amount)
        .bind(&item.remarks)
        .bind(item.cgst_rate)
        .bind(item.sgst_rate)
        .bind(item.igst_rate)
        .bind(item.cgst_amount)
        .bind(item.sgst_amount)
        .bind(item.igst_amount)
        .bind(&item.hsn_sac_code)
        .bind(&item.gst_slab_id)
        .bind(item.resolved_gst_rate)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    let sales_return_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4003'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    let tax_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '2002'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    let party_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE id = ?")
        .bind(&invoice.customer_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, ?, 0, 'Sales Return (Goods returned)')",
    )
    .bind(Uuid::now_v7().to_string())
    .bind(&id)
    .bind(&sales_return_account)
    .bind(subtotal)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if total_tax > 0.0 {
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Tax Reversal on Sales Return')",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(&id)
        .bind(&tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, ?, 'Credit Note issued to Customer')",
    )
    .bind(Uuid::now_v7().to_string())
    .bind(&id)
    .bind(&party_account)
    .bind(subtotal - discount_amount + total_tax)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if discount_amount > 0.0 {
        let discount_allowed_account: String =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5007'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Reversal of Discount Allowed')",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(&id)
        .bind(&discount_allowed_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    let linked_sales_invoice_id =
        linked_sales_invoice_id_by_reference(&mut tx, invoice.reference.as_deref()).await?;

    for item in &invoice.items {
        if item.item_type == "service" {
            continue;
        } // Services have no stock
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let item_id = item.product_id.as_deref().unwrap_or("");
        let unit_snapshot =
            resolve_voucher_line_unit(&mut tx, item_id, item.unit_id.as_deref(), "sale", final_qty)
                .await?;

        let base_qty = unit_snapshot.base_quantity;
        let amount_for_item = final_qty * item.rate;
        let rate_per_base = if base_qty > 0.0 {
            amount_for_item / base_qty
        } else {
            item.rate
        };
        let cost_rate =
            sales_return_cost_rate(&mut tx, linked_sales_invoice_id.as_deref(), item_id).await?;
        let cost_amount = base_qty * cost_rate;
        sqlx::query(
            "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount, cost_rate, cost_amount)
             VALUES (?, ?, ?, 'IN', ?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(&id)
        .bind(&item.product_id)
        .bind(base_qty)
        .bind(item.count)
        .bind(rate_per_base)
        .bind(base_qty * rate_per_base)
        .bind(cost_rate)
        .bind(cost_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    sync_sales_invoice_link_for_return(&mut tx, &id, invoice.reference.as_deref()).await?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_sales_return(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("UPDATE vouchers SET linked_return_id = NULL WHERE linked_return_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'sales_return'")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
