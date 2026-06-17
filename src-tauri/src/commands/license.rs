use crate::license::{self, LicenseStatus};
use tauri::command;
use std::io::{Read, Write};
use tauri::Emitter;

#[command]
pub async fn get_license_info() -> Result<LicenseStatus, String> {
    license::get_status()
}

#[command]
pub async fn activate_license(key: String) -> Result<LicenseStatus, String> {
    license::activate(key)
}

#[command]
pub async fn download_and_install_update(
    app_handle: tauri::AppHandle,
    download_url: String,
) -> Result<(), String> {
    if !download_url.to_lowercase().ends_with(".msi") {
        return Err("Invalid update file format. Only MSI installer updates are supported.".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .user_agent("KolaBiz-Updater")
            .build()
            .map_err(|e| format!("Failed to create client: {}", e))?;

        let mut response = client.get(&download_url)
            .send()
            .map_err(|e| format!("Failed to connect to update server: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Server returned HTTP {}", response.status()));
        }

        let total_size = response.content_length();
        let temp_dir = std::env::temp_dir();
        let target_path = temp_dir.join("kolabiz_update.msi");

        let mut file = std::fs::File::create(&target_path)
            .map_err(|e| format!("Failed to create local update file: {}", e))?;

        let mut buffer = [0; 8192];
        let mut downloaded: u64 = 0;

        loop {
            let bytes_read = response.read(&mut buffer)
                .map_err(|e| format!("Error reading update data: {}", e))?;

            if bytes_read == 0 {
                break;
            }

            file.write_all(&buffer[..bytes_read])
                .map_err(|e| format!("Failed to write to local update file: {}", e))?;

            downloaded += bytes_read as u64;

            if let Some(total) = total_size {
                let percentage = ((downloaded as f64 / total as f64) * 100.0) as u32;
                let _ = app_handle.emit("update-download-progress", percentage);
            }
        }

        file.flush().map_err(|e| format!("Failed to flush file: {}", e))?;
        drop(file);

        // Run the installer and close the app
        std::process::Command::new("msiexec")
            .arg("/i")
            .arg(&target_path)
            .spawn()
            .map_err(|e| format!("Failed to start installer: {}", e))?;

        app_handle.exit(0);
        Ok(())
    })
    .await
    .map_err(|e| format!("Updater task panicked: {}", e))?
}
