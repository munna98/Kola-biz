use crate::commands::{CompanyProfile, InvoiceTemplate};
use handlebars::Handlebars;
use serde_json::json;

pub struct TemplateEngine {
    handlebars: Handlebars<'static>,
}

impl TemplateEngine {
    pub fn new() -> Result<Self, String> {
        let mut handlebars = Handlebars::new();

        // Register custom helpers
        handlebars.register_helper("format_currency", Box::new(format_currency_helper));
        handlebars.register_helper("format_date", Box::new(format_date_helper));
        handlebars.register_helper("number_to_words", Box::new(number_to_words_helper));
        handlebars.register_helper("format_number", Box::new(format_number_helper));
        handlebars.register_helper("increment", Box::new(increment_helper));

        // Disable strict mode to allow optional fields in templates
        handlebars.set_strict_mode(false);

        Ok(Self { handlebars })
    }

    pub fn render_invoice(
        &mut self,
        template: &InvoiceTemplate,
        company: &CompanyProfile,
        voucher_data: serde_json::Value,
    ) -> Result<String, String> {
        // Register templates
        self.handlebars
            .register_template_string("header", &template.header_html)
            .map_err(|e| format!("Header template error: {}", e))?;

        self.handlebars
            .register_template_string("body", &template.body_html)
            .map_err(|e| format!("Body template error: {}", e))?;

        self.handlebars
            .register_template_string("footer", &template.footer_html)
            .map_err(|e| format!("Footer template error: {}", e))?;

        // Prepare template data
        let data = self.prepare_template_data(template, company, voucher_data)?;

        // Render sections
        let header_html = self
            .handlebars
            .render("header", &data)
            .map_err(|e| format!("Header render error: {}", e))?;

        let body_html = self
            .handlebars
            .render("body", &data)
            .map_err(|e| format!("Body render error: {}", e))?;

        let footer_html = self
            .handlebars
            .render("footer", &data)
            .map_err(|e| format!("Footer render error: {}", e))?;

        // Combine into full HTML
        Ok(self.build_complete_html(&template.styles_css, &header_html, &body_html, &footer_html))
    }

    fn prepare_template_data(
        &self,
        template: &InvoiceTemplate,
        company: &CompanyProfile,
        mut voucher_data: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        // Inject Template Settings
        if let Some(obj) = voucher_data.as_object_mut() {
            obj.insert(
                "show_logo".to_string(),
                json!(template.show_logo.unwrap_or(1) == 1),
            ); // Default for safety
            obj.insert(
                "show_company_address".to_string(),
                json!(template.show_company_address.unwrap_or(1) == 1),
            );
            obj.insert(
                "show_party_address".to_string(),
                json!(template.show_party_address.unwrap_or(1) == 1),
            );
            obj.insert(
                "show_gstin".to_string(),
                json!(template.show_gstin.unwrap_or(1) == 1),
            );
            obj.insert(
                "show_item_images".to_string(),
                json!(template.show_item_images.unwrap_or(0) == 1),
            );
            obj.insert(
                "show_item_hsn".to_string(),
                json!(template.show_item_hsn.unwrap_or(0) == 1),
            );
            obj.insert(
                "show_bank_details".to_string(),
                json!(template.show_bank_details.unwrap_or(1) == 1),
            );
            obj.insert(
                "show_qr_code".to_string(),
                json!(template.show_qr_code.unwrap_or(0) == 1),
            );
            obj.insert(
                "show_signature".to_string(),
                json!(template.show_signature.unwrap_or(1) == 1),
            );
            obj.insert(
                "show_terms".to_string(),
                json!(template.show_terms.unwrap_or(1) == 1),
            );
            obj.insert(
                "show_less_column".to_string(),
                json!(template.show_less_column.unwrap_or(1) == 1),
            );
        }

        // Add company data
        voucher_data["company"] = json!({
            "name": company.company_name,
            "address": self.format_company_address(company),
            "address_line1": company.address_line1,
            "address_line2": company.address_line2,
            "city": company.city,
            "state": company.state,
            "pincode": company.pincode,
            "country": company.country,
            "phone": company.phone,
            "email": company.email,
            "website": company.website,
            "gstin": company.gstin,
            "pan": company.pan,
            "cin": company.cin,
            "logo": company.logo_data,
            "has_logo": company.logo_data.is_some(),
        });

        // Add bank details
        voucher_data["bank"] = json!({
            "name": company.bank_name,
            "account_no": company.bank_account_no,
            "ifsc": company.bank_ifsc,
            "branch": company.bank_branch,
            "has_details": company.bank_name.is_some(),
        });

        // Add terms
        voucher_data["terms_and_conditions"] = json!(company.terms_and_conditions);
        voucher_data["has_terms"] = json!(company.terms_and_conditions.is_some());

        // Convert amount to words if grand_total exists
        if let Some(total) = voucher_data.get("grand_total").and_then(|v| v.as_f64()) {
            voucher_data["grand_total_words"] = json!(crate::utils::number_to_words_indian(total));
        }

        Ok(voucher_data)
    }

