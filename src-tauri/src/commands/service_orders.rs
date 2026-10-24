use crate::company_db::DbRegistry;
use crate::voucher_seq::get_next_voucher_number_in_tx;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

// ==================== STRUCTS ====================

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ServiceOrder {
    pub id: String,
    pub order_no: String,
    pub order_date: String,
    pub expected_date: Option<String>,
    pub customer_id: String,
    pub customer_name: String,
    pub customer_phone: Option<String>,
    pub device_brand: Option<String>,
    pub device_model: Option<String>,
    pub device_imei: Option<String>,
    pub device_color: Option<String>,
    pub device_condition: Option<String>,
    pub security_pin_pattern: Option<String>,
    pub complaint: String,
    pub technician_notes: Option<String>,
    pub assigned_to: Option<String>,
    pub technician_name: Option<String>,
    pub commission_type: Option<String>,
    pub commission_rate: f64,
    pub commission_amount: f64,
    pub estimated_cost: f64,
    pub advance_amount: f64,
    pub advance_voucher_id: Option<String>,
    pub total_parts_cost: f64,
    pub total_parts_billed: f64,
    pub total_labour_cost: f64,
    pub total_amount: f64,
    pub final_invoice_id: Option<String>,
    pub final_invoice_no: Option<String>,
    pub status: String,
    pub payment_status: String,
    pub total_paid: f64,
    pub balance_due: f64,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ServiceOrderPart {
    pub id: String,
    pub order_id: String,
    pub product_id: String,
    pub product_name: String,
    pub product_code: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub unit_id: Option<String>,
    pub unit_name: Option<String>,
    pub cost_rate: f64,
    pub cost_amount: f64,
    pub selling_rate: f64,
    pub selling_amount: f64,
    pub stock_journal_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ServiceOrderLabour {
    pub id: String,
    pub order_id: String,
    pub service_id: Option<String>,
    pub service_name: Option<String>,
    pub description: String,
    pub quantity: f64,
    pub rate: f64,
    pub amount: f64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct ServiceOrderStatusLog {
    pub id: String,
    pub order_id: String,
    pub old_status: Option<String>,
    pub new_status: String,
    pub notes: Option<String>,
    pub changed_by: Option<String>,
    pub changed_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServiceOrderDetail {
    pub order: ServiceOrder,
    pub parts: Vec<ServiceOrderPart>,
    pub labour: Vec<ServiceOrderLabour>,
    pub status_log: Vec<ServiceOrderStatusLog>,
}

#[derive(Debug, Deserialize)]
pub struct CreateServiceOrderPart {
    pub product_id: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub unit_id: Option<String>,
    pub cost_rate: Option<f64>,
    pub selling_rate: f64,
    pub selling_amount: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateServiceOrderLabour {
    pub service_id: Option<String>,
    pub description: String,
    pub quantity: f64,
    pub rate: f64,
    pub amount: f64,
}

#[derive(Debug, Deserialize)]
pub struct CreateServiceOrder {
    pub order_date: String,
    pub expected_date: Option<String>,
    pub customer_id: String,
    pub device_brand: Option<String>,
    pub device_model: Option<String>,
    pub device_imei: Option<String>,
    pub device_color: Option<String>,
    pub device_condition: Option<String>,
    pub security_pin_pattern: Option<String>,
    pub complaint: String,
    pub technician_notes: Option<String>,
    pub assigned_to: Option<String>,
    pub commission_type: Option<String>,
    pub commission_rate: Option<f64>,
    pub estimated_cost: Option<f64>,
    pub advance_amount: Option<f64>,
    pub cash_bank_account_id: Option<String>,
    pub reference: Option<String>,
    pub narration: Option<String>,
    pub parts: Vec<CreateServiceOrderPart>,
    pub labour: Vec<CreateServiceOrderLabour>,
    pub user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateServiceOrderStatusPayload {
    pub order_id: String,
    pub new_status: String,
    pub notes: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RecordServiceAdvancePayload {
    pub order_id: String,
    pub amount: f64,
    pub payment_date: String,
    pub cash_bank_account_id: String,
    pub narration: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct FinalizeServiceOrderPayload {
    pub order_id: String,
    pub voucher_date: String,
    pub narration: Option<String>,
    pub user_id: Option<String>,
    pub collect_payment: Option<bool>,
    pub payment_amount: Option<f64>,
    pub payment_account_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct TechnicianCommissionRow {
    pub employee_id: String,
    pub employee_name: String,
    pub completed_orders: i64,
    pub total_labour_revenue: f64,
    pub total_parts_billed: f64,
    pub total_service_revenue: f64,
    pub total_commission_earned: f64,
}

// ==================== INTERNAL HELPERS ====================

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn calculate_commission(comm_type: &str, comm_rate: f64, labour_total: f64) -> f64 {
    if comm_rate <= 0.0 {
        return 0.0;
    }
    match comm_type {
        "fixed" => round2(comm_rate),
        _ => round2(labour_total * (comm_rate / 100.0)), // default "percentage"
    }
}

async fn insert_part_with_stock_journal(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    order_id: &str,
    order_no: &str,
    order_date: &str,
    user_id: Option<&str>,
    part: &CreateServiceOrderPart,
    existing_voucher: Option<(&str, &str)>,
) -> Result<(), String> {
    let part_id = Uuid::now_v7().to_string();

    // 1. Determine cost rate (from input or fallback to product WAC/purchase rate)
    let cost_rate = match part.cost_rate {
        Some(r) if r > 0.0 => r,
        _ => crate::commands::invoices::get_product_purchase_cost_rate(tx, &part.product_id)
            .await
            .unwrap_or(0.0),
    };
    let cost_amount = round2(part.quantity * cost_rate);

    let selling_rate = part.selling_rate;
    let selling_amount = round2(part.selling_amount.unwrap_or(part.quantity * selling_rate));

    // 2. Create or reuse stock_journal voucher
    let (sj_voucher_id, sj_voucher_no) = match existing_voucher {
        Some((id, no)) => (id.to_string(), no.to_string()),
        None => {
            let no = get_next_voucher_number_in_tx(tx, "stock_journal").await?;
            let id = Uuid::now_v7().to_string();
            (id, no)
        }
    };
    let sj_narration = format!("Part used for service order {}", order_no);

    if existing_voucher.is_some() {
        sqlx::query(
            "UPDATE vouchers SET voucher_date = ?, total_amount = ?, grand_total = ?, narration = ?, status = 'posted', deleted_at = NULL WHERE id = ?"
        )
        .bind(order_date)
        .bind(cost_amount)
        .bind(cost_amount)
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
        .bind(cost_amount)
        .bind(cost_amount)
        .bind(&sj_narration)
        .bind(user_id)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // 3. Insert voucher item for the consumed part
    let vi_id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, unit_id, base_quantity, rate, amount, remarks)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'source')",
    )
    .bind(&vi_id)
    .bind(&sj_voucher_id)
    .bind(&part.product_id)
    .bind(&part.description)
    .bind(part.quantity)
    .bind(&part.unit_id)
    .bind(part.quantity)
    .bind(cost_rate)
    .bind(cost_amount)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    // 4. Record stock movement OUT at cost
    let sm_id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount, cost_rate, cost_amount)
         VALUES (?, ?, ?, 'OUT', ?, 0, ?, ?, ?, ?)",
    )
    .bind(&sm_id)
    .bind(&sj_voucher_id)
    .bind(&part.product_id)
    .bind(part.quantity)
    .bind(cost_rate)
    .bind(cost_amount)
    .bind(cost_rate)
    .bind(cost_amount)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    // 5. Insert into service_order_parts
    sqlx::query(
        "INSERT INTO service_order_parts (id, order_id, product_id, description, quantity, unit_id, cost_rate, cost_amount, selling_rate, selling_amount, stock_journal_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&part_id)
    .bind(order_id)
    .bind(&part.product_id)
    .bind(&part.description)
    .bind(part.quantity)
    .bind(&part.unit_id)
    .bind(cost_rate)
    .bind(cost_amount)
    .bind(selling_rate)
    .bind(selling_amount)
    .bind(&sj_voucher_id)
    .execute(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    // 6. Post double-entry GL entries for material consumption: Dr COGS (5002) / Cr Inventory (1004)
    if cost_amount > 0.0 {
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
            let je1 = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, ?, 0, ?)",
            )
            .bind(&je1)
            .bind(&sj_voucher_id)
            .bind(&c_acc)
            .bind(cost_amount)
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
            .bind(cost_amount)
            .bind(&sj_narration)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

async fn reverse_parts_stock_journals(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    order_id: &str,
) -> Result<(), String> {
    let sj_ids: Vec<String> = sqlx::query_scalar(
        "SELECT stock_journal_id FROM service_order_parts WHERE order_id = ? AND stock_journal_id IS NOT NULL",
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

// ==================== TAURI COMMANDS ====================

#[tauri::command]
pub async fn list_service_orders(
    registry: State<'_, Arc<DbRegistry>>,
    status: Option<String>,
    customer_id: Option<String>,
    technician_id: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
    search: Option<String>,
) -> Result<Vec<ServiceOrder>, String> {
    let pool = registry.active_pool().await?;

    let search_pattern = search.map(|s| format!("%{}%", s.trim().to_lowercase()));

    sqlx::query_as::<_, ServiceOrder>(
        "SELECT
            so.id, so.order_no, so.order_date, so.expected_date,
            so.customer_id,
            COALESCE(coa.account_name, c.name, '') as customer_name,
            COALESCE(c.phone, '') as customer_phone,
            so.device_brand, so.device_model, so.device_imei, so.device_color,
            so.device_condition, so.security_pin_pattern,
            so.complaint, so.technician_notes,
            so.assigned_to,
            COALESCE(emp.name, '') as technician_name,
            so.commission_type, so.commission_rate, so.commission_amount,
            so.estimated_cost, so.advance_amount, so.advance_voucher_id,
            so.total_parts_cost, so.total_parts_billed, so.total_labour_cost, so.total_amount,
            so.final_invoice_id,
            inv.voucher_no as final_invoice_no,
            so.status,
            CASE
                WHEN (
                    CASE
                        WHEN so.final_invoice_id IS NOT NULL THEN
                            MAX(so.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = so.final_invoice_id), 0.0))
                        ELSE so.advance_amount
                    END
                ) >= so.total_amount AND so.total_amount > 0 THEN 'paid'
                ELSE 'pending'
            END as payment_status,
            CASE
                WHEN so.final_invoice_id IS NOT NULL THEN
                    MAX(so.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = so.final_invoice_id), 0.0))
                ELSE so.advance_amount
            END as total_paid,
            MAX(0.0, so.total_amount - (
                CASE
                    WHEN so.final_invoice_id IS NOT NULL THEN
                        MAX(so.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = so.final_invoice_id), 0.0))
                    ELSE so.advance_amount
                END
            )) as balance_due,
            so.reference, so.narration, so.created_by, so.created_at, so.updated_at
         FROM service_orders so
         LEFT JOIN chart_of_accounts coa ON so.customer_id = coa.id OR so.customer_id = coa.party_id
         LEFT JOIN customers c ON so.customer_id = c.id OR coa.party_id = c.id
         LEFT JOIN employees emp ON so.assigned_to = emp.id
         LEFT JOIN vouchers inv ON so.final_invoice_id = inv.id
         WHERE so.deleted_at IS NULL
           AND (? IS NULL OR so.status = ?)
           AND (? IS NULL OR so.customer_id = ?)
           AND (? IS NULL OR so.assigned_to = ?)
           AND (? IS NULL OR so.order_date >= ?)
           AND (? IS NULL OR so.order_date <= ?)
           AND (? IS NULL OR (
                LOWER(so.order_no) LIKE ?
                OR LOWER(COALESCE(so.device_brand, '')) LIKE ?
                OR LOWER(COALESCE(so.device_model, '')) LIKE ?
                OR LOWER(COALESCE(so.device_imei, '')) LIKE ?
                OR LOWER(COALESCE(coa.account_name, c.name, '')) LIKE ?
                OR LOWER(COALESCE(c.phone, '')) LIKE ?
           ))
         ORDER BY so.order_date DESC, so.order_no DESC",
    )
    .bind(&status)
    .bind(&status)
    .bind(&customer_id)
    .bind(&customer_id)
    .bind(&technician_id)
    .bind(&technician_id)
    .bind(&from_date)
    .bind(&from_date)
    .bind(&to_date)
    .bind(&to_date)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .bind(&search_pattern)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_service_order(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<ServiceOrderDetail, String> {
    let pool = registry.active_pool().await?;

    let order = sqlx::query_as::<_, ServiceOrder>(
        "SELECT
            so.id, so.order_no, so.order_date, so.expected_date,
            so.customer_id,
            COALESCE(coa.account_name, c.name, '') as customer_name,
            COALESCE(c.phone, '') as customer_phone,
            so.device_brand, so.device_model, so.device_imei, so.device_color,
            so.device_condition, so.security_pin_pattern,
            so.complaint, so.technician_notes,
            so.assigned_to,
            COALESCE(emp.name, '') as technician_name,
            so.commission_type, so.commission_rate, so.commission_amount,
            so.estimated_cost, so.advance_amount, so.advance_voucher_id,
            so.total_parts_cost, so.total_parts_billed, so.total_labour_cost, so.total_amount,
            so.final_invoice_id,
            inv.voucher_no as final_invoice_no,
            so.status,
            CASE
                WHEN (
                    CASE
                        WHEN so.final_invoice_id IS NOT NULL THEN
                            MAX(so.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = so.final_invoice_id), 0.0))
                        ELSE so.advance_amount
                    END
                ) >= so.total_amount AND so.total_amount > 0 THEN 'paid'
                ELSE 'pending'
            END as payment_status,
            CASE
                WHEN so.final_invoice_id IS NOT NULL THEN
                    MAX(so.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = so.final_invoice_id), 0.0))
                ELSE so.advance_amount
            END as total_paid,
            MAX(0.0, so.total_amount - (
                CASE
                    WHEN so.final_invoice_id IS NOT NULL THEN
                        MAX(so.advance_amount, COALESCE((SELECT SUM(allocated_amount) FROM payment_allocations WHERE invoice_voucher_id = so.final_invoice_id), 0.0))
                    ELSE so.advance_amount
                END
            )) as balance_due,
            so.reference, so.narration, so.created_by, so.created_at, so.updated_at
         FROM service_orders so
         LEFT JOIN chart_of_accounts coa ON so.customer_id = coa.id OR so.customer_id = coa.party_id
         LEFT JOIN customers c ON so.customer_id = c.id OR coa.party_id = c.id
         LEFT JOIN employees emp ON so.assigned_to = emp.id
         LEFT JOIN vouchers inv ON so.final_invoice_id = inv.id
         WHERE so.id = ? AND so.deleted_at IS NULL",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Service order not found".to_string())?;

    let parts = sqlx::query_as::<_, ServiceOrderPart>(
        "SELECT
            sop.id, sop.order_id, sop.product_id,
            COALESCE(p.name, '') as product_name,
            COALESCE(p.code, '') as product_code,
            sop.description, sop.quantity, sop.unit_id,
            u.name as unit_name,
            sop.cost_rate, sop.cost_amount, sop.selling_rate, sop.selling_amount,
            sop.stock_journal_id, sop.created_at
         FROM service_order_parts sop
         LEFT JOIN products p ON sop.product_id = p.id
         LEFT JOIN units u ON sop.unit_id = u.id
         WHERE sop.order_id = ?
         ORDER BY sop.created_at ASC",
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let labour = sqlx::query_as::<_, ServiceOrderLabour>(
        "SELECT
            sol.id, sol.order_id, sol.service_id,
            s.name as service_name,
            sol.description, sol.quantity, sol.rate, sol.amount, sol.created_at
         FROM service_order_labour sol
         LEFT JOIN services s ON sol.service_id = s.id
         WHERE sol.order_id = ?
         ORDER BY sol.created_at ASC",
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let status_log = sqlx::query_as::<_, ServiceOrderStatusLog>(
        "SELECT id, order_id, old_status, new_status, notes, changed_by, changed_at
         FROM service_order_status_log
         WHERE order_id = ?
         ORDER BY changed_at ASC",
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(ServiceOrderDetail {
        order,
        parts,
        labour,
        status_log,
    })
}

#[tauri::command]
pub async fn create_service_order(
    registry: State<'_, Arc<DbRegistry>>,
    data: CreateServiceOrder,
) -> Result<String, String> {
    if data.customer_id.trim().is_empty() {
        return Err("Customer is required".to_string());
    }
    if data.complaint.trim().is_empty() {
        return Err("Complaint description is required".to_string());
    }

    let pool = registry.active_pool().await?;
    let order_id = Uuid::now_v7().to_string();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let order_no = get_next_voucher_number_in_tx(&mut tx, "service_order").await?;

    let comm_type = data.commission_type.unwrap_or_else(|| "percentage".to_string());
    let comm_rate = data.commission_rate.unwrap_or(0.0);

    // Compute parts costs and billed totals
    let mut total_parts_cost: f64 = 0.0;
    let mut total_parts_billed: f64 = 0.0;
    for p in &data.parts {
        let cost_rate = match p.cost_rate {
            Some(r) if r > 0.0 => r,
            _ => crate::commands::invoices::get_product_purchase_cost_rate(&mut tx, &p.product_id)
                .await
                .unwrap_or(0.0),
        };
        total_parts_cost += round2(p.quantity * cost_rate);
        total_parts_billed += round2(p.selling_amount.unwrap_or(p.quantity * p.selling_rate));
    }

    let total_labour_cost: f64 = data.labour.iter().map(|l| round2(l.amount)).sum();
    let total_amount = round2(total_parts_billed + total_labour_cost);
    let commission_amount = calculate_commission(&comm_type, comm_rate, total_labour_cost);

    let advance_amount = data.advance_amount.unwrap_or(0.0);
    let mut advance_voucher_id: Option<String> = None;

    // Record advance receipt voucher if provided
    if advance_amount > 0.0 {
        if let Some(cash_bank_acc) = &data.cash_bank_account_id {
            if !cash_bank_acc.trim().is_empty() {
                let customer_account_id: String = sqlx::query_scalar(
                    "SELECT id FROM chart_of_accounts WHERE (id = ?1 OR party_id = ?1) AND deleted_at IS NULL LIMIT 1",
                )
                .bind(&data.customer_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?
                .unwrap_or_else(|| data.customer_id.clone());

                let receipt_no = get_next_voucher_number_in_tx(&mut tx, "receipt").await?;
                let receipt_id = Uuid::now_v7().to_string();
                let rcpt_narration = format!("Advance received for service order {}", order_no);

                sqlx::query(
                    "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type,
                      total_amount, grand_total, narration, status, payment_status, account_id, created_by)
                     VALUES (?, ?, 'receipt', ?, ?, 'customer', ?, ?, ?, 'posted', 'paid', ?, ?)",
                )
                .bind(&receipt_id).bind(&receipt_no).bind(&data.order_date).bind(&customer_account_id)
                .bind(advance_amount).bind(advance_amount).bind(&rcpt_narration)
                .bind(cash_bank_acc).bind(&data.user_id)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                let vi_id = Uuid::now_v7().to_string();
                sqlx::query(
                    "INSERT INTO voucher_items (id, voucher_id, description, amount, tax_rate, tax_amount, remarks, initial_quantity, count, rate, ledger_id)
                     VALUES (?, ?, ?, ?, 0.0, 0.0, ?, 1.0, 1.0, ?, ?)"
                )
                .bind(&vi_id).bind(&receipt_id).bind(&rcpt_narration).bind(advance_amount)
                .bind(&rcpt_narration).bind(advance_amount).bind(&customer_account_id)
                .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                let je1_id = Uuid::now_v7().to_string();
                sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, ?, 0, ?)")
                    .bind(&je1_id).bind(&receipt_id).bind(cash_bank_acc).bind(advance_amount).bind(&rcpt_narration)
                    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                let je2_id = Uuid::now_v7().to_string();
                sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
                    .bind(&je2_id).bind(&receipt_id).bind(&customer_account_id).bind(advance_amount).bind(&rcpt_narration)
                    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                advance_voucher_id = Some(receipt_id);
            }
        }
    }

    sqlx::query(
        "INSERT INTO service_orders
         (id, order_no, order_date, expected_date, customer_id,
          device_brand, device_model, device_imei, device_color, device_condition, security_pin_pattern,
          complaint, technician_notes, assigned_to, commission_type, commission_rate, commission_amount,
          estimated_cost, advance_amount, advance_voucher_id,
          total_parts_cost, total_parts_billed, total_labour_cost, total_amount,
          status, reference, narration, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?)",
    )
    .bind(&order_id)
    .bind(&order_no)
    .bind(&data.order_date)
    .bind(&data.expected_date)
    .bind(&data.customer_id)
    .bind(&data.device_brand)
    .bind(&data.device_model)
    .bind(&data.device_imei)
    .bind(&data.device_color)
    .bind(&data.device_condition)
    .bind(&data.security_pin_pattern)
    .bind(&data.complaint)
    .bind(&data.technician_notes)
    .bind(&data.assigned_to)
    .bind(&comm_type)
    .bind(comm_rate)
    .bind(commission_amount)
    .bind(data.estimated_cost.unwrap_or(0.0))
    .bind(advance_amount)
    .bind(&advance_voucher_id)
    .bind(total_parts_cost)
    .bind(total_parts_billed)
    .bind(total_labour_cost)
    .bind(total_amount)
    .bind(&data.reference)
    .bind(&data.narration)
    .bind(&data.user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Insert parts with inventory deductions
    for part in &data.parts {
        insert_part_with_stock_journal(
            &mut tx,
            &order_id,
            &order_no,
            &data.order_date,
            data.user_id.as_deref(),
            part,
            None,
        )
        .await?;
    }

    // Insert labour lines
    for l in &data.labour {
        let labour_id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO service_order_labour (id, order_id, service_id, description, quantity, rate, amount)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&labour_id)
        .bind(&order_id)
        .bind(&l.service_id)
        .bind(&l.description)
        .bind(l.quantity)
        .bind(l.rate)
        .bind(round2(l.amount))
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // Insert status log entry
    let log_id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO service_order_status_log (id, order_id, old_status, new_status, notes, changed_by)
         VALUES (?, ?, NULL, 'received', 'Service order created at counter', ?)",
    )
    .bind(&log_id)
    .bind(&order_id)
    .bind(&data.user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(order_id)
}

#[tauri::command]
pub async fn update_service_order(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    data: CreateServiceOrder,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;

    let row: Option<(String, Option<String>, String)> = sqlx::query_as(
        "SELECT status, final_invoice_id, order_no FROM service_orders WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (status, final_invoice_id, order_no) = match row {
        Some(r) => r,
        None => return Err("Service order not found".to_string()),
    };

    if status == "delivered" || final_invoice_id.is_some() {
        return Err("Cannot edit an order that has already been delivered and invoiced".to_string());
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Collect existing stock journals for parts to reuse or clean up
    let existing_vouchers: Vec<(String, String)> = sqlx::query_as(
        "SELECT v.id, v.voucher_no
         FROM service_order_parts sop
         JOIN vouchers v ON sop.stock_journal_id = v.id
         WHERE sop.order_id = ?
         ORDER BY sop.created_at ASC",
    )
    .bind(&id)
    .fetch_all(&mut *tx)
    .await
    .unwrap_or_default();

    for (v_id, _) in &existing_vouchers {
        sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
            .bind(v_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
            .bind(v_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
            .bind(v_id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    sqlx::query("DELETE FROM service_order_parts WHERE order_id = ?")
        .bind(&id).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM service_order_labour WHERE order_id = ?")
        .bind(&id).execute(&mut *tx).await.map_err(|e| e.to_string())?;

    let comm_type = data.commission_type.unwrap_or_else(|| "percentage".to_string());
    let comm_rate = data.commission_rate.unwrap_or(0.0);

    let mut total_parts_cost: f64 = 0.0;
    let mut total_parts_billed: f64 = 0.0;
    for p in &data.parts {
        let cost_rate = match p.cost_rate {
            Some(r) if r > 0.0 => r,
            _ => crate::commands::invoices::get_product_purchase_cost_rate(&mut tx, &p.product_id)
                .await
                .unwrap_or(0.0),
        };
        total_parts_cost += round2(p.quantity * cost_rate);
        total_parts_billed += round2(p.selling_amount.unwrap_or(p.quantity * p.selling_rate));
    }

    let total_labour_cost: f64 = data.labour.iter().map(|l| round2(l.amount)).sum();
    let total_amount = round2(total_parts_billed + total_labour_cost);
    let commission_amount = calculate_commission(&comm_type, comm_rate, total_labour_cost);

    sqlx::query(
        "UPDATE service_orders SET
         order_date = ?, expected_date = ?, customer_id = ?,
         device_brand = ?, device_model = ?, device_imei = ?, device_color = ?,
         device_condition = ?, security_pin_pattern = ?, complaint = ?, technician_notes = ?,
         assigned_to = ?, commission_type = ?, commission_rate = ?, commission_amount = ?,
         estimated_cost = ?,
         total_parts_cost = ?, total_parts_billed = ?, total_labour_cost = ?, total_amount = ?,
         reference = ?, narration = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?",
    )
    .bind(&data.order_date)
    .bind(&data.expected_date)
    .bind(&data.customer_id)
    .bind(&data.device_brand)
    .bind(&data.device_model)
    .bind(&data.device_imei)
    .bind(&data.device_color)
    .bind(&data.device_condition)
    .bind(&data.security_pin_pattern)
    .bind(&data.complaint)
    .bind(&data.technician_notes)
    .bind(&data.assigned_to)
    .bind(&comm_type)
    .bind(comm_rate)
    .bind(commission_amount)
    .bind(data.estimated_cost.unwrap_or(0.0))
    .bind(total_parts_cost)
    .bind(total_parts_billed)
    .bind(total_labour_cost)
    .bind(total_amount)
    .bind(&data.reference)
    .bind(&data.narration)
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    for (idx, part) in data.parts.iter().enumerate() {
        let existing_v = existing_vouchers
            .get(idx)
            .map(|(v_id, v_no)| (v_id.as_str(), v_no.as_str()));
        insert_part_with_stock_journal(
            &mut tx,
            &id,
            &order_no,
            &data.order_date,
            data.user_id.as_deref(),
            part,
            existing_v,
        )
        .await?;
    }

    if existing_vouchers.len() > data.parts.len() {
        for (unused_id, _) in &existing_vouchers[data.parts.len()..] {
            sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(unused_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    for l in &data.labour {
        let labour_id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO service_order_labour (id, order_id, service_id, description, quantity, rate, amount)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&labour_id)
        .bind(&id)
        .bind(&l.service_id)
        .bind(&l.description)
        .bind(l.quantity)
        .bind(l.rate)
        .bind(round2(l.amount))
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_service_order_status(
    registry: State<'_, Arc<DbRegistry>>,
    payload: UpdateServiceOrderStatusPayload,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;

    let valid_statuses = ["received", "in_progress", "waiting_parts", "ready", "delivered", "cancelled"];
    if !valid_statuses.contains(&payload.new_status.as_str()) {
        return Err(format!("Invalid status: '{}'", payload.new_status));
    }

    let current_status: String = sqlx::query_scalar(
        "SELECT status FROM service_orders WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&payload.order_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Service order not found".to_string())?;

    if current_status == "delivered" {
        return Err("Delivered orders cannot be moved to another status".to_string());
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // If cancelling, reverse all consumed parts stock journals so inventory is restored
    if payload.new_status == "cancelled" {
        reverse_parts_stock_journals(&mut tx, &payload.order_id).await?;
    }

    sqlx::query("UPDATE service_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&payload.new_status)
        .bind(&payload.order_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let log_id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO service_order_status_log (id, order_id, old_status, new_status, notes, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&log_id)
    .bind(&payload.order_id)
    .bind(&current_status)
    .bind(&payload.new_status)
    .bind(&payload.notes)
    .bind(&payload.user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn record_service_advance(
    registry: State<'_, Arc<DbRegistry>>,
    payload: RecordServiceAdvancePayload,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;

    let row: Option<(String, String)> = sqlx::query_as(
        "SELECT customer_id, order_no FROM service_orders WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&payload.order_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (customer_id, order_no) = row.ok_or_else(|| "Service order not found".to_string())?;

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
        .unwrap_or_else(|| format!("Advance received for service order {}", order_no));

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
    sqlx::query(
        "INSERT INTO voucher_items (id, voucher_id, description, amount, tax_rate, tax_amount, remarks, initial_quantity, count, rate, ledger_id)
         VALUES (?, ?, ?, ?, 0.0, 0.0, ?, 1.0, 1.0, ?, ?)"
    )
    .bind(&voucher_item_id).bind(&receipt_id).bind(&narration).bind(payload.amount)
    .bind(&narration).bind(payload.amount).bind(&customer_account_id)
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

    sqlx::query(
        "UPDATE service_orders
         SET advance_amount = advance_amount + ?, advance_voucher_id = COALESCE(advance_voucher_id, ?), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?",
    )
    .bind(payload.amount).bind(&receipt_id).bind(&payload.order_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(receipt_id)
}

#[tauri::command]
pub async fn finalize_service_order(
    registry: State<'_, Arc<DbRegistry>>,
    payload: FinalizeServiceOrderPayload,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;

    let status: String = sqlx::query_scalar(
        "SELECT status FROM service_orders WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&payload.order_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Service order not found".to_string())?;

    if status == "delivered" {
        return Err("Service order has already been finalized and delivered".to_string());
    }
    if status == "cancelled" {
        return Err("Cannot finalize a cancelled service order".to_string());
    }

    let customer_id: String = sqlx::query_scalar("SELECT customer_id FROM service_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let order_no: String = sqlx::query_scalar("SELECT order_no FROM service_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let total_parts_billed: f64 = sqlx::query_scalar("SELECT COALESCE(total_parts_billed, 0) FROM service_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let total_labour_cost: f64 = sqlx::query_scalar("SELECT COALESCE(total_labour_cost, 0) FROM service_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let total_amount: f64 = sqlx::query_scalar("SELECT COALESCE(total_amount, 0) FROM service_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let advance_amount: f64 = sqlx::query_scalar("SELECT COALESCE(advance_amount, 0) FROM service_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;
    let advance_voucher_id: Option<String> = sqlx::query_scalar("SELECT advance_voucher_id FROM service_orders WHERE id = ?")
        .bind(&payload.order_id).fetch_one(&pool).await.map_err(|e| e.to_string())?;

    let parts = sqlx::query_as::<_, ServiceOrderPart>(
        "SELECT
            sop.id, sop.order_id, sop.product_id,
            COALESCE(p.name, '') as product_name,
            COALESCE(p.code, '') as product_code,
            sop.description, sop.quantity, sop.unit_id,
            u.name as unit_name,
            sop.cost_rate, sop.cost_amount, sop.selling_rate, sop.selling_amount,
            sop.stock_journal_id, sop.created_at
         FROM service_order_parts sop
         LEFT JOIN products p ON sop.product_id = p.id
         LEFT JOIN units u ON sop.unit_id = u.id
         WHERE sop.order_id = ?",
    )
    .bind(&payload.order_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let labour = sqlx::query_as::<_, ServiceOrderLabour>(
        "SELECT
            sol.id, sol.order_id, sol.service_id,
            s.name as service_name,
            sol.description, sol.quantity, sol.rate, sol.amount, sol.created_at
         FROM service_order_labour sol
         LEFT JOIN services s ON sol.service_id = s.id
         WHERE sol.order_id = ?",
    )
    .bind(&payload.order_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let customer_account_id: String = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE (id = ?1 OR party_id = ?1) AND deleted_at IS NULL LIMIT 1",
    )
    .bind(&customer_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .unwrap_or_else(|| customer_id.clone());

    // Generate service invoice voucher number (SVI-00001)
    let inv_no = get_next_voucher_number_in_tx(&mut tx, "service_invoice").await?;
    let inv_id = Uuid::now_v7().to_string();
    let narration = payload.narration.clone()
        .unwrap_or_else(|| format!("Service invoice for order {}", order_no));

    sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, party_id, party_type,
          subtotal, tax_amount, total_amount, grand_total, narration, status, payment_status, created_by, gst_disabled)
         VALUES (?, ?, 'service_invoice', ?, ?, 'customer', ?, 0, ?, ?, ?, 'posted', 'unpaid', ?, 1)",
    )
    .bind(&inv_id).bind(&inv_no).bind(&payload.voucher_date).bind(&customer_account_id)
    .bind(total_amount).bind(total_amount).bind(total_amount)
    .bind(&narration).bind(&payload.user_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Insert voucher items for each part (billed to customer)
    for p in &parts {
        let vi_id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, item_type, product_id, description, initial_quantity, count, deduction_per_unit, final_quantity, unit_id, base_quantity, rate, amount, net_amount, tax_rate, tax_amount)
             VALUES (?, ?, 'product', ?, ?, ?, 0, 0.0, ?, ?, ?, ?, ?, ?, 0, 0)",
        )
        .bind(&vi_id).bind(&inv_id).bind(&p.product_id)
        .bind(p.description.as_deref().unwrap_or(&p.product_name))
        .bind(p.quantity).bind(p.quantity).bind(&p.unit_id).bind(p.quantity)
        .bind(p.selling_rate).bind(p.selling_amount).bind(p.selling_amount)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // Insert voucher items for each labour charge
    for l in &labour {
        let vi_id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, item_type, service_id, description, initial_quantity, count, deduction_per_unit, final_quantity, base_quantity, rate, amount, net_amount, tax_rate, tax_amount)
             VALUES (?, ?, 'service', ?, ?, ?, 0, 0.0, ?, ?, ?, ?, ?, 0, 0)",
        )
        .bind(&vi_id).bind(&inv_id).bind(&l.service_id)
        .bind(&l.description)
        .bind(l.quantity).bind(l.quantity).bind(l.quantity)
        .bind(l.rate).bind(l.amount).bind(l.amount)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // Double-entry accounting for the invoice:
    // 1. Dr Customer AR: total_amount
    let je_cust = Uuid::now_v7().to_string();
    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, ?, 0, ?)")
        .bind(&je_cust).bind(&inv_id).bind(&customer_account_id).bind(total_amount).bind(&narration)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // 2. Cr Parts Sales (4001): total_parts_billed (if any)
    if total_parts_billed > 0.0 {
        let sales_account_id: String = sqlx::query_scalar(
            "SELECT id FROM chart_of_accounts WHERE account_code = '4001' LIMIT 1",
        )
        .fetch_one(&mut *tx).await.map_err(|e| format!("Sales account (4001) not found: {}", e))?;

        let je_sales = Uuid::now_v7().to_string();
        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
            .bind(&je_sales).bind(&inv_id).bind(&sales_account_id).bind(total_parts_billed).bind(&narration)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // 3. Cr Services Revenue (4002): total_labour_cost (if any)
    if total_labour_cost > 0.0 {
        let service_account_id: Option<String> = sqlx::query_scalar(
            "SELECT id FROM chart_of_accounts WHERE account_code = '4002' LIMIT 1",
        )
        .fetch_optional(&mut *tx).await.map_err(|e| e.to_string())?;

        let fallback_acc_id: String = match service_account_id {
            Some(acc) => acc,
            None => {
                sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '4001' LIMIT 1")
                    .fetch_one(&mut *tx).await.map_err(|e| e.to_string())?
            }
        };

        let je_service = Uuid::now_v7().to_string();
        sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
            .bind(&je_service).bind(&inv_id).bind(&fallback_acc_id).bind(total_labour_cost).bind(&narration)
            .execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    // Allocate any advance receipt vouchers against this final invoice
    let mut total_allocated = 0.0;
    if advance_amount > 0.0 {
        if let Some(adv_v_id) = advance_voucher_id {
            let apply_amount = advance_amount.min(total_amount);
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

    // Collect remaining payment immediately if requested
    if payload.collect_payment.unwrap_or(false) {
        let pay_amt = payload.payment_amount.unwrap_or(total_amount - total_allocated);
        if pay_amt > 0.0 {
            if let Some(cash_bank_acc_id) = &payload.payment_account_id {
                if !cash_bank_acc_id.trim().is_empty() {
                    let receipt_no = get_next_voucher_number_in_tx(&mut tx, "receipt").await?;
                    let receipt_id = Uuid::now_v7().to_string();
                    let rcpt_narration = format!("Final payment for service order {}", order_no);

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
                    sqlx::query(
                        "INSERT INTO voucher_items (id, voucher_id, description, amount, tax_rate, tax_amount, remarks, initial_quantity, count, rate, ledger_id)
                         VALUES (?, ?, ?, ?, 0.0, 0.0, ?, 1.0, 1.0, ?, ?)"
                    )
                    .bind(&voucher_item_id).bind(&receipt_id).bind(&rcpt_narration).bind(pay_amt)
                    .bind(&rcpt_narration).bind(pay_amt).bind(&customer_account_id)
                    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                    let je1_id = Uuid::now_v7().to_string();
                    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, ?, 0, ?)")
                        .bind(&je1_id).bind(&receipt_id).bind(cash_bank_acc_id).bind(pay_amt).bind(&rcpt_narration)
                        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

                    let je2_id = Uuid::now_v7().to_string();
                    sqlx::query("INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration) VALUES (?, ?, ?, 0, ?, ?)")
                        .bind(&je2_id).bind(&receipt_id).bind(&customer_account_id).bind(pay_amt).bind(&rcpt_narration)
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

    // Update invoice payment status
    if total_allocated >= total_amount && total_amount > 0.0 {
        sqlx::query("UPDATE vouchers SET payment_status = 'paid' WHERE id = ?")
            .bind(&inv_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    } else if total_allocated > 0.0 {
        sqlx::query("UPDATE vouchers SET payment_status = 'partially_paid' WHERE id = ?")
            .bind(&inv_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Update service order: status = 'delivered', link invoice
    sqlx::query(
        "UPDATE service_orders
         SET status = 'delivered', final_invoice_id = ?, final_invoice_no = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?",
    )
    .bind(&inv_id).bind(&inv_no).bind(&payload.order_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Status log entry
    let log_id = Uuid::now_v7().to_string();
    sqlx::query(
        "INSERT INTO service_order_status_log (id, order_id, old_status, new_status, notes, changed_by)
         VALUES (?, ?, ?, 'delivered', ?, ?)",
    )
    .bind(&log_id).bind(&payload.order_id).bind(&status)
    .bind(format!("Invoice {} generated and device delivered", inv_no))
    .bind(&payload.user_id)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(inv_id)
}

#[tauri::command]
pub async fn delete_service_order(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;

    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT status, final_invoice_id FROM service_orders WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (status, final_invoice_id) = match row {
        Some(r) => r,
        None => return Err("Service order not found".to_string()),
    };

    if status == "delivered" || final_invoice_id.is_some() {
        return Err("Cannot delete an order that has already been delivered and invoiced".to_string());
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Reverse any stock journals for consumed parts
    reverse_parts_stock_journals(&mut tx, &id).await?;

    // Soft delete order
    sqlx::query("UPDATE service_orders SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_technician_commission_report(
    registry: State<'_, Arc<DbRegistry>>,
    technician_id: Option<String>,
    from_date: Option<String>,
    to_date: Option<String>,
) -> Result<Vec<TechnicianCommissionRow>, String> {
    let pool = registry.active_pool().await?;

    sqlx::query_as::<_, TechnicianCommissionRow>(
        "SELECT
            emp.id as employee_id,
            emp.name as employee_name,
            COUNT(so.id) as completed_orders,
            COALESCE(SUM(so.total_labour_cost), 0.0) as total_labour_revenue,
            COALESCE(SUM(so.total_parts_billed), 0.0) as total_parts_billed,
            COALESCE(SUM(so.total_amount), 0.0) as total_service_revenue,
            COALESCE(SUM(so.commission_amount), 0.0) as total_commission_earned
         FROM employees emp
         JOIN service_orders so ON so.assigned_to = emp.id
         WHERE so.deleted_at IS NULL
           AND so.status = 'delivered'
           AND (? IS NULL OR emp.id = ?)
           AND (? IS NULL OR so.order_date >= ?)
           AND (? IS NULL OR so.order_date <= ?)
         GROUP BY emp.id, emp.name
         ORDER BY total_commission_earned DESC",
    )
    .bind(&technician_id)
    .bind(&technician_id)
    .bind(&from_date)
    .bind(&from_date)
    .bind(&to_date)
    .bind(&to_date)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}
