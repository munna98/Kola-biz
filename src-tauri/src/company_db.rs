use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use sqlx::ConnectOptions;
use std::collections::HashMap;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;

use serde::{Deserialize, Serialize};

// ===================== TYPES =====================

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CompanyInfo {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub db_path: String,
    pub is_deleted: i64,
    pub is_primary: i64,
    pub is_secondary: i64,
    pub created_at: String,
    pub last_opened: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CompanyListItem {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub db_path: String,
    pub is_primary: bool,
    pub is_secondary: bool,
    pub created_at: String,
    pub last_opened: Option<String>,
}

// ===================== REGISTRY =====================

pub struct DbRegistry {
    pub master_pool: SqlitePool,
    // keyed by company id
    pools: RwLock<HashMap<String, SqlitePool>>,
    // in-memory per app instance, not persisted to master.db
    active_id: RwLock<Option<String>>,
}

impl DbRegistry {
    pub fn new(master_pool: SqlitePool) -> Arc<Self> {
        Arc::new(Self {
            master_pool,
            pools: RwLock::new(HashMap::new()),
            active_id: RwLock::new(None),
        })
    }

    /// Returns the pool for the currently active company.
    /// Returns an error string if no company is active.
    pub async fn active_pool(&self) -> Result<SqlitePool, String> {
        let active_id = self.active_id.read().await;
        let id = active_id
            .as_ref()
            .ok_or_else(|| "No company selected. Please select or create a company.".to_string())?
            .clone();
        drop(active_id);

        let pools = self.pools.read().await;
        pools
            .get(&id)
            .cloned()
            .ok_or_else(|| format!("Company pool not found for id: {}", id))
    }

    /// Returns the currently active company id.
    pub async fn active_company_id(&self) -> Option<String> {
        self.active_id.read().await.clone()
    }

    /// Set the active company by id. Opens pool if not already cached.
    pub async fn set_active_company(
        &self,
        company_id: &str,
        app_handle: &tauri::AppHandle,
    ) -> Result<CompanyInfo, String> {
        // Fetch company info from master.db
        let company = sqlx::query_as::<_, CompanyInfo>(
            "SELECT id, name, slug, db_path, is_deleted, is_primary, is_secondary, created_at, last_opened
             FROM companies WHERE id = ? AND is_deleted = 0",
        )
        .bind(company_id)
        .fetch_one(&self.master_pool)
        .await
        .map_err(|e| format!("Company not found: {}", e))?;

        // Verify the db file exists
        if !PathBuf::from(&company.db_path).exists() {
            return Err(format!(
                "Database file not found at: {}. Please check the storage location.",
                company.db_path
            ));
        }

        // Open pool if not cached
        {
            let pools = self.pools.read().await;
            if !pools.contains_key(company_id) {
                drop(pools);
                let pool = open_company_pool(&company.db_path).await?;
                // Run schema migrations on this pool
                crate::db::init_schema(&pool).await.map_err(|e| e.to_string())?;
                let mut pools = self.pools.write().await;
                pools.insert(company_id.to_string(), pool);
            }
        }

        // Set active
        {
            let mut active = self.active_id.write().await;
            *active = Some(company_id.to_string());
        }

        // Update last_opened in master.db
        let _ = sqlx::query(
            "UPDATE companies SET last_opened = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(company_id)
        .execute(&self.master_pool)
        .await;

        // Update window title
        let _ = app_handle
            .get_webview_window("main")
            .map(|w| w.set_title(&format!("KolaBiz — {}", company.name)));

        Ok(company)
    }

    /// List all non-deleted companies whose DB file actually exists.
    pub async fn list_companies(&self) -> Result<Vec<CompanyListItem>, String> {
        let all: Vec<CompanyInfo> = sqlx::query_as::<_, CompanyInfo>(
            "SELECT id, name, slug, db_path, is_deleted, is_primary, is_secondary, created_at, last_opened
             FROM companies WHERE is_deleted = 0 ORDER BY is_primary DESC, last_opened DESC, name ASC",
        )
        .fetch_all(&self.master_pool)
        .await
        .map_err(|e| e.to_string())?;

        // Filter to only companies whose DB file exists on disk
        let visible = all
            .into_iter()
            .filter(|c| PathBuf::from(&c.db_path).exists())
            .map(|c| CompanyListItem {
                id: c.id,
                name: c.name,
                slug: c.slug,
                db_path: c.db_path,
                is_primary: c.is_primary != 0,
                is_secondary: c.is_secondary != 0,
                created_at: c.created_at,
                last_opened: c.last_opened,
            })
            .collect();

        Ok(visible)
    }

    /// Create a new company. Returns the new company id.
    pub async fn create_company(
        &self,
        name: &str,
        custom_path: Option<String>,
        app_handle: &tauri::AppHandle,
    ) -> Result<String, String> {
        let id = uuid::Uuid::now_v7().to_string();
        let slug = slugify(name);

        // Determine DB path
        let db_path = match custom_path {
            Some(p) => {
                let dir = PathBuf::from(&p);
                if !dir.exists() {
                    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                }
                dir.join(format!("{}.db", slug))
            }
            None => {
                let app_dir = app_handle
                    .path()
                    .app_data_dir()
                    .map_err(|e| e.to_string())?;
                let companies_dir = app_dir.join("companies");
                std::fs::create_dir_all(&companies_dir).map_err(|e| e.to_string())?;
                // Handle slug collisions
                let mut candidate = companies_dir.join(format!("{}.db", slug));
                let mut counter = 1u32;
                while candidate.exists() {
                    candidate = companies_dir.join(format!("{}_{}.db", slug, counter));
                    counter += 1;
                }
                candidate
            }
        };

        let db_path_str = db_path.to_string_lossy().to_string();

        // Create the DB file and run schema
        let pool = open_company_pool(&db_path_str).await?;
        crate::db::init_schema(&pool)
            .await
            .map_err(|e| e.to_string())?;

        // Insert into master.db
        sqlx::query(
            "INSERT INTO companies (id, name, slug, db_path) VALUES (?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(name)
        .bind(&slug)
        .bind(&db_path_str)
        .execute(&self.master_pool)
        .await
        .map_err(|e| e.to_string())?;

        // Cache the pool
        {
            let mut pools = self.pools.write().await;
            pools.insert(id.clone(), pool);
        }

        Ok(id)
    }

    /// Soft-delete a company (level 1).
    pub async fn soft_delete_company(&self, company_id: &str) -> Result<(), String> {
        // Cannot delete the currently active company
        let active = self.active_id.read().await;
        if active.as_deref() == Some(company_id) {
            return Err("Cannot delete the currently active company. Please switch to another company first.".to_string());
        }
        drop(active);

        sqlx::query(
            "UPDATE companies SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(company_id)
        .execute(&self.master_pool)
        .await
        .map_err(|e| e.to_string())?;

        // Evict from pool cache
        let mut pools = self.pools.write().await;
        if let Some(pool) = pools.remove(company_id) {
            pool.close().await;
        }

        Ok(())
    }

    /// Hard-delete a company (level 2) — permanently deletes the DB file.
    pub async fn hard_delete_company(&self, company_id: &str) -> Result<(), String> {
        let active = self.active_id.read().await;
        if active.as_deref() == Some(company_id) {
            return Err("Cannot permanently delete the currently active company.".to_string());
        }
        drop(active);

        // Get the db_path before deletion
        let company: Option<(String, String)> = sqlx::query_as(
            "SELECT id, db_path FROM companies WHERE id = ?",
        )
        .bind(company_id)
        .fetch_optional(&self.master_pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some((_, db_path)) = company {
            // Close pool if open
            {
                let mut pools = self.pools.write().await;
                if let Some(pool) = pools.remove(company_id) {
                    pool.close().await;
                }
            }

            // Delete the .db file
            let path = PathBuf::from(&db_path);
            if path.exists() {
                std::fs::remove_file(&path).map_err(|e| {
                    format!("Failed to delete database file: {}", e)
                })?;
                // Also delete WAL/SHM files if present
                let _ = std::fs::remove_file(format!("{}-wal", db_path));
                let _ = std::fs::remove_file(format!("{}-shm", db_path));
            }

            // Remove from master.db
            sqlx::query("DELETE FROM companies WHERE id = ?")
                .bind(company_id)
                .execute(&self.master_pool)
                .await
                .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    /// Rename a company.
    pub async fn rename_company(&self, company_id: &str, new_name: &str) -> Result<(), String> {
        sqlx::query("UPDATE companies SET name = ? WHERE id = ?")
            .bind(new_name)
            .bind(company_id)
            .execute(&self.master_pool)
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Set a company as primary (exactly one primary at a time).
    pub async fn set_primary_company(&self, company_id: &str) -> Result<(), String> {
        // Clear existing primary
        sqlx::query("UPDATE companies SET is_primary = 0")
            .execute(&self.master_pool)
            .await
            .map_err(|e| e.to_string())?;
        // Set new primary; also clear secondary if same company
        sqlx::query("UPDATE companies SET is_primary = 1, is_secondary = CASE WHEN id = ? THEN 0 ELSE is_secondary END WHERE id = ?")
            .bind(company_id)
            .bind(company_id)
            .execute(&self.master_pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Set a company as secondary (exactly one secondary at a time).
    pub async fn set_secondary_company(&self, company_id: &str) -> Result<(), String> {
        // Clear existing secondary
        sqlx::query("UPDATE companies SET is_secondary = 0")
            .execute(&self.master_pool)
            .await
            .map_err(|e| e.to_string())?;
        // Set new secondary; also clear primary if same company
        sqlx::query("UPDATE companies SET is_secondary = 1, is_primary = CASE WHEN id = ? THEN 0 ELSE is_primary END WHERE id = ?")
            .bind(company_id)
            .bind(company_id)
            .execute(&self.master_pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Get the primary company id, if set.
    pub async fn get_primary_company_id(&self) -> Option<String> {
        sqlx::query_as::<_, (String,)>(
            "SELECT id FROM companies WHERE is_primary = 1 AND is_deleted = 0 LIMIT 1",
        )
        .fetch_optional(&self.master_pool)
        .await
        .ok()
        .flatten()
        .map(|(id,)| id)
    }

    /// Get info for the currently active company.
    pub async fn get_active_company_info(&self) -> Result<Option<CompanyInfo>, String> {
        let active_id = self.active_id.read().await;
        let id = match active_id.as_ref() {
            Some(id) => id.clone(),
            None => return Ok(None),
        };
        drop(active_id);

        let company = sqlx::query_as::<_, CompanyInfo>(
            "SELECT id, name, slug, db_path, is_deleted, is_primary, is_secondary, created_at, last_opened
             FROM companies WHERE id = ?",
        )
        .bind(&id)
        .fetch_optional(&self.master_pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(company)
    }
}

// ===================== HELPERS =====================

/// Open (or create) a SQLite pool for a company DB file.
/// Enables WAL mode for safe concurrent access.
async fn open_company_pool(db_path: &str) -> Result<SqlitePool, String> {
    let url = format!("sqlite:{}?mode=rwc", db_path);
    let options = SqliteConnectOptions::from_str(&url)
        .map_err(|e| e.to_string())?
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .disable_statement_logging();

    SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
        .map_err(|e| format!("Failed to open company database: {}", e))
}

/// Convert a company name to a filesystem-safe slug.
fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>()
        .split('_')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}

// ===================== MASTER DB INIT =====================

/// Initialize master.db and return the pool + DbRegistry.
pub async fn init_registry(
    app_handle: &tauri::AppHandle,
) -> Result<Arc<DbRegistry>, Box<dyn std::error::Error>> {
    let app_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;

    let master_path = app_dir.join("master.db");
    let master_url = format!("sqlite:{}?mode=rwc", master_path.display());

    let master_options = SqliteConnectOptions::from_str(&master_url)?
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .disable_statement_logging();

    let master_pool = SqlitePoolOptions::new()
        .max_connections(3)
        .connect_with(master_options)
        .await?;

    // Init master schema
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS companies (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            slug        TEXT NOT NULL,
            db_path     TEXT NOT NULL,
            is_deleted  INTEGER NOT NULL DEFAULT 0,
            is_primary  INTEGER NOT NULL DEFAULT 0,
            is_secondary INTEGER NOT NULL DEFAULT 0,
            deleted_at  DATETIME,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_opened DATETIME
        )",
    )
    .execute(&master_pool)
    .await?;

    // Migration: add columns if not exists (safe on fresh dbs)
    let _ = sqlx::query("ALTER TABLE companies ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0")
        .execute(&master_pool)
        .await;
    let _ = sqlx::query("ALTER TABLE companies ADD COLUMN deleted_at DATETIME")
        .execute(&master_pool)
        .await;
    let _ = sqlx::query("ALTER TABLE companies ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0")
        .execute(&master_pool)
        .await;
    let _ = sqlx::query("ALTER TABLE companies ADD COLUMN is_secondary INTEGER NOT NULL DEFAULT 0")
        .execute(&master_pool)
        .await;

    let registry = DbRegistry::new(master_pool);

    // ---- Migration: adopt existing erp.db as "Default Company" if no companies registered ----
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM companies")
        .fetch_one(&registry.master_pool)
        .await?;

    if count.0 == 0 {
        let legacy_path = app_dir.join("erp.db");
        if legacy_path.exists() {
            let companies_dir = app_dir.join("companies");
            std::fs::create_dir_all(&companies_dir)?;

            // ── Read actual company name from erp.db's company_profile ────────
            let company_name: String = {
                let legacy_url = format!(
                    "sqlite:{}?mode=ro",
                    legacy_path.to_string_lossy()
                );
                match SqliteConnectOptions::from_str(&legacy_url) {
                    Ok(opts) => {
                        match SqlitePoolOptions::new()
                            .max_connections(1)
                            .connect_with(opts)
                            .await
                        {
                            Ok(tmp_pool) => {
                                let row: Option<(String,)> = sqlx::query_as(
                                    "SELECT company_name FROM company_profile LIMIT 1",
                                )
                                .fetch_optional(&tmp_pool)
                                .await
                                .unwrap_or(None);
                                tmp_pool.close().await;
                                row.map(|(n,)| n)
                                    .filter(|n| !n.trim().is_empty())
                                    .unwrap_or_else(|| "Default Company".to_string())
                            }
                            Err(_) => "Default Company".to_string(),
                        }
                    }
                    Err(_) => "Default Company".to_string(),
                }
            };

            let slug = slugify(&company_name);

            // Handle filename collisions
            let mut new_path = companies_dir.join(format!("{}.db", slug));
            let mut counter = 1u32;
            while new_path.exists() {
                new_path = companies_dir.join(format!("{}_{}.db", slug, counter));
                counter += 1;
            }

            // Copy rather than rename — safer (leaves original as backup)
            std::fs::copy(&legacy_path, &new_path)?;

            let id = uuid::Uuid::now_v7().to_string();
            sqlx::query(
                "INSERT INTO companies (id, name, slug, db_path, is_primary) VALUES (?, ?, ?, ?, 1)",
            )
            .bind(&id)
            .bind(&company_name)
            .bind(&slug)
            .bind(new_path.to_string_lossy().as_ref())
            .execute(&registry.master_pool)
            .await?;

            println!(
                "REGISTRY: Adopted existing erp.db as '{}' → {}",
                company_name,
                new_path.display()
            );
        }
    }

    Ok(registry)
}
