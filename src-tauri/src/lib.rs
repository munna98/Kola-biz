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
            get_products,
            create_product,
            update_product,
            delete_product
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}