use sqlx::{Sqlite, SqlitePool, Transaction};

/// A single row from the voucher_sequences table
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct VoucherSeqRow {
    pub id: String,
    pub prefix: String,
    pub suffix: String,
    pub separator: String,
    pub next_number: i64,
    pub padding: i64,
    pub include_financial_year: bool,
    pub reset_yearly: bool,
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

/// Map a voucher_type to the table & column that enforces uniqueness for its number.
pub fn target_table_and_col(voucher_type: &str) -> (&'static str, &'static str) {
    match voucher_type {
        "custom_order" => ("custom_orders", "order_no"),
        "service_order" => ("service_orders", "order_no"),
        _ => ("vouchers", "voucher_no"),
    }
}

/// Format a voucher/order number without any terminal/device prefix.
pub fn format_voucher_no(
    prefix: &str,
    suffix: &str,
    separator: &str,
    padding: i64,
    include_financial_year: bool,
    number: i64,
    fy_override: Option<&str>,
) -> String {
    let width = padding.max(1) as usize;
    let num_str = format!("{:0>width$}", number, width = width);

    let mut parts: Vec<String> = Vec::new();
    if !prefix.is_empty() {
        parts.push(prefix.to_string());
    }
    if include_financial_year {
        let fy = fy_override
            .map(|s| s.to_string())
            .unwrap_or_else(current_financial_year);
        parts.push(fy);
    }
    parts.push(num_str);

    let base = parts.join(separator);
    if suffix.is_empty() {
        base
    } else {
        format!("{}{}{}", base, separator, suffix)
    }
}

async fn voucher_no_exists_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    voucher_type: &str,
    candidate: &str,
) -> bool {
    let (table, col) = target_table_and_col(voucher_type);
    let sql = format!("SELECT EXISTS(SELECT 1 FROM {} WHERE {} = ?)", table, col);
    sqlx::query_scalar(&sql)
        .bind(candidate)
        .fetch_one(&mut **tx)
        .await
        .unwrap_or(false)
}

/// Atomically fetches and increments the voucher number for the given type.
/// In cloud-online mode, allocates atomically from Turso first; if offline/unreachable,
/// issues a provisional `TMP-...` number locally that will be promoted on sync.
pub async fn get_next_voucher_number(
    pool: &SqlitePool,
    voucher_type: &str,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let voucher_no = get_next_voucher_number_in_tx(&mut tx, voucher_type).await?;
    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_no)
}

