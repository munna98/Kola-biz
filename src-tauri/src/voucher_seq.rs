use sqlx::{Sqlite, SqlitePool, Transaction};

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

pub async fn get_next_voucher_number_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    voucher_type: &str,
) -> Result<String, String> {
    let seq = sqlx::query_as::<_, VoucherSeqRow>(
        "SELECT prefix, COALESCE(suffix, '') as suffix, COALESCE(separator, '-') as separator,
                next_number, padding, COALESCE(include_financial_year, 0) as include_financial_year
         FROM voucher_sequences WHERE voucher_type = ?",
    )
    .bind(voucher_type)
    .fetch_one(&mut **tx)
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
    let voucher_no = if seq.suffix.is_empty() {
        base
    } else {
        format!("{}{}{}", base, sep, seq.suffix)
    };

    sqlx::query("UPDATE voucher_sequences SET next_number = next_number + 1 WHERE voucher_type = ?")
        .bind(voucher_type)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

    Ok(voucher_no)
}

pub struct ParsedVoucherNo {
    pub prefix: String,
    pub separator: String,
    pub padding: i64,
    pub num: i64,
    pub include_financial_year: bool,
}

/// Parses custom voucher number into prefix, separator, padding, counter, and FY flag.
/// e.g. "A-01" -> prefix: "A", sep: "-", padding: 2, num: 1
/// e.g. "SI-24-25-0042" -> prefix: "SI", sep: "-", padding: 4, num: 42, include_fy: true
pub fn parse_custom_voucher_no(s: &str) -> Option<ParsedVoucherNo> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return None;
    }

    let end_idx = trimmed.rfind(|c: char| !c.is_ascii_digit());
    let (prefix_part, digit_part) = match end_idx {
        Some(idx) => (&trimmed[..=idx], &trimmed[idx + 1..]),
        None => ("", trimmed),
    };

    if digit_part.is_empty() {
        return None;
    }

    let num = digit_part.parse::<i64>().ok()?;
    let padding = (digit_part.len() as i64).max(2);

    let sep_char = prefix_part.chars().rev().find(|c| !c.is_alphanumeric());

    let (mut raw_prefix, separator) = match sep_char {
        Some(sep) => {
            let sep_str = sep.to_string();
            let p = prefix_part.trim_end_matches(sep).to_string();
            (p, sep_str)
        }
        None => (prefix_part.to_string(), "-".to_string()),
    };

    let fy_str = current_financial_year();
    let include_financial_year = if !fy_str.is_empty() && raw_prefix.ends_with(&fy_str) {
        raw_prefix = raw_prefix
            .trim_end_matches(&fy_str)
            .trim_end_matches(|c: char| !c.is_alphanumeric())
            .to_string();
        true
    } else {
        false
    };

    Some(ParsedVoucherNo {
        prefix: raw_prefix,
        separator,
        padding,
        num,
        include_financial_year,
    })
}

pub fn extract_numeric_suffix(s: &str) -> Option<i64> {
    parse_custom_voucher_no(s).map(|p| p.num)
}

