use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

// ============= PURCHASE INVOICE =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PurchaseInvoice {
    pub id: String,
    pub voucher_no: String,
    pub voucher_date: String,
    pub supplier_id: String,
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
    pub created_by_name: Option<String>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PurchaseInvoiceItem {
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
pub struct CreatePurchaseInvoiceItem {
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
pub struct CreatePurchaseInvoice {
    pub supplier_id: String,
    pub party_type: String,
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub items: Vec<CreatePurchaseInvoiceItem>,
    pub user_id: Option<String>,
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
pub async fn get_purchase_invoices(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<PurchaseInvoice>, String> {
    let invoices = sqlx::query_as::<_, PurchaseInvoice>(
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
            v.deleted_at,
            u.full_name as created_by_name
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        LEFT JOIN users u ON v.created_by = u.id
        WHERE v.voucher_type = 'purchase_invoice' AND v.deleted_at IS NULL
        GROUP BY v.id
        ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(invoices)
}

#[tauri::command]
pub async fn get_purchase_invoice(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<PurchaseInvoice, String> {
    let invoice = sqlx::query_as::<_, PurchaseInvoice>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as supplier_id,
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
            v.deleted_at,
            u.full_name as created_by_name
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        LEFT JOIN users u ON v.created_by = u.id
        WHERE v.id = ? AND v.voucher_type = 'purchase_invoice' AND v.deleted_at IS NULL
        GROUP BY v.id",
    )
    .bind(id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Purchase invoice not found".to_string())?;

    Ok(invoice)
}

#[tauri::command]
pub async fn get_purchase_invoice_items(
    pool: State<'_, SqlitePool>,
    voucher_id: String,
) -> Result<Vec<PurchaseInvoiceItem>, String> {
    sqlx::query_as::<_, PurchaseInvoiceItem>(
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
pub async fn create_purchase_invoice(
    pool: State<'_, SqlitePool>,
    invoice: CreatePurchaseInvoice,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Generate voucher number
    let voucher_no = get_next_voucher_number(pool.inner(), "purchase_invoice").await?;

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

    let voucher_id = Uuid::now_v7().to_string();

    // Create voucher
    let _ = sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type, reference, subtotal, discount_rate, discount_amount, total_amount, narration, status, created_by)
         VALUES (?, ?, 'purchase_invoice', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?)"
    )
    .bind(&voucher_id)
    .bind(&voucher_no)
    .bind(&invoice.voucher_date)
    .bind(&invoice.supplier_id)
    .bind(&invoice.party_type)
    .bind(&invoice.reference)
    .bind(subtotal)
    .bind(invoice.discount_rate.unwrap_or(0.0))
    .bind(discount_amount)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(&invoice.user_id)
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

    let party_id = invoice.supplier_id;

    // Calculate total tax
    let total_tax: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(tax_amount), 0) FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(&voucher_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Get account IDs
    let purchases_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5001'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let tax_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let party_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE id = ?")
        .bind(&party_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Party account not found: {}", e))?;

    // Debit: Purchases Account (with subtotal, before discount)
    let je_id_1 = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, ?, 0, 'Purchase of goods')",
    )
    .bind(&je_id_1)
    .bind(&voucher_id)
    .bind(&purchases_account)
    .bind(subtotal)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Debit: Tax Receivable (GST Input)
    if total_tax > 0.0 {
        let je_id_2 = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Input tax on purchases')",
        )
        .bind(&je_id_2)
        .bind(&voucher_id)
        .bind(&tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Credit: Accounts Payable (Supplier)
    // Amount owed = subtotal - discount + tax
    let amount_payable = subtotal - discount_amount + total_tax;
    let je_id_3 = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, ?, 'Amount payable to supplier')",
    )
    .bind(&je_id_3)
    .bind(&voucher_id)
    .bind(&party_account)
    .bind(amount_payable)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Discount Received (if discount applied)
    if discount_amount > 0.0 {
        let discount_account: i64 =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4004'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, 0, ?, 'Discount received from supplier')",
        )
        .bind(&voucher_id)
        .bind(discount_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Create stock movements
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
pub async fn delete_purchase_invoice(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get all payment/receipt vouchers created from this invoice
    let related_payment_ids: Vec<String> =
        sqlx::query_scalar("SELECT id FROM vouchers WHERE created_from_invoice_id = ?")
            .bind(&id)
            .fetch_all(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    // Delete related data for each payment/receipt voucher created from this invoice
    for payment_id in &related_payment_ids {
        // Delete journal entries for the payment
        sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
            .bind(payment_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // Delete voucher items for the payment
        sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
            .bind(payment_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // Delete payment allocations where this payment voucher is involved
        sqlx::query("DELETE FROM payment_allocations WHERE payment_voucher_id = ?")
            .bind(payment_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // Delete the payment voucher itself
        sqlx::query("DELETE FROM vouchers WHERE id = ?")
            .bind(payment_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Delete related journal entries for the invoice
    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Delete related stock movements
    sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Delete related payment allocations for the invoice
    sqlx::query("DELETE FROM payment_allocations WHERE invoice_voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Delete related voucher items
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Soft delete the voucher
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'purchase_invoice'")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn update_purchase_invoice(
    pool: State<'_, SqlitePool>,
    id: String,
    invoice: CreatePurchaseInvoice,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get old party info before update
    let old_party: (String, String) =
        sqlx::query_as("SELECT party_id, party_type FROM vouchers WHERE id = ?")
            .bind(&id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    // Check if party is changing
    let party_changed = old_party.0 != invoice.supplier_id || old_party.1 != invoice.party_type;

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

    // Update voucher header
    sqlx::query(
        "UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, party_type = ?, reference = ?, subtotal = ?, discount_rate = ?, discount_amount = ?, total_amount = ?, narration = ?, status = 'posted'
         WHERE id = ? AND voucher_type = 'purchase_invoice'"
    )
    .bind(&invoice.voucher_date)
    .bind(&invoice.supplier_id)
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

    // Update payment allocations if party changed
    if party_changed {
        sqlx::query(
            "UPDATE payment_allocations 
             SET party_id = ?, party_type = ? 
             WHERE invoice_voucher_id = ?",
        )
        .bind(&invoice.supplier_id)
        .bind(&invoice.party_type)
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Also update the payment/receipt vouchers that are allocated to this invoice
        sqlx::query(
            "UPDATE vouchers 
             SET party_id = ?, party_type = ? 
             WHERE id IN (
                 SELECT payment_voucher_id FROM payment_allocations 
                 WHERE invoice_voucher_id = ?
             )",
        )
        .bind(&invoice.supplier_id)
        .bind(&invoice.party_type)
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Update journal entries for payment vouchers to use new party account
        sqlx::query(
            "UPDATE journal_entries 
             SET account_id = ? 
             WHERE voucher_id IN (
                 SELECT payment_voucher_id FROM payment_allocations 
                 WHERE invoice_voucher_id = ?
             )
             AND account_id = ?",
        )
        .bind(&invoice.supplier_id)
        .bind(&id)
        .bind(&old_party.0)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Delete existing related data
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

    // Re-insert items
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
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Calculate total tax from new items
    let total_tax: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(tax_amount), 0) FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(&id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Get account IDs (same as create)
    let purchases_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5001'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let tax_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let party_id = invoice.supplier_id;

    let party_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE id = ?")
        .bind(&party_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Party account not found: {}", e))?;

    // Debit: Purchases Account (with subtotal, before discount)
    let je_id_1 = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, ?, 0, 'Purchase of goods')",
    )
    .bind(&je_id_1)
    .bind(&id)
    .bind(&purchases_account)
    .bind(subtotal)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Debit: Tax Receivable (GST Input)
    if total_tax > 0.0 {
        let je_id_2 = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Input tax on purchases')",
        )
        .bind(&je_id_2)
        .bind(&id)
        .bind(&tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Credit: Accounts Payable (Party)
    // Amount owed = subtotal - discount + tax
    let amount_payable = subtotal - discount_amount + total_tax;
    let je_id_3 = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, ?, 'Amount payable to/receivable from party')",
    )
    .bind(&je_id_3)
    .bind(&id)
    .bind(&party_account)
    .bind(amount_payable)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Discount Received (if discount applied)
    if discount_amount > 0.0 {
        let discount_account: String =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4004'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        let je_id_4 = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Discount received from supplier')",
        )
        .bind(&je_id_4)
        .bind(&id)
        .bind(&discount_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Re-create stock movements
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
        .bind(&item.product_id)
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

// ============= SALES INVOICE =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct SalesInvoice {
    pub id: String,
    pub voucher_no: String,
    pub voucher_date: String,
    pub customer_id: String,
    pub customer_name: String,
    pub salesperson_id: Option<String>,
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
    pub created_by_name: Option<String>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct SalesInvoiceItem {
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
pub struct CreateSalesInvoiceItem {
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
pub struct CreateSalesInvoice {
    pub customer_id: String,
    pub salesperson_id: Option<String>,
    pub party_type: String,
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub discount_rate: Option<f64>,
    pub discount_amount: Option<f64>,
    pub items: Vec<CreateSalesInvoiceItem>,
    pub user_id: Option<String>,
}

#[tauri::command]
pub async fn get_sales_invoices(pool: State<'_, SqlitePool>) -> Result<Vec<SalesInvoice>, String> {
    sqlx::query_as::<_, SalesInvoice>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as customer_id,
            coa.account_name as customer_name,
            v.salesperson_id,
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
            v.deleted_at,
            u.full_name as created_by_name
         FROM vouchers v
         LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
         LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
         LEFT JOIN users u ON v.created_by = u.id
         WHERE v.voucher_type = 'sales_invoice' AND v.deleted_at IS NULL
         GROUP BY v.id
         ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sales_invoice(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<SalesInvoice, String> {
    let invoice = sqlx::query_as::<_, SalesInvoice>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as customer_id,
            coa.account_name as customer_name,
            v.salesperson_id,
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
            v.deleted_at,
            u.full_name as created_by_name
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        LEFT JOIN users u ON v.created_by = u.id
        WHERE v.id = ? AND v.voucher_type = 'sales_invoice' AND v.deleted_at IS NULL
        GROUP BY v.id",
    )
    .bind(id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Sales invoice not found".to_string())?;

    Ok(invoice)
}

#[tauri::command]
pub async fn get_sales_invoice_items(
    pool: State<'_, SqlitePool>,
    voucher_id: String,
) -> Result<Vec<SalesInvoiceItem>, String> {
    sqlx::query_as::<_, SalesInvoiceItem>(
        "SELECT vi.*, p.name as product_name
        FROM voucher_items vi
        LEFT JOIN products p ON vi.product_id = p.id
        WHERE vi.voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_sales_invoice(
    pool: State<'_, SqlitePool>,
    invoice: CreateSalesInvoice,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Generate voucher number
    let voucher_no = get_next_voucher_number(pool.inner(), "sales_invoice").await?;

    // Calculate totals
    let mut subtotal = 0.0;

    for item in &invoice.items {
        let final_quantity = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_quantity * item.rate;
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
    let _ = sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, salesperson_id, party_type, reference, subtotal, discount_rate, discount_amount, total_amount, narration, status, created_by)
         VALUES (?, ?, 'sales_invoice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?)"
    )
    .bind(&voucher_id)
    .bind(&voucher_no)
    .bind(&invoice.voucher_date)
    .bind(&invoice.customer_id)
    .bind(&invoice.salesperson_id)
    .bind(&invoice.party_type)
    .bind(&invoice.reference)
    .bind(subtotal)
    .bind(invoice.discount_rate.unwrap_or(0.0))
    .bind(discount_amount)
    .bind(total_amount)
    .bind(&invoice.narration)
    .bind(&invoice.user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Insert items
    for item in &invoice.items {
        let final_quantity = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_quantity * item.rate;
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
        .bind(final_quantity)
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
    let sales_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4001'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let tax_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '2002'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let party_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE id = ?")
        .bind(&party_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Party account not found: {}", e))?;

    // Debit: Accounts Receivable/Payable (Party)
    // Amount due = subtotal - discount + tax
    let amount_receivable = subtotal - discount_amount + total_tax;
    let je_id_1 = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, ?, 0, 'Amount receivable from/payable to party')",
    )
    .bind(&je_id_1)
    .bind(&voucher_id)
    .bind(&party_account)
    .bind(amount_receivable)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Sales Account (with subtotal, before discount)
    let je_id_2 = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, ?, 'Sales of goods')",
    )
    .bind(&je_id_2)
    .bind(&voucher_id)
    .bind(&sales_account)
    .bind(subtotal)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Tax Payable (GST Output)
    if total_tax > 0.0 {
        let je_id_3 = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Output tax on sales')",
        )
        .bind(&je_id_3)
        .bind(&voucher_id)
        .bind(&tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Debit: Discount Allowed (if discount applied)
    if discount_amount > 0.0 {
        let discount_account: String =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5007'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        let je_id_4 = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Discount allowed to customer')",
        )
        .bind(&je_id_4)
        .bind(&voucher_id)
        .bind(&discount_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Create stock movements (OUT)
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
             VALUES (?, ?, ?, 'OUT', ?, ?, ?, ?)"
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
pub async fn delete_sales_invoice(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get all payment/receipt vouchers created from this invoice
    let related_receipt_ids: Vec<String> =
        sqlx::query_scalar("SELECT id FROM vouchers WHERE created_from_invoice_id = ?")
            .bind(&id)
            .fetch_all(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    // Delete related data for each payment/receipt voucher created from this invoice
    for receipt_id in &related_receipt_ids {
        // Delete journal entries for the receipt
        sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
            .bind(receipt_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // Delete voucher items for the receipt
        sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
            .bind(receipt_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // Delete payment allocations where this receipt voucher is involved
        sqlx::query("DELETE FROM payment_allocations WHERE payment_voucher_id = ?")
            .bind(receipt_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // Delete the receipt voucher itself
        sqlx::query("DELETE FROM vouchers WHERE id = ?")
            .bind(receipt_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Delete related journal entries for the invoice
    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Delete related stock movements
    sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Delete related payment allocations for the invoice
    sqlx::query("DELETE FROM payment_allocations WHERE invoice_voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Delete related voucher items
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Soft delete the voucher
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'sales_invoice'")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn update_sales_invoice(
    pool: State<'_, SqlitePool>,
    id: String,
    invoice: CreateSalesInvoice,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get old party info before update
    let old_party: (String, String) =
        sqlx::query_as("SELECT party_id, party_type FROM vouchers WHERE id = ?")
            .bind(&id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    // Check if party is changing
    let party_changed = old_party.0 != invoice.customer_id || old_party.1 != invoice.party_type;

    // Calculate totals
    let mut subtotal = 0.0;

    for item in &invoice.items {
        let final_quantity = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_quantity * item.rate;
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

    // Update voucher header
    sqlx::query(
        "UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, salesperson_id = ?, party_type = ?, reference = ?, subtotal = ?, discount_rate = ?, discount_amount = ?, total_amount = ?, narration = ?, status = 'posted'
         WHERE id = ? AND voucher_type = 'sales_invoice'"
    )
    .bind(&invoice.voucher_date)
    .bind(&invoice.customer_id)
    .bind(&invoice.salesperson_id)
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

    // Update payment allocations if party changed
    if party_changed {
        sqlx::query(
            "UPDATE payment_allocations 
             SET party_id = ?, party_type = ? 
             WHERE invoice_voucher_id = ?",
        )
        .bind(&invoice.customer_id)
        .bind(&invoice.party_type)
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Delete existing related data
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

    // Re-insert items
    for item in &invoice.items {
        let final_quantity = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_quantity * item.rate;
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
        .bind(&id)
        .bind(&item.product_id)
        .bind(&item.description)
        .bind(item.initial_quantity)
        .bind(item.count)
        .bind(item.deduction_per_unit)
        .bind(final_quantity)
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

    // Calculate total tax from new items
    let total_tax: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(tax_amount), 0) FROM voucher_items WHERE voucher_id = ?",
    )
    .bind(&id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Get account IDs
    let sales_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4001'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let tax_account: String =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '2002'")
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let party_id = invoice.customer_id.clone();

    let party_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE id = ?")
        .bind(&party_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| format!("Party account not found: {}", e))?;

    // Debit: Accounts Receivable (Party)
    let amount_receivable = subtotal - discount_amount + total_tax;
    let je_id_1 = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, ?, 0, 'Amount receivable from/payable to party')",
    )
    .bind(&je_id_1)
    .bind(&id)
    .bind(&party_account)
    .bind(amount_receivable)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Sales Account (with subtotal, before discount)
    let je_id_2 = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, ?, 'Sales of goods')",
    )
    .bind(&je_id_2)
    .bind(&id)
    .bind(&sales_account)
    .bind(subtotal)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Tax Payable (GST Output)
    if total_tax > 0.0 {
        let je_id_3 = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Output tax on sales')",
        )
        .bind(&je_id_3)
        .bind(&id)
        .bind(&tax_account)
        .bind(total_tax)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Debit: Discount Allowed (if discount applied)
    if discount_amount > 0.0 {
        let discount_account: String =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5007'")
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        let je_id_4 = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Discount allowed to customer')",
        )
        .bind(&je_id_4)
        .bind(&id)
        .bind(&discount_account)
        .bind(discount_amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Re-create stock movements (OUT)
    for item in &invoice.items {
        let final_quantity = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let amount = final_quantity * item.rate;
        let sm_id = Uuid::now_v7().to_string();

        sqlx::query(
            "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount)
             VALUES (?, ?, ?, 'OUT', ?, ?, ?, ?)"
        )
        .bind(&sm_id)
        .bind(&id)
        .bind(&item.product_id)
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

// ============= VOUCHER NAVIGATION =============

#[derive(Serialize, sqlx::FromRow)]
pub struct VoucherSummary {
    pub id: String,
    pub voucher_no: String,
    pub voucher_date: String,
    pub party_name: Option<String>,
    pub total_amount: f64,
    pub status: String,
    pub voucher_type: String,
}

#[tauri::command]
pub async fn list_vouchers(
    pool: State<'_, SqlitePool>,
    voucher_type: String,
    limit: i64,
    offset: i64,
    search_query: Option<String>,
) -> Result<Vec<VoucherSummary>, String> {
    let mut query = String::from(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            COALESCE(coa.account_name, CASE WHEN v.voucher_type = 'journal' THEN 'Journal Entry' WHEN v.voucher_type = 'opening_balance' THEN 'Opening Balance' ELSE 'N/A' END) as party_name,
            COALESCE(v.total_amount, 0.0) as total_amount,
            v.status,
            v.voucher_type
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        WHERE v.voucher_type = ? AND v.deleted_at IS NULL ",
    );

    if let Some(search) = &search_query {
        if !search.is_empty() {
            query.push_str("AND (v.voucher_no LIKE ? OR party_name LIKE ?) ");
        }
    }

    query.push_str("ORDER BY v.voucher_date DESC, v.id DESC LIMIT ? OFFSET ?");

    let search_pattern = search_query
        .as_ref()
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{}%", s));

    let mut q = sqlx::query_as::<_, VoucherSummary>(&query).bind(&voucher_type);

    if let Some(ref p) = search_pattern {
        q = q.bind(p).bind(p);
    }

    q = q.bind(limit).bind(offset);

    q.fetch_all(pool.inner()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_previous_voucher_id(
    pool: State<'_, SqlitePool>,
    voucher_type: String,
    current_id: String,
) -> Result<Option<String>, String> {
    sqlx::query_scalar::<_, String>(
        "SELECT id FROM vouchers WHERE voucher_type = ? AND id < ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
    )
    .bind(voucher_type)
    .bind(current_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_next_voucher_id(
    pool: State<'_, SqlitePool>,
    voucher_type: String,
    current_id: String,
) -> Result<Option<String>, String> {
    sqlx::query_scalar::<_, String>(
        "SELECT id FROM vouchers WHERE voucher_type = ? AND id > ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1",
    )
    .bind(voucher_type)
    .bind(current_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_voucher_by_id(
    pool: State<'_, SqlitePool>,
    voucher_type: String,
    id: String,
) -> Result<serde_json::Value, String> {
    // Fetch generic voucher data
    let voucher = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, f64, String, String, String, String)>(
        "SELECT id, voucher_no, voucher_date, reference, narration, total_amount, status, created_at, party_id, party_type FROM vouchers WHERE id = ? AND voucher_type = ? AND deleted_at IS NULL"
    )
    .bind(&id)
    .bind(&voucher_type)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    if let Some(v) = voucher {
        // Fetch items - basic info
        let items = sqlx::query_as::<_, (String, String, f64, f64, f64)>(
             "SELECT id, description, final_quantity, rate, amount FROM voucher_items WHERE voucher_id = ?"
        )
        .bind(&id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

        Ok(serde_json::json!({
            "id": v.0,
            "voucher_no": v.1,
            "voucher_date": v.2,
            "reference": v.3,
            "narration": v.4,
            "total_amount": v.5,
            "status": v.6,
            "party_id": v.8,
            "party_type": v.9,
            "items": items.iter().map(|i| serde_json::json!({
                "id": i.0,
                "description": i.1,
                "quantity": i.2,
                "rate": i.3,
                "amount": i.4
            })).collect::<Vec<_>>()
        }))
    } else {
        Err("Voucher not found".to_string())
    }
}
