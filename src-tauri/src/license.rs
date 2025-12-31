use chrono::NaiveDate;
use hex;
use hmac::{Hmac, Mac};
use machine_uid;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::time::{SystemTime, UNIX_EPOCH};
use winreg::enums::*;
use winreg::RegKey;

// SECRET KEY (Must match the one in license_generator.html)
// In a real app, use obfuscation or environment variables at build time.
const SECRET_KEY: &str = "KolaBiz_Secret_Key_2025_Secure";
const APP_REGISTRY_PATH: &str = "Software\\KolaBiz\\Secure";

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LicenseType {
    Trial,
    SevenDay,
    ThirtyDay,
    Annual,
    Lifetime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub status: String, // "Active", "Expired", "Trial", "TrialExpired"
    pub license_type: LicenseType,
    pub days_remaining: i64,
    pub expiry_date: Option<u64>, // Unix timestamp
    pub machine_id: String,
    pub message: Option<String>,
}

pub fn get_machine_id() -> String {
    // machine_uid::get() often returns a long GUID.
    // For typing convenience, let's hash it and take the first 8 chars?
    // User requested "provide key by phone", meaning they will READ the Machine ID to the developer.
    // If Machine ID is "3e4a..." (32 chars), it's annoying.
    // Let's truncate or simple-hash the machine ID for display?
    // No, collisions risk.
    // Let's assume the user can send a photo of the ID or it's not THAT long (UUID).
    // Actually, `machine-uid` usually returns a UUID. 36 chars.
    // Let's just use it as is for safety, or maybe the first 8 chars if we accept lower security.
    // Better: keep full ID for internal check, but maybe a shorter code for the user to read?
    // For now, let's stick to full ID, but the license key ITSELF is short.
    machine_uid::get().unwrap_or_else(|_| "UNKNOWN-ID".to_string())
}

// Registry Helpers
fn get_registry_u64(key: &str) -> Option<u64> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let app_key = hkcu.open_subkey(APP_REGISTRY_PATH).ok()?;
    let val: String = app_key.get_value(key).ok()?;
    val.parse().ok()
}

fn set_registry_u64(key: &str, val: u64) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (app_key, _) = hkcu
        .create_subkey(APP_REGISTRY_PATH)
        .map_err(|e| e.to_string())?;
    app_key
        .set_value(key, &val.to_string())
        .map_err(|e| e.to_string())
}

fn get_registry_string(key: &str) -> Option<String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match hkcu.open_subkey(APP_REGISTRY_PATH) {
        Ok(app_key) => app_key.get_value(key).ok(),
        Err(_) => None,
    }
}

fn set_registry_string(key: &str, val: &str) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (app_key, _) = hkcu
        .create_subkey(APP_REGISTRY_PATH)
        .map_err(|e| e.to_string())?;
    app_key
        .set_value(key, &val.to_string())
        .map_err(|e| e.to_string())
}

// FORMAT: TYPE-EXPIRYHEX-SIGNATURE
// TYPE: 2 chars (AN, 7D, 30, LT)
// EXPIRY: 6 chars (YYMMDD) or HEX encoded timestamp?
// Let's use DDMMYY for readability: "311225" (Dec 31, 2025)
// SIGNATURE: 8 chars (First 8 of Hex HMAC)
// Example: AN-311225-A1B2C3D4

