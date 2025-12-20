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
            // Cash & Bank Accounts
            get_cash_bank_accounts,
            // Purchase Invoices
            get_purchase_invoices,
            get_purchase_invoice,
            get_purchase_invoice_items,
            create_purchase_invoice,
            delete_purchase_invoice,
            // Payments
            create_payment,
            get_payments,
            delete_payment,
            // Receipts
            create_receipt,
            get_receipts,
            delete_receipt,
            create_journal_entry,
            get_journal_entries,
            get_journal_entry,
            get_journal_entry_lines,
            delete_journal_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}