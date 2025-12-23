use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

// ============= CHART OF ACCOUNTS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ChartOfAccount {
    pub id: i64,
    pub account_code: String,
    pub account_name: String,
    pub account_type: String,
    pub account_group: String,
    pub description: Option<String>,
    pub opening_balance: f64,
    pub opening_balance_type: String,
    pub is_active: i64,
    pub deleted_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct CreateChartOfAccount {
    pub account_code: String,
    pub account_name: String,
    pub account_type: String,
    pub account_group: String,
    pub description: Option<String>,
    pub opening_balance: Option<f64>,
    pub opening_balance_type: Option<String>,
}

async fn get_next_voucher_number(pool: &SqlitePool, voucher_type: &str) -> Result<String, String> {
    let prefix = match voucher_type {
        "purchase" => "PI",
        "sales" => "SI",
        "payment" => "PV",
        "receipt" => "RV",
        "journal" => "JV",
        "opening_balance" => "OB",
        _ => "V",
    };

    let last_number = sqlx::query_scalar::<_, Option<i64>>(
        "SELECT MAX(CAST(SUBSTR(voucher_no, ?1 + 1) AS INTEGER)) FROM vouchers WHERE voucher_type = ?2"
    )
    .bind(prefix.len() as i32)
    .bind(voucher_type)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten()
    .unwrap_or(0);

    Ok(format!("{}{:05}", prefix, last_number + 1))
}

