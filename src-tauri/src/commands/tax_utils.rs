/// GST Calculation Utilities
///
/// This module provides slab-based GST resolution for invoice line items.
/// It handles both fixed-rate and price-threshold dynamic slabs (e.g. 5/12% @1000).

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

// ============= DATA MODELS =============

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct GstTaxSlab {
    pub id: String,
    pub name: String,
    pub is_dynamic: i64,   // 0 = fixed, 1 = threshold-based
    pub fixed_rate: f64,
    pub threshold: f64,
    pub below_rate: f64,
    pub above_rate: f64,
    pub is_active: i64,
}

/// Result of GST calculation for a single line item.
#[derive(Debug, Clone, Serialize)]
pub struct ResolvedGst {
    pub effective_rate: f64,  // total GST% (e.g. 18.0)
    pub cgst_rate: f64,       // half of effective_rate when intra-state
    pub sgst_rate: f64,       // half of effective_rate when intra-state
    pub igst_rate: f64,       // = effective_rate when inter-state
    pub cgst_amount: f64,
    pub sgst_amount: f64,
    pub igst_amount: f64,
    pub total_tax: f64,
}

// ============= CORE CALCULATION =============

/// Resolve effective GST rate from a slab and unit_price, then split into
/// CGST/SGST (intra-state) or IGST (inter-state) on `taxable_value`.
pub fn calculate_gst(
    taxable_value: f64,
    unit_price: f64,
    slab: &GstTaxSlab,
    is_inter_state: bool,
) -> ResolvedGst {
    let effective_rate = resolve_effective_rate(unit_price, slab);
    compute_split(taxable_value, effective_rate, is_inter_state)
}

/// Resolve the effective GST rate from a slab and a unit price.
pub fn resolve_effective_rate(unit_price: f64, slab: &GstTaxSlab) -> f64 {
    if slab.is_dynamic == 1 {
        if unit_price < slab.threshold {
            slab.below_rate
        } else {
            slab.above_rate
        }
    } else {
        slab.fixed_rate
    }
}

/// Given a taxable value and effective rate, split into CGST+SGST or IGST.
pub fn compute_split(taxable_value: f64, effective_rate: f64, is_inter_state: bool) -> ResolvedGst {
    let total_tax = round2((taxable_value * effective_rate) / 100.0);

    if is_inter_state {
        ResolvedGst {
            effective_rate,
            cgst_rate: 0.0,
            sgst_rate: 0.0,
            igst_rate: effective_rate,
            cgst_amount: 0.0,
            sgst_amount: 0.0,
            igst_amount: total_tax,
            total_tax,
        }
    } else {
        let split_rate = effective_rate / 2.0;
        let cgst_amount = round2(total_tax / 2.0);
        let sgst_amount = round2(total_tax - cgst_amount);
        ResolvedGst {
            effective_rate,
            cgst_rate: split_rate,
            sgst_rate: split_rate,
            igst_rate: 0.0,
            cgst_amount,
            sgst_amount,
            igst_amount: 0.0,
            total_tax,
        }
    }
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

// ============= ACCOUNT RESOLUTION =============

/// Names of the ledger accounts to post GST journal entries to.
pub struct GstAccounts {
    /// When intra-state: CGST payable / CGST input credit account name
    pub cgst_account: Option<String>,
    /// When intra-state: SGST payable / SGST input credit account name
    pub sgst_account: Option<String>,
    /// When inter-state: IGST payable / IGST input credit account name
    pub igst_account: Option<String>,
}

/// Resolve the GST COA account names for a given effective rate, state type, and flow direction.
/// `is_purchase = true`  → Input Credit accounts
/// `is_purchase = false` → Payable (Output) accounts
pub fn resolve_gst_account_names(
    effective_rate: f64,
    is_inter_state: bool,
    is_purchase: bool,
) -> GstAccounts {
    let suffix = if is_purchase { "Input Credit" } else { "Payable" };

    if is_inter_state {
        let name = format!("IGST {}% {}", effective_rate as u32, suffix);
        return GstAccounts {
            cgst_account: None,
            sgst_account: None,
            igst_account: Some(name),
        };
    }

    let split_rate = effective_rate / 2.0;
    // Format as e.g. "2.5" or "9" — remove trailing zeros
    let rate_str = format_rate(split_rate);
    GstAccounts {
        cgst_account: Some(format!("CGST {}% {}", rate_str, suffix)),
        sgst_account: Some(format!("SGST {}% {}", rate_str, suffix)),
        igst_account: None,
    }
}

fn format_rate(rate: f64) -> String {
    if rate.fract() == 0.0 {
        format!("{}", rate as u32)
    } else {
        format!("{}", rate)
    }
}

/// Fetch the COA id for a given account name (`account_name` exact match).
pub async fn get_gst_account_id(
    pool: &SqlitePool,
    account_name: &str,
) -> Option<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT id FROM chart_of_accounts WHERE account_name = ? AND is_active = 1 LIMIT 1",
    )
    .bind(account_name)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
}

