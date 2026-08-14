use crate::company_db::{CompanyInfo, DbRegistry};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

#[derive(Serialize)]
pub struct BackupResult {
    pub success: bool,
    pub message: String,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupConfig {
    pub enabled: bool,
    pub custom_path: Option<String>,
    pub interval_hours: u64,
    pub retention_days: i64,
    pub backup_on_exit: bool,
    pub effective_path: String,
    pub is_using_fallback: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupFileInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub size_formatted: String,
    pub created_at: String,
}

/// Resolves the effective backup directory based on user's custom_path setting with fallback to standard AppData directory.
pub fn resolve_backup_directory(app_handle: &AppHandle, custom_path: Option<&str>) -> (PathBuf, bool) {
    let default_dir = match app_handle.path().app_data_dir() {
        Ok(dir) => dir.join("backups"),
        Err(_) => PathBuf::from("backups"),
    };

    if let Some(custom) = custom_path {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            let custom_buf = PathBuf::from(trimmed);
            if custom_buf.exists() || std::fs::create_dir_all(&custom_buf).is_ok() {
                return (custom_buf, false);
            }
            // Custom path failed to create or is inaccessible -> fallback triggered
            if !default_dir.exists() {
                let _ = std::fs::create_dir_all(&default_dir);
            }
            return (default_dir, true);
        }
    }

    if !default_dir.exists() {
        let _ = std::fs::create_dir_all(&default_dir);
    }
    (default_dir, false)
}

/// Get automated backup configuration
#[tauri::command]
pub async fn get_backup_config(
    app_handle: AppHandle,
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<BackupConfig, String> {
    let enabled_str = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'auto_backup_enabled'",
    )
    .fetch_optional(&registry.master_pool)
    .await
    .unwrap_or(None);

    let custom_path = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'auto_backup_custom_path'",
    )
    .fetch_optional(&registry.master_pool)
    .await
    .unwrap_or(None);

    let interval_str = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'auto_backup_interval_hours'",
    )
    .fetch_optional(&registry.master_pool)
    .await
    .unwrap_or(None);

    let retention_str = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'auto_backup_retention_days'",
    )
    .fetch_optional(&registry.master_pool)
    .await
    .unwrap_or(None);

    let exit_str = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'auto_backup_on_exit'",
    )
    .fetch_optional(&registry.master_pool)
    .await
    .unwrap_or(None);

    let enabled = enabled_str.map(|v| v != "false").unwrap_or(true);
    let interval_hours = interval_str.and_then(|v| v.parse::<u64>().ok()).unwrap_or(6);
    let retention_days = retention_str.and_then(|v| v.parse::<i64>().ok()).unwrap_or(14);
    let backup_on_exit = exit_str.map(|v| v != "false").unwrap_or(true);

    let (dir, is_fallback) = resolve_backup_directory(&app_handle, custom_path.as_deref());

    Ok(BackupConfig {
        enabled,
        custom_path,
        interval_hours,
        retention_days,
        backup_on_exit,
        effective_path: dir.to_string_lossy().to_string(),
        is_using_fallback: is_fallback,
    })
}

