use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

// ============= COUNTRIES =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct Country {
    pub id: String,
    pub name: String,
    pub code: String,
}

#[tauri::command]
pub async fn get_countries(pool: State<'_, SqlitePool>) -> Result<Vec<Country>, String> {
    sqlx::query_as::<_, Country>("SELECT * FROM countries ORDER BY name")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())
}

// ============= COMPANY PROFILE =============
#[derive(Serialize, Deserialize, sqlx::FromRow)]
pub struct CompanyProfile {
    pub id: i64,
    pub company_name: String,
    pub business_type: Option<String>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub address_line3: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub pincode: Option<String>,
    pub country: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub website: Option<String>,
    pub gstin: Option<String>,
    pub pan: Option<String>,
    pub cin: Option<String>,
    pub logo_data: Option<String>,
    pub bank_name: Option<String>,
    pub bank_account_no: Option<String>,
    pub bank_ifsc: Option<String>,
    pub bank_branch: Option<String>,
    pub terms_and_conditions: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize)]
pub struct UpdateCompanyProfile {
    pub company_name: String,
    pub business_type: Option<String>,
    pub address_line1: Option<String>,
    pub address_line2: Option<String>,
    pub address_line3: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub pincode: Option<String>,
    pub country: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub website: Option<String>,
    pub gstin: Option<String>,
    pub pan: Option<String>,
    pub cin: Option<String>,
    pub logo_data: Option<String>,
    pub bank_name: Option<String>,
    pub bank_account_no: Option<String>,
    pub bank_ifsc: Option<String>,
    pub bank_branch: Option<String>,
    pub terms_and_conditions: Option<String>,
}

#[tauri::command]
pub async fn get_company_profile(pool: State<'_, SqlitePool>) -> Result<CompanyProfile, String> {
    let profile = sqlx::query_as::<_, CompanyProfile>("SELECT * FROM company_profile LIMIT 1")
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    match profile {
        Some(p) => Ok(p),
        None => {
            // Auto-create default profile if missing
            sqlx::query("INSERT INTO company_profile (company_name) VALUES ('My Company')")
                .execute(pool.inner())
                .await
                .map_err(|e| e.to_string())?;

            sqlx::query_as::<_, CompanyProfile>("SELECT * FROM company_profile LIMIT 1")
                .fetch_one(pool.inner())
                .await
                .map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
pub async fn update_company_profile(
    pool: State<'_, SqlitePool>,
    profile: UpdateCompanyProfile,
) -> Result<CompanyProfile, String> {
    sqlx::query(
        "UPDATE company_profile SET 
            company_name = ?,
            business_type = ?,
            address_line1 = ?,
            address_line2 = ?,
            address_line3 = ?,
            city = ?,
            state = ?,
            pincode = ?,
            country = ?,
            phone = ?,
            email = ?,
            website = ?,
            gstin = ?,
            pan = ?,
            cin = ?,
            logo_data = ?,
            bank_name = ?,
            bank_account_no = ?,
            bank_ifsc = ?,
            bank_branch = ?,
            terms_and_conditions = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1",
    )
    .bind(&profile.company_name)
    .bind(&profile.business_type)
    .bind(&profile.address_line1)
    .bind(&profile.address_line2)
    .bind(&profile.address_line3)
    .bind(&profile.city)
    .bind(&profile.state)
    .bind(&profile.pincode)
    .bind(&profile.country)
    .bind(&profile.phone)
    .bind(&profile.email)
    .bind(&profile.website)
    .bind(&profile.gstin)
    .bind(&profile.pan)
    .bind(&profile.cin)
    .bind(&profile.logo_data)
    .bind(&profile.bank_name)
    .bind(&profile.bank_account_no)
    .bind(&profile.bank_ifsc)
    .bind(&profile.bank_branch)
    .bind(&profile.terms_and_conditions)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    get_company_profile(pool).await
}