#[tauri::command]
pub async fn get_chart_of_accounts(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ChartOfAccount>, String> {
    sqlx::query_as::<_, ChartOfAccount>(
        "SELECT id, account_code, account_name, account_type, account_group, description, CAST(opening_balance AS REAL) as opening_balance, opening_balance_type, is_active, deleted_at, created_at, updated_at FROM chart_of_accounts WHERE deleted_at IS NULL ORDER BY account_code ASC"
    )
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_chart_of_account(
    pool: State<'_, SqlitePool>,
    account: CreateChartOfAccount,
) -> Result<ChartOfAccount, String> {
    let opening_balance = account.opening_balance.unwrap_or(0.0);
    let opening_balance_type = account
        .opening_balance_type
        .unwrap_or_else(|| "Dr".to_string());

    let result = sqlx::query(
        "INSERT INTO chart_of_accounts (account_code, account_name, account_type, account_group, description, opening_balance, opening_balance_type) 
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&account.account_code)
    .bind(&account.account_name)
    .bind(&account.account_type)
    .bind(&account.account_group)
    .bind(&account.description)
    .bind(opening_balance)
    .bind(&opening_balance_type)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let id = result.last_insert_rowid();

    // If opening balance is provided, create voucher and journal entries
    if opening_balance > 0.0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        // Get next voucher number
        let voucher_no = get_next_voucher_number(&pool, "opening_balance").await?;

        // Create voucher entry
        let voucher_result = sqlx::query(
            "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, reference, narration, status)
             VALUES (?, ?, ?, ?, ?, 'posted')"
        )
        .bind(&voucher_no)
        .bind("opening_balance")
        .bind("2025-12-21")
        .bind(format!("Opening balance for {}", account.account_name))
        .bind(format!("Initial balance for account: {}", account.account_name))
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let voucher_id = voucher_result.last_insert_rowid();

        // Find Opening Balance Adjustment account (code 3004)
        let ob_account = sqlx::query_as::<_, (i64,)>(
            "SELECT id FROM chart_of_accounts WHERE account_code = '3004' LIMIT 1",
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Opening Balance Adjustment account not found".to_string())?;

        let ob_account_id = ob_account.0;

        // Create journal entry for the account
        if opening_balance_type == "Dr" {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
                 VALUES (?, ?, ?, ?, ?, 0)"
            )
            .bind(voucher_id)
            .bind(id)
            .bind(opening_balance)
            .bind(0.0)
            .bind(format!("Opening balance: {}", account.account_name))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            // Create balancing entry in Opening Balance Adjustment account
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
                 VALUES (?, ?, ?, ?, ?, 0)"
            )
            .bind(voucher_id)
            .bind(ob_account_id)
            .bind(0.0)
            .bind(opening_balance)
            .bind("Auto-generated balancing entry")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        } else {
            // Credit balance
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
                 VALUES (?, ?, ?, ?, ?, 0)"
            )
            .bind(voucher_id)
            .bind(id)
            .bind(0.0)
            .bind(opening_balance)
            .bind(format!("Opening balance: {}", account.account_name))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            // Create balancing entry in Opening Balance Adjustment account
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
                 VALUES (?, ?, ?, ?, ?, 0)"
            )
            .bind(voucher_id)
            .bind(ob_account_id)
            .bind(opening_balance)
            .bind(0.0)
            .bind("Auto-generated balancing entry")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }

        tx.commit().await.map_err(|e| e.to_string())?;
    }

    sqlx::query_as::<_, ChartOfAccount>("SELECT * FROM chart_of_accounts WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_chart_of_account(
    pool: State<'_, SqlitePool>,
    id: i64,
    account: CreateChartOfAccount,
) -> Result<(), String> {
    let new_opening_balance = account.opening_balance.unwrap_or(0.0);
    let opening_balance_type = account
        .opening_balance_type
        .unwrap_or_else(|| "Dr".to_string());

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get current opening balance to detect changes
    let current_account = sqlx::query_as::<_, ChartOfAccount>(
        "SELECT id, account_code, account_name, account_type, account_group, description, CAST(opening_balance AS REAL) as opening_balance, opening_balance_type, is_active, deleted_at, created_at, updated_at FROM chart_of_accounts WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Account not found".to_string())?;

    let balance_changed = (current_account.opening_balance - new_opening_balance).abs() > 0.001
        || current_account.opening_balance_type != opening_balance_type;

    // Update chart of accounts
    sqlx::query(
        "UPDATE chart_of_accounts 
         SET account_code = ?, account_name = ?, account_type = ?, account_group = ?, description = ?, opening_balance = ?, opening_balance_type = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?"
    )
    .bind(&account.account_code)
    .bind(&account.account_name)
    .bind(&account.account_type)
    .bind(&account.account_group)
    .bind(&account.description)
    .bind(new_opening_balance)
    .bind(&opening_balance_type)
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // If opening balance changed, update or create journal entries
    if balance_changed {
        // Find the opening balance voucher for this account (if exists)
        let opening_balance_voucher: Option<i64> = sqlx::query_scalar(
            "SELECT v.id FROM vouchers v 
             INNER JOIN journal_entries je ON v.id = je.voucher_id 
             WHERE v.voucher_type = 'opening_balance' AND je.account_id = ? 
             ORDER BY v.created_at DESC LIMIT 1"
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let voucher_id = if let Some(vid) = opening_balance_voucher {
            vid
        } else {
            // Create a new opening balance voucher if one doesn't exist
            let voucher_no = get_next_voucher_number(&pool, "opening_balance").await?;
            let result = sqlx::query(
                "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, reference, narration, status)
                 VALUES (?, ?, ?, ?, ?, 'posted')"
            )
            .bind(&voucher_no)
            .bind("opening_balance")
            .bind(chrono::Local::now().format("%Y-%m-%d").to_string())
            .bind(format!("Opening balance for {}", account.account_name))
            .bind(format!("Initial balance for account: {}", account.account_name))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            result.last_insert_rowid()
        };

        // Delete existing opening balance journal entries for this account (if any)
        sqlx::query(
            "DELETE FROM journal_entries WHERE voucher_id = ? AND account_id = ?"
        )
        .bind(voucher_id)
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Find Opening Balance Adjustment account
        let ob_account: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM chart_of_accounts WHERE account_code = '3004' LIMIT 1"
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        if let Some((ob_account_id,)) = ob_account {
            // Delete existing balancing entry (if any)
            sqlx::query(
                "DELETE FROM journal_entries WHERE voucher_id = ? AND account_id = ?"
            )
            .bind(voucher_id)
            .bind(ob_account_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            // Create new journal entry for the account if balance > 0
            if new_opening_balance > 0.0 {
                if opening_balance_type == "Dr" {
                    sqlx::query(
                        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
                         VALUES (?, ?, ?, ?, ?, 0)"
                    )
                    .bind(voucher_id)
                    .bind(id)
                    .bind(new_opening_balance)
                    .bind(0.0)
                    .bind(format!("Opening balance: {}", account.account_name))
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;

                    // Create balancing entry
                    sqlx::query(
                        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
                         VALUES (?, ?, ?, ?, ?, 0)"
                    )
                    .bind(voucher_id)
                    .bind(ob_account_id)
                    .bind(0.0)
                    .bind(new_opening_balance)
                    .bind("Auto-generated balancing entry")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                } else {
                    // Credit balance
                    sqlx::query(
                        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
                         VALUES (?, ?, ?, ?, ?, 0)"
                    )
                    .bind(voucher_id)
                    .bind(id)
                    .bind(0.0)
                    .bind(new_opening_balance)
                    .bind(format!("Opening balance: {}", account.account_name))
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;

                    // Create balancing entry
                    sqlx::query(
                        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
                         VALUES (?, ?, ?, ?, ?, 0)"
                    )
                    .bind(voucher_id)
                    .bind(ob_account_id)
                    .bind(new_opening_balance)
                    .bind(0.0)
                    .bind("Auto-generated balancing entry")
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
                }
            }
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_chart_of_account(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    // Get the account to check if it's a default account
    let account =
        sqlx::query_as::<_, ChartOfAccount>("SELECT * FROM chart_of_accounts WHERE id = ?")
            .bind(id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Account not found".to_string())?;

    // List of default account codes that cannot be deleted
    let default_codes = vec![
        "1001", "1002", "1003", "2001", "3001", "4001", "4002", "5001", "5002", "5003",
    ];

    if default_codes.contains(&account.account_code.as_str()) {
        return Err("Cannot delete default accounts".to_string());
    }

    // Check for references in journal_entries
    let journal_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM journal_entries WHERE account_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err("Cannot delete account as it has associated journal entries.".to_string());
    }

    // Check for references in opening_balances
    let ob_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM opening_balances WHERE account_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if ob_count > 0 {
        return Err("Cannot delete account as it has opening balance records.".to_string());
    }

    // Check if account is linked to a customer (code pattern: 1003-{customer_id})
    if account.account_code.starts_with("1003-") {
        let customer_id_str = account.account_code.strip_prefix("1003-").unwrap_or("");
        if let Ok(customer_id) = customer_id_str.parse::<i64>() {
            let customer_exists = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM customers WHERE id = ? AND is_active = 1",
            )
            .bind(customer_id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

            if customer_exists > 0 {
                return Err("Cannot delete account linked to an active customer. Delete the customer first.".to_string());
            }
        }
    }

    // Check if account is linked to a supplier (code pattern: 2001-{supplier_id})
    if account.account_code.starts_with("2001-") {
        let supplier_id_str = account.account_code.strip_prefix("2001-").unwrap_or("");
        if let Ok(supplier_id) = supplier_id_str.parse::<i64>() {
            let supplier_exists = sqlx::query_scalar::<_, i64>(
                "SELECT COUNT(*) FROM suppliers WHERE id = ? AND is_active = 1",
            )
            .bind(supplier_id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

            if supplier_exists > 0 {
                return Err("Cannot delete account linked to an active supplier. Delete the supplier first.".to_string());
            }
        }
    }

    sqlx::query(
        "UPDATE chart_of_accounts SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_deleted_chart_of_accounts(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ChartOfAccount>, String> {
    sqlx::query_as::<_, ChartOfAccount>(
        "SELECT * FROM chart_of_accounts WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_chart_of_account(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE chart_of_accounts SET is_active = 1, deleted_at = NULL WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_chart_of_account(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<(), String> {
    // Reference checks (same as soft delete)
    let account =
        sqlx::query_as::<_, ChartOfAccount>("SELECT * FROM chart_of_accounts WHERE id = ?")
            .bind(id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Account not found".to_string())?;

    let default_codes = vec![
        "1001", "1002", "1003", "2001", "3001", "4001", "4002", "5001", "5002", "5003",
    ];

    if default_codes.contains(&account.account_code.as_str()) {
        return Err("Cannot permanently delete default accounts".to_string());
    }

    let journal_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM journal_entries WHERE account_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err(
            "Cannot permanently delete account as it has associated journal entries.".to_string(),
        );
    }

    let ob_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM opening_balances WHERE account_id = ?")
            .bind(id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if ob_count > 0 {
        return Err(
            "Cannot permanently delete account as it has opening balance records.".to_string(),
        );
    }

    sqlx::query("DELETE FROM chart_of_accounts WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_account_types() -> Result<Vec<String>, String> {
    Ok(vec![
        "Asset".to_string(),
        "Liability".to_string(),
        "Equity".to_string(),
        "Income".to_string(),
        "Expense".to_string(),
    ])
}

#[tauri::command]
pub async fn get_account_groups(pool: State<'_, SqlitePool>) -> Result<Vec<String>, String> {
    let groups = sqlx::query_scalar::<_, String>(
        "SELECT name FROM account_groups WHERE is_active = 1 ORDER BY account_type, name ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(groups)
}

// ============= ACCOUNT GROUPS MANAGEMENT =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct AccountGroup {
    pub id: i64,
    pub name: String,
    pub account_type: String,
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateAccountGroup {
    pub name: String,
    pub account_type: String,
}

#[tauri::command]
pub async fn get_all_account_groups(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<AccountGroup>, String> {
    sqlx::query_as::<_, AccountGroup>(
        "SELECT * FROM account_groups WHERE is_active = 1 ORDER BY account_type, name ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_account_group(
    pool: State<'_, SqlitePool>,
    group: CreateAccountGroup,
) -> Result<AccountGroup, String> {
    let result = sqlx::query("INSERT INTO account_groups (name, account_type) VALUES (?, ?)")
        .bind(&group.name)
        .bind(&group.account_type)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let id = result.last_insert_rowid();

    sqlx::query_as::<_, AccountGroup>("SELECT * FROM account_groups WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_account_group(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE account_groups SET is_active = 0 WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============= CASH & BANK ACCOUNTS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct CashBankAccount {
    pub id: i64,
    pub name: String,
}

#[tauri::command]
pub async fn get_cash_bank_accounts(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<CashBankAccount>, String> {
    sqlx::query_as::<_, CashBankAccount>(
        "SELECT id, account_name as name FROM chart_of_accounts WHERE is_active = 1 AND (account_group = 'Cash' OR account_group = 'Bank Account') ORDER BY account_code ASC"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}
