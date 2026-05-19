use crate::company_db::{CompanyInfo, DbRegistry};
use serde::Serialize;
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

/// Executes a VACUUM INTO command to safely copy the database while it is in use.
pub async fn perform_sqlite_backup(pool: &SqlitePool, dest_path: &Path) -> Result<(), String> {
    let dest_str = dest_path.to_string_lossy().to_string();
    // Use VACUUM INTO to create a consistent snapshot.
    // Replace single quotes just in case the path contains them.
    let safe_dest = dest_str.replace("'", "''");
    let query = format!("VACUUM INTO '{}'", safe_dest);
    
    // If the file already exists, VACUUM INTO will fail, so we need to remove it first if we want to overwrite.
    if dest_path.exists() {
        std::fs::remove_file(dest_path).map_err(|e| format!("Failed to remove existing backup file: {}", e))?;
    }
    
    sqlx::query(&query)
        .execute(pool)
        .await
        .map_err(|e| format!("Database backup failed: {}", e))?;
        
    Ok(())
}

/// Creates a manual backup for a specific company.
/// If `dest_path` is None, defaults to `AppData/Local/kolabiz/backups/<company_slug>_<timestamp>.db`
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

    // Get company details
    let company: CompanyInfo = sqlx::query_as(
        "SELECT id, name, slug, db_path, is_deleted, is_primary, is_secondary, created_at, last_opened
         FROM companies WHERE id = ?"
    )
    .bind(&target_company_id)
    .fetch_optional(&registry.master_pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Company not found".to_string())?;

    // Determine destination path
    let final_dest = match dest_path {
        Some(path) => PathBuf::from(path),
        None => {
            let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
            let backups_dir = app_dir.join("backups");
            if !backups_dir.exists() {
                std::fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
            }
            let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
            backups_dir.join(format!("{}_{}.db", company.slug, timestamp))
        }
    };

    // Get the pool for the company
    let db_url = format!("sqlite:{}?mode=ro", company.db_path);
    let temp_pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&db_url)
        .await
        .map_err(|e| format!("Failed to connect to company DB: {}", e))?;

    perform_sqlite_backup(&temp_pool, &final_dest).await?;
    
    // Close temp pool
    temp_pool.close().await;

    Ok(BackupResult {
        success: true,
        message: "Backup completed successfully.".to_string(),
        path: Some(final_dest.to_string_lossy().to_string()),
    })
}

/// Spawns a background task that performs automated backups periodically (e.g., every 6 hours).
pub fn setup_automated_backups(app_handle: AppHandle, registry: Arc<DbRegistry>) {
    tauri::async_runtime::spawn(async move {
        // Wait 5 minutes before the first backup so it doesn't slow down startup
        tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
        
        loop {
            if let Err(e) = run_automated_backup_cycle(&app_handle, &registry).await {
                eprintln!("Automated backup cycle failed: {}", e);
            }
            
            // Wait for 6 hours
            tokio::time::sleep(tokio::time::Duration::from_secs(6 * 3600)).await;
        }
    });
}

pub async fn run_automated_backup_cycle(app_handle: &AppHandle, registry: &Arc<DbRegistry>) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let backups_dir = app_dir.join("backups");
    if !backups_dir.exists() {
        std::fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;
    }
    
    // We will backup the master.db and all non-deleted companies
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
                eprintln!("Failed to open DB for company '{}' during backup: {}", company.name, e);
            }
        }
    }
    
    // 3. Cleanup old backups (keep last 14 days)
    cleanup_old_backups(&backups_dir, 14);
    
    Ok(())
}

fn cleanup_old_backups(backups_dir: &Path, keep_days: i64) {
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
