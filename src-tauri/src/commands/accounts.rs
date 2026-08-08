use crate::company_db::DbRegistry;
use crate::voucher_seq::get_next_voucher_number_in_tx;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
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
    pub party_type: Option<String>,
    // Address / contact fields (added via migration, always nullable)
    pub address_line_1: Option<String>,
    pub address_line_2: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub postal_code: Option<String>,
    pub gstin: Option<String>,
    pub price_category_id: Option<String>,
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

/// Full column projection for `chart_of_accounts` rows → `ChartOfAccount`.
/// All optional/migration-added columns are included so that adding new
/// nullable columns to the table never breaks existing queries.
/// Update this constant whenever a new column is added to the table.
const COA_SELECT_COLS: &str =
    "id, account_code, account_name, account_type, account_group, description,
     CAST(COALESCE(opening_balance, 0) AS REAL) as opening_balance,
     COALESCE(opening_balance_type, 'Dr') as opening_balance_type,
     is_active, is_system, party_id, party_type,
     address_line_1, address_line_2, city, state, postal_code, gstin,
     price_category_id,
     deleted_at, created_at, updated_at";

#[tauri::command]
pub async fn get_chart_of_accounts(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<ChartOfAccount>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, ChartOfAccount>(
        &format!("SELECT {} FROM chart_of_accounts WHERE deleted_at IS NULL ORDER BY account_code ASC", COA_SELECT_COLS)
    )
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_accounts_by_groups(
    registry: State<'_, Arc<DbRegistry>>,
    groups: Vec<String>,
) -> Result<Vec<ChartOfAccount>, String> {
    let pool = registry.active_pool().await?;
    if groups.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders: Vec<String> = (1..=groups.len()).map(|i| format!("?{}", i)).collect();
    let query_str = format!(
        "SELECT {} FROM chart_of_accounts \
         WHERE deleted_at IS NULL AND account_group IN ({}) \
         ORDER BY account_name ASC",
        COA_SELECT_COLS,
        placeholders.join(", ")
    );

    let mut query = sqlx::query_as::<_, ChartOfAccount>(&query_str);
    for group in groups {
        query = query.bind(group);
    }

    query.fetch_all(&pool).await.map_err(|e| e.to_string())
}

pub async fn get_next_account_code_helper(
    pool: &SqlitePool,
    account_type: &str,
) -> Result<String, String> {
    let start_num: i64 = match account_type {
        "Asset" => 1000,
        "Liability" => 2000,
        "Equity" => 3000,
        "Income" => 4000,
        "Expense" => 5000,
        _ => 1000,
    };

    let max_code: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(CAST(account_code AS INTEGER))
         FROM chart_of_accounts
         WHERE LENGTH(account_code) = 4
           AND account_code >= ?1
           AND account_code < ?2"
    )
    .bind(format!("{}", start_num))
    .bind(format!("{}", start_num + 1000))
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten();

    let next_num = max_code.unwrap_or(start_num).max(start_num) + 1;
    Ok(format!("{:04}", next_num))
}

#[tauri::command]
pub async fn get_next_account_code(
    registry: State<'_, Arc<DbRegistry>>,
    account_type: String,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    get_next_account_code_helper(&pool, &account_type).await
}

