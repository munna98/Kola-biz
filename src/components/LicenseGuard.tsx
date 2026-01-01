
import React, { useState } from 'react';
import { useLicense } from '@/components/providers/LicenseProvider';
import { ActivationPage } from '@/pages/ActivationPage';
import { Clock } from 'lucide-react';

export const LicenseGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { status, loading } = useLicense();
    const [showActivation, setShowActivation] = useState(false);

    if (loading) {
        return <div className="h-screen w-screen flex items-center justify-center">Loading License...</div>;
    }

    if (!status) {
        return <div>Error loading license system.</div>;
    }

    // Force activation if expired
    if (status.status === 'TrialExpired' || status.status === 'Expired') {
        return <ActivationPage />;
    }

    return (
        <>
            {children}

            {showActivation && (
                <ActivationPage onClose={() => setShowActivation(false)} canClose={true} />
            )}

            {status.status === 'Trial' && (
                <div
                    className="fixed bottom-4 left-4 z-40 animate-in slide-in-from-bottom-5 cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => setShowActivation(true)}
                >
                    <div className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-600 dark:text-yellow-400 p-2 rounded-md shadow-lg flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <div className="text-xs font-medium">
                            Trial: {status.days_remaining} days remaining
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
