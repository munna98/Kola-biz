import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Cloud, Globe, Eye, EyeOff, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { testCloudConnection, connectCloudCompany, ConnectCloudCompanyResult } from '@/lib/tauri';
import { toast } from 'sonner';

interface ConnectCloudCompanyDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: (result: ConnectCloudCompanyResult) => void;
}

export default function ConnectCloudCompanyDialog({
    open,
    onClose,
    onSuccess,
}: ConnectCloudCompanyDialogProps) {
    const [cloudUrl, setCloudUrl] = useState('');
    const [cloudToken, setCloudToken] = useState('');
    const [showToken, setShowToken] = useState(false);
    const [devicePrefix, setDevicePrefix] = useState('POS2');
    const [testing, setTesting] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleTest = async () => {
        if (!cloudUrl.trim() || !cloudToken.trim()) {
            toast.error('Please enter both Database URL and Auth Token');
            return;
        }
        setTesting(true);
        setTestResult(null);
        try {
            const res = await testCloudConnection(cloudUrl.trim(), cloudToken.trim());
            setTestResult({ success: true, message: res });
            toast.success(res);
        } catch (err: any) {
            setTestResult({ success: false, message: `${err}` });
            toast.error(`Connection failed: ${err}`);
        } finally {
            setTesting(false);
        }
    };

    const handleConnect = async () => {
        if (!cloudUrl.trim() || !cloudToken.trim()) {
            toast.error('Please enter both Database URL and Auth Token');
            return;
        }
        setConnecting(true);
        try {
            const res = await connectCloudCompany({
                cloudUrl: cloudUrl.trim(),
                cloudToken: cloudToken.trim(),
                devicePrefix: devicePrefix.trim() || 'POS2',
            });
            toast.success(res.message);
            onSuccess(res);
            onClose();
        } catch (err: any) {
            toast.error(`Failed to connect cloud company: ${err}`);
        } finally {
            setConnecting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && !connecting && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <Cloud className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        Connect to Cloud Company
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Connect this PC to an existing cloud database. All company details, chart of accounts, products, and vouchers will sync automatically.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="cloud-url-input" className="text-xs font-semibold">Turso Database URL</Label>
                        <Input
                            id="cloud-url-input"
                            placeholder="libsql://your-db-name.turso.io"
                            value={cloudUrl}
                            onChange={(e) => setCloudUrl(e.target.value)}
                            disabled={connecting}
                            className="h-9 text-xs"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="cloud-token-input" className="text-xs font-semibold">Turso Auth Token</Label>
                        <div className="relative">
                            <Input
                                id="cloud-token-input"
                                type={showToken ? 'text' : 'password'}
                                placeholder="eyJhbGciOiJFZERT..."
                                value={cloudToken}
                                onChange={(e) => setCloudToken(e.target.value)}
                                disabled={connecting}
                                className="h-9 text-xs pr-9"
                            />
                            <button
                                type="button"
                                onClick={() => setShowToken(!showToken)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="device-prefix-input" className="text-xs font-semibold">This PC Terminal Prefix</Label>
                            <span className="text-[10px] text-muted-foreground">e.g. POS2, COUNTER2</span>
                        </div>
                        <Input
                            id="device-prefix-input"
                            placeholder="POS2"
                            value={devicePrefix}
                            onChange={(e) => setDevicePrefix(e.target.value)}
                            disabled={connecting}
                            className="h-9 text-xs"
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Assigns a unique invoice sequence prefix for this computer to avoid conflicts with other counters.
                        </p>
                    </div>

                    {testResult && (
                        <div
                            className={`p-2.5 rounded-md text-xs flex items-center gap-2 ${
                                testResult.success
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                    : 'bg-destructive/10 text-destructive border border-destructive/20'
                            }`}
                        >
                            {testResult.success ? (
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                            ) : (
                                <AlertCircle className="w-4 h-4 shrink-0" />
                            )}
                            <span className="truncate">{testResult.message}</span>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex items-center justify-between gap-2 border-t pt-3 sm:justify-between">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleTest}
                        disabled={testing || connecting}
                        className="gap-1.5 text-xs h-8"
                    >
                        <Globe className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                        {testing ? 'Testing...' : 'Test Connection'}
                    </Button>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            disabled={connecting}
                            className="text-xs h-8"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleConnect}
                            disabled={connecting}
                            className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${connecting ? 'animate-spin' : ''}`} />
                            {connecting ? 'Connecting & Syncing...' : 'Connect & Sync'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
