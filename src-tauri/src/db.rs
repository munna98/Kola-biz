use sqlx::sqlite::SqlitePool;
use uuid::Uuid;

async fn backfill_stock_movement_costs(
    pool: &SqlitePool,
) -> Result<(), Box<dyn std::error::Error>> {
    sqlx::query(
        "UPDATE stock_movements
         SET cost_rate = rate,
             cost_amount = amount
         WHERE COALESCE(cost_rate, 0) = 0
           AND COALESCE(cost_amount, 0) = 0
           AND voucher_id IN (
               SELECT id FROM vouchers
               WHERE voucher_type IN ('purchase_invoice', 'purchase_return', 'opening_stock', 'stock_journal')
           )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "UPDATE stock_movements
         SET cost_rate = COALESCE((SELECT purchase_rate FROM products p WHERE p.id = stock_movements.product_id), 0),
             cost_amount = quantity * COALESCE((SELECT purchase_rate FROM products p WHERE p.id = stock_movements.product_id), 0)
         WHERE COALESCE(cost_rate, 0) = 0
           AND COALESCE(cost_amount, 0) = 0
           AND voucher_id IN (
               SELECT id FROM vouchers
               WHERE voucher_type IN ('sales_invoice', 'sales_return')
           )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "UPDATE stock_movements
         SET cost_rate = COALESCE((
                 SELECT sm_sale.cost_rate
                 FROM vouchers sr
                 JOIN vouchers si ON si.voucher_no = sr.reference
                     AND si.voucher_type = 'sales_invoice'
                     AND si.deleted_at IS NULL
                 JOIN stock_movements sm_sale ON sm_sale.voucher_id = si.id
                     AND sm_sale.product_id = stock_movements.product_id
                     AND sm_sale.movement_type = 'OUT'
                 WHERE sr.id = stock_movements.voucher_id
                   AND sr.voucher_type = 'sales_return'
                   AND sr.deleted_at IS NULL
                 ORDER BY sm_sale.created_at ASC, sm_sale.id ASC
                 LIMIT 1
             ), cost_rate),
             cost_amount = quantity * COALESCE((
                 SELECT sm_sale.cost_rate
                 FROM vouchers sr
                 JOIN vouchers si ON si.voucher_no = sr.reference
                     AND si.voucher_type = 'sales_invoice'
                     AND si.deleted_at IS NULL
                 JOIN stock_movements sm_sale ON sm_sale.voucher_id = si.id
                     AND sm_sale.product_id = stock_movements.product_id
                     AND sm_sale.movement_type = 'OUT'
                 WHERE sr.id = stock_movements.voucher_id
                   AND sr.voucher_type = 'sales_return'
                   AND sr.deleted_at IS NULL
                 ORDER BY sm_sale.created_at ASC, sm_sale.id ASC
                 LIMIT 1
             ), cost_rate)
         WHERE voucher_id IN (
             SELECT id FROM vouchers WHERE voucher_type = 'sales_return'
         )",
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn migrate_purchase_discounts_and_stock_valuation(
    pool: &SqlitePool,
) -> Result<(), Box<dyn std::error::Error>> {
    // 1. Sync stock_movements rates and cost amounts to net landed amounts for purchase invoices
    sqlx::query(
        "UPDATE stock_movements
         SET rate = COALESCE((
                 SELECT CASE WHEN vi.base_quantity > 0 THEN vi.net_amount / vi.base_quantity ELSE stock_movements.rate END
                 FROM voucher_items vi
                 WHERE vi.voucher_id = stock_movements.voucher_id
                   AND vi.product_id = stock_movements.product_id
                   AND vi.item_type != 'service'
                 LIMIT 1
             ), rate),
             amount = COALESCE((
                 SELECT vi.net_amount
                 FROM voucher_items vi
                 WHERE vi.voucher_id = stock_movements.voucher_id
                   AND vi.product_id = stock_movements.product_id
                   AND vi.item_type != 'service'
                 LIMIT 1
             ), amount),
             cost_rate = COALESCE((
                 SELECT CASE WHEN vi.base_quantity > 0 THEN vi.net_amount / vi.base_quantity ELSE stock_movements.cost_rate END
                 FROM voucher_items vi
                 WHERE vi.voucher_id = stock_movements.voucher_id
                   AND vi.product_id = stock_movements.product_id
                   AND vi.item_type != 'service'
                 LIMIT 1
             ), cost_rate),
             cost_amount = COALESCE((
                 SELECT vi.net_amount
                 FROM voucher_items vi
                 WHERE vi.voucher_id = stock_movements.voucher_id
                   AND vi.product_id = stock_movements.product_id
                   AND vi.item_type != 'service'
                 LIMIT 1
             ), cost_amount)
         WHERE voucher_id IN (
             SELECT id FROM vouchers WHERE voucher_type = 'purchase_invoice'
         )",
    )
    .execute(pool)
    .await?;

    // 2. Sync stock_movements rates and cost amounts to net landed amounts for purchase returns
    sqlx::query(
        "UPDATE stock_movements
         SET rate = COALESCE((
                 SELECT CASE WHEN vi.base_quantity > 0 THEN vi.net_amount / vi.base_quantity ELSE stock_movements.rate END
                 FROM voucher_items vi
                 WHERE vi.voucher_id = stock_movements.voucher_id
                   AND vi.product_id = stock_movements.product_id
                   AND vi.item_type != 'service'
                 LIMIT 1
             ), rate),
             amount = COALESCE((
                 SELECT vi.net_amount
                 FROM voucher_items vi
                 WHERE vi.voucher_id = stock_movements.voucher_id
                   AND vi.product_id = stock_movements.product_id
                   AND vi.item_type != 'service'
                 LIMIT 1
             ), amount),
             cost_rate = COALESCE((
                 SELECT CASE WHEN vi.base_quantity > 0 THEN vi.net_amount / vi.base_quantity ELSE stock_movements.cost_rate END
                 FROM voucher_items vi
                 WHERE vi.voucher_id = stock_movements.voucher_id
                   AND vi.product_id = stock_movements.product_id
                   AND vi.item_type != 'service'
                 LIMIT 1
             ), cost_rate),
             cost_amount = COALESCE((
                 SELECT vi.net_amount
                 FROM voucher_items vi
                 WHERE vi.voucher_id = stock_movements.voucher_id
                   AND vi.product_id = stock_movements.product_id
                   AND vi.item_type != 'service'
                 LIMIT 1
             ), cost_amount)
         WHERE voucher_id IN (
             SELECT id FROM vouchers WHERE voucher_type = 'purchase_return'
         )",
    )
    .execute(pool)
    .await?;

    // 3. Remove redundant Discount Received (4004) entries from purchase invoices and purchase returns
    sqlx::query(
        "DELETE FROM journal_entries
         WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE account_code = '4004')
           AND voucher_id IN (
               SELECT id FROM vouchers WHERE voucher_type IN ('purchase_invoice', 'purchase_return')
           )",
    )
    .execute(pool)
    .await?;

    // 4. Correct Purchase Return (5003) credit amounts to net total in journal_entries if previously posted at gross
    sqlx::query(
        "UPDATE journal_entries
         SET credit = (
             SELECT v.total_amount
             FROM vouchers v
             WHERE v.id = journal_entries.voucher_id
         )
         WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE account_code = '5003')
           AND voucher_id IN (
               SELECT id FROM vouchers
               WHERE voucher_type = 'purchase_return'
                 AND COALESCE(discount_amount, 0) > 0
           )",
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn backfill_perpetual_inventory_gl(
    pool: &SqlitePool,
) -> Result<(), Box<dyn std::error::Error>> {
    // 1. Ensure required accounts exist in chart_of_accounts: 1004 (Inventory), 5002 (Cost of Goods Sold), 3004 (Opening Balance Adjustment)
    let inv_id: Option<String> = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '1004'")
        .fetch_optional(pool)
        .await?;
    let inv_id = match inv_id {
        Some(id) => id,
        None => {
            let id = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, is_system, is_active)
                 VALUES (?, '1004', 'Inventory', 'Asset', 'Inventory', 'Stock of goods for sale', 1, 1)"
            )
            .bind(&id)
            .execute(pool)
            .await?;
            id
        }
    };

    let cogs_id: Option<String> = sqlx::query_scalar("SELECT id FROM chart_of_accounts WHERE account_code = '5002'")
        .fetch_optional(pool)
        .await?;
    let cogs_id = match cogs_id {
        Some(id) => id,
        None => {
            let id = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, description, is_system, is_active)
                 VALUES (?, '5002', 'Cost of Goods Sold', 'Expense', 'Purchase Accounts', 'Cost of products sold', 1, 1)"
            )
            .bind(&id)
            .execute(pool)
            .await?;
            id
        }
    };

    // 2. Migrate Purchase Invoices:
    // Update any existing journal_entries for 5001 Purchases on purchase invoices to point to 1004 Inventory
    sqlx::query(
        "UPDATE journal_entries
         SET account_id = ?
         WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE account_code = '5001')
           AND voucher_id IN (SELECT id FROM vouchers WHERE voucher_type = 'purchase_invoice')"
    )
    .bind(&inv_id)
    .execute(pool)
    .await?;

    // In case a purchase invoice is missing a 1004 journal entry, insert it for the product lines subtotal
    let missing_pi: Vec<(String, f64)> = sqlx::query_as(
        "SELECT v.id,
                COALESCE(SUM(vi.net_amount), 0.0) as product_subtotal
         FROM vouchers v
         JOIN voucher_items vi ON v.id = vi.voucher_id AND vi.item_type != 'service'
         WHERE v.voucher_type = 'purchase_invoice'
           AND v.deleted_at IS NULL
           AND v.id NOT IN (
               SELECT DISTINCT je.voucher_id FROM journal_entries je WHERE je.account_id = ?
           )
         GROUP BY v.id
         HAVING product_subtotal > 0.0"
    )
    .bind(&inv_id)
    .fetch_all(pool)
    .await?;

    for (v_id, prod_subtotal) in missing_pi {
        let je_id = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit)
             VALUES (?, ?, ?, ?, 0.0)"
        )
        .bind(&je_id)
        .bind(&v_id)
        .bind(&inv_id)
        .bind(prod_subtotal)
        .execute(pool)
        .await?;
    }

    // 3. Migrate Purchase Returns:
    // Update any existing journal_entries for 5003 Purchase Returns on purchase returns to point to 1004 Inventory
    sqlx::query(
        "UPDATE journal_entries
         SET account_id = ?
         WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE account_code = '5003')
           AND voucher_id IN (SELECT id FROM vouchers WHERE voucher_type = 'purchase_return')"
    )
    .bind(&inv_id)
    .execute(pool)
    .await?;

    // 4. Backfill Sales Invoices:
    // Remove existing 5002/1004 secondary journal entries on sales invoices to ensure idempotency
    sqlx::query(
        "DELETE FROM journal_entries
         WHERE account_id IN (?, ?)
           AND voucher_id IN (SELECT id FROM vouchers WHERE voucher_type = 'sales_invoice')"
    )
    .bind(&cogs_id)
    .bind(&inv_id)
    .execute(pool)
    .await?;

    // For all active sales invoices with product items, insert Dr 5002 COGS and Cr 1004 Inventory
    let sales_invoices: Vec<(String, f64, Option<String>, Option<f64>)> = sqlx::query_as(
        "SELECT v.id,
                COALESCE(SUM(sm.cost_amount), 0.0) as total_cogs,
                v.currency_id,
                v.exchange_rate
         FROM vouchers v
         JOIN stock_movements sm ON v.id = sm.voucher_id AND sm.movement_type = 'OUT'
         WHERE v.voucher_type = 'sales_invoice'
           AND v.deleted_at IS NULL
         GROUP BY v.id
         HAVING total_cogs > 0.0"
    )
    .fetch_all(pool)
    .await?;

    for (v_id, cogs, cur_id, ex_rate) in sales_invoices {
        let (f_debit, f_credit, ex_r) = if let (Some(_), Some(rate)) = (&cur_id, ex_rate) {
            if rate > 0.0 {
                ((cogs / rate * 1000000.0).round() / 1000000.0, (cogs / rate * 1000000.0).round() / 1000000.0, rate)
            } else {
                (0.0, 0.0, 1.0)
            }
        } else {
            (0.0, 0.0, 1.0)
        };

        // Dr 5002 COGS
        let je_cogs = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, foreign_debit, foreign_credit, currency_id, exchange_rate)
             VALUES (?, ?, ?, ?, 0.0, 'Cost of Goods Sold', ?, 0.0, ?, ?)"
        )
        .bind(&je_cogs)
        .bind(&v_id)
        .bind(&cogs_id)
        .bind(cogs)
        .bind(if cur_id.is_some() { f_debit } else { 0.0 })
        .bind(&cur_id)
        .bind(ex_r)
        .execute(pool)
        .await?;

        // Cr 1004 Inventory
        let je_inv = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, foreign_debit, foreign_credit, currency_id, exchange_rate)
             VALUES (?, ?, ?, 0.0, ?, 'Inventory reduction at cost', 0.0, ?, ?, ?)"
        )
        .bind(&je_inv)
        .bind(&v_id)
        .bind(&inv_id)
        .bind(cogs)
        .bind(if cur_id.is_some() { f_credit } else { 0.0 })
        .bind(&cur_id)
        .bind(ex_r)
        .execute(pool)
        .await?;
    }

    // 5. Backfill Sales Returns:
    // Remove existing 5002/1004 secondary journal entries on sales returns to ensure idempotency
    sqlx::query(
        "DELETE FROM journal_entries
         WHERE account_id IN (?, ?)
           AND voucher_id IN (SELECT id FROM vouchers WHERE voucher_type = 'sales_return')
           AND narration IN ('Inventory return at cost', 'COGS reversal on Sales Return')"
    )
    .bind(&cogs_id)
    .bind(&inv_id)
    .execute(pool)
    .await?;

    // For all active sales returns with product items, insert Dr 1004 Inventory and Cr 5002 COGS
    let sales_returns: Vec<(String, f64, Option<String>, Option<f64>)> = sqlx::query_as(
        "SELECT v.id,
                COALESCE(SUM(sm.cost_amount), 0.0) as total_return_cost,
                v.currency_id,
                v.exchange_rate
         FROM vouchers v
         JOIN stock_movements sm ON v.id = sm.voucher_id AND sm.movement_type = 'IN'
         WHERE v.voucher_type = 'sales_return'
           AND v.deleted_at IS NULL
         GROUP BY v.id
         HAVING total_return_cost > 0.0"
    )
    .fetch_all(pool)
    .await?;

    for (v_id, return_cogs, cur_id, ex_rate) in sales_returns {
        let (f_debit, f_credit, ex_r) = if let (Some(_), Some(rate)) = (&cur_id, ex_rate) {
            if rate > 0.0 {
                ((return_cogs / rate * 1000000.0).round() / 1000000.0, (return_cogs / rate * 1000000.0).round() / 1000000.0, rate)
            } else {
                (0.0, 0.0, 1.0)
            }
        } else {
            (0.0, 0.0, 1.0)
        };

        // Dr 1004 Inventory
        let je_inv = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, foreign_debit, foreign_credit, currency_id, exchange_rate)
             VALUES (?, ?, ?, ?, 0.0, 'Inventory return at cost', ?, 0.0, ?, ?)"
        )
        .bind(&je_inv)
        .bind(&v_id)
        .bind(&inv_id)
        .bind(return_cogs)
        .bind(if cur_id.is_some() { f_debit } else { 0.0 })
        .bind(&cur_id)
        .bind(ex_r)
        .execute(pool)
        .await?;

        // Cr 5002 COGS
        let je_cogs = Uuid::now_v7().to_string();
        sqlx::query(
            "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration, foreign_debit, foreign_credit, currency_id, exchange_rate)
             VALUES (?, ?, ?, 0.0, ?, 'COGS reversal on Sales Return', 0.0, ?, ?, ?)"
        )
        .bind(&je_cogs)
        .bind(&v_id)
        .bind(&cogs_id)
        .bind(return_cogs)
        .bind(if cur_id.is_some() { f_credit } else { 0.0 })
        .bind(&cur_id)
        .bind(ex_r)
        .execute(pool)
        .await?;
    }

    // 6. Backfill Stock Journals:
    // Ensure all active stock journals have Dr 1004 Inventory and Cr 1004 Inventory entries
    sqlx::query(
        "DELETE FROM journal_entries
         WHERE account_id IN (?, ?)
           AND voucher_id IN (SELECT id FROM vouchers WHERE voucher_type = 'stock_journal')"
    )
    .bind(&inv_id)
    .bind(&cogs_id)
    .execute(pool)
    .await?;

    let stock_journals: Vec<(String, f64, f64, Option<String>)> = sqlx::query_as(
        "SELECT v.id,
                COALESCE(SUM(CASE WHEN sm.movement_type = 'IN' THEN sm.cost_amount ELSE 0.0 END), 0.0) as in_amount,
                COALESCE(SUM(CASE WHEN sm.movement_type = 'OUT' THEN sm.cost_amount ELSE 0.0 END), 0.0) as out_amount,
                v.narration
         FROM vouchers v
         JOIN stock_movements sm ON v.id = sm.voucher_id
         WHERE v.voucher_type = 'stock_journal'
           AND v.deleted_at IS NULL
         GROUP BY v.id
         HAVING in_amount > 0.0 OR out_amount > 0.0"
    )
    .fetch_all(pool)
    .await?;

    for (v_id, in_amt, out_amt, narr) in stock_journals {
        let default_narr = narr.unwrap_or_else(|| "Stock Journal".to_string());
        if in_amt > 0.0 && out_amt > 0.0 {
            // Transfer: Dr 1004 Inventory, Cr 1004 Inventory
            let je_in = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, ?, 0.0, 'Stock Journal - Destination Items (Inward)')"
            )
            .bind(&je_in)
            .bind(&v_id)
            .bind(&inv_id)
            .bind(in_amt)
            .execute(pool)
            .await?;

            let je_out = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0.0, ?, 'Stock Journal - Source Items (Outward)')"
            )
            .bind(&je_out)
            .bind(&v_id)
            .bind(&inv_id)
            .bind(out_amt)
            .execute(pool)
            .await?;
        } else if out_amt > 0.0 && in_amt == 0.0 {
            // Material consumption / Stock reduction: Dr 5002 COGS, Cr 1004 Inventory
            let je_cogs = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, ?, 0.0, ?)"
            )
            .bind(&je_cogs)
            .bind(&v_id)
            .bind(&cogs_id)
            .bind(out_amt)
            .bind(&default_narr)
            .execute(pool)
            .await?;

            let je_inv = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0.0, ?, ?)"
            )
            .bind(&je_inv)
            .bind(&v_id)
            .bind(&inv_id)
            .bind(out_amt)
            .bind(&default_narr)
            .execute(pool)
            .await?;
        } else if in_amt > 0.0 && out_amt == 0.0 {
            // Stock addition: Dr 1004 Inventory, Cr 5002 COGS
            let je_inv = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, ?, 0.0, ?)"
            )
            .bind(&je_inv)
            .bind(&v_id)
            .bind(&inv_id)
            .bind(in_amt)
            .bind(&default_narr)
            .execute(pool)
            .await?;

            let je_cogs = Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO journal_entries (id, voucher_id, account_id, debit, credit, narration)
                 VALUES (?, ?, ?, 0.0, ?, ?)"
            )
            .bind(&je_cogs)
            .bind(&v_id)
            .bind(&cogs_id)
            .bind(in_amt)
            .bind(&default_narr)
            .execute(pool)
            .await?;
        }
    }

    Ok(())
}

