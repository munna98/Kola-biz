use crate::company_db::DbRegistry;
use crate::voucher_seq::get_next_voucher_number_in_tx;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ==================== OUTPUT STRUCTS ====================

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct CustomOrder {
    pub id: String,
    pub order_no: String,
    pub order_date: String,
    pub delivery_date: Option<String>,
    pub customer_id: String,
    pub customer_name: String,
    pub status: String,
    pub finished_item_name: String,
    pub finished_item_qty: f64,
    pub finished_item_unit: Option<String>,
    pub sale_price: f64,
    pub advance_amount: f64,
    pub advance_voucher_id: Option<String>,
    pub total_material_cost: f64,
    pub total_purchase_cost: f64,
    pub total_service_cost: f64,
    pub total_job_cost: f64,
    pub final_invoice_id: Option<String>,
    pub final_invoice_no: Option<String>,
    pub reference: Option<String>,
    pub payment_status: String,
    pub total_paid: f64,
    pub balance_due: f64,
    pub narration: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct CustomOrderMaterial {
    pub id: String,
    pub order_id: String,
    pub product_id: String,
    pub product_name: String,
    pub product_code: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub unit_id: Option<String>,
    pub unit_name: Option<String>,
    pub rate: f64,
    pub amount: f64,
    pub stock_journal_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct CustomOrderPurchase {
    pub id: String,
    pub order_id: String,
    pub description: String,
    pub supplier_id: Option<String>,
    pub supplier_name: Option<String>,
    pub quantity: f64,
    pub unit_id: Option<String>,
    pub rate: f64,
    pub amount: f64,
    pub expense_account: Option<String>,
    pub purchase_date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct CustomOrderService {
    pub id: String,
    pub order_id: String,
    pub service_id: Option<String>,
    pub description: String,
    pub quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub expense_account: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CustomOrderDetail {
    pub order: CustomOrder,
    pub materials: Vec<CustomOrderMaterial>,
    pub purchases: Vec<CustomOrderPurchase>,
    pub services: Vec<CustomOrderService>,
}

// ==================== INPUT STRUCTS ====================

#[derive(Debug, Deserialize)]
pub struct CreateCustomOrderMaterial {
    pub product_id: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub unit_id: Option<String>,
    pub rate: f64,
    pub amount: f64,
}

#[derive(Debug, Deserialize)]
pub struct CreateCustomOrderPurchase {
    pub description: String,
    pub supplier_id: Option<String>,
    pub quantity: f64,
    pub unit_id: Option<String>,
    pub rate: f64,
    pub amount: f64,
    pub expense_account: Option<String>,
    pub purchase_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCustomOrderService {
    pub service_id: Option<String>,
    pub description: String,
    pub quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub expense_account: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCustomOrder {
    pub order_date: String,
    pub delivery_date: Option<String>,
    pub customer_id: String,
    pub finished_item_name: String,
    pub finished_item_qty: f64,
    pub finished_item_unit: Option<String>,
    pub sale_price: f64,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub materials: Vec<CreateCustomOrderMaterial>,
    pub purchases: Vec<CreateCustomOrderPurchase>,
    pub services: Vec<CreateCustomOrderService>,
    pub user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RecordAdvancePayload {
    pub order_id: String,
    pub amount: f64,
    pub payment_date: String,
    pub cash_bank_account_id: String,
    pub narration: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct FinalizeCustomOrderPayload {
    pub order_id: String,
    pub voucher_date: String,
    pub sale_price: f64,
    pub tax_rate: f64,
    pub gst_disabled: bool,
    pub narration: Option<String>,
    pub user_id: Option<String>,
}

// ==================== HELPERS ====================

fn compute_totals(
    materials: &[CreateCustomOrderMaterial],
    purchases: &[CreateCustomOrderPurchase],
    services: &[CreateCustomOrderService],
) -> (f64, f64, f64, f64) {
    let mat: f64 = materials.iter().map(|m| m.amount).sum();
    let pur: f64 = purchases.iter().map(|p| p.amount).sum();
    let svc: f64 = services.iter().map(|s| s.amount).sum();
    (mat, pur, svc, mat + pur + svc)
}

async fn insert_material_with_stock_journal(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    order_id: &str,
    order_no: &str,
    order_date: &str,
    user_id: Option<&str>,
    mat: &CreateCustomOrderMaterial,
) -> Result<(), String> {
    let mat_id = Uuid::now_v7().to_string();
    let sj_voucher_no = get_next_voucher_number_in_tx(tx, "stock_journal").await?;
    let sj_voucher_id = Uuid::now_v7().to_string();
    let sj_narration = format!("Material used for custom order {}", order_no);

    sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, total_amount, narration, status, created_by)
         VALUES (?, ?, 'stock_journal', ?, ?, ?, 'posted', ?)",
    )
    .bind(&sj_voucher_id)
    .bind(&sj_voucher_no)
    .bind(order_date)
    .bind(mat.amount)
    .bind(&sj_narration)
    .bind(user_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    let vi_id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, unit_id, base_quantity, rate, amount, remarks)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'source')",
    )
    .bind(&vi_id)
    .bind(&sj_voucher_id)
    .bind(&mat.product_id)
    .bind(&mat.description)
    .bind(mat.quantity)
    .bind(&mat.unit_id)
    .bind(mat.quantity)
    .bind(mat.rate)
    .bind(mat.amount)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    let sm_id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount, cost_rate, cost_amount)
         VALUES (?, ?, ?, 'OUT', ?, 0, ?, ?, ?, ?)",
    )
    .bind(&sm_id)
    .bind(&sj_voucher_id)
    .bind(&mat.product_id)
    .bind(mat.quantity)
    .bind(mat.rate)
    .bind(mat.amount)
    .bind(mat.rate)
    .bind(mat.amount)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO custom_order_materials (id, order_id, product_id, description, quantity, unit_id, rate, amount, stock_journal_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&mat_id)
    .bind(order_id)
    .bind(&mat.product_id)
    .bind(&mat.description)
    .bind(mat.quantity)
    .bind(&mat.unit_id)
    .bind(mat.rate)
    .bind(mat.amount)
    .bind(&sj_voucher_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

async fn reverse_stock_journals_for_order(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    order_id: &str,
) -> Result<(), String> {
    let sj_ids: Vec<String> = sqlx::query_scalar(
        "SELECT stock_journal_id FROM custom_order_materials WHERE order_id = ? AND stock_journal_id IS NOT NULL",
    )
    .bind(order_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    for sj_id in &sj_ids {
        sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
            .bind(sj_id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
            .bind(sj_id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(sj_id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

async fn insert_purchase_with_journal_entry(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    order_id: &str,
    order_no: &str,
    order_date: &str,
    user_id: Option<&str>,
    pur: &CreateCustomOrderPurchase,
) -> Result<(), String> {
    let pur_id = Uuid::now_v7().to_string();
    let purchase_date = pur.purchase_date.as_deref().unwrap_or(order_date);

    let mut journal_voucher_id: Option<String> = None;

    if pur.amount > 0.0 {
        // 1. Determine credit account: selected supplier (AP) or default Cash account
        let (credit_account_id, party_id, party_type) = if let Some(supp_id) = &pur.supplier_id {
            if !supp_id.trim().is_empty() {
                let coa_id: Option<String> = sqlx::query_scalar(
                    "SELECT id FROM chart_of_accounts WHERE (id = ?1 OR party_id = ?1) AND deleted_at IS NULL LIMIT 1"
                )
                .bind(supp_id)
                .fetch_optional(&mut **tx)
                .await
                .map_err(|e| e.to_string())?;

                let acc_id = coa_id.unwrap_or_else(|| supp_id.clone());
                (acc_id, Some(supp_id.clone()), Some("supplier".to_string()))
            } else {
                let cash_acc_id: String = sqlx::query_scalar(
                    "SELECT id FROM chart_of_accounts WHERE (account_code = '1001' OR account_group = 'Cash') AND deleted_at IS NULL ORDER BY account_code ASC LIMIT 1"
                )
                .fetch_optional(&mut **tx)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Default Cash account not found in Chart of Accounts".to_string())?;
                (cash_acc_id, None, None)
            }
        } else {
            let cash_acc_id: String = sqlx::query_scalar(
                "SELECT id FROM chart_of_accounts WHERE (account_code = '1001' OR account_group = 'Cash') AND deleted_at IS NULL ORDER BY account_code ASC LIMIT 1"
            )
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Default Cash account not found in Chart of Accounts".to_string())?;
            (cash_acc_id, None, None)
        };

        // 2. Determine debit expense account: custom expense account or Job Material Cost (6010)
        let job_material_acc_id: String = if let Some(exp_acc) = &pur.expense_account {
            if !exp_acc.trim().is_empty() {
                exp_acc.clone()
            } else {
                sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '6010' LIMIT 1")
                    .fetch_optional(&mut **tx)
                    .await
                    .map_err(|e| e.to_string())?
                    .ok_or_else(|| "Job Material Cost account (6010) not found in Chart of Accounts".to_string())?
            }
        } else {
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '6010' LIMIT 1")
                .fetch_optional(&mut **tx)
                .await
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "Job Material Cost account (6010) not found in Chart of Accounts".to_string())?
        };

        // 3. Create journal voucher
        let j_no = get_next_voucher_number_in_tx(&mut *tx, "journal").await?;
        let j_id = Uuid::now_v7().to_string();
        let narration = format!("Direct material for custom order {}: {}", order_no, pur.description);

        sqlx::query(
            "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type, total_amount, grand_total, narration, status, created_by)
             VALUES (?, ?, 'journal', ?, ?, ?, ?, ?, ?, 'posted', ?)"
        )
        .bind(&j_id)
        .bind(&j_no)
        .bind(purchase_date)
        .bind(&party_id)
        .bind(&party_type)
        .bind(pur.amount)
        .bind(pur.amount)
        .bind(&narration)
        .bind(user_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

        // 4. Debit: Job Material Cost
        let je_dr = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, ?, 0, ?)"
        )
        .bind(&je_dr)
        .bind(&j_id)
        .bind(&job_material_acc_id)
        .bind(pur.amount)
        .bind(&narration)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

        // 5. Credit: Supplier AP or Cash
        let je_cr = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
             VALUES (?, ?, ?, 0, ?, ?)"
        )
        .bind(&je_cr)
        .bind(&j_id)
        .bind(&credit_account_id)
        .bind(pur.amount)
        .bind(&narration)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

        journal_voucher_id = Some(j_id);
    }

    // 6. Insert into custom_order_purchases with voucher_id
    sqlx::query(
        "INSERT INTO custom_order_purchases (id, order_id, description, supplier_id, quantity, unit_id, rate, amount, expense_account, purchase_date, voucher_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&pur_id)
    .bind(order_id)
    .bind(&pur.description)
    .bind(&pur.supplier_id)
    .bind(pur.quantity)
    .bind(&pur.unit_id)
    .bind(pur.rate)
    .bind(pur.amount)
    .bind(&pur.expense_account)
    .bind(&pur.purchase_date)
    .bind(&journal_voucher_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

async fn reverse_order_purchases_journals(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    order_id: &str,
) -> Result<(), String> {
    let voucher_ids: Vec<String> = sqlx::query_scalar(
        "SELECT voucher_id FROM custom_order_purchases WHERE order_id = ? AND voucher_id IS NOT NULL",
    )
    .bind(order_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    for v_id in voucher_ids {
        sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
            .bind(&v_id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(&v_id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ==================== COMMANDS ====================

#[tauri::command]
pub async fn list_custom_orders(
    registry: State<'_, Arc<DbRegistry>>,
    status: Option<String>,
    customer_id: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
) -> Result<Vec<CustomOrder>, String> {
    let pool = registry.active_pool().await?;

    sqlx::query_as::<_, CustomOrder>(
        "SELECT
            co.id, co.order_no, co.order_date, co.delivery_date,
            co.customer_id,
            COALESCE(coa.account_name, c.name, '') as customer_name,
            co.status, co.finished_item_name, co.finished_item_qty, co.finished_item_unit,
            co.sale_price, co.advance_amount, co.advance_voucher_id,
            co.total_material_cost, co.total_purchase_cost, co.total_service_cost, co.total_job_cost,
            co.final_invoice_id,
            inv.voucher_no as final_invoice_no,
            co.reference,
            CASE
                WHEN (
                    CASE
                        WHEN co.final_invoice_id IS NOT NULL THEN
                            MAX(co.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = co.final_invoice_id), 0.0))
                        ELSE co.advance_amount
                    END
                ) >= co.sale_price AND co.sale_price > 0 THEN 'paid'
                ELSE 'pending'
            END as payment_status,
            CASE
                WHEN co.final_invoice_id IS NOT NULL THEN
                    MAX(co.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = co.final_invoice_id), 0.0))
                ELSE co.advance_amount
            END as total_paid,
            MAX(0.0, co.sale_price - (
                CASE
                    WHEN co.final_invoice_id IS NOT NULL THEN
                        MAX(co.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = co.final_invoice_id), 0.0))
                    ELSE co.advance_amount
                END
            )) as balance_due,
            co.narration, co.created_at
         FROM custom_orders co
         LEFT JOIN chart_of_accounts coa ON co.customer_id = coa.id OR co.customer_id = coa.party_id
         LEFT JOIN customers c ON co.customer_id = c.id
         LEFT JOIN vouchers inv ON co.final_invoice_id = inv.id
         WHERE co.deleted_at IS NULL
           AND (? IS NULL OR co.status = ?)
           AND (? IS NULL OR co.customer_id = ?)
           AND (? IS NULL OR co.order_date >= ?)
           AND (? IS NULL OR co.order_date <= ?)
         ORDER BY co.order_date DESC, co.order_no DESC",
    )
    .bind(&status)
    .bind(&status)
    .bind(&customer_id)
    .bind(&customer_id)
    .bind(&from_date)
    .bind(&from_date)
    .bind(&to_date)
    .bind(&to_date)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_custom_order(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<CustomOrderDetail, String> {
    let pool = registry.active_pool().await?;

    let order = sqlx::query_as::<_, CustomOrder>(
        "SELECT
            co.id, co.order_no, co.order_date, co.delivery_date,
            co.customer_id,
            COALESCE(coa.account_name, c.name, '') as customer_name,
            co.status, co.finished_item_name, co.finished_item_qty, co.finished_item_unit,
            co.sale_price, co.advance_amount, co.advance_voucher_id,
            co.total_material_cost, co.total_purchase_cost, co.total_service_cost, co.total_job_cost,
            co.final_invoice_id,
            inv.voucher_no as final_invoice_no,
            co.reference,
            CASE
                WHEN (
                    CASE
                        WHEN co.final_invoice_id IS NOT NULL THEN
                            MAX(co.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = co.final_invoice_id), 0.0))
                        ELSE co.advance_amount
                    END
                ) >= co.sale_price AND co.sale_price > 0 THEN 'paid'
                ELSE 'pending'
            END as payment_status,
            CASE
                WHEN co.final_invoice_id IS NOT NULL THEN
                    MAX(co.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = co.final_invoice_id), 0.0))
                ELSE co.advance_amount
            END as total_paid,
            MAX(0.0, co.sale_price - (
                CASE
                    WHEN co.final_invoice_id IS NOT NULL THEN
                        MAX(co.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = co.final_invoice_id), 0.0))
                    ELSE co.advance_amount
                END
            )) as balance_due,
            co.narration, co.created_at
         FROM custom_orders co
         LEFT JOIN chart_of_accounts coa ON co.customer_id = coa.id OR co.customer_id = coa.party_id
         LEFT JOIN customers c ON co.customer_id = c.id
         LEFT JOIN vouchers inv ON co.final_invoice_id = inv.id
         WHERE co.id = ? AND co.deleted_at IS NULL",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Custom order not found".to_string())?;

    let materials = sqlx::query_as::<_, CustomOrderMaterial>(
        "SELECT
            com.id, com.order_id, com.product_id,
            COALESCE(p.name, '') as product_name,
            COALESCE(p.code, '') as product_code,
            com.description, com.quantity, com.unit_id,
            u.name as unit_name,
            com.rate, com.amount, com.stock_journal_id
         FROM custom_order_materials com
         LEFT JOIN products p ON com.product_id = p.id
         LEFT JOIN units u ON com.unit_id = u.id
         WHERE com.order_id = ?
         ORDER BY com.created_at ASC",
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let purchases = sqlx::query_as::<_, CustomOrderPurchase>(
        "SELECT
            cop.id, cop.order_id, cop.description,
            cop.supplier_id,
            COALESCE(coa.account_name, s.name, 'Cash') as supplier_name,
            cop.quantity, cop.unit_id, cop.rate, cop.amount,
            cop.expense_account, cop.purchase_date
         FROM custom_order_purchases cop
         LEFT JOIN chart_of_accounts coa ON cop.supplier_id = coa.id OR cop.supplier_id = coa.party_id
         LEFT JOIN suppliers s ON cop.supplier_id = s.id
         WHERE cop.order_id = ?
         ORDER BY cop.created_at ASC",
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let services = sqlx::query_as::<_, CustomOrderService>(
        "SELECT id, order_id, service_id, description, quantity, rate, amount, expense_account
         FROM custom_order_services
         WHERE order_id = ?
         ORDER BY created_at ASC",
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(CustomOrderDetail { order, materials, purchases, services })
}

/// Look up custom order associated with a final sales invoice
#[tauri::command]
pub async fn get_custom_order_by_invoice(
    registry: State<'_, Arc<DbRegistry>>,
    invoice_id: String,
) -> Result<Option<CustomOrder>, String> {
    let pool = registry.active_pool().await?;

    let order = sqlx::query_as::<_, CustomOrder>(
        "SELECT
            co.id, co.order_no, co.order_date, co.delivery_date,
            co.customer_id,
            COALESCE(coa.account_name, c.name, '') as customer_name,
            co.status, co.finished_item_name, co.finished_item_qty, co.finished_item_unit,
            co.sale_price, co.advance_amount, co.advance_voucher_id,
            co.total_material_cost, co.total_purchase_cost, co.total_service_cost, co.total_job_cost,
            co.final_invoice_id,
            inv.voucher_no as final_invoice_no,
            co.reference,
            CASE
                WHEN (
                    CASE
                        WHEN co.final_invoice_id IS NOT NULL THEN
                            MAX(co.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = co.final_invoice_id), 0.0))
                        ELSE co.advance_amount
                    END
                ) >= co.sale_price AND co.sale_price > 0 THEN 'paid'
                ELSE 'pending'
            END as payment_status,
            CASE
                WHEN co.final_invoice_id IS NOT NULL THEN
                    MAX(co.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = co.final_invoice_id), 0.0))
                ELSE co.advance_amount
            END as total_paid,
            MAX(0.0, co.sale_price - (
                CASE
                    WHEN co.final_invoice_id IS NOT NULL THEN
                        MAX(co.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = co.final_invoice_id), 0.0))
                    ELSE co.advance_amount
                END
            )) as balance_due,
            co.narration, co.created_at
         FROM custom_orders co
         LEFT JOIN chart_of_accounts coa ON co.customer_id = coa.id OR co.customer_id = coa.party_id
         LEFT JOIN customers c ON co.customer_id = c.id
         LEFT JOIN vouchers inv ON co.final_invoice_id = inv.id
         WHERE co.final_invoice_id = ? AND co.deleted_at IS NULL
         LIMIT 1",
    )
    .bind(&invoice_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(order)
}

#[tauri::command]
pub async fn create_custom_order(
    registry: State<'_, Arc<DbRegistry>>,
    data: CreateCustomOrder,
) -> Result<String, String> {
    if data.customer_id.trim().is_empty() {
        return Err("Customer is required".to_string());
    }
    if data.finished_item_name.trim().is_empty() {
        return Err("Finished item name is required".to_string());
    }

    let pool = registry.active_pool().await?;
    let order_id = Uuid::now_v7().to_string();
    let (mat_cost, pur_cost, svc_cost, total_cost) =
        compute_totals(&data.materials, &data.purchases, &data.services);

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let order_no = get_next_voucher_number_in_tx(&mut tx, "custom_order").await?;

    sqlx::query(
        "INSERT INTO custom_orders
         (id, order_no, order_date, delivery_date, customer_id, status,
          finished_item_name, finished_item_qty, finished_item_unit,
          sale_price, reference, total_material_cost, total_purchase_cost, total_service_cost, total_job_cost,
          narration, created_by)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&order_id)
    .bind(&order_no)
    .bind(&data.order_date)
    .bind(&data.delivery_date)
    .bind(&data.customer_id)
    .bind(&data.finished_item_name)
    .bind(data.finished_item_qty)
    .bind(&data.finished_item_unit)
    .bind(data.sale_price)
    .bind(&data.reference)
    .bind(mat_cost)
    .bind(pur_cost)
    .bind(svc_cost)
    .bind(total_cost)
    .bind(&data.narration)
    .bind(&data.user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for mat in &data.materials {
        insert_material_with_stock_journal(
            &mut tx, &order_id, &order_no,
            &data.order_date, data.user_id.as_deref(), mat,
        ).await?;
    }

    for pur in &data.purchases {
        insert_purchase_with_journal_entry(
            &mut tx, &order_id, &order_no,
            &data.order_date, data.user_id.as_deref(), pur,
        ).await?;
    }

    for svc in &data.services {
        let svc_id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO custom_order_services (id, order_id, service_id, description, quantity, rate, amount, expense_account)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&svc_id).bind(&order_id).bind(&svc.service_id).bind(&svc.description)
        .bind(svc.quantity).bind(svc.rate).bind(svc.amount).bind(&svc.expense_account)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(order_id)
}

#[tauri::command]
pub async fn update_custom_order(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    data: CreateCustomOrder,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;

    let status: Option<String> =
        sqlx::query_scalar("SELECT status FROM custom_orders WHERE id = ? AND deleted_at IS NULL")
            .bind(&id).fetch_optional(&pool).await.map_err(|e| e.to_string())?;

    match status.as_deref() {
        Some("delivered") => return Err("Cannot edit a delivered order".to_string()),
        None => return Err("Custom order not found".to_string()),
        _ => {}
    }

    let order_no: String = sqlx::query_scalar("SELECT order_no FROM custom_orders WHERE id = ?")
        .bind(&id).fetch_one(&pool).await.map_err(|e| e.to_string())?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    reverse_stock_journals_for_order(&mut tx, &id).await?;
    reverse_order_purchases_journals(&mut tx, &id).await?;

    sqlx::query("DELETE FROM custom_order_materials WHERE order_id = ?")
        .bind(&id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM custom_order_purchases WHERE order_id = ?")
        .bind(&id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM custom_order_services WHERE order_id = ?")
        .bind(&id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    let (mat_cost, pur_cost, svc_cost, total_cost) =
        compute_totals(&data.materials, &data.purchases, &data.services);

    sqlx::query(
        "UPDATE custom_orders SET
         order_date=?, delivery_date=?, customer_id=?,
         finished_item_name=?, finished_item_qty=?, finished_item_unit=?,
         sale_price=?, reference=?,
         total_material_cost=?, total_purchase_cost=?, total_service_cost=?, total_job_cost=?,
         narration=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
    )
    .bind(&data.order_date).bind(&data.delivery_date).bind(&data.customer_id)
    .bind(&data.finished_item_name).bind(data.finished_item_qty).bind(&data.finished_item_unit)
    .bind(data.sale_price).bind(&data.reference)
    .bind(mat_cost).bind(pur_cost).bind(svc_cost).bind(total_cost)
    .bind(&data.narration).bind(&id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    for mat in &data.materials {
        insert_material_with_stock_journal(
            &mut tx, &id, &order_no,
            &data.order_date, data.user_id.as_deref(), mat,
        ).await?;
    }

    for pur in &data.purchases {
        insert_purchase_with_journal_entry(
            &mut tx, &id, &order_no,
            &data.order_date, data.user_id.as_deref(), pur,
        ).await?;
    }

    for svc in &data.services {
        let svc_id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO custom_order_services (id, order_id, service_id, description, quantity, rate, amount, expense_account)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&svc_id).bind(&id).bind(&svc.service_id).bind(&svc.description)
        .bind(svc.quantity).bind(svc.rate).bind(svc.amount).bind(&svc.expense_account)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_custom_order(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;

    let status: Option<String> =
        sqlx::query_scalar("SELECT status FROM custom_orders WHERE id = ? AND deleted_at IS NULL")
            .bind(&id).fetch_optional(&pool).await.map_err(|e| e.to_string())?;

    match status.as_deref() {
        None => return Err("Custom order not found".to_string()),
        Some("delivered") => return Err("Cannot delete a delivered order. It has a final invoice.".to_string()),
        _ => {}
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    reverse_stock_journals_for_order(&mut tx, &id).await?;
    reverse_order_purchases_journals(&mut tx, &id).await?;
    sqlx::query("UPDATE custom_orders SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn record_custom_order_advance(
    registry: State<'_, Arc<DbRegistry>>,
    payload: RecordAdvancePayload,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;

    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT customer_id, order_no FROM custom_orders WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&payload.order_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (customer_id, order_no) = row.ok_or_else(|| "Custom order not found".to_string())?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let customer_account_id: String = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE (id = ?1 OR party_id = ?1) AND deleted_at IS NULL LIMIT 1",
    )
    .bind(&customer_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .unwrap_or_else(|| customer_id.clone());

    let receipt_no = get_next_voucher_number_in_tx(&mut tx, "receipt").await?;
    let receipt_id = Uuid::now_v7().to_string();
    let narration = payload.narration.clone()
        .unwrap_or_else(|| format!("Advance received for custom order {}", order_no));

    sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type,
          total_amount, grand_total, narration, status, payment_status, account_id, created_by)
         VALUES (?, ?, 'receipt', ?, ?, 'customer', ?, ?, ?, 'posted', 'paid', ?, ?)",
    )
    .bind(&receipt_id).bind(&receipt_no).bind(&payload.payment_date).bind(&customer_account_id)
    .bind(payload.amount).bind(payload.amount).bind(&narration)
    .bind(&payload.cash_bank_account_id).bind(&payload.user_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    let je1_id = Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, ?, 0, ?)")
        .bind(&je1_id).bind(&receipt_id).bind(&payload.cash_bank_account_id)
        .bind(payload.amount).bind(&narration)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    let je2_id = Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
        .bind(&je2_id).bind(&receipt_id).bind(&customer_account_id)
        .bind(payload.amount).bind(&narration)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE custom_orders SET advance_amount=?, advance_voucher_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(payload.amount).bind(&receipt_id).bind(&payload.order_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(receipt_id)
}

#[tauri::command]
pub async fn finalize_custom_order(
    registry: State<'_, Arc<DbRegistry>>,
    payload: FinalizeCustomOrderPayload,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;

    let status: String = sqlx::query_scalar("SELECT status FROM custom_orders WHERE id = ? AND deleted_at IS NULL")
        .bind(&payload.order_id).fetch_optional(&pool).await.map_err(|e| e.to_string())?
        .ok_or_else(|| "Custom order not found".to_string())?;

    if status == "delivered" {
        return Err("Order is already finalized".to_string());
    }

    let customer_id: String = sqlx::query_scalar("SELECT customer_id FROM custom_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let order_no: String = sqlx::query_scalar("SELECT order_no FROM custom_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let finished_item_name: String = sqlx::query_scalar("SELECT finished_item_name FROM custom_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let advance_amount: f64 = sqlx::query_scalar("SELECT COALESCE(advance_amount, 0) FROM custom_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let advance_voucher_id: Option<String> = sqlx::query_scalar("SELECT advance_voucher_id FROM custom_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let total_material_cost: f64 = sqlx::query_scalar("SELECT COALESCE(total_material_cost, 0) FROM custom_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let total_purchase_cost: f64 = sqlx::query_scalar("SELECT COALESCE(total_purchase_cost, 0) FROM custom_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let total_service_cost: f64 = sqlx::query_scalar("SELECT COALESCE(total_service_cost, 0) FROM custom_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let total_job_cost: f64 = sqlx::query_scalar("SELECT COALESCE(total_job_cost, 0) FROM custom_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let customer_account_id: String = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE (id = ?1 OR party_id = ?1) AND deleted_at IS NULL LIMIT 1",
    )
    .bind(&customer_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .unwrap_or_else(|| customer_id.clone());

    let sale_price = payload.sale_price;
    let tax_rate = payload.tax_rate;
    let tax_amount = if payload.gst_disabled { 0.0 } else {
        (sale_price * tax_rate / 100.0 * 100.0).round() / 100.0
    };
    let grand_total = sale_price + tax_amount;

    let sales_account_id: String = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE account_code = '4001' LIMIT 1",
    )
    .fetch_one(&mut *tx).await.map_err(|e| format!("Sales account (4001) not found: {}", e))?;

    let cogs_account_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE account_code = '6012' LIMIT 1",
    ).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;

    let inventory_account_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE account_name LIKE '%Inventory%' OR account_name LIKE '%Stock%' ORDER BY account_code LIMIT 1",
    ).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;

    let job_mat_account_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE account_code = '6010' LIMIT 1",
    ).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;

    let job_svc_account_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE account_code = '6011' LIMIT 1",
    ).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;

    let inv_no = get_next_voucher_number_in_tx(&mut tx, "sales_invoice").await?;
    let inv_id = Uuid::now_v7().to_string();
    let narration = payload.narration.clone()
        .unwrap_or_else(|| format!("Custom order {} - final invoice", order_no));

    sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type,
          subtotal, tax_amount, total_amount, grand_total, narration, status, payment_status, created_by, gst_disabled)
         VALUES (?, ?, 'sales_invoice', ?, ?, 'customer', ?, ?, ?, ?, ?, 'posted', 'unpaid', ?, ?)",
    )
    .bind(&inv_id).bind(&inv_no).bind(&payload.voucher_date).bind(&customer_account_id)
    .bind(sale_price).bind(tax_amount).bind(sale_price).bind(grand_total)
    .bind(&narration).bind(&payload.user_id)
    .bind(if payload.gst_disabled { 1i64 } else { 0i64 })
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    let vi_id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO voucher_items (id, voucher_id, item_type, description, initial_quantity, count, final_quantity, base_quantity, rate, amount, tax_rate, tax_amount)
         VALUES (?, ?, 'service', ?, 1.0, 1, 1.0, 1.0, ?, ?, ?, ?)",
    )
    .bind(&vi_id).bind(&inv_id).bind(&finished_item_name)
    .bind(sale_price).bind(sale_price).bind(tax_rate).bind(tax_amount)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Dr Customer A/c
    let je_cust = Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, ?, 0, ?)")
        .bind(&je_cust).bind(&inv_id).bind(&customer_account_id).bind(grand_total).bind(&narration)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Cr Sales A/c
    let je_sales = Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
        .bind(&je_sales).bind(&inv_id).bind(&sales_account_id).bind(sale_price).bind(&narration)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    if total_job_cost > 0.0 {
        if let Some(cogs_acc) = &cogs_account_id {
            let je_cogs = Uuid::now_v7().to_string();
            sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, ?, 0, ?)")
                .bind(&je_cogs).bind(&inv_id).bind(cogs_acc).bind(total_job_cost).bind(&narration)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;

            if total_material_cost > 0.0 {
                if let Some(inv_acc) = &inventory_account_id {
                    let je_inv = Uuid::now_v7().to_string();
                    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
                        .bind(&je_inv).bind(&inv_id).bind(inv_acc).bind(total_material_cost).bind(&narration)
                        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                }
            }

            if total_purchase_cost > 0.0 {
                if let Some(jm_acc) = &job_mat_account_id {
                    let je_jm = Uuid::now_v7().to_string();
                    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
                        .bind(&je_jm).bind(&inv_id).bind(jm_acc).bind(total_purchase_cost).bind(&narration)
                        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                }
            }

            if total_service_cost > 0.0 {
                if let Some(js_acc) = &job_svc_account_id {
                    let je_js = Uuid::now_v7().to_string();
                    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
                        .bind(&je_js).bind(&inv_id).bind(js_acc).bind(total_service_cost).bind(&narration)
                        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                }
            }
        }
    }

    if advance_amount > 0.0 {
        if let Some(adv_voucher_id) = &advance_voucher_id {
            let apply_amount = advance_amount.min(grand_total);
            let alloc_id = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO payment_allocations (id, payment_voucher_id, invoice_voucher_id, allocated_amount, allocation_date, party_id, party_type)
                 VALUES (?, ?, ?, ?, ?, ?, 'customer')",
            )
            .bind(&alloc_id).bind(adv_voucher_id).bind(&inv_id)
            .bind(apply_amount).bind(&payload.voucher_date).bind(&customer_id)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;

            let payment_status = if apply_amount >= grand_total { "paid" } else { "partially_paid" };
            sqlx::query("UPDATE vouchers SET payment_status = ? WHERE id = ?")
                .bind(payment_status).bind(&inv_id)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
        }
    }

    sqlx::query("UPDATE custom_orders SET status='delivered', final_invoice_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(&inv_id).bind(&payload.order_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(inv_id)
}
