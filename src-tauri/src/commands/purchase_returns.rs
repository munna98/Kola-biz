use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

// ============= PURCHASE RETURN =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PurchaseReturn {
    pub id: i64,
    pub voucher_no: String,
    pub voucher_date: String,
    pub supplier_id: i64,
    pub supplier_name: String,
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
pub struct PurchaseReturnItem {
    pub id: i64,
    pub voucher_id: i64,
    pub product_id: i64,
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
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct CreatePurchaseReturnItem {
    pub product_id: i64,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub rate: f64,
    pub tax_rate: f64,
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct CreatePurchaseReturn {
    pub supplier_id: i64,
    pub party_type: String,
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub items: Vec<CreatePurchaseReturnItem>,
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
pub async fn get_purchase_returns(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<PurchaseReturn>, String> {
    sqlx::query_as::<_, PurchaseReturn>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as supplier_id,
            coa.account_name as supplier_name,
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
         WHERE v.voucher_type = 'purchase_return' AND v.deleted_at IS NULL
         GROUP BY v.id
         ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_purchase_return(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<PurchaseReturn, String> {
    let invoice = sqlx::query_as::<_, PurchaseReturn>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as supplier_id,
            coa.account_name as supplier_name,
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
         WHERE v.id = ? AND v.voucher_type = 'purchase_return' AND v.deleted_at IS NULL
         GROUP BY v.id",
    )
    .bind(id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Purchase return not found".to_string())?;

    Ok(invoice)
}

#[tauri::command]
pub async fn get_purchase_return_items(
    pool: State<'_, SqlitePool>,
    voucher_id: i64,
) -> Result<Vec<PurchaseReturnItem>, String> {
    sqlx::query_as::<_, PurchaseReturnItem>(
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
pub async fn create_purchase_return(
    pool: State<'_, SqlitePool>,
    invoice: CreatePurchaseReturn,
) -> Result<i64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Generate voucher number
    let voucher_no = get_next_voucher_number(pool.inner(), "purchase_return").await?;

    // Calculate totals
    let mut subtotal = 0.0;

    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        subtotal += amount;
    }

    // Apply discounts
    let discount_amount = invoice.discount_amount.unwrap_or(0.0);
    let total_amount = subtotal - discount_amount;

    // Create voucher
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, party_id, party_type, reference, subtotal, discount_rate, discount_amount, total_amount, narration, status)
         VALUES (?, 'purchase_return', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted')"
    )
    .bind(&voucher_no)
    .bind(&invoice.voucher_date)
    .bind(invoice.supplier_id)
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

    let voucher_id = result.last_insert_rowid();

    // Insert items
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        let tax_amount = amount * (item.tax_rate / 100.0);

        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, rate, amount, tax_rate, tax_amount, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(voucher_id)
        .bind(item.product_id)
        .bind(&item.description)
        .bind(item.initial_quantity)
        .bind(item.count)
        .bind(item.deduction_per_unit)
        .bind(final_qty)
        .bind(item.rate)
        .bind(amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .bind(&item.remarks)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= CREATE JOURNAL ENTRIES =============

    let party_id = invoice.supplier_id;

    // Calculate total tax
    let total_tax: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(tax_amount), 0) FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Get account IDs
    // 5003: Purchase Returns (Cr - Contra Expense)
    let purchase_return_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5003'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    // 1005: GST Input / Tax Receivable (Cr - Reversal)
    let tax_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    // Party Account (Dr - Reducing Accounts Payable)
    let party_account: i64 = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE id = ?")
        .bind(party_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Party account not found: {}", e))?;

    // Credit: Purchase Returns (with subtotal)
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, 0, ?, 'Purchase Return (Goods returned)')",
    )
    .bind(voucher_id)
    .bind(purchase_return_account)
    .bind(subtotal)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Tax Input (GST Input - Reversal)
    if total_tax > 0.0 {
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, 0, ?, 'Tax Reversal on Purchase Return')",
        )
        .bind(voucher_id)
        .bind(tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Debit: Supplier (Accounts Payable)
    // Amount to reduce = subtotal - discount + tax
    let amount_debit = subtotal - discount_amount + total_tax;
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, 'Debit Note issued to Supplier')",
    )
    .bind(voucher_id)
    .bind(party_account)
    .bind(amount_debit)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Debit: Discount Received (Reversal - Account 4004)
    if discount_amount > 0.0 {
        let discount_received_account: i64 =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4004'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, 'Reversal of Discount Received')",
        )
        .bind(voucher_id)
        .bind(discount_received_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= UPDATE STOCK (OUT) =============
    let items_for_stock: Vec<(i64, f64, i64, f64, f64)> = sqlx::query_as(
        "SELECT product_id, initial_quantity, count, rate, amount FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for item in items_for_stock {
        sqlx::query(
            "INSERT INTO stock_movements (voucher_id, product_id, movement_type, quantity, count, rate, amount)
             VALUES (?, ?, 'OUT', ?, ?, ?, ?)"
        )
        .bind(voucher_id)
        .bind(item.0)
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
pub async fn update_purchase_return(
    pool: State<'_, SqlitePool>,
    id: i64,
    invoice: CreatePurchaseReturn,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Calculate totals
    let mut subtotal = 0.0;
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        subtotal += amount;
    }

    let discount_amount = invoice.discount_amount.unwrap_or(0.0);
    let total_amount = subtotal - discount_amount;

    // Update Header
    sqlx::query(
        "UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, party_type = ?, reference = ?, subtotal = ?, discount_rate = ?, discount_amount = ?, total_amount = ?, narration = ?, status = 'posted'
         WHERE id = ? AND voucher_type = 'purchase_return'"
    )
    .bind(&invoice.voucher_date)
    .bind(invoice.supplier_id)
    .bind(&invoice.party_type)
    .bind(&invoice.reference)
    .bind(subtotal)
    .bind(invoice.discount_rate.unwrap_or(0.0))
    .bind(discount_amount)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Cleanup old data
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Re-insert Items
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;
        let tax_amount = amount * (item.tax_rate / 100.0);

        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, rate, amount, tax_rate, tax_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(id)
        .bind(item.product_id)
        .bind(&item.description)
        .bind(item.initial_quantity)
        .bind(item.count)
        .bind(item.deduction_per_unit)
        .bind(final_qty)
        .bind(item.rate)
        .bind(amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Re-create Journal Entries
    let total_tax: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(tax_amount), 0) FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let purchase_return_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5003'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let tax_account: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let party_account: i64 = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE id = ?")
        .bind(invoice.supplier_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, 0, ?, 'Purchase Return (Goods returned)')",
    )
    .bind(id)
    .bind(purchase_return_account)
    .bind(subtotal)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if total_tax > 0.0 {
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, 0, ?, 'Tax Reversal on Purchase Return')",
        )
        .bind(id)
        .bind(tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    let amount_debit = subtotal - discount_amount + total_tax;
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, 'Debit Note issued to Supplier')",
    )
    .bind(id)
    .bind(party_account)
    .bind(amount_debit)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    if discount_amount > 0.0 {
        let discount_received_account: i64 =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4004'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, 'Reversal of Discount Received')",
        )
        .bind(id)
        .bind(discount_received_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Re-create Stock Movements (OUT)
    for item in &invoice.items {
        let final_qty = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_qty * item.rate;

        sqlx::query(
            "INSERT INTO stock_movements (voucher_id, product_id, movement_type, quantity, count, rate, amount)
             VALUES (?, ?, 'OUT', ?, ?, ?, ?)"
        )
        .bind(id)
        .bind(item.product_id)
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
pub async fn delete_purchase_return(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Delete related table data
    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Soft delete
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'purchase_return'")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}
