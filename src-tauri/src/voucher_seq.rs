use sqlx::SqlitePool;

/// A single row from the voucher_sequences table
#[derive(Debug, sqlx::FromRow)]
struct VoucherSeqRow {
    prefix: String,
    suffix: String,
    separator: String,
    next_number: i64,
    padding: i64,
    include_financial_year: bool,
}

/// Row returned to the frontend for the settings UI
#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct VoucherSequenceInfo {
    pub voucher_type: String,
    pub prefix: String,
    pub suffix: String,
    pub separator: String,
    pub next_number: i64,
    pub padding: i64,
    pub include_financial_year: bool,
    pub reset_yearly: bool,
}

/// Build the financial-year string based on current date.
/// Indian financial year: April–March.
/// e.g. if today is March 2025 → "24-25"; if May 2025 → "25-26"
pub fn current_financial_year() -> String {
    use chrono::{Datelike, Utc, FixedOffset};
    let now = Utc::now().with_timezone(&FixedOffset::east_opt(5 * 3600 + 1800).unwrap());
    let year = now.year();
    let month = now.month();
    if month >= 4 {
        format!("{}-{}", year % 100, (year + 1) % 100)
    } else {
        format!("{}-{}", (year - 1) % 100, year % 100)
    }
}

/// Atomically fetches and increments the voucher number for the given type.
/// Builds the formatted number from prefix, optional FY, padded counter, and optional suffix.
/// All separated by the configured separator (default "-").
///
/// Example outputs:
///   SI-0001            (prefix=SI, no FY, no suffix)
///   SI-24-25-0001      (prefix=SI, FY enabled, separator=-)
///   INV/25-26/0001/KBZ (prefix=INV, FY, suffix=KBZ, separator=/)
pub async fn get_next_voucher_number(
    pool: &SqlitePool,
    voucher_type: &str,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let seq = sqlx::query_as::<_, VoucherSeqRow>(
        "SELECT prefix, COALESCE(suffix, '') as suffix, COALESCE(separator, '-') as separator,
                next_number, padding, COALESCE(include_financial_year, 0) as include_financial_year
         FROM voucher_sequences WHERE voucher_type = ?",
    )
    .bind(voucher_type)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| format!("No voucher sequence found for type '{}': {}", voucher_type, e))?;

    // Build the padded number part
    let number = format!("{:0>width$}", seq.next_number, width = seq.padding as usize);
    let sep = &seq.separator;

    // Assemble parts
    let mut parts: Vec<String> = Vec::new();
    if !seq.prefix.is_empty() {
        parts.push(seq.prefix.clone());
    }
    if seq.include_financial_year {
        parts.push(current_financial_year());
    }
    parts.push(number);

    let base = parts.join(sep);

    let voucher_no = if seq.suffix.is_empty() {
        base
    } else {
        format!("{}{}{}", base, sep, seq.suffix)
    };

    // Increment the sequence
    sqlx::query(
        "UPDATE voucher_sequences SET next_number = next_number + 1 WHERE voucher_type = ?",
    )
    .bind(voucher_type)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_no)
}

/// Preview what the next voucher number would look like WITHOUT incrementing the counter.
pub async fn preview_voucher_number_for(
    pool: &SqlitePool,
    voucher_type: &str,
) -> Result<String, String> {
    let seq = sqlx::query_as::<_, VoucherSeqRow>(
        "SELECT prefix, COALESCE(suffix, '') as suffix, COALESCE(separator, '-') as separator,
                next_number, padding, COALESCE(include_financial_year, 0) as include_financial_year
         FROM voucher_sequences WHERE voucher_type = ?",
    )
    .bind(voucher_type)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("No voucher sequence found for type '{}': {}", voucher_type, e))?;

    let number = format!("{:0>width$}", seq.next_number, width = seq.padding as usize);
    let sep = &seq.separator;

    let mut parts: Vec<String> = Vec::new();
    if !seq.prefix.is_empty() {
        parts.push(seq.prefix.clone());
    }
    if seq.include_financial_year {
        parts.push(current_financial_year());
    }
    parts.push(number);

    let base = parts.join(sep);
    Ok(if seq.suffix.is_empty() {
        base
    } else {
        format!("{}{}{}", base, sep, seq.suffix)
    })
}
