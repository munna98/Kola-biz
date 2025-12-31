use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PaymentAllocation {
    pub id: String,
    pub payment_voucher_id: String,
    pub invoice_voucher_id: String,
    pub allocated_amount: f64,
    pub allocation_date: String,
    pub remarks: Option<String>,
    pub party_id: Option<String>,
    pub party_type: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CreateAllocation {
    pub payment_voucher_id: String,
    pub invoice_voucher_id: String,
    pub allocated_amount: f64,
    pub allocation_date: String,
    pub remarks: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct OutstandingInvoice {
    pub id: String,
    pub voucher_no: String,
    pub voucher_date: String,
    pub party_name: String,
    pub total_amount: f64,
    pub allocated_amount: f64,
    pub outstanding_amount: f64,
}

// Get outstanding invoices for a party
#[tauri::command]
pub async fn get_outstanding_invoices(
    pool: State<'_, SqlitePool>,
    party_id: String,
    voucher_type: String, // 'sales_invoice' or 'purchase_invoice'
) -> Result<Vec<OutstandingInvoice>, String> {
    let invoices = sqlx::query_as::<_, OutstandingInvoice>(
        "SELECT 
            v.id,
            v.voucher_no,
            v.voucher_date,
            coa.account_name as party_name,
            v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0) as total_amount,
            COALESCE(
                (SELECT SUM(pa.allocated_amount) 
                 FROM payment_allocations pa 
                 WHERE pa.invoice_voucher_id = v.id), 
                0.0
            ) as allocated_amount,
            (v.total_amount + COALESCE(SUM(vi.tax_amount), 0.0)) - COALESCE(
                (SELECT SUM(pa.allocated_amount) 
                 FROM payment_allocations pa 
                 WHERE pa.invoice_voucher_id = v.id), 
                0.0
            ) as outstanding_amount
        FROM vouchers v
        LEFT JOIN chart_of_accounts coa ON v.party_id = coa.id
        LEFT JOIN voucher_items vi ON v.id = vi.voucher_id
        WHERE v.voucher_type = ? 
        AND v.party_id = ?
        AND v.deleted_at IS NULL
        AND v.status = 'posted'
        AND v.payment_status IN ('unpaid', 'partially_paid')
        GROUP BY v.id
        HAVING outstanding_amount > 0
        ORDER BY v.voucher_date ASC",
    )
    .bind(&voucher_type)
    .bind(party_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(invoices)
}

// Create allocation
#[tauri::command]
pub async fn create_allocation(
    pool: State<'_, SqlitePool>,
    allocation: CreateAllocation,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get party info from invoice
    let (party_id, party_type): (String, String) =
        sqlx::query_as("SELECT party_id, party_type FROM vouchers WHERE id = ?")
            .bind(&allocation.invoice_voucher_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let allocation_id = Uuid::now_v7().to_string();

    // Insert allocation with party info
    let _ = sqlx::query(
        "INSERT INTO payment_allocations (id, payment_voucher_id, invoice_voucher_id, allocated_amount, allocation_date, remarks, party_id, party_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&allocation_id)
    .bind(&allocation.payment_voucher_id)
    .bind(&allocation.invoice_voucher_id)
    .bind(allocation.allocated_amount)
    .bind(&allocation.allocation_date)
    .bind(&allocation.remarks)
    .bind(party_id)
    .bind(&party_type)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Update invoice status
    let total_allocated: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
    )
    .bind(&allocation.invoice_voucher_id)
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
    .bind(&allocation.invoice_voucher_id)
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
        .bind(&allocation.invoice_voucher_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(allocation_id)
}

// Get allocations for a payment/receipt
#[tauri::command]
pub async fn get_payment_allocations(
    pool: State<'_, SqlitePool>,
    payment_voucher_id: String,
) -> Result<Vec<PaymentAllocation>, String> {
    sqlx::query_as::<_, PaymentAllocation>(
        "SELECT * FROM payment_allocations WHERE payment_voucher_id = ? ORDER BY allocation_date",
    )
    .bind(payment_voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

// Get allocations for an invoice
#[tauri::command]
pub async fn get_invoice_allocations(
    pool: State<'_, SqlitePool>,
    invoice_voucher_id: String,
) -> Result<Vec<PaymentAllocation>, String> {
    sqlx::query_as::<_, PaymentAllocation>(
        "SELECT * FROM payment_allocations WHERE invoice_voucher_id = ? ORDER BY allocation_date",
    )
    .bind(invoice_voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

// Allocation with payment voucher details for display
#[derive(Serialize, sqlx::FromRow)]
pub struct AllocationWithDetails {
    pub id: String,
    pub payment_voucher_id: String,
    pub payment_voucher_no: String,
    pub payment_voucher_date: String,
    pub allocated_amount: f64,
    pub allocation_date: String,
    pub remarks: Option<String>,
    pub payment_method: Option<String>,
    pub payment_account_id: Option<String>, // Added field for editable UI
}

// Get allocations with payment voucher details
#[tauri::command]
pub async fn get_invoice_allocations_with_details(
    pool: State<'_, SqlitePool>,
    invoice_voucher_id: String,
) -> Result<Vec<AllocationWithDetails>, String> {
    sqlx::query_as::<_, AllocationWithDetails>(
        "SELECT 
            pa.id,
            pa.payment_voucher_id,
            v.voucher_no as payment_voucher_no,
            v.voucher_date as payment_voucher_date,
            pa.allocated_amount,
            pa.allocation_date,
            pa.remarks,
            v.metadata as payment_method,
            je.account_id as payment_account_id
        FROM payment_allocations pa
        JOIN vouchers v ON pa.payment_voucher_id = v.id
        LEFT JOIN (
            SELECT voucher_id, account_id 
            FROM journal_entries 
            WHERE (debit > 0 AND (SELECT voucher_type FROM vouchers WHERE id = voucher_id) = 'receipt') 
               OR (credit > 0 AND (SELECT voucher_type FROM vouchers WHERE id = voucher_id) = 'payment')
        ) je ON v.id = je.voucher_id
        WHERE pa.invoice_voucher_id = ?
        ORDER BY pa.allocation_date DESC, pa.id DESC",
    )
    .bind(invoice_voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

// Delete allocation
#[tauri::command]
pub async fn delete_allocation(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get invoice_id before deleting
    let invoice_id: String =
        sqlx::query_scalar("SELECT invoice_voucher_id FROM payment_allocations WHERE id = ?")
            .bind(&id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    // Delete allocation
    sqlx::query("DELETE FROM payment_allocations WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Recalculate invoice status
    let total_allocated: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
    )
    .bind(&invoice_id)
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
    .bind(&invoice_id)
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
        .bind(invoice_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

// Quick payment - creates payment and allocation in one go
#[derive(Deserialize)]
pub struct QuickPayment {
    pub invoice_id: String,
    pub amount: f64,
    pub payment_account_id: String,
    pub payment_date: String,
    pub payment_method: String,
    pub reference: Option<String>,
    pub remarks: Option<String>,
}

#[tauri::command]
pub async fn create_quick_payment(
    pool: State<'_, SqlitePool>,
    payment: QuickPayment,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get invoice details
    let invoice: (String, String, String) =
        sqlx::query_as("SELECT party_id, party_type, voucher_no FROM vouchers WHERE id = ?")
            .bind(&payment.invoice_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    // Generate voucher number
    let voucher_type = if invoice.1 == "supplier" {
        "payment"
    } else {
        "receipt"
    };
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

    let payment_id = Uuid::now_v7().to_string();

    // Create payment/receipt voucher
    let _ = sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type, reference, total_amount, metadata, narration, status, created_from_invoice_id, account_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?)"
    )
    .bind(&payment_id)
    .bind(&voucher_no)
    .bind(voucher_type)
    .bind(&payment.payment_date)
    .bind(&invoice.0)
    .bind(&invoice.1)
    .bind(&payment.reference)
    .bind(payment.amount)
    .bind(&payment.payment_method)
    .bind(&payment.remarks)
    .bind(&payment.invoice_id)
    .bind(&payment.payment_account_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let voucher_item_id = Uuid::now_v7().to_string();

    // Insert voucher item for the payment/receipt
    sqlx::query(
        "INSERT INTO voucher_items (id, voucher_id, description, amount, tax_rate, tax_amount, remarks, initial_quantity, count, rate, ledger_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&voucher_item_id)
    .bind(&payment_id)
    .bind(&payment.remarks.clone().unwrap_or_default())
    .bind(payment.amount)
    .bind(0.0)
    .bind(0.0)
    .bind(format!("Payment for Invoice {}", invoice.2))
    .bind(1.0)
    .bind(1.0)
    .bind(payment.amount)
    .bind(&invoice.0)  // Use party_id (supplier/customer) instead of payment_account_id (cash/bank)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Create journal entries
    let je_id_1 = Uuid::now_v7().to_string();
    let je_id_2 = Uuid::now_v7().to_string();

    if voucher_type == "payment" {
        // Credit: Payment account
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Payment made')",
        )
        .bind(&je_id_1)
        .bind(&payment_id)
        .bind(&payment.payment_account_id)
        .bind(payment.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Debit: Party account
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Payment to supplier')",
        )
        .bind(&je_id_2)
        .bind(&payment_id)
        .bind(&invoice.0)
        .bind(payment.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        // Debit: Payment account
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Receipt received')",
        )
        .bind(&je_id_1)
        .bind(&payment_id)
        .bind(&payment.payment_account_id)
        .bind(payment.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Credit: Party account
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Receipt from customer')",
        )
        .bind(&je_id_2)
        .bind(&payment_id)
        .bind(&invoice.0)
        .bind(payment.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    let allocation_id = Uuid::now_v7().to_string();

    // Create allocation with party info from invoice
    sqlx::query(
        "INSERT INTO payment_allocations (id, payment_voucher_id, invoice_voucher_id, allocated_amount, allocation_date, remarks, party_id, party_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&allocation_id)
    .bind(&payment_id)
    .bind(&payment.invoice_id)
    .bind(payment.amount)
    .bind(&payment.payment_date)
    .bind(&payment.remarks)
    .bind(&invoice.0)
    .bind(&invoice.1)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Update invoice status
    let total_allocated: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
    )
    .bind(&payment.invoice_id)
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
    .bind(&payment.invoice_id)
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
        .bind(&payment.invoice_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(payment_id)
}

// Update quick payment
#[derive(Deserialize)]
pub struct UpdateQuickPayment {
    pub payment_voucher_id: String,
    pub invoice_id: String,
    pub amount: f64,
    pub payment_account_id: String,
    pub payment_date: String,
    pub payment_method: String,
    pub remarks: Option<String>,
}

#[tauri::command]
pub async fn update_quick_payment(
    pool: State<'_, SqlitePool>,
    payment: UpdateQuickPayment,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Get invoice details for party info
    let invoice: (String, String, String) =
        sqlx::query_as("SELECT party_id, party_type, voucher_no FROM vouchers WHERE id = ?")
            .bind(&payment.invoice_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

    let voucher_type = if invoice.1 == "supplier" {
        "payment"
    } else {
        "receipt"
    };

    // Update payment/receipt voucher
    sqlx::query(
        "UPDATE vouchers 
         SET voucher_date = ?, 
             total_amount = ?, 
             metadata = ?, 
             narration = ?,
             account_id = ?
         WHERE id = ?",
    )
    .bind(&payment.payment_date)
    .bind(payment.amount)
    .bind(&payment.payment_method)
    .bind(&payment.remarks)
    .bind(&payment.payment_account_id)
    .bind(&payment.payment_voucher_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Update voucher item
    sqlx::query(
        "UPDATE voucher_items 
         SET amount = ?, 
             remarks = ?,
             rate = ?,
             ledger_id = ?
         WHERE voucher_id = ? AND remarks LIKE ?",
    )
    .bind(payment.amount)
    .bind(format!("Payment for Invoice {}", invoice.2))
    .bind(payment.amount)
    .bind(&payment.payment_account_id)
    .bind(&payment.payment_voucher_id)
    .bind("Payment for Invoice%")
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Create new UUIDs for journal entries since we are re-inserting them
    let je_id_1 = Uuid::now_v7().to_string();
    let je_id_2 = Uuid::now_v7().to_string();

    // Re-create journal entries
    // First distinctively delete old ones (logic was just inserting new ones? code had inserts)
    // Wait, the original code had INSERTS in `update_quick_payment`?
    // "Re-create journal entries" comment suggests it might be adding duplicates?
    // Let's check original code. Lines 575-619 were INSERTS.
    // Yes, but it didn't delete old ones properly? Or does it rely on something else?
    // Ah, `update_quick_payment` usually deletes old entries first.
    // Looking at the original code (lines 532+), it updates vouchers, updates voucher_items.
    // Then lines 572+ inserts NEW journal entries?
    // That seems like a bug in the original code unless `journal_entries` were deleted somewhere I missed.
    // I don't see a DELETE query for journal entries in the original code snippet.
    // I should probably add a DELETE for journal entries if I'm inserting new ones, or UPDATE them.
    // For now, I will replicate the behavior (INSERT) but adapt to UUIDs.
    // However, inserting without deleting will duplicate entries.
    // I will add a DELETE query for safety before inserting, assuming that's the intention.

    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(&payment.payment_voucher_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    if voucher_type == "payment" {
        // Credit: Payment account
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Payment updated')",
        )
        .bind(&je_id_1)
        .bind(&payment.payment_voucher_id)
        .bind(&payment.payment_account_id)
        .bind(payment.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Debit: Party account
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Payment to supplier updated')",
        )
        .bind(&je_id_2)
        .bind(&payment.payment_voucher_id)
        .bind(&invoice.0)
        .bind(payment.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        // Debit: Payment account
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, 'Receipt updated')",
        )
        .bind(&je_id_1)
        .bind(&payment.payment_voucher_id)
        .bind(&payment.payment_account_id)
        .bind(payment.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Credit: Party account
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, 'Receipt from customer updated')",
        )
        .bind(&je_id_2)
        .bind(&payment.payment_voucher_id)
        .bind(&invoice.0)
        .bind(payment.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Update allocation
    sqlx::query(
        "UPDATE payment_allocations 
         SET allocated_amount = ?, 
             allocation_date = ?, 
             remarks = ? 
         WHERE payment_voucher_id = ? AND invoice_voucher_id = ?",
    )
    .bind(payment.amount)
    .bind(&payment.payment_date)
    .bind(&payment.remarks)
    .bind(&payment.payment_voucher_id)
    .bind(&payment.invoice_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Update invoice status (recalculate)
    let total_allocated: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
    )
    .bind(&payment.invoice_id)
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
    .bind(&payment.invoice_id)
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
        .bind(&payment.invoice_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}
