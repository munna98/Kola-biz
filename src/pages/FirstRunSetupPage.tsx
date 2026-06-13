import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { Label } from '@/components/ui/label';
import { setIsFirstRun } from '@/store';
import { toast } from 'sonner';
import { IconBuilding, IconWorld, IconSparkles, IconArrowRight, IconCheck } from '@tabler/icons-react';

// Hardcoded country list for first-run (before any DB exists).
// Mirrors the seed list so the user can pick a country without a live DB.
const DEFAULT_COUNTRIES = [
    'India', 'United States', 'United Kingdom', 'Canada', 'Australia',
    'Germany', 'France', 'Japan', 'China', 'Singapore',
    'United Arab Emirates', 'Saudi Arabia', 'Malaysia', 'Thailand',
    'Indonesia', 'Philippines', 'Vietnam', 'South Korea',
    'Bangladesh', 'Pakistan', 'Sri Lanka', 'Nepal', 'Bhutan', 'Maldives',
];

export default function FirstRunSetupPage() {
    const dispatch = useDispatch();
    const countries = DEFAULT_COUNTRIES;
    const [formData, setFormData] = useState({
        companyName: '',
        country: 'India',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [step, setStep] = useState<'form' | 'done'>('form');


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.companyName.trim()) {
            toast.error('Company name is required');
            return;
        }
        if (!formData.country) {
            toast.error('Please select a country');
            return;
        }

        setIsLoading(true);

        try {
            await invoke('create_first_company', {
                input: {
                    name: formData.companyName.trim(),
                    country: formData.country,
                },
            });

            setStep('done');

            // Short delay to show success state, then proceed to login
            setTimeout(() => {
                dispatch(setIsFirstRun(false));
            }, 1800);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to set up company. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
            style={{
                background: 'linear-gradient(135deg, hsl(220 60% 6%) 0%, hsl(240 50% 10%) 50%, hsl(260 55% 8%) 100%)',
            }}
        >
            {/* Decorative background blobs */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] rounded-full opacity-20"
                    style={{ background: 'radial-gradient(circle, hsl(260 80% 60%) 0%, transparent 70%)', filter: 'blur(60px)' }} />
                <div className="absolute bottom-[-10%] right-[-5%] w-[35vw] h-[35vw] rounded-full opacity-15"
                    style={{ background: 'radial-gradient(circle, hsl(200 80% 55%) 0%, transparent 70%)', filter: 'blur(60px)' }} />
                <div className="absolute top-[40%] right-[15%] w-[20vw] h-[20vw] rounded-full opacity-10"
                    style={{ background: 'radial-gradient(circle, hsl(320 70% 60%) 0%, transparent 70%)', filter: 'blur(40px)' }} />
            </div>

            <div className="relative z-10 w-full max-w-lg px-4">

                {/* Header branding */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-4">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, hsl(260 80% 60%), hsl(200 80% 55%))' }}>
                            <IconSparkles className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-2xl font-bold text-white tracking-tight">KolaBiz</span>
                    </div>
                    <p className="text-sm" style={{ color: 'hsl(220 20% 60%)' }}>
                        Business Management Suite
                    </p>
                </div>

                {/* Card */}
                <div className="rounded-2xl border p-8"
                    style={{
                        background: 'rgba(255,255,255,0.04)',
                        backdropFilter: 'blur(24px)',
                        borderColor: 'rgba(255,255,255,0.1)',
                        boxShadow: '0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
                    }}>

                    {step === 'form' ? (
                        <>
                            <div className="mb-6">
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                                    style={{ background: 'linear-gradient(135deg, hsl(260 80% 60% / 0.3), hsl(200 80% 55% / 0.3))', border: '1px solid hsl(260 80% 60% / 0.4)' }}>
                                    <IconBuilding className="w-6 h-6" style={{ color: 'hsl(260 80% 75%)' }} />
                                </div>
                                <h1 className="text-2xl font-bold text-white mb-1">Welcome to KolaBiz!</h1>
                                <p className="text-sm" style={{ color: 'hsl(220 20% 55%)' }}>
                                    Let's set up your company to get started. This only takes a moment.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                {/* Company Name */}
                                <div className="space-y-2">
                                    <Label htmlFor="companyName" className="text-sm font-medium" style={{ color: 'hsl(220 20% 75%)' }}>
                                        Company Name <span style={{ color: 'hsl(0 70% 65%)' }}>*</span>
                                    </Label>
                                    <div className="relative">
                                        <IconBuilding className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-10"
                                            style={{ color: 'hsl(220 20% 50%)' }} />
                                        <input
                                            id="companyName"
                                            type="text"
                                            placeholder="e.g. Acme Traders Pvt Ltd"
                                            value={formData.companyName}
                                            onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                                            autoFocus
                                            disabled={isLoading}
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-200"
                                            style={{
                                                background: 'rgba(255,255,255,0.06)',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                color: 'white',
                                            }}
                                            onFocus={e => (e.target.style.borderColor = 'hsl(260 80% 60% / 0.6)')}
                                            onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                                        />
                                    </div>
                                </div>

                                {/* Country */}
                                <div className="space-y-2">
                                    <Label htmlFor="country" className="text-sm font-medium" style={{ color: 'hsl(220 20% 75%)' }}>
                                        Country <span style={{ color: 'hsl(0 70% 65%)' }}>*</span>
                                    </Label>
                                    <div className="relative">
                                        <IconWorld className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none z-10"
                                            style={{ color: 'hsl(220 20% 50%)' }} />
                                        <select
                                            id="country"
                                            value={formData.country}
                                            onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                                            disabled={isLoading}
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none appearance-none cursor-pointer transition-all duration-200"
                                            style={{
                                                background: 'rgba(255,255,255,0.06)',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                color: 'white',
                                            }}
                                        >
                                            {countries.map((c) => (
                                                <option key={c} value={c} style={{ background: 'hsl(230 30% 12%)', color: 'white' }}>
                                                    {c}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={isLoading || !formData.companyName.trim()}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                                    style={{
                                        background: isLoading || !formData.companyName.trim()
                                            ? 'rgba(255,255,255,0.1)'
                                            : 'linear-gradient(135deg, hsl(260 80% 58%), hsl(220 80% 60%))',
                                        boxShadow: !isLoading && formData.companyName.trim()
                                            ? '0 4px 24px hsl(260 80% 50% / 0.35)'
                                            : 'none',
                                    }}
                                >
                                    {isLoading ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Setting up your company...
                                        </>
                                    ) : (
                                        <>
                                            Get Started
                                            <IconArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Info note */}
                            <p className="mt-5 text-xs text-center" style={{ color: 'hsl(220 20% 45%)' }}>
                                Default login: <span style={{ color: 'hsl(220 20% 65%)' }}>admin</span> / <span style={{ color: 'hsl(220 20% 65%)' }}>admin</span>&nbsp;·&nbsp;Change it after first login
                            </p>
                        </>
                    ) : (
                        /* Success state */
                        <div className="text-center py-4">
                            <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, hsl(145 70% 40%), hsl(160 65% 45%))' }}>
                                <IconCheck className="w-8 h-8 text-white" strokeWidth={2.5} />
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">Company Created!</h2>
                            <p className="text-sm" style={{ color: 'hsl(220 20% 55%)' }}>
                                <span className="font-semibold" style={{ color: 'hsl(220 20% 75%)' }}>{formData.companyName}</span> has been set up successfully.
                                <br />Taking you to login…
                            </p>
                            <div className="mt-5 flex justify-center">
                                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-xs mt-6" style={{ color: 'hsl(220 20% 35%)' }}>
                    © {new Date().getFullYear()} KolaBiz · All data is stored locally on your device
                </p>
            </div>
        </div>
    );
}
