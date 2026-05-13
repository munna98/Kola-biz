import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconDeviceFloppy, IconPackages } from '@tabler/icons-react';
import BarcodeLabelDesigner, {
    type BarcodeDesignerSettings,
    DEFAULT_DESIGNER_SETTINGS,
    migrateSettings,
} from '@/components/barcode/BarcodeLabelDesigner';

// Re-export for backward compatibility with BarcodeLabelDialog
export type { BarcodeDesignerSettings as BarcodeSettings } from '@/components/barcode/BarcodeLabelDesigner';

const BARCODE_FORMATS = [
    { value: 'CODE128', label: 'CODE128 (Alphanumeric)' },
    { value: 'EAN13', label: 'EAN-13 (Numeric Only)' },
    { value: 'QR', label: 'QR Code' },
];

export default function BarcodeSettingsPage() {
    const [settings, setSettings] = useState<BarcodeDesignerSettings>(DEFAULT_DESIGNER_SETTINGS);
    const [loading, setLoading] = useState(false);
    const [printers, setPrinters] = useState<string[]>([]);
    const [masterProductsEnabled, setMasterProductsEnabled] = useState(false);
    const [savingMaster, setSavingMaster] = useState(false);

    useEffect(() => {
        loadSettings();
        loadPrinters();
        invoke<string | null>('get_app_setting', { key: 'enable_master_products' })
            .then(v => setMasterProductsEnabled(v === 'true'))
            .catch(console.error);
    }, []);

    const loadPrinters = async () => {
        try {
            const printerList = await invoke<string[]>('get_system_printers');
            setPrinters(printerList);
        } catch (error) {
            console.error('Failed to load printers:', error);
        }
    };

    const loadSettings = async () => {
        setLoading(true);
        try {
            const saved = await invoke<string | null>('get_app_setting', { key: 'barcode_settings' });
            if (saved) {
                const parsed = JSON.parse(saved);
                setSettings(migrateSettings(parsed));
            }
        } catch (error) {
            console.error('Failed to load barcode settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await invoke('set_app_setting', {
                key: 'barcode_settings',
                value: JSON.stringify(settings),
            });
            toast.success('Barcode settings saved');
        } catch (error) {
            console.error('Failed to save barcode settings:', error);
            toast.error('Failed to save settings');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleMasterProducts = async (enabled: boolean) => {
        setSavingMaster(true);
        try {
            await invoke('set_app_setting', {
                key: 'enable_master_products',
                value: enabled ? 'true' : 'false',
            });
            setMasterProductsEnabled(enabled);
            toast.success(enabled ? 'Master Products enabled' : 'Master Products disabled');
        } catch (error) {
            toast.error('Failed to update setting');
        } finally {
            setSavingMaster(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-background">
            <div className="flex justify-between items-center p-6 border-b shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Barcode Settings</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Design barcode label layout with drag-and-drop
                    </p>
                </div>
                <Button onClick={handleSave} disabled={loading}>
                    <IconDeviceFloppy className="mr-2 h-4 w-4" />
                    Save Settings
                </Button>
            </div>

            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-5xl mx-auto space-y-6">

                    {/* ── Master Products Feature Flag ── */}
                    <div className="bg-card border rounded-lg p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <IconPackages size={20} className="text-amber-600 dark:text-amber-400" />
                            <h3 className="text-lg font-medium">Master Products</h3>
                            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                Textile / Apparel
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Enable this for retail textile businesses. When a master product (e.g. &quot;Shirt&quot;) is
                            added to a purchase invoice, the system automatically creates a child batch with a
                            unique sequential item code per purchase line — ready for barcode label printing.
                        </p>
                        <div className="flex items-center gap-3 pt-1">
                            <Switch
                                id="enable-master-products"
                                checked={masterProductsEnabled}
                                onCheckedChange={handleToggleMasterProducts}
                                disabled={savingMaster}
                            />
                            <Label htmlFor="enable-master-products" className="cursor-pointer">
                                {masterProductsEnabled ? 'Master Products Enabled' : 'Master Products Disabled'}
                            </Label>
                        </div>
                        {masterProductsEnabled && (
                            <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                                <p>✓ &quot;Is Master Product&quot; toggle visible in the Add Product form.</p>
                                <p>✓ Sales Rate &amp; MRP columns shown in Purchase Invoice for master items.</p>
                                <p>✓ Master / Child Batch filters shown in the Products list.</p>
                            </div>
                        )}
                    </div>

                    {/* ── Barcode Format + Printer ── */}
                    <div className="bg-card border rounded-lg p-6">
                        <div className="flex flex-wrap gap-6">
                            {/* Barcode Format */}
                            <div className="space-y-2">
                                <Label>Barcode Format</Label>
                                <Select
                                    value={settings.barcodeFormat}
                                    onValueChange={(value) => setSettings(prev => ({ ...prev, barcodeFormat: value as BarcodeDesignerSettings['barcodeFormat'] }))}
                                >
                                    <SelectTrigger className="w-[240px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {BARCODE_FORMATS.map(format => (
                                            <SelectItem key={format.value} value={format.value}>
                                                {format.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    CODE128 works with any text. EAN-13 requires 12-13 digit numbers.
                                </p>
                            </div>

                            {/* Barcode Printer */}
                            <div className="space-y-2">
                                <Label>Barcode Printer</Label>
                                <Select
                                    value={settings.barcodePrinter || ''}
                                    onValueChange={(value) => setSettings(prev => ({ ...prev, barcodePrinter: value }))}
                                    disabled={!printers.length}
                                >
                                    <SelectTrigger className="w-[240px]">
                                        <SelectValue placeholder={printers.length ? "Select a barcode printer" : "No printers found"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {printers.map((printer) => (
                                            <SelectItem key={printer} value={printer}>
                                                {printer}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Select the printer to use for barcode labels
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ── Label Designer ── */}
                    <div className="bg-card border rounded-lg p-6">
                        <h3 className="text-lg font-medium mb-4">Label Designer</h3>
                        <BarcodeLabelDesigner
                            settings={settings}
                            onChange={setSettings}
                        />
                    </div>

                    {/* ── Roll / Sheet Layout ── */}
                    <div className="bg-card border rounded-lg p-6">
                        <h3 className="text-lg font-medium mb-1">Roll / Sheet Layout</h3>
                        <p className="text-xs text-muted-foreground mb-4">
                            If your roll is wider than one label, set columns &gt; 1 to print side by side.
                        </p>
                        <div className="flex flex-wrap gap-6">
                            <div className="space-y-2">
                                <Label>Columns per Row</Label>
                                <Input
                                    type="number" min={1} max={6} step={1}
                                    value={settings.columnsPerRow}
                                    onChange={e => setSettings(prev => ({ ...prev, columnsPerRow: Math.max(1, parseInt(e.target.value) || 1) }))}
                                    className="w-20"
                                />
                                <p className="text-xs text-muted-foreground">
                                    How many labels fit across the roll width
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Horizontal Gap (mm)</Label>
                                <Input
                                    type="number" min={0} max={20} step={0.5}
                                    value={settings.horizontalGap}
                                    onChange={e => setSettings(prev => ({ ...prev, horizontalGap: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                    className="w-20"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Gap between labels in same row
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Vertical Gap (mm)</Label>
                                <Input
                                    type="number" min={0} max={20} step={0.5}
                                    value={settings.verticalGap}
                                    onChange={e => setSettings(prev => ({ ...prev, verticalGap: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                    className="w-20"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Gap between rows of labels
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
