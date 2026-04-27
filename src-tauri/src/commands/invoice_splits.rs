use serde::{Deserialize, Serialize};
use crate::company_db::DbRegistry;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
pub struct PaymentLine {
    pub id: String,
    pub account_id: String, // UUID string matching chart_of_accounts.id
    pub amount: f64,
    pub method: String,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
struct JournalEntryRow {
    pub id: String,
    pub account_id: String, // UUID from DB
    pub debit: f64,
    pub credit: f64,
    pub account_group: String,
    pub account_name: String,
}

/// Gets the current cash/bank split for a Cash-party invoice directly from its journal entries
#[tauri::command]
pub async fn get_cash_invoice_splits(
    invoice_id: String,
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<PaymentLine>, String> {
    let pool = registry.active_pool().await?;
    // A sales invoice debits Cash/Bank.
    // A purchase invoice credits Cash/Bank.
    // We fetch any entries for this invoice that touch a Cash or Bank Account.
    let entries: Vec<JournalEntryRow> = sqlx::query_as(
        r#"
        SELECT 
            je.id,
            je.account_id,
            je.debit,
            je.credit,
            coa.account_group,
            coa.account_name
        FROM journal_entries je
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE je.voucher_id = ? AND (coa.account_group = 'Cash' OR coa.account_group = 'Bank Account')
        "#,
    )
    .bind(&invoice_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut splits = Vec::new();
    for entry in entries {
        // Amount is the absolute debit or credit
        let amount = if entry.debit > 0.0 { entry.debit } else { entry.credit };
        if amount > 0.0 {
            splits.push(PaymentLine {
                id: entry.id,
                account_id: entry.account_id, // pass UUID as-is
                amount,
                method: if entry.account_group == "Cash" {
                    "cash".to_string()
                } else {
                    "bank_transfer".to_string()
                },
            });
        }
    }

    Ok(splits)
}

/// Re-writes the cash/bank journal entries for an invoice to reflect a custom split
#[tauri::command]
pub async fn adjust_cash_invoice_splits(
    invoice_id: String,
    splits: Vec<PaymentLine>,
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Validate that the invoice actually exists
    let voucher_type: Option<String> = sqlx::query_scalar(
        "SELECT voucher_type FROM vouchers WHERE id = ?"
    )
    .bind(&invoice_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let _voucher_type = match voucher_type {
        Some(t) => t,
        None => return Err("Invoice not found".to_string()),
    };

    // Fetch the current invoice grand_total from the vouchers table
    let invoice_amount: f64 = sqlx::query_scalar(
        "SELECT CAST(COALESCE(grand_total, total_amount, 0) AS REAL) FROM vouchers WHERE id = ?"
    )
    .bind(&invoice_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Find existing Cash/Bank entries to determine debit/credit direction and narration
    let existing_entries: Vec<JournalEntryRow> = sqlx::query_as(
        r#"
        SELECT 
            je.id,
            je.account_id,
            je.debit,
            je.credit,
            coa.account_group,
            coa.account_name
        FROM journal_entries je
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE je.voucher_id = ? AND (coa.account_group = 'Cash' OR coa.account_group = 'Bank Account')
        "#,
    )
    .bind(&invoice_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if existing_entries.is_empty() {
        return Err("No existing Cash/Bank entries found for this invoice. Is this a cash party invoice?".to_string());
    }

    // Determine if we need to Credit (Purchase) or Debit (Sales) the cash accounts
    // We can infer this from the existing entries
    let is_debit = existing_entries[0].debit > 0.0;

    // Also grab the narration to keep it consistent (e.g. "Cash sale")
    let shared_narration: String = sqlx::query_scalar(
        "SELECT narration FROM journal_entries WHERE id = ?"
    )
    .bind(&existing_entries[0].id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let total_new: f64 = splits.iter().map(|s| s.amount).sum();

    // Validate that the split total matches the current invoice amount (not the old journal entries)
    if (invoice_amount - total_new).abs() > 0.01 {
        return Err(format!("Split total ({:.2}) must equal invoice amount ({:.2})", total_new, invoice_amount));
    }

    // Validate that all account_ids in the new splits actually exist in chart_of_accounts
    for split in &splits {
        if split.amount <= 0.0 { continue; }
        let exists: Option<String> = sqlx::query_scalar(
            "SELECT id FROM chart_of_accounts WHERE id = ? AND (account_group = 'Cash' OR account_group = 'Bank Account')"
        )
        .bind(&split.account_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if exists.is_none() {
            return Err(format!("Account '{}' is not a valid Cash or Bank account", split.account_id));
        }
    }

    // 1. Delete all existing Cash/Bank entries for this voucher
    let ids_to_delete: Vec<String> = existing_entries.into_iter().map(|e| e.id).collect();
    for id in ids_to_delete {
        sqlx::query("DELETE FROM journal_entries WHERE id = ?")
            .bind(&id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 2. Insert the new split entries
    for split in splits {
        if split.amount <= 0.0 { continue; }

        let je_id = Uuid::now_v7().to_string();
        let debit = if is_debit { split.amount } else { 0.0 };
        let credit = if !is_debit { split.amount } else { 0.0 };

        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(&je_id)
        .bind(&invoice_id)
        .bind(&split.account_id) // UUID string — correct FK
        .bind(debit)
        .bind(credit)
        .bind(&shared_narration)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