/// If a custom voucher number is provided, update prefix, separator, padding, FY flag, and next_number
/// in voucher_sequences so that subsequent manual entries follow the imported pattern & sequence.
pub async fn sync_voucher_sequence_if_higher_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    voucher_type: &str,
    voucher_no: &str,
) -> Result<(), String> {
    if let Some(parsed) = parse_custom_voucher_no(voucher_no) {
        sqlx::query(
            "UPDATE voucher_sequences 
             SET prefix = ?,
                 separator = ?,
                 padding = MAX(padding, ?),
                 include_financial_year = ?,
                 next_number = MAX(next_number, ? + 1)
             WHERE voucher_type = ?",
        )
        .bind(&parsed.prefix)
        .bind(&parsed.separator)
        .bind(parsed.padding)
        .bind(parsed.include_financial_year)
        .bind(parsed.num)
        .bind(voucher_type)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
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

/// Helper to derive the financial year from a "YYYY-MM-DD" date string.
fn financial_year_from_date(date_str: &str) -> String {
    let year: i32 = date_str.get(..4).and_then(|s| s.parse().ok()).unwrap_or(2024);
    let month: u32 = date_str.get(5..7).and_then(|s| s.parse().ok()).unwrap_or(1);
    if month >= 4 {
        format!("{}-{}", year % 100, (year + 1) % 100)
    } else {
        format!("{}-{}", (year - 1) % 100, year % 100)
    }
}

/// Handles the sequence check and unique constraint free for a voucher being deleted.
/// If the voucher's number matches the last generated one, decrements the sequence.
/// Also checks backwards to roll back any previously deleted consecutive vouchers.
/// In all cases, renames the voucher_no to __DELETED_{voucher_no}__ to release the UNIQUE constraint.
pub async fn handle_voucher_deletion_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    voucher_id: &str,
) -> Result<(), String> {
    // 1. Fetch voucher_no, voucher_type, and voucher_date from vouchers
    let voucher: Option<(String, String, String)> = sqlx::query_as(
        "SELECT voucher_no, voucher_type, voucher_date FROM vouchers WHERE id = ?"
    )
    .bind(voucher_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| format!("Failed to fetch voucher for deletion logic: {}", e))?;

    if let Some((voucher_no, voucher_type, voucher_date)) = voucher {
        // 2. Fetch sequence settings for this voucher type
        let seq_opt = sqlx::query_as::<_, VoucherSeqRow>(
            "SELECT prefix, COALESCE(suffix, '') as suffix, COALESCE(separator, '-') as separator,
                    next_number, padding, COALESCE(include_financial_year, 0) as include_financial_year
             FROM voucher_sequences WHERE voucher_type = ?",
        )
        .bind(&voucher_type)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|e| format!("Failed to fetch voucher sequence settings: {}", e))?;

        if let Some(seq) = seq_opt {
            // 3. Rename the current deleted voucher first to free its constraint.
            // Include the voucher ID to guarantee uniqueness — the same voucher_no
            // (e.g. PI100) may be deleted more than once (delete → recreate → delete again),
            // so a plain "__DELETED__PI100__" would collide on the second deletion.
            let temp_no = format!("__DELETED__{}__{}__", voucher_no, voucher_id);
            sqlx::query("UPDATE vouchers SET voucher_no = ? WHERE id = ?")
                .bind(&temp_no)
                .bind(voucher_id)
                .execute(&mut **tx)
                .await
                .map_err(|e| format!("Failed to rename deleted voucher number: {}", e))?;

            // 4. Check and decrement sequentially
            let mut current_next = seq.next_number;
            while current_next > 1 {
                let last_val = current_next - 1;
                let number = format!("{:0>width$}", last_val, width = seq.padding as usize);
                let sep = &seq.separator;

                let mut parts: Vec<String> = Vec::new();
                if !seq.prefix.is_empty() {
                    parts.push(seq.prefix.clone());
                }
                if seq.include_financial_year {
                    parts.push(financial_year_from_date(&voucher_date));
                }
                parts.push(number);

                let base = parts.join(sep);
                let expected_last_no = if seq.suffix.is_empty() {
                    base
                } else {
                    format!("{}{}{}", base, sep, seq.suffix)
                };

                // Check if either the active or deleted voucher exists under this expected number
                let deleted_exists: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM vouchers WHERE voucher_no = ?)"
                )
                .bind(format!("__DELETED__{}__", expected_last_no))
                .fetch_one(&mut **tx)
                .await
                .unwrap_or(false);

                let active_exists: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM vouchers WHERE voucher_no = ?)"
                )
                .bind(&expected_last_no)
                .fetch_one(&mut **tx)
                .await
                .unwrap_or(false);

                if deleted_exists {
                    current_next -= 1;
                } else if active_exists {
                    // Stopped by an active voucher, cannot decrement further
                    break;
                } else {
                    // Neither active nor deleted exists (below starting range), stop.
                    break;
                }
            }

            if current_next != seq.next_number {
                sqlx::query(
                    "UPDATE voucher_sequences SET next_number = ? WHERE voucher_type = ?"
                )
                .bind(current_next)
                .bind(&voucher_type)
                .execute(&mut **tx)
                .await
                .map_err(|e| format!("Failed to update voucher sequence next_number: {}", e))?;
            }
        }
    }

    Ok(())
}
