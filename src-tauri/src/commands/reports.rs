use chrono;
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
    account_id: String,
    from_date: Option<String>,
    to_date: String,
) -> Result<LedgerReport, String> {
    let account = sqlx::query_as::<_, (f64, String)>(
        "SELECT CAST(opening_balance AS REAL), opening_balance_type FROM chart_of_accounts WHERE id = ?"
    )
    .bind(&account_id)
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
        .bind(&account_id)
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

// ============= BALANCE SHEET =============
#[derive(Serialize, Deserialize)]
pub struct BSAccount {
    pub account_name: String,
    pub account_code: String,
    pub amount: f64,
}

#[derive(Serialize, Deserialize)]
pub struct BalanceSheetData {
    pub assets: Vec<BSAccount>,
    pub liabilities: Vec<BSAccount>,
    pub equity: Vec<BSAccount>,
    pub total_assets: f64,
    pub total_liabilities: f64,
    pub total_equity: f64,
}

#[tauri::command]
pub async fn get_balance_sheet(
    pool: State<'_, SqlitePool>,
    as_on_date: String,
) -> Result<BalanceSheetData, String> {
    let query = "
        SELECT 
            coa.account_name,
            coa.account_code,
            coa.account_type,
            CAST(coa.opening_balance AS REAL) as opening_balance,
            coa.opening_balance_type,
            CAST(COALESCE(SUM(je.debit), 0) AS REAL) as total_debit,
            CAST(COALESCE(SUM(je.credit), 0) AS REAL) as total_credit
        FROM chart_of_accounts coa
        LEFT JOIN journal_entries je ON coa.id = je.account_id
        LEFT JOIN vouchers v ON je.voucher_id = v.id AND v.voucher_date <= ? AND v.deleted_at IS NULL
        WHERE coa.deleted_at IS NULL
        GROUP BY coa.id
    ";

    let rows = sqlx::query_as::<_, (String, String, String, f64, String, f64, f64)>(query)
        .bind(&as_on_date)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let mut assets = Vec::new();
    let mut liabilities = Vec::new();
    let mut equity = Vec::new();
    let mut total_assets = 0.0;
    let mut total_liabilities = 0.0;
    let mut total_equity = 0.0;

    for (name, code, acc_type, op_bal, op_type, dr, cr) in rows {
        let balance = if acc_type == "Asset" {
            if op_type == "Dr" {
                dr - cr + op_bal
            } else {
                dr - cr - op_bal
            }
        } else if acc_type == "Liability" || acc_type == "Equity" {
            if op_type == "Cr" {
                cr - dr + op_bal
            } else {
                cr - dr - op_bal
            }
        } else {
            0.0
        };

        // Skip zero balances
        if balance.abs() < 0.01 {
            continue;
        }

        let account = BSAccount {
            account_name: name,
            account_code: code,
            amount: balance.abs(),
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

    // Calculate Net Profit for Balance Sheet (Retained Earnings)
    let pl_query = "
        SELECT 
            coa.account_type,
            CAST(COALESCE(SUM(je.debit), 0) AS REAL) as dr,
            CAST(COALESCE(SUM(je.credit), 0) AS REAL) as cr
        FROM chart_of_accounts coa
        JOIN journal_entries je ON coa.id = je.account_id
        JOIN vouchers v ON je.voucher_id = v.id
        WHERE v.voucher_date <= ? AND v.deleted_at IS NULL
        AND coa.account_type IN ('Income', 'Expense')
        GROUP BY coa.account_type
    ";

    let pl_rows = sqlx::query_as::<_, (String, f64, f64)>(pl_query)
        .bind(&as_on_date)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let mut net_profit = 0.0;
    for (acc_type, dr, cr) in pl_rows {
        if acc_type == "Income" {
            net_profit += cr - dr;
        } else {
            net_profit -= dr - cr;
        }
    }

    if net_profit != 0.0 {
        total_equity += net_profit;
        equity.push(BSAccount {
            account_name: "Net Profit for the Period".to_string(),
            account_code: "NET_PROFIT".to_string(),
            amount: net_profit,
        });
    }

    Ok(BalanceSheetData {
        assets,
        liabilities,
        equity,
        total_assets,
        total_liabilities,
        total_equity,
    })
}

// ============= PROFIT & LOSS =============
#[derive(Serialize, Deserialize)]
pub struct ProfitLossData {
    pub income: Vec<PLAccount>,
    pub expenses: Vec<PLAccount>,
    pub total_income: f64,
    pub total_expenses: f64,
    pub net_profit: f64,
}

#[derive(Serialize, Deserialize)]
pub struct PLAccount {
    pub account_name: String,
    pub account_code: String,
    pub amount: f64,
}

#[tauri::command]
pub async fn get_profit_loss(
    pool: State<'_, SqlitePool>,
    from_date: String,
    to_date: String,
) -> Result<ProfitLossData, String> {
    let query = "
        SELECT 
            coa.account_name,
            coa.account_code,
            coa.account_type,
            CAST(COALESCE(SUM(je.debit), 0) AS REAL) as dr,
            CAST(COALESCE(SUM(je.credit), 0) AS REAL) as cr
        FROM chart_of_accounts coa
        JOIN journal_entries je ON coa.id = je.account_id
        JOIN vouchers v ON je.voucher_id = v.id
        WHERE v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
        AND coa.account_type IN ('Income', 'Expense')
        GROUP BY coa.id
    ";

    let rows = sqlx::query_as::<_, (String, String, String, f64, f64)>(query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let mut income = Vec::new();
    let mut expenses = Vec::new();
    let mut total_income = 0.0;
    let mut total_expenses = 0.0;

    for (name, code, acc_type, dr, cr) in rows {
        if acc_type == "Income" {
            let amount = cr - dr;
            if amount.abs() >= 0.01 {
                total_income += amount;
                income.push(PLAccount {
                    account_name: name,
                    account_code: code,
                    amount,
                });
            }
        } else {
            let amount = dr - cr;
            if amount.abs() >= 0.01 {
                total_expenses += amount;
                expenses.push(PLAccount {
                    account_name: name,
                    account_code: code,
                    amount,
                });
            }
        }
    }

    Ok(ProfitLossData {
        income,
        expenses,
        total_income,
        total_expenses,
        net_profit: total_income - total_expenses,
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
    pool: State<'_, SqlitePool>,
    from_date: String,
    to_date: String,
) -> Result<CashFlowData, String> {
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
        .fetch_one(pool.inner())
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
        .fetch_one(pool.inner())
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
        .fetch_one(pool.inner())
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
        .fetch_one(pool.inner())
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
        .fetch_one(pool.inner())
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
        .fetch_one(pool.inner())
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
        .fetch_one(pool.inner())
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
        AND coa.account_name NOT IN ('Cash', 'Accounts Receivable', 'Cash Sale', 'Bank Account')
        AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
    ";

    let net_investing: f64 = sqlx::query_scalar(investing_query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_one(pool.inner())
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
        AND coa.account_name NOT IN ('Accounts Payable', 'Accounts Receivable', 'Cash Sale', 'Cash Purchase')
        AND v.voucher_type NOT IN ('sales_invoice', 'purchase_invoice', 'receipt', 'payment')
        AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
    ";

    let net_financing: f64 = sqlx::query_scalar(financing_query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_one(pool.inner())
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
    pool: State<'_, SqlitePool>,
    from_date: String,
    to_date: String,
) -> Result<Vec<DayBookEntry>, String> {
    let query = "
        SELECT 
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
            je.narration
        FROM journal_entries je
        JOIN vouchers v ON je.voucher_id = v.id
        JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE v.voucher_date >= ? AND v.voucher_date <= ? AND v.deleted_at IS NULL
        ORDER BY v.voucher_date ASC, v.id ASC, je.id ASC
    ";

    sqlx::query_as::<_, DayBookEntry>(query)
        .bind(&from_date)
        .bind(&to_date)
        .fetch_all(pool.inner())
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
    pool: State<'_, SqlitePool>,
    party_type: String,
    as_on_date: String,
) -> Result<Vec<PartyOutstanding>, String> {
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
                SUM(v.total_amount) as total_amount,
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
            .fetch_all(pool.inner())
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
    pool: State<'_, SqlitePool>,
    party_id: String, // This is coa.id
    party_type: String,
    as_on_date: String,
) -> Result<Vec<InvoiceDetail>, String> {
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
            CAST(v.total_amount AS REAL) as total_amount,
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
        .fetch_all(pool.inner())
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
    pool: State<'_, SqlitePool>,
    group_id: Option<String>,
    as_on_date: String,
) -> Result<Vec<StockSummary>, String> {
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
                    WHEN sm.movement_type = 'IN' THEN sm.quantity
                    WHEN sm.movement_type = 'OUT' THEN -sm.quantity
                    ELSE 0
                END
            ), 0) AS REAL) as current_stock,
            CAST(COALESCE(
                (SELECT SUM(rate * quantity) / NULLIF(SUM(quantity), 0)
                 FROM stock_movements sm2
                 JOIN vouchers v2 ON sm2.voucher_id = v2.id
                 WHERE sm2.product_id = p.id 
                 AND sm2.movement_type = 'IN'
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
        WHERE p.deleted_at IS NULL {}
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
    .fetch_all(pool.inner())
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
    pool: State<'_, SqlitePool>,
    product_id: String,
    from_date: Option<String>,
    to_date: String,
) -> Result<Vec<StockMovement>, String> {
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
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

        opening_balance = balance.unwrap_or(0.0);
    }

    let query = format!(
        "SELECT 
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
        f64,
        f64,
        f64,
        Option<String>,
    )> = sqlx::query_as(query.as_str())
        .bind(product_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let mut running_balance = opening_balance;
    let result = movements
        .into_iter()
        .map(
            |(date, voucher_no, voucher_type, movement_type, qty, rate, amt, party)| {
                if movement_type == "IN" {
                    running_balance += qty;
                } else {
                    running_balance -= qty;
                }

                StockMovement {
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
    pool: State<'_, SqlitePool>,
    from_date: String,
    to_date: String,
) -> Result<DashboardMetrics, String> {
    // Get revenue (sales)
    let revenue: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(total_amount), 0) AS REAL)
         FROM vouchers
         WHERE voucher_type = 'sales_invoice'
         AND voucher_date >= ? AND voucher_date <= ?
         AND deleted_at IS NULL",
    )
    .bind(&from_date)
    .bind(&to_date)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    // Get expenses (purchases)
    let expenses: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(total_amount), 0) AS REAL)
         FROM vouchers
         WHERE voucher_type = 'purchase_invoice'
         AND voucher_date >= ? AND voucher_date <= ?
         AND deleted_at IS NULL",
    )
    .bind(&from_date)
    .bind(&to_date)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let total_revenue = revenue.unwrap_or(0.0);
    let total_expenses = expenses.unwrap_or(0.0);

    // Get stock value
    let stock_value: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(
            (SELECT COALESCE(SUM(quantity), 0) FROM stock_movements sm
             JOIN vouchers v ON sm.voucher_id = v.id
             WHERE sm.product_id = p.id AND sm.movement_type = 'IN'
             AND v.deleted_at IS NULL) -
            (SELECT COALESCE(SUM(quantity), 0) FROM stock_movements sm
             JOIN vouchers v ON sm.voucher_id = v.id
             WHERE sm.product_id = p.id AND sm.movement_type = 'OUT'
             AND v.deleted_at IS NULL)
        ) * p.sales_rate, 0) AS REAL)
         FROM products p WHERE p.deleted_at IS NULL",
    )
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    // Get cash balance (sum of cash/bank accounts)
    let cash_balance: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(
            CASE
                WHEN coa.opening_balance_type = 'Dr' THEN coa.opening_balance ELSE -coa.opening_balance
            END +
            COALESCE((SELECT SUM(je.debit - je.credit)
                      FROM journal_entries je
                      JOIN vouchers v ON je.voucher_id = v.id
                      WHERE je.account_id = coa.id AND v.deleted_at IS NULL), 0)
        ), 0) AS REAL)
         FROM chart_of_accounts coa
         WHERE coa.account_group IN ('Cash', 'Bank Accounts')
         AND coa.deleted_at IS NULL",
    )
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    // Get receivables
    let receivables: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(
            CASE
                WHEN coa.opening_balance_type = 'Dr' THEN coa.opening_balance ELSE -coa.opening_balance
            END +
            COALESCE((SELECT SUM(je.debit - je.credit)
                      FROM journal_entries je
                      JOIN vouchers v ON je.voucher_id = v.id
                      WHERE je.account_id = coa.id AND v.deleted_at IS NULL), 0)
        ), 0) AS REAL)
         FROM chart_of_accounts coa
         WHERE coa.account_group = 'Accounts Receivable'
         AND coa.deleted_at IS NULL",
    )
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    // Get payables
    let payables: Option<f64> = sqlx::query_scalar(
        "SELECT CAST(COALESCE(SUM(
            CASE
                WHEN coa.opening_balance_type = 'Cr' THEN coa.opening_balance ELSE -coa.opening_balance
            END +
            COALESCE((SELECT SUM(je.credit - je.debit)
                      FROM journal_entries je
                      JOIN vouchers v ON je.voucher_id = v.id
                      WHERE je.account_id = coa.id AND v.deleted_at IS NULL), 0)
        ), 0) AS REAL)
         FROM chart_of_accounts coa
         WHERE coa.account_group = 'Accounts Payable'
         AND coa.deleted_at IS NULL",
    )
    .fetch_optional(pool.inner())
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
        "SELECT CAST(COALESCE(SUM(total_amount), 0) AS REAL)
         FROM vouchers
         WHERE voucher_type = 'sales_invoice'
         AND voucher_date >= ? AND voucher_date <= ?
         AND deleted_at IS NULL",
    )
    .bind(prev_period_from.to_string())
    .bind(prev_period_to.to_string())
    .fetch_optional(pool.inner())
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
    pool: State<'_, SqlitePool>,
    days: i32,
) -> Result<Vec<RevenueTrend>, String> {
    let end_date = chrono::Local::now().naive_local().date();
    let start_date = end_date - chrono::Duration::days(days as i64);

    let mut trends = Vec::new();
    let mut current_date = start_date;

    while current_date <= end_date {
        let date_str = current_date.to_string();

        let revenue: Option<f64> = sqlx::query_scalar(
            "SELECT CAST(COALESCE(SUM(total_amount), 0) AS REAL)
             FROM vouchers
             WHERE voucher_type = 'sales_invoice'
             AND voucher_date = ?
             AND deleted_at IS NULL",
        )
        .bind(&date_str)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

        let expenses: Option<f64> = sqlx::query_scalar(
            "SELECT CAST(COALESCE(SUM(total_amount), 0) AS REAL)
             FROM vouchers
             WHERE voucher_type = 'purchase_invoice'
             AND voucher_date = ?
             AND deleted_at IS NULL",
        )
        .bind(&date_str)
        .fetch_optional(pool.inner())
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
    pool: State<'_, SqlitePool>,
    limit: i32,
    from_date: String,
    to_date: String,
) -> Result<Vec<TopProduct>, String> {
    let query = "
        SELECT
            p.name as product_name,
            CAST(SUM(sm.quantity) AS REAL) as total_quantity,
            CAST(SUM(sm.amount) AS REAL) as total_revenue
        FROM stock_movements sm
        JOIN products p ON sm.product_id = p.id
        JOIN vouchers v ON sm.voucher_id = v.id
        WHERE sm.movement_type = 'OUT'
        AND v.voucher_date >= ? AND v.voucher_date <= ?
        AND v.deleted_at IS NULL
        GROUP BY p.id, p.name
        ORDER BY total_revenue DESC
        LIMIT ?
    ";

    sqlx::query_as::<_, TopProduct>(query)
        .bind(&from_date)
        .bind(&to_date)
        .bind(limit)
        .fetch_all(pool.inner())
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
    pool: State<'_, SqlitePool>,
    days: i32,
) -> Result<Vec<CashFlowSummary>, String> {
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
        .fetch_optional(pool.inner())
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
        .fetch_optional(pool.inner())
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
    pool: State<'_, SqlitePool>,
    threshold: f64,
) -> Result<Vec<StockAlert>, String> {
    let query = "
        SELECT
            p.id as product_id,
            p.name as product_name,
            CAST(COALESCE(SUM(
                CASE
                    WHEN sm.movement_type = 'IN' THEN sm.quantity
                    WHEN sm.movement_type = 'OUT' THEN -sm.quantity
                    ELSE 0
                END
            ), 0) AS REAL) as current_stock,
            u.symbol as unit_symbol
        FROM products p
        JOIN units u ON p.unit_id = u.id
        LEFT JOIN stock_movements sm ON p.id = sm.product_id
        LEFT JOIN vouchers v ON sm.voucher_id = v.id AND v.deleted_at IS NULL
        WHERE p.deleted_at IS NULL
        GROUP BY p.id
        HAVING current_stock < ? AND current_stock >= 0
        ORDER BY current_stock ASC
        LIMIT 10
    ";

    sqlx::query_as::<_, StockAlert>(query)
        .bind(threshold)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct RecentActivity {
    pub voucher_id: String,
    pub voucher_no: String,
    pub voucher_type: String,
    pub voucher_date: String,
    pub party_name: Option<String>,
    pub amount: f64,
}

#[tauri::command]
pub async fn get_recent_activity(
    pool: State<'_, SqlitePool>,
    limit: i32,
) -> Result<Vec<RecentActivity>, String> {
    let query = "
        SELECT
            v.id as voucher_id,
            v.voucher_no,
            v.voucher_type,
            v.voucher_date,
            coa.account_name as party_name,
            CAST(v.total_amount AS REAL) as amount
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        WHERE v.deleted_at IS NULL
        ORDER BY v.voucher_date DESC, v.id DESC
        LIMIT ?
    ";

    sqlx::query_as::<_, RecentActivity>(query)
        .bind(limit)
        .fetch_all(pool.inner())
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
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ProductGroupData>, String> {
    let query = "
        SELECT 
            COALESCE(pg.name, 'Ungrouped') as group_name,
            COUNT(DISTINCT p.id) as product_count,
            CAST(COALESCE(SUM(
                (SELECT COALESCE(SUM(quantity), 0) FROM stock_movements sm
                 JOIN vouchers v ON sm.voucher_id = v.id
                 WHERE sm.product_id = p.id AND sm.movement_type = 'IN'
                 AND v.deleted_at IS NULL) -
                (SELECT COALESCE(SUM(quantity), 0) FROM stock_movements sm
                 JOIN vouchers v ON sm.voucher_id = v.id
                 WHERE sm.product_id = p.id AND sm.movement_type = 'OUT'
                 AND v.deleted_at IS NULL)
            ) * p.sales_rate, 0) AS REAL) as total_stock_value
        FROM products p
        LEFT JOIN product_groups pg ON p.group_id = pg.id
        WHERE p.deleted_at IS NULL
        GROUP BY pg.id, pg.name
        ORDER BY total_stock_value DESC
    ";

    sqlx::query_as::<_, ProductGroupData>(query)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}
