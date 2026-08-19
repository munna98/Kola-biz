import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { IconScissors } from '@tabler/icons-react';

export default function FeaturesSettingsPage() {
    const [customOrdersEnabled, setCustomOrdersEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        invoke<string | null>('get_app_setting', { key: 'custom_orders_enabled' })
            .then(val => setCustomOrdersEnabled(val === 'true'))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const toggle = async (enabled: boolean) => {
        try {
            await invoke('set_app_setting', { key: 'custom_orders_enabled', value: enabled ? 'true' : 'false' });
            setCustomOrdersEnabled(enabled);
            toast.success(
                enabled
                    ? 'Custom Orders enabled. You can now access Custom Orders from the menu or add it to your sidebar.'
                    : 'Custom Orders disabled.'
            );
        } catch (err) {
            toast.error(String(err));
        }
    };

    return (
        <div className="p-6 max-w-2xl">
            <h1 className="text-2xl font-semibold mb-1">Feature Settings</h1>
            <p className="text-muted-foreground text-sm mb-6">
                Enable or disable optional industry-specific modules for this company.
            </p>

            <div className="border rounded-lg divide-y bg-card">
                {/* Custom Orders */}
                <div className="flex items-start gap-4 p-4">
                    <div className="mt-1 p-2 bg-primary/10 rounded-md">
                        <IconScissors size={20} className="text-primary" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-medium">Custom Orders (Job Work)</h3>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Boutique job work tracking with material consumption from inventory,
                                    direct expensed purchases, and service/stitching charges. Finalizes
                                    into a single finished-product invoice with automatic COGS posting.
                                </p>
                            </div>
                            <Switch
                                checked={customOrdersEnabled}
                                onCheckedChange={toggle}
                                disabled={loading}
                                className="ml-4 shrink-0"
                            />
                        </div>
                        {customOrdersEnabled && (
                            <p className="text-xs text-green-600 mt-2 font-medium">
                                ✓ Enabled — access via Sidebar or Menu
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
