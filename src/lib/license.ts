
import { invoke } from '@tauri-apps/api/core';

export type LicenseType = 'Trial' | 'SevenDay' | 'ThirtyDay' | 'Annual' | 'Lifetime';

export interface LicenseStatus {
    status: 'Active' | 'Expired' | 'Trial' | 'TrialExpired';
    license_type: LicenseType;
    days_remaining: number;
    expiry_date?: number;
    machine_id: string;
    message?: string;
}

export const getLicenseInfo = async (): Promise<LicenseStatus> => {
    return await invoke('get_license_info');
};

export const activateLicense = async (key: string): Promise<LicenseStatus> => {
    return await invoke('activate_license', { key });
};
