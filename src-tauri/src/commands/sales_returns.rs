use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

// ============= SALES RETURN =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct SalesReturn {
    pub id: String,
    pub voucher_no: String,
    pub voucher_date: String,
    pub customer_id: String,
    pub customer_name: String,
    pub party_type: String,
    pub reference: Option<String>,
    pub total_amount: f64,
    pub tax_amount: f64,
    pub grand_total: f64,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub narration: Option<String>,
    pub status: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct SalesReturnItem {
    pub id: String,
    pub voucher_id: String,
    pub product_id: String,
    pub product_name: String,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub final_quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub tax_rate: f64,
    pub tax_amount: f64,
    pub discount_percent: f64,
    pub discount_amount: f64,
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateSalesReturnItem {
    pub product_id: String,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub rate: f64,
    pub tax_rate: f64,
    pub discount_percent: Option<f64>,
    pub discount_amount: Option<f64>,
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateSalesReturn {
    pub customer_id: String,
    pub party_type: String,
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub items: Vec<CreateSalesReturnItem>,
}

async fn get_next_voucher_number(pool: &SqlitePool, voucher_type: &str) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let seq = sqlx::query_as::<_, (String, i64)>(
        "SELECT prefix, next_number FROM voucher_sequences WHERE voucher_type = ?",
    )
    .bind(voucher_type)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let voucher_no = format!("{}-{:04}", seq.0, seq.1);

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

#[tauri::command]
pub async fn get_sales_returns(pool: State<'_, SqlitePool>) -> Result<Vec<SalesReturn>, String> {
    sqlx::query_as::<_, SalesReturn>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as customer_id,
            coa.account_name as customer_name,
            v.party_type,
            v.reference,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total,
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at
         FROM vouchers v
         LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
         LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
         WHERE v.voucher_type = 'sales_return' AND v.deleted_at IS NULL
         GROUP BY v.id
         ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sales_return(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<SalesReturn, String> {
    let invoice = sqlx::query_as::<_, SalesReturn>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as customer_id,
            coa.account_name as customer_name,
            v.party_type,
            v.reference,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0) as grand_total,
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at
         FROM vouchers v
         LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
         LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
         WHERE v.id = ? AND v.voucher_type = 'sales_return' AND v.deleted_at IS NULL
         GROUP BY v.id",
    )
    .bind(id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Sales return not found".to_string())?;

    Ok(invoice)
}

#[tauri::command]
pub async fn get_sales_return_items(
    pool: State<'_, SqlitePool>,
    voucher_id: String,
) -> Result<Vec<SalesReturnItem>, String> {
    sqlx::query_as::<_, SalesReturnItem>(
        "SELECT vi.*, p.name as product_name 
         FROM voucher_items vi
         JOIN products p ON vi.product_id = p.id
         WHERE vi.voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_sales_return(
    pool: State<'_, SqlitePool>,
    invoice: CreateSalesReturn,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Generate voucher number
    let voucher_no = get_next_voucher_number(pool.inner(), "sales_return").await?;

    // Calculate totals
    let mut subtotal = 0.0;

    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        let discount_percent = item.discount_percent.unwrap_or(0.0);
        let discount_amount = if discount_percent > 0.0 {
            amount * (discount_percent / 100.0)
        } else {
            item.discount_amount.unwrap_or(0.0)
        };
        subtotal += amount - discount_amount;
    }

    // Apply discounts
    let discount_amount = invoice.discount_amount.unwrap_or(0.0);
    let total_amount = subtotal - discount_amount;

    // Create voucher
    let voucher_id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type, reference, subtotal, discount_rate, discount_amount, total_amount, narration, status)
         VALUES (?, ?, 'sales_return', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted')"
    )
    .bind(&voucher_id)
    .bind(&voucher_no)
    .bind(&invoice.voucher_date)
    .bind(&invoice.customer_id)
    .bind(&invoice.party_type)
    .bind(&invoice.reference)
    .bind(subtotal)
    .bind(invoice.discount_rate.unwrap_or(0.0))
    .bind(discount_amount)
    .bind(total_amount)
    .bind(&invoice.narration)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Insert items
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        let discount_percent = item.discount_percent.unwrap_or(0.0);
        let discount_amount = if discount_percent > 0.0 {
            amount * (discount_percent / 100.0)
        } else {
            item.discount_amount.unwrap_or(0.0)
        };
        let taxable_amount = amount - discount_amount;
        let tax_amount = taxable_amount * (item.tax_rate / 100.0);
        let item_id = Uuid::now_v7().to_string();

        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, rate, amount, tax_rate, tax_amount, discount_percent, discount_amount, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&item_id)
        .bind(&voucher_id)
        .bind(&item.product_id)
        .bind(&item.description)
        .bind(item.initial_quantity)
        .bind(item.count)
        .bind(item.deduction_per_unit)
        .bind(final_qty)
        .bind(item.rate)
        .bind(amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .bind(item.discount_percent.unwrap_or(0.0))
        .bind(item.discount_amount.unwrap_or(0.0))
        .bind(&item.remarks)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= CREATE JOURNAL ENTRIES =============

    let party_id = invoice.customer_id;

    // Calculate total tax
    let total_tax: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(tax_amount), 0) FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(&voucher_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Get account IDs
    // 4003: Sales Returns (Dr)
    let sales_return_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4003'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    // 2002: GST Output / Tax Payable (Dr - reducing liability)
    let tax_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '2002'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    // Party Account (Cr - reducing asset)
    let party_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE id = ?")
        .bind(&party_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Party account not found: {}", e))?;

    // Debit: Sales Returns (with subtotal)
    let je_id_1 = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, ?, 0, 'Sales Return (Goods returned)')",
    )
    .bind(&je_id_1)
    .bind(&voucher_id)
    .bind(&sales_return_account)
    .bind(subtotal)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Debit: Tax Payable (GST Output - Reversal)
    if total_tax > 0.0 {
        let je_id_2 = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Tax Reversal on Sales Return')",
        )
        .bind(&je_id_2)
        .bind(&voucher_id)
        .bind(&tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Credit: Accounts Receivable (Customer)
    // Amount to reduce = subtotal - discount + tax
    let amount_credit = subtotal - discount_amount + total_tax;
    let je_id_3 = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, ?, 'Credit Note issued to Customer')",
    )
    .bind(&je_id_3)
    .bind(&voucher_id)
    .bind(&party_account)
    .bind(amount_credit)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Discount Allowed (Reversal - Account 5007)
    if discount_amount > 0.0 {
        let discount_allowed_account: String =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5007'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        let je_id_4 = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Reversal of Discount Allowed')",
        )
        .bind(&je_id_4)
        .bind(&voucher_id)
        .bind(&discount_allowed_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= UPDATE STOCK (IN) =============
    let items_for_stock: Vec<(String, f64, i64, f64, f64)> = sqlx::query_as(
        "SELECT product_id, initial_quantity, count, rate, amount FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(&voucher_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for item in items_for_stock {
        let sm_id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount)
             VALUES (?, ?, ?, 'IN', ?, ?, ?, ?)"
        )
        .bind(&sm_id)
        .bind(&voucher_id)
        .bind(&item.0)
        .bind(item.1)
        .bind(item.2)
        .bind(item.3)
        .bind(item.4)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(voucher_id)
}

