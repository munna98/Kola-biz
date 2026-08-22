use crate::company_db::DbRegistry;
use chrono;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
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
    registry: State<'_, Arc<DbRegistry>>,
    from_date: Option<String>,
    to_date: String,
) -> Result<Vec<TrialBalanceRow>, String> {
    let pool = registry.active_pool().await?;
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
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

// ============= LEDGER REPORT =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct LedgerEntry {
    pub id: String,
    pub date: String,
    pub voucher_no: String,
    pub voucher_type: String,
    pub narration: String,
    pub debit: f64,
    pub credit: f64,
    pub balance: f64,
    pub foreign_debit: f64,
    pub foreign_credit: f64,
    pub foreign_balance: f64,
    pub currency_code: String,
    pub currency_symbol: String,
}

#[derive(Serialize, Deserialize)]
pub struct LedgerReport {
    pub entries: Vec<LedgerEntry>,
    pub opening_balance: f64,
    pub closing_balance: f64,
    pub foreign_opening_balance: f64,
    pub foreign_closing_balance: f64,
    pub foreign_currency_code: String,
    pub foreign_currency_symbol: String,
}

#[tauri::command]
pub async fn get_ledger_report(
    registry: State<'_, Arc<DbRegistry>>,
    account_id: String,
    from_date: Option<String>,
    to_date: String,
) -> Result<LedgerReport, String> {
    let pool = registry.active_pool().await?;

    // 1. Fetch initial opening balance and account code
    let account = sqlx::query_as::<_, (f64, String, String)>(
        "SELECT CAST(COALESCE(opening_balance, 0) AS REAL), COALESCE(opening_balance_type, 'Dr'), account_code FROM chart_of_accounts WHERE id = ?"
    )
    .bind(&account_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Failed to fetch account {}: {}", account_id, e))?;

    let is_ob_adjustment_account = account.2 == "3004";

    let coa_opening_balance = if is_ob_adjustment_account {
        0.0
    } else if account.1 == "Dr" {
        account.0
    } else {
        -account.0
    };

    let mut running_balance = coa_opening_balance;

    // 2. Sum prior transactions (before from_date), EXCLUDING opening_balance vouchers for standard accounts
    if let Some(ref from) = from_date {
        let ob_before_filter = if is_ob_adjustment_account {
            ""
        } else {
            "AND v.voucher_type != 'opening_balance'"
        };

        let before_query = format!(
            "SELECT CAST(COALESCE(SUM(je.debit), 0) AS REAL), CAST(COALESCE(SUM(je.credit), 0) AS REAL)
             FROM journal_entries je
             JOIN vouchers v ON je.voucher_id = v.id
             WHERE je.account_id = ? AND v.voucher_date < ? AND v.deleted_at IS NULL {}",
            ob_before_filter
        );

        let balance_before: Option<(f64, f64)> = sqlx::query_as(&before_query)
            .bind(&account_id)
            .bind(from)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

        if let Some((dr, cr)) = balance_before {
            running_balance += dr - cr;
        }
    }

    let report_opening_balance = running_balance;

    let date_filter = if let Some(ref from) = from_date {
        format!(
            "AND v.voucher_date >= '{}' AND v.voucher_date <= '{}'",
            from, to_date
        )
    } else {
        format!("AND v.voucher_date <= '{}'", to_date)
    };

    let ob_voucher_filter = if is_ob_adjustment_account {
        ""
    } else {
        "AND v.voucher_type != 'opening_balance'"
    };

    // --- Foreign currency opening balance (sum of foreign amounts before from_date) ---
    let (foreign_opening_balance, foreign_opening_code, foreign_opening_symbol) =
        if let Some(ref from) = from_date {
            let row: Option<(f64, f64, String, String)> = sqlx::query_as(
                "SELECT 
                    CAST(COALESCE(SUM(je.foreign_debit), 0) AS REAL),
                    CAST(COALESCE(SUM(je.foreign_credit), 0) AS REAL),
                    COALESCE(MAX(cur.code), ''),
                    COALESCE(MAX(cur.symbol), '')
                 FROM journal_entries je
                 JOIN vouchers v ON je.voucher_id = v.id
                 LEFT JOIN currencies cur ON je.currency_id = cur.id
                 WHERE je.account_id = ? AND v.voucher_date < ? AND v.deleted_at IS NULL
                   AND (je.foreign_debit > 0 OR je.foreign_credit > 0)",
            )
            .bind(&account_id)
            .bind(from)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

            if let Some((fd, fc, code, sym)) = row {
                (fd - fc, code, sym)
            } else {
                (0.0, String::new(), String::new())
            }
        } else {
            (0.0, String::new(), String::new())
        };

    // 3. Fetch transactions in period
    let query = format!(
        "SELECT 
            v.id,
            v.voucher_date as date,
            v.voucher_no,
            v.voucher_type,
            je.narration,
            CAST(je.debit AS REAL) as debit,
            CAST(je.credit AS REAL) as credit,
            0.0 as balance,
            COALESCE(je.foreign_debit, 0) as foreign_debit,
            COALESCE(je.foreign_credit, 0) as foreign_credit,
            0.0 as foreign_balance,
            COALESCE(cur.code, '') as currency_code,
            COALESCE(cur.symbol, '') as currency_symbol
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        LEFT JOIN currencies cur ON je.currency_id = cur.id
        WHERE je.account_id = ? AND v.deleted_at IS NULL
          {}
          {}
        ORDER BY v.voucher_date ASC, v.id ASC",
        ob_voucher_filter,
        date_filter
    );

    let mut entries: Vec<LedgerEntry> = sqlx::query_as(&query)
        .bind(&account_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // 4. Compute running INR balance and foreign running balance
    let mut foreign_running = foreign_opening_balance;
    for entry in &mut entries {
        running_balance += entry.debit - entry.credit;
        entry.balance = running_balance;
        foreign_running += entry.foreign_debit - entry.foreign_credit;
        entry.foreign_balance = foreign_running;
    }

    let linked_currency: Option<(String, String)> = sqlx::query_as(
        "SELECT cur.code, COALESCE(cur.symbol, cur.code) as symbol
         FROM chart_of_accounts coa
         LEFT JOIN customers c ON coa.party_id = c.id AND coa.party_type = 'customer'
         LEFT JOIN suppliers s ON coa.party_id = s.id AND coa.party_type = 'supplier'
         JOIN currencies cur ON cur.id = COALESCE(c.currency, s.currency)
         WHERE coa.id = ?"
    )
    .bind(&account_id)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    let (default_code, default_symbol) = match linked_currency {
        Some((code, sym)) => (code, sym),
        None => (String::new(), String::new()),
    };

    // Detect dominant foreign currency
    let (dominant_currency_code, dominant_currency_symbol) = entries
        .iter()
        .find(|e| !e.currency_code.is_empty())
        .map(|e| (e.currency_code.clone(), e.currency_symbol.clone()))
        .unwrap_or_else(|| {
            if !foreign_opening_code.is_empty() {
                (foreign_opening_code, foreign_opening_symbol)
            } else {
                (default_code, default_symbol)
            }
        });

    Ok(LedgerReport {
        entries,
        opening_balance: report_opening_balance,
        closing_balance: running_balance,
        foreign_opening_balance,
        foreign_closing_balance: foreign_running,
        foreign_currency_code: dominant_currency_code,
        foreign_currency_symbol: dominant_currency_symbol,
    })
}

// ============= BALANCE SHEET =============
fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

pub async fn get_stock_value_as_of_date(
    pool: &sqlx::SqlitePool,
    as_of_date: &str,
    is_opening: bool,
) -> Result<f64, String> {
    let date_condition = if is_opening {
        "v.voucher_date < ? OR (v.voucher_type = 'opening_stock' AND v.voucher_date = ?)"
    } else {
        "v.voucher_date <= ?"
    };

    let query = format!(
        "SELECT 
            p.id,
            COALESCE(SUM(CASE WHEN sm.movement_type = 'IN' THEN sm.quantity ELSE -sm.quantity END), 0) as net_qty,
            COALESCE(
                (
                    SELECT CASE WHEN SUM(sm_in.quantity) > 0 THEN SUM(sm_in.cost_amount) / SUM(sm_in.quantity) ELSE NULL END
                    FROM stock_movements sm_in
                    JOIN vouchers v_in ON sm_in.voucher_id = v_in.id
                    WHERE sm_in.product_id = p.id
                      AND sm_in.movement_type = 'IN'
                      AND v_in.voucher_type IN ('purchase_invoice', 'opening_stock', 'stock_journal')
                      AND v_in.deleted_at IS NULL
                      AND ({})
                ),
                p.purchase_rate,
                0.0
            ) as unit_cost
        FROM products p
        JOIN stock_movements sm ON p.id = sm.product_id
        JOIN vouchers v ON sm.voucher_id = v.id AND v.deleted_at IS NULL AND ({})
        WHERE p.deleted_at IS NULL
        GROUP BY p.id
        HAVING net_qty != 0",
        date_condition, date_condition
    );

    let rows: Vec<(String, f64, f64)> = if is_opening {
        sqlx::query_as(&query)
            .bind(as_of_date)
            .bind(as_of_date)
            .bind(as_of_date)
            .bind(as_of_date)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    } else {
        sqlx::query_as(&query)
            .bind(as_of_date)
            .bind(as_of_date)
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?
    };

    let mut total_value = 0.0;
    for (_id, qty, cost) in rows {
        total_value += qty * cost;
    }

    Ok(round2(total_value))
}

// ============= BALANCE SHEET =============
#[derive(Serialize, Deserialize)]
pub struct BSAccount {
    pub id: String,
    pub account_name: String,
    pub account_code: String,
    pub account_group: String,
    pub amount: f64,
}

#[derive(Serialize, Deserialize)]
pub struct BalanceSheetData {
    pub groups: Vec<crate::commands::accounts::AccountGroup>,
    pub assets: Vec<BSAccount>,
    pub liabilities: Vec<BSAccount>,
    pub equity: Vec<BSAccount>,
    pub total_assets: f64,
    pub total_liabilities: f64,
    pub total_equity: f64,
}

#[tauri::command]
pub async fn get_balance_sheet(
    registry: State<'_, Arc<DbRegistry>>,
    as_on_date: String,
) -> Result<BalanceSheetData, String> {
    let pool = registry.active_pool().await?;

    let groups = sqlx::query_as::<_, crate::commands::accounts::AccountGroup>(
        "SELECT id, name, account_type, parent_group_id, COALESCE(is_system, 0) as is_system, base_type, is_active, created_at FROM account_groups WHERE is_active = 1"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let closing_stock_asset = get_stock_value_as_of_date(&pool, &as_on_date, false).await?;

    let query = "
        SELECT 
            coa.id,
            coa.account_name,
            coa.account_code,
            coa.account_type,
            coa.account_group,
            CAST(COALESCE(coa.opening_balance, 0) AS REAL) as opening_balance,
            COALESCE(coa.opening_balance_type, 'Dr') as opening_balance_type,
            CAST(COALESCE(SUM(je.debit), 0) AS REAL) as total_debit,
            CAST(COALESCE(SUM(je.credit), 0) AS REAL) as total_credit,
            CAST(COALESCE(SUM(CASE WHEN je.voucher_type = 'opening_balance' THEN 1 ELSE 0 END), 0) AS INTEGER) as ob_voucher_count
        FROM chart_of_accounts coa
        LEFT JOIN (
            SELECT je.account_id, je.debit, je.credit, v.voucher_type
            FROM journal_entries je
            JOIN vouchers v ON je.voucher_id = v.id
            WHERE v.deleted_at IS NULL AND v.voucher_date <= ?
        ) je ON coa.id = je.account_id
        WHERE coa.deleted_at IS NULL
        GROUP BY coa.id
    ";

    let rows = sqlx::query_as::<_, (String, String, String, String, String, f64, String, f64, f64, i32)>(query)
        .bind(&as_on_date)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut assets = Vec::new();
    let mut liabilities = Vec::new();
    let mut equity = Vec::new();
    let mut total_assets = 0.0;
    let mut total_liabilities = 0.0;
    let mut total_equity = 0.0;

    let mut gl_inventory_balance = 0.0;
    let mut gl_net_profit = 0.0;

    for (id, name, code, acc_type, group_name, op_bal, op_type, dr, cr, ob_voucher_count) in rows {
        // If an OB voucher exists in journal_entries for this account, dr/cr already includes the opening balance.
        // So effective op_bal is 0 to avoid double counting coa.opening_balance.
        let effective_op_bal = if ob_voucher_count > 0 { 0.0 } else { op_bal };

        if acc_type == "Income" {
            let inc_op = if op_type == "Cr" { effective_op_bal } else { -effective_op_bal };
            gl_net_profit += cr - dr + inc_op;
            continue;
        } else if acc_type == "Expense" {
            let exp_op = if op_type == "Dr" { effective_op_bal } else { -effective_op_bal };
            gl_net_profit -= dr - cr + exp_op;
            continue;
        }

        let mut balance = if acc_type == "Asset" {
            if op_type == "Dr" {
                dr - cr + effective_op_bal
            } else {
                dr - cr - effective_op_bal
            }
        } else if acc_type == "Liability" || acc_type == "Equity" {
            if op_type == "Cr" {
                cr - dr + effective_op_bal
            } else {
                cr - dr - effective_op_bal
            }
        } else {
            0.0
        };

        // Capture GL Inventory balance before overriding with physical stock value
        if code == "1004" || (acc_type == "Asset" && name == "Inventory") {
            gl_inventory_balance = balance;
            balance = closing_stock_asset;
        }

        // Skip zero balances
        if balance.abs() < 0.01 {
            continue;
        }

        let account = BSAccount {
            id,
            account_name: name,
            account_code: code,
            account_group: group_name,
            amount: round2(balance),
        };

        match acc_type.as_str() {
            "Asset" => {
                total_assets += balance;
                assets.push(account);
            }
            "Liability" => {
                total_liabilities += balance;
                liabilities.push(account);
            }
            "Equity" => {
                total_equity += balance;
                equity.push(account);
            }
            _ => {}
        }
    }

    // Ensure Inventory Asset is present if closing_stock_asset > 0
    if closing_stock_asset >= 0.01 && !assets.iter().any(|a| a.account_code == "1004" || a.account_name == "Inventory") {
        total_assets += closing_stock_asset;
        assets.push(BSAccount {
            id: "INVENTORY_ASSET".to_string(),
            account_name: "Inventory".to_string(),
            account_code: "1004".to_string(),
            account_group: "Inventory".to_string(),
            amount: closing_stock_asset,
        });
    }

    // Calculate Inventory Valuation Delta: delta = closing_stock_asset - gl_inventory_balance
    // Adjust GL Net Profit by delta so Total Assets = Total Liabilities + Total Equity holds mathematically
    let inventory_delta = closing_stock_asset - gl_inventory_balance;
    let net_profit = round2(gl_net_profit + inventory_delta);

    if net_profit.abs() >= 0.01 {
        total_equity += net_profit;
        equity.push(BSAccount {
            id: "NET_PROFIT".to_string(),
            account_name: "Net Profit for the Period".to_string(),
            account_code: "NET_PROFIT".to_string(),
            account_group: "Reserves & Surplus".to_string(),
            amount: net_profit,
        });
    }

    Ok(BalanceSheetData {
        groups,
        assets,
        liabilities,
        equity,
        total_assets: round2(total_assets),
        total_liabilities: round2(total_liabilities),
        total_equity: round2(total_equity),
    })
}

// ============= PROFIT & LOSS =============
#[derive(Serialize, Deserialize)]
pub struct ProfitLossData {
    pub groups: Vec<crate::commands::accounts::AccountGroup>,
    pub income: Vec<PLAccount>,
    pub expenses: Vec<PLAccount>,
    pub total_income: f64,
    pub total_expenses: f64,
    pub opening_stock: f64,
    pub purchases: f64,
    pub closing_stock: f64,
    pub cogs: f64,
    pub gross_profit: f64,
    pub net_profit: f64,
}

#[derive(Serialize, Deserialize)]
pub struct PLAccount {
    pub id: String,
    pub account_name: String,
    pub account_code: String,
    pub account_group: String,
    pub amount: f64,
}

#[tauri::command]
pub async fn get_profit_loss(
    registry: State<'_, Arc<DbRegistry>>,
    from_date: String,
    to_date: String,
) -> Result<ProfitLossData, String> {
    let pool = registry.active_pool().await?;

    let groups = sqlx::query_as::<_, crate::commands::accounts::AccountGroup>(
        "SELECT id, name, account_type, parent_group_id, COALESCE(is_system, 0) as is_system, base_type, is_active, created_at FROM account_groups WHERE is_active = 1"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let opening_stock = get_stock_value_as_of_date(&pool, &from_date, true).await?;
    let closing_stock = get_stock_value_as_of_date(&pool, &to_date, false).await?;

    let query = "
        SELECT 
            coa.id,
            coa.account_name,
            coa.account_code,
            coa.account_type,
            coa.account_group,
            CAST(COALESCE(SUM(je.debit), 0) AS REAL) as dr,
            CAST(COALESCE(SUM(je.credit), 0) AS REAL) as cr
        FROM chart_of_accounts coa
        JOIN journal_entries je ON coa.id = je.account_id
        JOIN vouchers v ON je.voucher_id = v.id
        WHERE v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
        AND v.voucher_type != 'opening_balance'
        AND coa.account_type IN ('Income', 'Expense')
        GROUP BY coa.id
    ";

    let rows = sqlx::query_as::<_, (String, String, String, String, String, f64, f64)>(query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let purchases_query = "
        SELECT CAST(COALESCE(SUM(sm.cost_amount), 0.0) AS REAL)
        FROM stock_movements sm
        JOIN vouchers v ON sm.voucher_id = v.id
        WHERE v.voucher_type = 'purchase_invoice'
          AND sm.movement_type = 'IN'
          AND v.voucher_date >= ? AND v.voucher_date <= ?
          AND v.deleted_at IS NULL
    ";
    let period_purchases: f64 = sqlx::query_scalar(purchases_query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_one(&pool)
        .await
        .unwrap_or(0.0);

    let mut income = Vec::new();
    let mut expenses = Vec::new();
    let mut total_income = 0.0;
    let mut purchases = 0.0;
    let mut cogs_from_gl = 0.0;
    let mut total_operating_expenses = 0.0;

    for (id, name, code, acc_type, group_name, dr, cr) in rows {
        if acc_type == "Income" {
            let amount = cr - dr;
            if amount.abs() >= 0.01 {
                total_income += amount;
                income.push(PLAccount {
                    id,
                    account_name: name,
                    account_code: code,
                    account_group: group_name,
                    amount: round2(amount),
                });
            }
        } else if code == "5002" {
            cogs_from_gl += dr - cr;
        } else if code == "5001" {
            purchases += dr - cr;
        } else if code == "5003" {
            purchases -= cr - dr;
        } else {
            let amount = dr - cr;
            if amount.abs() >= 0.01 {
                total_operating_expenses += amount;
                expenses.push(PLAccount {
                    id,
                    account_name: name,
                    account_code: code,
                    account_group: group_name,
                    amount: round2(amount),
                });
            }
        }
    }

    let total_purchases = if period_purchases > 0.0 { period_purchases } else { purchases };
    let cogs = if cogs_from_gl > 0.0 {
        round2(cogs_from_gl)
    } else {
        round2((opening_stock + total_purchases - closing_stock).max(0.0))
    };
    let gross_profit = round2(total_income - cogs);
    let total_expenses = round2(cogs + total_operating_expenses);
    let net_profit = round2(total_income - total_expenses);

    Ok(ProfitLossData {
        groups,
        income,
        expenses,
        total_income: round2(total_income),
        total_expenses: round2(total_expenses),
        opening_stock: round2(opening_stock),
        purchases: round2(total_purchases),
        closing_stock: round2(closing_stock),
        cogs,
        gross_profit,
        net_profit,
    })
}

// ============= CASH FLOW =============
#[derive(Serialize, Deserialize)]
pub struct CashFlowItem {
    pub description: String,
    pub amount: f64,
}

#[derive(Serialize, Deserialize)]
pub struct CashFlowData {
    pub operating_activities: Vec<CashFlowItem>,
    pub investing_activities: Vec<CashFlowItem>,
    pub financing_activities: Vec<CashFlowItem>,
    pub net_operating: f64,
    pub net_investing: f64,
    pub net_financing: f64,
    pub net_change: f64,
    pub opening_cash: f64,
    pub closing_cash: f64,
}

#[tauri::command]
pub async fn get_cash_flow(
    registry: State<'_, Arc<DbRegistry>>,
    from_date: String,
    to_date: String,
) -> Result<CashFlowData, String> {
    let pool = registry.active_pool().await?;
    // Get opening date (day before from_date)
    let opening_date_obj =
        chrono::NaiveDate::parse_from_str(&from_date, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let opening_date = (opening_date_obj - chrono::Duration::days(1)).to_string();

    // 1. Calculate Opening Cash
    let opening_cash_query = "
        SELECT CAST(COALESCE(SUM(je.debit - je.credit), 0) AS REAL)
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE coa.account_name = 'Cash' 
        AND v.voucher_date <= ? AND v.deleted_at IS NULL
    ";

    let opening_cash: f64 = sqlx::query_scalar(opening_cash_query)
        .bind(&opening_date)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // 2. Calculate Closing Cash
    let closing_cash_query = "
        SELECT CAST(COALESCE(SUM(je.debit - je.credit), 0) AS REAL)
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE coa.account_name = 'Cash' 
        AND v.voucher_date <= ? AND v.deleted_at IS NULL
    ";

    let closing_cash: f64 = sqlx::query_scalar(closing_cash_query)
        .bind(&to_date)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let net_change = closing_cash - opening_cash;

    // 3. Operating Activities - Only track actual cash transactions and working capital changes

    // Cash received from customers (Cash sales)
    let cash_sales_query = "
        SELECT CAST(COALESCE(SUM(je.debit), 0) AS REAL)
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE coa.account_name = 'Cash' 
        AND v.voucher_type = 'sales_invoice'
        AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
    ";

    let cash_sales: f64 = sqlx::query_scalar(cash_sales_query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_one(&pool)
        .await
        .unwrap_or(0.0);

    // Cash paid for purchases (Cash purchases only)
    let cash_purchases_query = "
        SELECT CAST(COALESCE(SUM(je.credit), 0) AS REAL)
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE coa.account_name = 'Cash' 
        AND v.voucher_type = 'purchase_invoice'
        AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
    ";

    let cash_purchases: f64 = sqlx::query_scalar(cash_purchases_query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_one(&pool)
        .await
        .unwrap_or(0.0);

    // Cash received from debtors (Payments against credit sales)
    // Note: Changes in Accounts Receivable can be added if needed for detailed working capital analysis
    let debtor_payment_query = "
        SELECT CAST(COALESCE(SUM(je.debit), 0) AS REAL)
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE coa.account_name = 'Cash' 
        AND v.voucher_type = 'receipt'
        AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
    ";

    let debtor_payment: f64 = sqlx::query_scalar(debtor_payment_query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_one(&pool)
        .await
        .unwrap_or(0.0);

    // Cash paid to creditors (Payments against credit purchases)
    // Note: Changes in Accounts Payable can be added if needed for detailed working capital analysis
    let creditor_payment_query = "
        SELECT CAST(COALESCE(SUM(je.credit), 0) AS REAL)
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE coa.account_name = 'Cash' 
        AND v.voucher_type = 'payment'
        AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
    ";

    let creditor_payment: f64 = sqlx::query_scalar(creditor_payment_query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_one(&pool)
        .await
        .unwrap_or(0.0);

    // Other operating expenses paid in cash
    let other_expenses_query = "
        SELECT CAST(COALESCE(SUM(je.credit), 0) AS REAL)
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE coa.account_name = 'Cash' 
        AND v.voucher_type = 'journal'
        AND coa.account_type = 'Expense'
        AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
    ";

    let other_expenses: f64 = sqlx::query_scalar(other_expenses_query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_one(&pool)
        .await
        .unwrap_or(0.0);

    let mut operating_activities = vec![];
    let mut net_operating = 0.0;

    if cash_sales.abs() >= 0.01 {
        operating_activities.push(CashFlowItem {
            description: "Cash from Sales".to_string(),
            amount: cash_sales,
        });
        net_operating += cash_sales;
    }

    if debtor_payment.abs() >= 0.01 {
        operating_activities.push(CashFlowItem {
            description: "Cash received from Debtors".to_string(),
            amount: debtor_payment,
        });
        net_operating += debtor_payment;
    }

    if cash_purchases.abs() >= 0.01 {
        operating_activities.push(CashFlowItem {
            description: "Cash paid for Purchases".to_string(),
            amount: -cash_purchases,
        });
        net_operating -= cash_purchases;
    }

    if creditor_payment.abs() >= 0.01 {
        operating_activities.push(CashFlowItem {
            description: "Cash paid to Creditors".to_string(),
            amount: -creditor_payment,
        });
        net_operating -= creditor_payment;
    }

    if other_expenses.abs() >= 0.01 {
        operating_activities.push(CashFlowItem {
            description: "Other Operating Expenses".to_string(),
            amount: -other_expenses,
        });
        net_operating -= other_expenses;
    }

    // 4. Investing Activities (Asset accounts excluding Cash and Receivables)
    let investing_query = "
        SELECT CAST(COALESCE(SUM(je.credit - je.debit), 0) AS REAL)
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE coa.account_type = 'Asset' 
        AND coa.account_name NOT IN ('Cash', 'Accounts Receivable', 'Bank Account')
        AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
    ";

    let net_investing: f64 = sqlx::query_scalar(investing_query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_one(&pool)
        .await
        .unwrap_or(0.0);

    let mut investing_activities = vec![];
    if net_investing.abs() >= 0.01 {
        investing_activities.push(CashFlowItem {
            description: "Capital Expenditure / Asset Sales".to_string(),
            amount: net_investing,
        });
    }

    // 5. Financing Activities (Only actual financing transactions like loans, capital, dividends)
    // Exclude operating liabilities (Accounts Payable, Accounts Receivable)
    let financing_query = "
        SELECT CAST(COALESCE(SUM(je.debit - je.credit), 0) AS REAL)
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE coa.account_type IN ('Liability', 'Equity')
        AND coa.account_name NOT IN ('Accounts Payable', 'Accounts Receivable')
        AND v.voucher_type NOT IN ('sales_invoice', 'purchase_invoice', 'receipt', 'payment')
        AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
    ";

    let net_financing: f64 = sqlx::query_scalar(financing_query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_one(&pool)
        .await
        .unwrap_or(0.0);

    let mut financing_activities = vec![];
    if net_financing.abs() >= 0.01 {
        financing_activities.push(CashFlowItem {
            description: "Financing Activities".to_string(),
            amount: net_financing,
        });
    }

    Ok(CashFlowData {
        operating_activities,
        investing_activities,
        financing_activities,
        net_operating,
        net_investing,
        net_financing,
        net_change,
        opening_cash,
        closing_cash,
    })
}

// ============= DAY BOOK =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct DayBookEntry {
    pub voucher_id: String,
    pub voucher_no: String,
    pub voucher_type: String,
    pub voucher_date: String,
    pub party_name: Option<String>,
    pub account_name: String,
    pub debit: f64,
    pub credit: f64,
    pub narration: String,
}

#[tauri::command]
pub async fn get_day_book(
    registry: State<'_, Arc<DbRegistry>>,
    from_date: String,
    to_date: String,
    detailed: Option<bool>,
) -> Result<Vec<DayBookEntry>, String> {
    let pool = registry.active_pool().await?;
    let query = if detailed.unwrap_or(false) {
        "
            SELECT 
                v.id as voucher_id,
                v.voucher_no,
                v.voucher_type,
                v.voucher_date,
                CASE 
                    WHEN v.party_type = 'customer' THEN (SELECT name FROM customers WHERE id = v.party_id)
                    WHEN v.party_type = 'supplier' THEN (SELECT name FROM suppliers WHERE id = v.party_id)
                    ELSE NULL
                END as party_name,
                coa.account_name,
                CAST(je.debit AS REAL) as debit,
                CAST(je.credit AS REAL) as credit,
                COALESCE(je.narration, v.narration, '') as narration
            FROM journal_entries je
            JOIN vouchers v ON je.voucher_id = v.id
            JOIN chart_of_accounts coa ON je.account_id = coa.id
            WHERE v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
            ORDER BY v.voucher_date ASC, v.id ASC, je.id ASC
        "
    } else {
        "
            SELECT 
                v.id as voucher_id,
                v.voucher_no,
                v.voucher_type,
                v.voucher_date,
                CASE 
                    WHEN v.party_type = 'customer' THEN (SELECT name FROM customers WHERE id = v.party_id)
                    WHEN v.party_type = 'supplier' THEN (SELECT name FROM suppliers WHERE id = v.party_id)
                    ELSE NULL
                END as party_name,
                COALESCE(
                    party_coa.account_name,
                    CASE 
                        WHEN COUNT(DISTINCT coa.account_name) = 1 THEN MAX(coa.account_name)
                        ELSE ''
                    END
                ) as account_name,
                CAST(ROUND(
                    CASE
                        WHEN v.voucher_type IN ('sales_invoice', 'receipt', 'purchase_return') THEN SUM(je.debit)
                        WHEN v.voucher_type IN ('purchase_invoice', 'payment', 'sales_return') THEN 0
                        ELSE SUM(je.debit)
                    END
                , 2) AS REAL) as debit,
                CAST(ROUND(
                    CASE
                        WHEN v.voucher_type IN ('sales_invoice', 'receipt', 'purchase_return') THEN 0
                        WHEN v.voucher_type IN ('purchase_invoice', 'payment', 'sales_return') THEN SUM(je.credit)
                        ELSE SUM(je.credit)
                    END
                , 2) AS REAL) as credit,
                COALESCE(v.narration, '') as narration
            FROM journal_entries je
            JOIN vouchers v ON je.voucher_id = v.id
            JOIN chart_of_accounts coa ON je.account_id = coa.id
            LEFT JOIN chart_of_accounts party_coa ON v.party_id = party_coa.id
            WHERE v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
            GROUP BY v.id, v.voucher_no, v.voucher_type, v.voucher_date, v.party_type, v.party_id, v.narration, party_coa.account_name
            ORDER BY v.voucher_date ASC, v.id ASC
        "
    };

    sqlx::query_as::<_, DayBookEntry>(query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

// ============= TRANSACTION REPORT =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Transaction {
    pub id: String,
    pub voucher_no: String,
    pub voucher_type: String,
    pub voucher_date: String,
    pub party_id: Option<String>,
    pub party_name: Option<String>,
    pub amount: f64,
    pub narration: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn get_transaction_report(
    registry: State<'_, Arc<DbRegistry>>,
    from_date: String,
    to_date: String,
    voucher_type: Option<String>,
    party_id: Option<String>,
) -> Result<Vec<Transaction>, String> {
    let pool = registry.active_pool().await?;
    let mut checklist = Vec::new();

    let mut query_str = String::from(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_type,
            v.voucher_date,
            v.party_id,
            CASE
                WHEN v.voucher_type IN ('payment', 'receipt') THEN (
                    SELECT CASE
                        WHEN COUNT(vi.id) = 1
                            THEN (SELECT coa2.account_name FROM chart_of_accounts coa2 WHERE coa2.id = (SELECT vi2.ledger_id FROM voucher_items vi2 WHERE vi2.voucher_id = v.id LIMIT 1))
                        WHEN COUNT(vi.id) > 1
                            THEN 'Multiple Parties'
                        ELSE coa.account_name
                    END
                    FROM voucher_items vi WHERE vi.voucher_id = v.id
                )
                ELSE coa.account_name
            END as party_name,
            COALESCE(v.grand_total, v.total_amount, 0.0) as amount,
            v.narration,
            v.created_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        WHERE v.deleted_at IS NULL 
        AND v.voucher_date >= ? AND v.voucher_date <= ?",
    );

    checklist.push(from_date);
    checklist.push(to_date);

    if let Some(vt) = voucher_type {
        query_str.push_str(" AND v.voucher_type = ?");
        checklist.push(vt);
    }

    if let Some(pid) = party_id {
        query_str.push_str(" AND v.party_id = ?");
        checklist.push(pid);
    }

    query_str.push_str(" ORDER BY v.voucher_date DESC, v.created_at DESC");

    let mut query = sqlx::query_as::<_, Transaction>(&query_str);

    for param in checklist {
        query = query.bind(param);
    }

    query.fetch_all(&pool).await.map_err(|e| e.to_string())
}

// ============= SALES & RETURNS REPORT =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct SalesReturnReportRow {
    pub id: String,
    pub voucher_no: String,
    pub voucher_type: String,
    pub voucher_date: String,
    pub party_name: Option<String>,
    pub reference: Option<String>,
    pub amount: f64,
}

#[tauri::command]
pub async fn get_sales_return_report(
    registry: State<'_, Arc<DbRegistry>>,
    from_date: String,
    to_date: String,
) -> Result<Vec<SalesReturnReportRow>, String> {
    let pool = registry.active_pool().await?;
    let query = "
        SELECT
            v.id,
            v.voucher_no,
            v.voucher_type,
            v.voucher_date,
            coa.account_name as party_name,
            v.reference,
            CAST(COALESCE(v.grand_total, v.total_amount, 0.0) AS REAL) as amount
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        WHERE v.voucher_type IN ('sales_invoice', 'sales_return')
          AND v.voucher_date >= ?
          AND v.voucher_date <= ?
          AND v.deleted_at IS NULL
        ORDER BY v.voucher_date ASC, v.created_at ASC, v.id ASC
    ";

    sqlx::query_as::<_, SalesReturnReportRow>(query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

// ============= PARTY OUTSTANDING =============
#[derive(Serialize, Deserialize)]
pub struct PartyOutstanding {
    pub party_id: String,
    pub party_name: String,
    pub total_invoices: i64,
    pub total_amount: f64,
    pub paid_amount: f64,
    pub outstanding_amount: f64,
    pub oldest_invoice_date: Option<String>,
    pub days_outstanding: Option<i64>,
}

#[tauri::command]
pub async fn get_party_outstanding(
    registry: State<'_, Arc<DbRegistry>>,
    party_type: String,
    as_on_date: String,
) -> Result<Vec<PartyOutstanding>, String> {
    let pool = registry.active_pool().await?;
    let (account_group, voucher_type, _code_prefix) = if party_type == "customer" {
        ("Accounts Receivable", "sales_invoice", "1003-")
    } else {
        ("Accounts Payable", "purchase_invoice", "2001-")
    };

    let query = format!(
        "
        SELECT 
            coa.id as party_id,
            coa.account_name as party_name,
            COALESCE(v_stats.total_invoices, 0) as total_invoices,
            -- Total Charge (Opening + Incremental Increases)
            CAST(
                CASE 
                    WHEN coa.account_type = 'Asset' THEN 
                        (CASE WHEN coa.opening_balance_type = 'Dr' THEN coa.opening_balance ELSE 0 END) +
                        COALESCE(je_stats.total_debit, 0)
                    ELSE 
                        (CASE WHEN coa.opening_balance_type = 'Cr' THEN coa.opening_balance ELSE 0 END) +
                        COALESCE(je_stats.total_credit, 0)
                END
            AS REAL) as total_charge,
            -- Total Payment/Reductions (Opening + Incremental Decreases)
            CAST(
                CASE 
                    WHEN coa.account_type = 'Asset' THEN 
                        (CASE WHEN coa.opening_balance_type = 'Cr' THEN coa.opening_balance ELSE 0 END) +
                        COALESCE(je_stats.total_credit, 0)
                    ELSE 
                        (CASE WHEN coa.opening_balance_type = 'Dr' THEN coa.opening_balance ELSE 0 END) +
                        COALESCE(je_stats.total_debit, 0)
                END
            AS REAL) as total_payment,
            -- Ledger Balance (Outstanding)
            CAST(
                CASE 
                    WHEN coa.account_type = 'Asset' THEN 
                        (CASE WHEN coa.opening_balance_type = 'Dr' THEN coa.opening_balance ELSE -coa.opening_balance END) +
                        COALESCE(je_stats.net_dr_cr, 0)
                    ELSE 
                        (CASE WHEN coa.opening_balance_type = 'Cr' THEN coa.opening_balance ELSE -coa.opening_balance END) +
                        COALESCE(je_stats.net_cr_dr, 0)
                END
            AS REAL) as outstanding_amount,
            v_stats.oldest_invoice_date
        FROM chart_of_accounts coa
        LEFT JOIN (
            SELECT 
                je.account_id,
                SUM(debit) as total_debit,
                SUM(credit) as total_credit,
                SUM(debit - credit) as net_dr_cr,
                SUM(credit - debit) as net_cr_dr
            FROM journal_entries je
            JOIN vouchers v ON je.voucher_id = v.id
            WHERE v.voucher_date <= ? AND v.deleted_at IS NULL
            GROUP BY je.account_id
        ) je_stats ON coa.id = je_stats.account_id
        LEFT JOIN (
            SELECT 
                v.party_id,
                v.party_type,
                COUNT(v.id) as total_invoices,
                SUM(COALESCE(v.grand_total, v.total_amount, 0.0)) as total_amount,
                MIN(v.voucher_date) as oldest_invoice_date
            FROM vouchers v
            WHERE v.voucher_type = ? AND v.party_type = ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
            GROUP BY v.party_id, v.party_type
        ) v_stats ON (
            coa.id = v_stats.party_id AND v_stats.party_type = ?
        )
        WHERE coa.account_group = ? AND coa.deleted_at IS NULL
        GROUP BY coa.id
        HAVING ABS(outstanding_amount) > 0.01
        ORDER BY party_name ASC
    "
    );

    let rows =
        sqlx::query_as::<_, (String, String, i64, f64, f64, f64, Option<String>)>(query.as_str())
            .bind(&as_on_date)
            .bind(voucher_type)
            .bind(&party_type)
            .bind(&as_on_date)
            .bind(&party_type)
            .bind(account_group)
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;

    let today = chrono::Local::now().naive_local().date();

    Ok(rows
        .into_iter()
        .map(
            |(id, name, count, total_charge, total_payment, outstanding, oldest_date)| {
                let days = oldest_date.as_ref().and_then(|d| {
                    chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d")
                        .ok()
                        .map(|date| (today - date).num_days())
                });

                PartyOutstanding {
                    party_id: id,
                    party_name: name,
                    total_invoices: count,
                    total_amount: total_charge,
                    paid_amount: total_payment,
                    outstanding_amount: outstanding,
                    oldest_invoice_date: oldest_date,
                    days_outstanding: days,
                }
            },
        )
        .collect())
}

#[derive(Serialize, Deserialize)]
pub struct InvoiceDetail {
    pub voucher_no: String,
    pub voucher_date: String,
    pub total_amount: f64,
    pub paid_amount: f64,
    pub outstanding_amount: f64,
    pub days_outstanding: i64,
}

#[tauri::command]
pub async fn get_party_invoice_details(
    registry: State<'_, Arc<DbRegistry>>,
    party_id: String, // This is coa.id
    party_type: String,
    as_on_date: String,
) -> Result<Vec<InvoiceDetail>, String> {
    let pool = registry.active_pool().await?;
    let (voucher_type, code_prefix) = if party_type == "customer" {
        ("sales_invoice", "1003-")
    } else {
        ("purchase_invoice", "2001-")
    };

    let query = format!(
        "
        SELECT 
            v.voucher_no,
            v.voucher_date,
            CAST(COALESCE(v.grand_total, v.total_amount, 0.0) AS REAL) as total_amount,
            CAST(COALESCE((
                SELECT SUM(allocated_amount) FROM payment_allocations 
                WHERE invoice_voucher_id = v.id AND allocation_date <= ?
            ), 0) AS REAL) as paid_amount
        FROM vouchers v
        JOIN chart_of_accounts coa ON coa.account_code = '{}' || v.party_id
        WHERE coa.id = ? AND v.party_type = ? AND v.voucher_type = ?
        AND v.voucher_date <= ? AND v.deleted_at IS NULL
        GROUP BY v.id
        HAVING (total_amount - paid_amount) > 0.01
    ",
        code_prefix
    );

    let rows = sqlx::query_as::<_, (String, String, f64, f64)>(query.as_str())
        .bind(&as_on_date)
        .bind(party_id)
        .bind(&party_type)
        .bind(voucher_type)
        .bind(&as_on_date)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let today = chrono::Local::now().naive_local().date();

    Ok(rows
        .into_iter()
        .map(|(no, date, total, paid)| {
            let days = chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
                .ok()
                .map(|d| (today - d).num_days())
                .unwrap_or(0);

            InvoiceDetail {
                voucher_no: no,
                voucher_date: date,
                total_amount: total,
                paid_amount: paid,
                outstanding_amount: total - paid,
                days_outstanding: days,
            }
        })
        .collect())
}

// ============= SINGLE PRODUCT STOCK QTY =============

#[tauri::command]
pub async fn get_product_stock_qty(
    registry: State<'_, Arc<DbRegistry>>,
    product_id: String,
) -> Result<f64, String> {
    let pool = registry.active_pool().await?;

    let qty: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(
            CASE
                WHEN sm.movement_type = 'IN' THEN sm.quantity
                WHEN sm.movement_type = 'OUT' THEN -sm.quantity
                ELSE 0
            END
        ), 0) AS REAL)
         FROM stock_movements sm
         JOIN vouchers v ON sm.voucher_id = v.id
         WHERE sm.product_id = ? AND v.deleted_at IS NULL",
    )
    .bind(&product_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(qty.unwrap_or(0.0))
}

// ============= STOCK REPORT =============
#[derive(Serialize, Deserialize)]
pub struct StockSummary {
    pub product_id: String,
    pub product_code: String,
    pub product_name: String,
    pub group_name: Option<String>,
    pub unit_symbol: String,
    pub current_stock: f64,
    pub average_rate: f64,
    pub stock_value: f64,
    pub last_purchase_date: Option<String>,
    pub last_sale_date: Option<String>,
}

#[tauri::command]
pub async fn get_stock_report(
    registry: State<'_, Arc<DbRegistry>>,
    group_id: Option<String>,
    as_on_date: String,
) -> Result<Vec<StockSummary>, String> {
    let pool = registry.active_pool().await?;
    let group_filter = if let Some(gid) = group_id {
        format!("AND p.group_id = '{}'", gid)
    } else {
        String::new()
    };

    let query = format!(
        "
        SELECT 
            p.id as product_id,
            p.code as product_code,
            p.name as product_name,
            pg.name as group_name,
            u.symbol as unit_symbol,
            CAST(COALESCE(SUM(
                CASE 
                    WHEN v.id IS NOT NULL AND sm.movement_type = 'IN' THEN sm.quantity
                    WHEN v.id IS NOT NULL AND sm.movement_type = 'OUT' THEN -sm.quantity
                    ELSE 0
                END
            ), 0) AS REAL) as current_stock,
            CAST(COALESCE(
                (SELECT
                    SUM(CASE
                        WHEN sm2.movement_type = 'IN' THEN COALESCE(sm2.cost_amount, sm2.amount)
                        WHEN sm2.movement_type = 'OUT' THEN -COALESCE(sm2.cost_amount, sm2.amount)
                        ELSE 0
                    END) / NULLIF(SUM(CASE
                        WHEN sm2.movement_type = 'IN' THEN sm2.quantity
                        WHEN sm2.movement_type = 'OUT' THEN -sm2.quantity
                        ELSE 0
                    END), 0)
                 FROM stock_movements sm2
                 JOIN vouchers v2 ON sm2.voucher_id = v2.id
                 WHERE sm2.product_id = p.id 
                 AND v2.voucher_date <= ?
                 AND v2.deleted_at IS NULL),
                0
            ) AS REAL) as average_rate,
            (
                SELECT MAX(v.voucher_date)
                FROM stock_movements sm3
                JOIN vouchers v ON sm3.voucher_id = v.id
                WHERE sm3.product_id = p.id
                AND sm3.movement_type = 'IN'
                AND v.voucher_date <= ?
                AND v.deleted_at IS NULL
            ) as last_purchase_date,
            (
                SELECT MAX(v.voucher_date)
                FROM stock_movements sm4
                JOIN vouchers v ON sm4.voucher_id = v.id
                WHERE sm4.product_id = p.id
                AND sm4.movement_type = 'OUT'
                AND v.voucher_date <= ?
                AND v.deleted_at IS NULL
            ) as last_sale_date
        FROM products p
        LEFT JOIN product_groups pg ON p.group_id = pg.id
        JOIN units u ON p.unit_id = u.id
        LEFT JOIN stock_movements sm ON p.id = sm.product_id
        LEFT JOIN vouchers v ON sm.voucher_id = v.id AND v.voucher_date <= ? AND v.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        AND COALESCE(p.is_master, 0) = 0 {}
        GROUP BY p.id
        ORDER BY p.name ASC
        ",
        group_filter
    );

    let rows = sqlx::query_as::<
        _,
        (
            String,
            String,
            String,
            Option<String>,
            String,
            f64,
            f64,
            Option<String>,
            Option<String>,
        ),
    >(query.as_str())
    .bind(&as_on_date)
    .bind(&as_on_date)
    .bind(&as_on_date)
    .bind(&as_on_date)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(
            |(id, code, name, group, unit, stock, avg_rate, last_purchase, last_sale)| {
                StockSummary {
                    product_id: id,
                    product_code: code,
                    product_name: name,
                    group_name: group,
                    unit_symbol: unit,
                    current_stock: stock,
                    average_rate: avg_rate,
                    stock_value: stock * avg_rate,
                    last_purchase_date: last_purchase,
                    last_sale_date: last_sale,
                }
            },
        )
        .collect())
}

#[derive(Serialize, Deserialize)]
pub struct StockMovement {
    pub voucher_id: String,
    pub date: String,
    pub voucher_no: String,
    pub voucher_type: String,
    pub movement_type: String,
    pub quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub balance: f64,
    pub party_name: Option<String>,
}

#[tauri::command]
pub async fn get_stock_movements(
    registry: State<'_, Arc<DbRegistry>>,
    product_id: String,
    from_date: Option<String>,
    to_date: String,
) -> Result<Vec<StockMovement>, String> {
    let pool = registry.active_pool().await?;
    let date_filter = if let Some(ref from) = from_date {
        format!(
            "AND v.voucher_date >= '{}' AND v.voucher_date <= '{}'",
            from, to_date
        )
    } else {
        format!("AND v.voucher_date <= '{}'", to_date)
    };

    // Get opening balance if from_date is specified
    let mut opening_balance = 0.0;
    if let Some(ref from) = from_date {
        let balance: Option<f64> = sqlx::query_scalar(
            "SELECT CAST(COALESCE(SUM(
                CASE 
                    WHEN sm.movement_type = 'IN' THEN sm.quantity
                    WHEN sm.movement_type = 'OUT' THEN -sm.quantity
                    ELSE 0
                END
            ), 0) AS REAL)
             FROM stock_movements sm
             JOIN vouchers v ON sm.voucher_id = v.id
             WHERE sm.product_id = ? AND v.voucher_date < ? AND v.deleted_at IS NULL",
        )
        .bind(&product_id)
        .bind(from)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        opening_balance = balance.unwrap_or(0.0);
    }

    let query = format!(
        "SELECT 
            v.id as voucher_id,
            v.voucher_date as date,
            v.voucher_no,
            v.voucher_type,
            sm.movement_type,
            CAST(sm.quantity AS REAL) as quantity,
            CAST(sm.rate AS REAL) as rate,
            CAST(sm.amount AS REAL) as amount,
            coa.account_name as party_name
        FROM stock_movements sm
        JOIN vouchers v ON sm.voucher_id = v.id
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        WHERE sm.product_id = ? AND v.deleted_at IS NULL {}
        ORDER BY v.voucher_date ASC, v.id ASC",
        date_filter
    );

    let movements: Vec<(
        String,
        String,
        String,
        String,
        String,
        f64,
        f64,
        f64,
        Option<String>,
    )> = sqlx::query_as(query.as_str())
        .bind(product_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut running_balance = opening_balance;
    let result = movements
        .into_iter()
        .map(
            |(voucher_id, date, voucher_no, voucher_type, movement_type, qty, rate, amt, party)| {
                if movement_type == "IN" {
                    running_balance += qty;
                } else {
                    running_balance -= qty;
                }

                StockMovement {
                    voucher_id,
                    date,
                    voucher_no,
                    voucher_type,
                    movement_type,
                    quantity: qty,
                    rate,
                    amount: amt,
                    balance: running_balance,
                    party_name: party,
                }
            },
        )
        .collect();

    Ok(result)
}

// ============= DASHBOARD =============
#[derive(Serialize, Deserialize)]
pub struct DashboardMetrics {
    pub total_revenue: f64,
    pub total_expenses: f64,
    pub net_profit: f64,
    pub profit_margin: f64,
    pub stock_value: f64,
    pub cash_balance: f64,
    pub receivables: f64,
    pub payables: f64,
    pub revenue_growth: f64,
    pub profit_growth: f64,
}

#[tauri::command]
pub async fn get_dashboard_metrics(
    registry: State<'_, Arc<DbRegistry>>,
    from_date: String,
    to_date: String,
) -> Result<DashboardMetrics, String> {
    let pool = registry.active_pool().await?;
    // Get revenue (credits - debits for Income accounts)
    let revenue: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(je.credit - je.debit), 0.0) AS REAL)
         FROM journal_entries je
         JOIN chart_of_accounts coa ON je.account_id = coa.id
         JOIN vouchers v ON je.voucher_id = v.id
         WHERE coa.account_type = 'Income'
         AND v.voucher_date >= ? AND v.voucher_date <= ?
         AND v.deleted_at IS NULL",
    )
    .bind(&from_date)
    .bind(&to_date)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Get expenses (debits - credits for Expense accounts)
    let expenses: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(je.debit - je.credit), 0.0) AS REAL)
         FROM journal_entries je
         JOIN chart_of_accounts coa ON je.account_id = coa.id
         JOIN vouchers v ON je.voucher_id = v.id
         WHERE coa.account_type = 'Expense'
         AND v.voucher_date >= ? AND v.voucher_date <= ?
         AND v.deleted_at IS NULL",
    )
    .bind(&from_date)
    .bind(&to_date)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let total_revenue = revenue.unwrap_or(0.0);
    let total_expenses = expenses.unwrap_or(0.0);

    // Get stock value using stored inventory cost (same as Stock Report)
    let stock_value: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(
            COALESCE((
                SELECT SUM(CASE
                    WHEN sm.movement_type = 'IN' THEN COALESCE(sm.cost_amount, sm.amount)
                    WHEN sm.movement_type = 'OUT' THEN -COALESCE(sm.cost_amount, sm.amount)
                    ELSE 0
                END)
                FROM stock_movements sm
                JOIN vouchers v ON sm.voucher_id = v.id
                WHERE sm.product_id = p.id AND v.deleted_at IS NULL
            ), 0)
        ), 0) AS REAL)
         FROM products p
         WHERE p.deleted_at IS NULL
         AND COALESCE(p.is_master, 0) = 0",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Get cash balance (sum of cash/bank accounts)
    let cash_balance: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(
            COALESCE((SELECT SUM(je.debit - je.credit)
                      FROM journal_entries je
                      JOIN vouchers v ON je.voucher_id = v.id
                      WHERE je.account_id = coa.id AND v.deleted_at IS NULL), 
                      CASE WHEN coa.opening_balance_type = 'Dr' THEN coa.opening_balance ELSE -coa.opening_balance END)
        ), 0) AS REAL)
         FROM chart_of_accounts coa
         WHERE coa.account_group IN ('Cash', 'Bank Accounts')
         AND coa.deleted_at IS NULL",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Get receivables
    let receivables: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(
            COALESCE((SELECT SUM(je.debit - je.credit)
                      FROM journal_entries je
                      JOIN vouchers v ON je.voucher_id = v.id
                      WHERE je.account_id = coa.id AND v.deleted_at IS NULL), 
                      CASE WHEN coa.opening_balance_type = 'Dr' THEN coa.opening_balance ELSE -coa.opening_balance END)
        ), 0) AS REAL)
         FROM chart_of_accounts coa
         WHERE coa.account_group = 'Accounts Receivable'
         AND coa.deleted_at IS NULL",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Get payables
    let payables: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(
            COALESCE((SELECT SUM(je.credit - je.debit)
                      FROM journal_entries je
                      JOIN vouchers v ON je.voucher_id = v.id
                      WHERE je.account_id = coa.id AND v.deleted_at IS NULL), 
                      CASE WHEN coa.opening_balance_type = 'Cr' THEN coa.opening_balance ELSE -coa.opening_balance END)
        ), 0) AS REAL)
         FROM chart_of_accounts coa
         WHERE coa.account_group = 'Accounts Payable'
         AND coa.deleted_at IS NULL",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Calculate previous period for growth
    let prev_from =
        chrono::NaiveDate::parse_from_str(&from_date, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let prev_to =
        chrono::NaiveDate::parse_from_str(&to_date, "%Y-%m-%d").map_err(|e| e.to_string())?;
    let period_days = (prev_to - prev_from).num_days();
    let prev_period_from = prev_from - chrono::Duration::days(period_days);
    let prev_period_to = prev_to - chrono::Duration::days(period_days);

    let prev_revenue: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(je.credit - je.debit), 0.0) AS REAL)
         FROM journal_entries je
         JOIN chart_of_accounts coa ON je.account_id = coa.id
         JOIN vouchers v ON je.voucher_id = v.id
         WHERE coa.account_type = 'Income'
         AND v.voucher_date >= ? AND v.voucher_date <= ?
         AND v.deleted_at IS NULL",
    )
    .bind(prev_period_from.to_string())
    .bind(prev_period_to.to_string())
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let revenue_growth = if let Some(prev_rev) = prev_revenue {
        if prev_rev > 0.0 {
            ((total_revenue - prev_rev) / prev_rev) * 100.0
        } else {
            0.0
        }
    } else {
        0.0
    };

    let net_profit = total_revenue - total_expenses;
    let profit_margin = if total_revenue > 0.0 {
        (net_profit / total_revenue) * 100.0
    } else {
        0.0
    };
    let profit_growth = revenue_growth; // Simplified for now

    Ok(DashboardMetrics {
        total_revenue,
        total_expenses,
        net_profit,
        profit_margin,
        stock_value: stock_value.unwrap_or(0.0),
        cash_balance: cash_balance.unwrap_or(0.0),
        receivables: receivables.unwrap_or(0.0),
        payables: payables.unwrap_or(0.0),
        revenue_growth,
        profit_growth,
    })
}

