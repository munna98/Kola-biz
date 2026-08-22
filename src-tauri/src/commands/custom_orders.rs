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
    pub collect_payment: Option<bool>,
    pub payment_amount: Option<f64>,
    pub payment_account_id: Option<String>,
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
    existing_voucher: Option<(&str, &str)>,
) -> Result<(), String> {
    let mat_id = Uuid::now_v7().to_string();
    let (sj_voucher_id, sj_voucher_no) = match existing_voucher {
        Some((id, no)) => (id.to_string(), no.to_string()),
        None => {
            let no = get_next_voucher_number_in_tx(tx, "stock_journal").await?;
            let id = Uuid::now_v7().to_string();
            (id, no)
        }
    };
    let sj_narration = format!("Material used for custom order {}", order_no);

    if existing_voucher.is_some() {
        sqlx::query(
            "UPDATE vouchers SET voucher_date = ?, total_amount = ?, grand_total = ?, narration = ?, status = 'posted', deleted_at = NULL WHERE id = ?"
        )
        .bind(order_date)
        .bind(mat.amount)
        .bind(mat.amount)
        .bind(&sj_narration)
        .bind(&sj_voucher_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    } else {
        sqlx::query(
            "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, total_amount, grand_total, narration, status, created_by)
             VALUES (?, ?, 'stock_journal', ?, ?, ?, ?, 'posted', ?)",
        )
        .bind(&sj_voucher_id)
        .bind(&sj_voucher_no)
        .bind(order_date)
        .bind(mat.amount)
        .bind(mat.amount)
        .bind(&sj_narration)
        .bind(user_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    }

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

    // Post perpetual inventory GL entries for material consumption
    let cogs_acc: Option<String> =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5002'")
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
    let inv_acc: Option<String> =
        sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1004'")
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;

    if let (Some(c_acc), Some(i_acc)) = (cogs_acc, inv_acc) {
        if mat.amount > 0.0 {
            let je1 = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, ?, 0, ?)",
            )
            .bind(&je1)
            .bind(&sj_voucher_id)
            .bind(&c_acc)
            .bind(mat.amount)
            .bind(&sj_narration)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;

            let je2 = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)",
            )
            .bind(&je2)
            .bind(&sj_voucher_id)
            .bind(&i_acc)
            .bind(mat.amount)
            .bind(&sj_narration)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

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
        sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
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
    existing_voucher: Option<(&str, &str)>,
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

        // 3. Obtain or reuse journal voucher ID & number
        let (j_id, j_no) = match existing_voucher {
            Some((id, no)) => (id.to_string(), no.to_string()),
            None => {
                let no = get_next_voucher_number_in_tx(&mut *tx, "journal").await?;
                let id = Uuid::now_v7().to_string();
                (id, no)
            }
        };
        let narration = format!("Material purchase in {}: {}", order_no, pur.description);

        if existing_voucher.is_some() {
            sqlx::query(
                "UPDATE vouchers SET voucher_date = ?, party_id = ?, party_type = ?, total_amount = ?, grand_total = ?, narration = ?, status = 'posted', deleted_at = NULL WHERE id = ?"
            )
            .bind(purchase_date)
            .bind(&party_id)
            .bind(&party_type)
            .bind(pur.amount)
            .bind(pur.amount)
            .bind(&narration)
            .bind(&j_id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        } else {
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
        }

        // 4. Debit: Job Material Cost
        let je_dr = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, is_manual)
             VALUES (?, ?, ?, ?, 0, ?, 1)"
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
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, is_manual)
             VALUES (?, ?, ?, 0, ?, ?, 1)"
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
    } else if let Some((existing_id, _)) = existing_voucher {
        let _ = sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(existing_id)
            .execute(&mut **tx)
            .await;
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
            None,
        ).await?;
    }

    for pur in &data.purchases {
        insert_purchase_with_journal_entry(
            &mut tx, &order_id, &order_no,
            &data.order_date, data.user_id.as_deref(), pur,
            None,
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

    let row: Option<(String, Option<String>)> =
        sqlx::query_as("SELECT status, final_invoice_id FROM custom_orders WHERE id = ? AND deleted_at IS NULL")
            .bind(&id).fetch_optional(&pool).await.map_err(|e| e.to_string())?;

    let (_status, final_invoice_id) = match row {
        Some(r) => r,
        None => return Err("Custom order not found".to_string()),
    };

    let order_no: String = sqlx::query_scalar("SELECT order_no FROM custom_orders WHERE id = ?")
        .bind(&id).fetch_one(&pool).await.map_err(|e| e.to_string())?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Collect existing material stock journal vouchers (id, voucher_no) to reuse them on edit
    let existing_material_vouchers: Vec<(String, String)> = sqlx::query_as(
        "SELECT v.id, v.voucher_no
         FROM custom_order_materials com
         JOIN vouchers v ON com.stock_journal_id = v.id
         WHERE com.order_id = ?
         ORDER BY com.created_at ASC",
    )
    .bind(&id)
    .fetch_all(&mut *tx)
    .await
    .unwrap_or_default();

    // Collect existing purchase journal vouchers (id, voucher_no) to reuse them on edit
    let existing_purchase_vouchers: Vec<(String, String)> = sqlx::query_as(
        "SELECT v.id, v.voucher_no
         FROM custom_order_purchases cop
         JOIN vouchers v ON cop.voucher_id = v.id
         WHERE cop.order_id = ?
         ORDER BY cop.created_at ASC",
    )
    .bind(&id)
    .fetch_all(&mut *tx)
    .await
    .unwrap_or_default();

    // Clean up child entries for existing material vouchers
    for (v_id, _) in &existing_material_vouchers {
        sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
            .bind(v_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
            .bind(v_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
            .bind(v_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // Clean up child entries for existing purchase vouchers
    for (v_id, _) in &existing_purchase_vouchers {
        sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
            .bind(v_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

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

    for (idx, mat) in data.materials.iter().enumerate() {
        let existing_v = existing_material_vouchers
            .get(idx)
            .map(|(v_id, v_no)| (v_id.as_str(), v_no.as_str()));
        insert_material_with_stock_journal(
            &mut tx, &id, &order_no,
            &data.order_date, data.user_id.as_deref(), mat,
            existing_v,
        ).await?;
    }
    // Delete any excess existing material vouchers if material count was reduced
    if existing_material_vouchers.len() > data.materials.len() {
        for (unused_id, _) in &existing_material_vouchers[data.materials.len()..] {
            sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(unused_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    for (idx, pur) in data.purchases.iter().enumerate() {
        let existing_v = existing_purchase_vouchers
            .get(idx)
            .map(|(v_id, v_no)| (v_id.as_str(), v_no.as_str()));
        insert_purchase_with_journal_entry(
            &mut tx, &id, &order_no,
            &data.order_date, data.user_id.as_deref(), pur,
            existing_v,
        ).await?;
    }
    // Delete any excess existing purchase vouchers if purchase count was reduced
    if existing_purchase_vouchers.len() > data.purchases.len() {
        for (unused_id, _) in &existing_purchase_vouchers[data.purchases.len()..] {
            sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(unused_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
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

    // If order was already finalized/delivered, synchronize the linked sales invoice and entries
    if let Some(inv_id) = &final_invoice_id {
        let customer_account_id: String = sqlx::query_scalar(
            "SELECT id FROM chart_of_accounts WHERE id = ? OR party_id = ? LIMIT 1",
        )
        .bind(&data.customer_id)
        .bind(&data.customer_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| data.customer_id.clone());

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
            "SELECT id FROM chart_of_accounts WHERE account_group = 'Job Work Expenses' AND deleted_at IS NULL LIMIT 1",
        ).fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;

        let narration = format!("Custom order {} - final invoice", order_no);

        sqlx::query(
            "UPDATE vouchers SET
             party_id=?, subtotal=?, total_amount=?, grand_total=?, updated_at=CURRENT_TIMESTAMP
             WHERE id=?"
        )
        .bind(&customer_account_id)
        .bind(data.sale_price).bind(data.sale_price).bind(data.sale_price)
        .bind(inv_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

        let unit_id: Option<String> = if let Some(ref u_name) = data.finished_item_unit {
            sqlx::query_scalar("SELECT id FROM units WHERE name = ? OR symbol = ? LIMIT 1")
                .bind(u_name)
                .bind(u_name)
                .fetch_optional(&mut *tx)
                .await
                .unwrap_or(None)
        } else {
            None
        };

        let qty = if data.finished_item_qty > 0.0 { data.finished_item_qty } else { 1.0 };
        let line_rate = if data.finished_item_qty > 0.0 { data.sale_price / data.finished_item_qty } else { data.sale_price };

        sqlx::query(
            "UPDATE voucher_items SET item_type='product', description=?, initial_quantity=?, count=0, deduction_per_unit=0.0, final_quantity=?, unit_id=?, base_quantity=?, rate=?, amount=?, net_amount=? WHERE voucher_id=?"
        )
        .bind(&data.finished_item_name)
        .bind(qty).bind(qty).bind(&unit_id).bind(qty)
        .bind(line_rate).bind(data.sale_price).bind(data.sale_price)
        .bind(inv_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

        sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
            .bind(inv_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

        // Dr Customer A/c
        let je_cust = Uuid::now_v7().to_string();
        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, ?, 0, ?)")
            .bind(&je_cust).bind(inv_id).bind(&customer_account_id).bind(data.sale_price).bind(&narration)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;

        // Cr Sales A/c
        let je_sales = Uuid::now_v7().to_string();
        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
            .bind(&je_sales).bind(inv_id).bind(&sales_account_id).bind(data.sale_price).bind(&narration)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;

        if total_cost > 0.0 {
            if let Some(cogs_acc) = &cogs_account_id {
                let je_cogs = Uuid::now_v7().to_string();
                sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, ?, 0, ?)")
                    .bind(&je_cogs).bind(inv_id).bind(cogs_acc).bind(total_cost).bind(&narration)
                    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                if mat_cost > 0.0 {
                    if let Some(inv_acc) = &inventory_account_id {
                        let je_inv = Uuid::now_v7().to_string();
                        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
                            .bind(&je_inv).bind(inv_id).bind(inv_acc).bind(mat_cost).bind(&narration)
                            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                    }
                }

                if pur_cost > 0.0 {
                    if let Some(jm_acc) = &job_mat_account_id {
                        let je_jm = Uuid::now_v7().to_string();
                        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
                            .bind(&je_jm).bind(inv_id).bind(jm_acc).bind(pur_cost).bind(&narration)
                            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                    }
                }

                if svc_cost > 0.0 {
                    let svc_rows: Vec<(Option<String>, f64, String)> = sqlx::query_as(
                        "SELECT expense_account, amount, description FROM custom_order_services WHERE order_id = ?"
                    )
                    .bind(&id)
                    .fetch_all(&mut *tx)
                    .await
                    .unwrap_or_default();

                    let mut posted_service_total = 0.0;
                    for (exp_acc, amt, desc) in svc_rows {
                        if amt > 0.0 {
                            let target_acc = exp_acc.as_deref().or(job_svc_account_id.as_deref());
                            if let Some(acc_id) = target_acc {
                                let line_narration = if desc.is_empty() {
                                    narration.clone()
                                } else {
                                    format!("{}: {}", narration, desc)
                                };
                                let je_js = Uuid::now_v7().to_string();
                                sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
                                    .bind(&je_js).bind(inv_id).bind(acc_id).bind(amt).bind(&line_narration)
                                    .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                                posted_service_total += amt;
                            }
                        }
                    }

                    if (svc_cost - posted_service_total).abs() > 0.001 {
                        let remainder = svc_cost - posted_service_total;
                        if let Some(fallback_acc) = &job_svc_account_id {
                            let je_js = Uuid::now_v7().to_string();
                            sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
                                .bind(&je_js).bind(inv_id).bind(fallback_acc).bind(remainder).bind(&narration)
                                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                        }
                    }
                }
            }
        }

        let total_allocated: f64 = sqlx::query_scalar(
            "SELECT COALESCE(SUM(allocated_amount), 0.0) FROM payment_allocations WHERE invoice_voucher_id = ?"
        )
        .bind(inv_id)
        .fetch_one(&mut *tx)
        .await
        .unwrap_or(0.0);

        let inv_payment_status = if total_allocated >= data.sale_price && data.sale_price > 0.0 {
            "paid"
        } else if total_allocated > 0.0 {
            "partially_paid"
        } else {
            "unpaid"
        };

        sqlx::query("UPDATE vouchers SET payment_status = ? WHERE id = ?")
            .bind(inv_payment_status).bind(inv_id)
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

    let voucher_item_id = Uuid::now_v7().to_string();
    let item_desc = format!("Advance for custom order {}", order_no);
    sqlx::query(
        "INSERT INTO voucher_items (id, voucher_id, description, amount, tax_rate, tax_amount, remarks, initial_quantity, count, rate, ledger_id)
         VALUES (?, ?, ?, ?, 0.0, 0.0, ?, 1.0, 1.0, ?, ?)"
    )
    .bind(&voucher_item_id)
    .bind(&receipt_id)
    .bind(&item_desc)
    .bind(payload.amount)
    .bind(&narration)
    .bind(payload.amount)
    .bind(&customer_account_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

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

    sqlx::query("UPDATE custom_orders SET advance_amount = advance_amount + ?, advance_voucher_id = COALESCE(advance_voucher_id, ?), updated_at=CURRENT_TIMESTAMP WHERE id=?")
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
    let (finished_item_name, finished_item_qty, finished_item_unit): (String, f64, Option<String>) =
        sqlx::query_as("SELECT finished_item_name, finished_item_qty, finished_item_unit FROM custom_orders WHERE id = ?")
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
        "SELECT id FROM chart_of_accounts WHERE account_group = 'Job Work Expenses' AND deleted_at IS NULL LIMIT 1",
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

    let unit_id: Option<String> = if let Some(ref u_name) = finished_item_unit {
        sqlx::query_scalar("SELECT id FROM units WHERE name = ? OR symbol = ? LIMIT 1")
            .bind(u_name)
            .bind(u_name)
            .fetch_optional(&mut *tx)
            .await
            .unwrap_or(None)
    } else {
        None
    };

    let vi_id = Uuid::now_v7().to_string();
    let qty = if finished_item_qty > 0.0 { finished_item_qty } else { 1.0 };
    let line_rate = if finished_item_qty > 0.0 { sale_price / finished_item_qty } else { sale_price };
    sqlx::query(
        "INSERT INTO voucher_items (id, voucher_id, item_type, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, net_amount, tax_rate, tax_amount)
         VALUES (?, ?, 'product', ?, ?, 0, 0.0, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&vi_id).bind(&inv_id).bind(&finished_item_name)
    .bind(qty).bind(qty).bind(&unit_id).bind(qty)
    .bind(line_rate).bind(sale_price).bind(sale_price).bind(tax_rate).bind(tax_amount)
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
                let svc_rows: Vec<(Option<String>, f64, String)> = sqlx::query_as(
                    "SELECT expense_account, amount, description FROM custom_order_services WHERE order_id = ?"
                )
                .bind(&payload.order_id)
                .fetch_all(&mut *tx)
                .await
                .unwrap_or_default();

                let mut posted_service_total = 0.0;
                for (exp_acc, amt, desc) in svc_rows {
                    if amt > 0.0 {
                        let target_acc = exp_acc.as_deref().or(job_svc_account_id.as_deref());
                        if let Some(acc_id) = target_acc {
                            let line_narration = if desc.is_empty() {
                                narration.clone()
                            } else {
                                format!("{}: {}", narration, desc)
                            };
                            let je_js = Uuid::now_v7().to_string();
                            sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
                                .bind(&je_js).bind(&inv_id).bind(acc_id).bind(amt).bind(&line_narration)
                                .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                            posted_service_total += amt;
                        }
                    }
                }

                if (total_service_cost - posted_service_total).abs() > 0.001 {
                    let rem = total_service_cost - posted_service_total;
                    if let Some(js_acc) = &job_svc_account_id {
                        let je_js = Uuid::now_v7().to_string();
                        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
                            .bind(&je_js).bind(&inv_id).bind(js_acc).bind(rem).bind(&narration)
                            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }

    let mut total_allocated = 0.0;

    if advance_amount > 0.0 {
        let mut advance_receipts: Vec<(String, f64)> = sqlx::query_as(
            "SELECT id, total_amount FROM vouchers WHERE voucher_type = 'receipt' AND narration LIKE ? AND deleted_at IS NULL"
        )
        .bind(format!("%custom order {}%", order_no))
        .fetch_all(&mut *tx)
        .await
        .unwrap_or_default();

        if advance_receipts.is_empty() {
            if let Some(adv_voucher_id) = &advance_voucher_id {
                advance_receipts.push((adv_voucher_id.clone(), advance_amount));
            }
        }

        for (adv_v_id, adv_v_amt) in advance_receipts {
            if total_allocated < grand_total && adv_v_amt > 0.0 {
                let apply_amount = adv_v_amt.min(grand_total - total_allocated);
                let alloc_id = Uuid::now_v7().to_string();
                sqlx::query(
                    "INSERT INTO payment_allocations (id, payment_voucher_id, invoice_voucher_id, allocated_amount, allocation_date, party_id, party_type)
                     VALUES (?, ?, ?, ?, ?, ?, 'customer')",
                )
                .bind(&alloc_id).bind(&adv_v_id).bind(&inv_id)
                .bind(apply_amount).bind(&payload.voucher_date).bind(&customer_id)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                total_allocated += apply_amount;
            }
        }
    }

    if payload.collect_payment.unwrap_or(false) {
        let pay_amt = payload.payment_amount.unwrap_or(grand_total - total_allocated);
        if pay_amt > 0.0 {
            if let Some(cash_bank_acc_id) = &payload.payment_account_id {
                if !cash_bank_acc_id.trim().is_empty() {
                    let receipt_no = get_next_voucher_number_in_tx(&mut tx, "receipt").await?;
                    let receipt_id = Uuid::now_v7().to_string();
                    let rcpt_narration = format!("Final payment for custom order {}", order_no);

                    sqlx::query(
                        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type,
                          total_amount, grand_total, narration, status, payment_status, account_id, created_by, created_from_invoice_id)
                         VALUES (?, ?, 'receipt', ?, ?, 'customer', ?, ?, ?, 'posted', 'paid', ?, ?, ?)",
                    )
                    .bind(&receipt_id).bind(&receipt_no).bind(&payload.voucher_date).bind(&customer_account_id)
                    .bind(pay_amt).bind(pay_amt).bind(&rcpt_narration)
                    .bind(cash_bank_acc_id).bind(&payload.user_id).bind(&inv_id)
                    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                    let voucher_item_id = Uuid::now_v7().to_string();
                    let item_desc = format!("Final payment for custom order {}", order_no);
                    sqlx::query(
                        "INSERT INTO voucher_items (id, voucher_id, description, amount, tax_rate, tax_amount, remarks, initial_quantity, count, rate, ledger_id)
                         VALUES (?, ?, ?, ?, 0.0, 0.0, ?, 1.0, 1.0, ?, ?)"
                    )
                    .bind(&voucher_item_id)
                    .bind(&receipt_id)
                    .bind(&item_desc)
                    .bind(pay_amt)
                    .bind(&rcpt_narration)
                    .bind(pay_amt)
                    .bind(&customer_account_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;

                    let je1_id = Uuid::now_v7().to_string();
                    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, ?, 0, ?)")
                        .bind(&je1_id).bind(&receipt_id).bind(cash_bank_acc_id)
                        .bind(pay_amt).bind(&rcpt_narration)
                        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                    let je2_id = Uuid::now_v7().to_string();
                    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
                        .bind(&je2_id).bind(&receipt_id).bind(&customer_account_id)
                        .bind(pay_amt).bind(&rcpt_narration)
                        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                    let alloc_id = Uuid::now_v7().to_string();
                    sqlx::query(
                        "INSERT INTO payment_allocations (id, payment_voucher_id, invoice_voucher_id, allocated_amount, allocation_date, party_id, party_type)
                         VALUES (?, ?, ?, ?, ?, ?, 'customer')",
                    )
                    .bind(&alloc_id).bind(&receipt_id).bind(&inv_id)
                    .bind(pay_amt).bind(&payload.voucher_date).bind(&customer_id)
                    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                    total_allocated += pay_amt;
                }
            }
        }
    }

    let payment_status = if total_allocated >= grand_total && grand_total > 0.0 {
        "paid"
    } else if total_allocated > 0.0 {
        "partially_paid"
    } else {
        "unpaid"
    };
    sqlx::query("UPDATE vouchers SET payment_status = ? WHERE id = ?")
        .bind(payment_status).bind(&inv_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE custom_orders SET status='delivered', final_invoice_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(&inv_id).bind(&payload.order_id)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(inv_id)
}

#[derive(Debug, serde::Serialize, sqlx::FromRow)]
pub struct CustomOrderPaymentRecord {
    pub voucher_id: String,
    pub voucher_no: String,
    pub voucher_date: String,
    pub amount: f64,
    pub account_id: Option<String>,
    pub account_name: Option<String>,
    pub narration: Option<String>,
    pub payment_type: String,
}

#[tauri::command]
pub async fn get_custom_order_payments(
    registry: State<'_, Arc<DbRegistry>>,
    order_id: String,
) -> Result<Vec<CustomOrderPaymentRecord>, String> {
    let pool = registry.active_pool().await?;

    let row: Option<(String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT order_no, advance_voucher_id, final_invoice_id FROM custom_orders WHERE id = ? AND deleted_at IS NULL"
    )
    .bind(&order_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (order_no, advance_voucher_id, final_invoice_id) = match row {
        Some(r) => r,
        None => return Ok(Vec::new()),
    };

    let mut list = Vec::new();

    // 1. Advance receipts
    let advances: Vec<CustomOrderPaymentRecord> = sqlx::query_as(
        "SELECT
            v.id as voucher_id,
            v.voucher_no,
            v.voucher_date,
            v.total_amount as amount,
            v.account_id,
            COALESCE(coa.account_name, 'Cash') as account_name,
            v.narration,
            'advance' as payment_type
         FROM vouchers v
         LEFT JOIN chart_of_accounts coa ON v.account_id = coa.id
         WHERE (v.id = ?1 OR v.narration LIKE ?2)
           AND v.voucher_type = 'receipt'
           AND v.deleted_at IS NULL
         ORDER BY v.voucher_date ASC, v.created_at ASC"
    )
    .bind(&advance_voucher_id)
    .bind(format!("%custom order {}%", order_no))
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    list.extend(advances);

    // 2. Invoice payment allocations (for payments after invoice creation)
    if let Some(inv_id) = final_invoice_id {
        let inv_payments: Vec<CustomOrderPaymentRecord> = sqlx::query_as(
            "SELECT
                v.id as voucher_id,
                v.voucher_no,
                pa.allocation_date as voucher_date,
                pa.allocated_amount as amount,
                v.account_id,
                COALESCE(coa.account_name, 'Cash') as account_name,
                v.narration,
                'invoice_payment' as payment_type
             FROM payment_allocations pa
             JOIN vouchers v ON pa.payment_voucher_id = v.id
             LEFT JOIN chart_of_accounts coa ON v.account_id = coa.id
             WHERE pa.invoice_voucher_id = ?1
               AND v.id != ?2
               AND v.narration NOT LIKE ?3
               AND v.deleted_at IS NULL
             ORDER BY pa.allocation_date ASC"
        )
        .bind(&inv_id)
        .bind(advance_voucher_id.as_deref().unwrap_or(""))
        .bind(format!("%custom order {}%", order_no))
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        list.extend(inv_payments);
    }

    Ok(list)
}
