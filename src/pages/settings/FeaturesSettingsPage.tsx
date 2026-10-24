import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { IconScissors, IconCoins, IconPackages, IconBarcode, IconMathFunction } from '@tabler/icons-react';

export default function FeaturesSettingsPage() {
    const [customOrdersEnabled, setCustomOrdersEnabled] = useState(false);
    const [multiCurrencyEnabled, setMultiCurrencyEnabled] = useState(false);
    const [masterProductsEnabled, setMasterProductsEnabled] = useState(false);
    const [barcodePrintingEnabled, setBarcodePrintingEnabled] = useState(false);
    const [autoRoundOffEnabled, setAutoRoundOffEnabled] = useState(false);
    const [roundOffStrategy, setRoundOffStrategy] = useState<'standard' | 'down'>('standard');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            invoke<string | null>('get_app_setting', { key: 'custom_orders_enabled' }),
            invoke<string | null>('get_app_setting', { key: 'multi_currency_enabled' }),
            invoke<string | null>('get_app_setting', { key: 'enable_master_products' }),
            invoke<string | null>('get_app_setting', { key: 'enable_barcode_printing' }),
            invoke<string | null>('get_app_setting', { key: 'auto_round_off_vouchers' }),
            invoke<string | null>('get_app_setting', { key: 'round_off_strategy' }),
        ])
            .then(([customVal, multiVal, masterVal, barcodeVal, roundOffVal, strategyVal]) => {
                setCustomOrdersEnabled(customVal === 'true');
                setMultiCurrencyEnabled(multiVal === 'true');
                setMasterProductsEnabled(masterVal === 'true');
                setBarcodePrintingEnabled(barcodeVal === 'true');
                setAutoRoundOffEnabled(roundOffVal === 'true');
                setRoundOffStrategy(strategyVal === 'down' ? 'down' : 'standard');
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

    const toggleBarcodePrinting = async (enabled: boolean) => {
        try {
            await invoke('set_app_setting', { key: 'enable_barcode_printing', value: enabled ? 'true' : 'false' });
            setBarcodePrintingEnabled(enabled);
            toast.success(
                enabled
                    ? 'Barcode Printing enabled globally. Voucher barcode printing settings will default to enabled.'
                    : 'Barcode Printing disabled globally.'
            );
        } catch (err) {
            toast.error(String(err));
        }
    };

    const toggleAutoRoundOff = async (enabled: boolean) => {
        try {
            await invoke('set_app_setting', { key: 'auto_round_off_vouchers', value: enabled ? 'true' : 'false' });
            setAutoRoundOffEnabled(enabled);
            toast.success(
                enabled
                    ? 'Auto Round Off enabled for vouchers (.00). New vouchers will default to rounded totals.'
                    : 'Auto Round Off disabled.'
            );
        } catch (err) {
            toast.error(String(err));
        }
    };

    const handleRoundOffStrategyChange = async (strategy: 'standard' | 'down') => {
        try {
            await invoke('set_app_setting', { key: 'round_off_strategy', value: strategy });
            setRoundOffStrategy(strategy);
            toast.success(
                strategy === 'down'
                    ? 'Rounding method set to Always Round Down.'
                    : 'Rounding method set to Standard Rounding (nearest rupee).'
            );
        } catch (err) {
            toast.error(String(err));
        }
    };

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-6 max-w-2xl">
            <h1 className="text-2xl font-semibold mb-1">Feature Settings</h1>
            <p className="text-muted-foreground text-sm mb-6">
                Enable or disable optional industry-specific modules for this company.
            </p>

            <div className="border rounded-lg divide-y bg-card">
                {/* Barcode Printing */}
                <div className="flex items-start gap-4 p-4">
                    <div className="mt-1 p-2 bg-primary/10 rounded-md">
                        <IconBarcode size={20} className="text-primary" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-medium">Barcode Label Printing</h3>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Enable barcode label printing for inventory vouchers (Opening Stock, Purchase Invoice).
                                    When enabled globally, barcode printing in voucher settings will be checked by default.
                                </p>
                            </div>
                            <Switch
                                checked={barcodePrintingEnabled}
                                onCheckedChange={toggleBarcodePrinting}
                                disabled={loading}
                                className="ml-4 shrink-0"
                            />
                        </div>
                        {barcodePrintingEnabled && (
                            <p className="text-xs text-green-600 mt-2 font-medium">
                                ✓ Enabled — Barcode printing active and defaulted in voucher settings
                            </p>
                        )}
                    </div>
                </div>

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

                {/* Auto Round Off Vouchers */}
                <div className="flex items-start gap-4 p-4">
                    <div className="mt-1 p-2 bg-primary/10 rounded-md">
                        <IconMathFunction size={20} className="text-primary" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-medium">Auto Round Off Vouchers (.00)</h3>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    Automatically round voucher grand totals to the nearest rupee (.00) so that totals
                                    and customer balances end cleanly in .00. The difference is automatically balanced
                                    via the Round Off (5013) ledger. Can still be checked, unchecked, or manually adjusted on individual vouchers.
                                </p>
                            </div>
                            <Switch
                                checked={autoRoundOffEnabled}
                                onCheckedChange={toggleAutoRoundOff}
                                disabled={loading}
                                className="ml-4 shrink-0"
                            />
                        </div>
                        {autoRoundOffEnabled && (
                            <div className="mt-4 pt-3 border-t space-y-2.5">
                                <div>
                                    <Label className="text-xs font-semibold text-foreground block">
                                        Rounding Method
                                    </Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Choose how voucher grand totals should be rounded to the rupee (.00):
                                    </p>
                                </div>
                                <RadioGroup
                                    value={roundOffStrategy}
                                    onValueChange={(val) => handleRoundOffStrategyChange(val as 'standard' | 'down')}
                                    className="grid gap-2.5 sm:grid-cols-2 pt-1"
                                >
                                    <div className={`flex items-start space-x-2.5 p-2.5 rounded-md border transition-colors cursor-pointer ${roundOffStrategy === 'standard' ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/40'}`}>
                                        <RadioGroupItem value="standard" id="round-standard" className="mt-0.5" />
                                        <Label htmlFor="round-standard" className="cursor-pointer text-xs space-y-0.5 leading-snug">
                                            <span className="font-medium block text-foreground">Standard Rounding</span>
                                            <span className="text-[11px] text-muted-foreground block">
                                                Nearest rupee (&lt; 0.50 rounds down, ≥ 0.50 rounds up)
                                            </span>
                                        </Label>
                                    </div>
                                    <div className={`flex items-start space-x-2.5 p-2.5 rounded-md border transition-colors cursor-pointer ${roundOffStrategy === 'down' ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/40'}`}>
                                        <RadioGroupItem value="down" id="round-down" className="mt-0.5" />
                                        <Label htmlFor="round-down" className="cursor-pointer text-xs space-y-0.5 leading-snug">
                                            <span className="font-medium block text-foreground">Always rounds down</span>
                                            <span className="text-[11px] text-muted-foreground block">
                                                Drops all paise (e.g. ₹ 1,234.90 → ₹ 1,234.00)
                                            </span>
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
        </div>
    );
}
