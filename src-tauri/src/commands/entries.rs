use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

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

// ============= PAYMENT COMMANDS =============

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PaymentVoucher {
    pub id: i64,
    pub voucher_no: String,
    pub voucher_date: String,
    pub account_id: i64,
    pub account_name: String,
    pub payment_method: String,
    pub reference_number: Option<String>,
    pub total_amount: f64,
    pub tax_amount: f64,
    pub grand_total: f64,
    pub narration: Option<String>,
    pub status: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PaymentItem {
    pub id: i64,
    pub voucher_id: i64,
    pub description: String,
    pub amount: f64,
    pub tax_rate: f64,
    pub tax_amount: f64,
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct AllocationData {
    pub invoice_id: i64,
    pub amount: f64,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PendingInvoice {
    pub id: i64,
    pub voucher_no: String,
    pub voucher_date: String,
    pub voucher_type: String,
    pub total_amount: f64,
    pub pending_amount: f64,
    pub narration: Option<String>,
}

#[derive(Deserialize)]
pub struct CreatePaymentItem {
    pub description: String,
    pub account_id: Option<i64>,
    pub amount: f64,
    pub tax_rate: f64,
    pub remarks: Option<String>,
    pub allocations: Option<Vec<AllocationData>>,
}

#[derive(Deserialize)]
pub struct CreatePayment {
    pub account_id: i64,
    pub voucher_date: String,
    pub payment_method: String,
    pub reference_number: Option<String>,
    pub narration: Option<String>,
    pub items: Vec<CreatePaymentItem>,
}

#[tauri::command]
pub async fn create_payment(
    pool: State<'_, SqlitePool>,
    payment: CreatePayment,
) -> Result<i64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Generate voucher number
    let voucher_no = get_next_voucher_number(&pool, "payment").await?;

    // Calculate totals
    let mut total_amount = 0.0;
    let mut total_tax = 0.0;

    for item in &payment.items {
        total_amount += item.amount;
        total_tax += item.amount * (item.tax_rate / 100.0);
    }

    let grand_total = total_amount + total_tax;

    // Create voucher metadata
    let metadata = serde_json::json!({ "method": payment.payment_method }).to_string();

    // Create voucher
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, party_id, party_type, reference, total_amount, metadata, narration, status)
         VALUES (?, 'payment', ?, ?, 'account', ?, ?, ?, ?, 'posted')"
    )
    .bind(&voucher_no)
    .bind(&payment.voucher_date)
    .bind(payment.account_id)
    .bind(&payment.reference_number)
    .bind(total_amount)
    .bind(metadata)
    .bind(&payment.narration)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let voucher_id = result.last_insert_rowid();

    // Insert items
    for item in &payment.items {
        let tax_amount = item.amount * (item.tax_rate / 100.0);

        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, description, amount, tax_rate, tax_amount, remarks, initial_quantity, count, rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(voucher_id)
        .bind(&item.description)
        .bind(item.amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .bind(&item.remarks)
        .bind(1.0)
        .bind(1.0)
        .bind(item.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Insert Allocations
        if let Some(allocations) = &item.allocations {
            for alloc in allocations {
                sqlx::query(
                "INSERT INTO payment_allocations (payment_voucher_id, invoice_voucher_id, allocated_amount, allocation_date)
                 VALUES (?, ?, ?, ?)"
            )
            .bind(voucher_id)
            .bind(alloc.invoice_id)
            .bind(alloc.amount)
            .bind(&payment.voucher_date)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

                // Update invoice status
                let total_allocated: f64 = sqlx::query_scalar(
                    "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
                )
                .bind(alloc.invoice_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                let invoice_total: f64 = sqlx::query_scalar(
                    "SELECT v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0)
                     FROM vouchers v
                     LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
                     WHERE v.id = ?
                     GROUP BY v.id",
                )
                .bind(alloc.invoice_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                let status = if (total_allocated - invoice_total).abs() < 0.01 {
                    "paid"
                } else if total_allocated > 0.0 {
                    "partially_paid"
                } else {
                    "unpaid"
                };

                sqlx::query("UPDATE vouchers SET payment_status = ? WHERE id = ?")
                    .bind(status)
                    .bind(alloc.invoice_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    // Create journal entries
    // Credit: Cash/Bank Account (the account user selected to pay from)
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, 0, ?, 'Payment made')",
    )
    .bind(voucher_id)
    .bind(payment.account_id)
    .bind(grand_total)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Debit: Each Payee/Ledger Account from items
    for item in &payment.items {
        // Look up the account
        let payee_account: Option<i64> = if let Some(acc_id) = item.account_id {
            Some(acc_id)
        } else {
            sqlx::query_scalar(
                "SELECT id FROM chart_of_accounts WHERE account_name = ? AND is_active = 1",
            )
            .bind(&item.description)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
        };

        if let Some(payee_acc) = payee_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0, ?)",
            )
            .bind(voucher_id)
            .bind(payee_acc)
            .bind(item.amount)
            .bind(format!("Payment to {}", item.description))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    // Debit: Tax Account if applicable
    if total_tax > 0.0 {
        let tax_account: Option<i64> =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        if let Some(tax_acc) = tax_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0, 'Tax on payment')",
            )
            .bind(voucher_id)
            .bind(tax_acc)
            .bind(total_tax)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(voucher_id)
}

#[tauri::command]
pub async fn get_payments(pool: State<'_, SqlitePool>) -> Result<Vec<PaymentVoucher>, String> {
    let payments = sqlx::query_as::<_, PaymentVoucher>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as account_id,
            coa.account_name,
            COALESCE(json_extract(v.metadata, '$.method'), '') as payment_method,
            v.reference,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0.0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0) as grand_total,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.voucher_type = 'payment' AND v.deleted_at IS NULL
        GROUP BY v.id
        ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(payments)
}

#[tauri::command]
pub async fn get_payment(pool: State<'_, SqlitePool>, id: i64) -> Result<PaymentVoucher, String> {
    let payment = sqlx::query_as::<_, PaymentVoucher>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as account_id,
            coa.account_name,
            COALESCE(json_extract(v.metadata, '$.method'), '') as payment_method,
            v.reference as reference_number,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0.0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0) as grand_total,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.id = ? AND v.voucher_type = 'payment' AND v.deleted_at IS NULL
        GROUP BY v.id",
    )
    .bind(id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(payment)
}

#[tauri::command]
pub async fn get_payment_items(
    pool: State<'_, SqlitePool>,
    voucher_id: i64,
) -> Result<Vec<PaymentItem>, String> {
    let items = sqlx::query_as::<_, PaymentItem>(
        "SELECT 
            id,
            voucher_id,
            description,
            amount,
            tax_rate,
            tax_amount,
            remarks
        FROM voucher_items
        WHERE voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub async fn delete_payment(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'payment'")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn update_payment(
    pool: State<'_, SqlitePool>,
    id: i64,
    payment: CreatePayment,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. Calculate totals
    let mut total_amount = 0.0;
    let mut total_tax = 0.0;

    for item in &payment.items {
        total_amount += item.amount;
        total_tax += item.amount * (item.tax_rate / 100.0);
    }
    let grand_total = total_amount + total_tax;
    let metadata = serde_json::json!({ "method": payment.payment_method }).to_string();

    // 2. Update Voucher Master
    sqlx::query(
        "UPDATE vouchers SET 
            voucher_date = ?, 
            party_id = ?, 
            reference = ?, 
            total_amount = ?, 
            metadata = ?, 
            narration = ?
         WHERE id = ? AND voucher_type = 'payment'",
    )
    .bind(&payment.voucher_date)
    .bind(payment.account_id)
    .bind(&payment.reference_number)
    .bind(total_amount)
    .bind(metadata)
    .bind(&payment.narration)
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // 3. Clear existing Allocations (Reverse effect on invoices)
    // We need to re-calculate status for invoices that were allocated
    let allocated_invoices: Vec<i64> = sqlx::query_scalar(
        "SELECT invoice_voucher_id FROM payment_allocations WHERE payment_voucher_id = ?",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM payment_allocations WHERE payment_voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Recalculate status for affected invoices (from old allocations)
    for inv_id in allocated_invoices {
        let total_allocated: f64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
        )
        .bind(inv_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let invoice_total: f64 = sqlx::query_scalar(
            "SELECT v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0)
             FROM vouchers v
             LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
             WHERE v.id = ?
             GROUP BY v.id",
        )
        .bind(inv_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let status = if (total_allocated - invoice_total).abs() < 0.01 {
            "paid"
        } else if total_allocated > 0.0 {
            "partially_paid"
        } else {
            "unpaid"
        };

        sqlx::query("UPDATE vouchers SET payment_status = ? WHERE id = ?")
            .bind(status)
            .bind(inv_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 4. Delete existing Items and Journal Entries
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

    // 5. Insert New Items & Allocations
    for item in &payment.items {
        let tax_amount = item.amount * (item.tax_rate / 100.0);

        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, description, amount, tax_rate, tax_amount, remarks, initial_quantity, count, rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(id)
        .bind(&item.description)
        .bind(item.amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .bind(&item.remarks)
        .bind(1.0)
        .bind(1.0)
        .bind(item.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Insert Allocations
        if let Some(allocations) = &item.allocations {
            for alloc in allocations {
                sqlx::query(
                "INSERT INTO payment_allocations (payment_voucher_id, invoice_voucher_id, allocated_amount, allocation_date)
                 VALUES (?, ?, ?, ?)"
            )
            .bind(id)
            .bind(alloc.invoice_id)
            .bind(alloc.amount)
            .bind(&payment.voucher_date)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

                // Update invoice status
                let total_allocated: f64 = sqlx::query_scalar(
                    "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
                )
                .bind(alloc.invoice_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                let invoice_total: f64 = sqlx::query_scalar(
                    "SELECT v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0)
                     FROM vouchers v
                     LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
                     WHERE v.id = ?
                     GROUP BY v.id",
                )
                .bind(alloc.invoice_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                let status = if (total_allocated - invoice_total).abs() < 0.01 {
                    "paid"
                } else if total_allocated > 0.0 {
                    "partially_paid"
                } else {
                    "unpaid"
                };

                sqlx::query("UPDATE vouchers SET payment_status = ? WHERE id = ?")
                    .bind(status)
                    .bind(alloc.invoice_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    // 6. Create New Journal Entries
    // Credit: Cash/Bank Account
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, 0, ?, 'Payment updated')",
    )
    .bind(id)
    .bind(payment.account_id)
    .bind(grand_total)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Debit: Each Payee/Ledger Account from items
    for item in &payment.items {
        let payee_account: Option<i64> = if let Some(acc_id) = item.account_id {
            Some(acc_id)
        } else {
            sqlx::query_scalar(
                "SELECT id FROM chart_of_accounts WHERE account_name = ? AND is_active = 1",
            )
            .bind(&item.description)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
        };

        if let Some(payee_acc) = payee_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0, ?)",
            )
            .bind(id)
            .bind(payee_acc)
            .bind(item.amount)
            .bind(format!("Payment to {}", item.description))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    // Debit: Tax Account if applicable
    if total_tax > 0.0 {
        let tax_account: Option<i64> =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        if let Some(tax_acc) = tax_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0, 'Tax on payment')",
            )
            .bind(id)
            .bind(tax_acc)
            .bind(total_tax)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

// ============= RECEIPT COMMANDS =============

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ReceiptVoucher {
    pub id: i64,
    pub voucher_no: String,
    pub voucher_date: String,
    pub account_id: i64,
    pub account_name: String,
    pub receipt_method: String,
    pub reference_number: Option<String>,
    pub total_amount: f64,
    pub tax_amount: f64,
    pub grand_total: f64,
    pub narration: Option<String>,
    pub status: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct ReceiptItem {
    pub id: i64,
    pub voucher_id: i64,
    pub description: String,
    pub amount: f64,
    pub tax_rate: f64,
    pub tax_amount: f64,
    pub remarks: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateReceiptItem {
    pub description: String,
    pub account_id: Option<i64>,
    pub amount: f64,
    pub tax_rate: f64,
    pub remarks: Option<String>,
    pub allocations: Option<Vec<AllocationData>>,
}

#[derive(Deserialize)]
pub struct CreateReceipt {
    pub account_id: i64,
    pub voucher_date: String,
    pub receipt_method: String,
    pub reference_number: Option<String>,
    pub narration: Option<String>,
    pub items: Vec<CreateReceiptItem>,
}

#[tauri::command]
pub async fn create_receipt(
    pool: State<'_, SqlitePool>,
    receipt: CreateReceipt,
) -> Result<i64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Generate voucher number
    let voucher_no = get_next_voucher_number(&pool, "receipt").await?;

    // Calculate totals
    let mut total_amount = 0.0;
    let mut total_tax = 0.0;

    for item in &receipt.items {
        total_amount += item.amount;
        total_tax += item.amount * (item.tax_rate / 100.0);
    }

    let grand_total = total_amount + total_tax;

    // Create voucher metadata
    let metadata = serde_json::json!({ "method": receipt.receipt_method }).to_string();

    // Create voucher
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, party_id, party_type, reference, total_amount, metadata, narration, status)
         VALUES (?, 'receipt', ?, ?, 'account', ?, ?, ?, ?, 'posted')"
    )
    .bind(&voucher_no)
    .bind(&receipt.voucher_date)
    .bind(receipt.account_id)
    .bind(&receipt.reference_number)
    .bind(total_amount)
    .bind(metadata)
    .bind(&receipt.narration)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let voucher_id = result.last_insert_rowid();

    // Insert items
    for item in &receipt.items {
        let tax_amount = item.amount * (item.tax_rate / 100.0);

        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, description, amount, tax_rate, tax_amount, remarks, initial_quantity, count, rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(voucher_id)
        .bind(&item.description)
        .bind(item.amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .bind(&item.remarks)
        .bind(1.0)
        .bind(1.0)
        .bind(item.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Insert Allocations
        if let Some(allocations) = &item.allocations {
            for alloc in allocations {
                sqlx::query(
                    "INSERT INTO payment_allocations (payment_voucher_id, invoice_voucher_id, allocated_amount, allocation_date)
                     VALUES (?, ?, ?, ?)"
                )
                .bind(voucher_id)
                .bind(alloc.invoice_id)
                .bind(alloc.amount)
                .bind(&receipt.voucher_date)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                // Update invoice status
                let total_allocated: f64 = sqlx::query_scalar(
                    "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
                )
                .bind(alloc.invoice_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                let invoice_total: f64 = sqlx::query_scalar(
                    "SELECT v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0)
                     FROM vouchers v
                     LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
                     WHERE v.id = ?
                     GROUP BY v.id",
                )
                .bind(alloc.invoice_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                let status = if (total_allocated - invoice_total).abs() < 0.01 {
                    "paid"
                } else if total_allocated > 0.0 {
                    "partially_paid"
                } else {
                    "unpaid"
                };

                sqlx::query("UPDATE vouchers SET payment_status = ? WHERE id = ?")
                    .bind(status)
                    .bind(alloc.invoice_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    // Create journal entries
    // Debit: Cash/Bank Account (the account user selected to receive payment)
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, 'Receipt received')",
    )
    .bind(voucher_id)
    .bind(receipt.account_id)
    .bind(grand_total)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Each Payer/Ledger Account from items
    for item in &receipt.items {
        // Look up the account
        let payer_account: Option<i64> = if let Some(acc_id) = item.account_id {
            Some(acc_id)
        } else {
            sqlx::query_scalar(
                "SELECT id FROM chart_of_accounts WHERE account_name = ? AND is_active = 1",
            )
            .bind(&item.description)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
        };

        if let Some(payer_acc) = payer_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, 0, ?, ?)",
            )
            .bind(voucher_id)
            .bind(payer_acc)
            .bind(item.amount)
            .bind(format!("Receipt from {}", item.description))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    // Credit: Tax Account if applicable
    if total_tax > 0.0 {
        let tax_account: Option<i64> =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        if let Some(tax_acc) = tax_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, 0, ?, 'Tax on receipt')",
            )
            .bind(voucher_id)
            .bind(tax_acc)
            .bind(total_tax)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(voucher_id)
}

#[tauri::command]
pub async fn get_receipts(pool: State<'_, SqlitePool>) -> Result<Vec<ReceiptVoucher>, String> {
    let receipts = sqlx::query_as::<_, ReceiptVoucher>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as account_id,
            coa.account_name,
            COALESCE(json_extract(v.metadata, '$.method'), '') as receipt_method,
            v.reference,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0.0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0) as grand_total,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.voucher_type = 'receipt' AND v.deleted_at IS NULL
        GROUP BY v.id
        ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(receipts)
}

#[tauri::command]
pub async fn get_receipt(pool: State<'_, SqlitePool>, id: i64) -> Result<ReceiptVoucher, String> {
    let receipt = sqlx::query_as::<_, ReceiptVoucher>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.party_id as account_id,
            coa.account_name,
            COALESCE(json_extract(v.metadata, '$.method'), '') as receipt_method,
            v.reference as reference_number,
            v.total_amount,
            COALESCE(SUM(vi.tax_amount), 0.0) as tax_amount,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0) as grand_total,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.id = ? AND v.voucher_type = 'receipt' AND v.deleted_at IS NULL
        GROUP BY v.id",
    )
    .bind(id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(receipt)
}

#[tauri::command]
pub async fn get_receipt_items(
    pool: State<'_, SqlitePool>,
    voucher_id: i64,
) -> Result<Vec<ReceiptItem>, String> {
    let items = sqlx::query_as::<_, ReceiptItem>(
        "SELECT 
            id,
            voucher_id,
            description,
            amount,
            tax_rate,
            tax_amount,
            remarks
        FROM voucher_items
        WHERE voucher_id = ?",
    )
    .bind(voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(items)
}

#[tauri::command]
pub async fn delete_receipt(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'receipt'")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn update_receipt(
    pool: State<'_, SqlitePool>,
    id: i64,
    receipt: CreateReceipt,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // 1. Calculate totals
    let mut total_amount = 0.0;
    let mut total_tax = 0.0;

    for item in &receipt.items {
        total_amount += item.amount;
        total_tax += item.amount * (item.tax_rate / 100.0);
    }
    let grand_total = total_amount + total_tax;
    let metadata = serde_json::json!({ "method": receipt.receipt_method }).to_string();

    // 2. Update Voucher Master
    sqlx::query(
        "UPDATE vouchers SET 
            voucher_date = ?, 
            party_id = ?, 
            reference = ?, 
            total_amount = ?, 
            metadata = ?, 
            narration = ?
         WHERE id = ? AND voucher_type = 'receipt'",
    )
    .bind(&receipt.voucher_date)
    .bind(receipt.account_id)
    .bind(&receipt.reference_number)
    .bind(total_amount)
    .bind(metadata)
    .bind(&receipt.narration)
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // 3. Clear existing Allocations (Reverse effect on invoices)
    let allocated_invoices: Vec<i64> = sqlx::query_scalar(
        "SELECT invoice_voucher_id FROM payment_allocations WHERE payment_voucher_id = ?",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM payment_allocations WHERE payment_voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Recalculate status for effected invoices
    for inv_id in allocated_invoices {
        let total_allocated: f64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
        )
        .bind(inv_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let invoice_total: f64 = sqlx::query_scalar(
            "SELECT v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0)
             FROM vouchers v
             LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
             WHERE v.id = ?
             GROUP BY v.id",
        )
        .bind(inv_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let status = if (total_allocated - invoice_total).abs() < 0.01 {
            "paid"
        } else if total_allocated > 0.0 {
            "partially_paid"
        } else {
            "unpaid"
        };

        sqlx::query("UPDATE vouchers SET payment_status = ? WHERE id = ?")
            .bind(status)
            .bind(inv_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // 4. Delete existing Items and Journal Entries
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

    // 5. Insert New Items & Allocations
    for item in &receipt.items {
        let tax_amount = item.amount * (item.tax_rate / 100.0);

        sqlx::query(
            "INSERT INTO voucher_items (voucher_id, description, amount, tax_rate, tax_amount, remarks, initial_quantity, count, rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(id)
        .bind(&item.description)
        .bind(item.amount)
        .bind(item.tax_rate)
        .bind(tax_amount)
        .bind(&item.remarks)
        .bind(1.0)
        .bind(1.0)
        .bind(item.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Insert Allocations
        if let Some(allocations) = &item.allocations {
            for alloc in allocations {
                sqlx::query(
                "INSERT INTO payment_allocations (payment_voucher_id, invoice_voucher_id, allocated_amount, allocation_date)
                 VALUES (?, ?, ?, ?)"
            )
            .bind(id)
            .bind(alloc.invoice_id)
            .bind(alloc.amount)
            .bind(&receipt.voucher_date)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

                // Update invoice status
                let total_allocated: f64 = sqlx::query_scalar(
                    "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
                )
                .bind(alloc.invoice_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                let invoice_total: f64 = sqlx::query_scalar(
                    "SELECT v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0)
                     FROM vouchers v
                     LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
                     WHERE v.id = ?
                     GROUP BY v.id",
                )
                .bind(alloc.invoice_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

                let status = if (total_allocated - invoice_total).abs() < 0.01 {
                    "paid"
                } else if total_allocated > 0.0 {
                    "partially_paid"
                } else {
                    "unpaid"
                };

                sqlx::query("UPDATE vouchers SET payment_status = ? WHERE id = ?")
                    .bind(status)
                    .bind(alloc.invoice_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    // 6. Create New Journal Entries
    // Debit: Cash/Bank Account
    sqlx::query(
        "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
         VALUES (?, ?, ?, 0, 'Receipt updated')",
    )
    .bind(id)
    .bind(receipt.account_id)
    .bind(grand_total)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Credit: Each Payer/Ledger Account from items
    for item in &receipt.items {
        let payer_account: Option<i64> = if let Some(acc_id) = item.account_id {
            Some(acc_id)
        } else {
            sqlx::query_scalar(
                "SELECT id FROM chart_of_accounts WHERE account_name = ? AND is_active = 1",
            )
            .bind(&item.description)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?
        };

        if let Some(payer_acc) = payer_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, 0, ?, ?)",
            )
            .bind(id)
            .bind(payer_acc)
            .bind(item.amount)
            .bind(format!("Receipt from {}", item.description))
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    // Credit: Tax Account if applicable
    if total_tax > 0.0 {
        let tax_account: Option<i64> =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1005'")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        if let Some(tax_acc) = tax_account {
            sqlx::query(
                "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, 0, ?, 'Tax on receipt')",
            )
            .bind(id)
            .bind(tax_acc)
            .bind(total_tax)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

// ============= JOURNAL ENTRY COMMANDS =============

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct JournalEntry {
    pub id: i64,
    pub voucher_no: String,
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub total_debit: f64,
    pub total_credit: f64,
    pub status: String,
    pub created_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct JournalEntryLine {
    pub id: i64,
    pub voucher_id: i64,
    pub account_id: i64,
    pub account_name: String,
    pub debit: f64,
    pub credit: f64,
    pub narration: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateJournalEntryLine {
    pub account_id: i64,
    pub debit: f64,
    pub credit: f64,
    pub narration: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateJournalEntry {
    pub voucher_date: String,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub lines: Vec<CreateJournalEntryLine>,
}

#[tauri::command]
pub async fn create_journal_entry(
    pool: State<'_, SqlitePool>,
    entry: CreateJournalEntry,
) -> Result<i64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Generate voucher number
    let voucher_no = get_next_voucher_number(&pool, "journal").await?;

    // Calculate totals
    let total_debit: f64 = entry.lines.iter().map(|l| l.debit).sum();
    let total_credit: f64 = entry.lines.iter().map(|l| l.credit).sum();

    // Validate balanced entry
    let difference = (total_debit - total_credit).abs();
    if difference > 0.01 {
        return Err("Journal entry must be balanced (debits must equal credits)".to_string());
    }

    // Validate all lines
    for line in &entry.lines {
        if line.debit == 0.0 && line.credit == 0.0 {
            return Err("Each line must have either debit or credit amount".to_string());
        }
        if line.debit > 0.0 && line.credit > 0.0 {
            return Err("Each line cannot have both debit and credit amounts".to_string());
        }
    }

    // Create voucher
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, reference, total_amount, narration, status)
         VALUES (?, 'journal', ?, ?, ?, ?, 'posted')"
    )
    .bind(&voucher_no)
    .bind(&entry.voucher_date)
    .bind(&entry.reference)
    .bind(total_debit)
    .bind(&entry.narration)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let voucher_id = result.last_insert_rowid();

    // Insert journal entries
    for line in &entry.lines {
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, is_manual, narration)
             VALUES (?, ?, ?, ?, 1, ?)"
        )
        .bind(voucher_id)
        .bind(line.account_id)
        .bind(line.debit)
        .bind(line.credit)
        .bind(&line.narration)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(voucher_id)
}

#[tauri::command]
pub async fn get_journal_entries(pool: State<'_, SqlitePool>) -> Result<Vec<JournalEntry>, String> {
    let entries = sqlx::query_as::<_, JournalEntry>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.reference,
            v.narration,
            COALESCE(SUM(je.debit), 0.0) as total_debit,
            COALESCE(SUM(je.credit), 0.0) as total_credit,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN journal_entries je ON v.id = je.voucher_id
        WHERE v.voucher_type = 'journal' AND v.deleted_at IS NULL
        GROUP BY v.id
        ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(entries)
}

#[tauri::command]
pub async fn get_journal_entry(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<JournalEntry, String> {
    let entry = sqlx::query_as::<_, JournalEntry>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.reference,
            v.narration,
            COALESCE(SUM(je.debit), 0.0) as total_debit,
            COALESCE(SUM(je.credit), 0.0) as total_credit,
            v.status,
            v.created_at,
            v.deleted_at
        FROM vouchers v
        LEFT JOIN journal_entries je ON v.id = je.voucher_id
        WHERE v.id = ? AND v.voucher_type = 'journal' AND v.deleted_at IS NULL
        GROUP BY v.id",
    )
    .bind(id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(entry)
}

#[tauri::command]
pub async fn get_journal_entry_lines(
    pool: State<'_, SqlitePool>,
    voucher_id: i64,
) -> Result<Vec<JournalEntryLine>, String> {
    let lines = sqlx::query_as::<_, JournalEntryLine>(
        "SELECT 
            je.id,
            je.voucher_id,
            je.account_id,
            coa.account_name,
            je.debit,
            je.credit,
            je.narration
        FROM journal_entries je
        LEFT JOIN chart_of_accounts coa ON je.account_id = coa.id
        WHERE je.voucher_id = ? AND je.is_manual = 1
        ORDER BY je.id ASC",
    )
    .bind(voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(lines)
}

#[tauri::command]
pub async fn delete_journal_entry(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    // Check if this is a manual journal entry
    let voucher_type: String = sqlx::query_scalar("SELECT voucher_type FROM vouchers WHERE id = ?")
        .bind(id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    if voucher_type != "journal" {
        return Err("Can only delete manual journal entries".to_string());
    }

    // Soft delete voucher
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============= OPENING BALANCE COMMANDS =============

#[derive(Serialize, Deserialize)]
pub struct OpeningBalanceLine {
    pub account_id: i64,
    pub account_name: String,
    pub debit: f64,
    pub credit: f64,
    pub narration: String,
}

#[derive(Deserialize)]
pub struct CreateOpeningBalance {
    pub form: serde_json::Value,
    pub lines: Vec<OpeningBalanceLine>,
}

#[tauri::command]
pub async fn create_opening_balance(
    pool: State<'_, SqlitePool>,
    entry: CreateOpeningBalance,
) -> Result<i64, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get next voucher number
    let voucher_no = get_next_voucher_number(&pool, "opening_balance").await?;

    // Create voucher master record
    let result = sqlx::query(
        "INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, reference, narration, status)
         VALUES (?, ?, ?, ?, ?, 'posted')"
    )
    .bind(&voucher_no)
    .bind("opening_balance")
    .bind(entry.form.get("voucher_date").and_then(|v| v.as_str()).unwrap_or(""))
    .bind(entry.form.get("reference").and_then(|v| v.as_str()).unwrap_or(""))
    .bind(entry.form.get("narration").and_then(|v| v.as_str()).unwrap_or(""))
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let voucher_id = result.last_insert_rowid();

    // Find Opening Balance Adjustment account (code 3004)
    let ob_account = sqlx::query_as::<_, (i64,)>(
        "SELECT id FROM chart_of_accounts WHERE account_code = '3004' LIMIT 1",
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Opening Balance Adjustment account not found".to_string())?;

    let ob_account_id = ob_account.0;

    // Insert journal entries for each line - create dual entries
    for line in entry.lines {
        // First entry: user's account with their debit/credit (auto-generated, not manual)
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
             VALUES (?, ?, ?, ?, ?, 0)"
        )
        .bind(voucher_id)
        .bind(line.account_id)
        .bind(line.debit)
        .bind(line.credit)
        .bind(&line.narration)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Second entry: balancing entry in Opening Balance Adjustment account (auto-generated)
        // If user has debit, this is credit (and vice versa)
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
             VALUES (?, ?, ?, ?, ?, 0)"
        )
        .bind(voucher_id)
        .bind(ob_account_id)
        .bind(line.credit)  // Reverse: credit becomes debit
        .bind(line.debit)   // Reverse: debit becomes credit
        .bind("Auto-generated balancing entry")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_id)
}

#[tauri::command]
pub async fn get_opening_balances(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<serde_json::Value>, String> {
    sqlx::query_as::<_, (i64, String)>(
        "SELECT v.id, v.voucher_no FROM vouchers v WHERE v.voucher_type = 'opening_balance' AND v.deleted_at IS NULL ORDER BY v.voucher_date DESC"
    )
    .fetch_all(pool.inner())
    .await
    .map(|rows| rows.into_iter().map(|(id, no)| serde_json::json!({"id": id, "voucher_no": no})).collect())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_opening_balance(pool: State<'_, SqlitePool>, id: i64) -> Result<(), String> {
    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'opening_balance'")
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_account_balance(
    pool: State<'_, SqlitePool>,
    account_id: i64,
) -> Result<f64, String> {
    let result = sqlx::query_as::<_, (f64, f64)>(
        "SELECT 
            COALESCE(SUM(debit), 0.0) as total_debit, 
            COALESCE(SUM(credit), 0.0) as total_credit 
         FROM journal_entries 
         WHERE account_id = ?",
    )
    .bind(account_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    // Net balance: Dr - Cr.
    // Assets/Expenses usually Dr > Cr (Positive).
    // Liabilities/Income usually Cr > Dr (Negative).
    // UI can display Dr/Cr based on sign.
    let balance = result.0 - result.1;
    Ok(balance)
}

#[tauri::command]
pub async fn get_pending_invoices(
    pool: State<'_, SqlitePool>,
    account_id: i64,
) -> Result<Vec<PendingInvoice>, String> {
    // Fetch pending invoices for the party.
    let invoices = sqlx::query_as::<_, PendingInvoice>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.voucher_type,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0) as total_amount,
            (v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0) - COALESCE(
                (SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = v.id), 0.0
            )) as pending_amount,
            v.narration
         FROM vouchers v
         LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
         WHERE v.party_id = ? 
           AND v.voucher_type IN ('sales_invoice', 'purchase_invoice')
           AND v.deleted_at IS NULL
           AND v.status = 'posted'
         GROUP BY v.id
         HAVING pending_amount > 0.01
         ORDER BY v.voucher_date ASC",
    )
    .bind(account_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(invoices)
}

#[tauri::command]
pub async fn update_journal_entry(
    pool: State<'_, SqlitePool>,
    id: i64,
    entry: CreateJournalEntry,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Check if this is a manual journal entry
    let voucher_type: String = sqlx::query_scalar("SELECT voucher_type FROM vouchers WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    if voucher_type != "journal" {
        return Err("Can only update manual journal entries".to_string());
    }

    // Calculate totals
    let total_debit: f64 = entry.lines.iter().map(|l| l.debit).sum();
    let total_credit: f64 = entry.lines.iter().map(|l| l.credit).sum();

    // Validate balanced entry
    let difference = (total_debit - total_credit).abs();
    if difference > 0.01 {
        return Err("Journal entry must be balanced (debits must equal credits)".to_string());
    }

    // Validate all lines
    for line in &entry.lines {
        if line.debit == 0.0 && line.credit == 0.0 {
            return Err("Each line must have either debit or credit amount".to_string());
        }
        if line.debit > 0.0 && line.credit > 0.0 {
            return Err("Each line cannot have both debit and credit amounts".to_string());
        }
    }

    // Update voucher master
    sqlx::query(
        "UPDATE vouchers SET 
            voucher_date = ?, 
            reference = ?, 
            total_amount = ?, 
            narration = ?
         WHERE id = ?",
    )
    .bind(&entry.voucher_date)
    .bind(&entry.reference)
    .bind(total_debit)
    .bind(&entry.narration)
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Delete existing journal lines
    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Insert new journal lines
    for line in &entry.lines {
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, is_manual, narration)
             VALUES (?, ?, ?, ?, 1, ?)"
        )
        .bind(id)
        .bind(line.account_id)
        .bind(line.debit)
        .bind(line.credit)
        .bind(&line.narration)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_opening_balance(
    pool: State<'_, SqlitePool>,
    id: i64,
) -> Result<serde_json::Value, String> {
    let voucher = sqlx::query_as::<_, (i64, String, String, Option<String>, Option<String>)>(
        "SELECT id, voucher_no, voucher_date, reference, narration 
         FROM vouchers 
         WHERE id = ? AND voucher_type = 'opening_balance' AND deleted_at IS NULL",
    )
    .bind(id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "id": voucher.0,
        "voucher_no": voucher.1,
        "voucher_date": voucher.2,
        "reference": voucher.3,
        "narration": voucher.4
    }))
}

#[tauri::command]
pub async fn get_opening_balance_lines(
    pool: State<'_, SqlitePool>,
    voucher_id: i64,
) -> Result<Vec<OpeningBalanceLine>, String> {
    // Only fetch the user-facing entries (not the auto-balancing ones)
    // The auto-balancing entry has account_id 3004.

    // Find Opening Balance Adjustment account id
    let ob_account_id: i64 =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '3004' LIMIT 1")
            .fetch_one(pool.inner())
            .await
            .unwrap_or(0); // If not found, 0 won't match anything valid usually

    let lines = sqlx::query_as::<_, (i64, String, f64, f64, String)>(
        "SELECT 
            je.account_id,
            coa.account_name,
            je.debit,
            je.credit,
            je.narration
         FROM journal_entries je
         LEFT JOIN chart_of_accounts coa ON je.account_id = coa.id
         WHERE je.voucher_id = ? AND je.account_id != ?
         ORDER BY je.id ASC",
    )
    .bind(voucher_id)
    .bind(ob_account_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let result = lines
        .into_iter()
        .map(|row| OpeningBalanceLine {
            account_id: row.0,
            account_name: row.1,
            debit: row.2,
            credit: row.3,
            narration: row.4,
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub async fn update_opening_balance(
    pool: State<'_, SqlitePool>,
    id: i64,
    entry: CreateOpeningBalance,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Check voucher type
    let voucher_type: String = sqlx::query_scalar("SELECT voucher_type FROM vouchers WHERE id = ?")
        .bind(id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    if voucher_type != "opening_balance" {
        return Err("Can only update opening balance vouchers".to_string());
    }

    // Update voucher master
    sqlx::query(
        "UPDATE vouchers SET 
            voucher_date = ?, 
            reference = ?, 
            narration = ?
         WHERE id = ?",
    )
    .bind(
        entry
            .form
            .get("voucher_date")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
    )
    .bind(
        entry
            .form
            .get("reference")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
    )
    .bind(
        entry
            .form
            .get("narration")
            .and_then(|v| v.as_str())
            .unwrap_or(""),
    )
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Find OB Adjustment account
    let ob_account = sqlx::query_as::<_, (i64,)>(
        "SELECT id FROM chart_of_accounts WHERE account_code = '3004' LIMIT 1",
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Opening Balance Adjustment account not found".to_string())?;

    let ob_account_id = ob_account.0;

    // Delete existing journal entries
    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Insert new journal entries (dual entry logic)
    for line in entry.lines {
        // User entry
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
             VALUES (?, ?, ?, ?, ?, 0)"
        )
        .bind(id)
        .bind(line.account_id)
        .bind(line.debit)
        .bind(line.credit)
        .bind(&line.narration)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Balancing entry
        sqlx::query(
            "INSERT INTO journal_entries (voucher_id, account_id, debit, credit, narration, is_manual)
             VALUES (?, ?, ?, ?, ?, 0)"
        )
        .bind(id)
        .bind(ob_account_id)
        .bind(line.credit)
        .bind(line.debit)
        .bind("Auto-generated balancing entry")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}
