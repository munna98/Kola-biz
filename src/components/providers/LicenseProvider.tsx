
import React, { createContext, useContext, useEffect, useState } from 'react';
import { LicenseStatus, getLicenseInfo, activateLicense } from '@/lib/license';
import { toast } from 'sonner';

interface LicenseContextType {
    status: LicenseStatus | null;
    loading: boolean;
    refreshLicense: () => Promise<void>;
    activate: (key: string) => Promise<void>;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export const LicenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [status, setStatus] = useState<LicenseStatus | null>(null);
    const [loading, setLoading] = useState(true);

    const refreshLicense = async () => {
        try {
            const info = await getLicenseInfo();
            setStatus(info);

            // Check for reminders
            if (info.status === 'Active' && info.license_type === 'Annual' && info.days_remaining <= 15) {
                toast.warning(`Your Annual License expires in ${info.days_remaining} days. Please renew soon.`);
            }
            if (info.status === 'Trial' && info.days_remaining <= 3) {
                toast.info(`Trial ends in ${info.days_remaining} days.`);
            }

        } catch (error) {
            console.error("Failed to load license:", error);
            toast.error("Failed to check license status");
        } finally {
            setLoading(false);
        }
    };

    const activate = async (key: string) => {
        try {
            const newStatus = await activateLicense(key);
            setStatus(newStatus);
            toast.success("License activated successfully!");
        } catch (error) {
            console.error(error);
            throw error; // Let UI handle it
        }
    };

    useEffect(() => {
        refreshLicense();
        // Optional: Periodic check? No need for now.
    }, []);

    return (
        <LicenseContext.Provider value={{ status, loading, refreshLicense, activate }}>
            {children}
        </LicenseContext.Provider>
    );
};

export const useLicense = () => {
    const context = useContext(LicenseContext);
    if (!context) {
        throw new Error('useLicense must be used within a LicenseProvider');
    }
    return context;
};
