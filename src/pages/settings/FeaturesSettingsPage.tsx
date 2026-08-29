import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { IconScissors, IconCoins } from '@tabler/icons-react';

export default function FeaturesSettingsPage() {
    const [customOrdersEnabled, setCustomOrdersEnabled] = useState(false);
    const [multiCurrencyEnabled, setMultiCurrencyEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            invoke<string | null>('get_app_setting', { key: 'custom_orders_enabled' }),
            invoke<string | null>('get_app_setting', { key: 'multi_currency_enabled' }),
        ])
            .then(([customVal, multiVal]) => {
                setCustomOrdersEnabled(customVal === 'true');
                setMultiCurrencyEnabled(multiVal === 'true');
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    const toggleCustomOrders = async (enabled: boolean) => {
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

    const toggleMultiCurrency = async (enabled: boolean) => {
        try {
            await invoke('set_app_setting', { key: 'multi_currency_enabled', value: enabled ? 'true' : 'false' });
            setMultiCurrencyEnabled(enabled);
            toast.success(
                enabled
                    ? 'Multi-Currency enabled. Foreign currency fields are now active across sales, receipts, payments, and master dialogs.'
                    : 'Multi-Currency disabled.'
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
                {/* Multi-Currency */}
                <div className="flex items-start gap-4 p-4">
                    <div className="mt-1 p-2 bg-primary/10 rounded-md">
                        <IconCoins size={20} className="text-primary" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-medium">Multi-Currency Transactions</h3>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Track foreign currency rates, assign foreign currencies to customers & suppliers,
                                    and process multi-currency sales invoices, receipts, and payments.
                                </p>
                            </div>
                            <Switch
                                checked={multiCurrencyEnabled}
                                onCheckedChange={toggleMultiCurrency}
                                disabled={loading}
                                className="ml-4 shrink-0"
                            />
                        </div>
                        {multiCurrencyEnabled && (
                            <p className="text-xs text-green-600 mt-2 font-medium">
                                ✓ Enabled — currency & exchange rate fields active across vouchers and dialogs
                            </p>
                        )}
                    </div>
                </div>

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
                                onCheckedChange={toggleCustomOrders}
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

