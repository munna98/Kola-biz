use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;


use uuid::Uuid;
use super::resolve_voucher_line_unit;
use crate::voucher_seq::get_next_voucher_number;

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

// ============= GST INVOICE HELPERS =============

#[derive(Debug)]
pub struct ProcessedVoucherItem {
    pub id: String,
    pub product_id: String,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub final_quantity: f64,
    pub unit_id: Option<String>,
    pub base_quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub discount_percent: f64,
    pub discount_amount: f64,
    pub tax_rate: f64,
    pub tax_amount: f64,
    pub remarks: Option<String>,
    pub cgst_rate: f64,
    pub sgst_rate: f64,
    pub igst_rate: f64,
    pub cgst_amount: f64,
    pub sgst_amount: f64,
    pub igst_amount: f64,
    pub hsn_sac_code: Option<String>,
    pub gst_slab_id: Option<String>,
    pub resolved_gst_rate: f64,
}

pub struct ProcessedVoucher {
    pub items: Vec<ProcessedVoucherItem>,
    pub subtotal: f64,
    pub total_cgst: f64,
    pub total_sgst: f64,
    pub total_igst: f64,
}


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
    pub tax_inclusive: i64,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct PurchaseInvoiceItem {
    pub id: String,
    pub voucher_id: String,
    pub product_id: String,
    pub product_code: String,
    pub product_name: String,
    pub description: Option<String>,
    pub initial_quantity: f64,
    pub count: i64,
    pub deduction_per_unit: f64,
    pub final_quantity: f64,
    pub unit_id: Option<String>,
    pub base_quantity: f64,
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
    pub unit_id: Option<String>,
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
    pub tax_inclusive: Option<bool>,
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
            ROUND(COALESCE(v.tax_amount, COALESCE(SUM(vi.tax_amount), 0), 0), 2) as tax_amount,
            ROUND(COALESCE(v.subtotal, v.total_amount, 0) - COALESCE(v.discount_amount, 0) + COALESCE(v.tax_amount, COALESCE(SUM(vi.tax_amount), 0), 0), 2) as grand_total,
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at,
            u.full_name as created_by_name,
            COALESCE(v.tax_inclusive, 0) as tax_inclusive
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
            coa.account_name as supplier_name,
            v.party_type,
            v.reference,
            v.total_amount,
            ROUND(COALESCE(v.tax_amount, COALESCE(SUM(vi.tax_amount), 0), 0), 2) as tax_amount,
            ROUND(COALESCE(v.subtotal, v.total_amount, 0) - COALESCE(v.discount_amount, 0) + COALESCE(v.tax_amount, COALESCE(SUM(vi.tax_amount), 0), 0), 2) as grand_total,
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at,
            u.full_name as created_by_name,
            COALESCE(v.tax_inclusive, 0) as tax_inclusive
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
        "SELECT vi.*, p.code as product_code, p.name as product_name 
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
    pool: tauri::State<'_, sqlx::SqlitePool>,
    invoice: CreatePurchaseInvoice,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let voucher_no = crate::voucher_seq::get_next_voucher_number(pool.inner(), "purchase_invoice").await?;

    let company_state: Option<String> = sqlx::query_scalar("SELECT state FROM company_profile ORDER BY id DESC LIMIT 1").fetch_optional(&mut *tx).await.ok().flatten();
    let party_state: Option<String> = sqlx::query_scalar("SELECT state FROM chart_of_accounts WHERE id = ?").bind(&invoice.supplier_id).fetch_optional(&mut *tx).await.ok().flatten();
    let is_inter_state = crate::commands::tax_utils::is_inter_state(company_state.as_deref(), party_state.as_deref());
    let tax_inclusive = invoice.tax_inclusive.unwrap_or(false);

    let mut processed_items = Vec::new();
    let mut subtotal = 0.0;
    let mut total_cgst = 0.0;
    let mut total_sgst = 0.0;
    let mut total_igst = 0.0;

    for item in &invoice.items {
        let final_quantity = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let unit_snapshot = super::resolve_voucher_line_unit(&mut tx, &item.product_id, item.unit_id.as_deref(), "purchase", final_quantity).await?;
        
        let product: Option<(Option<String>, Option<String>)> = sqlx::query_as("SELECT hsn_sac_code, gst_slab_id FROM products WHERE id = ?").bind(&item.product_id).fetch_optional(&mut *tx).await.unwrap_or(None);
        let (hsn_sac_code, gst_slab_id) = product.unwrap_or((None, None));
        
        let mut effective_rate = item.tax_rate;
        if let Some(ref slab_id) = gst_slab_id {
            if let Some(slab) = crate::commands::tax_utils::get_slab(pool.inner(), slab_id).await {
                effective_rate = crate::commands::tax_utils::resolve_effective_rate(item.rate, &slab);
            }
        }
        
        let raw_amount = final_quantity * item.rate;
        let discount_percent = item.discount_percent.unwrap_or(0.0);
        let discount_amount = if discount_percent > 0.0 { raw_amount * (discount_percent / 100.0) } else { item.discount_amount.unwrap_or(0.0) };
        let net_before_tax = raw_amount - discount_amount;
        
        let (taxable_amount, tax_amount, base_amount, base_rate) = if tax_inclusive {
            let tax_amt = net_before_tax - (net_before_tax / (1.0 + (effective_rate / 100.0)));
            let txbl = net_before_tax - tax_amt;
            let b_amt = txbl + discount_amount;
            (txbl, tax_amt, b_amt, b_amt / final_quantity)
        } else {
            (net_before_tax, net_before_tax * (effective_rate / 100.0), raw_amount, item.rate)
        };
        
        subtotal += taxable_amount;
        
        let mut cgst_rate = 0.0; let mut sgst_rate = 0.0; let mut igst_rate = 0.0;
        let mut cgst_amount = 0.0; let mut sgst_amount = 0.0; let mut igst_amount = 0.0;
        if effective_rate > 0.0 {
            let split = crate::commands::tax_utils::compute_split(taxable_amount, effective_rate, is_inter_state);
            cgst_rate = split.cgst_rate; sgst_rate = split.sgst_rate; igst_rate = split.igst_rate;
            cgst_amount = split.cgst_amount; sgst_amount = split.sgst_amount; igst_amount = split.igst_amount;
            total_cgst += cgst_amount; total_sgst += sgst_amount; total_igst += igst_amount;
        }

        
        processed_items.push(ProcessedVoucherItem {
            id: Uuid::now_v7().to_string(),
            product_id: item.product_id.clone(), description: item.description.clone(), initial_quantity: item.initial_quantity,
            count: item.count, deduction_per_unit: item.deduction_per_unit, final_quantity, unit_id: Some(unit_snapshot.unit_id.clone()),
            base_quantity: unit_snapshot.base_quantity, rate: base_rate, amount: base_amount, discount_percent, discount_amount,
            tax_rate: effective_rate, tax_amount, remarks: item.remarks.clone(), cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
            hsn_sac_code, gst_slab_id, resolved_gst_rate: effective_rate,
        });
    }

    subtotal = round2(subtotal);
    total_cgst = round2(total_cgst);
    total_sgst = round2(total_sgst);
    total_igst = round2(total_igst);
    let discount_amount = round2(invoice.discount_amount.unwrap_or(0.0));
    let total_amount = round2(subtotal - discount_amount);
    let total_tax = round2(total_cgst + total_sgst + total_igst);
    let grand_total = round2(total_amount + total_tax);

    
    let voucher_id = Uuid::now_v7().to_string();
    let _ = sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type, reference, subtotal, discount_rate, discount_amount, tax_amount, total_amount, narration, status, created_by, tax_inclusive, cgst_amount, sgst_amount, igst_amount, grand_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?)"
    )
    .bind(&voucher_id).bind(&voucher_no).bind("purchase_invoice").bind(&invoice.voucher_date).bind(&invoice.supplier_id)
    .bind(&invoice.party_type).bind(&invoice.reference).bind(subtotal).bind(invoice.discount_rate.unwrap_or(0.0))
    .bind(discount_amount).bind(total_tax).bind(total_amount).bind(&invoice.narration)
    .bind(&invoice.user_id).bind(tax_inclusive as i64).bind(total_cgst).bind(total_sgst).bind(total_igst).bind(grand_total).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Insert items
    for item in &processed_items {
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, tax_rate, tax_amount, discount_percent, discount_amount, remarks, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, gst_slab_id, resolved_gst_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&item.id).bind(&voucher_id).bind(&item.product_id).bind(&item.description).bind(item.initial_quantity)
        .bind(item.count).bind(item.deduction_per_unit).bind(item.final_quantity).bind(&item.unit_id).bind(item.base_quantity)
        .bind(item.rate).bind(item.amount).bind(item.tax_rate).bind(item.tax_amount).bind(item.discount_percent).bind(item.discount_amount)
        .bind(&item.remarks).bind(item.cgst_rate).bind(item.sgst_rate).bind(item.igst_rate).bind(item.cgst_amount).bind(item.sgst_amount)
        .bind(item.igst_amount).bind(&item.hsn_sac_code).bind(&item.gst_slab_id).bind(item.resolved_gst_rate)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= CREATE JOURNAL ENTRIES =============



    let party_id = invoice.supplier_id;
    
    let main_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5001'").fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    
    // Group tax manually
    let mut tax_ledgers: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    for row in &processed_items {
        if row.tax_amount > 0.0 {
            let accounts = crate::commands::tax_utils::resolve_gst_account_names(row.resolved_gst_rate, is_inter_state, true);
            if let Some(cgst_acc) = accounts.cgst_account {
                *tax_ledgers.entry(cgst_acc).or_insert(0.0) += row.cgst_amount;
            }
            if let Some(sgst_acc) = accounts.sgst_account {
                *tax_ledgers.entry(sgst_acc).or_insert(0.0) += row.sgst_amount;
            }
            if let Some(igst_acc) = accounts.igst_account {
                *tax_ledgers.entry(igst_acc).or_insert(0.0) += row.igst_amount;
            }
        }
    }

    

    // Party entry
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(&party_id).bind(0.0).bind(total_amount + total_tax).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Main entry
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(&main_account).bind(subtotal).bind(0.0).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Discount entry
    if discount_amount > 0.0 {
        let dis_acc: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4004'").fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(dis_acc).bind(0.0).bind(discount_amount).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // Tax entries
    for (acc_name, amt) in tax_ledgers {
        if amt > 0.0 {
            let acc_id = crate::commands::tax_utils::ensure_gst_account_exists(pool.inner(), &acc_name, !true).await?;
            let (dr, cr) = if true { (amt, 0.0) } else { (0.0, amt) };
            
            sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)")
                .bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(acc_id).bind(dr).bind(cr)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_id.to_string())
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
    pool: tauri::State<'_, sqlx::SqlitePool>,
    id: String,
    invoice: CreatePurchaseInvoice,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;



    let company_state: Option<String> = sqlx::query_scalar("SELECT state FROM company_profile ORDER BY id DESC LIMIT 1").fetch_optional(&mut *tx).await.ok().flatten();
    let party_state: Option<String> = sqlx::query_scalar("SELECT state FROM chart_of_accounts WHERE id = ?").bind(&invoice.supplier_id).fetch_optional(&mut *tx).await.ok().flatten();
    let is_inter_state = crate::commands::tax_utils::is_inter_state(company_state.as_deref(), party_state.as_deref());
    let tax_inclusive = invoice.tax_inclusive.unwrap_or(false);

    let mut processed_items = Vec::new();
    let mut subtotal = 0.0;
    let mut total_cgst = 0.0;
    let mut total_sgst = 0.0;
    let mut total_igst = 0.0;

    for item in &invoice.items {
        let final_quantity = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let unit_snapshot = super::resolve_voucher_line_unit(&mut tx, &item.product_id, item.unit_id.as_deref(), "purchase", final_quantity).await?;
        
        let product: Option<(Option<String>, Option<String>)> = sqlx::query_as("SELECT hsn_sac_code, gst_slab_id FROM products WHERE id = ?").bind(&item.product_id).fetch_optional(&mut *tx).await.unwrap_or(None);
        let (hsn_sac_code, gst_slab_id) = product.unwrap_or((None, None));
        
        let mut effective_rate = item.tax_rate;
        if let Some(ref slab_id) = gst_slab_id {
            if let Some(slab) = crate::commands::tax_utils::get_slab(pool.inner(), slab_id).await {
                effective_rate = crate::commands::tax_utils::resolve_effective_rate(item.rate, &slab);
            }
        }
        
        let raw_amount = final_quantity * item.rate;
        let discount_percent = item.discount_percent.unwrap_or(0.0);
        let discount_amount = if discount_percent > 0.0 { raw_amount * (discount_percent / 100.0) } else { item.discount_amount.unwrap_or(0.0) };
        let net_before_tax = raw_amount - discount_amount;
        
        let (taxable_amount, tax_amount, base_amount, base_rate) = if tax_inclusive {
            let tax_amt = net_before_tax - (net_before_tax / (1.0 + (effective_rate / 100.0)));
            let txbl = net_before_tax - tax_amt;
            let b_amt = txbl + discount_amount;
            (txbl, tax_amt, b_amt, b_amt / final_quantity)
        } else {
            (net_before_tax, net_before_tax * (effective_rate / 100.0), raw_amount, item.rate)
        };
        
        subtotal += taxable_amount;
        
        let mut cgst_rate = 0.0; let mut sgst_rate = 0.0; let mut igst_rate = 0.0;
        let mut cgst_amount = 0.0; let mut sgst_amount = 0.0; let mut igst_amount = 0.0;
        if effective_rate > 0.0 {
            let split = crate::commands::tax_utils::compute_split(taxable_amount, effective_rate, is_inter_state);
            cgst_rate = split.cgst_rate; sgst_rate = split.sgst_rate; igst_rate = split.igst_rate;
            cgst_amount = split.cgst_amount; sgst_amount = split.sgst_amount; igst_amount = split.igst_amount;
            total_cgst += cgst_amount; total_sgst += sgst_amount; total_igst += igst_amount;
        }

        
        processed_items.push(ProcessedVoucherItem {
            id: Uuid::now_v7().to_string(),
            product_id: item.product_id.clone(), description: item.description.clone(), initial_quantity: item.initial_quantity,
            count: item.count, deduction_per_unit: item.deduction_per_unit, final_quantity, unit_id: Some(unit_snapshot.unit_id.clone()),
            base_quantity: unit_snapshot.base_quantity, rate: base_rate, amount: base_amount, discount_percent, discount_amount,
            tax_rate: effective_rate, tax_amount, remarks: item.remarks.clone(), cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
            hsn_sac_code, gst_slab_id, resolved_gst_rate: effective_rate,
        });
    }

    subtotal = round2(subtotal);
    total_cgst = round2(total_cgst);
    total_sgst = round2(total_sgst);
    total_igst = round2(total_igst);
    let discount_amount = round2(invoice.discount_amount.unwrap_or(0.0));
    let total_amount = round2(subtotal - discount_amount);
    let total_tax = round2(total_cgst + total_sgst + total_igst);
    let grand_total = round2(total_amount + total_tax);

    let voucher_id = id;
    let _ = sqlx::query(
        "UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, party_type = ?, reference = ?, subtotal = ?, 
             discount_rate = ?, discount_amount = ?, tax_amount = ?, total_amount = ?, narration = ?,
             tax_inclusive = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?, grand_total = ?
         WHERE id = ?"
    )
    .bind(&invoice.voucher_date).bind(&invoice.supplier_id).bind(&invoice.party_type).bind(&invoice.reference)
    .bind(subtotal).bind(invoice.discount_rate.unwrap_or(0.0)).bind(discount_amount)
    .bind(total_tax).bind(total_amount).bind(&invoice.narration)
    .bind(tax_inclusive as i64).bind(total_cgst).bind(total_sgst).bind(total_igst)
    .bind(grand_total).bind(&voucher_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?").bind(&voucher_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Insert items
    for item in &processed_items {
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, tax_rate, tax_amount, discount_percent, discount_amount, remarks, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, gst_slab_id, resolved_gst_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&item.id).bind(&voucher_id).bind(&item.product_id).bind(&item.description).bind(item.initial_quantity)
        .bind(item.count).bind(item.deduction_per_unit).bind(item.final_quantity).bind(&item.unit_id).bind(item.base_quantity)
        .bind(item.rate).bind(item.amount).bind(item.tax_rate).bind(item.tax_amount).bind(item.discount_percent).bind(item.discount_amount)
        .bind(&item.remarks).bind(item.cgst_rate).bind(item.sgst_rate).bind(item.igst_rate).bind(item.cgst_amount).bind(item.sgst_amount)
        .bind(item.igst_amount).bind(&item.hsn_sac_code).bind(&item.gst_slab_id).bind(item.resolved_gst_rate)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= CREATE JOURNAL ENTRIES =============

    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?").bind(&voucher_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    let party_id = invoice.supplier_id;
    
    let main_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5001'").fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    
    // Group tax manually
    let mut tax_ledgers: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    for row in &processed_items {
        if row.tax_amount > 0.0 {
            let accounts = crate::commands::tax_utils::resolve_gst_account_names(row.resolved_gst_rate, is_inter_state, true);
            if let Some(cgst_acc) = accounts.cgst_account {
                *tax_ledgers.entry(cgst_acc).or_insert(0.0) += row.cgst_amount;
            }
            if let Some(sgst_acc) = accounts.sgst_account {
                *tax_ledgers.entry(sgst_acc).or_insert(0.0) += row.sgst_amount;
            }
            if let Some(igst_acc) = accounts.igst_account {
                *tax_ledgers.entry(igst_acc).or_insert(0.0) += row.igst_amount;
            }
        }
    }

    

    // Party entry
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(&party_id).bind(0.0).bind(total_amount + total_tax).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Main entry
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(&main_account).bind(subtotal).bind(0.0).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Discount entry
    if discount_amount > 0.0 {
        let dis_acc: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4004'").fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(dis_acc).bind(0.0).bind(discount_amount).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // Tax entries
    for (acc_name, amt) in tax_ledgers {
        if amt > 0.0 {
            let acc_id = crate::commands::tax_utils::ensure_gst_account_exists(pool.inner(), &acc_name, !true).await?;
            let (dr, cr) = if true { (amt, 0.0) } else { (0.0, amt) };
            
            sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)")
                .bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(acc_id).bind(dr).bind(cr)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_id.to_string())
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
    pub tax_inclusive: i64,
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
    pub unit_id: Option<String>,
    pub base_quantity: f64,
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
    pub unit_id: Option<String>,
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
    pub tax_inclusive: Option<bool>,
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
            ROUND(COALESCE(v.tax_amount, COALESCE(SUM(vi.tax_amount), 0), 0), 2) as tax_amount,
            ROUND(COALESCE(v.subtotal, v.total_amount, 0) - COALESCE(v.discount_amount, 0) + COALESCE(v.tax_amount, COALESCE(SUM(vi.tax_amount), 0), 0), 2) as grand_total,
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at,
            u.full_name as created_by_name,
            COALESCE(v.tax_inclusive, 0) as tax_inclusive
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
            ROUND(COALESCE(v.tax_amount, COALESCE(SUM(vi.tax_amount), 0), 0), 2) as tax_amount,
            ROUND(COALESCE(v.subtotal, v.total_amount, 0) - COALESCE(v.discount_amount, 0) + COALESCE(v.tax_amount, COALESCE(SUM(vi.tax_amount), 0), 0), 2) as grand_total,
            v.discount_rate,
            v.discount_amount,
            v.narration,
            v.status,
            v.created_at,
            v.deleted_at,
            u.full_name as created_by_name,
            COALESCE(v.tax_inclusive, 0) as tax_inclusive
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
    pool: tauri::State<'_, sqlx::SqlitePool>,
    invoice: CreateSalesInvoice,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let voucher_no = crate::voucher_seq::get_next_voucher_number(pool.inner(), "sales_invoice").await?;

    let company_state: Option<String> = sqlx::query_scalar("SELECT state FROM company_profile ORDER BY id DESC LIMIT 1").fetch_optional(&mut *tx).await.ok().flatten();
    let party_state: Option<String> = sqlx::query_scalar("SELECT state FROM chart_of_accounts WHERE id = ?").bind(&invoice.customer_id).fetch_optional(&mut *tx).await.ok().flatten();
    let is_inter_state = crate::commands::tax_utils::is_inter_state(company_state.as_deref(), party_state.as_deref());
    let tax_inclusive = invoice.tax_inclusive.unwrap_or(false);

    let mut processed_items = Vec::new();
    let mut subtotal = 0.0;
    let mut total_cgst = 0.0;
    let mut total_sgst = 0.0;
    let mut total_igst = 0.0;

    for item in &invoice.items {
        let final_quantity = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let unit_snapshot = super::resolve_voucher_line_unit(&mut tx, &item.product_id, item.unit_id.as_deref(), "sale", final_quantity).await?;
        
        let product: Option<(Option<String>, Option<String>)> = sqlx::query_as("SELECT hsn_sac_code, gst_slab_id FROM products WHERE id = ?").bind(&item.product_id).fetch_optional(&mut *tx).await.unwrap_or(None);
        let (hsn_sac_code, gst_slab_id) = product.unwrap_or((None, None));
        
        let mut effective_rate = item.tax_rate;
        if let Some(ref slab_id) = gst_slab_id {
            if let Some(slab) = crate::commands::tax_utils::get_slab(pool.inner(), slab_id).await {
                effective_rate = crate::commands::tax_utils::resolve_effective_rate(item.rate, &slab);
            }
        }
        
        let raw_amount = final_quantity * item.rate;
        let discount_percent = item.discount_percent.unwrap_or(0.0);
        let discount_amount = if discount_percent > 0.0 { raw_amount * (discount_percent / 100.0) } else { item.discount_amount.unwrap_or(0.0) };
        let net_before_tax = raw_amount - discount_amount;
        
        let (taxable_amount, tax_amount, base_amount, base_rate) = if tax_inclusive {
            let tax_amt = net_before_tax - (net_before_tax / (1.0 + (effective_rate / 100.0)));
            let txbl = net_before_tax - tax_amt;
            let b_amt = txbl + discount_amount;
            (txbl, tax_amt, b_amt, b_amt / final_quantity)
        } else {
            (net_before_tax, net_before_tax * (effective_rate / 100.0), raw_amount, item.rate)
        };
        
        subtotal += taxable_amount;
        
        let mut cgst_rate = 0.0; let mut sgst_rate = 0.0; let mut igst_rate = 0.0;
        let mut cgst_amount = 0.0; let mut sgst_amount = 0.0; let mut igst_amount = 0.0;
        if effective_rate > 0.0 {
            let split = crate::commands::tax_utils::compute_split(taxable_amount, effective_rate, is_inter_state);
            cgst_rate = split.cgst_rate; sgst_rate = split.sgst_rate; igst_rate = split.igst_rate;
            cgst_amount = split.cgst_amount; sgst_amount = split.sgst_amount; igst_amount = split.igst_amount;
            total_cgst += cgst_amount; total_sgst += sgst_amount; total_igst += igst_amount;
        }

        
        processed_items.push(ProcessedVoucherItem {
            id: Uuid::now_v7().to_string(),
            product_id: item.product_id.clone(), description: item.description.clone(), initial_quantity: item.initial_quantity,
            count: item.count, deduction_per_unit: item.deduction_per_unit, final_quantity, unit_id: Some(unit_snapshot.unit_id.clone()),
            base_quantity: unit_snapshot.base_quantity, rate: base_rate, amount: base_amount, discount_percent, discount_amount,
            tax_rate: effective_rate, tax_amount, remarks: item.remarks.clone(), cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
            hsn_sac_code, gst_slab_id, resolved_gst_rate: effective_rate,
        });
    }

    subtotal = round2(subtotal);
    total_cgst = round2(total_cgst);
    total_sgst = round2(total_sgst);
    total_igst = round2(total_igst);
    let discount_amount = round2(invoice.discount_amount.unwrap_or(0.0));
    let total_amount = round2(subtotal - discount_amount);
    let total_tax = round2(total_cgst + total_sgst + total_igst);
    let grand_total = round2(total_amount + total_tax);

    
    let voucher_id = Uuid::now_v7().to_string();
    let _ = sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, salesperson_id, party_type, reference, subtotal, discount_rate, discount_amount, tax_amount, total_amount, narration, status, created_by, tax_inclusive, cgst_amount, sgst_amount, igst_amount, grand_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?)"
    )
    .bind(&voucher_id).bind(&voucher_no).bind("sales_invoice").bind(&invoice.voucher_date).bind(&invoice.customer_id)
    .bind(&invoice.salesperson_id).bind(&invoice.party_type).bind(&invoice.reference).bind(subtotal).bind(invoice.discount_rate.unwrap_or(0.0))
    .bind(discount_amount).bind(total_tax).bind(total_amount).bind(&invoice.narration)
    .bind(&invoice.user_id).bind(tax_inclusive as i64).bind(total_cgst).bind(total_sgst).bind(total_igst).bind(grand_total).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Insert items
    for item in &processed_items {
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, tax_rate, tax_amount, discount_percent, discount_amount, remarks, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, gst_slab_id, resolved_gst_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&item.id).bind(&voucher_id).bind(&item.product_id).bind(&item.description).bind(item.initial_quantity)
        .bind(item.count).bind(item.deduction_per_unit).bind(item.final_quantity).bind(&item.unit_id).bind(item.base_quantity)
        .bind(item.rate).bind(item.amount).bind(item.tax_rate).bind(item.tax_amount).bind(item.discount_percent).bind(item.discount_amount)
        .bind(&item.remarks).bind(item.cgst_rate).bind(item.sgst_rate).bind(item.igst_rate).bind(item.cgst_amount).bind(item.sgst_amount)
        .bind(item.igst_amount).bind(&item.hsn_sac_code).bind(&item.gst_slab_id).bind(item.resolved_gst_rate)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= CREATE JOURNAL ENTRIES =============



    let party_id = invoice.customer_id;
    
    let main_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4001'").fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    
    // Group tax manually
    let mut tax_ledgers: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    for row in &processed_items {
        if row.tax_amount > 0.0 {
            let accounts = crate::commands::tax_utils::resolve_gst_account_names(row.resolved_gst_rate, is_inter_state, false);
            if let Some(cgst_acc) = accounts.cgst_account {
                *tax_ledgers.entry(cgst_acc).or_insert(0.0) += row.cgst_amount;
            }
            if let Some(sgst_acc) = accounts.sgst_account {
                *tax_ledgers.entry(sgst_acc).or_insert(0.0) += row.sgst_amount;
            }
            if let Some(igst_acc) = accounts.igst_account {
                *tax_ledgers.entry(igst_acc).or_insert(0.0) += row.igst_amount;
            }
        }
    }

    

    // Party entry
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(&party_id).bind(grand_total).bind(0.0).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Main entry
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(&main_account).bind(0.0).bind(subtotal).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Discount entry
    if discount_amount > 0.0 {
        let dis_acc: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5007'").fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(dis_acc).bind(discount_amount).bind(0.0).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // Tax entries
    for (acc_name, amt) in tax_ledgers {
        if amt > 0.0 {
            let acc_id = crate::commands::tax_utils::ensure_gst_account_exists(pool.inner(), &acc_name, !false).await?;
            let (dr, cr) = if false { (amt, 0.0) } else { (0.0, amt) };
            
            sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)")
                .bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(acc_id).bind(dr).bind(cr)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_id.to_string())
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
    pool: tauri::State<'_, sqlx::SqlitePool>,
    id: String,
    invoice: CreateSalesInvoice,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;



    let company_state: Option<String> = sqlx::query_scalar("SELECT state FROM company_profile ORDER BY id DESC LIMIT 1").fetch_optional(&mut *tx).await.ok().flatten();
    let party_state: Option<String> = sqlx::query_scalar("SELECT state FROM chart_of_accounts WHERE id = ?").bind(&invoice.customer_id).fetch_optional(&mut *tx).await.ok().flatten();
    let is_inter_state = crate::commands::tax_utils::is_inter_state(company_state.as_deref(), party_state.as_deref());
    let tax_inclusive = invoice.tax_inclusive.unwrap_or(false);

    let mut processed_items = Vec::new();
    let mut subtotal = 0.0;
    let mut total_cgst = 0.0;
    let mut total_sgst = 0.0;
    let mut total_igst = 0.0;

    for item in &invoice.items {
        let final_quantity = item.initial_quantity - (item.count as f64 * item.deduction_per_unit);
        let unit_snapshot = super::resolve_voucher_line_unit(&mut tx, &item.product_id, item.unit_id.as_deref(), "sale", final_quantity).await?;
        
        let product: Option<(Option<String>, Option<String>)> = sqlx::query_as("SELECT hsn_sac_code, gst_slab_id FROM products WHERE id = ?").bind(&item.product_id).fetch_optional(&mut *tx).await.unwrap_or(None);
        let (hsn_sac_code, gst_slab_id) = product.unwrap_or((None, None));
        
        let mut effective_rate = item.tax_rate;
        if let Some(ref slab_id) = gst_slab_id {
            if let Some(slab) = crate::commands::tax_utils::get_slab(pool.inner(), slab_id).await {
                effective_rate = crate::commands::tax_utils::resolve_effective_rate(item.rate, &slab);
            }
        }
        
        let raw_amount = final_quantity * item.rate;
        let discount_percent = item.discount_percent.unwrap_or(0.0);
        let discount_amount = if discount_percent > 0.0 { raw_amount * (discount_percent / 100.0) } else { item.discount_amount.unwrap_or(0.0) };
        let net_before_tax = raw_amount - discount_amount;
        
        let (taxable_amount, tax_amount, base_amount, base_rate) = if tax_inclusive {
            let tax_amt = net_before_tax - (net_before_tax / (1.0 + (effective_rate / 100.0)));
            let txbl = net_before_tax - tax_amt;
            let b_amt = txbl + discount_amount;
            (txbl, tax_amt, b_amt, b_amt / final_quantity)
        } else {
            (net_before_tax, net_before_tax * (effective_rate / 100.0), raw_amount, item.rate)
        };
        
        subtotal += taxable_amount;
        
        let mut cgst_rate = 0.0; let mut sgst_rate = 0.0; let mut igst_rate = 0.0;
        let mut cgst_amount = 0.0; let mut sgst_amount = 0.0; let mut igst_amount = 0.0;
        if effective_rate > 0.0 {
            let split = crate::commands::tax_utils::compute_split(taxable_amount, effective_rate, is_inter_state);
            cgst_rate = split.cgst_rate; sgst_rate = split.sgst_rate; igst_rate = split.igst_rate;
            cgst_amount = split.cgst_amount; sgst_amount = split.sgst_amount; igst_amount = split.igst_amount;
            total_cgst += cgst_amount; total_sgst += sgst_amount; total_igst += igst_amount;
        }

        
        processed_items.push(ProcessedVoucherItem {
            id: Uuid::now_v7().to_string(),
            product_id: item.product_id.clone(), description: item.description.clone(), initial_quantity: item.initial_quantity,
            count: item.count, deduction_per_unit: item.deduction_per_unit, final_quantity, unit_id: Some(unit_snapshot.unit_id.clone()),
            base_quantity: unit_snapshot.base_quantity, rate: base_rate, amount: base_amount, discount_percent, discount_amount,
            tax_rate: effective_rate, tax_amount, remarks: item.remarks.clone(), cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount,
            hsn_sac_code, gst_slab_id, resolved_gst_rate: effective_rate,
        });
    }

    subtotal = round2(subtotal);
    total_cgst = round2(total_cgst);
    total_sgst = round2(total_sgst);
    total_igst = round2(total_igst);
    let discount_amount = round2(invoice.discount_amount.unwrap_or(0.0));
    let total_amount = round2(subtotal - discount_amount);
    let total_tax = round2(total_cgst + total_sgst + total_igst);
    let grand_total = round2(total_amount + total_tax);

    let voucher_id = id;
    let _ = sqlx::query(
        "UPDATE vouchers 
         SET voucher_date = ?, party_id = ?, salesperson_id = ?, party_type = ?, reference = ?, subtotal = ?, 
             discount_rate = ?, discount_amount = ?, tax_amount = ?, total_amount = ?, narration = ?,
             tax_inclusive = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?, grand_total = ?
         WHERE id = ?"
    )
    .bind(&invoice.voucher_date).bind(&invoice.customer_id).bind(&invoice.salesperson_id).bind(&invoice.party_type).bind(&invoice.reference)
    .bind(subtotal).bind(invoice.discount_rate.unwrap_or(0.0)).bind(discount_amount)
    .bind(total_tax).bind(total_amount).bind(&invoice.narration)
    .bind(tax_inclusive as i64).bind(total_cgst).bind(total_sgst).bind(total_igst)
    .bind(grand_total).bind(&voucher_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?").bind(&voucher_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Insert items
    for item in &processed_items {
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, tax_rate, tax_amount, discount_percent, discount_amount, remarks, cgst_rate, sgst_rate, igst_rate, cgst_amount, sgst_amount, igst_amount, hsn_sac_code, gst_slab_id, resolved_gst_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&item.id).bind(&voucher_id).bind(&item.product_id).bind(&item.description).bind(item.initial_quantity)
        .bind(item.count).bind(item.deduction_per_unit).bind(item.final_quantity).bind(&item.unit_id).bind(item.base_quantity)
        .bind(item.rate).bind(item.amount).bind(item.tax_rate).bind(item.tax_amount).bind(item.discount_percent).bind(item.discount_amount)
        .bind(&item.remarks).bind(item.cgst_rate).bind(item.sgst_rate).bind(item.igst_rate).bind(item.cgst_amount).bind(item.sgst_amount)
        .bind(item.igst_amount).bind(&item.hsn_sac_code).bind(&item.gst_slab_id).bind(item.resolved_gst_rate)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= CREATE JOURNAL ENTRIES =============

    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?").bind(&voucher_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    let party_id = invoice.customer_id;
    
    let main_account: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4001'").fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
    
    // Group tax manually
    let mut tax_ledgers: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
    for row in &processed_items {
        if row.tax_amount > 0.0 {
            let accounts = crate::commands::tax_utils::resolve_gst_account_names(row.resolved_gst_rate, is_inter_state, false);
            if let Some(cgst_acc) = accounts.cgst_account {
                *tax_ledgers.entry(cgst_acc).or_insert(0.0) += row.cgst_amount;
            }
            if let Some(sgst_acc) = accounts.sgst_account {
                *tax_ledgers.entry(sgst_acc).or_insert(0.0) += row.sgst_amount;
            }
            if let Some(igst_acc) = accounts.igst_account {
                *tax_ledgers.entry(igst_acc).or_insert(0.0) += row.igst_amount;
            }
        }
    }

    

    // Party entry
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(&party_id).bind(grand_total).bind(0.0).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Main entry
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(&main_account).bind(0.0).bind(subtotal).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Discount entry
    if discount_amount > 0.0 {
        let dis_acc: String = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5007'").fetch_one(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)").bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(dis_acc).bind(discount_amount).bind(0.0).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // Tax entries
    for (acc_name, amt) in tax_ledgers {
        if amt > 0.0 {
            let acc_id = crate::commands::tax_utils::ensure_gst_account_exists(pool.inner(), &acc_name, !false).await?;
            let (dr, cr) = if false { (amt, 0.0) } else { (0.0, amt) };
            
            sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)")
                .bind(Uuid::now_v7().to_string()).bind(&voucher_id).bind(acc_id).bind(dr).bind(cr)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_id.to_string())
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
            COALESCE(coa.account_name, CASE WHEN v.voucher_type = 'journal' THEN 'Journal Entry' WHEN v.voucher_type = 'opening_balance' THEN 'Opening Balance' WHEN v.voucher_type = 'opening_stock' THEN 'Opening Stock' WHEN v.voucher_type = 'stock_journal' THEN 'Stock Journal' ELSE 'N/A' END) as party_name,
            ROUND(
                CASE
                    WHEN v.voucher_type IN ('sales_invoice', 'purchase_invoice', 'sales_return', 'purchase_return')
                        THEN COALESCE(v.subtotal, v.total_amount, 0.0) - COALESCE(v.discount_amount, 0.0) + COALESCE(v.tax_amount, 0.0)
                    ELSE COALESCE(v.grand_total, v.total_amount, 0.0)
                END,
                2
            ) as total_amount,
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