/// Initialize the schema (tables + migrations) on an already-connected pool.
/// Called by DbRegistry when opening or creating a company database.
pub async fn init_schema(pool: &SqlitePool) -> Result<(), Box<dyn std::error::Error>> {

    // ==================== CORE TABLES ====================

    // Users table
    println!("DB: Creating users table...");
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            role TEXT DEFAULT 'user',
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        .execute(pool)
        .await?;
    println!("DB: Users table created/checked");

    // Countries
    println!("DB: Creating countries table...");
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS countries (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            code TEXT UNIQUE NOT NULL
        )",
    )
    .execute(pool)
    .await?;

    // Currencies
    println!("DB: Creating currencies table...");
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS currencies (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            symbol TEXT,
            country TEXT
        )",
    )
    .execute(pool)
    .await?;

    // Units
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS units (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            symbol TEXT NOT NULL,
            is_default INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query("ALTER TABLE units ADD COLUMN is_default INTEGER DEFAULT 0")
        .execute(pool)
        .await;

    sqlx::query(
        "UPDATE units
         SET is_default = CASE
             WHEN id = (SELECT id FROM units ORDER BY is_default DESC, name ASC LIMIT 1) THEN 1
             ELSE 0
         END
         WHERE EXISTS (SELECT 1 FROM units)",
    )
    .execute(pool)
    .await?;

    // ==================== PRODUCT MODULE ====================

    // Product Groups
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS product_groups (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
    .execute(pool)
    .await?;

    // Product Brands
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS product_brands (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
    .execute(pool)
    .await?;

    // Products
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            group_id TEXT,
            unit_id TEXT NOT NULL,
            purchase_rate REAL NOT NULL,
            sales_rate REAL NOT NULL,
            mrp REAL NOT NULL,
            barcode TEXT,
            brand_id TEXT REFERENCES product_brands(id),
            part_number TEXT,
            supplier_id TEXT REFERENCES chart_of_accounts(id),
            is_master INTEGER NOT NULL DEFAULT 0,
            parent_product_id TEXT REFERENCES products(id),
            vehicle_make TEXT,
            vehicle_odometer REAL,
            vehicle_fuel_type TEXT,
            vehicle_transmission TEXT,
            vehicle_owner TEXT,
            vehicle_color TEXT,
            vehicle_manufacturer TEXT,
            vehicle_model TEXT,
            vehicle_year INTEGER,
            cost REAL,
            is_margin_scheme_default INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            deleted_at DATETIME,
            deleted_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (group_id) REFERENCES product_groups(id),
            FOREIGN KEY (unit_id) REFERENCES units(id)
        )",
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query("ALTER TABLE products ADD COLUMN barcode TEXT")
        .execute(pool)
        .await;

    // Migration: Add brand_id to products if not exists
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN brand_id TEXT REFERENCES product_brands(id)")
        .execute(pool)
        .await;

    // Migration: Add part_number to products if not exists
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN part_number TEXT")
        .execute(pool)
        .await;

    // Migration: Add supplier_id to products if not exists
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN supplier_id TEXT REFERENCES chart_of_accounts(id)")
        .execute(pool)
        .await;

    // Services
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS services (
            id            TEXT PRIMARY KEY,
            code          TEXT UNIQUE NOT NULL,
            name          TEXT NOT NULL,
            description   TEXT,
            unit_id       TEXT,
            hsn_sac_code  TEXT,
            gst_slab_id   TEXT,
            sales_rate    REAL DEFAULT 0,
            purchase_rate REAL DEFAULT 0,
            is_active     INTEGER DEFAULT 1,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at    DATETIME,
            FOREIGN KEY (unit_id) REFERENCES units(id)
        )",
    )
    .execute(pool)
    .await?;

    // ==================== ACCOUNTING MODULE ====================

    // Account Groups
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS account_groups (
            id TEXT PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            account_type TEXT NOT NULL,
            parent_group_id TEXT REFERENCES account_groups(id),
            is_system INTEGER DEFAULT 0,
            base_type TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    // ==================== ACCOUNT GROUPS MIGRATIONS ====================

    // Migration: Add parent_group_id for hierarchical (Tally-like) group nesting
    let _ = sqlx::query("ALTER TABLE account_groups ADD COLUMN parent_group_id TEXT REFERENCES account_groups(id)")
        .execute(pool).await;

    // Migration: Add is_system flag — system/seeded groups cannot be deleted
    let _ = sqlx::query("ALTER TABLE account_groups ADD COLUMN is_system INTEGER DEFAULT 0")
        .execute(pool).await;

    // Migration: Add base_type — stored only on root primary groups (Asset/Liability/Equity/Income/Expense)
    // Sub-groups derive their base type by walking up to the root ancestor.
    let _ = sqlx::query("ALTER TABLE account_groups ADD COLUMN base_type TEXT")
        .execute(pool).await;

    // Migration: Mark all original seeded groups as system-protected
    let _ = sqlx::query(
        "UPDATE account_groups SET is_system = 1
         WHERE name IN (
             'Current Assets','Bank Account','Cash','Non-Current Assets',
             'Accounts Receivable','Inventory','Tax Receivable',
             'Current Liabilities','Non-Current Liabilities','Accounts Payable',
             'Tax Payable','Duties & Taxes','Equity','Revenue','Other Income',
             'Cost of Sales','Operating Expenses','Financial Expenses','Discounts'
         )"
    ).execute(pool).await;

    // Migration: Set base_type on the groups that will remain as primary (root) nodes
    let _ = sqlx::query("UPDATE account_groups SET base_type = 'Asset'     WHERE name = 'Current Assets'       AND (parent_group_id IS NULL OR parent_group_id = '')").execute(pool).await;
    let _ = sqlx::query("UPDATE account_groups SET base_type = 'Liability' WHERE name = 'Current Liabilities'  AND (parent_group_id IS NULL OR parent_group_id = '')").execute(pool).await;
    let _ = sqlx::query("UPDATE account_groups SET base_type = 'Income'    WHERE name = 'Sales Accounts'       AND (parent_group_id IS NULL OR parent_group_id = '')").execute(pool).await;
    let _ = sqlx::query("UPDATE account_groups SET base_type = 'Expense'   WHERE name = 'Purchase Accounts'    AND (parent_group_id IS NULL OR parent_group_id = '')").execute(pool).await;
    let _ = sqlx::query("UPDATE account_groups SET base_type = 'Expense'   WHERE name = 'Indirect Expenses'    AND (parent_group_id IS NULL OR parent_group_id = '')").execute(pool).await;

    // Migration: Assign sub-groups under Current Assets
    let _ = sqlx::query(
        "UPDATE account_groups
         SET parent_group_id = (SELECT id FROM account_groups WHERE name = 'Current Assets')
         WHERE name IN ('Bank Account','Cash','Accounts Receivable','Inventory','Tax Receivable')
           AND parent_group_id IS NULL"
    ).execute(pool).await;

    // Migration: Assign sub-groups under Current Liabilities
    let _ = sqlx::query(
        "UPDATE account_groups
         SET parent_group_id = (SELECT id FROM account_groups WHERE name = 'Current Liabilities')
         WHERE name IN ('Accounts Payable','Tax Payable','Duties & Taxes')
           AND parent_group_id IS NULL"
    ).execute(pool).await;

    // Migration: Assign sub-groups under Indirect Expenses
    let _ = sqlx::query(
        "UPDATE account_groups
         SET parent_group_id = (SELECT id FROM account_groups WHERE name = 'Indirect Expenses')
         WHERE name IN ('Operating Expenses','Financial Expenses','Discounts')"
    ).execute(pool).await;

    // Migration: Assign Other Income under Indirect Income
    let _ = sqlx::query(
        "UPDATE account_groups
         SET parent_group_id = (SELECT id FROM account_groups WHERE name = 'Indirect Income')
         WHERE name = 'Other Income'"
    ).execute(pool).await;

    // Migration: Update default ledger 3001 from 'Capital' to 'Owner''s Capital' under group 'Capital Account'
    let _ = sqlx::query(
        "UPDATE chart_of_accounts
         SET account_name = 'Owner''s Capital', account_group = 'Capital Account'
         WHERE account_code = '3001' AND account_name = 'Capital'"
    ).execute(pool).await;

    // Migration: Re-assign Discount Received (4004) to 'Indirect Income'
    let _ = sqlx::query(
        "UPDATE chart_of_accounts
         SET account_group = 'Indirect Income'
         WHERE account_code = '4004'"
    ).execute(pool).await;

    // Migration: Re-assign Discount Allowed (5007) to 'Indirect Expenses'
    let _ = sqlx::query(
        "UPDATE chart_of_accounts
         SET account_group = 'Indirect Expenses'
         WHERE account_code = '5007'"
    ).execute(pool).await;

    // Migration: Update group name 'Revenue' -> 'Sales Accounts' if present
    let _ = sqlx::query("UPDATE account_groups SET name = 'Sales Accounts' WHERE name = 'Revenue'").execute(pool).await;
    let _ = sqlx::query("UPDATE chart_of_accounts SET account_group = 'Sales Accounts' WHERE account_group = 'Revenue'").execute(pool).await;

    // Migration: Update group name 'Cost of Sales' -> 'Purchase Accounts' if present
    let _ = sqlx::query("UPDATE account_groups SET name = 'Purchase Accounts' WHERE name = 'Cost of Sales'").execute(pool).await;
    let _ = sqlx::query("UPDATE chart_of_accounts SET account_group = 'Purchase Accounts' WHERE account_group = 'Cost of Sales'").execute(pool).await;

    // Migration: Seed / ensure 'Job Work Expenses' subgroup under 'Direct Expenses'
    let _ = sqlx::query(
        "INSERT OR IGNORE INTO account_groups (id, name, account_type, parent_group_id, is_system, base_type)
         VALUES (
             hex(randomblob(16)),
             'Job Work Expenses',
             'Expense',
             (SELECT id FROM account_groups WHERE name = 'Direct Expenses'),
             1,
             'Expense'
         )"
    ).execute(pool).await;

    let _ = sqlx::query(
        "UPDATE account_groups
         SET parent_group_id = (SELECT id FROM account_groups WHERE name = 'Direct Expenses'),
             base_type = 'Expense'
         WHERE name = 'Job Work Expenses' AND (parent_group_id IS NULL OR parent_group_id = '')"
    ).execute(pool).await;

    // Migration: Remove legacy 6011 Job Work Charges ledger if unused
    let _ = sqlx::query(
        "DELETE FROM chart_of_accounts
         WHERE account_code = '6011'
           AND id NOT IN (SELECT DISTINCT account_id FROM journal_entries WHERE account_id IS NOT NULL)"
    ).execute(pool).await;

    // Migration: Legacy GST Slab Ledgers Clean-up
    // 1. Delete zero-balance / unused legacy tax slab ledgers
    let _ = sqlx::query(
        "DELETE FROM chart_of_accounts
         WHERE (account_code LIKE 'GST-%' OR account_code LIKE 'GST-AUTO-%')
           AND account_code NOT IN ('2002-CGST','2002-SGST','2002-IGST','1005-CGST','1005-SGST','1005-IGST')
           AND id NOT IN (SELECT DISTINCT account_id FROM journal_entries WHERE account_id IS NOT NULL)"
    ).execute(pool).await;

    // 2. Deactivate used legacy tax slab ledgers so they hide from selection pickers while preserving historical entries
    let _ = sqlx::query(
        "UPDATE chart_of_accounts
         SET is_active = 0
         WHERE (account_code LIKE 'GST-%' OR account_code LIKE 'GST-AUTO-%')
           AND account_code NOT IN ('2002-CGST','2002-SGST','2002-IGST','1005-CGST','1005-SGST','1005-IGST')
           AND account_name NOT IN ('CGST Output','SGST Output','IGST Output','CGST Input Credit','SGST Input Credit','IGST Input Credit')"
    ).execute(pool).await;

    // Migration: Non-Current Assets / Non-Current Liabilities get assigned
    // once Fixed Assets / Loans (Liability) primary groups are seeded (done in seed_initial_data)
    // This is handled in seeds/data.rs after inserting the new primaries.

    // Chart of Accounts (Parties & Ledgers)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS chart_of_accounts (
            id TEXT PRIMARY KEY,
            account_code TEXT UNIQUE NOT NULL,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            account_group TEXT NOT NULL,
            description TEXT,
            opening_balance REAL DEFAULT 0.0,
            opening_balance_type TEXT DEFAULT 'Dr',
            party_id TEXT,
            party_type TEXT,
            gstin TEXT,
            address_line_1 TEXT,
            address_line_2 TEXT,
            state TEXT,
            city TEXT,
            postal_code TEXT,
            price_category_id TEXT REFERENCES price_categories(id),
            is_active INTEGER DEFAULT 1,
            is_system INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
    .execute(pool)
    .await?;

    // Customers (Legacy - maintained for compatibility if needed, but logic uses chart_of_accounts)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            code TEXT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            address TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME,
            currency TEXT
        )",
    )
    .execute(pool)
    .await?;

    // Suppliers (Legacy)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS suppliers (
            id TEXT PRIMARY KEY,
            code TEXT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            address TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME,
            currency TEXT
        )",
    )
    .execute(pool)
    .await?;

    // Opening Balances
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS opening_balances (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            opening_debit REAL DEFAULT 0,
            opening_credit REAL DEFAULT 0,
            financial_year TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(account_id, financial_year),
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        )",
    )
    .execute(pool)
    .await?;

    // ==================== TRANSACTION MODULE ====================

    // Vouchers (Master Transaction Table)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS vouchers (
            id TEXT PRIMARY KEY,
            voucher_no TEXT UNIQUE NOT NULL,
            voucher_type TEXT NOT NULL,
            voucher_date DATE NOT NULL,
            reference TEXT,
            party_id TEXT,
            party_type TEXT,
            salesperson_id TEXT,
            account_id TEXT,
            subtotal REAL DEFAULT 0,
            discount_rate REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            tax_amount REAL DEFAULT 0,
            total_amount REAL DEFAULT 0,
            cgst_amount REAL DEFAULT 0,
            sgst_amount REAL DEFAULT 0,
            igst_amount REAL DEFAULT 0,
            grand_total REAL DEFAULT 0,
            tax_inclusive INTEGER NOT NULL DEFAULT 0,
            gst_disabled INTEGER DEFAULT 0,
            narration TEXT,
            status TEXT DEFAULT 'posted',
            payment_status TEXT DEFAULT 'unpaid',
            created_from_invoice_id TEXT,
            linked_return_id TEXT,
            irn TEXT,
            ack_no TEXT,
            ack_date DATE,
            is_margin_scheme_invoice INTEGER DEFAULT 0,
            currency_id TEXT REFERENCES currencies(id),
            exchange_rate REAL DEFAULT 1.0,
            foreign_total REAL DEFAULT 0,
            price_category_id TEXT REFERENCES price_categories(id),
            metadata TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
        )",
    )
    .execute(pool)
    .await?;

    // Migration: Add columns to vouchers if missing
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN salesperson_id TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN created_by TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN tax_inclusive INTEGER NOT NULL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN cgst_amount REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN sgst_amount REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN igst_amount REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN grand_total REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN linked_return_id TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN gst_disabled INTEGER DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN irn TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN ack_no TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN ack_date DATE").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN is_margin_scheme_invoice INTEGER DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN currency_id TEXT REFERENCES currencies(id)").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN exchange_rate REAL DEFAULT 1.0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN foreign_total REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN price_category_id TEXT REFERENCES price_categories(id)").execute(pool).await;

    // Migration: Add show_less_column if not exists
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN show_less_column INTEGER DEFAULT 1")
            .execute(pool)
            .await;
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN show_discount_column INTEGER DEFAULT 0")
            .execute(pool)
            .await;

    // Migration: Add show_party_name if not exists
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN show_party_name INTEGER DEFAULT 1")
            .execute(pool)
            .await;

    // Migration: Add table_row_padding if not exists
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN table_row_padding INTEGER DEFAULT 8")
            .execute(pool)
            .await;

    // Migration: Add balance section style columns if not exists
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN balance_font_size INTEGER DEFAULT 10")
            .execute(pool)
            .await;
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN balance_bold INTEGER DEFAULT 0")
            .execute(pool)
            .await;
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN show_balance_section INTEGER DEFAULT 1")
            .execute(pool)
            .await;

    // Data fix: Backfill grand_total for payment/receipt vouchers where it was never stored (still 0).
    // We derive grand_total from the journal credit (payment) or debit (receipt) side which was
    // always correctly recorded. Falls back to total_amount if no journal entries exist.
    let _ = sqlx::query(
        "UPDATE vouchers
         SET grand_total = (
             SELECT COALESCE(SUM(je.credit), vouchers.total_amount, 0)
             FROM journal_entries je
             WHERE je.voucher_id = vouchers.id AND je.credit > 0
          )
         WHERE voucher_type = 'payment'
           AND grand_total = 0
           AND total_amount > 0
           AND deleted_at IS NULL"
    )
    .execute(pool)
    .await;

    let _ = sqlx::query(
        "UPDATE vouchers
         SET grand_total = (
             SELECT COALESCE(SUM(je.debit), vouchers.total_amount, 0)
             FROM journal_entries je
             WHERE je.voucher_id = vouchers.id AND je.debit > 0
             -- Only the single cash/bank debit entry represents the total received
             LIMIT 1
          )
         WHERE voucher_type = 'receipt'
           AND grand_total = 0
           AND total_amount > 0
           AND deleted_at IS NULL"
    )
    .execute(pool)
    .await;

    // Simpler fallback: if journal approach gives NULL, just copy total_amount
    let _ = sqlx::query(
        "UPDATE vouchers
         SET grand_total = total_amount
         WHERE voucher_type IN ('payment', 'receipt')
           AND grand_total = 0
           AND total_amount > 0
           AND deleted_at IS NULL"
    )
    .execute(pool)
    .await;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_vouchers_salesperson ON vouchers(salesperson_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(voucher_type)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(voucher_date)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_vouchers_party ON vouchers(party_id, party_type)")
        .execute(pool)
        .await?;

    // Voucher Items (Invoice Line Items)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS voucher_items (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            product_id TEXT,
            service_id TEXT,
            ledger_id TEXT,
            item_type TEXT DEFAULT 'product',
            description TEXT,
            initial_quantity REAL NOT NULL,
            count INTEGER NOT NULL,
            deduction_per_unit REAL DEFAULT 0,
            final_quantity REAL,
            unit_id TEXT,
            base_quantity REAL,
            rate REAL NOT NULL,
            amount REAL NOT NULL,
            net_amount REAL DEFAULT 0,
            original_amount REAL DEFAULT 0,
            discount_percent REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            invoice_discount_amount REAL DEFAULT 0,
            tax_rate REAL DEFAULT 0,
            tax_amount REAL DEFAULT 0,
            cgst_rate REAL DEFAULT 0,
            sgst_rate REAL DEFAULT 0,
            igst_rate REAL DEFAULT 0,
            cgst_amount REAL DEFAULT 0,
            sgst_amount REAL DEFAULT 0,
            igst_amount REAL DEFAULT 0,
            hsn_sac_code TEXT,
            gst_slab_id TEXT,
            resolved_gst_rate REAL DEFAULT 0,
            is_margin_scheme INTEGER DEFAULT 0,
            purchase_cost REAL DEFAULT 0,
            margin_amount REAL DEFAULT 0,
            remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (service_id) REFERENCES services(id)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS product_unit_conversions (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            unit_id TEXT NOT NULL,
            factor_to_base REAL NOT NULL,
            purchase_rate REAL NOT NULL DEFAULT 0,
            sales_rate REAL NOT NULL DEFAULT 0,
            is_default_sale INTEGER DEFAULT 0,
            is_default_purchase INTEGER DEFAULT 0,
            is_default_report INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(product_id, unit_id),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (unit_id) REFERENCES units(id)
        )",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_product_unit_conversions_product
         ON product_unit_conversions(product_id)",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_product_unit_conversions_unit
         ON product_unit_conversions(unit_id)",
    )
    .execute(pool)
    .await?;
    let _ = sqlx::query("ALTER TABLE product_unit_conversions ADD COLUMN purchase_rate REAL NOT NULL DEFAULT 0")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE product_unit_conversions ADD COLUMN sales_rate REAL NOT NULL DEFAULT 0")
        .execute(pool)
        .await;

    // Migration: ensure every product has at least a base unit conversion
    let unmapped_products: Result<Vec<(String, String, f64, f64)>, _> = sqlx::query_as(
        "SELECT p.id, p.unit_id, p.purchase_rate, p.sales_rate 
         FROM products p
         LEFT JOIN product_unit_conversions puc ON p.id = puc.product_id
         WHERE puc.id IS NULL"
    )
    .fetch_all(pool)
    .await;

    if let Ok(products) = unmapped_products {
        for (product_id, unit_id, purchase_rate, sales_rate) in products {
            let puc_id = uuid::Uuid::now_v7().to_string();
            let _ = sqlx::query(
                "INSERT INTO product_unit_conversions 
                (id, product_id, unit_id, factor_to_base, purchase_rate, sales_rate, is_default_sale, is_default_purchase, is_default_report)
                VALUES (?, ?, ?, 1.0, ?, ?, 1, 1, 1)"
            )
            .bind(puc_id)
            .bind(product_id)
            .bind(unit_id)
            .bind(purchase_rate)
            .bind(sales_rate)
            .execute(pool)
            .await;
        }
    }

    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN unit_id TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN base_quantity REAL")
        .execute(pool)
        .await;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_voucher_items_voucher ON voucher_items(voucher_id)",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_voucher_items_product ON voucher_items(product_id)",
    )
    .execute(pool)
    .await?;

    // Migration: Add discount_percent to voucher_items if not exists
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN discount_percent REAL DEFAULT 0")
        .execute(pool)
        .await;

    // Migration: Add discount_amount to voucher_items if not exists
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN discount_amount REAL DEFAULT 0")
        .execute(pool)
        .await;

    // Migration: Add item_type discriminator (default 'product' for all existing rows)
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN item_type TEXT DEFAULT 'product'")
        .execute(pool)
        .await;

    // Migration: Add service_id FK for service line items
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN service_id TEXT REFERENCES services(id)")
        .execute(pool)
        .await;

    // Migration: Add GST split & net_amount columns to voucher_items if missing
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN cgst_rate REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN sgst_rate REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN igst_rate REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN cgst_amount REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN sgst_amount REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN igst_amount REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN hsn_sac_code TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN gst_slab_id TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN resolved_gst_rate REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN original_amount REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN invoice_discount_amount REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN net_amount REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("UPDATE voucher_items SET net_amount = amount WHERE COALESCE(net_amount, 0) = 0").execute(pool).await;

    // Journal Entries (Ledger Postings)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS journal_entries (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            debit REAL DEFAULT 0,
            credit REAL DEFAULT 0,
            foreign_debit REAL DEFAULT 0,
            foreign_credit REAL DEFAULT 0,
            currency_id TEXT,
            exchange_rate REAL DEFAULT 1.0,
            is_manual INTEGER DEFAULT 0,
            narration TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        )",
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query("ALTER TABLE journal_entries ADD COLUMN foreign_debit REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE journal_entries ADD COLUMN foreign_credit REAL DEFAULT 0").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE journal_entries ADD COLUMN currency_id TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE journal_entries ADD COLUMN exchange_rate REAL DEFAULT 1.0").execute(pool).await;
    let _ = sqlx::query("UPDATE journal_entries SET is_manual = 1 WHERE voucher_id IN (SELECT id FROM vouchers WHERE voucher_type = 'journal') AND is_manual = 0").execute(pool).await;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_journal_voucher ON journal_entries(voucher_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_journal_account ON journal_entries(account_id)")
        .execute(pool)
        .await?;

    // Stock Movements
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS stock_movements (
            id TEXT PRIMARY KEY,
            voucher_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            movement_type TEXT NOT NULL,
            quantity REAL NOT NULL,
            count INTEGER DEFAULT 0,
            rate REAL NOT NULL,
            amount REAL NOT NULL,
            cost_rate REAL DEFAULT 0,
            cost_amount REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_stock_movements_voucher ON stock_movements(voucher_id)",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)",
    )
    .execute(pool)
    .await?;
    let _ = sqlx::query("ALTER TABLE stock_movements ADD COLUMN cost_rate REAL DEFAULT 0")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE stock_movements ADD COLUMN cost_amount REAL DEFAULT 0")
        .execute(pool)
        .await;
    backfill_stock_movement_costs(pool).await?;
    migrate_purchase_discounts_and_stock_valuation(pool).await?;
    backfill_perpetual_inventory_gl(pool).await?;

    // Payment/Receipt Allocations
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS payment_allocations (
            id TEXT PRIMARY KEY,
            payment_voucher_id TEXT NOT NULL,
            invoice_voucher_id TEXT NOT NULL,
            allocated_amount REAL NOT NULL,
            allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
            remarks TEXT,
            party_id TEXT,
            party_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (payment_voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (invoice_voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations(payment_voucher_id)").execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_allocations_invoice ON payment_allocations(invoice_voucher_id)").execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_allocations_party ON payment_allocations(party_id, party_type)").execute(pool).await?;

    // ==================== SETTINGS & CONFIG ====================

    // Invoice Templates
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS invoice_templates (
            id TEXT PRIMARY KEY,
            template_number TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            voucher_type TEXT NOT NULL,
            template_format TEXT NOT NULL,
            design_mode TEXT NOT NULL,
            layout_config TEXT,
            header_html TEXT,
            body_html TEXT,
            footer_html TEXT,
            styles_css TEXT,
            show_logo INTEGER DEFAULT 1,
            show_company_address INTEGER DEFAULT 1,
            show_party_name INTEGER DEFAULT 1,
            show_party_address INTEGER DEFAULT 1,
            table_row_padding INTEGER DEFAULT 8,
            show_bank_details INTEGER DEFAULT 1,
            show_gstin INTEGER DEFAULT 1,
            show_item_images INTEGER DEFAULT 0,
            show_item_hsn INTEGER DEFAULT 0,
            show_qr_code INTEGER DEFAULT 0,
            show_signature INTEGER DEFAULT 1,
            show_terms INTEGER DEFAULT 1,
            show_less_column INTEGER DEFAULT 1,
            show_discount_column INTEGER DEFAULT 0,
            show_balance_section INTEGER DEFAULT 1,
            auto_print INTEGER DEFAULT 0,
            copies INTEGER DEFAULT 1,
            is_default INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            letterhead_data TEXT,
            use_letterhead INTEGER DEFAULT 0,
            letterhead_margin_top REAL DEFAULT 45.0,
            letterhead_margin_bottom REAL DEFAULT 25.0,
            header_title TEXT,
            bill_note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    // Migration: Add show_less_column if not exists
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN show_less_column INTEGER DEFAULT 1")
            .execute(pool)
            .await;
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN show_discount_column INTEGER DEFAULT 0")
            .execute(pool)
            .await;

    // ==================== CUSTOM ORDERS MODULE ====================

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS custom_orders (
            id                  TEXT PRIMARY KEY,
            order_no            TEXT UNIQUE NOT NULL,
            order_date          DATE NOT NULL,
            delivery_date       DATE,
            customer_id         TEXT NOT NULL,
            status              TEXT DEFAULT 'pending',
            finished_item_name  TEXT NOT NULL,
            finished_item_qty   REAL DEFAULT 1,
            finished_item_unit  TEXT,
            sale_price          REAL DEFAULT 0,
            advance_amount      REAL DEFAULT 0,
            advance_voucher_id  TEXT,
            total_material_cost REAL DEFAULT 0,
            total_purchase_cost REAL DEFAULT 0,
            total_service_cost  REAL DEFAULT 0,
            total_job_cost      REAL DEFAULT 0,
            final_invoice_id    TEXT,
            reference           TEXT,
            narration           TEXT,
            created_by          TEXT,
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at          DATETIME,
            FOREIGN KEY (customer_id) REFERENCES chart_of_accounts(id)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS custom_order_materials (
            id               TEXT PRIMARY KEY,
            order_id         TEXT NOT NULL,
            product_id       TEXT NOT NULL,
            description      TEXT,
            quantity         REAL NOT NULL,
            unit_id          TEXT,
            rate             REAL NOT NULL,
            amount           REAL NOT NULL,
            stock_journal_id TEXT,
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id)   REFERENCES custom_orders(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS custom_order_purchases (
            id              TEXT PRIMARY KEY,
            order_id        TEXT NOT NULL,
            description     TEXT NOT NULL,
            supplier_id     TEXT,
            quantity        REAL DEFAULT 1,
            unit_id         TEXT,
            rate            REAL NOT NULL,
            amount          REAL NOT NULL,
            expense_account TEXT,
            purchase_date   DATE,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES custom_orders(id) ON DELETE CASCADE
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS custom_order_services (
            id              TEXT PRIMARY KEY,
            order_id        TEXT NOT NULL,
            service_id      TEXT,
            description     TEXT NOT NULL,
            quantity        REAL DEFAULT 1,
            rate            REAL NOT NULL,
            amount          REAL NOT NULL,
            expense_account TEXT,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_id) REFERENCES custom_orders(id) ON DELETE CASCADE
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_custom_orders_customer ON custom_orders(customer_id)")
        .execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_custom_orders_status ON custom_orders(status)")
        .execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_custom_order_materials_order ON custom_order_materials(order_id)")
        .execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_custom_order_purchases_order ON custom_order_purchases(order_id)")
        .execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_custom_order_services_order ON custom_order_services(order_id)")
        .execute(pool).await?;

    // Migration: add voucher_id column to custom_order_purchases if missing
    let _ = sqlx::query("ALTER TABLE custom_order_purchases ADD COLUMN voucher_id TEXT")
        .execute(pool)
        .await;

    // Migration: add reference column to custom_orders if missing
    let _ = sqlx::query("ALTER TABLE custom_orders ADD COLUMN reference TEXT")
        .execute(pool)
        .await;

    // Seed voucher sequence for custom orders (default CO-0001)
    let _ = sqlx::query(
        "INSERT OR IGNORE INTO voucher_sequences (id, voucher_type, prefix, suffix, separator, next_number, padding, include_financial_year, reset_yearly)
         VALUES (hex(randomblob(16)), 'custom_order', 'CO', '', '-', 1, 4, 0, 0)",
    )
    .execute(pool)
    .await;

    let _ = sqlx::query(
        "UPDATE voucher_sequences SET include_financial_year = 0 WHERE voucher_type = 'custom_order' AND (include_financial_year = 1 OR include_financial_year IS NULL)",
    )
    .execute(pool)
    .await;

    // Seed Job Material Cost ledger account (for direct-expense order purchases)
    let _ = sqlx::query(
        "INSERT OR IGNORE INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, is_system, is_active)
         VALUES (hex(randomblob(16)), '6010', 'Job Material Cost', 'Expense', 'Purchase Accounts', 0, 1)",
    )
    .execute(pool)
    .await;

    // Seed Job COGS ledger account
    let _ = sqlx::query(
        "INSERT OR IGNORE INTO chart_of_accounts (id, account_code, account_name, account_type, account_group, is_system, is_active)
         VALUES (hex(randomblob(16)), '6012', 'Custom Order COGS', 'Expense', 'Purchase Accounts', 0, 1)",
    )
    .execute(pool)
    .await;

    // Payment/Receipt Allocations
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS payment_allocations (
            id TEXT PRIMARY KEY,
            payment_voucher_id TEXT NOT NULL,
            invoice_voucher_id TEXT NOT NULL,
            allocated_amount REAL NOT NULL,
            allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
            remarks TEXT,
            party_id TEXT,
            party_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (payment_voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
            FOREIGN KEY (invoice_voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations(payment_voucher_id)").execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_allocations_invoice ON payment_allocations(invoice_voucher_id)").execute(pool).await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_allocations_party ON payment_allocations(party_id, party_type)").execute(pool).await?;

    // Migration: Multi-currency — add forex columns to vouchers
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN currency_id TEXT REFERENCES currencies(id)")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN exchange_rate REAL DEFAULT 1.0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN foreign_total REAL DEFAULT 0")
        .execute(pool).await;

    // Migration: Multi-currency — add forex columns to journal_entries
    let _ = sqlx::query("ALTER TABLE journal_entries ADD COLUMN foreign_debit REAL DEFAULT 0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE journal_entries ADD COLUMN foreign_credit REAL DEFAULT 0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE journal_entries ADD COLUMN currency_id TEXT")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE journal_entries ADD COLUMN exchange_rate REAL DEFAULT 1.0")
        .execute(pool).await;

    // Migration: Multi-currency — add forex columns to payment_allocations
    let _ = sqlx::query("ALTER TABLE payment_allocations ADD COLUMN exchange_rate REAL DEFAULT 1.0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE payment_allocations ADD COLUMN forex_difference REAL DEFAULT 0")
        .execute(pool).await;

    // Seed: Forex Exchange Gain (Indirect Income) — for when receipt rate > invoice rate
    let _ = sqlx::query(
        "INSERT OR IGNORE INTO chart_of_accounts 
         (id, account_code, account_name, account_type, account_group, is_system, is_active)
         VALUES ('sys_forex_gain', 'FOREX-001', 'Forex Exchange Gain', 'Income', 'Indirect Income', 1, 1)"
    ).execute(pool).await;

    // Seed: Forex Exchange Loss (Indirect Expenses) — for when receipt rate < invoice rate
    let _ = sqlx::query(
        "INSERT OR IGNORE INTO chart_of_accounts 
         (id, account_code, account_name, account_type, account_group, is_system, is_active)
         VALUES ('sys_forex_loss', 'FOREX-002', 'Forex Exchange Loss', 'Expense', 'Indirect Expenses', 1, 1)"
    ).execute(pool).await;

    // ==================== SETTINGS & CONFIG ====================

    // Invoice Templates
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS invoice_templates (
            id TEXT PRIMARY KEY,
            template_number TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            voucher_type TEXT NOT NULL,
            template_format TEXT NOT NULL,
            design_mode TEXT NOT NULL,
            layout_config TEXT,
            header_html TEXT,
            body_html TEXT,
            footer_html TEXT,
            styles_css TEXT,
            show_logo INTEGER DEFAULT 1,
            show_company_address INTEGER DEFAULT 1,
            show_party_name INTEGER DEFAULT 1,
            show_party_address INTEGER DEFAULT 1,
            table_row_padding INTEGER DEFAULT 8,
            show_bank_details INTEGER DEFAULT 1,
            show_gstin INTEGER DEFAULT 1,
            show_item_images INTEGER DEFAULT 0,
            show_item_hsn INTEGER DEFAULT 0,
            show_qr_code INTEGER DEFAULT 0,
            show_signature INTEGER DEFAULT 1,
            show_terms INTEGER DEFAULT 1,
            show_less_column INTEGER DEFAULT 1,
            show_discount_column INTEGER DEFAULT 0,
            show_balance_section INTEGER DEFAULT 1,
            auto_print INTEGER DEFAULT 0,
            copies INTEGER DEFAULT 1,
            is_default INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            letterhead_data TEXT,
            use_letterhead INTEGER DEFAULT 0,
            letterhead_margin_top REAL DEFAULT 45.0,
            letterhead_margin_bottom REAL DEFAULT 25.0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    // Migration: Add show_less_column if not exists
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN show_less_column INTEGER DEFAULT 1")
            .execute(pool)
            .await;
    let _ =
        sqlx::query("ALTER TABLE invoice_templates ADD COLUMN show_discount_column INTEGER DEFAULT 0")
            .execute(pool)
            .await;

    // Voucher Sequences
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS voucher_sequences (
            id TEXT PRIMARY KEY,
            voucher_type TEXT UNIQUE NOT NULL,
            prefix TEXT NOT NULL DEFAULT '',
            suffix TEXT NOT NULL DEFAULT '',
            separator TEXT NOT NULL DEFAULT '-',
            next_number INTEGER DEFAULT 1,
            padding INTEGER DEFAULT 4,
            include_financial_year INTEGER DEFAULT 0,
            reset_yearly INTEGER DEFAULT 0
        )",
    )
    .execute(pool)
    .await?;

    // Migrations: add new columns to voucher_sequences if not exists
    let _ = sqlx::query("ALTER TABLE voucher_sequences ADD COLUMN suffix TEXT NOT NULL DEFAULT ''")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE voucher_sequences ADD COLUMN separator TEXT NOT NULL DEFAULT '-'")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE voucher_sequences ADD COLUMN include_financial_year INTEGER DEFAULT 0")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE voucher_sequences ADD COLUMN reset_yearly INTEGER DEFAULT 0")
        .execute(pool)
        .await;

    sqlx::query(
        "INSERT OR IGNORE INTO voucher_sequences (id, voucher_type, prefix) VALUES
        ('vs_' || hex(randomblob(16)), 'sales_invoice', 'SI'),
        ('vs_' || hex(randomblob(16)), 'sales_return', 'SR'),
        ('vs_' || hex(randomblob(16)), 'sales_quotation', 'SQ'),
        ('vs_' || hex(randomblob(16)), 'delivery_note', 'DN'),
        ('vs_' || hex(randomblob(16)), 'purchase_invoice', 'PI'),
        ('vs_' || hex(randomblob(16)), 'purchase_return', 'PR'),
        ('vs_' || hex(randomblob(16)), 'purchase_quotation', 'PQ'),
        ('vs_' || hex(randomblob(16)), 'payment', 'PAY'),
        ('vs_' || hex(randomblob(16)), 'receipt', 'RCP'),
        ('vs_' || hex(randomblob(16)), 'journal', 'JV'),
        ('vs_' || hex(randomblob(16)), 'opening_balance', 'OB'),
        ('vs_' || hex(randomblob(16)), 'opening_stock', 'OS'),
        ('vs_' || hex(randomblob(16)), 'stock_journal', 'STJ')",
    )
    .execute(pool)
    .await?;

    // Migration: Sync voucher sequence settings with existing imported/created vouchers
    let _ = backfill_voucher_sequences(pool).await;

    // Company Profile & Other Global Settings
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS company_profile (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            business_type TEXT,
            address_line1 TEXT,
            address_line2 TEXT,
            address_line3 TEXT,
            city TEXT,
            state TEXT,
            pincode TEXT,
            country TEXT,
            phone TEXT,
            email TEXT,
            website TEXT,
            gstin TEXT,
            pan TEXT,
            cin TEXT,
            logo_data TEXT,
            bank_name TEXT,
            bank_account_no TEXT,
            bank_ifsc TEXT,
            bank_branch TEXT,
            terms_and_conditions TEXT,
            base_currency TEXT DEFAULT 'INR',
            currency_display TEXT DEFAULT 'symbol',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    // Migration: Add base_currency if not exists
    let _ = sqlx::query("ALTER TABLE company_profile ADD COLUMN base_currency TEXT DEFAULT 'INR'")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE company_profile ADD COLUMN currency_display TEXT DEFAULT 'symbol'")
        .execute(pool)
        .await;

    // Voucher Settings
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS voucher_settings (
            voucher_type TEXT PRIMARY KEY,
            settings TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS app_settings (
            id TEXT PRIMARY KEY,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    // ==================== HR & PAYROLL MODULE ====================

    // Employees
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS employees (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            account_id TEXT,
            code TEXT UNIQUE,
            name TEXT NOT NULL,
            designation TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            joining_date DATE,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_employees_user ON employees(user_id)")
        .execute(pool)
        .await?;

    // Migration: Backfill code for existing employees missing code or having temp EMP- account codes
    if let Ok(unassigned_employees) = sqlx::query_as::<_, (String, Option<String>, Option<String>)>(
        "SELECT id, code, account_id FROM employees WHERE code IS NULL OR code = '' OR account_id IN (SELECT id FROM chart_of_accounts WHERE account_code LIKE 'EMP-%') ORDER BY created_at ASC"
    )
    .fetch_all(pool)
    .await
    {
        if !unassigned_employees.is_empty() {
            let mut next_num: i64 = sqlx::query_scalar(
                "SELECT MAX(CAST(SUBSTR(code_value, 2) AS INTEGER)) FROM (
                    SELECT code AS code_value FROM employees WHERE code GLOB 'E[0-9]*'
                    UNION ALL
                    SELECT account_code AS code_value FROM chart_of_accounts WHERE account_code GLOB 'E[0-9]*'
                )"
            )
            .fetch_one(pool)
            .await
            .unwrap_or(None)
            .unwrap_or(100);

            for (emp_id, emp_code, account_id) in unassigned_employees {
                let final_code = match emp_code {
                    Some(c) if !c.trim().is_empty() => c,
                    _ => {
                        next_num += 1;
                        format!("E{}", next_num)
                    }
                };
                let _ = sqlx::query("UPDATE employees SET code = ? WHERE id = ?")
                    .bind(&final_code)
                    .bind(&emp_id)
                    .execute(pool)
                    .await;

                if let Some(acc_id) = account_id {
                    let _ = sqlx::query("UPDATE chart_of_accounts SET account_code = ? WHERE id = ?")
                        .bind(&final_code)
                        .bind(&acc_id)
                        .execute(pool)
                        .await;
                }
            }
        }
    }

    // ==================== GST MODULE ====================

    // GST Tax Slabs table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS gst_tax_slabs (
            id            TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            is_dynamic    INTEGER DEFAULT 0,
            fixed_rate    REAL DEFAULT 0,
            threshold     REAL DEFAULT 0,
            below_rate    REAL DEFAULT 0,
            above_rate    REAL DEFAULT 0,
            is_active     INTEGER DEFAULT 1,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    // Seed default GST slabs
    sqlx::query(
        "INSERT OR IGNORE INTO gst_tax_slabs (id, name, is_dynamic, fixed_rate) VALUES
        ('gst_0',   'NIL',   0, 0),
        ('gst_5',   'GST 5%',   0, 5),
        ('gst_18',  'GST 18%',  0, 18),
        ('gst_28',  'GST 28%',  0, 28)",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT OR IGNORE INTO gst_tax_slabs
            (id, name, is_dynamic, fixed_rate, threshold, below_rate, above_rate, is_active)
         VALUES
            ('gst_apparel', 'GST 5/18 @2500', 1, 0, 2500.0, 5.0, 18.0, 1)",
    )
    .execute(pool)
    .await?;

    // ==================== GST MODULE MIGRATIONS ====================

    // Migration: rename GST 0% to NIL
    let _ = sqlx::query("UPDATE gst_tax_slabs SET name = 'NIL' WHERE id = 'gst_0' AND name != 'NIL'")
        .execute(pool)
        .await;

    // Migration: update apparel slab for existing databases
    let _ = sqlx::query(
        "UPDATE gst_tax_slabs
         SET name = 'GST 5/18 @2500',
             is_dynamic = 1,
             fixed_rate = 0,
             threshold = 2500.0,
             below_rate = 5.0,
             above_rate = 18.0,
             is_active = 1
         WHERE id = 'gst_apparel'"
    )
    .execute(pool)
    .await;

    // Migration: retire GST 12% fixed slab
    let _ = sqlx::query("UPDATE gst_tax_slabs SET is_active = 0 WHERE id = 'gst_12'")
    .execute(pool)
    .await;

    // Migration: Add GST columns to products
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN hsn_sac_code TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN gst_slab_id TEXT REFERENCES gst_tax_slabs(id)")
        .execute(pool)
        .await;

    // Migration: Add GST columns to customers
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN gstin TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN address_line_1 TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN address_line_2 TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN address_line_3 TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN state TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN city TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN postal_code TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN country TEXT").execute(pool).await;

    // Migration: Move legacy address to address_line_1 and drop address column
    let _ = sqlx::query("UPDATE customers SET address_line_1 = address WHERE address_line_1 IS NULL OR address_line_1 = ''").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE customers DROP COLUMN address").execute(pool).await;

    // Migration: Add GST columns to suppliers
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN gstin TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN address_line_1 TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN address_line_2 TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN address_line_3 TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN state TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN city TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN postal_code TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN country TEXT").execute(pool).await;

    // Migration: Move legacy address to address_line_1 and drop address column
    let _ = sqlx::query("UPDATE suppliers SET address_line_1 = address WHERE address_line_1 IS NULL OR address_line_1 = ''").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers DROP COLUMN address").execute(pool).await;

    // Migration: Add currency column to customers and suppliers, and convert country to ID reference
    let _ = sqlx::query("ALTER TABLE customers ADD COLUMN currency TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE suppliers ADD COLUMN currency TEXT").execute(pool).await;

    // Map existing text country to country ID
    let _ = sqlx::query(
        "UPDATE customers 
         SET country = (SELECT id FROM countries WHERE name = customers.country) 
         WHERE country IN (SELECT name FROM countries)"
    ).execute(pool).await;

    let _ = sqlx::query(
        "UPDATE customers 
         SET country = (SELECT id FROM countries WHERE name = 'India') 
         WHERE country IS NULL OR country = '' OR country NOT IN (SELECT id FROM countries)"
    ).execute(pool).await;

    let _ = sqlx::query(
        "UPDATE suppliers 
         SET country = (SELECT id FROM countries WHERE name = suppliers.country) 
         WHERE country IN (SELECT name FROM countries)"
    ).execute(pool).await;

    let _ = sqlx::query(
        "UPDATE suppliers 
         SET country = (SELECT id FROM countries WHERE name = 'India') 
         WHERE country IS NULL OR country = '' OR country NOT IN (SELECT id FROM countries)"
    ).execute(pool).await;

    // Map currency based on country, falling back to company's base_currency
    let _ = sqlx::query(
        "UPDATE customers 
         SET currency = (
             SELECT c.id 
             FROM currencies c 
             JOIN countries co ON co.name = c.country 
             WHERE co.id = customers.country
         )
         WHERE currency IS NULL OR currency = ''"
    ).execute(pool).await;

    let _ = sqlx::query(
        "UPDATE customers 
         SET currency = (
             SELECT id 
             FROM currencies 
             WHERE code = (SELECT COALESCE(base_currency, 'INR') FROM company_profile LIMIT 1)
         ) 
         WHERE currency IS NULL OR currency = '' OR currency NOT IN (SELECT id FROM currencies)"
    ).execute(pool).await;

    let _ = sqlx::query(
        "UPDATE suppliers 
         SET currency = (
             SELECT c.id 
             FROM currencies c 
             JOIN countries co ON co.name = c.country 
             WHERE co.id = suppliers.country
         )
         WHERE currency IS NULL OR currency = ''"
    ).execute(pool).await;

    let _ = sqlx::query(
        "UPDATE suppliers 
         SET currency = (
             SELECT id 
             FROM currencies 
             WHERE code = (SELECT COALESCE(base_currency, 'INR') FROM company_profile LIMIT 1)
         ) 
         WHERE currency IS NULL OR currency = '' OR currency NOT IN (SELECT id FROM currencies)"
    ).execute(pool).await;

    // Migration: Add GST columns to chart_of_accounts
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN gstin TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN address_line_1 TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN address_line_2 TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN state TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN city TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE chart_of_accounts ADD COLUMN postal_code TEXT").execute(pool).await;

    // Backfill: sync GSTIN/address from customers → chart_of_accounts for records saved before sync existed
    // Also matches by `account_name` if `party_id` is NULL, which handles malformed external synced data.
    let _ = sqlx::query(
        "UPDATE chart_of_accounts
         SET
             party_id       = COALESCE(chart_of_accounts.party_id, c.id),
             gstin          = COALESCE(NULLIF(chart_of_accounts.gstin, ''),          c.gstin),
             address_line_1 = COALESCE(NULLIF(chart_of_accounts.address_line_1, ''), c.address_line_1),
             address_line_2 = COALESCE(NULLIF(chart_of_accounts.address_line_2, ''), c.address_line_2),
             state          = COALESCE(NULLIF(chart_of_accounts.state, ''),          c.state),
             city           = COALESCE(NULLIF(chart_of_accounts.city, ''),           c.city),
             postal_code    = COALESCE(NULLIF(chart_of_accounts.postal_code, ''),    c.postal_code)
         FROM customers c
         WHERE (chart_of_accounts.party_id = c.id OR (chart_of_accounts.party_id IS NULL AND chart_of_accounts.account_name = c.name))
           AND chart_of_accounts.account_group = 'Accounts Receivable'"
    ).execute(pool).await;

    // Backfill: sync GSTIN/address from suppliers → chart_of_accounts for records saved before sync existed
    let _ = sqlx::query(
        "UPDATE chart_of_accounts
         SET
             party_id       = COALESCE(chart_of_accounts.party_id, s.id),
             gstin          = COALESCE(NULLIF(chart_of_accounts.gstin, ''),          s.gstin),
             address_line_1 = COALESCE(NULLIF(chart_of_accounts.address_line_1, ''), s.address_line_1),
             address_line_2 = COALESCE(NULLIF(chart_of_accounts.address_line_2, ''), s.address_line_2),
             state          = COALESCE(NULLIF(chart_of_accounts.state, ''),          s.state),
             city           = COALESCE(NULLIF(chart_of_accounts.city, ''),           s.city),
             postal_code    = COALESCE(NULLIF(chart_of_accounts.postal_code, ''),    s.postal_code)
         FROM suppliers s
         WHERE (chart_of_accounts.party_id = s.id OR (chart_of_accounts.party_id IS NULL AND chart_of_accounts.account_name = s.name))
           AND chart_of_accounts.account_group = 'Accounts Payable'"
    ).execute(pool).await;

    let _ = sqlx::query("UPDATE voucher_items SET original_amount = amount WHERE COALESCE(original_amount, 0) = 0").execute(pool).await;
    let _ = sqlx::query("UPDATE voucher_items SET amount = original_amount WHERE original_amount > 0").execute(pool).await;

    // Migration: Add e-Invoice columns to vouchers
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN irn TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN ack_no TEXT").execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN ack_date DATE").execute(pool).await;

    // ==================== MASTER PRODUCT MIGRATIONS ====================

    // Migration: Add is_master flag (1 = template/master, 0 = regular or child batch)
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN is_master INTEGER NOT NULL DEFAULT 0")
        .execute(pool)
        .await;

    // Migration: Add parent_product_id FK (non-null = child batch of a master)
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN parent_product_id TEXT REFERENCES products(id)")
        .execute(pool)
        .await;

    // Index for efficient child batch lookups
    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_products_parent ON products(parent_product_id)",
    )
    .execute(pool)
    .await;

    // ==================== VEHICLE FIELD MIGRATIONS ====================

    // Migration: Add vehicle-specific columns to products
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN vehicle_make TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN vehicle_odometer REAL")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN vehicle_fuel_type TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN vehicle_transmission TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN vehicle_owner TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN vehicle_color TEXT")
        .execute(pool)
        .await;

    // Renamed Make to Manufacturer, and added Model & Year
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN vehicle_manufacturer TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("UPDATE products SET vehicle_manufacturer = vehicle_make WHERE vehicle_manufacturer IS NULL AND vehicle_make IS NOT NULL")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN vehicle_model TEXT")
        .execute(pool)
        .await;
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN vehicle_year INTEGER")
        .execute(pool)
        .await;

    // Migration: Add cost column to products
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN cost REAL")
        .execute(pool)
        .await;

    // ==================== PRODUCT IMAGES MIGRATION ====================
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS product_images (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            image_path TEXT NOT NULL,
            display_order INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )",
    )
    .execute(pool)
    .await?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id)",
    )
    .execute(pool)
    .await?;

    // ==================== MARGIN SCHEME MIGRATIONS ====================

    // Migration: Add margin scheme columns to voucher_items
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN is_margin_scheme INTEGER DEFAULT 0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN purchase_cost REAL DEFAULT 0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE voucher_items ADD COLUMN margin_amount REAL DEFAULT 0")
        .execute(pool).await;

    // Migration: Add margin scheme default flag to products
    let _ = sqlx::query("ALTER TABLE products ADD COLUMN is_margin_scheme_default INTEGER DEFAULT 0")
        .execute(pool).await;

    // Migration: Add margin scheme flag to vouchers
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN is_margin_scheme_invoice INTEGER DEFAULT 0")
        .execute(pool).await;

    // Migration: Add letterhead settings to invoice_templates
    let _ = sqlx::query("ALTER TABLE invoice_templates ADD COLUMN letterhead_data TEXT")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE invoice_templates ADD COLUMN use_letterhead INTEGER DEFAULT 0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE invoice_templates ADD COLUMN letterhead_margin_top REAL DEFAULT 45.0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE invoice_templates ADD COLUMN letterhead_margin_bottom REAL DEFAULT 25.0")
        .execute(pool).await;

    // Migration: Add custom header title and bill note to invoice_templates
    let _ = sqlx::query("ALTER TABLE invoice_templates ADD COLUMN header_title TEXT")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE invoice_templates ADD COLUMN bill_note TEXT")
        .execute(pool).await;

    // ==================== MULTI-CURRENCY / FOREX MIGRATIONS ====================

    // Migration: Add foreign-currency columns to vouchers
    // currency_id  — FK to currencies.id; NULL means base/domestic currency
    // exchange_rate — 1 foreign unit = N base-currency units (default 1.0 for domestic)
    // foreign_total — total amount expressed in the foreign currency (reference only)
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN currency_id TEXT REFERENCES currencies(id)")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN exchange_rate REAL DEFAULT 1.0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE vouchers ADD COLUMN foreign_total REAL DEFAULT 0")
        .execute(pool).await;

    // Migration: Add foreign-currency reference columns to journal_entries
    // Accounting amounts (debit/credit) always remain in base currency (INR).
    // foreign_debit / foreign_credit store the equivalent in the transaction currency.
    let _ = sqlx::query("ALTER TABLE journal_entries ADD COLUMN foreign_debit REAL DEFAULT 0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE journal_entries ADD COLUMN foreign_credit REAL DEFAULT 0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE journal_entries ADD COLUMN currency_id TEXT")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE journal_entries ADD COLUMN exchange_rate REAL DEFAULT 1.0")
        .execute(pool).await;

    // Migration: Add forex columns to payment_allocations
    // exchange_rate    — receipt/payment exchange rate at time of allocation
    // forex_difference — (receipt_rate - invoice_rate) × foreign_amount in base currency;
    //                    positive = gain for exporter, negative = loss
    let _ = sqlx::query("ALTER TABLE payment_allocations ADD COLUMN exchange_rate REAL DEFAULT 1.0")
        .execute(pool).await;
    let _ = sqlx::query("ALTER TABLE payment_allocations ADD COLUMN forex_difference REAL DEFAULT 0")
        .execute(pool).await;

    // Seed: Forex Exchange Gain — posted when receipt rate > invoice rate (exporter gets more INR)
    // is_system = 1 so it cannot be deleted from the UI.
    let _ = sqlx::query(
        "INSERT OR IGNORE INTO chart_of_accounts
         (id, account_code, account_name, account_type, account_group, is_system, is_active)
         VALUES ('sys_forex_gain', 'FOREX-001', 'Forex Exchange Gain', 'Income', 'Indirect Income', 1, 1)"
    ).execute(pool).await;

    // Seed: Forex Exchange Loss — posted when receipt rate < invoice rate (exporter gets less INR)
    let _ = sqlx::query(
        "INSERT OR IGNORE INTO chart_of_accounts
         (id, account_code, account_name, account_type, account_group, is_system, is_active)
         VALUES ('sys_forex_loss', 'FOREX-002', 'Forex Exchange Loss', 'Expense', 'Indirect Expenses', 1, 1)"
    ).execute(pool).await;

    // ==================== PRICE CATEGORY MODULE ====================

    // Price category master table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS price_categories (
            id          TEXT PRIMARY KEY,
            name        TEXT UNIQUE NOT NULL,
            description TEXT,
            is_default  INTEGER DEFAULT 0,
            is_active   INTEGER DEFAULT 1,
            sort_order  INTEGER DEFAULT 0,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
    )
    .execute(pool)
    .await?;

    // Per-product, per-unit, per-category price list
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS product_price_list (
            id                TEXT PRIMARY KEY,
            price_category_id TEXT NOT NULL,
            product_id        TEXT NOT NULL,
            unit_id           TEXT NOT NULL,
            sales_rate        REAL NOT NULL DEFAULT 0,
            is_active         INTEGER DEFAULT 1,
            updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (price_category_id, product_id, unit_id),
            FOREIGN KEY (price_category_id) REFERENCES price_categories(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (unit_id) REFERENCES units(id)
        )",
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_ppl_category ON product_price_list(price_category_id)",
    )
    .execute(pool)
    .await;

    let _ = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_ppl_product ON product_price_list(product_id)",
    )
    .execute(pool)
    .await;

    // Migration: Add price_category_id to chart_of_accounts (customer default price category)
    let _ = sqlx::query(
        "ALTER TABLE chart_of_accounts ADD COLUMN price_category_id TEXT REFERENCES price_categories(id)",
    )
    .execute(pool)
    .await;

    // Migration: Add price_category_id to vouchers (which category was active on this invoice)
    let _ = sqlx::query(
        "ALTER TABLE vouchers ADD COLUMN price_category_id TEXT REFERENCES price_categories(id)",
    )
    .execute(pool)
    .await;

    crate::seeds::seed_initial_data(pool).await?;
    crate::seeds::seed_handlebars_templates(pool).await?;

    Ok(())
}

