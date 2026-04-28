use serde::{Deserialize, Serialize};
use crate::company_db::DbRegistry;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use super::invoices::{finalize_processed_items, prepare_voucher_line};
use super::resolve_voucher_line_unit;
use crate::voucher_seq::get_next_voucher_number;

// ============= PURCHASE RETURN =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PurchaseReturn {
    pub id: String,
    pub voucher_no: String,
    pub voucher_date: String,
    pub supplier_id: String,
    pub supplier_name: String,
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
pub struct PurchaseReturnItem {
    pub id: String,
    pub voucher_id: String,
    pub product_id: String,
    pub product_name: String,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub final_quantity: f64,
    pub unit_id: Option<String>,
    pub base_quantity: f64,
    pub rate: f64,
    pub amount: f64,            // gross amount (original, before invoice discount)
    pub net_amount: f64,        // net amount (after invoice discount)
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
pub struct CreatePurchaseReturnItem {
    pub product_id: String,
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

#[derive(Deserialize)]
pub struct CreatePurchaseReturn {
    pub supplier_id: String,
    pub party_type: String,
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub items: Vec<CreatePurchaseReturnItem>,
    pub tax_inclusive: Option<bool>,
    pub gst_disabled: Option<bool>,
}

#[tauri::command]
pub async fn get_purchase_returns(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<PurchaseReturn>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, PurchaseReturn>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as supplier_id,
            coa.account_name as supplier_name,
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
         WHERE v.voucher_type = 'purchase_return' AND v.deleted_at IS NULL
         GROUP BY v.id
         ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_purchase_return(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<PurchaseReturn, String> {
    let pool = registry.active_pool().await?;
    let invoice = sqlx::query_as::<_, PurchaseReturn>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as supplier_id,
            coa.account_name as supplier_name,
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
         WHERE v.id = ? AND v.voucher_type = 'purchase_return' AND v.deleted_at IS NULL
         GROUP BY v.id",
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Purchase return not found".to_string())?;

    Ok(invoice)
}

#[tauri::command]
pub async fn get_purchase_return_items(
    registry: State<'_, Arc<DbRegistry>>,
    voucher_id: String,
) -> Result<Vec<PurchaseReturnItem>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, PurchaseReturnItem>(
        "SELECT vi.*, p.name as product_name
         FROM voucher_items vi
         JOIN products p ON vi.product_id = p.id
         WHERE vi.voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_purchase_return(
    registry: State<'_, Arc<DbRegistry>>,
    invoice: CreatePurchaseReturn,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let voucher_no = get_next_voucher_number(&pool, "purchase_return").await?;
    let company_state: Option<String> = sqlx::query_scalar("SELECT state FROM company_profile ORDER BY id DESC LIMIT 1")
        .fetch_optional(&mut *tx)
        .await
        .ok()
        .flatten();
    let party_state: Option<String> = sqlx::query_scalar("SELECT state FROM chart_of_accounts WHERE id = ?")
        .bind(&invoice.supplier_id)
        .fetch_optional(&mut *tx)
        .await
        .ok()
        .flatten();
    let is_inter_state =
        crate::commands::tax_utils::is_inter_state(company_state.as_deref(), party_state.as_deref());
    let tax_inclusive = invoice.tax_inclusive.unwrap_or(false);
    let gst_disabled_by_voucher = invoice.gst_disabled.unwrap_or(false);
    let gst_enabled_globally: bool = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'gst_enabled'"
    ).fetch_optional(&mut *tx).await.ok().flatten().map(|v| v == "true").unwrap_or(false);
    let gst_disabled = gst_disabled_by_voucher || !gst_enabled_globally;

    let mut prepared_lines = Vec::new();
    for item in &invoice.items {
        prepared_lines.push(
            prepare_voucher_line(
                &mut tx,
                &pool,
                "purchase",
                &item.product_id,
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

    let voucher_id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type, reference, subtotal, discount_rate, discount_amount, tax_amount, total_amount, narration, status, tax_inclusive, grand_total)
         VALUES (?, ?, 'purchase_return', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)",
    )
    .bind(&voucher_id)
    .bind(&voucher_no)
    .bind(&invoice.voucher_date)
    .bind(&invoice.supplier_id)
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
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for item in &processed_items {
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, net_amount, tax_rate, tax_amount, discount_percent, discount_amount, invoice_discount_amount, remarks, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, gst_slab_id, resolved_gst_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&item.id)
        .bind(&voucher_id)
        .bind(&item.product_id)
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

    let party_id = invoice.supplier_id;
    let purchase_return_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5003'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    let tax_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    let party_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE id = ?")
        .bind(&party_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Party account not found: {}", e))?;

    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, ?, 'Purchase Return (Goods returned)')",
    )
    .bind(Uuid::now_v7().to_string())
    .bind(&voucher_id)
    .bind(&purchase_return_account)
    .bind(subtotal)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if total_tax > 0.0 {
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Tax Reversal on Purchase Return')",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(&voucher_id)
        .bind(&tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, ?, 0, 'Debit Note issued to Supplier')",
    )
    .bind(Uuid::now_v7().to_string())
    .bind(&voucher_id)
    .bind(&party_account)
    .bind(subtotal - discount_amount + total_tax)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if discount_amount > 0.0 {
        let discount_received_account: String =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4004'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Reversal of Discount Received')",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(&voucher_id)
        .bind(&discount_received_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    let items_for_stock: Vec<(String, f64, i64, f64, f64)> = sqlx::query_as(
        "SELECT product_id, base_quantity, count, rate, amount FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(&voucher_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for item in items_for_stock {
        // item.1 = base_quantity, item.3 = rate (per selected unit), item.4 = amount
        // Derive per-base-unit rate to correctly compute stock value
        let base_qty = item.1;
        let rate_per_base = if base_qty > 0.0 { item.4 / base_qty } else { item.3 };
        let amount = base_qty * rate_per_base;
        sqlx::query(
            "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount)
             VALUES (?, ?, ?, 'OUT', ?, ?, ?, ?)",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(&voucher_id)
        .bind(&item.0)
        .bind(base_qty)
        .bind(item.2)
        .bind(rate_per_base)
        .bind(amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_id)
}

#[tauri::command]
pub async fn update_purchase_return(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    invoice: CreatePurchaseReturn,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let company_state: Option<String> = sqlx::query_scalar("SELECT state FROM company_profile ORDER BY id DESC LIMIT 1")
        .fetch_optional(&mut *tx)
        .await
        .ok()
        .flatten();
    let party_state: Option<String> = sqlx::query_scalar("SELECT state FROM chart_of_accounts WHERE id = ?")
        .bind(&invoice.supplier_id)
        .fetch_optional(&mut *tx)
        .await
        .ok()
        .flatten();
    let is_inter_state =
        crate::commands::tax_utils::is_inter_state(company_state.as_deref(), party_state.as_deref());
    let tax_inclusive = invoice.tax_inclusive.unwrap_or(false);
    let gst_disabled_by_voucher = invoice.gst_disabled.unwrap_or(false);
    let gst_enabled_globally: bool = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'gst_enabled'"
    ).fetch_optional(&mut *tx).await.ok().flatten().map(|v| v == "true").unwrap_or(false);
    let gst_disabled = gst_disabled_by_voucher || !gst_enabled_globally;

    let mut prepared_lines = Vec::new();
    for item in &invoice.items {
        prepared_lines.push(
            prepare_voucher_line(
                &mut tx,
                &pool,
                "purchase",
                &item.product_id,
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

    sqlx::query(
        "UPDATE vouchers
         SET voucher_date = ?, party_id = ?, party_type = ?, reference = ?, subtotal = ?, discount_rate = ?, discount_amount = ?, tax_amount = ?, total_amount = ?, narration = ?, status = 'posted', tax_inclusive = ?, grand_total = ?
         WHERE id = ? AND voucher_type = 'purchase_return'",
    )
    .bind(&invoice.voucher_date)
    .bind(&invoice.supplier_id)
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
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, net_amount, tax_rate, tax_amount, discount_percent, discount_amount, invoice_discount_amount, remarks, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, gst_slab_id, resolved_gst_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&item.id)
        .bind(&id)
        .bind(&item.product_id)
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

    let purchase_return_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5003'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    let tax_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    let party_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE id = ?")
        .bind(&invoice.supplier_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, ?, 'Purchase Return (Goods returned)')",
    )
    .bind(Uuid::now_v7().to_string())
    .bind(&id)
    .bind(&purchase_return_account)
    .bind(subtotal)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if total_tax > 0.0 {
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Tax Reversal on Purchase Return')",
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
         VALUES (?, ?, ?, ?, 0, 'Debit Note issued to Supplier')",
    )
    .bind(Uuid::now_v7().to_string())
    .bind(&id)
    .bind(&party_account)
    .bind(subtotal - discount_amount + total_tax)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if discount_amount > 0.0 {
        let discount_received_account: String =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4004'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Reversal of Discount Received')",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(&id)
        .bind(&discount_received_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let unit_snapshot = resolve_voucher_line_unit(
            &mut tx,
            &item.product_id,
            item.unit_id.as_deref(),
            "purchase",
            final_qty,
        )
        .await?;

        // Derive per-base-unit rate from amount / base_quantity
        let base_qty = unit_snapshot.base_quantity;
        let amount_for_item = final_qty * item.rate;
        let rate_per_base = if base_qty > 0.0 { amount_for_item / base_qty } else { item.rate };
        sqlx::query(
            "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount)
             VALUES (?, ?, ?, 'OUT', ?, ?, ?, ?)",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(&id)
        .bind(&item.product_id)
        .bind(base_qty)
        .bind(item.count)
        .bind(rate_per_base)
        .bind(base_qty * rate_per_base)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_purchase_return(registry: State<'_, Arc<DbRegistry>>, id: String) -> Result<(), String> {
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

    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'purchase_return'")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
