use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

use super::resolve_voucher_line_unit;

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct StockJournal {
    pub id: String,
    pub voucher_no: String,
    pub voucher_date: String,
    pub total_amount: f64,
    pub narration: Option<String>,
    pub created_at: String,
    pub created_by_name: Option<String>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct StockJournalItem {
    pub id: String,
    pub voucher_id: String,
    pub product_id: String,
    pub product_code: String,
    pub product_name: String,
    pub entry_type: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub unit_id: Option<String>,
    pub rate: f64,
    pub amount: f64,
}

#[derive(Deserialize)]
pub struct CreateStockJournalItem {
    pub product_id: String,
    pub unit_id: Option<String>,
    pub description: Option<String>,
    pub quantity: f64,
    pub rate: f64,
    pub amount: f64,
}

#[derive(Deserialize)]
pub struct CreateStockJournal {
    pub voucher_date: String,
    pub narration: Option<String>,
    pub source_items: Vec<CreateStockJournalItem>,
    pub destination_items: Vec<CreateStockJournalItem>,
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

fn validate_items(items: &[CreateStockJournalItem], label: &str) -> Result<(), String> {
    if items.is_empty() {
        return Err(format!("Please add at least one {label} item"));
    }

    for item in items {
        if item.product_id.trim().is_empty() {
            return Err(format!("Every {label} item must have a product selected"));
        }
        if item.quantity <= 0.0 {
            return Err(format!("Every {label} item must have quantity greater than zero"));
        }
        if item.rate < 0.0 {
            return Err(format!("Every {label} item must have a valid rate"));
        }
    }

    Ok(())
}

fn compute_total(items: &[CreateStockJournalItem]) -> f64 {
    items.iter().map(|item| item.amount).sum()
}

async fn insert_stock_journal_items(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    voucher_id: &str,
    items: &[CreateStockJournalItem],
    entry_type: &str,
    movement_type: &str,
) -> Result<(), String> {
    for item in items {
        let item_id = Uuid::now_v7().to_string();
        let unit_snapshot = resolve_voucher_line_unit(
            tx,
            &item.product_id,
            item.unit_id.as_deref(),
            "report",
            item.quantity,
        )
        .await?;

        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, unit_id, base_quantity, rate, amount, remarks)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)",
        )
        .bind(&item_id)
        .bind(voucher_id)
        .bind(&item.product_id)
        .bind(&item.description)
        .bind(item.quantity)
        .bind(&unit_snapshot.unit_id)
        .bind(unit_snapshot.base_quantity)
        .bind(item.rate)
        .bind(item.amount)
        .bind(entry_type)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;

        let movement_id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(&movement_id)
        .bind(voucher_id)
        .bind(&item.product_id)
        .bind(movement_type)
        .bind(unit_snapshot.base_quantity)
        .bind(item.rate)
        .bind(item.amount)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_stock_journal(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<StockJournal, String> {
    sqlx::query_as::<_, StockJournal>(
        "SELECT
            v.id,
            v.voucher_no,
            v.voucher_date,
            v.total_amount,
            v.narration,
            v.created_at,
            u.full_name as created_by_name
         FROM vouchers v
         LEFT JOIN users u ON v.created_by = u.id
         WHERE v.id = ? AND v.voucher_type = 'stock_journal' AND v.deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Stock journal not found".to_string())
}

#[tauri::command]
pub async fn get_stock_journal_items(
    pool: State<'_, SqlitePool>,
    voucher_id: String,
) -> Result<Vec<StockJournalItem>, String> {
    sqlx::query_as::<_, StockJournalItem>(
        "SELECT
            vi.id,
            vi.voucher_id,
            vi.product_id,
            p.code as product_code,
            p.name as product_name,
            COALESCE(vi.remarks, '') as entry_type,
            vi.description,
            vi.initial_quantity as quantity,
            vi.unit_id,
            vi.rate,
            vi.amount
         FROM voucher_items vi
         JOIN products p ON vi.product_id = p.id
         WHERE vi.voucher_id = ?
         ORDER BY
            CASE COALESCE(vi.remarks, '')
                WHEN 'source' THEN 0
                WHEN 'destination' THEN 1
                ELSE 2
            END,
            vi.created_at ASC,
            vi.id ASC",
    )
    .bind(voucher_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_stock_journal(
    pool: State<'_, SqlitePool>,
    data: CreateStockJournal,
) -> Result<String, String> {
    validate_items(&data.source_items, "source")?;
    validate_items(&data.destination_items, "destination")?;

    let source_total = compute_total(&data.source_items);
    let destination_total = compute_total(&data.destination_items);
    if (source_total - destination_total).abs() > 0.01 {
        return Err(
            "Source and destination values must be equal for a stock journal".to_string(),
        );
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let voucher_no = get_next_voucher_number(pool.inner(), "stock_journal").await?;
    let voucher_id = Uuid::now_v7().to_string();

    sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, total_amount, narration, status, created_by)
         VALUES (?, ?, 'stock_journal', ?, ?, ?, 'posted', ?)",
    )
    .bind(&voucher_id)
    .bind(&voucher_no)
    .bind(&data.voucher_date)
    .bind(destination_total)
    .bind(&data.narration)
    .bind(&data.user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    insert_stock_journal_items(&mut tx, &voucher_id, &data.source_items, "source", "OUT").await?;
    insert_stock_journal_items(
        &mut tx,
        &voucher_id,
        &data.destination_items,
        "destination",
        "IN",
    )
    .await?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(voucher_id)
}

#[tauri::command]
pub async fn update_stock_journal(
    pool: State<'_, SqlitePool>,
    id: String,
    data: CreateStockJournal,
) -> Result<(), String> {
    validate_items(&data.source_items, "source")?;
    validate_items(&data.destination_items, "destination")?;

    let source_total = compute_total(&data.source_items);
    let destination_total = compute_total(&data.destination_items);
    if (source_total - destination_total).abs() > 0.01 {
        return Err(
            "Source and destination values must be equal for a stock journal".to_string(),
        );
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE vouchers
         SET voucher_date = ?, total_amount = ?, narration = ?
         WHERE id = ? AND voucher_type = 'stock_journal'",
    )
    .bind(&data.voucher_date)
    .bind(destination_total)
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

    insert_stock_journal_items(&mut tx, &id, &data.source_items, "source", "OUT").await?;
    insert_stock_journal_items(
        &mut tx,
        &id,
        &data.destination_items,
        "destination",
        "IN",
    )
    .await?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_stock_journal(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
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

    sqlx::query(
        "UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'stock_journal'",
    )
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}