/// Save automated backup configuration
#[tauri::command]
pub async fn save_backup_config(
    registry: State<'_, Arc<DbRegistry>>,
    enabled: bool,
    custom_path: Option<String>,
    interval_hours: u64,
    retention_days: i64,
    backup_on_exit: bool,
) -> Result<(), String> {
    let upsert_query = "INSERT INTO app_settings (id, setting_key, setting_value, updated_at)
         VALUES (hex(randomblob(16)), ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(setting_key) DO UPDATE SET
         setting_value = excluded.setting_value,
         updated_at = CURRENT_TIMESTAMP";

    sqlx::query(upsert_query)
        .bind("auto_backup_enabled")
        .bind(enabled.to_string())
        .execute(&registry.master_pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(upsert_query)
        .bind("auto_backup_custom_path")
        .bind(custom_path.unwrap_or_default())
        .execute(&registry.master_pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(upsert_query)
        .bind("auto_backup_interval_hours")
        .bind(interval_hours.to_string())
        .execute(&registry.master_pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(upsert_query)
        .bind("auto_backup_retention_days")
        .bind(retention_days.to_string())
        .execute(&registry.master_pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(upsert_query)
        .bind("auto_backup_on_exit")
        .bind(backup_on_exit.to_string())
        .execute(&registry.master_pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Opens a native folder selection dialog (Windows PowerShell)
#[tauri::command]
pub async fn pick_backup_folder() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let script = r#"
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = 'Select Backup Directory'
        $dialog.ShowNewFolderButton = $true
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            Write-Output $dialog.SelectedPath
        }
        "#;

        let output = Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .output()
            .map_err(|e| format!("Failed to open folder dialog: {}", e))?;

        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                Ok(None)
            } else {
                Ok(Some(path))
            }
        } else {
            Ok(None)
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

/// Opens the backup directory in Windows Explorer
#[tauri::command]
pub async fn open_backup_folder(
    app_handle: AppHandle,
    registry: State<'_, Arc<DbRegistry>>,
    path: Option<String>,
) -> Result<(), String> {
    let target_dir = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => {
            let config = get_backup_config(app_handle.clone(), registry).await?;
            PathBuf::from(config.effective_path)
        }
    };

    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| format!("Failed to create backup directory: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("explorer")
            .creation_flags(CREATE_NO_WINDOW)
            .arg(&target_dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    Ok(())
}

/// Lists recent backup files from the effective backup folder
#[tauri::command]
pub async fn list_recent_backups(
    app_handle: AppHandle,
    registry: State<'_, Arc<DbRegistry>>,
) -> Result<Vec<BackupFileInfo>, String> {
    let config = get_backup_config(app_handle.clone(), registry).await?;
    let backup_dir = PathBuf::from(&config.effective_path);

    let mut result = Vec::new();
    if backup_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(backup_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |ext| ext == "db") {
                    if let Ok(metadata) = entry.metadata() {
                        let size_bytes = metadata.len();
                        let size_formatted = if size_bytes >= 1_048_576 {
                            format!("{:.2} MB", size_bytes as f64 / 1_048_576.0)
                        } else {
                            format!("{:.2} KB", size_bytes as f64 / 1024.0)
                        };

                        let created_at = metadata
                            .modified()
                            .ok()
                            .map(|t| {
                                let dt: chrono::DateTime<chrono::Local> = t.into();
                                dt.format("%Y-%m-%d %H:%M:%S").to_string()
                            })
                            .unwrap_or_default();

                        result.push(BackupFileInfo {
                            name: path
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string(),
                            path: path.to_string_lossy().to_string(),
                            size_bytes,
                            size_formatted,
                            created_at,
                        });
                    }
                }
            }
        }
    }

    result.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(result)
}

/// Executes a VACUUM INTO command to safely copy the database while it is in use.
pub async fn perform_sqlite_backup(pool: &SqlitePool, dest_path: &Path) -> Result<(), String> {
    // 1. Force a FULL WAL checkpoint so all recent memory & WAL frames are written to the database file
    let _ = sqlx::query("PRAGMA wal_checkpoint(FULL)").execute(pool).await;

    let dest_str = dest_path.to_string_lossy().to_string();
    let safe_dest = dest_str.replace("'", "''");
    let query = format!("VACUUM INTO '{}'", safe_dest);

    if dest_path.exists() {
        std::fs::remove_file(dest_path)
            .map_err(|e| format!("Failed to remove existing backup file: {}", e))?;
    }

    sqlx::query(&query)
        .execute(pool)
        .await
        .map_err(|e| format!("Database backup failed: {}", e))?;

    Ok(())
}

/// Creates a manual backup for a specific company or current active company.
#[tauri::command]
pub async fn create_manual_backup(
    app_handle: AppHandle,
    registry: State<'_, Arc<DbRegistry>>,
    company_id: Option<String>,
    dest_path: Option<String>,
) -> Result<BackupResult, String> {
    let target_company_id = match company_id {
        Some(id) => id,
        None => registry
            .active_company_id()
            .await
            .ok_or_else(|| "No active company selected.".to_string())?,
    };

    let company: CompanyInfo = sqlx::query_as(
        "SELECT id, name, slug, db_path, is_deleted, is_primary, is_secondary, created_at, last_opened
         FROM companies WHERE id = ?"
    )
    .bind(&target_company_id)
    .fetch_optional(&registry.master_pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Company not found".to_string())?;

    let final_dest = match dest_path {
        Some(path) => {
            let pb = PathBuf::from(&path);
            if pb.is_dir() || path.ends_with('/') || path.ends_with('\\') {
                let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
                pb.join(format!("{}_{}.db", company.slug, timestamp))
            } else {
                pb
            }
        }
        None => {
            let config = get_backup_config(app_handle.clone(), registry.clone()).await?;
            let backups_dir = PathBuf::from(config.effective_path);
            if !backups_dir.exists() {
                std::fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
            }
            let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
            backups_dir.join(format!("{}_{}.db", company.slug, timestamp))
        }
    };

    let db_url = format!("sqlite:{}?mode=ro", company.db_path);
    let temp_pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to company DB: {}", e))?;

    perform_sqlite_backup(&temp_pool, &final_dest).await?;
    temp_pool.close().await;

    Ok(BackupResult {
        success: true,
        message: format!("Backup completed successfully for company '{}'.", company.name),
        path: Some(final_dest.to_string_lossy().to_string()),
    })
}

/// Creates a full system backup (Master DB + All Active Companies).
#[tauri::command]
pub async fn create_full_manual_backup(
    app_handle: AppHandle,
    registry: State<'_, Arc<DbRegistry>>,
    dest_dir: Option<String>,
) -> Result<BackupResult, String> {
    let (target_dir, _) = resolve_backup_directory(&app_handle, dest_dir.as_deref());
    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();

    // 1. Backup master.db
    let master_backup_path = target_dir.join(format!("master_{}.db", timestamp));
    perform_sqlite_backup(&registry.master_pool, &master_backup_path).await?;

    // 2. Backup each company
    let companies: Vec<CompanyInfo> = sqlx::query_as(
        "SELECT id, name, slug, db_path, is_deleted, is_primary, is_secondary, created_at, last_opened
         FROM companies WHERE is_deleted = 0"
    )
    .fetch_all(&registry.master_pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut count = 1;
    for company in companies {
        if !Path::new(&company.db_path).exists() {
            continue;
        }

        let company_backup_path = target_dir.join(format!("{}_{}.db", company.slug, timestamp));
        let db_url = format!("sqlite:{}?mode=ro", company.db_path);

        if let Ok(temp_pool) = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
        {
            if perform_sqlite_backup(&temp_pool, &company_backup_path)
                .await
                .is_ok()
            {
                count += 1;
            }
            temp_pool.close().await;
        }
    }

    Ok(BackupResult {
        success: true,
        message: format!(
            "Full backup completed successfully ({} database files saved).",
            count
        ),
        path: Some(target_dir.to_string_lossy().to_string()),
    })
}

/// Spawns a background task that performs automated backups periodically.
pub fn setup_automated_backups(app_handle: AppHandle, registry: Arc<DbRegistry>) {
    tauri::async_runtime::spawn(async move {
        // Wait 5 minutes before the first backup so it doesn't slow down startup
        tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;

        loop {
            if let Err(e) = run_automated_backup_cycle(&app_handle, &registry).await {
                eprintln!("Automated backup cycle failed: {}", e);
            }

            let interval_hours = match sqlx::query_scalar::<_, String>(
                "SELECT setting_value FROM app_settings WHERE setting_key = 'auto_backup_interval_hours'",
            )
            .fetch_optional(&registry.master_pool)
            .await
            {
                Ok(Some(val)) => val.parse::<u64>().unwrap_or(6),
                _ => 6,
            };

            let sleep_secs = (interval_hours.max(1)) * 3600;
            tokio::time::sleep(tokio::time::Duration::from_secs(sleep_secs)).await;
        }
    });
}

pub async fn run_automated_backup_cycle(
    app_handle: &AppHandle,
    registry: &Arc<DbRegistry>,
) -> Result<(), String> {
    let enabled_str = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'auto_backup_enabled'",
    )
    .fetch_optional(&registry.master_pool)
    .await
    .unwrap_or(None);

    let enabled = enabled_str.map(|v| v != "false").unwrap_or(true);
    if !enabled {
        return Ok(());
    }

    let custom_path = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'auto_backup_custom_path'",
    )
    .fetch_optional(&registry.master_pool)
    .await
    .unwrap_or(None);

    let retention_str = sqlx::query_scalar::<_, String>(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'auto_backup_retention_days'",
    )
    .fetch_optional(&registry.master_pool)
    .await
    .unwrap_or(None);

    let retention_days = retention_str
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(14);

    let (backups_dir, _is_fallback) =
        resolve_backup_directory(app_handle, custom_path.as_deref());

    let companies: Vec<CompanyInfo> = sqlx::query_as(
        "SELECT id, name, slug, db_path, is_deleted, is_primary, is_secondary, created_at, last_opened
         FROM companies WHERE is_deleted = 0"
    )
    .fetch_all(&registry.master_pool)
    .await
    .map_err(|e| e.to_string())?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();

    // 1. Backup master.db
    let master_backup_path = backups_dir.join(format!("master_{}.db", timestamp));
    if let Err(e) = perform_sqlite_backup(&registry.master_pool, &master_backup_path).await {
        eprintln!("Failed to backup master.db: {}", e);
    }

    // 2. Backup each company
    for company in companies {
        if !Path::new(&company.db_path).exists() {
            continue;
        }

        let company_backup_path = backups_dir.join(format!("{}_{}.db", company.slug, timestamp));
        let db_url = format!("sqlite:{}?mode=ro", company.db_path);

        match sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
        {
            Ok(temp_pool) => {
                if let Err(e) = perform_sqlite_backup(&temp_pool, &company_backup_path).await {
                    eprintln!("Failed to backup company '{}': {}", company.name, e);
                }
                temp_pool.close().await;
            }
            Err(e) => {
                eprintln!(
                    "Failed to open DB for company '{}' during backup: {}",
                    company.name, e
                );
            }
        }
    }

    // 3. Cleanup old backups
    cleanup_old_backups(&backups_dir, retention_days);

    Ok(())
}

fn cleanup_old_backups(backups_dir: &Path, keep_days: i64) {
    if keep_days <= 0 {
        return; // Keep forever
    }
    let cutoff_date = chrono::Local::now() - chrono::Duration::days(keep_days);

    if let Ok(entries) = std::fs::read_dir(backups_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    let modified_datetime: chrono::DateTime<chrono::Local> = modified.into();
                    if modified_datetime < cutoff_date {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
    }
}