/// Retrieves the GST account ID by name, Auto-creating it if it doesn't exist.
pub async fn ensure_gst_account_exists(
    pool: &SqlitePool,
    account_name: &str,
    is_payable: bool,
) -> Result<String, String> {
    if let Some(id) = get_gst_account_id(pool, account_name).await {
        return Ok(id);
    }

    use uuid::Uuid;
    let id = Uuid::new_v4().to_string();
    let short_uuid = &id[0..6];
    let account_code = format!("GST-AUTO-{}", short_uuid).to_uppercase();
    
    // Usually, input credits are Asset under 'Tax Receivable', output tax is Liability under 'Duties & Taxes'.
    let account_type = if is_payable { "Liability" } else { "Asset" };
    let account_group = if is_payable { "Duties & Taxes" } else { "Tax Receivable" };
    let description = format!("Auto-created ledger for {}", account_name);

    sqlx::query(
        "INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, is_system)
         VALUES (?, ?, ?, ?, ?, ?, 1)",
    )
    .bind(&id)
    .bind(&account_code)
    .bind(account_name)
    .bind(account_type)
    .bind(account_group)
    .bind(description)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(id)
}

// ============= INTER-STATE DETECTION =============

/// Returns true if company_state and party_state are different (non-empty, non-null).
pub fn is_inter_state(company_state: Option<&str>, party_state: Option<&str>) -> bool {
    match (company_state, party_state) {
        (Some(c), Some(p)) if !c.is_empty() && !p.is_empty() => {
            c.to_lowercase() != p.to_lowercase()
        }
        _ => false,
    }
}

// ============= STATE CODE HELPER =============

/// Extract the 2-digit GST state code from a GSTIN string (first two characters).
/// Returns empty string if GSTIN is absent or too short.
pub fn state_code_from_gstin(gstin: Option<&str>) -> String {
    gstin
        .and_then(|g| if g.len() >= 2 { Some(&g[..2]) } else { None })
        .unwrap_or("")
        .to_string()
}

// ============= QR CODE GENERATION =============

/// Generate a base64-encoded PNG QR code from an IRN string.
/// Returns `None` if encoding fails (non-critical — template hides the QR section gracefully).
pub fn irn_to_qr_base64(irn: &str) -> Option<String> {
    use qrcode::QrCode;
    use image::{Luma, ImageBuffer};

    let code = QrCode::new(irn.as_bytes()).ok()?;
    let image: ImageBuffer<Luma<u8>, Vec<u8>> = code.render::<Luma<u8>>().build();

    let mut png_bytes: Vec<u8> = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png_bytes);
    image
        .write_to(&mut cursor, image::ImageFormat::Png)
        .ok()?;

    use base64::Engine as _;
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&png_bytes)
    ))
}

// ============= TAURI COMMAND — fetch slab by id =============

/// Fetch a single GstTaxSlab by id (used by the invoice engine internally).
pub async fn get_slab(pool: &SqlitePool, slab_id: &str) -> Option<GstTaxSlab> {
    sqlx::query_as::<_, GstTaxSlab>(
        "SELECT id, name, is_dynamic, fixed_rate, threshold, below_rate, above_rate, is_active
         FROM gst_tax_slabs WHERE id = ?",
    )
    .bind(slab_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
}
