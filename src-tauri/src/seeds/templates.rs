use sqlx::SqlitePool;
use uuid::Uuid;

// Consolidated Templates
const A4_HTML: &str = include_str!("../../resources/templates/a4_professional.html");
const A4_CSS: &str = include_str!("../../resources/templates/a4_professional.css");

const THERMAL_80MM_HTML: &str = include_str!("../../resources/templates/thermal_80mm.html");
const THERMAL_80MM_CSS: &str = include_str!("../../resources/templates/thermal_80mm.css");

const MINIMAL_HTML: &str = include_str!("../../resources/templates/minimal_clean.html");
const MINIMAL_CSS: &str = include_str!("../../resources/templates/minimal_clean.css");

fn split_template(html: &str) -> (String, String, String) {
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

    (header, body, footer)
}

pub async fn seed_handlebars_templates(
    pool: &SqlitePool,
) -> Result<(), Box<dyn std::error::Error>> {
    // Professional A4 Template
    let (a4_h, a4_b, a4_f) = split_template(A4_HTML);
    sqlx::query(
        "INSERT OR IGNORE INTO invoice_templates (
            id, template_number, name, description, voucher_type, template_format, design_mode,
            header_html, body_html, footer_html, styles_css, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::now_v7().to_string())
    .bind("TPL-SI-001")
    .bind("Professional A4 Invoice")
    .bind("Modern professional invoice with complete company branding and detailed line items")
    .bind("sales_invoice")
    .bind("a4_portrait")
    .bind("standard")
    .bind(&a4_h)
    .bind(&a4_b)
    .bind(&a4_f)
    .bind(A4_CSS)
    .bind(1)
    .execute(pool)
    .await?;

    // Thermal 80mm Template
    let (t80_h, t80_b, t80_f) = split_template(THERMAL_80MM_HTML);
    sqlx::query(
        "INSERT OR IGNORE INTO invoice_templates (
            id, template_number, name, description, voucher_type, template_format, design_mode,
            header_html, body_html, footer_html, styles_css, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::now_v7().to_string())
    .bind("TPL-SI-002")
    .bind("Thermal 80mm Receipt")
    .bind("Compact receipt for 80mm thermal printers (POS systems)")
    .bind("sales_invoice")
    .bind("thermal_80mm")
    .bind("compact")
    .bind(&t80_h)
    .bind(&t80_b)
    .bind(&t80_f)
    .bind(THERMAL_80MM_CSS)
    .bind(0)
    .execute(pool)
    .await?;

    // Minimal Clean Invoice Template
    let (min_h, min_b, min_f) = split_template(MINIMAL_HTML);
    sqlx::query(
        "INSERT OR IGNORE INTO invoice_templates (
            id, template_number, name, description, voucher_type, template_format, design_mode,
            header_html, body_html, footer_html, styles_css, 
            show_logo, show_company_address, show_party_address, 
            show_bank_details, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::now_v7().to_string())
    .bind("TPL-SI-003")
    .bind("Minimal Clean Invoice")
    .bind("Clean, minimalist invoice design with clear typography and professional spacing")
    .bind("sales_invoice")
    .bind("a4_portrait")
    .bind("minimal")
    .bind(&min_h)
    .bind(&min_b)
    .bind(&min_f)
    .bind(MINIMAL_CSS)
    .bind(1) // show_logo
    .bind(1) // show_company_address
    .bind(1) // show_party_address
    .bind(1) // show_bank_details
    .bind(0) // not default
    .execute(pool)
    .await?;

    // ==================== PURCHASE INVOICE TEMPLATES ====================

    // Purchase Invoice A4 (Reuse Professional A4)
    sqlx::query(
        "INSERT OR IGNORE INTO invoice_templates (
            id, template_number, name, description, voucher_type, template_format, design_mode,
            header_html, body_html, footer_html, styles_css, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::now_v7().to_string())
    .bind("TPL-PI-001")
    .bind("Standard Purchase Order")
    .bind("Professional purchase invoice format")
    .bind("purchase_invoice")
    .bind("a4_portrait")
    .bind("standard")
    .bind(&a4_h)
    .bind(&a4_b)
    .bind(&a4_f)
    .bind(A4_CSS)
    .bind(1)
    .execute(pool)
    .await?;

    // Purchase Invoice Thermal (Reuse Thermal)
    sqlx::query(
        "INSERT OR IGNORE INTO invoice_templates (
            id, template_number, name, description, voucher_type, template_format, design_mode,
            header_html, body_html, footer_html, styles_css, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::now_v7().to_string())
    .bind("TPL-PI-002")
    .bind("Thermal Purchase Receipt")
    .bind("Thermal print format for purchase invoices")
    .bind("purchase_invoice")
    .bind("thermal_80mm")
    .bind("compact")
    .bind(&t80_h)
    .bind(&t80_b)
    .bind(&t80_f)
    .bind(THERMAL_80MM_CSS)
    .bind(0)
    .execute(pool)
    .await?;

    // Update default templates with latest content
    sqlx::query("UPDATE invoice_templates SET header_html = ?, body_html = ?, footer_html = ? WHERE template_number = 'TPL-SI-001' AND design_mode = 'standard'")
        .bind(&a4_h)
        .bind(&a4_b)
        .bind(&a4_f)
        .execute(pool)
        .await?;

    sqlx::query("UPDATE invoice_templates SET header_html = ?, body_html = ?, footer_html = ? WHERE template_number = 'TPL-SI-002'")
        .bind(&t80_h)
        .bind(&t80_b)
        .bind(&t80_f)
        .execute(pool)
        .await?;

    Ok(())
}