async fn backfill_voucher_sequences(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let voucher_types = [
        "sales_invoice",
        "sales_quotation",
        "delivery_note",
        "purchase_invoice",
        "sales_return",
        "purchase_return",
        "purchase_quotation",
        "payment",
        "receipt",
        "journal",
        "opening_balance",
        "opening_stock",
        "stock_journal",
    ];

    for v_type in voucher_types {
        let all_nos: Vec<String> = sqlx::query_scalar(
            "SELECT voucher_no FROM vouchers 
             WHERE voucher_type = ? AND deleted_at IS NULL AND voucher_no NOT LIKE '__DELETED%'",
        )
        .bind(v_type)
        .fetch_all(pool)
        .await?;

        let mut max_next = 1i64;
        for v_no in all_nos {
            if let Some(parsed) = crate::voucher_seq::parse_custom_voucher_no(&v_no) {
                let _ = sqlx::query(
                    "UPDATE voucher_sequences 
                     SET prefix = ?,
                         separator = ?,
                         padding = MAX(padding, ?),
                         include_financial_year = ?
                     WHERE voucher_type = ?",
                )
                .bind(&parsed.prefix)
                .bind(&parsed.separator)
                .bind(parsed.padding)
                .bind(parsed.include_financial_year)
                .bind(v_type)
                .execute(pool)
                .await;

                if parsed.num + 1 > max_next {
                    max_next = parsed.num + 1;
                }
            }
        }

        if max_next > 1 {
            let _ = sqlx::query(
                "UPDATE voucher_sequences 
                 SET next_number = MAX(next_number, ?) 
                 WHERE voucher_type = ?",
            )
            .bind(max_next)
            .bind(v_type)
            .execute(pool)
            .await;
        }
    }

    Ok(())
}
