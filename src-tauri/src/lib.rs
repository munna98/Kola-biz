mod db;
mod commands;

use commands::*;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let pool = tauri::async_runtime::block_on(async {
                db::init_db(app.handle()).await
            })?;
            app.manage(pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Units
            get_units,
            create_unit,
            update_unit,
            delete_unit,
            // Products
            get_products,
            create_product,
            update_product,
            delete_product,
            // Customers
            get_customers,
            create_customer,
            update_customer,
            delete_customer,
            // Suppliers
            get_suppliers,
            create_supplier,
            update_supplier,
            delete_supplier,
            // Chart of Accounts
            get_chart_of_accounts,
            create_chart_of_account,
            update_chart_of_account,
            delete_chart_of_account,
            get_account_types,
            get_account_groups,
            get_all_account_groups,
            create_account_group,
            delete_account_group,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}