pub async fn get_next_voucher_number_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    voucher_type: &str,
) -> Result<String, String> {
    let seq = sqlx::query_as::<_, VoucherSeqRow>(
        "SELECT id, prefix, COALESCE(suffix, '') as suffix, COALESCE(separator, '-') as separator,
                next_number, padding, COALESCE(include_financial_year, 0) as include_financial_year,
                COALESCE(reset_yearly, 0) as reset_yearly
         FROM voucher_sequences WHERE voucher_type = ?",
    )
    .bind(voucher_type)
    .fetch_one(&mut **tx)
    .await
    .map_err(|e| format!("No voucher sequence found for type '{}': {}", voucher_type, e))?;

    // If active company is in Cloud Online mode, attempt atomic reservation on Turso first
    if let Some(cloud_cfg) = crate::cloud_sync::get_active_cloud_config() {
        let mut attempt = 0u32;
        loop {
            match crate::cloud_sync::reserve_next_cloud_number(
                &cloud_cfg.url,
                &cloud_cfg.token,
                &seq,
                voucher_type,
            )
            .await
            {
                Ok((allocated_num, cloud_voucher_no)) => {
                    // Guard against collision with an unpushed local voucher number
                    if voucher_no_exists_in_tx(tx, voucher_type, &cloud_voucher_no).await
                        && attempt < 100
                    {
                        attempt += 1;
                        continue;
                    }

                    // Keep local sequence counter at least as high as Turso's counter
                    sqlx::query(
                        "UPDATE voucher_sequences SET next_number = MAX(next_number, ?) WHERE voucher_type = ?",
                    )
                    .bind(allocated_num + 1)
                    .bind(voucher_type)
                    .execute(&mut **tx)
                    .await
                    .map_err(|e| e.to_string())?;

                    return Ok(cloud_voucher_no);
                }
                Err(e) => {
                    // Offline / Turso unreachable: issue provisional TMP- number locally
                    eprintln!(
                        "[VoucherSeq] Cloud sequence unavailable ({}), assigning provisional TMP- number for '{}'",
                        e, voucher_type
                    );
                    let mut curr_num = seq.next_number;
                    let tmp_no = loop {
                        let base = format_voucher_no(
                            &seq.prefix,
                            &seq.suffix,
                            &seq.separator,
                            seq.padding,
                            seq.include_financial_year,
                            curr_num,
                            None,
                        );
                        let candidate = format!("TMP-{}", base);
                        if !voucher_no_exists_in_tx(tx, voucher_type, &candidate).await {
                            break candidate;
                        }
                        curr_num += 1;
                    };

                    sqlx::query(
                        "UPDATE voucher_sequences SET next_number = ? WHERE voucher_type = ?",
                    )
                    .bind(curr_num + 1)
                    .bind(voucher_type)
                    .execute(&mut **tx)
                    .await
                    .map_err(|err| err.to_string())?;

                    return Ok(tmp_no);
                }
            }
        }
    }

    // Standard local-only (offline company) sequence allocation
    let mut curr_num = seq.next_number;
    let voucher_no = loop {
        let candidate = format_voucher_no(
            &seq.prefix,
            &seq.suffix,
            &seq.separator,
            seq.padding,
            seq.include_financial_year,
            curr_num,
            None,
        );

        if !voucher_no_exists_in_tx(tx, voucher_type, &candidate).await {
            break candidate;
        }
        curr_num += 1;
    };

    sqlx::query("UPDATE voucher_sequences SET next_number = ? WHERE voucher_type = ?")
        .bind(curr_num + 1)
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
    if voucher_no.trim_start().starts_with("TMP-") {
        return Ok(());
    }
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
/// In cloud-online mode, peeks at Turso's counter (falling back to `TMP-...` if offline).
pub async fn preview_voucher_number_for(
    pool: &SqlitePool,
    voucher_type: &str,
) -> Result<String, String> {
    let seq = sqlx::query_as::<_, VoucherSeqRow>(
        "SELECT id, prefix, COALESCE(suffix, '') as suffix, COALESCE(separator, '-') as separator,
                next_number, padding, COALESCE(include_financial_year, 0) as include_financial_year,
                COALESCE(reset_yearly, 0) as reset_yearly
         FROM voucher_sequences WHERE voucher_type = ?",
    )
    .bind(voucher_type)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("No voucher sequence found for type '{}': {}", voucher_type, e))?;

    let local_formatted = format_voucher_no(
        &seq.prefix,
        &seq.suffix,
        &seq.separator,
        seq.padding,
        seq.include_financial_year,
        seq.next_number,
        None,
    );

    if let Some(cloud_cfg) = crate::cloud_sync::get_active_cloud_config() {
        match crate::cloud_sync::peek_next_cloud_number(&cloud_cfg.url, &cloud_cfg.token, voucher_type).await {
            Ok(Some(cloud_formatted)) => return Ok(cloud_formatted),
            Ok(None) => return Ok(local_formatted),
            Err(_) => return Ok(format!("TMP-{}", local_formatted)),
        }
    }

    Ok(local_formatted)
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
            "SELECT id, prefix, COALESCE(suffix, '') as suffix, COALESCE(separator, '-') as separator,
                    next_number, padding, COALESCE(include_financial_year, 0) as include_financial_year,
                    COALESCE(reset_yearly, 0) as reset_yearly
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

            // In Cloud Online mode (or for provisional TMP- vouchers), never roll back the sequence
            // counter backwards because other terminals may already have claimed higher numbers.
            if voucher_no.starts_with("TMP-") || crate::cloud_sync::get_active_cloud_config().is_some() {
                return Ok(());
            }

            // 4. Check and decrement sequentially (offline local-only companies)
            let mut current_next = seq.next_number;
            let fy_str = financial_year_from_date(&voucher_date);
            while current_next > 1 {
                let last_val = current_next - 1;
                let expected_last_no = format_voucher_no(
                    &seq.prefix,
                    &seq.suffix,
                    &seq.separator,
                    seq.padding,
                    seq.include_financial_year,
                    last_val,
                    Some(&fy_str),
                );

                // Check if either the active or deleted voucher exists under this expected number.
                // Deleted vouchers are renamed to __DELETED__{voucher_no}__{voucher_id}__ so we
                // use LIKE to match any deleted variant of this voucher number.
                let deleted_exists: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM vouchers WHERE voucher_no LIKE ?)"
                )
                .bind(format!("__DELETED__{}___%", expected_last_no))
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

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        sqlx::query(
            "CREATE TABLE voucher_sequences (
                id TEXT PRIMARY KEY,
                voucher_type TEXT UNIQUE NOT NULL,
                prefix TEXT NOT NULL DEFAULT '',
                suffix TEXT NOT NULL DEFAULT '',
                separator TEXT NOT NULL DEFAULT '-',
                next_number INTEGER DEFAULT 1,
                padding INTEGER DEFAULT 4,
                include_financial_year INTEGER DEFAULT 0,
                reset_yearly INTEGER DEFAULT 0
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE vouchers (
                id TEXT PRIMARY KEY,
                voucher_no TEXT UNIQUE NOT NULL,
                voucher_type TEXT NOT NULL,
                voucher_date DATE NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO voucher_sequences (id, voucher_type, prefix, next_number, padding)
             VALUES ('seq-1', 'sales_invoice', 'SI', 105, 4)",
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    #[test]
    fn test_format_voucher_no_without_device_prefix() {
        assert_eq!(
            format_voucher_no("SI", "", "-", 4, false, 105, None),
            "SI-0105"
        );
        assert_eq!(
            format_voucher_no("INV", "KBZ", "/", 4, true, 7, Some("26-27")),
            "INV/26-27/0007/KBZ"
        );
        assert_eq!(
            format_voucher_no("", "", "-", 4, false, 12, None),
            "0012"
        );
    }

    #[tokio::test]
    async fn test_offline_and_provisional_tmp_numbering() {
        let pool = setup_test_pool().await;

        // 1. Offline local-only company mode: clean sequential numbering, no device prefix
        crate::cloud_sync::set_active_cloud_config(None);
        let p1 = preview_voucher_number_for(&pool, "sales_invoice").await.unwrap();
        assert_eq!(p1, "SI-0105");
        let n1 = get_next_voucher_number(&pool, "sales_invoice").await.unwrap();
        assert_eq!(n1, "SI-0105");

        // 2. Cloud Online mode when unreachable: issues TMP- provisional numbers
        crate::cloud_sync::set_active_cloud_config(Some(crate::cloud_sync::ActiveCloudConfig {
            company_id: "test-co".to_string(),
            url: "http://127.0.0.1:1".to_string(),
            token: "dummy-token".to_string(),
        }));

        let p_off = preview_voucher_number_for(&pool, "sales_invoice").await.unwrap();
        assert_eq!(p_off, "TMP-SI-0106");

        let tmp1 = get_next_voucher_number(&pool, "sales_invoice").await.unwrap();
        assert_eq!(tmp1, "TMP-SI-0106");

        let tmp2 = get_next_voucher_number(&pool, "sales_invoice").await.unwrap();
        assert_eq!(tmp2, "TMP-SI-0107");

        // 3. Provisional TMP- number must not overwrite voucher_sequences.prefix
        let mut tx = pool.begin().await.unwrap();
        sync_voucher_sequence_if_higher_in_tx(&mut tx, "sales_invoice", "TMP-SI-0999")
            .await
            .unwrap();
        tx.commit().await.unwrap();

        let prefix: String = sqlx::query_scalar(
            "SELECT prefix FROM voucher_sequences WHERE voucher_type = 'sales_invoice'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(prefix, "SI");

        crate::cloud_sync::set_active_cloud_config(None);
    }
}
