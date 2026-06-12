import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useLicense } from '@/components/providers/LicenseProvider';
import { ActivationPage } from '@/pages/ActivationPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    IconBrandWhatsapp,
    IconPhone,
    IconRefresh,
    IconCircleCheck,
    IconAlertCircle,
    IconLoader2,
    IconDownload,
    IconShieldCheck,
    IconShieldOff,
    IconInfoCircle,
    IconKey,
} from '@tabler/icons-react';

type UpdateStatus = 'idle' | 'checking' | 'up_to_date' | 'update_available' | 'error';

const SUPPORT_PHONE = '8086094070';
const GITHUB_REPO = 'munna98/Kola-biz';

export default function LicensePage() {
    const { status } = useLicense();
    const [showActivation, setShowActivation] = useState(false);

    // Version state
    const [appVersion, setAppVersion] = useState<string>('');

    // Update check state
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
    const [latestVersion, setLatestVersion] = useState<string>('');
    const [downloadUrl, setDownloadUrl] = useState<string>('');
    const [releasePageUrl, setReleasePageUrl] = useState<string>('');

    useEffect(() => {
        invoke<string>('get_app_version')
            .then(setAppVersion)
            .catch(() => setAppVersion('?'));
    }, []);

    const checkForUpdates = async () => {
        setUpdateStatus('checking');
        setLatestVersion('');
        setDownloadUrl('');
        setReleasePageUrl('');
        try {
            const res = await fetch(
                `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
                { headers: { Accept: 'application/vnd.github+json' } }
            );
            if (!res.ok) throw new Error(`GitHub API ${res.status}`);
            const data = await res.json();

            // tag_name is like "v1.1.77" — strip the leading "v"
            const latest: string = (data.tag_name as string).replace(/^v/, '');
            setLatestVersion(latest);
            setReleasePageUrl(data.html_url as string);

            // Look for an .msi installer asset; fall back to the release page
            const msiAsset = (data.assets as any[])?.find((a) =>
                (a.name as string).toLowerCase().endsWith('.msi')
            );
            setDownloadUrl(msiAsset?.browser_download_url ?? data.html_url);

            // Compare versions: split by "." and compare each part numerically
            const isNewer = (a: string, b: string) => {
                const pa = a.split('.').map(Number);
                const pb = b.split('.').map(Number);
                for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
                    if (diff !== 0) return diff > 0;
                }
                return false;
            };

            setUpdateStatus(isNewer(appVersion, latest) ? 'update_available' : 'up_to_date');
        } catch {
            setUpdateStatus('error');
        }
    };

    const handleDownloadInstall = async () => {
        if (!downloadUrl) return;
        await openUrl(downloadUrl);
    };

    const licenseStatusColor =
        status?.status === 'Active'
            ? 'text-emerald-500'
            : status?.status === 'Trial'
                ? 'text-amber-500'
                : 'text-red-500';

    const LicenseIcon = status?.status === 'Active' ? IconShieldCheck : IconShieldOff;

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">

            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <IconInfoCircle size={22} className="text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">About KolaBiz</h1>
                    <p className="text-sm text-muted-foreground">Version, updates, support &amp; license</p>
                </div>
            </div>

            {/* ── App Info Card ──────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Application Info</CardTitle>
                    <CardDescription>Installed version details</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="space-y-1">
                            <p className="text-3xl font-bold tracking-tight">
                                KolaBiz
                                {appVersion && (
                                    <span className="ml-3 text-xl font-mono text-primary">
                                        v{appVersion}
                                    </span>
                                )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Business management software for growing businesses
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                                Installed Version
                            </span>
                            <span className="font-mono text-sm bg-muted px-3 py-1 rounded-md border">
                                {appVersion ? `v${appVersion}` : '—'}
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ── Check for Updates Card ─────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Software Updates</CardTitle>
                    <CardDescription>Check if a newer version of KolaBiz is available</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <Button
                            onClick={checkForUpdates}
                            disabled={updateStatus === 'checking'}
                            variant="outline"
                            className="gap-2"
                            id="check-updates-btn"
                        >
                            {updateStatus === 'checking' ? (
                                <IconLoader2 size={16} className="animate-spin" />
                            ) : (
                                <IconRefresh size={16} />
                            )}
                            {updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}
                        </Button>

                        {/* ✅ Up to date */}
                        {updateStatus === 'up_to_date' && (
                            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                                <IconCircleCheck size={18} />
                                You&apos;re up to date — v{appVersion} is the latest version
                            </div>
                        )}

                        {/* 🔔 Update available */}
                        {updateStatus === 'update_available' && (
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 font-medium">
                                    <IconAlertCircle size={18} />
                                    Version <span className="font-bold ml-1">v{latestVersion}</span>&nbsp;is available
                                </div>
                                <Button
                                    size="sm"
                                    className="gap-1.5 h-8"
                                    onClick={handleDownloadInstall}
                                    id="download-install-btn"
                                >
                                    <IconDownload size={14} />
                                    Download &amp; Install
                                </Button>
                            </div>
                        )}

                        {/* ❌ Error */}
                        {updateStatus === 'error' && (
                            <div className="flex items-center gap-2 text-sm text-red-500 font-medium">
                                <IconAlertCircle size={18} />
                                Could not check for updates. Check your internet connection.
                            </div>
                        )}
                    </div>

                    {updateStatus === 'idle' && (
                        <p className="text-xs text-muted-foreground">
                            Click the button above to check GitHub for the latest release.
                        </p>
                    )}

                    {/* Update detail panel */}
                    {updateStatus === 'update_available' && (
                        <div className="mt-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2">
                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                                🔔 KolaBiz v{latestVersion} is ready
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                                Clicking <strong>Download &amp; Install</strong> will open the installer in your browser.
                                Save and run the <code>.msi</code> file to update KolaBiz.
                                Your data will not be affected.
                            </p>
                            <button
                                onClick={() => openUrl(releasePageUrl)}
                                className="text-xs text-amber-600 dark:text-amber-400 underline underline-offset-2 hover:no-underline"
                            >
                                View release notes on GitHub →
                            </button>
                        </div>
                    )}

                    {updateStatus === 'up_to_date' && (
                        <div className="mt-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                            <p className="text-xs text-emerald-700 dark:text-emerald-400">
                                KolaBiz v{appVersion} is the latest version. No action needed.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ── Support Card ───────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Support</CardTitle>
                    <CardDescription>Need help? Reach out to us directly</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        <a
                            href={`tel:${SUPPORT_PHONE}`}
                            id="support-call-btn"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-muted
                                       hover:bg-accent hover:border-accent-foreground/20 transition-colors
                                       text-sm font-medium"
                        >
                            <IconPhone size={16} className="text-primary" />
                            Call Support
                            <span className="text-muted-foreground font-mono">{SUPPORT_PHONE}</span>
                        </a>

                        <button
                            onClick={() => openUrl(`https://wa.me/91${SUPPORT_PHONE}`)}
                            id="support-whatsapp-btn"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border
                                       bg-emerald-50 border-emerald-200 hover:bg-emerald-100
                                       dark:bg-emerald-950/30 dark:border-emerald-800 dark:hover:bg-emerald-900/40
                                       transition-colors text-sm font-medium text-emerald-700 dark:text-emerald-400"
                        >
                            <IconBrandWhatsapp size={16} />
                            WhatsApp Support
                            <span className="font-mono">{SUPPORT_PHONE}</span>
                        </button>
                    </div>
                </CardContent>
            </Card>

            {/* ── License Card ───────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <IconKey size={16} className="text-muted-foreground" />
                        License Information
                    </CardTitle>
                    <CardDescription>Your active license and activation details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {/* License status row */}
                    <div className="bg-muted/60 p-5 rounded-lg border flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-3">
                            <LicenseIcon size={28} className={licenseStatusColor} />
                            <div>
                                <h3 className="font-semibold text-lg leading-tight">
                                    {status?.license_type} License
                                </h3>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Status:{' '}
                                    <span className={`font-semibold ${licenseStatusColor}`}>
                                        {status?.status}
                                    </span>
                                </p>
                                {status?.expiry_date && (
                                    <p className="text-sm text-muted-foreground mt-0.5">
                                        Expires:{' '}
                                        <span className="font-medium">
                                            {new Date(status.expiry_date * 1000).toLocaleDateString()}
                                        </span>
                                        {status.days_remaining < 30 && status.days_remaining > 0 && (
                                            <span className="text-red-500 ml-2 font-semibold">
                                                ({status.days_remaining} days left)
                                            </span>
                                        )}
                                    </p>
                                )}
                            </div>
                        </div>
                        <Button onClick={() => setShowActivation(true)} id="update-license-btn">
                            Update License
                        </Button>
                    </div>

                    {/* Machine ID */}
                    <div className="space-y-1.5">
                        <p className="text-sm font-medium">Machine ID</p>
                        <code className="block bg-muted px-3 py-2 rounded-md border font-mono text-sm break-all">
                            {status?.machine_id}
                        </code>
                        <p className="text-xs text-muted-foreground">
                            This ID is unique to your device and is used for license verification.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Activation overlay */}
            {showActivation && (
                <ActivationPage onClose={() => setShowActivation(false)} canClose={true} />
            )}
        </div>
    );
}
