use crate::commands::company::get_company_profile;
use crate::commands::entries::{PaymentVoucher, ReceiptVoucher};
use crate::template_engine::TemplateEngine;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;
use std::sync::Mutex;
use tauri::State;

// ============= INVOICE TEMPLATE STRUCT =============
#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct InvoiceTemplate {
    pub id: i64,
    pub template_number: String,
    pub name: String,
    pub description: Option<String>,
    pub voucher_type: String,    // 'sales_invoice', 'purchase_invoice', etc.
    pub template_format: String, // 'a4_portrait', 'a4_landscape', 'thermal_58mm', 'thermal_80mm'
    pub design_mode: Option<String>, // 'standard', 'compact', 'modern', 'minimal'

    // Layout Configuration (JSON)
    pub layout_config: Option<String>, // header height, footer height, margins, etc.

    // Template Content
    pub header_html: String,
    pub body_html: String,
    pub footer_html: String,
    pub styles_css: String,

    // Features
    pub show_logo: Option<i64>, // Boolean as 0/1
    pub show_company_address: Option<i64>,
    pub show_party_address: Option<i64>,
    pub show_gstin: Option<i64>,
    pub show_item_images: Option<i64>,
    pub show_item_hsn: Option<i64>,
    pub show_bank_details: Option<i64>,
    pub show_qr_code: Option<i64>,
    pub show_signature: Option<i64>,
    pub show_terms: Option<i64>,

    // Print Settings
    pub auto_print: Option<i64>,
    pub copies: Option<i64>,

    // Status
    pub is_default: Option<i64>,
    pub is_active: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

static TEMPLATE_ENGINE: Lazy<Mutex<TemplateEngine>> =
    Lazy::new(|| Mutex::new(TemplateEngine::new().expect("Failed to initialize template engine")));

// ============= COMMANDS =============

