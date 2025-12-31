
import React, { useState } from 'react';
import { useLicense } from '@/components/providers/LicenseProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Copy, Lock, Key, X } from 'lucide-react';

interface ActivationPageProps {
    onClose?: () => void;
    canClose?: boolean;
}

export const ActivationPage: React.FC<ActivationPageProps> = ({ onClose, canClose = false }) => {
    const { status, activate } = useLicense();
    const [key, setKey] = useState('');
    const [loading, setLoading] = useState(false);

    const handleActivate = async () => {
        if (!key) return;
        setLoading(true);
        try {
            await activate(key);
            if (onClose) onClose();
        } catch (e: any) {
            toast.error(e.message || "Invalid Key");
        } finally {
            setLoading(false);
        }
    };

    const copyMachineId = () => {
        if (status?.machine_id) {
            navigator.clipboard.writeText(status.machine_id);
            toast.success("Machine ID copied!");
        }
    };

    if (!status) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
            <Card className="w-full max-w-md shadow-lg border-primary/20 relative">
                {canClose && (
                    <Button variant="ghost" size="icon" className="absolute right-2 top-2" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                )}
                <CardHeader className="text-center">
                    <div className="mx-auto bg-primary/10 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                        <Lock className="w-8 h-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">
                        {canClose ? "Update License" : "Activation Required"}
                    </CardTitle>
                    <CardDescription>
                        {canClose
                            ? "Enter a new key to extend or upgrade your license."
                            : (status.status === 'TrialExpired'
                                ? "Your 7-day trial has expired."
                                : "Your license has expired.")
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label>Your Machine ID</Label>
                        <div className="flex gap-2">
                            <code className="flex-1 p-2 bg-muted rounded border font-mono text-sm overflow-hidden text-ellipsis">
                                {status.machine_id}
                            </code>
                            <Button variant="outline" size="icon" onClick={copyMachineId}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Send this ID to the developer to get your key.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>License Key</Label>
                        <div className="relative">
                            <Key className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                placeholder="Paste your key here..."
                                className="pl-9"
                            />
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-2">
                    <Button
                        className="w-full"
                        onClick={handleActivate}
                        disabled={loading || !key}
                    >
                        {loading ? "Verifying..." : "Activate License"}
                    </Button>
                    <div className="text-center text-xs text-muted-foreground mt-4">
                        Need help? Contact support at +91 8086094070
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
};
