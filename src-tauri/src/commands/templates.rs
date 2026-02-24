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
    pub id: String,
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
    pub show_less_column: Option<i64>,

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
    template_id: String,
    voucher_type: String,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. Unset default for all templates of this type
    sqlx::query("UPDATE invoice_templates SET is_default = 0 WHERE voucher_type = ?")
        .bind(&voucher_type)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // 2. Set default for selected template
    sqlx::query("UPDATE invoice_templates SET is_default = 1 WHERE id = ?")
        .bind(&template_id)
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
    pub show_less_column: Option<bool>,
}

#[tauri::command]
pub async fn update_template_settings(
    pool: State<'_, SqlitePool>,
    template_id: String,
    settings: TemplateSettingsUpdate,
) -> Result<String, String> {
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
    if let Some(val) = settings.show_less_column {
        separated.push("show_less_column = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }

    // Always update timestamp
    separated.push("updated_at = DATE('now')");

    query_builder.push(" WHERE id = ");
    query_builder.push_bind(&template_id);

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
    voucher_id: String,
    voucher_type: String,
    template_id: Option<String>,
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

// ============= DESIGNER COMMANDS =============

#[derive(Debug, Serialize)]
pub struct DesignerTemplateData {
    pub name: String,
    pub layout_config: Option<String>,
    pub voucher_type: String,
    pub template_format: String,
    pub show_logo: bool,
    pub show_company_address: bool,
    pub show_party_address: bool,
    pub show_gstin: bool,
    pub show_item_hsn: bool,
    pub show_bank_details: bool,
    pub show_signature: bool,
    pub show_terms: bool,
    pub show_less_column: bool,
}

#[tauri::command]
pub async fn get_designer_template(
    pool: State<'_, SqlitePool>,
    template_id: String,
) -> Result<DesignerTemplateData, String> {
    let row = sqlx::query_as::<
        _,
        (
            String,
            Option<String>,
            String,
            String,
            Option<i64>,
            Option<i64>,
            Option<i64>,
            Option<i64>,
            Option<i64>,
            Option<i64>,
            Option<i64>,
            Option<i64>,
            Option<i64>,
        ),
    >(
        "SELECT name, layout_config, voucher_type, template_format, 
         show_logo, show_company_address, show_party_address, show_gstin,
         show_item_hsn, show_bank_details, show_signature, show_terms, show_less_column
         FROM invoice_templates WHERE id = ?",
    )
    .bind(&template_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Template not found: {}", e))?;

    Ok(DesignerTemplateData {
        name: row.0,
        layout_config: row.1,
        voucher_type: row.2,
        template_format: row.3,
        show_logo: row.4.unwrap_or(1) == 1,
        show_company_address: row.5.unwrap_or(1) == 1,
        show_party_address: row.6.unwrap_or(1) == 1,
        show_gstin: row.7.unwrap_or(1) == 1,
        show_item_hsn: row.8.unwrap_or(1) == 1,
        show_bank_details: row.9.unwrap_or(0) == 1,
        show_signature: row.10.unwrap_or(0) == 1,
        show_terms: row.11.unwrap_or(0) == 1,
        show_less_column: row.12.unwrap_or(0) == 1,
    })
}

#[tauri::command]
pub async fn save_designer_template(
    pool: State<'_, SqlitePool>,
    template_id: Option<String>,
    name: String,
    voucher_type: String,
    layout_config: String,
    header_html: String,
    body_html: String,
    footer_html: String,
    styles_css: String,
) -> Result<String, String> {
    if let Some(tid) = template_id {
        // Update existing template — designer is the source of truth
        sqlx::query(
            "UPDATE invoice_templates SET 
                name = ?, layout_config = ?, design_mode = 'designer',
                header_html = ?, body_html = ?, footer_html = ?, styles_css = ?,
                updated_at = datetime('now')
            WHERE id = ?",
        )
        .bind(&name)
        .bind(&layout_config)
        .bind(&header_html)
        .bind(&body_html)
        .bind(&footer_html)
        .bind(&styles_css)
        .bind(&tid)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

        Ok(tid)
    } else {
        // Create new template
        let new_id = uuid::Uuid::now_v7().to_string();
        let template_number = format!("TPL-CUSTOM-{}", &new_id[..8]);

        sqlx::query(
            "INSERT INTO invoice_templates (
                id, template_number, name, description, voucher_type, template_format,
                design_mode, layout_config, header_html, body_html, footer_html, styles_css,
                is_default, is_active
            ) VALUES (?, ?, ?, ?, ?, 'a4_portrait', 'designer', ?, ?, ?, ?, ?, 0, 1)",
        )
        .bind(&new_id)
        .bind(&template_number)
        .bind(&name)
        .bind("Custom designed template")
        .bind(&voucher_type)
        .bind(&layout_config)
        .bind(&header_html)
        .bind(&body_html)
        .bind(&footer_html)
        .bind(&styles_css)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

        Ok(new_id)
    }
}

#[tauri::command]
pub async fn reset_template_to_default(
    pool: State<'_, SqlitePool>,
    template_id: String,
) -> Result<(), String> {
    // Reset design_mode and layout_config so the seed can restore original HTML on next restart
    // Also re-apply the seed HTML immediately based on template_number
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT template_number, template_format FROM invoice_templates WHERE id = ?",
    )
    .bind(&template_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let (template_number, template_format) = row.ok_or("Template not found")?;

    // Determine original design_mode based on template_format
    let original_mode = if template_format.contains("thermal") {
        "compact"
    } else {
        "standard"
    };

    // Reset design_mode and clear layout_config
    sqlx::query(
        "UPDATE invoice_templates SET design_mode = ?, layout_config = NULL, updated_at = datetime('now') WHERE id = ?"
    )
    .bind(original_mode)
    .bind(&template_id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    // Also immediately restore the original HTML from embedded resources
    // by re-running the seed for this specific template
    let (html, css) = match template_number.as_str() {
        "TPL-SI-001" | "TPL-PI-001" => {
            let html = include_str!("../../resources/templates/a4_professional.html");
            let css = include_str!("../../resources/templates/a4_professional.css");
            (html, css)
        }
        "TPL-SI-002" | "TPL-PI-002" => {
            let html = include_str!("../../resources/templates/thermal_80mm.html");
            let css = include_str!("../../resources/templates/thermal_80mm.css");
            (html, css)
        }
        "TPL-SI-003" => {
            let html = include_str!("../../resources/templates/minimal_clean.html");
            let css = include_str!("../../resources/templates/minimal_clean.css");
            (html, css)
        }
        _ => return Ok(()), // Custom templates can't be reset to seed
    };

    // Parse sections
    let sections: Vec<&str> = html.split("<!-- [").collect();
    let mut header = String::new();
    let mut body = String::new();
    let mut footer = String::new();
    for section in sections {
        if section.starts_with("HEADER] -->") {
            header = section.replacen("HEADER] -->", "", 1).trim().to_string();
        } else if section.starts_with("BODY] -->") {
            body = section.replacen("BODY] -->", "", 1).trim().to_string();
        } else if section.starts_with("FOOTER] -->") {
            footer = section.replacen("FOOTER] -->", "", 1).trim().to_string();
        }
    }

    sqlx::query(
        "UPDATE invoice_templates SET header_html = ?, body_html = ?, footer_html = ?, styles_css = ? WHERE id = ?"
    )
    .bind(&header)
    .bind(&body)
    .bind(&footer)
    .bind(css)
    .bind(&template_id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
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
    id: String,
) -> Result<serde_json::Value, String> {
    let invoice = crate::commands::invoices::get_purchase_invoice(pool.clone(), id.clone()).await?;
    let items =
        crate::commands::invoices::get_purchase_invoice_items(pool.clone(), id.clone()).await?;

    // Fetch supplier details
    let supplier =
        crate::commands::parties::get_supplier(pool.clone(), invoice.supplier_id.clone())
            .await
            .ok();

    // Calculate Old Balance (Ledger balance BEFORE this invoice)
    // supplier_id IS the account_id in the new design
    let account_id = invoice.supplier_id.clone();

    // Sum of all debit - credit for this account for vouchers BEFORE this one
    // We use voucher_date and id to strictly order "before"
    // For Suppliers (Creditors), Balance is Cr - Dr usually, but the system stores debit/credit.
    // Let's stick to Dr - Cr for consistent math, and UI handles Dr/Cr suffix.
    // Or if we want "Amount Payable", it's Cr - Dr.
    // Let's use Dr - Cr (Net) consistent with sales.
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
    .bind(&account_id)
    .bind(&invoice.voucher_date)
    .bind(&invoice.voucher_date)
    .bind(&id)
    .fetch_one(pool.inner())
    .await
    .unwrap_or((0.0, 0.0));

    // Old Balance (Dr - Cr)
    let old_balance = balance_res.0 - balance_res.1;

    // Calculate Paid Amount for this specific invoice
    // For Purchase, we pay, so we look for payments allocated to this invoice
    // payment_allocations table links payment_voucher_id to invoice_voucher_id
    let paid_amount: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
    )
    .bind(&id)
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

            // Add Balance Details
            // Note: For suppliers, credit balance is normal (we owe them).
            // old_balance is Dr - Cr. If we owe 1000, old_balance is -1000.
            // invoice increases what we owe (Credit). invoice amount is positive.
            // To get "Balance Due" (what we still owe):
            // We want positive number if we owe money?
            // Sales logic: bal_due = old (Dr-Cr) + invoice - paid.
            // Purchase logic:
            // old_balance (Dr-Cr).
            // invoice creates Cr.
            // paid creates Dr.
            // Net Balance = Old (Dr-Cr) - Invoice (Cr) + Paid (Dr)  <-- This is new balance Dr-Cr.
            // BUT for template display "Balance Due", we usually want the magnitude.
            // Let's pass the raw Dr-Cr values and let the template decide or helper format it?
            // Actually sales template just displays {{balance_due}} directly.
            // Let's calculate proper Net Balance (Dr-Cr)
            // Current Invoice Effect: It's a Purchase, so it CREDITS the supplier.
            // So we subtract grand_total from Net Balance (Dr-Cr).
            // Payment: It's a Payment, so it DEBITS the supplier.
            // So we add paid_amount to Net Balance (Dr-Cr).
            // Wait, payment_allocations logic?
            // If I pay 100 against this invoice, I Debit supplier 100.
            // So changes are:
            // Balance Due = Old Balance (Dr-Cr) - Invoice Grand Total + Paid Amount.
            // Example: Start 0. Buy 1000. Old=0. Invoice=1000(Cr). Paid=0. New = -1000. (Cr 1000). Correct.
            // Pay 200. Paid=200. New = -1000 + 200 = -800. (Cr 800). Correct.

            // The template likely expects "how much is pending for this bill" or "total party balance"?
            // Usually "Balance Due" on an invoice means the total party closing balance.
            // Let's stick to the Net Balance logic.
            let balance_due = old_balance - invoice.grand_total + paid_amount;

            obj.insert("old_balance".to_string(), json!(old_balance));
            obj.insert("paid_amount".to_string(), json!(paid_amount));

            // Total Balance for Purchase (Negative Credit)
            // Old Balance is Credit (negative). Bill adds Credit (negative impact).
            let total_balance = old_balance - invoice.grand_total;
            obj.insert("total_balance".to_string(), json!(total_balance));

            obj.insert("balance_due".to_string(), json!(balance_due));
        }
        Ok(invoice_val)
    } else {
        Err("Failed to serialize purchase invoice".to_string())
    }
}

async fn get_sales_invoice_data(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<serde_json::Value, String> {
    let invoice = crate::commands::invoices::get_sales_invoice(pool.clone(), id.clone()).await?;
    let items =
        crate::commands::invoices::get_sales_invoice_items(pool.clone(), id.clone()).await?;

    // Fetch customer details
    let customer =
        crate::commands::parties::get_customer(pool.clone(), invoice.customer_id.clone())
            .await
            .ok();

    // Calculate Old Balance (Ledger balance BEFORE this invoice)
    // customer_id IS the account_id in the new design
    let account_id = invoice.customer_id.clone();

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
    .bind(&account_id)
    .bind(&invoice.voucher_date)
    .bind(&invoice.voucher_date)
    .bind(&id)
    .fetch_one(pool.inner())
    .await
    .unwrap_or((0.0, 0.0));

    // For Assets (debtors), Balance is Dr - Cr
    let old_balance = balance_res.0 - balance_res.1;

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
            let balance_due = old_balance + invoice.grand_total - paid_amount;
            obj.insert("balance_due".to_string(), json!(balance_due));

            // Total Balance = Old Balance + Bill Amount (Grand Total)
            let total_balance = old_balance + invoice.grand_total;
            obj.insert("total_balance".to_string(), json!(total_balance));
        }
        Ok(invoice_val)
    } else {
        Err("Failed to serialize sales invoice".to_string())
    }
}

async fn get_payment_data(
    pool: State<'_, SqlitePool>,
    id: String,
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
    .bind(id.clone())
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
    id: String,
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
    .bind(id.clone())
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
