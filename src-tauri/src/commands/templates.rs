use crate::commands::entries::{PaymentVoucher, ReceiptVoucher};
use crate::commands::tax_utils;
use crate::commands::sales_returns::SalesReturn;
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
    pub show_party_name: Option<i64>,
    pub show_party_address: Option<i64>,
    pub table_row_padding: Option<i64>,
    pub show_gstin: Option<i64>,
    pub show_item_images: Option<i64>,
    pub show_item_hsn: Option<i64>,
    pub show_bank_details: Option<i64>,
    pub show_qr_code: Option<i64>,
    pub show_signature: Option<i64>,
    pub show_terms: Option<i64>,
    pub show_less_column: Option<i64>,
    pub show_discount_column: Option<i64>,
    pub show_balance_section: Option<i64>,
    pub balance_font_size: Option<i64>,  // pt — applies to balance section in thermal templates
    pub balance_bold: Option<i64>,        // 0 = normal, 1 = bold

    // Print Settings
    pub auto_print: Option<i64>,
    pub copies: Option<i64>,

    // Status
    pub is_default: Option<i64>,
    pub is_active: Option<i64>,
    // Letterhead Settings
    pub letterhead_data: Option<String>,
    pub use_letterhead: Option<i64>,
    pub letterhead_margin_top: Option<f64>,
    pub letterhead_margin_bottom: Option<f64>,
    pub header_title: Option<String>,
    pub bill_note: Option<String>,

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
    pub show_party_name: Option<bool>,
    pub show_party_address: Option<bool>,
    pub table_row_padding: Option<i64>,
    pub show_gstin: Option<bool>,
    pub show_item_images: Option<bool>,
    pub show_item_hsn: Option<bool>,
    pub show_bank_details: Option<bool>,
    pub show_qr_code: Option<bool>,
    pub show_signature: Option<bool>,
    pub show_terms: Option<bool>,
    pub show_less_column: Option<bool>,
    pub show_discount_column: Option<bool>,
    pub show_balance_section: Option<bool>,
    pub balance_font_size: Option<i64>,
    pub balance_bold: Option<bool>,
    // Letterhead settings
    pub letterhead_data: Option<String>,
    pub use_letterhead: Option<bool>,
    pub letterhead_margin_top: Option<f64>,
    pub letterhead_margin_bottom: Option<f64>,
    pub header_title: Option<String>,
    pub bill_note: Option<String>,
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
    if let Some(val) = settings.show_party_name {
        separated.push("show_party_name = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.table_row_padding {
        separated.push("table_row_padding = ");
        separated.push_bind_unseparated(val);
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
    if let Some(val) = settings.show_discount_column {
        separated.push("show_discount_column = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.show_balance_section {
        separated.push("show_balance_section = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.balance_font_size {
        separated.push("balance_font_size = ");
        separated.push_bind_unseparated(val);
    }
    if let Some(val) = settings.balance_bold {
        separated.push("balance_bold = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.letterhead_data {
        separated.push("letterhead_data = ");
        separated.push_bind_unseparated(val);
    }
    if let Some(val) = settings.use_letterhead {
        separated.push("use_letterhead = ");
        separated.push_bind_unseparated(if val { 1 } else { 0 });
    }
    if let Some(val) = settings.letterhead_margin_top {
        separated.push("letterhead_margin_top = ");
        separated.push_bind_unseparated(val);
    }
    if let Some(val) = settings.letterhead_margin_bottom {
        separated.push("letterhead_margin_bottom = ");
        separated.push_bind_unseparated(val);
    }
    if let Some(val) = settings.header_title {
        separated.push("header_title = ");
        separated.push_bind_unseparated(val);
    }
    if let Some(val) = settings.bill_note {
        separated.push("bill_note = ");
        separated.push_bind_unseparated(val);
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
        "sales_quotation" => get_sales_quotation_data(&pool, voucher_id).await?,
        "delivery_note" => get_delivery_note_data(&pool, voucher_id).await?,
        "sales_return" => get_sales_return_data(&pool, voucher_id).await?,
        "payment" => get_payment_data(&pool, voucher_id).await?,
        "receipt" => get_receipt_data(&pool, voucher_id).await?,
        _ => return Err("Unsupported voucher type".to_string()),
    };

    let has_sales_returns = voucher_type == "sales_invoice"
        && voucher_data
            .get("has_returns")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

    // Existing saved templates may not have been reseeded with the returns block.
    // Inject a compact return summary at render time so all active templates show net payable.
    if has_sales_returns && !template.body_html.contains("has_returns") {
        let return_summary = r#"
{{#if has_returns}}
<div class="inline-return-items" style="margin: 10px 0; padding: 6px 0; border-top: 1px dashed #999; border-bottom: 1px dashed #999; font-size: 9pt;">
  <div style="text-align: center; font-weight: bold; margin-bottom: 4px;">RETURNED ITEMS</div>
  <table style="width: 100%; border-collapse: collapse;">
    <tbody>
      {{#each return_items}}
      <tr>
        <td>{{description}}</td>
        <td style="text-align: right;">{{format_number final_quantity 2}}</td>
        <td style="text-align: right;">{{format_number rate 2}}</td>
        <td style="text-align: right;">{{format_number total 2}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
</div>
<div class="inline-return-summary" style="margin: 10px 0; padding: 8px 0; border-top: 1px solid #999; border-bottom: 1px solid #999; font-size: 10pt;">
  <div style="display: flex; justify-content: flex-end; gap: 24px;">
    <span>Invoice Total</span>
    <strong>{{format_currency grand_total}}</strong>
  </div>
  <div style="display: flex; justify-content: flex-end; gap: 24px; color: #b91c1c;">
    <span>Less Returns</span>
    <strong>-{{format_currency return_total}}</strong>
  </div>
  <div style="display: flex; justify-content: flex-end; gap: 24px; font-size: 12pt;">
    <span><strong>Net Payable</strong></span>
    <strong>{{format_currency net_payable}}</strong>
  </div>
</div>
{{/if}}
"#;

        if let Some(pos) = template.body_html.find("<!-- Account Summary -->") {
            template.body_html.insert_str(pos, return_summary);
        } else if let Some(pos) = template.body_html.find("account-summary") {
            if let Some(div_start) = template.body_html[..pos].rfind('<') {
                template.body_html.insert_str(div_start, return_summary);
            } else {
                template.body_html.push_str(return_summary);
            }
        } else {
            template.body_html.push_str(return_summary);
        }
    }

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
    pub show_party_name: bool,
    pub show_party_address: bool,
    pub table_row_padding: i64,
    pub show_gstin: bool,
    pub show_item_hsn: bool,
    pub show_bank_details: bool,
    pub show_signature: bool,
    pub show_terms: bool,
    pub show_less_column: bool,
    pub show_discount_column: bool,
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
            Option<i64>,
            Option<i64>,
            Option<i64>,
        ),
    >(
        "SELECT name, layout_config, voucher_type, template_format, 
         show_logo, show_company_address, show_party_name, show_party_address, table_row_padding, show_gstin,
         show_item_hsn, show_bank_details, show_signature, show_terms, show_less_column, show_discount_column
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
        show_party_name: row.6.unwrap_or(1) == 1,
        show_party_address: row.7.unwrap_or(1) == 1,
        table_row_padding: row.8.unwrap_or(8),
        show_gstin: row.9.unwrap_or(1) == 1,
        show_item_hsn: row.10.unwrap_or(1) == 1,
        show_bank_details: row.11.unwrap_or(0) == 1,
        show_signature: row.12.unwrap_or(0) == 1,
        show_terms: row.13.unwrap_or(0) == 1,
        show_less_column: row.14.unwrap_or(0) == 1,
        show_discount_column: row.15.unwrap_or(0) == 1,
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
    let (html_str, css_str) = match template_number.as_str() {
        "TPL-SI-001" | "TPL-PI-001" | "TPL-SR-001" => {
            let html = include_str!("../../resources/templates/a4_professional.html");
            let css = include_str!("../../resources/templates/a4_professional.css");
            if template_number == "TPL-SR-001" {
                let html_replaced = html.replace("INVOICE", "CREDIT NOTE").replace("Invoice No:", "Return No:").replace("invoice", "sales_return");
                (html_replaced, css.to_string())
            } else {
                (html.to_string(), css.to_string())
            }
        }
        "TPL-SI-002" | "TPL-PI-002" | "TPL-SR-002" => {
            let html = include_str!("../../resources/templates/thermal_80mm.html");
            let css = include_str!("../../resources/templates/thermal_80mm.css");
            if template_number == "TPL-SR-002" {
                let html_replaced = html.replace("Invoice:", "Credit Note:");
                (html_replaced, css.to_string())
            } else {
                (html.to_string(), css.to_string())
            }
        }
        "TPL-SI-003" => {
            let html = include_str!("../../resources/templates/minimal_clean.html");
            let css = include_str!("../../resources/templates/minimal_clean.css");
            (html.to_string(), css.to_string())
        }
        "TPL-SI-GST-001" | "TPL-PI-GST-001" | "TPL-SR-GST-001" => {
            let html = include_str!("../../resources/templates/tax_invoice_gst.html");
            let css = include_str!("../../resources/templates/tax_invoice_gst.css");
            if template_number == "TPL-SR-GST-001" {
                let html_replaced = html.replace("TAX INVOICE", "CREDIT NOTE").replace("Invoice No:", "Credit Note No:").replace("invoice", "sales_return");
                (html_replaced, css.to_string())
            } else {
                (html.to_string(), css.to_string())
            }
        }
        "TPL-RC-002" => {
            let html = include_str!("../../resources/templates/thermal_receipt.html");
            let css = include_str!("../../resources/templates/thermal_80mm.css");
            (html.to_string(), css.to_string())
        }
        _ => return Ok(()), // Custom templates can't be reset to seed
    };

    // Parse sections
    let sections: Vec<&str> = html_str.split("<!-- [").collect();
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
    .bind(&css_str)
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

    // Fetch forex info for this voucher (if any)
    let forex_info: Option<(Option<String>, f64, f64, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT v.currency_id, COALESCE(v.exchange_rate, 1.0), COALESCE(v.foreign_total, 0),
                cur.code, cur.symbol
         FROM vouchers v
         LEFT JOIN currencies cur ON v.currency_id = cur.id
         WHERE v.id = ?"
    )
    .bind(&id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);
    
    let (forex_currency_id, forex_rate, forex_foreign_total, forex_code, forex_symbol) = 
        forex_info.unwrap_or((None, 1.0, 0.0, None, None));
    let is_foreign_currency = forex_currency_id.is_some();

    let coa_details: Option<(Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT party_id, account_name, gstin, address_line_1, state, city, postal_code FROM chart_of_accounts WHERE id = ?"
    )
    .bind(&invoice.supplier_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let mut real_supplier_id = None;
    let mut account_name = String::new();
    let mut gst_extra: Option<(Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> = None;

    if let Some((pid, name, gstin, addr, st, cty, pc)) = coa_details {
        real_supplier_id = pid;
        account_name = name;
        if gstin.is_some() || addr.is_some() || st.is_some() {
            gst_extra = Some((gstin, addr, st, cty, pc));
        }
    }

    // Fallback: If COA had no GST info, try to find it in suppliers by party_id OR account_name
    if gst_extra.is_none() {
        if let Some(ref sid) = real_supplier_id {
            gst_extra = sqlx::query_as("SELECT gstin, address_line_1, state, city, postal_code FROM suppliers WHERE id = ?")
                .bind(sid).fetch_optional(pool).await.unwrap_or(None);
        } else {
            gst_extra = sqlx::query_as("SELECT gstin, address_line_1, state, city, postal_code FROM suppliers WHERE name = ?")
                .bind(&account_name).fetch_optional(pool).await.unwrap_or(None);
        }
    }

    let supplier = if let Some(ref sid) = real_supplier_id {
        crate::commands::parties::get_supplier_with_pool(pool, sid).await.ok()
    } else {
        None
    };

    // Fetch company profile and state for inter-state detection
    let company = crate::commands::company::get_company_profile_with_pool(pool).await.ok();
    let company_state = company.as_ref().and_then(|c| c.state.clone()).unwrap_or_default();
    let _company_gstin = company.as_ref().and_then(|c| c.gstin.clone()).unwrap_or_default();

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
                let item_level_taxable_amt = round2((item.amount - item.discount_amount).max(0.0));
                let display_amt = item.amount; // original gross for Amount column
                let tax_rate = if item.resolved_gst_rate > 0.0 { item.resolved_gst_rate } else { item.tax_rate };

                // Tax calculation is based on net_amount (taxable base)
                // NOTE: When tax_inclusive is set, prepare_voucher_line already reverse-calculates
                // the ex-tax base before storing (divides by 1+rate/100). So item.amount,
                // item.net_amount, and item.rate are ALREADY ex-tax — do NOT divide again.
                let (base_amt, tax_amt, ex_tax_rate) = (taxable_amt, item.tax_amount, item.rate);

                // Display amount is also already ex-tax
                let display_base = display_amt;

                // Store the inclusive/original values for reference
                let inclusive_rate = if tax_inclusive && tax_rate > 0.0 { round2(item.rate * (1.0 + tax_rate / 100.0)) } else { item.rate };
                let inclusive_amount = if tax_inclusive && tax_rate > 0.0 { round2(display_amt * (1.0 + tax_rate / 100.0)) } else { display_amt };
                obj.insert("inclusive_rate".to_string(), json!(inclusive_rate));
                obj.insert("inclusive_amount".to_string(), json!(inclusive_amount));
                
                // Override rate and amount with ex-tax values — amount shows original (pre-invoice-discount)
                obj.insert("rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("amount".to_string(), json!(round2(display_base)));

                // Inject explicit ex-tax vars for backwards compatibility
                obj.insert("base_amount".to_string(), json!(round2(base_amt)));
                obj.insert("ex_tax_rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("tax_inclusive".to_string(), json!(tax_inclusive));

                // total = line total after item discount, before bill-level discount
                let total = item_level_taxable_amt * (1.0 + tax_rate / 100.0);
                obj.insert("total".to_string(), json!(round2(total)));

                // Add less_quantity field (count * deduction_per_unit)
                let less_quantity = round2((item.count as f64) * item.deduction_per_unit);
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

            // ======= Forex / Multi-Currency Context =======
            obj.insert("is_foreign_currency".to_string(), json!(is_foreign_currency));
            obj.insert("currency_code".to_string(), json!(forex_code.as_deref().unwrap_or("")));
            obj.insert("currency_symbol".to_string(), json!(forex_symbol.as_deref().unwrap_or("")));
            obj.insert("exchange_rate".to_string(), json!(forex_rate));
            obj.insert("foreign_total".to_string(), json!(forex_foreign_total));

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

    // Fetch forex info for this voucher (if any)
    let forex_info: Option<(Option<String>, f64, f64, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT v.currency_id, COALESCE(v.exchange_rate, 1.0), COALESCE(v.foreign_total, 0),
                cur.code, cur.symbol
         FROM vouchers v
         LEFT JOIN currencies cur ON v.currency_id = cur.id
         WHERE v.id = ?"
    )
    .bind(&id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);
    
    let (forex_currency_id, forex_rate, forex_foreign_total, forex_code, forex_symbol) = 
        forex_info.unwrap_or((None, 1.0, 0.0, None, None));
    let is_foreign_currency = forex_currency_id.is_some();

    let coa_details: Option<(Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT party_id, account_name, gstin, address_line_1, state, city, postal_code FROM chart_of_accounts WHERE id = ?"
    )
    .bind(&invoice.customer_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let mut real_customer_id = None;
    let mut account_name = String::new();
    let mut gst_extra: Option<(Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> = None;

    if let Some((pid, name, gstin, addr, st, cty, pc)) = coa_details {
        real_customer_id = pid;
        account_name = name;
        if gstin.is_some() || addr.is_some() || st.is_some() {
            gst_extra = Some((gstin, addr, st, cty, pc));
        }
    }

    // Fallback: If COA had no GST info, try to find it in customers by party_id OR account_name
    if gst_extra.is_none() {
        if let Some(ref cid) = real_customer_id {
            gst_extra = sqlx::query_as("SELECT gstin, address_line_1, state, city, postal_code FROM customers WHERE id = ?")
                .bind(cid).fetch_optional(pool).await.unwrap_or(None);
        } else {
            gst_extra = sqlx::query_as("SELECT gstin, address_line_1, state, city, postal_code FROM customers WHERE name = ?")
                .bind(&account_name).fetch_optional(pool).await.unwrap_or(None);
        }
    }

    let customer = if let Some(ref cid) = real_customer_id {
        crate::commands::parties::get_customer_with_pool(pool, cid).await.ok()
    } else {
        None
    };

    // Fetch company profile and state for inter-state detection
    let company = crate::commands::company::get_company_profile_with_pool(pool).await.ok();
    let company_state = company.as_ref().and_then(|c| c.state.clone()).unwrap_or_default();
    let _company_gstin = company.as_ref().and_then(|c| c.gstin.clone()).unwrap_or_default();

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

    // Calculate total allocations for this specific invoice
    let total_allocated: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
    )
    .bind(&id)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);

    // Any payment vouchers created BEFORE this invoice are already part of old_balance.
    let advance_in_old_bal: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(pa.allocated_amount), 0.0)
         FROM payment_allocations pa
         JOIN vouchers v ON pa.payment_voucher_id = v.id
         WHERE pa.invoice_voucher_id = ?
           AND (v.voucher_date < ? OR (v.voucher_date = ? AND v.id < ?))
           AND v.deleted_at IS NULL",
    )
    .bind(&id)
    .bind(&invoice.voucher_date)
    .bind(&invoice.voucher_date)
    .bind(&id)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);

    // Paid amount for this invoice's transaction (collected at/after invoice time)
    let paid_amount = (total_allocated - advance_in_old_bal).max(0.0);

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
                let resolved_name = item.product_name.as_deref()
                    .filter(|s| !s.trim().is_empty())
                    .or(item.description.as_deref())
                    .unwrap_or("Custom Item");
                obj.insert("product_name".to_string(), json!(resolved_name));
                obj.insert("name".to_string(), json!(resolved_name));
                obj.insert("item_name".to_string(), json!(resolved_name));
                obj.insert("description".to_string(), json!(resolved_name));

                // item.amount = gross (original, before invoice discount)
                // item.net_amount = net after invoice discount (taxable base for tax calc)
                let taxable_amt = item.net_amount;
                let item_level_taxable_amt = round2((item.amount - item.discount_amount).max(0.0));
                let display_amt = item.amount; // original gross for Amount column
                let tax_rate = if item.resolved_gst_rate > 0.0 { item.resolved_gst_rate } else { item.tax_rate };

                // Tax calculation is based on net_amount (taxable base)
                // NOTE: When tax_inclusive is set, prepare_voucher_line already reverse-calculates
                // the ex-tax base before storing (divides by 1+rate/100). So item.amount,
                // item.net_amount, and item.rate are ALREADY ex-tax — do NOT divide again.
                let (base_amt, tax_amt, ex_tax_rate) = (taxable_amt, item.tax_amount, item.rate);

                // Display amount is also already ex-tax
                let display_base = display_amt;

                // Store the inclusive/original values for reference
                let inclusive_rate = if tax_inclusive && tax_rate > 0.0 { round2(item.rate * (1.0 + tax_rate / 100.0)) } else { item.rate };
                let inclusive_amount = if tax_inclusive && tax_rate > 0.0 { round2(display_amt * (1.0 + tax_rate / 100.0)) } else { display_amt };
                obj.insert("inclusive_rate".to_string(), json!(inclusive_rate));
                obj.insert("inclusive_amount".to_string(), json!(inclusive_amount));
                
                // Override rate and amount with ex-tax values — amount shows original (pre-invoice-discount)
                obj.insert("rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("amount".to_string(), json!(round2(display_base)));

                // Inject explicit ex-tax vars for backwards compatibility
                obj.insert("base_amount".to_string(), json!(round2(base_amt)));
                obj.insert("ex_tax_rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("tax_inclusive".to_string(), json!(tax_inclusive));

                // total = line total after item discount, before bill-level discount
                let total = item_level_taxable_amt * (1.0 + tax_rate / 100.0);
                obj.insert("total".to_string(), json!(round2(total)));

                // Add less_quantity field (count * deduction_per_unit)
                let less_quantity = round2((item.count as f64) * item.deduction_per_unit);
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
            let ship_to_obj = build_ship_to_obj(&invoice.metadata, &party_obj);
            let has_ship_to = ship_to_obj != party_obj;
            obj.insert("ship_to".to_string(), ship_to_obj);
            obj.insert("has_ship_to".to_string(), json!(has_ship_to));

            // Calculate subtotal for template
            let bill_discount = invoice.discount_amount.unwrap_or(0.0);
            let subtotal = invoice.grand_total - invoice.tax_amount + bill_discount;
            obj.insert("subtotal".to_string(), json!(round2(subtotal)));
            obj.insert("tax_total".to_string(), json!(invoice.tax_amount));
            obj.insert("tax_inclusive".to_string(), json!(tax_inclusive));
            obj.insert("has_discount".to_string(), json!(bill_discount > 0.0));
            obj.insert("bill_discount".to_string(), json!(round2(bill_discount)));

            let (formatted_return_items, return_total) = if let Some(linked_return_id) = invoice.linked_return_id.as_deref() {
                let return_items: Vec<crate::commands::sales_returns::SalesReturnItem> = sqlx::query_as(
                    "SELECT vi.*,
                            COALESCE(p.name, s.name) as product_name
                     FROM voucher_items vi
                     LEFT JOIN products p ON vi.product_id = p.id
                     LEFT JOIN services s ON vi.service_id = s.id
                     WHERE vi.voucher_id = ?",
                )
                .bind(linked_return_id)
                .fetch_all(pool)
                .await
                .unwrap_or_default();

                let total: f64 = sqlx::query_scalar(
                    "SELECT COALESCE(grand_total, total_amount, 0) FROM vouchers WHERE id = ? AND voucher_type = 'sales_return' AND deleted_at IS NULL",
                )
                .bind(linked_return_id)
                .fetch_optional(pool)
                .await
                .unwrap_or(None)
                .unwrap_or(0.0);

                let formatted: Vec<serde_json::Value> = return_items
                    .into_iter()
                    .map(|item| {
                        let mut item_val = serde_json::to_value(&item).unwrap_or(json!({}));
                        if let Some(obj) = item_val.as_object_mut() {
                            let tax_rate = if item.resolved_gst_rate > 0.0 { item.resolved_gst_rate } else { item.tax_rate };
                            let display_amt = if tax_inclusive && tax_rate > 0.0 {
                                item.amount / (1.0 + tax_rate / 100.0)
                            } else {
                                item.amount
                            };
                            obj.insert("amount".to_string(), json!(round2(display_amt)));
                            obj.insert("total".to_string(), json!(round2(item.net_amount + item.tax_amount)));
                            obj.insert("description".to_string(), json!(item.description.clone().or(item.product_name.clone()).unwrap_or_default()));
                        }
                        item_val
                    })
                    .collect();

                (formatted, total)
            } else {
                (Vec::new(), 0.0)
            };
            obj.insert("return_items".to_string(), serde_json::to_value(&formatted_return_items).unwrap_or(json!([])));
            obj.insert("return_total".to_string(), json!(round2(return_total)));
            obj.insert("has_returns".to_string(), json!(return_total > 0.0));
            obj.insert("net_payable".to_string(), json!(round2((invoice.grand_total - return_total).max(0.0))));

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

            // ======= Forex / Multi-Currency Context =======
            obj.insert("is_foreign_currency".to_string(), json!(is_foreign_currency));
            obj.insert("currency_code".to_string(), json!(forex_code.as_deref().unwrap_or("")));
            obj.insert("currency_symbol".to_string(), json!(forex_symbol.as_deref().unwrap_or("")));
            obj.insert("exchange_rate".to_string(), json!(forex_rate));
            obj.insert("foreign_total".to_string(), json!(forex_foreign_total));

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

async fn get_sales_quotation_data(
    pool: &SqlitePool,
    id: String,
) -> Result<serde_json::Value, String> {
    let invoice = crate::commands::quotations::get_sales_quotation_with_pool(pool, &id).await?;
    let items =
        crate::commands::quotations::get_sales_quotation_items_with_pool(pool, &id).await?;

    let coa_details: Option<(Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT party_id, account_name, gstin, address_line_1, state, city, postal_code FROM chart_of_accounts WHERE id = ?"
    )
    .bind(&invoice.customer_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let mut real_customer_id = None;
    let mut account_name = String::new();
    let mut gst_extra: Option<(Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> = None;

    if let Some((pid, name, gstin, addr, st, cty, pc)) = coa_details {
        real_customer_id = pid;
        account_name = name;
        if gstin.is_some() || addr.is_some() || st.is_some() {
            gst_extra = Some((gstin, addr, st, cty, pc));
        }
    }

    // Fallback: If COA had no GST info, try to find it in customers by party_id OR account_name
    if gst_extra.is_none() {
        if let Some(ref cid) = real_customer_id {
            gst_extra = sqlx::query_as("SELECT gstin, address_line_1, state, city, postal_code FROM customers WHERE id = ?")
                .bind(cid).fetch_optional(pool).await.unwrap_or(None);
        } else {
            gst_extra = sqlx::query_as("SELECT gstin, address_line_1, state, city, postal_code FROM customers WHERE name = ?")
                .bind(&account_name).fetch_optional(pool).await.unwrap_or(None);
        }
    }

    let customer = if let Some(ref cid) = real_customer_id {
        crate::commands::parties::get_customer_with_pool(pool, cid).await.ok()
    } else {
        None
    };

    // Fetch company profile and state for inter-state detection
    let company = crate::commands::company::get_company_profile_with_pool(pool).await.ok();
    let company_state = company.as_ref().and_then(|c| c.state.clone()).unwrap_or_default();
    let _company_gstin = company.as_ref().and_then(|c| c.gstin.clone()).unwrap_or_default();

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

    // Calculate total allocations for this specific invoice
    let total_allocated: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
    )
    .bind(&id)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);

    // Any payment vouchers created BEFORE this invoice are already part of old_balance.
    let advance_in_old_bal: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(pa.allocated_amount), 0.0)
         FROM payment_allocations pa
         JOIN vouchers v ON pa.payment_voucher_id = v.id
         WHERE pa.invoice_voucher_id = ?
           AND (v.voucher_date < ? OR (v.voucher_date = ? AND v.id < ?))
           AND v.deleted_at IS NULL",
    )
    .bind(&id)
    .bind(&invoice.voucher_date)
    .bind(&invoice.voucher_date)
    .bind(&id)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);

    // Paid amount for this invoice's transaction (collected at/after invoice time)
    let paid_amount = (total_allocated - advance_in_old_bal).max(0.0);

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
                let item_level_taxable_amt = round2((item.amount - item.discount_amount).max(0.0));
                let display_amt = item.amount; // original gross for Amount column
                let tax_rate = if item.resolved_gst_rate > 0.0 { item.resolved_gst_rate } else { item.tax_rate };

                // Tax calculation is based on net_amount (taxable base)
                // NOTE: When tax_inclusive is set, prepare_voucher_line already reverse-calculates
                // the ex-tax base before storing (divides by 1+rate/100). So item.amount,
                // item.net_amount, and item.rate are ALREADY ex-tax — do NOT divide again.
                let (base_amt, tax_amt, ex_tax_rate) = (taxable_amt, item.tax_amount, item.rate);

                // Display amount is also already ex-tax
                let display_base = display_amt;

                // Store the inclusive/original values for reference
                let inclusive_rate = if tax_inclusive && tax_rate > 0.0 { round2(item.rate * (1.0 + tax_rate / 100.0)) } else { item.rate };
                let inclusive_amount = if tax_inclusive && tax_rate > 0.0 { round2(display_amt * (1.0 + tax_rate / 100.0)) } else { display_amt };
                obj.insert("inclusive_rate".to_string(), json!(inclusive_rate));
                obj.insert("inclusive_amount".to_string(), json!(inclusive_amount));
                
                // Override rate and amount with ex-tax values — amount shows original (pre-invoice-discount)
                obj.insert("rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("amount".to_string(), json!(round2(display_base)));

                // Inject explicit ex-tax vars for backwards compatibility
                obj.insert("base_amount".to_string(), json!(round2(base_amt)));
                obj.insert("ex_tax_rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("tax_inclusive".to_string(), json!(tax_inclusive));

                // total = line total after item discount, before bill-level discount
                let total = item_level_taxable_amt * (1.0 + tax_rate / 100.0);
                obj.insert("total".to_string(), json!(round2(total)));

                // Add less_quantity field (count * deduction_per_unit)
                let less_quantity = round2((item.count as f64) * item.deduction_per_unit);
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
            let ship_to_obj = build_ship_to_obj(&invoice.metadata, &party_obj);
            let has_ship_to = ship_to_obj != party_obj;
            obj.insert("ship_to".to_string(), ship_to_obj);
            obj.insert("has_ship_to".to_string(), json!(has_ship_to));

            // Calculate subtotal for template
            let bill_discount = invoice.discount_amount.unwrap_or(0.0);
            let subtotal = invoice.grand_total - invoice.tax_amount + bill_discount;
            obj.insert("subtotal".to_string(), json!(round2(subtotal)));
            obj.insert("tax_total".to_string(), json!(invoice.tax_amount));
            obj.insert("tax_inclusive".to_string(), json!(tax_inclusive));
            obj.insert("has_discount".to_string(), json!(bill_discount > 0.0));
            obj.insert("bill_discount".to_string(), json!(round2(bill_discount)));

            let formatted_return_items: Vec<serde_json::Value> = Vec::new();
            let return_total = 0.0;
            obj.insert("return_items".to_string(), serde_json::to_value(&formatted_return_items).unwrap_or(json!([])));
            obj.insert("return_total".to_string(), json!(round2(return_total)));
            obj.insert("has_returns".to_string(), json!(false));
            obj.insert("net_payable".to_string(), json!(round2(invoice.grand_total.max(0.0))));

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

async fn get_delivery_note_data(
    pool: &SqlitePool,
    id: String,
) -> Result<serde_json::Value, String> {
    let invoice = crate::commands::delivery_notes::get_delivery_note_with_pool(pool, &id).await?;
    let items =
        crate::commands::delivery_notes::get_delivery_note_items_with_pool(pool, &id).await?;

    let coa_details: Option<(Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT party_id, account_name, gstin, address_line_1, state, city, postal_code FROM chart_of_accounts WHERE id = ?"
    )
    .bind(&invoice.customer_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let mut real_customer_id = None;
    let mut account_name = String::new();
    let mut gst_extra: Option<(Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> = None;

    if let Some((pid, name, gstin, addr, st, cty, pc)) = coa_details {
        real_customer_id = pid;
        account_name = name;
        if gstin.is_some() || addr.is_some() || st.is_some() {
            gst_extra = Some((gstin, addr, st, cty, pc));
        }
    }

    if gst_extra.is_none() {
        if let Some(ref cid) = real_customer_id {
            gst_extra = sqlx::query_as("SELECT gstin, address_line_1, state, city, postal_code FROM customers WHERE id = ?")
                .bind(cid).fetch_optional(pool).await.unwrap_or(None);
        } else {
            gst_extra = sqlx::query_as("SELECT gstin, address_line_1, state, city, postal_code FROM customers WHERE name = ?")
                .bind(&account_name).fetch_optional(pool).await.unwrap_or(None);
        }
    }

    let customer = if let Some(ref cid) = real_customer_id {
        crate::commands::parties::get_customer_with_pool(pool, cid).await.ok()
    } else {
        None
    };

    let company = crate::commands::company::get_company_profile_with_pool(pool).await.ok();
    let company_state = company.as_ref().and_then(|c| c.state.clone()).unwrap_or_default();

    let account_id = invoice.customer_id.clone();
    let old_balance: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(je.debit) - SUM(je.credit), 0.0)
         FROM journal_entries je
         JOIN vouchers v ON je.voucher_id = v.id
         WHERE je.account_id = ? AND v.deleted_at IS NULL",
    )
    .bind(&account_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);

    let tax_inclusive: bool = invoice.tax_inclusive != 0;

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

    let formatted_items: Vec<serde_json::Value> = items
        .into_iter()
        .map(|item| {
            let mut item_val = serde_json::to_value(&item).unwrap_or(json!({}));
            if let Some(obj) = item_val.as_object_mut() {
                let taxable_amt = item.net_amount;
                let item_level_taxable_amt = round2((item.amount - item.discount_amount).max(0.0));
                let display_amt = item.amount;
                let tax_rate = if item.resolved_gst_rate > 0.0 { item.resolved_gst_rate } else { item.tax_rate };

                // NOTE: When tax_inclusive is set, prepare_voucher_line already reverse-calculates
                // the ex-tax base before storing. item.amount, item.net_amount, item.rate are ALREADY ex-tax.
                let (base_amt, tax_amt, ex_tax_rate) = (taxable_amt, item.tax_amount, item.rate);

                let display_base = display_amt;

                let inclusive_rate = if tax_inclusive && tax_rate > 0.0 { round2(item.rate * (1.0 + tax_rate / 100.0)) } else { item.rate };
                let inclusive_amount = if tax_inclusive && tax_rate > 0.0 { round2(display_amt * (1.0 + tax_rate / 100.0)) } else { display_amt };
                obj.insert("inclusive_rate".to_string(), json!(inclusive_rate));
                obj.insert("inclusive_amount".to_string(), json!(inclusive_amount));
                obj.insert("rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("amount".to_string(), json!(round2(display_base)));
                obj.insert("base_amount".to_string(), json!(round2(base_amt)));
                obj.insert("ex_tax_rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("tax_inclusive".to_string(), json!(tax_inclusive));

                let total = item_level_taxable_amt * (1.0 + tax_rate / 100.0);
                obj.insert("total".to_string(), json!(round2(total)));

                let less_quantity = round2((item.count as f64) * item.deduction_per_unit);
                obj.insert("less_quantity".to_string(), json!(less_quantity));

                let (hsn, unit) = meta_map.get(&item.id).cloned().unwrap_or_default();
                obj.insert("hsn_sac_code".to_string(), json!(hsn));
                obj.insert("unit".to_string(), json!(unit));

                // Delivery-note-specific: final delivered quantity
                let final_qty = round2(item.final_quantity);
                obj.insert("final_quantity".to_string(), json!(final_qty));

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
            obj.insert("items".to_string(), serde_json::to_value(formatted_items.clone()).unwrap_or(json!([])));

            if let Some(c) = company {
                obj.insert("company".to_string(), serde_json::to_value(c).unwrap_or(json!({})));
            }

            let (party_gstin, party_state, party_address_1, party_city, party_postal) =
                if let Some((g, a1, s, c, p)) = &gst_extra {
                    (g.clone().unwrap_or_default(), s.clone().unwrap_or_default(), a1.clone().unwrap_or_default(), c.clone().unwrap_or_default(), p.clone().unwrap_or_default())
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
            let ship_to_obj = build_ship_to_obj(&invoice.metadata, &party_obj);
            let has_ship_to = ship_to_obj != party_obj;
            obj.insert("ship_to".to_string(), ship_to_obj);
            obj.insert("has_ship_to".to_string(), json!(has_ship_to));

            let bill_discount = invoice.discount_amount.unwrap_or(0.0);
            let subtotal = invoice.grand_total - invoice.tax_amount + bill_discount;
            obj.insert("subtotal".to_string(), json!(round2(subtotal)));
            obj.insert("tax_total".to_string(), json!(invoice.tax_amount));
            obj.insert("tax_inclusive".to_string(), json!(tax_inclusive));
            obj.insert("has_discount".to_string(), json!(bill_discount > 0.0));
            obj.insert("bill_discount".to_string(), json!(round2(bill_discount)));
            obj.insert("return_items".to_string(), json!([]));
            obj.insert("return_total".to_string(), json!(0.0));
            obj.insert("has_returns".to_string(), json!(false));
            obj.insert("net_payable".to_string(), json!(round2(invoice.grand_total.max(0.0))));
            obj.insert("is_cash".to_string(), json!(invoice.customer_name == "Cash"));
            obj.insert("old_balance".to_string(), json!(old_balance));
            obj.insert("paid_amount".to_string(), json!(0.0));
            obj.insert("balance_due".to_string(), json!(old_balance + invoice.grand_total));
            obj.insert("total_balance".to_string(), json!(old_balance + invoice.grand_total));

            // Label for template — so templates can print "DELIVERY NOTE" instead of "INVOICE"
            obj.insert("voucher_label".to_string(), json!("DELIVERY NOTE"));

            // Total delivered quantity (sum of final_quantity across all product items)
            let total_delivered_qty: f64 = formatted_items.iter().map(|it| {
                it.get("final_quantity").and_then(|v| v.as_f64()).unwrap_or(0.0)
            }).sum();
            obj.insert("total_delivered_qty".to_string(), json!(round2(total_delivered_qty)));
            obj.insert("total_items".to_string(), json!(formatted_items.len()));

            let inter_state = tax_utils::is_inter_state(Some(&company_state), Some(&party_state));
            inject_gst_context(obj, &pool, &id, &formatted_items, inter_state).await;
        }
        Ok(invoice_val)
    } else {
        Err("Failed to serialize delivery note".to_string())
    }
}

async fn get_sales_return_data(
    pool: &SqlitePool,
    id: String,
) -> Result<serde_json::Value, String> {
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
            COALESCE(v.tax_inclusive, 0) as tax_inclusive,
            COALESCE(v.is_margin_scheme_invoice, 0) as is_margin_scheme_invoice
         FROM vouchers v
         LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
         LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
         WHERE v.id = ? AND v.voucher_type = 'sales_return' AND v.deleted_at IS NULL
         GROUP BY v.id",
    )
    .bind(&id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Sales return not found".to_string())?;

    let items = sqlx::query_as::<_, crate::commands::invoices::SalesInvoiceItem>(
        "SELECT vi.*,
                COALESCE(p.code, s.code) as product_code,
                COALESCE(p.name, s.name) as product_name
         FROM voucher_items vi
         LEFT JOIN products p ON vi.product_id = p.id
         LEFT JOIN services s ON vi.service_id = s.id
         WHERE vi.voucher_id = ?",
    )
    .bind(&id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let coa_details: Option<(Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT party_id, account_name, gstin, address_line_1, state, city, postal_code FROM chart_of_accounts WHERE id = ?"
    )
    .bind(&invoice.customer_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let mut real_customer_id = None;
    let mut account_name = String::new();
    let mut gst_extra: Option<(Option<String>, Option<String>, Option<String>, Option<String>, Option<String>)> = None;

    if let Some((pid, name, gstin, addr, st, cty, pc)) = coa_details {
        real_customer_id = pid;
        account_name = name;
        if gstin.is_some() || addr.is_some() || st.is_some() {
            gst_extra = Some((gstin, addr, st, cty, pc));
        }
    }

    if gst_extra.is_none() {
        if let Some(ref cid) = real_customer_id {
            gst_extra = sqlx::query_as("SELECT gstin, address_line_1, state, city, postal_code FROM customers WHERE id = ?")
                .bind(cid).fetch_optional(pool).await.unwrap_or(None);
        } else {
            gst_extra = sqlx::query_as("SELECT gstin, address_line_1, state, city, postal_code FROM customers WHERE name = ?")
                .bind(&account_name).fetch_optional(pool).await.unwrap_or(None);
        }
    }

    let customer = if let Some(ref cid) = real_customer_id {
        crate::commands::parties::get_customer_with_pool(pool, cid).await.ok()
    } else {
        None
    };

    let company = crate::commands::company::get_company_profile_with_pool(pool).await.ok();
    let company_state = company.as_ref().and_then(|c| c.state.clone()).unwrap_or_default();

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
    let paid_amount: f64 = 0.0;
    let tax_inclusive: bool = invoice.tax_inclusive != 0;

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

    let formatted_items: Vec<serde_json::Value> = items
        .into_iter()
        .map(|item| {
            let mut item_val = serde_json::to_value(&item).unwrap_or(json!({}));
            if let Some(obj) = item_val.as_object_mut() {
                let taxable_amt = item.net_amount;
                let item_level_taxable_amt = round2((item.amount - item.discount_amount).max(0.0));
                let display_amt = item.amount;
                let tax_rate = if item.resolved_gst_rate > 0.0 { item.resolved_gst_rate } else { item.tax_rate };

                // NOTE: When tax_inclusive is set, prepare_voucher_line already reverse-calculates
                // the ex-tax base before storing. item.amount, item.net_amount, item.rate are ALREADY ex-tax.
                let (base_amt, tax_amt, ex_tax_rate) = (taxable_amt, item.tax_amount, item.rate);

                let display_base = display_amt;

                let inclusive_rate = if tax_inclusive && tax_rate > 0.0 { round2(item.rate * (1.0 + tax_rate / 100.0)) } else { item.rate };
                let inclusive_amount = if tax_inclusive && tax_rate > 0.0 { round2(display_amt * (1.0 + tax_rate / 100.0)) } else { display_amt };
                obj.insert("inclusive_rate".to_string(), json!(inclusive_rate));
                obj.insert("inclusive_amount".to_string(), json!(inclusive_amount));
                
                obj.insert("rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("amount".to_string(), json!(round2(display_base)));

                obj.insert("base_amount".to_string(), json!(round2(base_amt)));
                obj.insert("ex_tax_rate".to_string(), json!(round2(ex_tax_rate)));
                obj.insert("tax_inclusive".to_string(), json!(tax_inclusive));

                let total = item_level_taxable_amt * (1.0 + tax_rate / 100.0);
                obj.insert("total".to_string(), json!(round2(total)));

                let less_quantity = round2((item.count as f64) * item.deduction_per_unit);
                obj.insert("less_quantity".to_string(), json!(less_quantity));

                let (hsn, unit) = meta_map.get(&item.id).cloned().unwrap_or_default();
                obj.insert("hsn_sac_code".to_string(), json!(hsn));
                obj.insert("unit".to_string(), json!(unit));

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

            if let Some(c) = company {
                obj.insert("company".to_string(), serde_json::to_value(c).unwrap_or(json!({})));
            }

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
            obj.insert("ship_to".to_string(), party_obj);

            let bill_discount = invoice.discount_amount.unwrap_or(0.0);
            let subtotal = invoice.grand_total - invoice.tax_amount + bill_discount;
            obj.insert("subtotal".to_string(), json!(round2(subtotal)));
            obj.insert("tax_total".to_string(), json!(invoice.tax_amount));
            obj.insert("tax_inclusive".to_string(), json!(tax_inclusive));
            obj.insert("has_discount".to_string(), json!(bill_discount > 0.0));
            obj.insert("bill_discount".to_string(), json!(round2(bill_discount)));

            let formatted_return_items: Vec<serde_json::Value> = Vec::new();
            let return_total = 0.0;
            obj.insert("return_items".to_string(), serde_json::to_value(&formatted_return_items).unwrap_or(json!([])));
            obj.insert("return_total".to_string(), json!(round2(return_total)));
            obj.insert("has_returns".to_string(), json!(false));
            obj.insert("net_payable".to_string(), json!(round2(invoice.grand_total.max(0.0))));

            let is_cash = invoice.customer_name == "Cash";
            obj.insert("is_cash".to_string(), json!(is_cash));

            obj.insert("old_balance".to_string(), json!(old_balance));
            obj.insert("paid_amount".to_string(), json!(paid_amount));

            let balance_due = old_balance - invoice.grand_total;
            obj.insert("balance_due".to_string(), json!(balance_due));

            let total_balance = old_balance - invoice.grand_total;
            obj.insert("total_balance".to_string(), json!(total_balance));

            obj.insert("voucher_type".to_string(), json!("sales_return"));

            let inter_state = tax_utils::is_inter_state(
                Some(&company_state),
                Some(&party_state),
            );
            inject_gst_context(obj, pool, &id, &formatted_items, inter_state).await;
        }
        Ok(invoice_val)
    } else {
        Err("Failed to serialize sales return".to_string())
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
            v.deleted_at,
            v.created_from_invoice_id,
            u.full_name as created_by_name,
            v.currency_id,
            v.exchange_rate,
            v.foreign_total,
            cur.code as currency_code,
            COALESCE(cur.symbol, cur.code) as currency_symbol
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
        LEFT JOIN users u ON v.created_by = u.id
        LEFT JOIN currencies cur ON v.currency_id = cur.id
        WHERE v.id = ? AND v.voucher_type = 'payment' AND v.deleted_at IS NULL
        GROUP BY v.id",
    )
    .bind(id.clone())
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let items = crate::commands::entries::get_payment_items_with_pool(pool, &id).await?;

    let mut party_account_id = items.iter().find_map(|i| i.ledger_id.clone());
    if party_account_id.is_none() {
        party_account_id = sqlx::query_scalar(
            "SELECT account_id FROM journal_entries WHERE voucher_id = ? AND debit > 0 AND account_id != 'sys_forex_loss' LIMIT 1"
        )
        .bind(&id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
    }

    let (party_name, party_acc_id) = if let Some(ref acc_id) = party_account_id {
        let name: String = sqlx::query_scalar("SELECT account_name FROM chart_of_accounts WHERE id = ?")
            .bind(acc_id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten()
            .unwrap_or_default();
        (name, acc_id.clone())
    } else {
        (String::new(), voucher.account_id.clone())
    };

    let is_cash = party_name.trim().eq_ignore_ascii_case("cash") || party_acc_id == "sys_cash";

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
    .bind(&party_acc_id)
    .bind(&voucher.voucher_date)
    .bind(&voucher.voucher_date)
    .bind(&id)
    .fetch_one(pool)
    .await
    .unwrap_or((0.0, 0.0));

    let old_balance = balance_res.0 - balance_res.1;
    let balance_due = old_balance + voucher.grand_total;
    let total_balance = balance_due;

    let mut val = serde_json::to_value(&voucher).map_err(|e| e.to_string())?;
    if let Some(obj) = val.as_object_mut() {
        obj.insert(
            "items".to_string(),
            serde_json::to_value(items).unwrap_or(json!([])),
        );
        obj.insert("old_balance".to_string(), json!(old_balance));
        obj.insert("balance_due".to_string(), json!(balance_due));
        obj.insert("total_balance".to_string(), json!(total_balance));
        obj.insert("paid_amount".to_string(), json!(voucher.grand_total));
        obj.insert("is_cash".to_string(), json!(is_cash));
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
            COALESCE(SUM(vi.tax_amount), 0.0) as tax_amount,
            v.grand_total,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at,
            v.created_from_invoice_id,
            u.full_name as created_by_name,
            v.currency_id,
            v.exchange_rate,
            v.foreign_total,
            cur.code as currency_code,
            COALESCE(cur.symbol, cur.code) as currency_symbol
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
        LEFT JOIN users u ON v.created_by = u.id
        LEFT JOIN currencies cur ON v.currency_id = cur.id
        WHERE v.id = ? AND v.voucher_type = 'receipt' AND v.deleted_at IS NULL
        GROUP BY v.id",
    )
    .bind(id.clone())
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    let items = crate::commands::entries::get_receipt_items_with_pool(pool, &id).await?;
    let company = crate::commands::company::get_company_profile_with_pool(pool).await.ok();

    let received_from = items
        .iter()
        .map(|i| i.description.clone())
        .collect::<Vec<String>>()
        .join(", ");

    let mut party_account_id = items.iter().find_map(|i| i.ledger_id.clone());
    if party_account_id.is_none() {
        party_account_id = sqlx::query_scalar(
            "SELECT account_id FROM journal_entries WHERE voucher_id = ? AND credit > 0 AND account_id != 'sys_forex_gain' LIMIT 1"
        )
        .bind(&id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten();
    }

    let (party_name, party_acc_id) = if let Some(ref acc_id) = party_account_id {
        let name: String = sqlx::query_scalar("SELECT account_name FROM chart_of_accounts WHERE id = ?")
            .bind(acc_id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten()
            .unwrap_or_else(|| received_from.clone());
        (name, acc_id.clone())
    } else {
        (received_from.clone(), voucher.account_id.clone())
    };

    let is_cash = party_name.trim().eq_ignore_ascii_case("cash") || party_acc_id == "sys_cash";

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
    .bind(&party_acc_id)
    .bind(&voucher.voucher_date)
    .bind(&voucher.voucher_date)
    .bind(&id)
    .fetch_one(pool)
    .await
    .unwrap_or((0.0, 0.0));

    let old_balance = balance_res.0 - balance_res.1;
    let balance_due = old_balance - voucher.grand_total;
    let total_balance = balance_due;

    let mut val = serde_json::to_value(&voucher).map_err(|e| e.to_string())?;
    if let Some(obj) = val.as_object_mut() {
        obj.insert(
            "items".to_string(),
            serde_json::to_value(items).unwrap_or(json!([])),
        );
        obj.insert("received_from".to_string(), serde_json::json!(received_from));
        obj.insert("old_balance".to_string(), json!(old_balance));
        obj.insert("balance_due".to_string(), json!(balance_due));
        obj.insert("total_balance".to_string(), json!(total_balance));
        obj.insert("paid_amount".to_string(), json!(voucher.grand_total));
        obj.insert("is_cash".to_string(), json!(is_cash));
        if let Some(c) = company {
            obj.insert("company".to_string(), serde_json::to_value(c).unwrap_or(json!({})));
        }
        if let Some(method) = obj.get("receipt_method").and_then(|v| v.as_str()) {
            let capitalized = match method {
                "cash" => "Cash",
                "bank" => "Bank",
                other => other,
            };
            obj.insert("receipt_method".to_string(), serde_json::json!(capitalized));
        }
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

    // 2. e-Invoice and Margin Scheme fields from voucher
    let einv: Option<(Option<String>, Option<String>, Option<String>, Option<i64>)> = sqlx::query_as(
        "SELECT irn, ack_no, ack_date, is_margin_scheme_invoice FROM vouchers WHERE id = ?",
    )
    .bind(voucher_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let (irn, ack_no, ack_date, is_margin) = einv.unwrap_or((None, None, None, None));
    let is_margin_scheme = is_margin.unwrap_or(0) == 1;

    obj.insert("gst_enabled".to_string(), json!(gst_enabled));
    obj.insert("is_inter_state".to_string(), json!(is_inter_state));
    obj.insert("is_margin_scheme_invoice".to_string(), json!(is_margin_scheme));

    let margin_scheme_note: String = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'margin_scheme_note'",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .unwrap_or_else(|| "Supply of second-hand goods under the Margin Scheme as per Rule 32(5) of CGST Rules, 2017. Input Tax Credit is not available to the purchaser on this supply.".to_string());
    obj.insert("margin_scheme_note".to_string(), json!(margin_scheme_note));

    let qr_data = irn.as_deref().and_then(crate::commands::tax_utils::irn_to_qr_base64);
    obj.insert("irn".to_string(), json!(irn));
    obj.insert("ack_no".to_string(), json!(ack_no));
    obj.insert("ack_date".to_string(), json!(ack_date));
    obj.insert("qr_code_data".to_string(), json!(qr_data));

    // 3. GST amounts from the already-formatted items — base_amount is already reverse-calculated if tax_inclusive
    // Under margin scheme, the taxable total is the sum of margin_amount (the profit margin), not the base sale amount.
    let taxable_total: f64 = items
        .iter()
        .filter_map(|i| {
            if is_margin_scheme {
                i["margin_amount"].as_f64()
            } else {
                i["base_amount"].as_f64()
            }
        })
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
        // Under margin scheme, HSN taxable value is the margin amount, not the full sale base
        let taxable = if is_margin_scheme {
            item["margin_amount"].as_f64().unwrap_or(0.0)
        } else {
            item["base_amount"].as_f64().unwrap_or(0.0)
        };
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

// ============= CUSTOM ORDER SLIP =============

/// Embedded HTML for the custom order job slip (thermal 80mm layout)
const CUSTOM_ORDER_SLIP_HTML: &str = include_str!("../../resources/templates/custom_order_slip.html");
/// Reuse the standard thermal 80mm CSS
const THERMAL_80MM_CSS: &str = include_str!("../../resources/templates/thermal_80mm.css");

/// Render a pre-delivery Job Order Slip for a custom order.
/// This command is called from the frontend when the user wants to print
/// an order confirmation slip BEFORE the order is finalized.
#[tauri::command]
pub async fn render_custom_order_slip(
    registry: State<'_, Arc<DbRegistry>>,
    order_id: String,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;

    // 1. Fetch the custom order details
    let order = sqlx::query(
        "SELECT
            co.order_no, co.order_date, co.delivery_date,
            co.finished_item_name, co.finished_item_qty, co.finished_item_unit,
            co.sale_price, co.advance_amount, co.narration, co.status,
            COALESCE(coa.account_name, c.name, '') as customer_name,
            c.phone as customer_phone
         FROM custom_orders co
         LEFT JOIN chart_of_accounts coa ON co.customer_id = coa.id OR co.customer_id = coa.party_id
         LEFT JOIN customers c ON co.customer_id = c.id OR coa.party_id = c.id
         WHERE co.id = ? AND co.deleted_at IS NULL"
    )
    .bind(&order_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Custom order not found".to_string())?;

    use sqlx::Row;
    let order_no: String = order.try_get("order_no").unwrap_or_default();
    let order_date: String = order.try_get("order_date").unwrap_or_default();
    let delivery_date: Option<String> = order.try_get("delivery_date").ok().flatten();
    let finished_item_name: String = order.try_get("finished_item_name").unwrap_or_default();
    let finished_item_qty: f64 = order.try_get("finished_item_qty").unwrap_or(1.0);
    let finished_item_unit: Option<String> = order.try_get("finished_item_unit").ok().flatten();
    let sale_price: f64 = order.try_get("sale_price").unwrap_or(0.0);
    let advance_amount: f64 = order.try_get("advance_amount").unwrap_or(0.0);
    let narration: Option<String> = order.try_get("narration").ok().flatten();
    let customer_name: String = order.try_get("customer_name").unwrap_or_default();
    let customer_phone: Option<String> = order.try_get("customer_phone").ok().flatten();

    let balance_due = (sale_price - advance_amount).max(0.0);

    // 2. Fetch services for this order
    let services_rows = sqlx::query(
        "SELECT description, amount FROM custom_order_services WHERE order_id = ? ORDER BY created_at ASC"
    )
    .bind(&order_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let services: Vec<serde_json::Value> = services_rows
        .iter()
        .map(|r| {
            let desc: String = r.try_get("description").unwrap_or_default();
            let amt: f64 = r.try_get("amount").unwrap_or(0.0);
            json!({"description": desc, "amount": amt})
        })
        .collect();

    // 3. Build voucher data for the template
    let voucher_data = json!({
        "order_no": order_no,
        "order_date": order_date,
        "delivery_date": delivery_date,
        "finished_item_name": finished_item_name,
        "finished_item_qty": finished_item_qty,
        "finished_item_unit": finished_item_unit,
        "sale_price": sale_price,
        "advance_amount": if advance_amount > 0.0 { json!(advance_amount) } else { json!(null) },
        "balance_due": balance_due,
        "narration": narration,
        "party": {
            "name": customer_name,
            "phone": customer_phone
        },
        "services": if services.is_empty() { json!(null) } else { json!(services) },
        // Expose grand_total so the template engine can compute words (optional)
        "grand_total": sale_price,
        "voucher_no": order_no,
        "voucher_date": order_date,
    });

    // 4. Get company profile
    let company = crate::commands::company::get_company_profile_with_pool(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // 5. Parse the embedded template into header/body/footer sections
    let sections: Vec<&str> = CUSTOM_ORDER_SLIP_HTML.split("<!-- [").collect();
    let mut header = String::new();
    let mut body = String::new();
    let mut footer = String::new();
    for section in &sections {
        if section.starts_with("HEADER] -->") {
            header = section.replacen("HEADER] -->", "", 1).trim().to_string();
        } else if section.starts_with("BODY] -->") {
            body = section.replacen("BODY] -->", "", 1).trim().to_string();
        } else if section.starts_with("FOOTER] -->") {
            footer = section.replacen("FOOTER] -->", "", 1).trim().to_string();
        }
    }

    // 6. Build a synthetic InvoiceTemplate struct to pass to the engine
    let template = InvoiceTemplate {
        id: "custom_order_slip".to_string(),
        template_number: "CO-SLIP-001".to_string(),
        name: "Custom Order Slip".to_string(),
        description: None,
        voucher_type: "custom_order".to_string(),
        template_format: "thermal_80mm".to_string(),
        design_mode: Some("compact".to_string()),
        layout_config: None,
        header_html: header,
        body_html: body,
        footer_html: footer,
        styles_css: THERMAL_80MM_CSS.to_string(),
        show_logo: Some(1),
        show_company_address: Some(1),
        show_party_name: Some(1),
        show_party_address: Some(0),
        table_row_padding: Some(4),
        show_gstin: Some(1),
        show_item_images: Some(0),
        show_item_hsn: Some(0),
        show_bank_details: Some(0),
        show_qr_code: Some(0),
        show_signature: Some(0),
        show_terms: Some(0),
        show_less_column: Some(0),
        show_discount_column: Some(0),
        show_balance_section: Some(0),
        balance_font_size: Some(10),
        balance_bold: Some(0),
        auto_print: Some(0),
        copies: Some(1),
        is_default: Some(1),
        is_active: Some(1),
        letterhead_data: None,
        use_letterhead: Some(0),
        letterhead_margin_top: Some(45.0),
        letterhead_margin_bottom: Some(25.0),
        header_title: Some("Job Order Slip".to_string()),
        bill_note: None,
        created_at: "2024-01-01".to_string(),
        updated_at: "2024-01-01".to_string(),
    };

    // 7. Render via the shared template engine
    let mut engine = TEMPLATE_ENGINE.lock().map_err(|e| e.to_string())?;
    engine.render_invoice(&template, &company, voucher_data)
}

fn build_ship_to_obj(
    metadata: &Option<String>,
    billing_party: &serde_json::Value,
) -> serde_json::Value {
    if let Some(meta_str) = metadata {
        if let Ok(meta) = serde_json::from_str::<serde_json::Value>(meta_str) {
            if let Some(ship_to) = meta.get("ship_to") {
                if !ship_to.is_null() {
                    return serde_json::json!({
                        "name": ship_to["name"],
                        "address_line_1": ship_to["address_line_1"],
                        "address_line_2": ship_to["address_line_2"],
                        "city": ship_to["city"],
                        "state": ship_to["state"],
                        "postal_code": ship_to["postal_code"],
                        "gstin": ship_to["gstin"],
                    });
                }
            }
        }
    }
    // Fallback: ship-to = billing party
    billing_party.clone()
}