#[tauri::command]
pub async fn update_sales_return(
    pool: State<'_, SqlitePool>,
    id: String,
    invoice: CreateSalesReturn,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Calculate totals
    let mut subtotal = 0.0;
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        let discount_percent = item.discount_percent.unwrap_or(0.0);
        let discount_amount = if discount_percent > 0.0 {
            amount * (discount_percent / 100.0)
        } else {
            item.discount_amount.unwrap_or(0.0)
        };
        subtotal += amount - discount_amount;
    }

    let discount_amount = invoice.discount_amount.unwrap_or(0.0);
    let total_amount = subtotal - discount_amount;

    // Update Header
    sqlx::query(
        "UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, party_type = ?, reference = ?, subtotal = ?, discount_rate = ?, discount_amount = ?, total_amount = ?, narration = ?, status = 'posted'
         WHERE id = ? AND voucher_type = 'sales_return'"
    )
    .bind(&invoice.voucher_date)
    .bind(invoice.customer_id.clone())
    .bind(&invoice.party_type)
    .bind(&invoice.reference)
    .bind(subtotal)
    .bind(invoice.discount_rate.unwrap_or(0.0))
    .bind(discount_amount)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Cleanup old data
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Re-insert Items
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        let discount_percent = item.discount_percent.unwrap_or(0.0);
        let discount_amount = if discount_percent > 0.0 {
            amount * (discount_percent / 100.0)
        } else {
            item.discount_amount.unwrap_or(0.0)
        };
        let taxable_amount = amount - discount_amount;
        let tax_amount = taxable_amount * (item.tax_rate / 100.0);
        let item_id = Uuid::now_v7().to_string();

        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, rate, amount, tax_rate, tax_amount, discount_percent, discount_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&item_id)
        .bind(&id)
        .bind(item.product_id.clone())
        .bind(&item.description)
        .bind(item.initial_quantity)
        .bind(item.count)
        .bind(item.deduction_per_unit)
        .bind(final_qty)
        .bind(item.rate)
        .bind(amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .bind(item.discount_percent.unwrap_or(0.0))
        .bind(item.discount_amount.unwrap_or(0.0))
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Re-create Journal Entries
    let total_tax: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(tax_amount), 0) FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(&id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let sales_return_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4003'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let tax_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '2002'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let party_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE id = ?")
        .bind(invoice.customer_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let je_id_1 = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, ?, 0, 'Sales Return (Goods returned)')",
    )
    .bind(&je_id_1)
    .bind(&id)
    .bind(&sales_return_account)
    .bind(subtotal)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if total_tax > 0.0 {
        let je_id_2 = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Tax Reversal on Sales Return')",
        )
        .bind(&je_id_2)
        .bind(&id)
        .bind(&tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    let amount_credit = subtotal - discount_amount + total_tax;
    let je_id_3 = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, ?, 'Credit Note issued to Customer')",
    )
    .bind(&je_id_3)
    .bind(&id)
    .bind(&party_account)
    .bind(amount_credit)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if discount_amount > 0.0 {
        let discount_allowed_account: String =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5007'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        let je_id_4 = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Reversal of Discount Allowed')",
        )
        .bind(&je_id_4)
        .bind(&id)
        .bind(&discount_allowed_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Re-create Stock Movements (IN)
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        let sm_id = Uuid::now_v7().to_string();

        sqlx::query(
            "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount)
             VALUES (?, ?, ?, 'IN', ?, ?, ?, ?)"
        )
        .bind(&sm_id)
        .bind(&id)
        .bind(item.product_id.clone())
        .bind(item.initial_quantity)
        .bind(item.count)
        .bind(item.rate)
        .bind(amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_sales_return(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Delete related table data
    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Soft delete
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'sales_return'")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}
