use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use uuid::Uuid;

// ============= CHART OF ACCOUNTS =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ChartOfAccount {
    pub id: String,
    pub account_code: String,
    pub account_name: String,
    pub account_type: String,
    pub account_group: String,
    pub description: Option<String>,
    pub opening_balance: f64,
    pub opening_balance_type: String,
    pub is_active: i64,
    pub is_system: i64,
    pub party_id: Option<String>,
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
        "SELECT id, account_code, account_name, account_type, account_group, description, CAST(opening_balance AS REAL) as opening_balance, opening_balance_type, is_active, is_system, party_id, deleted_at, created_at, updated_at FROM chart_of_accounts WHERE deleted_at IS NULL ORDER BY account_code ASC"
    )
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_accounts_by_groups(
    pool: State<'_, SqlitePool>,
    groups: Vec<String>,
) -> Result<Vec<ChartOfAccount>, String> {
    if groups.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders: Vec<String> = (1..=groups.len()).map(|i| format!("?{}", i)).collect();
    let query_str = format!(
        "SELECT id, account_code, account_name, account_type, account_group, description, 
                CAST(opening_balance AS REAL) as opening_balance, opening_balance_type, 
                is_active, is_system, party_id, deleted_at, created_at, updated_at 
         FROM chart_of_accounts 
         WHERE deleted_at IS NULL AND account_group IN ({}) 
         ORDER BY account_name ASC",
        placeholders.join(", ")
    );

    let mut query = sqlx::query_as::<_, ChartOfAccount>(&query_str);
    for group in groups {
        query = query.bind(group);
    }

    query
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

    let id = Uuid::now_v7().to_string();

    let _ = sqlx::query(
        "INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, opening_balance, opening_balance_type, is_system) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
    )
    .bind(&id)
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

    // If opening balance is provided, create voucher and journal entries
    if opening_balance > 0.0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        // Get next voucher number
        let voucher_no = get_next_voucher_number(&pool, "opening_balance").await?;
        let voucher_id = Uuid::now_v7().to_string();

        // Create voucher entry
        let _ = sqlx::query(
            "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, reference, narration, status)
             VALUES (?, ?, ?, ?, ?, ?, 'posted')"
        )
        .bind(&voucher_id)
        .bind(&voucher_no)
        .bind("opening_balance")
        .bind("2025-12-21")
        .bind(format!("Opening balance for {}", account.account_name))
        .bind(format!("Initial balance for account: {}", account.account_name))
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Find Opening Balance Adjustment account (code 3004)
        let ob_account = sqlx::query_as::<_, (String,)>(
            "SELECT id FROM chart_of_accounts WHERE account_code = '3004' LIMIT 1",
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Opening Balance Adjustment account not found".to_string())?;

        let ob_account_id = ob_account.0;

        let je_id_1 = Uuid::now_v7().to_string();
        let je_id_2 = Uuid::now_v7().to_string();

        // Create journal entry for the account
        if opening_balance_type == "Dr" {
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, is_manual)
                 VALUES (?, ?, ?, ?, ?, ?, 0)"
            )
            .bind(&je_id_1)
            .bind(&voucher_id)
            .bind(&id)
            .bind(opening_balance)
            .bind(0.0)
            .bind(format!("Opening balance: {}", account.account_name))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            // Create balancing entry in Opening Balance Adjustment account
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, is_manual)
                 VALUES (?, ?, ?, ?, ?, ?, 0)"
            )
            .bind(&je_id_2)
            .bind(&voucher_id)
            .bind(&ob_account_id)
            .bind(0.0)
            .bind(opening_balance)
            .bind("Auto-generated balancing entry")
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        } else {
            // Credit balance
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, is_manual)
                 VALUES (?, ?, ?, ?, ?, ?, 0)"
            )
            .bind(&je_id_1)
            .bind(&voucher_id)
            .bind(&id)
            .bind(0.0)
            .bind(opening_balance)
            .bind(format!("Opening balance: {}", account.account_name))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            // Create balancing entry in Opening Balance Adjustment account
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, is_manual)
                 VALUES (?, ?, ?, ?, ?, ?, 0)"
            )
            .bind(&je_id_2)
            .bind(&voucher_id)
            .bind(&ob_account_id)
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
    id: String,
    account: CreateChartOfAccount,
) -> Result<(), String> {
    let new_opening_balance = account.opening_balance.unwrap_or(0.0);
    let opening_balance_type = account
        .opening_balance_type
        .unwrap_or_else(|| "Dr".to_string());

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get current opening balance to detect changes
    let current_account = sqlx::query_as::<_, ChartOfAccount>(
        "SELECT id, account_code, account_name, account_type, account_group, description, CAST(opening_balance AS REAL) as opening_balance, opening_balance_type, is_active, is_system, party_id, deleted_at, created_at, updated_at FROM chart_of_accounts WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Account not found".to_string())?;

    if current_account.is_system == 1 {
        return Err("Cannot edit system generated accounts".to_string());
    }

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
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // If opening balance changed, update or create journal entries
    if balance_changed {
        // Find the opening balance voucher for this account (if exists)
        let opening_balance_voucher: Option<String> = sqlx::query_scalar(
            "SELECT v.id FROM vouchers v 
             INNER JOIN journal_entries je ON v.id = je.voucher_id 
             WHERE v.voucher_type = 'opening_balance' AND je.account_id = ? 
             ORDER BY v.created_at DESC LIMIT 1",
        )
        .bind(&id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let voucher_id = if let Some(vid) = opening_balance_voucher {
            vid
        } else {
            // Create a new opening balance voucher if one doesn't exist
            let voucher_no = get_next_voucher_number(&pool, "opening_balance").await?;
            let new_vid = Uuid::now_v7().to_string();
            let _ = sqlx::query(
                "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, reference, narration, status)
                 VALUES (?, ?, 'opening_balance', ?, ?, ?, 'posted')"
            )
            .bind(&new_vid)
            .bind(&voucher_no)
            .bind(chrono::Local::now().format("%Y-%m-%d").to_string())
            .bind(format!("Opening balance for {}", account.account_name))
            .bind(format!("Initial balance for account: {}", account.account_name))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            new_vid
        };

        // Delete existing opening balance journal entries for this account (if any)
        sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ? AND account_id = ?")
            .bind(&voucher_id)
            .bind(&id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // Find Opening Balance Adjustment account
        let ob_account: Option<(String,)> =
            sqlx::query_as("SELECT id FROM chart_of_accounts WHERE account_code = '3004' LIMIT 1")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        if let Some((ob_account_id,)) = ob_account {
            // Delete existing balancing entry (if any)
            sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ? AND account_id = ?")
                .bind(&voucher_id)
                .bind(ob_account_id.clone())
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

            // Create new journal entry for the account if balance > 0
            if new_opening_balance > 0.0 {
                let je_id_1 = Uuid::now_v7().to_string();
                let je_id_2 = Uuid::now_v7().to_string();

                if opening_balance_type == "Dr" {
                    sqlx::query(
                        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, is_manual)
                         VALUES (?, ?, ?, ?, ?, ?, 0)"
                    )
                    .bind(&je_id_1)
                    .bind(&voucher_id)
                    .bind(&id)
                    .bind(new_opening_balance)
                    .bind(0.0)
                    .bind(format!("Opening balance: {}", account.account_name))
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;

                    // Create balancing entry
                    sqlx::query(
                        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, is_manual)
                         VALUES (?, ?, ?, ?, ?, ?, 0)"
                    )
                    .bind(&je_id_2)
                    .bind(&voucher_id)
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
                        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, is_manual)
                         VALUES (?, ?, ?, ?, ?, ?, 0)"
                    )
                    .bind(&je_id_1)
                    .bind(&voucher_id)
                    .bind(&id)
                    .bind(0.0)
                    .bind(new_opening_balance)
                    .bind(format!("Opening balance: {}", account.account_name))
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;

                    // Create balancing entry
                    sqlx::query(
                        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, is_manual)
                         VALUES (?, ?, ?, ?, ?, ?, 0)"
                    )
                    .bind(&je_id_2)
                    .bind(&voucher_id)
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
pub async fn delete_chart_of_account(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    // Get the account to check if it's a default account
    let account =
        sqlx::query_as::<_, ChartOfAccount>("SELECT id, account_code, account_name, account_type, account_group, description, CAST(opening_balance AS REAL) as opening_balance, opening_balance_type, is_active, is_system, party_id, deleted_at, created_at, updated_at FROM chart_of_accounts WHERE id = ?")
            .bind(&id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Account not found".to_string())?;

    // List of default account codes that cannot be deleted
    // Use is_system check instead of hardcoded list
    if account.is_system == 1 {
        return Err("Cannot delete system generated accounts".to_string());
    }

    // Check for references in journal_entries
    let journal_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM journal_entries WHERE account_id = ?")
            .bind(&id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err("Cannot delete account as it has associated journal entries.".to_string());
    }

    // Check for references in opening_balances
    let ob_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM opening_balances WHERE account_id = ?")
            .bind(&id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| e.to_string())?;

    if ob_count > 0 {
        return Err("Cannot delete account as it has opening balance records.".to_string());
    }

    // Check if account is linked to a party via party_id
    if let Some(party_id) = &account.party_id {
        if !party_id.is_empty() {
            // Check Customers
            let customer_exists: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM customers WHERE id = ? AND is_active = 1")
                    .bind(party_id)
                    .fetch_one(pool.inner())
                    .await
                    .map_err(|e| e.to_string())?;

            if customer_exists > 0 {
                return Err("Cannot delete account linked to an active customer. Delete the customer first.".to_string());
            }

            // Check Suppliers
            let supplier_exists: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM suppliers WHERE id = ? AND is_active = 1")
                    .bind(party_id)
                    .fetch_one(pool.inner())
                    .await
                    .map_err(|e| e.to_string())?;

            if supplier_exists > 0 {
                return Err("Cannot delete account linked to an active supplier. Delete the supplier first.".to_string());
            }
        }
    }

    sqlx::query(
        "UPDATE chart_of_accounts SET is_active = 0, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
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
        sqlx::query_as::<_, ChartOfAccount>("SELECT id, account_code, account_name, account_type, account_group, description, CAST(opening_balance AS REAL) as opening_balance, opening_balance_type, is_active, is_system, party_id, deleted_at, created_at, updated_at FROM chart_of_accounts WHERE id = ?")
            .bind(id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Account not found".to_string())?;

    if account.is_system == 1 {
        return Err("Cannot permanently delete system generated accounts".to_string());
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
    pub id: String,
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
    let id = Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO account_groups (id, name, account_type) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&group.name)
        .bind(&group.account_type)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

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
    pub id: String,
    pub name: String,
    pub account_group: String,
}

#[tauri::command]
pub async fn get_cash_bank_accounts(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<CashBankAccount>, String> {
    sqlx::query_as::<_, CashBankAccount>(
        "SELECT id, account_name as name, account_group FROM chart_of_accounts WHERE is_active = 1 AND (account_group = 'Cash' OR account_group = 'Bank Account') ORDER BY account_code ASC"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}