    fn format_company_address(&self, company: &CompanyProfile) -> String {
        let mut parts = Vec::new();
        if let Some(a1) = &company.address_line1 {
            parts.push(a1.clone());
        }
        if let Some(a2) = &company.address_line2 {
            parts.push(a2.clone());
        }
        if let Some(city) = &company.city {
            parts.push(city.clone());
        }
        if let Some(state) = &company.state {
            parts.push(state.clone());
        }
        if let Some(pin) = &company.pincode {
            parts.push(pin.clone());
        }
        parts.join(", ")
    }

    fn build_complete_html(&self, styles: &str, header: &str, body: &str, footer: &str) -> String {
        format!(
            r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Arial', 'Helvetica', sans-serif; }}
        @media print {{
            @page {{ margin: 0; size: auto; }}
            body {{ margin: 0; }}
        }}
        {}
    </style>
</head>
<body>
    {}
    {}
    {}
</body>
</html>"#,
            styles, header, body, footer
        )
    }
}

// ============= HANDLEBARS HELPERS =============

use handlebars::{
    Context, Handlebars as HB, Helper, HelperResult, Output, RenderContext, RenderErrorReason,
};

// Format currency in Indian format
fn format_currency_helper(
    h: &Helper,
    _: &HB,
    _: &Context,
    _: &mut RenderContext,
    out: &mut dyn Output,
) -> HelperResult {
    // Handle null/undefined values gracefully
    let value = h.param(0).and_then(|v| v.value().as_f64()).unwrap_or(0.0);

    // Indian number format: 1,23,456.78
    let formatted = format_indian_currency(value);
    out.write(&format!("₹{}", formatted))?;
    Ok(())
}

fn format_indian_currency(num: f64) -> String {
    let _is_negative = num < 0.0;
    let num = num.abs();

    let rupees = num.floor() as i64;
    let paise = ((num - rupees as f64) * 100.0).round() as i64;

    let rupees_str = format_indian_number(rupees);

    if paise > 0 {
        format!("{}.{:02}", rupees_str, paise)
    } else {
        rupees_str
    }
}

fn format_indian_number(mut num: i64) -> String {
    if num == 0 {
        return "0".to_string();
    }

    let is_negative = num < 0;
    num = num.abs();

    let mut result = Vec::new();

    // Last 3 digits
    if num > 0 {
        result.push(format!("{:03}", num % 1000));
        num /= 1000;
    }

    // Groups of 2
    while num > 0 {
        result.push(format!("{:02}", num % 100));
        num /= 100;
    }

    result.reverse();

    // Remove leading zeros from first group
    if let Some(first) = result.first_mut() {
        *first = first.trim_start_matches('0').to_string();
    }

    let formatted = result.join(",");
    if is_negative {
        format!("-{}", formatted)
    } else {
        formatted
    }
}

// Format date
fn format_date_helper(
    h: &Helper,
    _: &HB,
    _: &Context,
    _: &mut RenderContext,
    out: &mut dyn Output,
) -> HelperResult {
    let date_str = h
        .param(0)
        .and_then(|v| v.value().as_str())
        .ok_or_else(|| RenderErrorReason::Other("Invalid date string".to_string()))?;

    // Parse and format date (assumes YYYY-MM-DD input)
    // Convert to DD/MM/YYYY or custom format
    if let Some(formatted) = format_date_ddmmyyyy(date_str) {
        out.write(&formatted)?;
    } else {
        out.write(date_str)?;
    }

    Ok(())
}

fn format_date_ddmmyyyy(date_str: &str) -> Option<String> {
    let parts: Vec<&str> = date_str.split('-').collect();
    if parts.len() == 3 {
        Some(format!("{}/{}/{}", parts[2], parts[1], parts[0]))
    } else {
        None
    }
}

// Number to words
fn number_to_words_helper(
    h: &Helper,
    _: &HB,
    _: &Context,
    _: &mut RenderContext,
    out: &mut dyn Output,
) -> HelperResult {
    let value = h
        .param(0)
        .and_then(|v| v.value().as_f64())
        .ok_or_else(|| RenderErrorReason::Other("Invalid number".to_string()))?;

    let words = crate::utils::number_to_words_indian(value);
    out.write(&words)?;
    Ok(())
}

// Format number with specified decimals
fn format_number_helper(
    h: &Helper,
    _: &HB,
    _: &Context,
    _: &mut RenderContext,
    out: &mut dyn Output,
) -> HelperResult {
    let decimals = h.param(1).and_then(|v| v.value().as_u64()).unwrap_or(2) as usize;

    // Handle null/undefined values gracefully
    let value = h.param(0).and_then(|v| v.value().as_f64()).unwrap_or(0.0);

    out.write(&format!("{:.1$}", value, decimals))?;
    Ok(())
}

// Increment index (for 1-based numbering in templates)
fn increment_helper(
    h: &Helper,
    _: &HB,
    _: &Context,
    _: &mut RenderContext,
    out: &mut dyn Output,
) -> HelperResult {
    let value = h.param(0).and_then(|v| v.value().as_u64()).unwrap_or(0);

    out.write(&format!("{}", value + 1))?;
    Ok(())
}
