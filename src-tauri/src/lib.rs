mod commands;
mod db;

use commands::*;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let pool = tauri::async_runtime::block_on(async { db::init_db(app.handle()).await })?;
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
            get_deleted_products,
            restore_product,
            hard_delete_product,
            // Customers
            get_customers,
            create_customer,
            update_customer,
            delete_customer,
            get_deleted_customers,
            restore_customer,
            hard_delete_customer,
            // Suppliers
            get_suppliers,
            create_supplier,
            update_supplier,
            delete_supplier,
            get_deleted_suppliers,
            restore_supplier,
            hard_delete_supplier,
            // Chart of Accounts
            get_chart_of_accounts,
            create_chart_of_account,
            update_chart_of_account,
            delete_chart_of_account,
            get_deleted_chart_of_accounts,
            restore_chart_of_account,
            hard_delete_chart_of_account,
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
            update_purchase_invoice,
            delete_purchase_invoice,
            // Sales Invoices
            get_sales_invoices,
            get_sales_invoice,
            get_sales_invoice_items,
            create_sales_invoice,
            delete_sales_invoice,
            // Payments
            create_payment,
            get_payments,
            get_payment_items,
            delete_payment,
            // Receipts
            create_receipt,
            get_receipts,
            get_receipt_items,
            delete_receipt,
            // Journal Entries
            create_journal_entry,
            get_journal_entries,
            get_journal_entry,
            get_journal_entry_lines,
            delete_journal_entry,
            // Opening Balance
            create_opening_balance,
            get_opening_balances,
            delete_opening_balance,
            // Reports
            get_trial_balance,
            get_ledger_report,
            // Voucher Navigation
            list_vouchers,
            get_previous_voucher_id,
            get_next_voucher_id,
            get_voucher_by_id,
            // Company Profile
            get_company_profile,
            update_company_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