#[tauri::command]
pub async fn create_chart_of_account(
    registry: State<'_, Arc<DbRegistry>>,
    account: CreateChartOfAccount,
) -> Result<ChartOfAccount, String> {
    let pool = registry.active_pool().await?;
    let opening_balance = account.opening_balance.unwrap_or(0.0);
    let opening_balance_type = account
        .opening_balance_type
        .unwrap_or_else(|| "Dr".to_string());

    let final_code = if account.account_code.trim().is_empty() {
        get_next_account_code_helper(&pool, &account.account_type).await?
    } else {
        account.account_code.trim().to_string()
    };

    let id = Uuid::now_v7().to_string();

    let _ = sqlx::query(
        "INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, opening_balance, opening_balance_type, is_system) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
    )
    .bind(&id)
    .bind(&final_code)
    .bind(&account.account_name)
    .bind(&account.account_type)
    .bind(&account.account_group)
    .bind(&account.description)
    .bind(opening_balance)
    .bind(&opening_balance_type)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // If opening balance is provided, create voucher and journal entries
    if opening_balance > 0.0 {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        // Get next voucher number inside the transaction (uses the voucher_sequences table)
        let voucher_no = get_next_voucher_number_in_tx(&mut tx, "opening_balance").await?;
        let voucher_id = Uuid::now_v7().to_string();

        // Create voucher entry
        let _ = sqlx::query(
            "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, reference, narration, status, party_id, total_amount)
             VALUES (?, ?, ?, ?, ?, ?, 'posted', ?, ?)"
        )
        .bind(&voucher_id)
        .bind(&voucher_no)
        .bind("opening_balance")
        .bind(chrono::Local::now().format("%Y-%m-%d").to_string())
        .bind(format!("Opening balance for {}", account.account_name))
        .bind(format!("Initial balance for account: {}", account.account_name))
        .bind(&id)
        .bind(opening_balance)
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

    sqlx::query_as::<_, ChartOfAccount>(
        &format!("SELECT {} FROM chart_of_accounts WHERE id = ?", COA_SELECT_COLS)
    )
        .bind(id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_chart_of_account(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    account: CreateChartOfAccount,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    let new_opening_balance = account.opening_balance.unwrap_or(0.0);
    let opening_balance_type = account
        .opening_balance_type
        .unwrap_or_else(|| "Dr".to_string());

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get current opening balance to detect changes
    let current_account = sqlx::query_as::<_, ChartOfAccount>(
        &format!("SELECT {} FROM chart_of_accounts WHERE id = ?", COA_SELECT_COLS)
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
            // Update existing voucher with new amount and confirm party_id
            let _ = sqlx::query("UPDATE vouchers SET total_amount = ?, party_id = ? WHERE id = ?")
                .bind(new_opening_balance)
                .bind(&id)
                .bind(&vid)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

            vid
        } else {
            // Create a new opening balance voucher if one doesn't exist.
            // Use get_next_voucher_number_in_tx to run inside the existing transaction,
            // which is safe and avoids any pool-level lock contention.
            let voucher_no = get_next_voucher_number_in_tx(&mut tx, "opening_balance").await?;
            let new_vid = Uuid::now_v7().to_string();
            let voucher_date = chrono::Local::now().format("%Y-%m-%d").to_string();
            let _ = sqlx::query(
                "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, reference, narration, status, party_id, total_amount)
                 VALUES (?, ?, 'opening_balance', ?, ?, ?, 'posted', ?, ?)"
            )
            .bind(&new_vid)
            .bind(&voucher_no)
            .bind(&voucher_date)
            .bind(format!("Opening balance for {}", account.account_name))
            .bind(format!("Initial balance for account: {}", account.account_name))
            .bind(&id)
            .bind(new_opening_balance)
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
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Get the account to check if it's a default account
    let account =
        sqlx::query_as::<_, ChartOfAccount>(
            &format!("SELECT {} FROM chart_of_accounts WHERE id = ?", COA_SELECT_COLS)
        )
            .bind(&id)
            .fetch_optional(&pool)
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
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err("Cannot delete account as it has associated journal entries.".to_string());
    }

    // Check for references in opening_balances
    let ob_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM opening_balances WHERE account_id = ?")
            .bind(&id)
            .fetch_one(&pool)
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
                    .fetch_one(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

            if customer_exists > 0 {
                return Err("Cannot delete account linked to an active customer. Delete the customer first.".to_string());
            }

            // Check Suppliers
            let supplier_exists: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM suppliers WHERE id = ? AND is_active = 1")
                    .bind(party_id)
                    .fetch_one(&pool)
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
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_deleted_chart_of_accounts(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<ChartOfAccount>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, ChartOfAccount>(
        &format!("SELECT {} FROM chart_of_accounts WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC", COA_SELECT_COLS)
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_chart_of_account(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    sqlx::query("UPDATE chart_of_accounts SET is_active = 1, deleted_at = NULL WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn hard_delete_chart_of_account(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    // Reference checks (same as soft delete)
    let account =
        sqlx::query_as::<_, ChartOfAccount>(
            &format!("SELECT {} FROM chart_of_accounts WHERE id = ?", COA_SELECT_COLS)
        )
            .bind(&id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Account not found".to_string())?;

    if account.is_system == 1 {
        return Err("Cannot permanently delete system generated accounts".to_string());
    }

    let journal_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM journal_entries WHERE account_id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

    if journal_count > 0 {
        return Err(
            "Cannot permanently delete account as it has associated journal entries.".to_string(),
        );
    }

    let ob_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM opening_balances WHERE account_id = ?")
            .bind(&id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

    if ob_count > 0 {
        return Err(
            "Cannot permanently delete account as it has opening balance records.".to_string(),
        );
    }

    sqlx::query("DELETE FROM chart_of_accounts WHERE id = ?")
        .bind(&id)
        .execute(&pool)
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
pub async fn get_account_groups(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<String>, String> {
    let pool = registry.active_pool().await?;
    let groups = sqlx::query_scalar::<_, String>(
        "SELECT name FROM account_groups WHERE is_active = 1 ORDER BY account_type, name ASC",
    )
    .fetch_all(&pool)
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
    pub parent_group_id: Option<String>,  // Tally-like hierarchy
    pub is_system: i64,                    // 1 = protected seeded group
    pub base_type: Option<String>,         // Only on primary (root) groups
    pub is_active: i64,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateAccountGroup {
    pub name: String,
    pub account_type: String,
    pub parent_group_id: Option<String>,  // Optional parent for sub-group creation
}

#[tauri::command]
pub async fn get_all_account_groups(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<AccountGroup>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, AccountGroup>(
        "SELECT id, name, account_type,
                parent_group_id, COALESCE(is_system, 0) as is_system,
                base_type, is_active, created_at
         FROM account_groups
         WHERE is_active = 1
         ORDER BY account_type, name ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

/// Returns all active account groups with hierarchy data.
/// The frontend builds the visual tree from parent_group_id references.
#[tauri::command]
pub async fn get_account_group_tree(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<AccountGroup>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, AccountGroup>(
        "SELECT id, name, account_type,
                parent_group_id, COALESCE(is_system, 0) as is_system,
                base_type, is_active, created_at
         FROM account_groups
         WHERE is_active = 1
         ORDER BY
           CASE WHEN parent_group_id IS NULL THEN 0 ELSE 1 END ASC,
           account_type ASC,
           name ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_account_group(
    registry: State<'_, Arc<DbRegistry>>,
    group: CreateAccountGroup,
) -> Result<AccountGroup, String> {
    let pool = registry.active_pool().await?;
    let id = Uuid::now_v7().to_string();

    // Derive account_type from parent if a parent is given and type is not specified clearly
    let resolved_type = if let Some(ref pid) = group.parent_group_id {
        // Walk up to find the base_type of the parent chain
        let parent_type: Option<String> = sqlx::query_scalar(
            "WITH RECURSIVE ancestors(id, account_type, parent_group_id, base_type) AS (
                 SELECT id, account_type, parent_group_id, base_type FROM account_groups WHERE id = ?
                 UNION ALL
                 SELECT ag.id, ag.account_type, ag.parent_group_id, ag.base_type
                 FROM account_groups ag
                 JOIN ancestors a ON ag.id = a.parent_group_id
             )
             SELECT COALESCE(base_type, account_type) FROM ancestors
             WHERE parent_group_id IS NULL OR base_type IS NOT NULL
             LIMIT 1"
        )
        .bind(pid)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
        .flatten();
        parent_type.unwrap_or_else(|| group.account_type.clone())
    } else {
        group.account_type.clone()
    };

    sqlx::query(
        "INSERT INTO account_groups (id, name, account_type, parent_group_id, is_system) VALUES (?, ?, ?, ?, 0)"
    )
    .bind(&id)
    .bind(&group.name)
    .bind(&resolved_type)
    .bind(&group.parent_group_id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query_as::<_, AccountGroup>(
        "SELECT id, name, account_type, parent_group_id, COALESCE(is_system,0) as is_system, base_type, is_active, created_at
         FROM account_groups WHERE id = ?"
    )
    .bind(id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_account_group(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;

    // Fetch the group to check system flag
    let group: Option<(i64, String)> = sqlx::query_as(
        "SELECT COALESCE(is_system, 0), name FROM account_groups WHERE id = ? AND is_active = 1"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (is_system, name) = group.ok_or_else(|| "Account group not found".to_string())?;

    if is_system == 1 {
        return Err(format!("'{}' is a system group and cannot be deleted.", name));
    }

    // Check if any child groups exist under this group
    let child_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM account_groups WHERE parent_group_id = ? AND is_active = 1"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if child_count > 0 {
        return Err(format!(
            "Cannot delete '{}' — it has {} sub-group(s). Delete or move them first.",
            name, child_count
        ));
    }

    // Check if any ledgers (chart_of_accounts) are assigned to this group
    let ledger_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM chart_of_accounts WHERE account_group = ? AND deleted_at IS NULL"
    )
    .bind(&name)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if ledger_count > 0 {
        return Err(format!(
            "Cannot delete '{}' — {} ledger(s) are assigned to it. Reassign them first.",
            name, ledger_count
        ));
    }

    sqlx::query("UPDATE account_groups SET is_active = 0 WHERE id = ?")
        .bind(&id)
        .execute(&pool)
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
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<CashBankAccount>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, CashBankAccount>(
        "SELECT id, account_name as name, account_group FROM chart_of_accounts WHERE is_active = 1 AND (account_group = 'Cash' OR account_group = 'Bank Account') ORDER BY account_code ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}
