
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
                    className="fixed bottom-4 right-4 z-40 max-w-sm animate-in slide-in-from-bottom-5 cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => setShowActivation(true)}
                >
                    <div className="bg-yellow-500/10 border border-yellow-500/50 text-yellow-600 dark:text-yellow-400 p-4 rounded-lg shadow-lg flex items-start gap-3">
                        <Clock className="h-5 w-5 mt-0.5" />
                        <div>
                            <h4 className="font-semibold tracking-tight">Trial Mode</h4>
                            <div className="text-sm opacity-90">
                                {status.days_remaining} days remaining. Click to Activate.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
