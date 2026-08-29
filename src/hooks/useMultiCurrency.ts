import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { RootState } from '@/store';

export function useExportBusiness(): boolean {
    const profile = useSelector((state: RootState) => state.companyProfile.profile);
    return profile?.business_type === 'Export Business';
}

export function useMultiCurrencyEnabled(): boolean {
    const isExport = useExportBusiness();
    const [settingEnabled, setSettingEnabled] = useState<boolean>(false);

    useEffect(() => {
        let mounted = true;
        invoke<string | null>('get_app_setting', { key: 'multi_currency_enabled' })
            .then((val) => {
                if (mounted) {
                    setSettingEnabled(val === 'true');
                }
            })
            .catch(() => {
                if (mounted) {
                    setSettingEnabled(false);
                }
            });

        return () => {
            mounted = false;
        };
    }, []);

    return isExport || settingEnabled;
}

export function useMultiCurrency() {
    const isExportBusiness = useExportBusiness();
    const isMultiCurrencyEnabled = useMultiCurrencyEnabled();
    const profile = useSelector((state: RootState) => state.companyProfile.profile);

    return {
        isMultiCurrencyEnabled,
        isExportBusiness,
        profile,
    };
}

