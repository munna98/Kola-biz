use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

// ============= TRIAL BALANCE =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct TrialBalanceRow {
    pub account_code: String,
    pub account_name: String,
    pub debit: f64,
    pub credit: f64,
}

#[tauri::command]
pub async fn get_trial_balance(
    pool: State<'_, SqlitePool>,
    from_date: Option<String>,
    to_date: String,
) -> Result<Vec<TrialBalanceRow>, String> {
    let date_filter = if let Some(from) = from_date {
        format!(
            "AND v.voucher_date >= '{}' AND v.voucher_date <= '{}'",
            from, to_date
        )
    } else {
        format!("AND v.voucher_date <= '{}'", to_date)
    };

    let query = format!(
        "SELECT 
            coa.account_code,
            coa.account_name,
            COALESCE(SUM(je.debit), 0) as debit,
            COALESCE(SUM(je.credit), 0) as credit
        FROM chart_of_accounts coa
        LEFT JOIN journal_entries je ON coa.id = je.account_id
        LEFT JOIN vouchers v ON je.voucher_id = v.id
        WHERE coa.is_active = 1 AND v.deleted_at IS NULL {}
        GROUP BY coa.id, coa.account_code, coa.account_name
        HAVING debit > 0 OR credit > 0
        ORDER BY coa.account_code ASC",
        date_filter
    );

    sqlx::query_as::<_, TrialBalanceRow>(&query)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

// ============= LEDGER REPORT =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct LedgerEntry {
    pub date: String,
    pub voucher_no: String,
    pub voucher_type: String,
    pub narration: String,
    pub debit: f64,
    pub credit: f64,
    pub balance: f64,
}

#[derive(Serialize, Deserialize)]
pub struct LedgerReport {
    pub entries: Vec<LedgerEntry>,
    pub opening_balance: f64,
    pub closing_balance: f64,
}

#[tauri::command]
pub async fn get_ledger_report(
    pool: State<'_, SqlitePool>,
    account_id: i64,
    from_date: Option<String>,
    to_date: String,
) -> Result<LedgerReport, String> {
    let account = sqlx::query_as::<_, (f64, String)>(
        "SELECT CAST(opening_balance AS REAL), opening_balance_type FROM chart_of_accounts WHERE id = ?"
    )
    .bind(account_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch account {}: {}", account_id, e))?;

    let opening_balance = if account.1 == "Dr" {
        account.0
    } else {
        -account.0
    };

    let mut running_balance = opening_balance;

    if let Some(ref from) = from_date {
        let balance_before: Option<(f64, f64)> = sqlx::query_as(
            "SELECT CAST(COALESCE(SUM(je.debit), 0) AS REAL), CAST(COALESCE(SUM(je.credit), 0) AS REAL)
             FROM journal_entries je
             JOIN vouchers v ON je.voucher_id = v.id
             WHERE je.account_id = ? AND v.voucher_date < ? AND v.deleted_at IS NULL",
        )
        .bind(account_id)
        .bind(from)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

        if let Some((dr, cr)) = balance_before {
            running_balance += dr - cr;
        }
    }

    let date_filter = if let Some(ref from) = from_date {
        format!(
            "AND v.voucher_date >= '{}' AND v.voucher_date <= '{}'",
            from, to_date
        )
    } else {
        format!("AND v.voucher_date <= '{}'", to_date)
    };

    let query = format!(
        "SELECT 
            v.voucher_date as date,
            v.voucher_no,
            v.voucher_type,
            je.narration,
            CAST(je.debit AS REAL) as debit,
            CAST(je.credit AS REAL) as credit,
            0.0 as balance
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        WHERE je.account_id = ? AND v.deleted_at IS NULL {}
        ORDER BY v.voucher_date ASC, v.id ASC",
        date_filter
    );

    let mut entries: Vec<LedgerEntry> = sqlx::query_as(&query)
        .bind(account_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    for entry in &mut entries {
        running_balance += entry.debit - entry.credit;
        entry.balance = running_balance;
    }

    let report_opening_balance = if from_date.is_some() {
        running_balance - entries.iter().map(|e| e.debit - e.credit).sum::<f64>()
    } else {
        opening_balance
    };

    Ok(LedgerReport {
        entries,
        opening_balance: report_opening_balance,
        closing_balance: running_balance,
    })
}
    