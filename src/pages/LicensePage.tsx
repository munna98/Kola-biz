import { useState } from 'react';
import { useLicense } from '@/components/providers/LicenseProvider';
import { ActivationPage } from '@/pages/ActivationPage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LicensePage() {
    const { status } = useLicense();
    const [showActivation, setShowActivation] = useState(false);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    License Information
                </h1>
                <p className="text-muted-foreground mt-1">
                    Manage your application license and activation status
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Current License</CardTitle>
                    <CardDescription>
                        Details about your active license
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="bg-muted p-6 rounded-lg flex items-center justify-between">
                        <div>
                            <h3 className="font-semibold text-xl mb-1">{status?.license_type} License</h3>
                            <p className="text-sm text-muted-foreground mb-2">
                                Status: <span className={`font-medium ${status?.status === 'Active' ? 'text-green-600' : 'text-yellow-600'}`}>
                                    {status?.status}
                                </span>
                            </p>
                            {status?.expiry_date && (
                                <p className="text-sm text-muted-foreground">
                                    Expires on: <span className="font-medium">{new Date(status.expiry_date * 1000).toLocaleDateString()}</span>
                                    {status.days_remaining < 30 && status.days_remaining > 0 && (
                                        <span className="text-red-500 ml-2 font-medium">({status.days_remaining} days left)</span>
                                    )}
                                </p>
                            )}
                        </div>
                        <Button onClick={() => setShowActivation(true)} size="lg">
                            Update License
                        </Button>
                    </div>

                    <div className="space-y-2">
                        <p className="text-sm font-medium">Machine ID</p>
                        <div className="flex items-center gap-2">
                            <code className="bg-muted px-3 py-2 rounded border font-mono text-sm">
                                {status?.machine_id}
                            </code>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            This ID is unique to your device and is used for license verification.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {showActivation && (
                <ActivationPage onClose={() => setShowActivation(false)} canClose={true} />
            )}
        </div>
    );
}
