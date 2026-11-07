use serde::{Deserialize, Serialize};
use crate::company_db::DbRegistry;
use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use super::resolve_voucher_line_unit;
use crate::voucher_seq::get_next_voucher_number;

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct StockAdjustment {
    pub id: String,
    pub voucher_no: String,
    pub voucher_date: String,
    pub total_amount: f64,
    pub narration: Option<String>,
    pub created_at: Option<String>,
    pub created_by_name: Option<String>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct StockAdjustmentItem {
    pub id: String,
    pub voucher_id: String,
    pub product_id: String,
    pub product_code: String,
    pub product_name: String,
    pub unit_id: Option<String>,
    pub actual_stock: f64,
    pub current_stock: f64,
    pub adjustment_qty: f64,
    pub rate: f64,
    pub amount: f64,
    pub reason: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateStockAdjustmentItem {
    pub product_id: String,
    pub unit_id: Option<String>,
    pub actual_stock: Option<f64>,
    pub current_stock: Option<f64>,
    pub adjustment_qty: f64,
    pub rate: f64,
    pub amount: f64,
    pub reason: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateStockAdjustment {
    pub voucher_date: String,
    pub narration: Option<String>,
    pub items: Vec<CreateStockAdjustmentItem>,
    pub user_id: Option<String>,
}

fn validate_adjustment_items(items: &[CreateStockAdjustmentItem]) -> Result<(), String> {
    if items.is_empty() {
        return Err("Please add at least one adjustment item".to_string());
    }
    for item in items {
        if item.product_id.trim().is_empty() {
            return Err("Every item must have a product selected".to_string());
        }
        if item.adjustment_qty == 0.0 {
            return Err("Adjustment quantity cannot be zero".to_string());
        }
    }
    Ok(())
}

/// Ensure accounts 6002 and 6003 exist, returning (gain_id, loss_id)
async fn ensure_adjustment_accounts(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> Result<(String, String), String> {
    // 6002 - Stock Adjustment Gain
    let gain_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE account_code = '6002'",
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    let gain_id = match gain_id {
        Some(id) => id,
        None => {
            let id = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, is_system, is_active)
                 VALUES (?, '6002', 'Stock Adjustment Gain', 'Income', 'Other Income', 'Gain from stock adjustment', 1, 1)",
            )
            .bind(&id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
            id
        }
    };

    // 6003 - Stock Adjustment Loss
    let loss_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE account_code = '6003'",
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    let loss_id = match loss_id {
        Some(id) => id,
        None => {
            let id = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, is_system, is_active)
                 VALUES (?, '6003', 'Stock Adjustment Loss', 'Expense', 'Other Expenses', 'Loss from stock adjustment', 1, 1)",
            )
            .bind(&id)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
            id
        }
    };

    Ok((gain_id, loss_id))
}

async fn insert_adjustment_items(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    voucher_id: &str,
    items: &[CreateStockAdjustmentItem],
) -> Result<(), String> {
    for item in items {
        let item_id = Uuid::now_v7().to_string();
        let abs_qty = item.adjustment_qty.abs();
        let unit_snapshot = resolve_voucher_line_unit(
            tx,
            &item.product_id,
            item.unit_id.as_deref(),
            "report",
            abs_qty,
        )
        .await?;

        // base_quantity preserves the sign from adjustment_qty
        let signed_base_qty = if item.adjustment_qty < 0.0 {
            -unit_snapshot.base_quantity
        } else {
            unit_snapshot.base_quantity
        };

        let movement_type = if item.adjustment_qty >= 0.0 { "IN" } else { "OUT" };
        let abs_amount = item.amount.abs();

        let actual = item.actual_stock.unwrap_or(item.adjustment_qty);
        let current = item.current_stock.unwrap_or(0.0);

        // Store in voucher_items: initial_quantity = actual_stock, count = current_stock, remarks = reason
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, unit_id, base_quantity, rate, amount, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&item_id)
        .bind(voucher_id)
        .bind(&item.product_id)
        .bind(&item.reason)
        .bind(actual)                     // actual physical count
        .bind(current)                    // book stock count
        .bind(&unit_snapshot.unit_id)
        .bind(signed_base_qty)
        .bind(item.rate)
        .bind(abs_amount)
        .bind(&item.reason)               // reason in remarks column
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

        let movement_id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount, cost_rate, cost_amount)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)",
        )
        .bind(&movement_id)
        .bind(voucher_id)
        .bind(&item.product_id)
        .bind(movement_type)
        .bind(unit_snapshot.base_quantity)   // always positive for stock movement
        .bind(item.rate)
        .bind(abs_amount)
        .bind(item.rate)
        .bind(abs_amount)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn post_adjustment_journal(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    voucher_id: &str,
    items: &[CreateStockAdjustmentItem],
) -> Result<(), String> {
    let inventory_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM chart_of_accounts WHERE account_code = '1004'",
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(|e| e.to_string())?;

    let inventory_id = match inventory_id {
        Some(id) => id,
        None => return Ok(()), // No inventory account, skip GL posting
    };

    let (gain_id, loss_id) = ensure_adjustment_accounts(tx).await?;

    for item in items {
        let abs_amount = item.amount.abs();
        if abs_amount <= 0.0 {
            continue;
        }

        if item.adjustment_qty >= 0.0 {
            // Excess: DR Inventory / CR Stock Adjustment Gain
            let je1 = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, ?, 0, 'Stock Adjustment - Excess')",
            )
            .bind(&je1)
            .bind(voucher_id)
            .bind(&inventory_id)
            .bind(abs_amount)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;

            let je2 = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0, ?, 'Stock Adjustment - Excess')",
            )
            .bind(&je2)
            .bind(voucher_id)
            .bind(&gain_id)
            .bind(abs_amount)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        } else {
            // Shortage: DR Stock Adjustment Loss / CR Inventory
            let je1 = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, ?, 0, 'Stock Adjustment - Shortage')",
            )
            .bind(&je1)
            .bind(voucher_id)
            .bind(&loss_id)
            .bind(abs_amount)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;

            let je2 = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0, ?, 'Stock Adjustment - Shortage')",
            )
            .bind(&je2)
            .bind(voucher_id)
            .bind(&inventory_id)
            .bind(abs_amount)
            .execute(&mut **tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_stock_adjustments(
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<StockAdjustment>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, StockAdjustment>(
        "SELECT
            v.id,
            v.voucher_no,
            v.voucher_date,
            CAST(COALESCE(v.total_amount, 0.0) AS REAL) as total_amount,
            v.narration,
            v.created_at,
            u.full_name as created_by_name
         FROM vouchers v
         LEFT JOIN users u ON v.created_by = u.id
         WHERE v.voucher_type = 'stock_adjustment' AND v.deleted_at IS NULL
         ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_stock_adjustment(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<StockAdjustment, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, StockAdjustment>(
        "SELECT
            v.id,
            v.voucher_no,
            v.voucher_date,
            CAST(COALESCE(v.total_amount, 0.0) AS REAL) as total_amount,
            v.narration,
            v.created_at,
            u.full_name as created_by_name
         FROM vouchers v
         LEFT JOIN users u ON v.created_by = u.id
         WHERE v.id = ? AND v.voucher_type = 'stock_adjustment' AND v.deleted_at IS NULL",
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Stock adjustment not found".to_string())
}

#[tauri::command]
pub async fn get_stock_adjustment_items(
    registry: State<'_, Arc<DbRegistry>>,
    voucher_id: String,
) -> Result<Vec<StockAdjustmentItem>, String> {
    let pool = registry.active_pool().await?;
    sqlx::query_as::<_, StockAdjustmentItem>(
        "SELECT
            vi.id,
            vi.voucher_id,
            COALESCE(vi.product_id, '') as product_id,
            COALESCE(p.code, '') as product_code,
            COALESCE(p.name, '') as product_name,
            vi.unit_id,
            CAST(COALESCE(vi.initial_quantity, 0.0) AS REAL) as actual_stock,
            CAST(COALESCE(vi.count, 0) AS REAL) as current_stock,
            CAST((COALESCE(vi.initial_quantity, 0.0) - COALESCE(vi.count, 0)) AS REAL) as adjustment_qty,
            CAST(COALESCE(vi.rate, 0.0) AS REAL) as rate,
            CAST(COALESCE(vi.amount, 0.0) AS REAL) as amount,
            vi.remarks as reason
         FROM voucher_items vi
         LEFT JOIN products p ON vi.product_id = p.id
         WHERE vi.voucher_id = ?
         ORDER BY vi.created_at ASC, vi.id ASC",
    )
    .bind(&voucher_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_stock_adjustment(
    registry: State<'_, Arc<DbRegistry>>,
    data: CreateStockAdjustment,
) -> Result<String, String> {
    let pool = registry.active_pool().await?;
    validate_adjustment_items(&data.items)?;

    let total_amount: f64 = data.items.iter().map(|i| i.amount.abs()).sum();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let voucher_no = get_next_voucher_number(&pool, "stock_adjustment").await?;
    let voucher_id = Uuid::now_v7().to_string();

    sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, total_amount, narration, status, created_by)
         VALUES (?, ?, 'stock_adjustment', ?, ?, ?, 'posted', ?)",
    )
    .bind(&voucher_id)
    .bind(&voucher_no)
    .bind(&data.voucher_date)
    .bind(total_amount)
    .bind(&data.narration)
    .bind(&data.user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    insert_adjustment_items(&mut tx, &voucher_id, &data.items).await?;
    post_adjustment_journal(&mut tx, &voucher_id, &data.items).await?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_id)
}

#[tauri::command]
pub async fn update_stock_adjustment(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
    data: CreateStockAdjustment,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    validate_adjustment_items(&data.items)?;

    let total_amount: f64 = data.items.iter().map(|i| i.amount.abs()).sum();

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE vouchers
         SET voucher_date = ?, total_amount = ?, narration = ?
         WHERE id = ? AND voucher_type = 'stock_adjustment'",
    )
    .bind(&data.voucher_date)
    .bind(total_amount)
    .bind(&data.narration)
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

    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    insert_adjustment_items(&mut tx, &id, &data.items).await?;
    post_adjustment_journal(&mut tx, &id, &data.items).await?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_stock_adjustment(
    registry: State<'_, Arc<DbRegistry>>,
    id: String,
) -> Result<(), String> {
    let pool = registry.active_pool().await?;
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

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

    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    crate::voucher_seq::handle_voucher_deletion_in_tx(&mut tx, &id).await?;

    sqlx::query(
        "UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'stock_adjustment'",
    )
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