#[tauri::command]
pub async fn get_invoice_templates(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<InvoiceTemplate>, String> {
    sqlx::query_as::<_, InvoiceTemplate>(
        "SELECT * FROM invoice_templates WHERE is_active = 1 ORDER BY voucher_type, name",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_default_template(
    pool: State<'_, SqlitePool>,
    template_id: i64,
    voucher_type: String,
) -> Result<i64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. Unset default for all templates of this type
    sqlx::query("UPDATE invoice_templates SET is_default = 0 WHERE voucher_type = ?")
        .bind(&voucher_type)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 2. Set default for selected template
    sqlx::query("UPDATE invoice_templates SET is_default = 1 WHERE id = ?")
        .bind(template_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(template_id)
}

#[derive(Deserialize)]
pub struct TemplateSettingsUpdate {
    pub show_logo: Option<bool>,
    pub show_company_address: Option<bool>,
    pub show_party_address: Option<bool>,
    pub show_gstin: Option<bool>,
    pub show_item_images: Option<bool>,
    pub show_item_hsn: Option<bool>,
    pub show_bank_details: Option<bool>,
    pub show_qr_code: Option<bool>,
    pub show_signature: Option<bool>,
    pub show_terms: Option<bool>,
}

#[tauri::command]
pub async fn update_template_settings(
    pool: State<'_, SqlitePool>,
    template_id: i64,
    settings: TemplateSettingsUpdate,
) -> Result<i64, String> {
    let mut query_builder = sqlx::QueryBuilder::new("UPDATE invoice_templates SET ");
    let mut separated = query_builder.separated(", ");

    if let Some(val) = settings.show_logo {
        separated.push("show_logo = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.show_company_address {
        separated.push("show_company_address = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.show_party_address {
        separated.push("show_party_address = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.show_gstin {
        separated.push("show_gstin = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.show_item_images {
        separated.push("show_item_images = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.show_item_hsn {
        separated.push("show_item_hsn = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.show_bank_details {
        separated.push("show_bank_details = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.show_qr_code {
        separated.push("show_qr_code = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.show_signature {
        separated.push("show_signature = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.show_terms {
        separated.push("show_terms = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }

    // Always update timestamp
    separated.push("updated_at = DATE('now')");

    query_builder.push(" WHERE id = ");
    query_builder.push_bind(template_id);

    let query = query_builder.build();
    query
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(template_id)
}

#[tauri::command]
pub async fn render_invoice(
    pool: State<'_, SqlitePool>,
    voucher_id: i64,
    voucher_type: String,
    template_id: Option<i64>,
) -> Result<String, String> {
    // 1. Get template
    let template = if let Some(tid) = template_id {
        sqlx::query_as::<_, InvoiceTemplate>(
            "SELECT * FROM invoice_templates WHERE id = ? AND is_active = 1",
        )
        .bind(tid)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?
    } else {
        get_template_by_voucher_type(pool.clone(), voucher_type.clone())
            .await?
            .ok_or_else(|| "No template found for voucher type".to_string())?
    };

    // 2. Get company profile
    let company = get_company_profile(pool.clone())
        .await
        .map_err(|e| e.to_string())?;

    // 3. Get voucher data
    let voucher_data = match voucher_type.as_str() {
        "purchase_invoice" => get_purchase_invoice_data(pool.clone(), voucher_id).await?,
        "sales_invoice" => get_sales_invoice_data(pool.clone(), voucher_id).await?,
        "payment" => get_payment_data(pool.clone(), voucher_id).await?,
        "receipt" => get_receipt_data(pool.clone(), voucher_id).await?,
        _ => return Err("Unsupported voucher type".to_string()),
    };

    // 4. Render using Handlebars
    let mut engine = TEMPLATE_ENGINE.lock().map_err(|e| e.to_string())?;
    engine.render_invoice(&template, &company, voucher_data)
}

async fn get_template_by_voucher_type(
    pool: State<'_, SqlitePool>,
    voucher_type: String,
) -> Result<Option<InvoiceTemplate>, String> {
    sqlx::query_as::<_, InvoiceTemplate>(
        "SELECT * FROM invoice_templates WHERE voucher_type = ? AND is_active = 1 ORDER BY is_default DESC LIMIT 1"
    )
    .bind(voucher_type)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

// Data getters - reusing existing commands
async fn get_purchase_invoice_data(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<serde_json::Value, String> {
    let invoice = crate::commands::invoices::get_purchase_invoice(pool.clone(), id).await?;
    let items = crate::commands::invoices::get_purchase_invoice_items(pool.clone(), id).await?;

    // Fetch supplier details
    let supplier = crate::commands::parties::get_supplier(pool.clone(), invoice.supplier_id)
        .await
        .ok();

    // Format items with calculated fields for template
    let formatted_items: Vec<serde_json::Value> = items
        .into_iter()
        .map(|item| {
            let mut item_val = serde_json::to_value(&item).unwrap_or(json!({}));
            if let Some(obj) = item_val.as_object_mut() {
                // Add total field (amount + tax) which template expects
                let amount = item.amount;
                let tax = item.tax_amount;
                obj.insert("total".to_string(), json!(amount + tax));

                // Add less_quantity field (count * deduction_per_unit)
                let less_quantity = (item.count as f64) * item.deduction_per_unit;
                obj.insert("less_quantity".to_string(), json!(less_quantity));

                // Ensure hsn_code exists (even if null/empty)
                if !obj.contains_key("hsn_code") {
                    obj.insert("hsn_code".to_string(), json!(""));
                }
            }
            item_val
        })
        .collect();

    if let Some(mut invoice_val) = serde_json::to_value(&invoice).ok() {
        if let Some(obj) = invoice_val.as_object_mut() {
            obj.insert(
                "items".to_string(),
                serde_json::to_value(formatted_items).unwrap_or(json!([])),
            );

            // Add party object for template
            if let Some(sup) = supplier {
                obj.insert(
                    "party".to_string(),
                    json!({
                        "name": sup.name,
                        "address": sup.address,
                        "phone": sup.phone,
                        "email": sup.email,
                        "gstin": Option::<String>::None,
                    }),
                );
            } else {
                // Fallback to basic info from invoice
                obj.insert(
                    "party".to_string(),
                    json!({
                        "name": invoice.supplier_name,
                        "address": Option::<String>::None,
                        "phone": Option::<String>::None,
                        "email": Option::<String>::None,
                        "gstin": Option::<String>::None,
                    }),
                );
            }

            // Calculate subtotal for template
            let subtotal =
                invoice.grand_total - invoice.tax_amount + invoice.discount_amount.unwrap_or(0.0);
            obj.insert("subtotal".to_string(), json!(subtotal));
            obj.insert("tax_total".to_string(), json!(invoice.tax_amount));
        }
        Ok(invoice_val)
    } else {
        Err("Failed to serialize purchase invoice".to_string())
    }
}

async fn get_sales_invoice_data(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<serde_json::Value, String> {
    let invoice = crate::commands::invoices::get_sales_invoice(pool.clone(), id).await?;
    let items = crate::commands::invoices::get_sales_invoice_items(pool.clone(), id).await?;

    // Fetch customer details
    let customer = crate::commands::parties::get_customer(pool.clone(), invoice.customer_id)
        .await
        .ok();

    // Calculate Old Balance (Ledger balance BEFORE this invoice)
    // We need the account ID for the customer.
    // If we have customer object, we can get it or infer it.
    // Usually customer ID in 'customers' table maps to party_id in vouchers.
    // And chart_of_accounts entry exists for this customer.
    // Let's get the account_id from chart_of_accounts for this customer.
    let account_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE account_code = '1003-' || ? AND is_active = 1",
    )
    .bind(invoice.customer_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let mut old_balance = 0.0;
    if let Some(acc_id) = account_id {
        // Sum of all debit - credit for this account for vouchers BEFORE this one
        // We use voucher_date and id to strictly order "before"
        let balance_res: (f64, f64) = sqlx::query_as(
            "SELECT 
                COALESCE(SUM(je.debit), 0.0) as total_debit, 
                COALESCE(SUM(je.credit), 0.0) as total_credit
             FROM journal_entries je
             JOIN vouchers v ON je.voucher_id = v.id
             WHERE je.account_id = ? 
             AND (v.voucher_date < ? OR (v.voucher_date = ? AND v.id < ?))
             AND v.deleted_at IS NULL",
        )
        .bind(acc_id)
        .bind(&invoice.voucher_date)
        .bind(&invoice.voucher_date)
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .unwrap_or((0.0, 0.0));

        // For Assets (debtors), Balance is Dr - Cr
        old_balance = balance_res.0 - balance_res.1;
    }

    // Calculate Paid Amount for this specific invoice
    let paid_amount: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
    )
    .bind(id)
    .fetch_one(pool.inner())
    .await
    .unwrap_or(0.0);

    // Format items with calculated fields for template
    let formatted_items: Vec<serde_json::Value> = items
        .into_iter()
        .map(|item| {
            let mut item_val = serde_json::to_value(&item).unwrap_or(json!({}));
            if let Some(obj) = item_val.as_object_mut() {
                // Add total field (amount + tax) which template expects
                let amount = item.amount;
                let tax = item.tax_amount;
                obj.insert("total".to_string(), json!(amount + tax));

                // Add less_quantity field (count * deduction_per_unit)
                let less_quantity = (item.count as f64) * item.deduction_per_unit;
                obj.insert("less_quantity".to_string(), json!(less_quantity));

                // Ensure hsn_code exists (even if null/empty)
                if !obj.contains_key("hsn_code") {
                    obj.insert("hsn_code".to_string(), json!(""));
                }
            }
            item_val
        })
        .collect();

    if let Some(mut invoice_val) = serde_json::to_value(&invoice).ok() {
        if let Some(obj) = invoice_val.as_object_mut() {
            obj.insert(
                "items".to_string(),
                serde_json::to_value(formatted_items).unwrap_or(json!([])),
            );

            // Add party object for template
            if let Some(cust) = customer {
                obj.insert(
                    "party".to_string(),
                    json!({
                        "name": cust.name,
                        "address": cust.address,
                        "phone": cust.phone,
                        "email": cust.email,
                        "gstin": Option::<String>::None,
                    }),
                );
            } else {
                // Fallback to basic info from invoice
                obj.insert(
                    "party".to_string(),
                    json!({
                        "name": invoice.customer_name,
                        "address": Option::<String>::None,
                        "phone": Option::<String>::None,
                        "email": Option::<String>::None,
                        "gstin": Option::<String>::None,
                    }),
                );
            }

            // Calculate subtotal for template
            let subtotal =
                invoice.grand_total - invoice.tax_amount + invoice.discount_amount.unwrap_or(0.0);
            obj.insert("subtotal".to_string(), json!(subtotal));
            obj.insert("tax_total".to_string(), json!(invoice.tax_amount));

            // Add Balance Details
            obj.insert("old_balance".to_string(), json!(old_balance));
            obj.insert("paid_amount".to_string(), json!(paid_amount));
            // Balance Due = Old Balance + Current Bill - Paid Amount
            // Note: Ideally, invoice.grand_total IS the bill amount.
            // The old_balance represents previous dues.
            // So Total Receivable = Old + Current.
            // Balance Due = Total Receivable - Paid.
            let balance_due = old_balance + invoice.grand_total - paid_amount;
            obj.insert("balance_due".to_string(), json!(balance_due));
        }
        Ok(invoice_val)
    } else {
        Err("Failed to serialize sales invoice".to_string())
    }
}

async fn get_payment_data(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<serde_json::Value, String> {
    // Custom query to fetch single payment
    let voucher = sqlx::query_as::<_, PaymentVoucher>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            CASE 
                WHEN v.created_from_invoice_id IS NOT NULL THEN je.account_id
                ELSE v.party_id
            END as account_id,
            CASE 
                WHEN v.created_from_invoice_id IS NOT NULL THEN coa_payment.account_name
                ELSE coa.account_name
            END as account_name,
            COALESCE(v.metadata, '') as payment_method,
            v.reference as reference_number,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN chart_of_accounts coa_payment ON coa_payment.id = (
            SELECT account_id FROM journal_entries 
            WHERE voucher_id = v.id AND credit > 0 LIMIT 1
        )
        LEFT JOIN (
            SELECT voucher_id, account_id 
            FROM journal_entries 
            WHERE credit > 0
        ) je ON v.id = je.voucher_id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.id = ? AND v.voucher_type = 'payment' AND v.deleted_at IS NULL
        GROUP BY v.id",
    )
    .bind(id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let items = crate::commands::entries::get_payment_items(pool.clone(), id).await?;

    let mut val = serde_json::to_value(voucher).map_err(|e| e.to_string())?;
    if let Some(obj) = val.as_object_mut() {
        obj.insert(
            "items".to_string(),
            serde_json::to_value(items).unwrap_or(json!([])),
        );
    }
    Ok(val)
}

async fn get_receipt_data(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<serde_json::Value, String> {
    // Custom query to fetch single receipt
    let voucher = sqlx::query_as::<_, ReceiptVoucher>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            CASE 
                WHEN v.created_from_invoice_id IS NOT NULL THEN je.account_id
                ELSE v.party_id
            END as account_id,
            CASE 
                WHEN v.created_from_invoice_id IS NOT NULL THEN coa_payment.account_name
                ELSE coa.account_name
            END as account_name,
            COALESCE(v.metadata, '') as receipt_method,
            v.reference as reference_number,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN chart_of_accounts coa_payment ON coa_payment.id = (
            SELECT account_id FROM journal_entries 
            WHERE voucher_id = v.id AND debit > 0 LIMIT 1
        )
        LEFT JOIN (
            SELECT voucher_id, account_id 
            FROM journal_entries 
            WHERE debit > 0
        ) je ON v.id = je.voucher_id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.id = ? AND v.voucher_type = 'receipt' AND v.deleted_at IS NULL
        GROUP BY v.id",
    )
    .bind(id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let items = crate::commands::entries::get_receipt_items(pool.clone(), id).await?;

    let mut val = serde_json::to_value(voucher).map_err(|e| e.to_string())?;
    if let Some(obj) = val.as_object_mut() {
        obj.insert(
            "items".to_string(),
            serde_json::to_value(items).unwrap_or(json!([])),
        );
    }
    Ok(val)
}
