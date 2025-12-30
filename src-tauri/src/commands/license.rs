use crate::license::{self, LicenseStatus};
use tauri::command;

#[command]
pub async fn get_license_info() -> Result<LicenseStatus, String> {
    license::get_status()
}

#[command]
pub async fn activate_license(key: String) -> Result<LicenseStatus, String> {
    license::activate(key)
}
