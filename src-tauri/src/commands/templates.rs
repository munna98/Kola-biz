use crate::commands::entries::{PaymentVoucher, ReceiptVoucher};
use crate::commands::tax_utils;
use crate::template_engine::TemplateEngine;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;
use std::sync::Mutex;
use crate::company_db::DbRegistry;
use std::sync::Arc;
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
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<InvoiceTemplate>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, InvoiceTemplate>(
        "SELECT * FROM invoice_templates WHERE is_active = 1 ORDER BY voucher_type, name",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_default_template(
    registry: State<'_, Arc<DbRegistry>>,
    template_id: String,
    voucher_type: String,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
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
    registry: State<'_, Arc<DbRegistry>>,
    template_id: String,
    settings: TemplateSettingsUpdate,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
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
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(template_id)
}

#[tauri::command]
pub async fn render_invoice(
    registry: State<'_, Arc<DbRegistry>>,
    voucher_id: String,
    voucher_type: String,
    template_id: Option<String>,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    // 1. Get template
    let template = if let Some(tid) = template_id {
        sqlx::query_as::<_, InvoiceTemplate>(
            "SELECT * FROM invoice_templates WHERE id = ? AND is_active = 1",
        )
        .bind(tid)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        get_template_by_voucher_type(&pool, voucher_type.clone())
            .await?
            .ok_or_else(|| "No template found for voucher type".to_string())?
    };

    // Normalize legacy quantity-related number formatting in saved templates
    // so qty/less/final qty/deduction are not rounded to whole numbers in print.
    let mut template = template;
    for field in [
        "initial_quantity",
        "less_quantity",
        "final_quantity",
        "deduction_per_unit",
    ] {
        let zero_dec_pattern = format!(r"\{{\{{\s*format_number\s+{}\s+0\s*\}}\}}", field);
        if let Ok(regex) = regex::Regex::new(&zero_dec_pattern) {
            let replacement = format!("{{{{format_number {} 2}}}}", field);
            template.header_html = regex
                .replace_all(&template.header_html, replacement.as_str())
                .into_owned();
            template.body_html = regex
                .replace_all(&template.body_html, replacement.as_str())
                .into_owned();
            template.footer_html = regex
                .replace_all(&template.footer_html, replacement.as_str())
                .into_owned();
        }
    }

    // 2. Get company profile
    let company = crate::commands::company::get_company_profile_with_pool(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // 3. Get voucher data
    let voucher_data = match voucher_type.as_str() {
        "purchase_invoice" => get_purchase_invoice_data(&pool, voucher_id).await?,
        "sales_invoice" => get_sales_invoice_data(&pool, voucher_id).await?,
        "payment" => get_payment_data(&pool, voucher_id).await?,
        "receipt" => get_receipt_data(&pool, voucher_id).await?,
        _ => return Err("Unsupported voucher type".to_string()),
    };

    // 5. Dynamically inject {{#unless is_cash}} around Account Summary
    //    in case the database template hasn't been updated with the conditional yet.
    if !template.body_html.contains("unless is_cash") {
        if let Some(pos) = template.body_html.find("<!-- Account Summary -->") {
            template.body_html.insert_str(pos, "{{#unless is_cash}}\n");
            template.body_html.push_str("\n{{/unless}}");
        } else if let Some(pos) = template.body_html.find("account-summary") {
            // Find the start of the <div that contains account-summary
            if let Some(div_start) = template.body_html[..pos].rfind('<') {
                template
                    .body_html
                    .insert_str(div_start, "{{#unless is_cash}}\n");
                template.body_html.push_str("\n{{/unless}}");
            }
        } else if let Some(pos) = template.body_html.find("old_balance") {
            // Fallback: find the div containing old_balance
            if let Some(div_start) = template.body_html[..pos].rfind("<div") {
                template
                    .body_html
                    .insert_str(div_start, "{{#unless is_cash}}\n");
                template.body_html.push_str("\n{{/unless}}");
            }
        }
    }

    // 6. Render using Handlebars
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
    registry: State<'_, Arc<DbRegistry>>,
    template_id: String,
) -> Result<DesignerTemplateData, String> {
    let pool = registry.active_pool().await?;
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
    .fetch_one(&pool)
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
    registry: State<'_, Arc<DbRegistry>>,
    template_id: Option<String>,
    name: String,
    voucher_type: String,
    layout_config: String,
    header_html: String,
    body_html: String,
    footer_html: String,
    styles_css: String,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    if let Some(tid) = template_id {
        // Update existing template â€” designer is the source of truth
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
        .execute(&pool)
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
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(new_id)
    }
}

#[tauri::command]
pub async fn reset_template_to_default(
    registry: State<'_, Arc<DbRegistry>>,
    template_id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Reset design_mode and layout_config so the seed can restore original HTML on next restart
    // Also re-apply the seed HTML immediately based on template_number
    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT template_number, template_format FROM invoice_templates WHERE id = ?",
    )
    .bind(&template_id)
    .fetch_optional(&pool)
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
    .execute(&pool)
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
        "TPL-SI-GST-001" | "TPL-PI-GST-001" => {
            let html = include_str!("../../resources/templates/tax_invoice_gst.html");
            let css = include_str!("../../resources/templates/tax_invoice_gst.css");
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
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

async fn get_template_by_voucher_type(
    pool: &SqlitePool,
    voucher_type: String,
) -> Result<Option<InvoiceTemplate>, String> {
    sqlx::query_as::<_, InvoiceTemplate>(
        "SELECT * FROM invoice_templates WHERE voucher_type = ? AND is_active = 1 ORDER BY is_default DESC LIMIT 1"
    )
    .bind(voucher_type)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())
}

// Data getters - reusing existing commands
async fn get_purchase_invoice_data(
    pool: &SqlitePool,
    id: String,
) -> Result<serde_json::Value, String> {
    let invoice = crate::commands::invoices::get_purchase_invoice_with_pool(pool, &id).await?;
    let items =
        crate::commands::invoices::get_purchase_invoice_items_with_pool(pool, &id).await?;

    // Fetch supplier details
    let supplier =
        crate::commands::parties::get_supplier_with_pool(pool, &invoice.supplier_id)
            .await
            .ok();

    // Fetch extra GST fields from suppliers table directly (added by migration)
    let gst_extra: Option<(Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> =
        sqlx::query_as(
            "SELECT gstin, address_line_1, state, city, postal_code FROM suppliers WHERE id = ?",
        )
        .bind(&invoice.supplier_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    // Fetch company profile and state for inter-state detection
    let company = crate::commands::company::get_company_profile_with_pool(pool).await.ok();
    let company_state = company.as_ref().and_then(|c| c.state.clone()).unwrap_or_default();
    let company_gstin = company.as_ref().and_then(|c| c.gstin.clone()).unwrap_or_default();

    // Calculate Old Balance (Ledger balance BEFORE this invoice)
    let account_id = invoice.supplier_id.clone();
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
    .fetch_one(pool)
    .await
    .unwrap_or((0.0, 0.0));

    let old_balance = balance_res.0 - balance_res.1;

    // Calculate Paid Amount for this specific invoice
    let paid_amount: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
    )
    .bind(&id)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);

    // Read tax_inclusive from the voucher record itself (set at save time for historical accuracy)
    let tax_inclusive: bool = invoice.tax_inclusive != 0;

    // Pre-fetch HSN code (product-level fallback) and unit abbreviation for each item
    let item_meta: Vec<(String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT vi.id,
                COALESCE(vi.hsn_sac_code, p.hsn_sac_code) as hsn_sac_code,
                u.symbol as unit
         FROM voucher_items vi
         LEFT JOIN products p ON vi.product_id = p.id
         LEFT JOIN units u ON vi.unit_id = u.id
         WHERE vi.voucher_id = ?",
    )
    .bind(&id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let meta_map: std::collections::HashMap<String, (String, String)> = item_meta
        .into_iter()
        .map(|(iid, hsn, unit)| (iid, (hsn.unwrap_or_default(), unit.unwrap_or_default())))
        .collect();

    // Format items with calculated fields for template
    let formatted_items: Vec<serde_json::Value> = items
        .into_iter()
        .map(|item| {
            let mut item_val = serde_json::to_value(&item).unwrap_or(json!({}));
            if let Some(obj) = item_val.as_object_mut() {
                // item.amount = gross (original, before invoice discount)
                // item.net_amount = net after invoice discount (taxable base for tax calc)
                let taxable_amt = item.net_amount;
                let display_amt = item.amount; // original gross for Amount column
                let tax_rate = if item.resolved_gst_rate > 0.0 { item.resolved_gst_rate } else { item.tax_rate };

                // Tax calculation is based on net_amount (taxable base)
                let (base_amt, tax_amt, ex_tax_rate) = if tax_inclusive && tax_rate > 0.0 {
                    let base = taxable_amt / (1.0 + tax_rate / 100.0);
                    let tax = taxable_amt - base;
                    let final_qty = item.initial_quantity - (item.count as f64) * item.deduction_per_unit;
                    let ex_rate = if final_qty > 0.0 { base / final_qty } else { item.rate };
                    (base, tax, ex_rate)
                } else {
                    (taxable_amt, item.tax_amount, item.rate)
                };

                // Display amount derived from original gross (for Amount column)
                let display_base = if tax_inclusive && tax_rate > 0.0 {
                    display_amt / (1.0 + tax_rate / 100.0)
                } else {
                    display_amt
                };

                // Store the inclusive/original values for reference
                obj.insert("inclusive_rate".to_string(), json!(item.rate));
                obj.insert("inclusive_amount".to_string(), json!(item.amount));
                
                // Override rate and amount with ex-tax values — amount shows original (pre-invoice-discount)
                obj.insert("rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("amount".to_string(), json!(round2(display_base)));

                // Inject explicit ex-tax vars for backwards compatibility
                obj.insert("base_amount".to_string(), json!(round2(base_amt)));
                obj.insert("ex_tax_rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("tax_inclusive".to_string(), json!(tax_inclusive));

                // total = inclusive grand total per line (based on original amount)
                let total = if tax_inclusive { display_amt } else { display_amt + display_amt * tax_rate / 100.0 };
                obj.insert("total".to_string(), json!(round2(total)));

                // Add less_quantity field (count * deduction_per_unit)
                let less_quantity = (item.count as f64) * item.deduction_per_unit;
                obj.insert("less_quantity".to_string(), json!(less_quantity));

                // Inject HSN code and unit from product data
                let (hsn, unit) = meta_map.get(&item.id).cloned().unwrap_or_default();
                obj.insert("hsn_sac_code".to_string(), json!(hsn));
                obj.insert("unit".to_string(), json!(unit));

                // Fetch party state for GST split
                let party_state = gst_extra.as_ref().and_then(|e| e.2.clone()).unwrap_or_default();
                let is_inter = tax_utils::is_inter_state(Some(&company_state), Some(&party_state));
                let total_rate = tax_rate;

                if item.cgst_rate > 0.0 || item.sgst_rate > 0.0 || item.igst_rate > 0.0 {
                    obj.insert("cgst_rate".to_string(), json!(item.cgst_rate));
                    obj.insert("sgst_rate".to_string(), json!(item.sgst_rate));
                    obj.insert("igst_rate".to_string(), json!(item.igst_rate));
                    obj.insert("cgst_amount".to_string(), json!(round2(item.cgst_amount)));
                    obj.insert("sgst_amount".to_string(), json!(round2(item.sgst_amount)));
                    obj.insert("igst_amount".to_string(), json!(round2(item.igst_amount)));
                } else if is_inter {
                    obj.insert("cgst_rate".to_string(), json!(0.0));
                    obj.insert("sgst_rate".to_string(), json!(0.0));
                    obj.insert("igst_rate".to_string(), json!(total_rate));
                    obj.insert("cgst_amount".to_string(), json!(0.0));
                    obj.insert("sgst_amount".to_string(), json!(0.0));
                    obj.insert("igst_amount".to_string(), json!(round2(tax_amt)));
                } else {
                    obj.insert("cgst_rate".to_string(), json!(total_rate / 2.0));
                    obj.insert("sgst_rate".to_string(), json!(total_rate / 2.0));
                    obj.insert("igst_rate".to_string(), json!(0.0));
                    obj.insert("cgst_amount".to_string(), json!(round2(tax_amt / 2.0)));
                    obj.insert("sgst_amount".to_string(), json!(round2(tax_amt / 2.0)));
                    obj.insert("igst_amount".to_string(), json!(0.0));
                }
            }
            item_val
        })
        .collect();

    if let Some(mut invoice_val) = serde_json::to_value(&invoice).ok() {
        if let Some(obj) = invoice_val.as_object_mut() {
            obj.insert(
                "items".to_string(),
                serde_json::to_value(formatted_items.clone()).unwrap_or(json!([])),
            );

            // Inject Company Profile
            if let Some(c) = company {
                obj.insert("company".to_string(), serde_json::to_value(c).unwrap_or(json!({})));
            }

            // Build enriched party object with GST fields from gst_extra
            let (party_gstin, party_state, party_address_1, party_city, party_postal) =
                if let Some((g, a1, s, c, p)) = &gst_extra {
                    (
                        g.clone().unwrap_or_default(),
                        s.clone().unwrap_or_default(),
                        a1.clone().unwrap_or_default(),
                        c.clone().unwrap_or_default(),
                        p.clone().unwrap_or_default(),
                    )
                } else {
                    (String::new(), String::new(), String::new(), String::new(), String::new())
                };

            let party_state_code = tax_utils::state_code_from_gstin(
                if party_gstin.is_empty() { None } else { Some(&party_gstin) },
            );

            let party_obj = if let Some(sup) = supplier {
                json!({
                    "name": sup.name,
                    "address": sup.address_line_1.clone(),
                    "address_line_1": if party_address_1.is_empty() { sup.address_line_1.clone() } else { Some(party_address_1.clone()) },
                    "phone": sup.phone,
                    "email": sup.email,
                    "gstin": if party_gstin.is_empty() { None } else { Some(party_gstin.clone()) },
                    "state": if party_state.is_empty() { None } else { Some(party_state.clone()) },
                    "city": if party_city.is_empty() { None } else { Some(party_city.clone()) },
                    "postal_code": if party_postal.is_empty() { None } else { Some(party_postal.clone()) },
                    "state_code": &party_state_code,
                })
            } else {
                json!({
                    "name": invoice.supplier_name,
                    "address": Option::<String>::None,
                    "address_line_1": Option::<String>::None,
                    "phone": Option::<String>::None,
                    "email": Option::<String>::None,
                    "gstin": Option::<String>::None,
                    "state": Option::<String>::None,
                    "city": Option::<String>::None,
                    "postal_code": Option::<String>::None,
                    "state_code": "",
                })
            };

            obj.insert("party".to_string(), party_obj.clone());
            obj.insert("ship_to".to_string(), party_obj); // defaults to same

            // Calculate subtotal for template
            let bill_discount = invoice.discount_amount.unwrap_or(0.0);
            let subtotal = invoice.grand_total - invoice.tax_amount + bill_discount;
            obj.insert("subtotal".to_string(), json!(round2(subtotal)));
            obj.insert("tax_total".to_string(), json!(invoice.tax_amount));
            obj.insert("has_discount".to_string(), json!(bill_discount > 0.0));
            obj.insert("bill_discount".to_string(), json!(round2(bill_discount)));

            // Detect cash purchase (no meaningful balance to show)
            let is_cash = invoice.supplier_name == "Cash";
            obj.insert("is_cash".to_string(), json!(is_cash));

            // Add Balance Details
            let balance_due = old_balance - invoice.grand_total + paid_amount;
            obj.insert("old_balance".to_string(), json!(old_balance));
            obj.insert("paid_amount".to_string(), json!(paid_amount));

            let total_balance = old_balance - invoice.grand_total;
            obj.insert("total_balance".to_string(), json!(total_balance));
            obj.insert("balance_due".to_string(), json!(balance_due));

            // ======= GST Context =======
            let inter_state = tax_utils::is_inter_state(
                Some(&company_state),
                Some(&party_state),
            );
            inject_gst_context(obj, &pool, &id, &formatted_items, inter_state).await;
        }
        Ok(invoice_val)
    } else {
        Err("Failed to serialize purchase invoice".to_string())
    }
}


async fn get_sales_invoice_data(
    pool: &SqlitePool,
    id: String,
) -> Result<serde_json::Value, String> {
    let invoice = crate::commands::invoices::get_sales_invoice_with_pool(pool, &id).await?;
    let items =
        crate::commands::invoices::get_sales_invoice_items_with_pool(pool, &id).await?;

    // Fetch customer details (basic struct)
    let customer =
        crate::commands::parties::get_customer_with_pool(pool, &invoice.customer_id)
            .await
            .ok();

    // Fetch extra GST fields from customers table directly (added by migration)
    let gst_extra: Option<(Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> =
        sqlx::query_as(
            "SELECT gstin, address_line_1, state, city, postal_code FROM customers WHERE id = ?",
        )
        .bind(&invoice.customer_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    // Fetch company profile and state for inter-state detection
    let company = crate::commands::company::get_company_profile_with_pool(pool).await.ok();
    let company_state = company.as_ref().and_then(|c| c.state.clone()).unwrap_or_default();
    let company_gstin = company.as_ref().and_then(|c| c.gstin.clone()).unwrap_or_default();

    // Calculate Old Balance (Ledger balance BEFORE this invoice)
    let account_id = invoice.customer_id.clone();
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
    .fetch_one(pool)
    .await
    .unwrap_or((0.0, 0.0));

    let old_balance = balance_res.0 - balance_res.1;

    // Calculate Paid Amount for this specific invoice
    let paid_amount: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
    )
    .bind(&id)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);

    // Read tax_inclusive from the voucher record itself (set at save time for historical accuracy)
    let tax_inclusive: bool = invoice.tax_inclusive != 0;

    // Pre-fetch HSN code (product-level fallback) and unit abbreviation for each item
    let item_meta: Vec<(String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT vi.id,
                COALESCE(vi.hsn_sac_code, p.hsn_sac_code) as hsn_sac_code,
                u.symbol as unit
         FROM voucher_items vi
         LEFT JOIN products p ON vi.product_id = p.id
         LEFT JOIN units u ON vi.unit_id = u.id
         WHERE vi.voucher_id = ?",
    )
    .bind(&id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let meta_map: std::collections::HashMap<String, (String, String)> = item_meta
        .into_iter()
        .map(|(iid, hsn, unit)| (iid, (hsn.unwrap_or_default(), unit.unwrap_or_default())))
        .collect();

    // Format items with calculated fields for template
    let formatted_items: Vec<serde_json::Value> = items
        .into_iter()
        .map(|item| {
            let mut item_val = serde_json::to_value(&item).unwrap_or(json!({}));
            if let Some(obj) = item_val.as_object_mut() {
                // item.amount = gross (original, before invoice discount)
                // item.net_amount = net after invoice discount (taxable base for tax calc)
                let taxable_amt = item.net_amount;
                let display_amt = item.amount; // original gross for Amount column
                let tax_rate = if item.resolved_gst_rate > 0.0 { item.resolved_gst_rate } else { item.tax_rate };

                // Tax calculation is based on net_amount (taxable base)
                let (base_amt, tax_amt, ex_tax_rate) = if tax_inclusive && tax_rate > 0.0 {
                    let base = taxable_amt / (1.0 + tax_rate / 100.0);
                    let tax = taxable_amt - base;
                    let final_qty = item.initial_quantity - (item.count as f64) * item.deduction_per_unit;
                    let ex_rate = if final_qty > 0.0 { base / final_qty } else { item.rate };
                    (base, tax, ex_rate)
                } else {
                    (taxable_amt, item.tax_amount, item.rate)
                };

                // Display amount derived from original gross (for Amount column)
                let display_base = if tax_inclusive && tax_rate > 0.0 {
                    display_amt / (1.0 + tax_rate / 100.0)
                } else {
                    display_amt
                };

                // Store the inclusive/original values for reference
                obj.insert("inclusive_rate".to_string(), json!(item.rate));
                obj.insert("inclusive_amount".to_string(), json!(item.amount));
                
                // Override rate and amount with ex-tax values — amount shows original (pre-invoice-discount)
                obj.insert("rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("amount".to_string(), json!(round2(display_base)));

                // Inject explicit ex-tax vars for backwards compatibility
                obj.insert("base_amount".to_string(), json!(round2(base_amt)));
                obj.insert("ex_tax_rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("tax_inclusive".to_string(), json!(tax_inclusive));

                // total = inclusive grand total per line (based on original amount)
                let total = if tax_inclusive { display_amt } else { display_amt + display_amt * tax_rate / 100.0 };
                obj.insert("total".to_string(), json!(round2(total)));

                // Add less_quantity field (count * deduction_per_unit)
                let less_quantity = (item.count as f64) * item.deduction_per_unit;
                obj.insert("less_quantity".to_string(), json!(less_quantity));

                // Inject HSN code and unit from product data
                let (hsn, unit) = meta_map.get(&item.id).cloned().unwrap_or_default();
                obj.insert("hsn_sac_code".to_string(), json!(hsn));
                obj.insert("unit".to_string(), json!(unit));

                // Fetch party state for GST split logic
                let party_state = gst_extra.as_ref().and_then(|e| e.2.clone()).unwrap_or_default();
                let is_inter = tax_utils::is_inter_state(Some(&company_state), Some(&party_state));
                let total_rate = tax_rate;

                if item.cgst_rate > 0.0 || item.sgst_rate > 0.0 || item.igst_rate > 0.0 {
                    obj.insert("cgst_rate".to_string(), json!(item.cgst_rate));
                    obj.insert("sgst_rate".to_string(), json!(item.sgst_rate));
                    obj.insert("igst_rate".to_string(), json!(item.igst_rate));
                    obj.insert("cgst_amount".to_string(), json!(round2(item.cgst_amount)));
                    obj.insert("sgst_amount".to_string(), json!(round2(item.sgst_amount)));
                    obj.insert("igst_amount".to_string(), json!(round2(item.igst_amount)));
                } else if is_inter {
                    obj.insert("cgst_rate".to_string(), json!(0.0));
                    obj.insert("sgst_rate".to_string(), json!(0.0));
                    obj.insert("igst_rate".to_string(), json!(total_rate));
                    obj.insert("cgst_amount".to_string(), json!(0.0));
                    obj.insert("sgst_amount".to_string(), json!(0.0));
                    obj.insert("igst_amount".to_string(), json!(round2(tax_amt)));
                } else {
                    obj.insert("cgst_rate".to_string(), json!(total_rate / 2.0));
                    obj.insert("sgst_rate".to_string(), json!(total_rate / 2.0));
                    obj.insert("igst_rate".to_string(), json!(0.0));
                    obj.insert("cgst_amount".to_string(), json!(round2(tax_amt / 2.0)));
                    obj.insert("sgst_amount".to_string(), json!(round2(tax_amt / 2.0)));
                    obj.insert("igst_amount".to_string(), json!(0.0));
                }
            }
            item_val
        })
        .collect();

    if let Some(mut invoice_val) = serde_json::to_value(&invoice).ok() {
        if let Some(obj) = invoice_val.as_object_mut() {
            obj.insert(
                "items".to_string(),
                serde_json::to_value(formatted_items.clone()).unwrap_or(json!([])),
            );

            // Inject Company Profile
            if let Some(c) = company {
                obj.insert("company".to_string(), serde_json::to_value(c).unwrap_or(json!({})));
            }

            // Build enriched party object with GST fields from gst_extra
            let (party_gstin, party_state, party_address_1, party_city, party_postal) =
                if let Some((g, a1, s, c, p)) = &gst_extra {
                    (
                        g.clone().unwrap_or_default(),
                        s.clone().unwrap_or_default(),
                        a1.clone().unwrap_or_default(),
                        c.clone().unwrap_or_default(),
                        p.clone().unwrap_or_default(),
                    )
                } else {
                    (String::new(), String::new(), String::new(), String::new(), String::new())
                };

            let party_state_code = tax_utils::state_code_from_gstin(
                if party_gstin.is_empty() { None } else { Some(&party_gstin) },
            );

            let party_obj = if let Some(cust) = customer {
                json!({
                    "name": cust.name,
                    "address": cust.address_line_1.clone(),
                    "address_line_1": if party_address_1.is_empty() { cust.address_line_1.clone() } else { Some(party_address_1.clone()) },
                    "phone": cust.phone,
                    "email": cust.email,
                    "gstin": if party_gstin.is_empty() { None } else { Some(party_gstin.clone()) },
                    "state": if party_state.is_empty() { None } else { Some(party_state.clone()) },
                    "city": if party_city.is_empty() { None } else { Some(party_city.clone()) },
                    "postal_code": if party_postal.is_empty() { None } else { Some(party_postal.clone()) },
                    "state_code": &party_state_code,
                })
            } else {
                json!({
                    "name": invoice.customer_name,
                    "address": Option::<String>::None,
                    "address_line_1": Option::<String>::None,
                    "phone": Option::<String>::None,
                    "email": Option::<String>::None,
                    "gstin": Option::<String>::None,
                    "state": Option::<String>::None,
                    "city": Option::<String>::None,
                    "postal_code": Option::<String>::None,
                    "state_code": "",
                })
            };

            obj.insert("party".to_string(), party_obj.clone());
            obj.insert("ship_to".to_string(), party_obj); // defaults to same

            // Calculate subtotal for template
            let bill_discount = invoice.discount_amount.unwrap_or(0.0);
            let subtotal = invoice.grand_total - invoice.tax_amount + bill_discount;
            obj.insert("subtotal".to_string(), json!(round2(subtotal)));
            obj.insert("tax_total".to_string(), json!(invoice.tax_amount));
            obj.insert("tax_inclusive".to_string(), json!(tax_inclusive));
            obj.insert("has_discount".to_string(), json!(bill_discount > 0.0));
            obj.insert("bill_discount".to_string(), json!(round2(bill_discount)));

            // Detect cash sale (no meaningful balance to show)
            let is_cash = invoice.customer_name == "Cash";
            obj.insert("is_cash".to_string(), json!(is_cash));

            // Add Balance Details
            obj.insert("old_balance".to_string(), json!(old_balance));
            obj.insert("paid_amount".to_string(), json!(paid_amount));

            // Balance Due = Old Balance + Current Bill - Paid Amount
            let balance_due = old_balance + invoice.grand_total - paid_amount;
            obj.insert("balance_due".to_string(), json!(balance_due));

            // Total Balance = Old Balance + Bill Amount (Grand Total)
            let total_balance = old_balance + invoice.grand_total;
            obj.insert("total_balance".to_string(), json!(total_balance));

            // ======= GST Context =======
            let inter_state = tax_utils::is_inter_state(
                Some(&company_state),
                Some(&party_state),
            );
            inject_gst_context(obj, &pool, &id, &formatted_items, inter_state).await;
        }
        Ok(invoice_val)
    } else {
        Err("Failed to serialize sales invoice".to_string())
    }
}


async fn get_payment_data(
    pool: &SqlitePool,
    id: String,
) -> Result<serde_json::Value, String> {
    // Custom query to fetch single payment
    let voucher = sqlx::query_as::<_, PaymentVoucher>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            CASE 
                WHEN v.created_from_invoice_id IS NOT NULL THEN COALESCE(v.account_id, je.account_id)
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
            v.grand_total,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN chart_of_accounts coa_payment ON coa_payment.id = (
            COALESCE(
                v.account_id,
                (SELECT account_id FROM journal_entries 
                WHERE voucher_id = v.id AND credit > 0 LIMIT 1)
            )
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
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let items = crate::commands::entries::get_payment_items_with_pool(pool, &id).await?;

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
    pool: &SqlitePool,
    id: String,
) -> Result<serde_json::Value, String> {
    // Custom query to fetch single receipt
    let voucher = sqlx::query_as::<_, ReceiptVoucher>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            CASE 
                WHEN v.created_from_invoice_id IS NOT NULL THEN COALESCE(v.account_id, je.account_id)
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
            v.grand_total,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN chart_of_accounts coa_payment ON coa_payment.id = (
            COALESCE(
                v.account_id,
                (SELECT account_id FROM journal_entries 
                WHERE voucher_id = v.id AND debit > 0 LIMIT 1)
            )
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
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let items = crate::commands::entries::get_receipt_items_with_pool(pool, &id).await?;

    let mut val = serde_json::to_value(voucher).map_err(|e| e.to_string())?;
    if let Some(obj) = val.as_object_mut() {
        obj.insert(
            "items".to_string(),
            serde_json::to_value(items).unwrap_or(json!([])),
        );
    }
    Ok(val)
}

// ============================================================
// GST Context Injection Helper
// ============================================================

/// Injects all GST-related fields into the template data object.
async fn inject_gst_context(
    obj: &mut serde_json::Map<String, serde_json::Value>,
    pool: &SqlitePool,
    voucher_id: &str,
    items: &[serde_json::Value],
    is_inter_state: bool,
) {
    // 1. GST enabled setting
    let gst_enabled: bool = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'gst_enabled'",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .map(|v| v == "true")
    .unwrap_or(false);

    obj.insert("gst_enabled".to_string(), json!(gst_enabled));
    obj.insert("is_inter_state".to_string(), json!(is_inter_state));

    // 2. e-Invoice fields from voucher
    let einv: Option<(Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT irn, ack_no, ack_date FROM vouchers WHERE id = ?",
    )
    .bind(voucher_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let (irn, ack_no, ack_date) = einv.unwrap_or((None, None, None));
    let qr_data = irn.as_deref().and_then(crate::commands::tax_utils::irn_to_qr_base64);
    obj.insert("irn".to_string(), json!(irn));
    obj.insert("ack_no".to_string(), json!(ack_no));
    obj.insert("ack_date".to_string(), json!(ack_date));
    obj.insert("qr_code_data".to_string(), json!(qr_data));

    // 3. GST amounts from the already-formatted items â€” base_amount is already reverse-calculated if tax_inclusive
    // We sum base_amount (ex-tax) and the split tax amounts directly from the formatted items passed in.
    let taxable_total: f64 = items
        .iter()
        .filter_map(|i| i["base_amount"].as_f64())
        .sum();
    let cgst_total: f64 = items
        .iter()
        .filter_map(|i| i["cgst_amount"].as_f64())
        .sum();
    let sgst_total: f64 = items
        .iter()
        .filter_map(|i| i["sgst_amount"].as_f64())
        .sum();
    let igst_total: f64 = items
        .iter()
        .filter_map(|i| i["igst_amount"].as_f64())
        .sum();
    let tax_total = cgst_total + sgst_total + igst_total;

    obj.insert("taxable_total".to_string(), json!(round2(taxable_total)));
    obj.insert("cgst_total".to_string(), json!(round2(cgst_total)));
    obj.insert("sgst_total".to_string(), json!(round2(sgst_total)));
    obj.insert("igst_total".to_string(), json!(round2(igst_total)));
    obj.insert("tax_total".to_string(), json!(round2(tax_total)));

    obj.insert("has_cgst".to_string(), json!(round2(cgst_total) > 0.0));
    obj.insert("has_sgst".to_string(), json!(round2(sgst_total) > 0.0));
    obj.insert("has_igst".to_string(), json!(round2(igst_total) > 0.0));

    // 4. Total quantity display
    let total_qty: f64 = items
        .iter()
        .filter_map(|i| i["initial_quantity"].as_f64())
        .sum();
    obj.insert("total_quantity_display".to_string(), json!(format!("{:.2}", total_qty)));

    // 5. HSN/SAC summary grouped by code + rate â€” built from pre-formatted items
    //    so base_amount is already tax-inclusive-aware (reverse-calculated if needed)
    use std::collections::BTreeMap;
    // (taxable, cgst_r, sgst_r, igst_r, cgst_a, sgst_a, igst_a)
    let mut hsn_map: BTreeMap<String, (f64, f64, f64, f64, f64, f64, f64)> = BTreeMap::new();
    for item in items {
        let hsn = item["hsn_sac_code"].as_str().unwrap_or("").to_string();
        let taxable = item["base_amount"].as_f64().unwrap_or(0.0);
        let gst_r = item["tax_rate"].as_f64().unwrap_or(0.0);
        let cgst_r = item["cgst_rate"].as_f64().unwrap_or(0.0);
        let sgst_r = item["sgst_rate"].as_f64().unwrap_or(0.0);
        let igst_r = item["igst_rate"].as_f64().unwrap_or(0.0);
        let cgst_a = item["cgst_amount"].as_f64().unwrap_or(0.0);
        let sgst_a = item["sgst_amount"].as_f64().unwrap_or(0.0);
        let igst_a = item["igst_amount"].as_f64().unwrap_or(0.0);
        let key = format!("{}|{:.2}", hsn, gst_r);
        let entry = hsn_map.entry(key).or_insert((0.0, cgst_r, sgst_r, igst_r, 0.0, 0.0, 0.0));
        entry.0 += taxable;
        entry.4 += cgst_a;
        entry.5 += sgst_a;
        entry.6 += igst_a;
    }

    let hsn_summary: Vec<serde_json::Value> = hsn_map
        .into_iter()
        .map(|(key, (taxable, cgst_r, sgst_r, igst_r, cgst_a, sgst_a, igst_a))| {
            let hsn_code = key.split('|').next().unwrap_or("").to_string();
            let total_tax = cgst_a + sgst_a + igst_a;
            json!({
                "hsn_sac_code": if hsn_code.is_empty() { "N/A".to_string() } else { hsn_code },
                "taxable_value": round2(taxable),
                "cgst_rate": cgst_r,
                "sgst_rate": sgst_r,
                "igst_rate": igst_r,
                "cgst_amount": round2(cgst_a),
                "sgst_amount": round2(sgst_a),
                "igst_amount": round2(igst_a),
                "total_tax": round2(total_tax),
            })
        })
        .collect();

    obj.insert("hsn_summary".to_string(), json!(hsn_summary));

    // 6. Tax total in words
    let tax_words = number_to_words_indian(tax_total);
    obj.insert("tax_total_words".to_string(), json!(format!("Indian Rupee {} Only", tax_words)));
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Converts a floating-point rupee amount to Indian number words.
fn number_to_words_indian(amount: f64) -> String {
    const ONES: &[&str] = &[
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen",
    ];
    const TENS: &[&str] = &[
        "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
    ];

    fn two_digit(n: u64) -> String {
        if n < 20 {
            ONES[n as usize].to_string()
        } else {
            let ten = TENS[(n / 10) as usize];
            let one = ONES[(n % 10) as usize];
            if one.is_empty() { ten.to_string() } else { format!("{} {}", ten, one) }
        }
    }

    fn three_digit(n: u64) -> String {
        if n >= 100 {
            let h = ONES[(n / 100) as usize];
            let rem = n % 100;
            if rem == 0 { format!("{} Hundred", h) }
            else { format!("{} Hundred {}", h, two_digit(rem)) }
        } else {
            two_digit(n)
        }
    }

    let rupees = amount.floor() as u64;
    let paise = ((amount - amount.floor()) * 100.0).round() as u64;
    if rupees == 0 && paise == 0 {
        return "Zero".to_string();
    }

    let mut parts = Vec::<String>::new();
    let crores = rupees / 10_000_000;
    let lakhs   = (rupees % 10_000_000) / 100_000;
    let thousands = (rupees % 100_000) / 1_000;
    let hundreds  = rupees % 1_000;

    if crores    > 0 { parts.push(format!("{} Crore",    three_digit(crores))); }
    if lakhs     > 0 { parts.push(format!("{} Lakh",     two_digit(lakhs))); }
    if thousands > 0 { parts.push(format!("{} Thousand", two_digit(thousands))); }
    if hundreds  > 0 { parts.push(three_digit(hundreds)); }

    let mut result = parts.join(" ");
    if paise > 0 {
        result = format!("{} and {} Paise", result, two_digit(paise));
    }
    result
}