#[derive(Serialize, Deserialize)]
pub struct RevenueTrend {
    pub date: String,
    pub revenue: f64,
    pub expenses: f64,
}

#[tauri::command]
pub async fn get_revenue_trend(
    registry: State<'_, Arc<DbRegistry>>,
    days: i32,
) -> Result<Vec<RevenueTrend>, String> {
    let pool = registry.active_pool().await?;
    let end_date = chrono::Local::now().naive_local().date();
    let start_date = end_date - chrono::Duration::days(days as i64);

    let mut trends = Vec::new();
    let mut current_date = start_date;

    while current_date <= end_date {
        let date_str = current_date.to_string();

        let revenue: Option<f64> = sqlx::query_scalar(
            "SELECT CAST(COALESCE(SUM(je.credit - je.debit), 0.0) AS REAL)
             FROM journal_entries je
             JOIN chart_of_accounts coa ON je.account_id = coa.id
             JOIN vouchers v ON je.voucher_id = v.id
             WHERE coa.account_type = 'Income'
             AND v.voucher_date = ?
             AND v.deleted_at IS NULL",
        )
        .bind(&date_str)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let expenses: Option<f64> = sqlx::query_scalar(
            "SELECT CAST(COALESCE(SUM(je.debit - je.credit), 0.0) AS REAL)
             FROM journal_entries je
             JOIN chart_of_accounts coa ON je.account_id = coa.id
             JOIN vouchers v ON je.voucher_id = v.id
             WHERE coa.account_type = 'Expense'
             AND v.voucher_date = ?
             AND v.deleted_at IS NULL",
        )
        .bind(&date_str)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        trends.push(RevenueTrend {
            date: date_str,
            revenue: revenue.unwrap_or(0.0),
            expenses: expenses.unwrap_or(0.0),
        });

        current_date += chrono::Duration::days(1);
    }

    Ok(trends)
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct TopProduct {
    pub product_name: String,
    pub total_quantity: f64,
    pub total_revenue: f64,
}

#[tauri::command]
pub async fn get_top_products(
    registry: State<'_, Arc<DbRegistry>>,
    limit: i32,
    from_date: String,
    to_date: String,
) -> Result<Vec<TopProduct>, String> {
    let pool = registry.active_pool().await?;
    let query = "
        SELECT
            COALESCE(parent.name, p.name) as product_name,
            CAST(SUM(sm.quantity) AS REAL) as total_quantity,
            CAST(SUM(sm.amount) AS REAL) as total_revenue
        FROM stock_movements sm
        JOIN products p ON sm.product_id = p.id
        LEFT JOIN products parent ON p.parent_product_id = parent.id
        JOIN vouchers v ON sm.voucher_id = v.id
        WHERE sm.movement_type = 'OUT'
        AND v.voucher_type = 'sales_invoice'
        AND v.voucher_date >= ? AND v.voucher_date <= ?
        AND v.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND (parent.id IS NULL OR parent.deleted_at IS NULL)
        GROUP BY COALESCE(parent.id, p.id), COALESCE(parent.name, p.name)
        ORDER BY total_revenue DESC
        LIMIT ?
    ";

    sqlx::query_as::<_, TopProduct>(query)
        .bind(&from_date)
        .bind(&to_date)
        .bind(limit)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize)]