fn verify_key(key_input: &str, machine_id: &str) -> Result<(LicenseType, u64), String> {
    let parts: Vec<&str> = key_input.split('-').collect();
    if parts.len() != 3 {
        return Err("Invalid format. Use TYPE-DATE-SIG".to_string());
    }

    let type_code = parts[0];
    let date_str = parts[1];
    let provided_sig = parts[2];

    // 1. Reconstruct payload
    // Payload for HMAC = MachineID + TypeCode + DateStr
    let payload = format!("{}{}{}", machine_id, type_code, date_str);

    // 2. Calculate HMAC
    let mut mac =
        HmacSha256::new_from_slice(SECRET_KEY.as_bytes()).expect("HMAC can take key of any size");
    mac.update(payload.as_bytes());
    let result = mac.finalize();
    let code_bytes = result.into_bytes();
    let full_hex = hex::encode(code_bytes);

    // 3. Truncate to 8 chars
    let expected_sig = &full_hex[0..8];

    // 4. Compare (Case insensitive)
    if expected_sig.to_uppercase() != provided_sig.to_uppercase() {
        return Err("Invalid signature.".to_string());
    }

    // 5. Parse Type
    let lic_type = match type_code.to_uppercase().as_str() {
        "7D" => LicenseType::SevenDay,
        "30" => LicenseType::ThirtyDay,
        "AN" => LicenseType::Annual,
        "LT" => LicenseType::Lifetime,
        _ => return Err("Unknown license type code".to_string()),
    };

    // 6. Parse Date
    let expiry_ts = if lic_type == LicenseType::Lifetime {
        4102444800 // Far future (2100)
    } else {
        // Parse DDMMYY
        // We assume 20xx for YY
        let day = date_str[0..2].parse::<u32>().map_err(|_| "Invalid Day")?;
        let month = date_str[2..4].parse::<u32>().map_err(|_| "Invalid Month")?;
        let year_short = date_str[4..6].parse::<i32>().map_err(|_| "Invalid Year")?;
        let year = 2000 + year_short;

        let date = NaiveDate::from_ymd_opt(year, month, day).ok_or("Invalid Date")?;
        // Set time to end of day?
        date.and_hms_opt(23, 59, 59).unwrap().and_utc().timestamp() as u64
    };

    Ok((lic_type, expiry_ts))
}

pub fn activate(key_input: String) -> Result<LicenseStatus, String> {
    let machine_id = get_machine_id();
    // Normalize input
    let clean_key = key_input.trim().to_uppercase();
    match verify_key(&clean_key, &machine_id) {
        Ok((_, _)) => {
            set_registry_string("LicenseKey", &clean_key)?;
            // Also reset InstallDate? No, keep it.
            get_status()
        }
        Err(e) => Err(e),
    }
}

pub fn get_status() -> Result<LicenseStatus, String> {
    let machine_id = get_machine_id();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // 1. Check for valid license key
    if let Some(key) = get_registry_string("LicenseKey") {
        match verify_key(&key, &machine_id) {
            Ok((lic_type, expiry)) => {
                let days_remaining = if lic_type == LicenseType::Lifetime {
                    9999
                } else {
                    if expiry > now {
                        ((expiry - now) as f64 / 86400.0).ceil() as i64
                    } else {
                        -1
                    }
                };

                let status = if expiry > now || lic_type == LicenseType::Lifetime {
                    "Active"
                } else {
                    "Expired"
                };

                return Ok(LicenseStatus {
                    status: status.to_string(),
                    license_type: lic_type,
                    days_remaining,
                    expiry_date: Some(expiry),
                    machine_id,
                    message: if status == "Expired" {
                        Some("License has expired.".to_string())
                    } else {
                        None
                    },
                });
            }
            Err(_) => {
                // Invalid key found
            }
        }
    }

    // 2. Fallback to Trial Logic
    let install_date = match get_registry_u64("InstallDate") {
        Some(date) => date,
        None => {
            set_registry_u64("InstallDate", now)?;
            now
        }
    };

    let elapsed = now.saturating_sub(install_date);
    let days_elapsed = (elapsed as f64 / 86400.0).ceil() as i64;
    let trial_days = 7;
    let days_remaining = trial_days - days_elapsed;

    if days_remaining < 0 {
        Ok(LicenseStatus {
            status: "TrialExpired".to_string(),
            license_type: LicenseType::Trial,
            days_remaining: 0,
            expiry_date: None,
            machine_id,
            message: Some("Trial has expired.".to_string()),
        })
    } else {
        Ok(LicenseStatus {
            status: "Trial".to_string(),
            license_type: LicenseType::Trial,
            days_remaining,
            expiry_date: Some(install_date + trial_days as u64 * 86400),
            machine_id,
            message: None,
        })
    }
}
