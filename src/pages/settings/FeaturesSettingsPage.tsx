import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { IconScissors, IconCoins, IconPackages } from '@tabler/icons-react';

export default function FeaturesSettingsPage() {
    const [customOrdersEnabled, setCustomOrdersEnabled] = useState(false);
    const [multiCurrencyEnabled, setMultiCurrencyEnabled] = useState(false);
    const [masterProductsEnabled, setMasterProductsEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            invoke<string | null>('get_app_setting', { key: 'custom_orders_enabled' }),
            invoke<string | null>('get_app_setting', { key: 'multi_currency_enabled' }),
            invoke<string | null>('get_app_setting', { key: 'enable_master_products' }),
        ])
            .then(([customVal, multiVal, masterVal]) => {
                setCustomOrdersEnabled(customVal === 'true');
                setMultiCurrencyEnabled(multiVal === 'true');
                setMasterProductsEnabled(masterVal === 'true');
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

    const toggleMasterProducts = async (enabled: boolean) => {
        try {
            await invoke('set_app_setting', { key: 'enable_master_products', value: enabled ? 'true' : 'false' });
            setMasterProductsEnabled(enabled);
            toast.success(
                enabled
                    ? 'Master Products enabled for retail textile/apparel items.'
                    : 'Master Products disabled.'
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
                {/* Master Products */}
                <div className="flex items-start gap-4 p-4">
                    <div className="mt-1 p-2 bg-amber-500/10 rounded-md">
                        <IconPackages size={20} className="text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <h3 className="font-medium">Master Products</h3>
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                                    Textile / Apparel
                                </span>
                            </div>
                            <Switch
                                checked={masterProductsEnabled}
                                onCheckedChange={toggleMasterProducts}
                                disabled={loading}
                                className="ml-4 shrink-0"
                            />
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            Enable for retail textile businesses. Automatically creates child batches with unique
                            sequential item codes per purchase line — ready for barcode label printing.
                        </p>
                        {masterProductsEnabled && (
                            <p className="text-xs text-green-600 mt-2 font-medium">
                                ✓ Enabled — Master/Child Batch fields active in Products &amp; Invoices
                            </p>
                        )}
                    </div>
                </div>

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
                                    Track foreign currency rates, assign foreign currencies to customers &amp; suppliers,
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
                                ✓ Enabled — currency &amp; exchange rate fields active across vouchers and dialogs
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
