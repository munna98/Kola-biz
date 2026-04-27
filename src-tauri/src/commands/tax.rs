/// GST Slab Management Commands
///
/// Tauri commands for reading and managing GST tax slabs (categories).
/// CRUD + GSTR summary queries.

use crate::commands::tax_utils::GstTaxSlab;
use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::company_db::DbRegistry;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ============= CRUD COMMANDS =============

#[tauri::command]
pub async fn get_gst_tax_slabs(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<GstTaxSlab>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, GstTaxSlab>(
        "SELECT id, name, is_dynamic, fixed_rate, threshold, below_rate, above_rate, is_active
         FROM gst_tax_slabs
         WHERE is_active = 1
         ORDER BY is_dynamic ASC, fixed_rate ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct CreateGstSlabInput {
    pub name: String,
    pub is_dynamic: bool,
    pub fixed_rate: Option<f64>,
    pub threshold: Option<f64>,
    pub below_rate: Option<f64>,
    pub above_rate: Option<f64>,
}

#[tauri::command]
pub async fn create_gst_tax_slab(
    registry: State<'_, Arc<DbRegistry>>,
    input: CreateGstSlabInput,
) -> Result<GstTaxSlab, String> {
    let pool = registry.active_pool().await?;
    let id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO gst_tax_slabs (id, name, is_dynamic, fixed_rate, threshold, below_rate, above_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.name)
    .bind(if input.is_dynamic { 1i64 } else { 0i64 })
    .bind(input.fixed_rate.unwrap_or(0.0))
    .bind(input.threshold.unwrap_or(0.0))
    .bind(input.below_rate.unwrap_or(0.0))
    .bind(input.above_rate.unwrap_or(0.0))
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, GstTaxSlab>(
        "SELECT id, name, is_dynamic, fixed_rate, threshold, below_rate, above_rate, is_active
         FROM gst_tax_slabs WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct UpdateGstSlabInput {
    pub id: String,
    pub name: String,
    pub is_dynamic: bool,
    pub fixed_rate: Option<f64>,
    pub threshold: Option<f64>,
    pub below_rate: Option<f64>,
    pub above_rate: Option<f64>,
}

#[tauri::command]
pub async fn update_gst_tax_slab(
    registry: State<'_, Arc<DbRegistry>>,
    input: UpdateGstSlabInput,
) -> Result<GstTaxSlab, String> {
    let pool = registry.active_pool().await?;
    sqlx::query(
        "UPDATE gst_tax_slabs
         SET name = ?, is_dynamic = ?, fixed_rate = ?, threshold = ?, below_rate = ?, above_rate = ?
         WHERE id = ?",
    )
    .bind(&input.name)
    .bind(if input.is_dynamic { 1i64 } else { 0i64 })
    .bind(input.fixed_rate.unwrap_or(0.0))
    .bind(input.threshold.unwrap_or(0.0))
    .bind(input.below_rate.unwrap_or(0.0))
    .bind(input.above_rate.unwrap_or(0.0))
    .bind(&input.id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, GstTaxSlab>(
        "SELECT id, name, is_dynamic, fixed_rate, threshold, below_rate, above_rate, is_active
         FROM gst_tax_slabs WHERE id = ?",
    )
    .bind(&input.id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_gst_tax_slab(
    registry: State<'_, Arc<DbRegistry>>,
    slab_id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Prevent deletion if this slab is used by any product
    let usage: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM products WHERE gst_slab_id = ?",
    )
    .bind(&slab_id)
    .fetch_one(&pool)
    .await
    .unwrap_or(0);

    if usage > 0 {
        return Err(format!(
            "Cannot delete: {} product(s) are using this GST slab. Remove them first.",
            usage
        ));
    }

    // Soft-delete (deactivate)
    sqlx::query("UPDATE gst_tax_slabs SET is_active = 0 WHERE id = ?")
        .bind(&slab_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============= GST SETTINGS =============

#[derive(Debug, Serialize, Deserialize)]
pub struct GstSettings {
    pub gst_enabled: bool,
    pub gst_registration_type: String, // "Regular" | "Composition" | "Unregistered"
    pub composition_rate: f64,
}

#[tauri::command]
pub async fn get_gst_settings(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<GstSettings, String> {
    let pool = registry.active_pool().await?;
    let read = |key: &'static str| {
        let pool = pool.clone();
        async move {
            sqlx::query_scalar::<_, String>(
                "SELECT setting_value FROM app_settings WHERE setting_key = ?",
            )
            .bind(key)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten()
        }
    };

    let gst_enabled = read("gst_enabled").await
        .map(|v| v == "true")
        .unwrap_or(false);
    let gst_registration_type = read("gst_registration_type").await
        .unwrap_or_else(|| "Regular".to_string());
    let composition_rate = read("composition_rate").await
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(1.0);

    Ok(GstSettings {
        gst_enabled,
        gst_registration_type,
        composition_rate,
    })
}

#[tauri::command]
pub async fn save_gst_settings(
    registry: State<'_, Arc<DbRegistry>>,
    settings: GstSettings,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    let pairs: Vec<(&str, String)> = vec![
        ("gst_enabled",            settings.gst_enabled.to_string()),
        ("gst_registration_type",  settings.gst_registration_type.clone()),
        ("composition_rate",       settings.composition_rate.to_string()),
    ];

    for (key, value) in pairs {
        sqlx::query(
            "INSERT INTO app_settings (id, setting_key, setting_value)
             VALUES (?, ?, ?)
             ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value,
                                                     updated_at = CURRENT_TIMESTAMP",
        )
        .bind(Uuid::now_v7().to_string())
        .bind(key)
        .bind(value)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ============= GSTR SUMMARY QUERIES =============

/// GSTR-1: Outward supply summary grouped by HSN/SAC + description + unit + resolved GST rate.
#[tauri::command]
pub async fn get_gstr1_summary(
    registry: State<'_, Arc<DbRegistry>>,
    from_date: String,
    to_date: String,
) -> Result<serde_json::Value, String> {
    let pool = registry.active_pool().await?;
    // Each tuple: (description, hsn, uqc, gst_rate, taxable, cgst, sgst, igst, tax, total)
    let rows: Vec<(String, String, String, f64, f64, f64, f64, f64, f64, f64)> = sqlx::query_as(
        "SELECT
            COALESCE(p.name, vi.description, 'N/A')                            AS description,
            COALESCE(vi.hsn_sac_code, 'N/A')                                   AS hsn_sac_code,
            COALESCE(u.symbol, 'NOS')                                          AS uqc,
            COALESCE(vi.resolved_gst_rate, 0)                                  AS gst_rate,
            COALESCE(SUM(vi.amount), 0)                                        AS taxable_value,
            COALESCE(SUM(vi.cgst_amount), 0)                                   AS cgst,
            COALESCE(SUM(vi.sgst_amount), 0)                                   AS sgst,
            COALESCE(SUM(vi.igst_amount), 0)                                   AS igst,
            COALESCE(SUM(vi.cgst_amount + vi.sgst_amount + vi.igst_amount), 0) AS total_tax,
            COALESCE(SUM(vi.amount + vi.cgst_amount + vi.sgst_amount + vi.igst_amount), 0) AS total_value
         FROM voucher_items vi
         JOIN vouchers v ON vi.voucher_id = v.id
         LEFT JOIN products p ON vi.product_id = p.id
         LEFT JOIN units u ON vi.unit_id = u.id
         WHERE v.voucher_type = 'sales_invoice'
           AND v.voucher_date BETWEEN ? AND ?
           AND v.deleted_at IS NULL
         GROUP BY p.name, vi.description, vi.hsn_sac_code, u.symbol, vi.resolved_gst_rate
         ORDER BY vi.hsn_sac_code, p.name",
    )
    .bind(&from_date)
    .bind(&to_date)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let items: Vec<serde_json::Value> = rows
        .into_iter()
        .enumerate()
        .map(|(i, (desc, hsn, uqc, rate, taxable, cgst, sgst, igst, tax, total))| {
            json!({
                "sl": i + 1,
                "description": desc,
                "hsn_sac_code": hsn,
                "uqc": uqc,
                "gst_rate": rate,
                "taxable_value": taxable,
                "cgst": cgst,
                "sgst": sgst,
                "igst": igst,
                "total_tax": tax,
                "total_value": total,
            })
        })
        .collect();

    Ok(serde_json::Value::Array(items))
}

/// GSTR-3B: Net output liability vs input credit for the period.
#[tauri::command]
pub async fn get_gstr3b_summary(
    registry: State<'_, Arc<DbRegistry>>,
    from_date: String,
    to_date: String,
) -> Result<serde_json::Value, String> {
    let pool = registry.active_pool().await?;
    // Outward supplies (sales)
    let out: (f64, f64, f64, f64) = sqlx::query_as(
        "SELECT
            COALESCE(SUM(vi.amount), 0),
            COALESCE(SUM(vi.cgst_amount), 0),
            COALESCE(SUM(vi.sgst_amount), 0),
            COALESCE(SUM(vi.igst_amount), 0)
         FROM voucher_items vi
         JOIN vouchers v ON vi.voucher_id = v.id
         WHERE v.voucher_type = 'sales_invoice'
           AND v.voucher_date BETWEEN ? AND ?
           AND v.deleted_at IS NULL",
    )
    .bind(&from_date)
    .bind(&to_date)
    .fetch_one(&pool)
    .await
    .unwrap_or((0.0, 0.0, 0.0, 0.0));

    // Inward supplies (purchases)
    let inp: (f64, f64, f64, f64) = sqlx::query_as(
        "SELECT
            COALESCE(SUM(vi.amount), 0),
            COALESCE(SUM(vi.cgst_amount), 0),
            COALESCE(SUM(vi.sgst_amount), 0),
            COALESCE(SUM(vi.igst_amount), 0)
         FROM voucher_items vi
         JOIN vouchers v ON vi.voucher_id = v.id
         WHERE v.voucher_type = 'purchase_invoice'
           AND v.voucher_date BETWEEN ? AND ?
           AND v.deleted_at IS NULL",
    )
    .bind(&from_date)
    .bind(&to_date)
    .fetch_one(&pool)
    .await
    .unwrap_or((0.0, 0.0, 0.0, 0.0));

    Ok(json!({
        "outward_taxable":  out.0,
        "outward_cgst":     out.1,
        "outward_sgst":     out.2,
        "outward_igst":     out.3,
        "inward_taxable":   inp.0,
        "inward_cgst":      inp.1,
        "inward_sgst":      inp.2,
        "inward_igst":      inp.3,
        "net_cgst":         out.1 - inp.1,
        "net_sgst":         out.2 - inp.2,
        "net_igst":         out.3 - inp.3,
    }))
}
