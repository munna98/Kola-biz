use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct OpeningStock {
    pub id: String,
    pub voucher_no: String,
    pub voucher_date: String,
    pub total_amount: f64,
    pub narration: Option<String>,
    pub created_at: String,
    pub created_by_name: Option<String>,
}

#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct OpeningStockItem {
    pub id: String,
    pub voucher_id: String,
    pub product_id: String,
    pub product_code: String,
    pub product_name: String,
    pub description: Option<String>,
    pub quantity: f64, // Stored in initial_quantity
    pub rate: f64,
    pub amount: f64,
}

#[derive(Deserialize)]
pub struct CreateOpeningStockItem {
    pub product_id: String,
    pub description: Option<String>,
    pub quantity: f64,
    pub rate: f64,
    pub amount: f64,
}

#[derive(Deserialize)]
pub struct CreateOpeningStock {
    pub voucher_date: String,
    pub narration: Option<String>,
    pub items: Vec<CreateOpeningStockItem>,
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
pub async fn get_opening_stocks(pool: State<'_, SqlitePool>) -> Result<Vec<OpeningStock>, String> {
    let stocks = sqlx::query_as::<_, OpeningStock>(
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
        WHERE v.voucher_type = 'opening_stock' AND v.deleted_at IS NULL
        ORDER BY v.voucher_date DESC, v.id DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(stocks)
}

#[tauri::command]
pub async fn get_opening_stock(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<OpeningStock, String> {
    let stock = sqlx::query_as::<_, OpeningStock>(
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
        WHERE v.id = ? AND v.voucher_type = 'opening_stock' AND v.deleted_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Opening stock entry not found".to_string())?;

    Ok(stock)
}

#[tauri::command]
pub async fn get_opening_stock_items(
    pool: State<'_, SqlitePool>,
    voucher_id: String,
) -> Result<Vec<OpeningStockItem>, String> {
    sqlx::query_as::<_, OpeningStockItem>(
        "SELECT 
            vi.id,
            vi.voucher_id,
            vi.product_id,
            p.code as product_code,
            p.name as product_name,
            vi.description,
            vi.initial_quantity as quantity,
            vi.rate,
            vi.amount
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
pub async fn create_opening_stock(
    pool: State<'_, SqlitePool>,
    data: CreateOpeningStock,
) -> Result<String, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Generate voucher number
    let voucher_no = get_next_voucher_number(pool.inner(), "opening_stock").await?;

    // Calculate total
    let mut total_amount = 0.0;
    for item in &data.items {
        total_amount += item.amount;
    }

    let voucher_id = Uuid::now_v7().to_string();

    // Create voucher
    sqlx::query(
        "INSERT INTO vouchers (id, voucher_no, voucher_type, voucher_date, total_amount, narration, status, created_by)
         VALUES (?, ?, 'opening_stock', ?, ?, ?, 'posted', ?)"
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

    // Insert items and stock movements
    for item in &data.items {
        let item_id = Uuid::now_v7().to_string();

        // Insert voucher item
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, rate, amount)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)" // count is 0 because we just use initial_quantity
        )
        .bind(&item_id)
        .bind(&voucher_id)
        .bind(&item.product_id)
        .bind(&item.description)
        .bind(item.quantity)
        .bind(item.rate)
        .bind(item.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Create stock movement (IN) - using IN type so it's counted in stock reports
        let sm_id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount)
             VALUES (?, ?, ?, 'IN', ?, 0, ?, ?)"
        )
        .bind(&sm_id)
        .bind(&voucher_id)
        .bind(&item.product_id)
        .bind(item.quantity)
        .bind(item.rate)
        .bind(item.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= CREATE JOURNAL ENTRIES =============
    if total_amount > 0.0 {
        // Debit: Inventory Account (1004)
        let inventory_account: Option<String> =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1004'")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        // Credit: Opening Balance Adjustment (3004)
        let opening_adj_account: Option<String> =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '3004'")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        if let (Some(inv_acc), Some(adj_acc)) = (inventory_account, opening_adj_account) {
            // Debit Inventory
            let je_id_1 = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, ?, 0, 'Opening Stock Value')",
            )
            .bind(&je_id_1)
            .bind(&voucher_id)
            .bind(&inv_acc)
            .bind(total_amount)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            // Credit Opening Balance Adjustment
            let je_id_2 = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0, ?, 'Opening Stock Value')",
            )
            .bind(&je_id_2)
            .bind(&voucher_id)
            .bind(&adj_acc)
            .bind(total_amount)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(voucher_id)
}

#[tauri::command]
pub async fn update_opening_stock(
    pool: State<'_, SqlitePool>,
    id: String,
    data: CreateOpeningStock,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Calculate total
    let mut total_amount = 0.0;
    for item in &data.items {
        total_amount += item.amount;
    }

    // Update voucher
    sqlx::query(
        "UPDATE vouchers 
         SET voucher_date = ?, total_amount = ?, narration = ?
         WHERE id = ? AND voucher_type = 'opening_stock'",
    )
    .bind(&data.voucher_date)
    .bind(total_amount)
    .bind(&data.narration)
    .bind(&id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Delete existing related data
    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM stock_movements WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM journal_entries WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Re-insert items and stock movements
    for item in &data.items {
        let item_id = Uuid::now_v7().to_string();

        // Insert voucher item
        sqlx::query(
            "INSERT INTO voucher_items (id, voucher_id, product_id, description, initial_quantity, count, rate, amount)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?)"
        )
        .bind(&item_id)
        .bind(&id)
        .bind(&item.product_id)
        .bind(&item.description)
        .bind(item.quantity)
        .bind(item.rate)
        .bind(item.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Create stock movement (IN type for proper stock calculation)
        let sm_id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO stock_movements (id, voucher_id, product_id, movement_type, quantity, count, rate, amount)
             VALUES (?, ?, ?, 'IN', ?, 0, ?, ?)"
        )
        .bind(&sm_id)
        .bind(&id)
        .bind(&item.product_id)
        .bind(item.quantity)
        .bind(item.rate)
        .bind(item.amount)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    // ============= RE-CREATE JOURNAL ENTRIES =============
    if total_amount > 0.0 {
        // Debit: Inventory Account (1004)
        let inventory_account: Option<String> =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1004'")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        // Credit: Opening Balance Adjustment (3004)
        let opening_adj_account: Option<String> =
            sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '3004'")
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

        if let (Some(inv_acc), Some(adj_acc)) = (inventory_account, opening_adj_account) {
            // Debit Inventory
            let je_id_1 = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, ?, 0, 'Opening Stock Value')",
            )
            .bind(&je_id_1)
            .bind(&id)
            .bind(&inv_acc)
            .bind(total_amount)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

            // Credit Opening Balance Adjustment
            let je_id_2 = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0, ?, 'Opening Stock Value')",
            )
            .bind(&je_id_2)
            .bind(&id)
            .bind(&adj_acc)
            .bind(total_amount)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_opening_stock(pool: State<'_, SqlitePool>, id: String) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Delete related data
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

    sqlx::query("DELETE FROM voucher_items WHERE voucher_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    // Soft delete the voucher (or hard delete as requested? User just said "deletable", but keeping soft delete for consistency usually safer.
    // However, the other delete functions do soft delete on vouchers table.
    // Wait, let's look at `delete_purchase_invoice`... it does `UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP`.
    // I will do the same for consistency.

    sqlx::query("UPDATE vouchers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND voucher_type = 'opening_stock'")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}
