use sqlx::{Sqlite, Transaction};

pub struct VoucherLineUnitData {
    pub unit_id: String,
    pub base_quantity: f64,
}

pub async fn resolve_voucher_line_unit(
    tx: &mut Transaction<'_, Sqlite>,
    product_id: &str,
    selected_unit_id: Option<&str>,
    default_kind: &str,
    quantity: f64,
) -> Result<VoucherLineUnitData, String> {
    let default_column = match default_kind {
        "sale" => "is_default_sale",
        "purchase" => "is_default_purchase",
        "report" => "is_default_report",
        _ => "is_default_purchase",
    };

    let selected = if let Some(unit_id) = selected_unit_id {
        sqlx::query_as::<_, (String, f64)>(
            "SELECT unit_id, factor_to_base
             FROM product_unit_conversions
             WHERE product_id = ? AND unit_id = ?",
        )
        .bind(product_id)
        .bind(unit_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| e.to_string())?
    } else {
        None
    };

    let (unit_id, factor_to_base) = if let Some(value) = selected {
        value
    } else {
        let fallback_query = format!(
            "SELECT unit_id, factor_to_base
             FROM product_unit_conversions
             WHERE product_id = ? AND {default_column} = 1
             LIMIT 1"
        );

        if let Some(value) = sqlx::query_as::<_, (String, f64)>(&fallback_query)
            .bind(product_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| e.to_string())?
        {
            value
        } else {
            sqlx::query_as::<_, (String, f64)>(
                "SELECT puc.unit_id, puc.factor_to_base
                 FROM product_unit_conversions puc
                 JOIN products p ON p.unit_id = puc.unit_id AND p.id = puc.product_id
                 WHERE puc.product_id = ?
                 LIMIT 1",
            )
            .bind(product_id)
            .fetch_one(&mut **tx)
            .await
            .map_err(|e| e.to_string())?
        }
    };

    Ok(VoucherLineUnitData {
        unit_id,
        base_quantity: quantity * factor_to_base,
    })
}