pub struct CashFlowSummary {
    pub date: String,
    pub inflows: f64,
    pub outflows: f64,
}

#[tauri::command]
pub async fn get_cash_flow_summary(
    registry: State<'_, Arc<DbRegistry>>,
    days: i32,
) -> Result<Vec<CashFlowSummary>, String> {
    let pool = registry.active_pool().await?;
    let end_date = chrono::Local::now().naive_local().date();
    let start_date = end_date - chrono::Duration::days(days as i64);

    let mut summary = Vec::new();
    let mut current_date = start_date;

    while current_date <= end_date {
        let date_str = current_date.to_string();

        // Inflows: Cash received from customers (Cash sales) + Payments from debtors + Other inflows
        let cash_inflows: f64 = sqlx::query_scalar(
            "SELECT CAST(COALESCE(SUM(je.debit), 0) AS REAL)
             FROM journal_entries je
             JOIN vouchers v ON je.voucher_id = v.id
             JOIN chart_of_accounts coa ON je.account_id = coa.id
             WHERE coa.account_name = 'Cash'
             AND (
                (v.voucher_type = 'sales_invoice')
                OR (v.voucher_type = 'receipt')
                OR (v.voucher_type = 'journal' AND je.debit > 0)
             )
             AND v.voucher_date = ?
             AND v.deleted_at IS NULL",
        )
        .bind(&date_str)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or(0.0);

        // Outflows: Cash paid for purchases + Payments to creditors + Other cash expenses
        let cash_outflows: f64 = sqlx::query_scalar(
            "SELECT CAST(COALESCE(SUM(je.credit), 0) AS REAL)
             FROM journal_entries je
             JOIN vouchers v ON je.voucher_id = v.id
             JOIN chart_of_accounts coa ON je.account_id = coa.id
             WHERE coa.account_name = 'Cash'
             AND (
                (v.voucher_type = 'purchase_invoice')
                OR (v.voucher_type = 'payment')
                OR (v.voucher_type = 'journal' AND je.credit > 0)
             )
             AND v.voucher_date = ?
             AND v.deleted_at IS NULL",
        )
        .bind(&date_str)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or(0.0);

        summary.push(CashFlowSummary {
            date: date_str,
            inflows: cash_inflows,
            outflows: cash_outflows,
        });

        current_date += chrono::Duration::days(1);
    }

    Ok(summary)
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct StockAlert {
    pub product_id: String,
    pub product_name: String,
    pub current_stock: f64,
    pub unit_symbol: String,
}

#[tauri::command]
pub async fn get_stock_alerts(
    registry: State<'_, Arc<DbRegistry>>,
    threshold: f64,
) -> Result<Vec<StockAlert>, String> {
    let pool = registry.active_pool().await?;
    let query = "
        SELECT
            p.id as product_id,
            p.name as product_name,
            CAST(COALESCE(SUM(
                CASE
                    WHEN v.id IS NOT NULL AND sm.movement_type = 'IN' THEN sm.quantity
                    WHEN v.id IS NOT NULL AND sm.movement_type = 'OUT' THEN -sm.quantity
                    ELSE 0
                END
            ), 0) AS REAL) as current_stock,
            u.symbol as unit_symbol
        FROM products p
        JOIN units u ON p.unit_id = u.id
        LEFT JOIN products moved_product
            ON moved_product.deleted_at IS NULL
           AND (moved_product.id = p.id OR moved_product.parent_product_id = p.id)
        LEFT JOIN stock_movements sm ON moved_product.id = sm.product_id
        LEFT JOIN vouchers v ON sm.voucher_id = v.id AND v.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        AND p.parent_product_id IS NULL
        AND COALESCE(p.is_master, 0) = 0
        GROUP BY p.id
        HAVING current_stock < ? AND current_stock >= 0
        ORDER BY current_stock ASC
        LIMIT 10
    ";

    sqlx::query_as::<_, StockAlert>(query)
        .bind(threshold)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct RecentActivity {
    pub voucher_id: String,
    pub voucher_no: String,
    pub voucher_type: String,
    pub voucher_date: String,
    pub created_at: String,
    pub party_name: Option<String>,
    pub amount: f64,
}

#[tauri::command]
pub async fn get_recent_activity(
    registry: State<'_, Arc<DbRegistry>>,
    limit: i32,
) -> Result<Vec<RecentActivity>, String> {
    let pool = registry.active_pool().await?;
    let query = "
        SELECT
            v.id as voucher_id,
            v.voucher_no,
            v.voucher_type,
            v.voucher_date,
            v.created_at,
            CASE
                WHEN v.voucher_type IN ('payment', 'receipt') THEN (
                    SELECT CASE
                        WHEN COUNT(vi.id) = 1
                            THEN COALESCE(
                                (SELECT coa2.account_name FROM chart_of_accounts coa2 WHERE coa2.id = (SELECT vi2.ledger_id FROM voucher_items vi2 WHERE vi2.voucher_id = v.id LIMIT 1)),
                                (SELECT vi3.description FROM voucher_items vi3 WHERE vi3.voucher_id = v.id LIMIT 1)
                            )
                        WHEN COUNT(vi.id) > 1
                            THEN 'Multiple Parties'
                        ELSE coa.account_name
                    END
                    FROM voucher_items vi WHERE vi.voucher_id = v.id
                )
                ELSE coa.account_name
            END as party_name,
            CAST(COALESCE(v.grand_total, v.total_amount, 0.0) AS REAL) as amount
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        WHERE v.deleted_at IS NULL
        ORDER BY v.created_at DESC, v.id DESC
        LIMIT ?
    ";

    sqlx::query_as::<_, RecentActivity>(query)
        .bind(limit)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ProductGroupData {
    pub group_name: String,
    pub product_count: i64,
    pub total_stock_value: f64,
}

#[tauri::command]
pub async fn get_product_groups_distribution(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<ProductGroupData>, String> {
    let pool = registry.active_pool().await?;
    let query = "
        SELECT 
            COALESCE(pg.name, 'Ungrouped') as group_name,
            COUNT(DISTINCT p.id) as product_count,
            CAST(COALESCE(SUM(
                (SELECT COALESCE(SUM(CASE
                    WHEN sm.movement_type = 'IN' THEN COALESCE(sm.cost_amount, sm.amount)
                    WHEN sm.movement_type = 'OUT' THEN -COALESCE(sm.cost_amount, sm.amount)
                    ELSE 0
                 END), 0) FROM stock_movements sm
                 JOIN vouchers v ON sm.voucher_id = v.id
                 WHERE sm.product_id = p.id
                 AND v.deleted_at IS NULL)
            ), 0) AS REAL) as total_stock_value
        FROM products p
        LEFT JOIN product_groups pg ON p.group_id = pg.id
        WHERE p.deleted_at IS NULL
        AND COALESCE(p.is_master, 0) = 0
        GROUP BY pg.id, pg.name
        ORDER BY total_stock_value DESC
    ";

    sqlx::query_as::<_, ProductGroupData>(query)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())
}

// ============= PRODUCT PROFIT REPORT =============

#[derive(Serialize, Deserialize)]
pub struct ProductProfitRow {
    pub product_id: String,
    pub product_code: String,
    pub product_name: String,
    pub group_name: Option<String>,
    pub base_unit_symbol: String,
    pub qty_sold: f64,
    pub total_revenue: f64,
    pub total_cost: f64,
    pub gross_profit: f64,
    pub margin_percent: f64,
    pub avg_selling_price: f64,
    pub avg_cost_price: f64,
    pub units_sold_text: Option<String>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ProductProfitInvoiceRow {
    pub voucher_id: String,
    pub voucher_no: String,
    pub voucher_type: String,
    pub voucher_date: String,
    pub party_name: String,
    pub qty_sold: f64,
    pub unit_symbol: String,
    pub rate: f64,
    pub total_revenue: f64,
    pub cost_rate: f64,
    pub total_cost: f64,
    pub gross_profit: f64,
    pub margin_percent: f64,
}

#[tauri::command]
pub async fn get_product_profit_report(
    registry: State<'_, Arc<DbRegistry>>,
    from_date: String,
    to_date: String,
    group_id: Option<String>,
) -> Result<Vec<ProductProfitRow>, String> {
    let pool = registry.active_pool().await?;
    
    // 1. Build and execute main profit query using WAC (Weighted Average Cost from IN movements)
    // WAC per unit = SUM(cost_amount from purchase IN movements) / SUM(quantity from purchase IN movements)
    // Actual cost for the period = WAC * net_qty_sold
    let mut query_str = String::from("
        SELECT
            p.id as product_id,
            p.code as product_code,
            p.name as product_name,
            pg.name as group_name,
            u.symbol as base_unit_symbol,
            -- Net qty sold (sales OUT minus returns IN)
            CAST(COALESCE(SUM(
                CASE
                    WHEN sm.movement_type = 'OUT' THEN sm.quantity
                    WHEN sm.movement_type = 'IN' THEN -sm.quantity
                    ELSE 0
                END
            ), 0) AS REAL) as qty_sold,
            -- Total revenue (sales amount minus return amount)
            CAST(COALESCE(SUM(
                CASE
                    WHEN sm.movement_type = 'OUT' THEN sm.amount
                    WHEN sm.movement_type = 'IN' THEN -sm.amount
                    ELSE 0
                END
            ), 0) AS REAL) as total_revenue,
            -- Total cost (sum of cost_amount from sales OUT minus returns IN)
            CAST(COALESCE(SUM(
                CASE
                    WHEN sm.movement_type = 'OUT' THEN COALESCE(sm.cost_amount, 0)
                    WHEN sm.movement_type = 'IN' THEN -COALESCE(sm.cost_amount, 0)
                    ELSE 0
                END
            ), 0) AS REAL) as total_cost
        FROM stock_movements sm
        JOIN vouchers v ON sm.voucher_id = v.id
        JOIN products p ON sm.product_id = p.id
        LEFT JOIN product_groups pg ON p.group_id = pg.id
        JOIN units u ON p.unit_id = u.id
        WHERE (
            (v.voucher_type = 'sales_invoice' AND sm.movement_type = 'OUT')
            OR (v.voucher_type = 'sales_return' AND sm.movement_type = 'IN')
        )
          AND v.voucher_date >= ? AND v.voucher_date <= ?
          AND v.deleted_at IS NULL
          AND p.deleted_at IS NULL
    ");

    if group_id.is_some() {
        query_str.push_str(" AND p.group_id = ?");
    }

    query_str.push_str(" GROUP BY p.id ORDER BY total_revenue DESC");

    let mut query = sqlx::query_as::<_, (String, String, String, Option<String>, String, f64, f64, f64)>(&query_str)
        .bind(&from_date)
        .bind(&to_date);

    if let Some(ref gid) = group_id {
        query = query.bind(gid);
    }

    let rows = query.fetch_all(&pool).await.map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|(prod_id, prod_code, prod_name, grp_name, base_unit, qty, rev, cost)| {
            let gross = rev - cost;
            let margin = if rev != 0.0 { (gross / rev) * 100.0 } else { 0.0 };
            let avg_sell = if qty != 0.0 { rev / qty } else { 0.0 };
            let avg_cost = if qty != 0.0 { cost / qty } else { 0.0 };

            // Base unit display only
            let units_sold_text = format!("{} {}", qty, base_unit);

            ProductProfitRow {
                product_id: prod_id,
                product_code: prod_code,
                product_name: prod_name,
                group_name: grp_name,
                base_unit_symbol: base_unit,
                qty_sold: qty,
                total_revenue: rev,
                total_cost: cost,
                gross_profit: gross,
                margin_percent: margin,
                avg_selling_price: avg_sell,
                avg_cost_price: avg_cost,
                units_sold_text: Some(units_sold_text),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn get_product_profit_invoices(
    registry: State<'_, Arc<DbRegistry>>,
    product_id: String,
    from_date: String,
    to_date: String,
) -> Result<Vec<ProductProfitInvoiceRow>, String> {
    let pool = registry.active_pool().await?;
    let query = "
        SELECT
            v.id as voucher_id,
            v.voucher_no,
            v.voucher_type,
            v.voucher_date,
            COALESCE(
                (SELECT name FROM customers WHERE id = v.party_id),
                (SELECT name FROM suppliers WHERE id = v.party_id),
                (SELECT account_name FROM chart_of_accounts WHERE id = v.party_id),
                (SELECT account_name FROM chart_of_accounts WHERE id = v.account_id),
                'Cash/Bank Account'
            ) as party_name,
            CAST(CASE WHEN sm.movement_type = 'OUT' THEN sm.quantity ELSE -sm.quantity END AS REAL) as qty_sold,
            u.symbol as unit_symbol,
            CAST(sm.rate AS REAL) as rate,
            CAST(CASE WHEN sm.movement_type = 'OUT' THEN sm.amount ELSE -sm.amount END AS REAL) as total_revenue,
            CAST(COALESCE(sm.cost_rate, 0) AS REAL) as cost_rate,
            CAST(CASE WHEN sm.movement_type = 'OUT' THEN COALESCE(sm.cost_amount, 0) ELSE -COALESCE(sm.cost_amount, 0) END AS REAL) as total_cost
        FROM stock_movements sm
        JOIN vouchers v ON sm.voucher_id = v.id
        JOIN products p ON sm.product_id = p.id
        JOIN units u ON p.unit_id = u.id
        WHERE sm.product_id = ?
          AND (
            (v.voucher_type = 'sales_invoice' AND sm.movement_type = 'OUT')
            OR (v.voucher_type = 'sales_return' AND sm.movement_type = 'IN')
          )
          AND v.voucher_date >= ? AND v.voucher_date <= ?
          AND v.deleted_at IS NULL
        ORDER BY v.voucher_date DESC, v.voucher_no DESC
    ";

    let rows = sqlx::query_as::<_, (String, String, String, String, String, f64, String, f64, f64, f64, f64)>(query)
        .bind(&product_id)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|(v_id, v_no, v_type, v_date, p_name, qty, unit, rate, rev, cost_rate, cost)| {
            let gross = rev - cost;
            let margin = if rev != 0.0 { (gross / rev) * 100.0 } else { 0.0 };
            ProductProfitInvoiceRow {
                voucher_id: v_id,
                voucher_no: v_no,
                voucher_type: v_type,
                voucher_date: v_date,
                party_name: p_name,
                qty_sold: qty,
                unit_symbol: unit,
                rate,
                total_revenue: rev,
                cost_rate,
                total_cost: cost,
                gross_profit: gross,
                margin_percent: margin,
            }
        })
        .collect())
}

// ============= EXPENSE REPORT =============

#[derive(Serialize, Deserialize)]
pub struct ExpenseReportRow {
    pub group_key: String,
    pub group_label: String,
    pub voucher_count: i64,
    pub total_amount: f64,
}

#[tauri::command]
pub async fn get_expense_report(
    registry: State<'_, Arc<DbRegistry>>,
    from_date: String,
    to_date: String,
    group_by: String,        // "day" | "account" | "group" | "product"
    product_id: Option<String>,
    account_id: Option<String>,
) -> Result<Vec<ExpenseReportRow>, String> {
    let pool = registry.active_pool().await?;

    let mut params: Vec<String> = Vec::new();
    let mut extra_where = String::new();

    if let Some(ref pid) = product_id {
        extra_where.push_str(" AND vi.product_id = ?");
        params.push(pid.clone());
    }
    if let Some(ref aid) = account_id {
        extra_where.push_str(" AND coa.id = ?");
        params.push(aid.clone());
    }

    let (select_key, group_clause, order_clause) = match group_by.as_str() {
        "day" => (
            "v.voucher_date AS group_key, v.voucher_date AS group_label",
            "v.voucher_date",
            "v.voucher_date ASC",
        ),
        "product" => (
            "COALESCE(p.code || ' - ' || p.name, '__none__') AS group_key, COALESCE(p.code || ' - ' || p.name, '__none__') AS group_label",
            "COALESCE(p.id, '__none__')",
            "total_amount DESC",
        ),
        "group" => (
            "COALESCE(coa.account_group, 'Other Expenses') AS group_key, COALESCE(coa.account_group, 'Other Expenses') AS group_label",
            "COALESCE(coa.account_group, 'Other Expenses')",
            "total_amount DESC",
        ),
        _ => (
            // default: account
            "coa.account_name AS group_key, coa.account_name AS group_label",
            "coa.id",
            "total_amount DESC",
        ),
    };

    // For product grouping: exclude rows with no product_id
    let product_filter = if group_by == "product" {
        " AND vi.product_id IS NOT NULL AND vi.product_id != ''"
    } else {
        ""
    };

    let query_str = format!(
        "SELECT
            {select_key},
            CAST(COUNT(DISTINCT v.id) AS INTEGER) AS voucher_count,
            CAST(COALESCE(SUM(vi.amount), 0) AS REAL) AS total_amount
         FROM voucher_items vi
         JOIN vouchers v ON vi.voucher_id = v.id
         JOIN chart_of_accounts coa ON COALESCE(vi.ledger_id, v.party_id, v.account_id) = coa.id
         LEFT JOIN products p ON vi.product_id = p.id
         WHERE v.voucher_type = 'payment'
           AND (coa.account_type = 'Expense' OR coa.account_group IN ('Operating Expenses', 'Financial Expenses', 'Direct Expenses', 'Indirect Expenses', 'Discounts', 'Purchase Accounts'))
           AND v.voucher_date >= ?
           AND v.voucher_date <= ?
           AND v.deleted_at IS NULL
           {product_filter}
           {extra_where}
         GROUP BY {group_clause}
         ORDER BY {order_clause}",
    );

    let mut query = sqlx::query_as::<_, (String, String, i64, f64)>(&query_str)
        .bind(&from_date)
        .bind(&to_date);

    for p in &params {
        query = query.bind(p);
    }

    let rows = query.fetch_all(&pool).await.map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|(key, label, count, amount)| ExpenseReportRow {
            group_key: key,
            group_label: label,
            voucher_count: count,
            total_amount: amount,
        })
        .collect())
}

// -------- Entry-level detail (used when a specific product is selected OR to expand a group row) --------

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ExpenseDetail {
    pub voucher_no: String,
    pub voucher_date: String,
    pub account_name: String,
    pub product_name: Option<String>,
    pub amount: f64,
    pub narration: Option<String>,
}

#[tauri::command]
pub async fn get_expense_report_details(
    registry: State<'_, Arc<DbRegistry>>,
    from_date: String,
    to_date: String,
    product_id: Option<String>,   // filter to a specific product
    account_id: Option<String>,   // filter to a specific expense ledger
    group_by: Option<String>,     // when expanding a group row: "day"|"account"|"group"|"product"
    group_value: Option<String>,  // the group key value to filter on
) -> Result<Vec<ExpenseDetail>, String> {
    let pool = registry.active_pool().await?;

    let mut params: Vec<String> = Vec::new();
    let mut extra_where = String::new();

    // Specific product filter (entry-level product view)
    if let Some(ref pid) = product_id {
        extra_where.push_str(" AND vi.product_id = ?");
        params.push(pid.clone());
    }

    // Specific account filter
    if let Some(ref aid) = account_id {
        extra_where.push_str(" AND coa.id = ?");
        params.push(aid.clone());
    }

    // Group-row expansion filters
    if let (Some(gb), Some(gv)) = (&group_by, &group_value) {
        match gb.as_str() {
            "day" => {
                extra_where.push_str(" AND v.voucher_date = ?");
                params.push(gv.clone());
            }
            "account" => {
                extra_where.push_str(" AND coa.account_name = ?");
                params.push(gv.clone());
            }
            "group" => {
                extra_where.push_str(" AND COALESCE(coa.account_group, 'Other Expenses') = ?");
                params.push(gv.clone());
            }
            "product" => {
                extra_where.push_str(" AND p.code || ' - ' || p.name = ?");
                params.push(gv.clone());
            }
            _ => {}
        }
    }

    let query_str = if product_id.is_some() {
        format!(
            "SELECT
                v.voucher_no,
                v.voucher_date,
                coa.account_name,
                p.code || ' - ' || p.name AS product_name,
                CAST(vi.amount AS REAL) AS amount,
                COALESCE(vi.remarks, v.narration, '') AS narration
             FROM voucher_items vi
             JOIN vouchers v ON vi.voucher_id = v.id
             JOIN chart_of_accounts coa ON COALESCE(vi.ledger_id, v.party_id, v.account_id) = coa.id
             LEFT JOIN products p ON vi.product_id = p.id
             WHERE v.voucher_type = 'payment'
               AND (coa.account_type = 'Expense' OR coa.account_group IN ('Operating Expenses', 'Financial Expenses', 'Direct Expenses', 'Indirect Expenses', 'Discounts', 'Purchase Accounts'))
               AND v.deleted_at IS NULL
               {extra_where}
             ORDER BY v.voucher_date ASC, v.created_at ASC"
        )
    } else {
        format!(
            "SELECT
                v.voucher_no,
                v.voucher_date,
                coa.account_name,
                p.code || ' - ' || p.name AS product_name,
                CAST(vi.amount AS REAL) AS amount,
                COALESCE(vi.remarks, v.narration, '') AS narration
             FROM voucher_items vi
             JOIN vouchers v ON vi.voucher_id = v.id
             JOIN chart_of_accounts coa ON COALESCE(vi.ledger_id, v.party_id, v.account_id) = coa.id
             LEFT JOIN products p ON vi.product_id = p.id
             WHERE v.voucher_type = 'payment'
               AND (coa.account_type = 'Expense' OR coa.account_group IN ('Operating Expenses', 'Financial Expenses', 'Direct Expenses', 'Indirect Expenses', 'Discounts', 'Purchase Accounts'))
               AND v.voucher_date >= ?
               AND v.voucher_date <= ?
               AND v.deleted_at IS NULL
               {extra_where}
             ORDER BY v.voucher_date ASC, v.created_at ASC"
        )
    };

    let mut query = sqlx::query_as::<_, ExpenseDetail>(&query_str);
    if product_id.is_none() {
        query = query.bind(&from_date)
            .bind(&to_date);
    }
    for p in &params {
        query = query.bind(p);
    }

    query.fetch_all(&pool).await.map_err(|e| e.to_string())
}
