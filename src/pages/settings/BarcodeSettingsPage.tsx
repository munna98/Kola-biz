import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconDeviceFloppy } from '@tabler/icons-react';

export interface BarcodeSettings {
    companyName: string;
    showProductName: boolean;
    showSalesRate: boolean;
    customText: string;
    barcodeFormat: 'CODE128' | 'EAN13' | 'QR';
    labelSize: '50x25' | '40x25' | '40x20' | '30x15';
}

const DEFAULT_SETTINGS: BarcodeSettings = {
    companyName: '',
    showProductName: true,
    showSalesRate: true,
    customText: '',
    barcodeFormat: 'CODE128',
    labelSize: '50x25',
};

const BARCODE_FORMATS = [
    { value: 'CODE128', label: 'CODE128 (Alphanumeric)' },
    { value: 'EAN13', label: 'EAN-13 (Numeric Only)' },
    { value: 'QR', label: 'QR Code' },
];

const LABEL_SIZES = [
    { value: '50x25', label: '50 × 25 mm' },
    { value: '40x25', label: '40 × 25 mm' },
    { value: '40x20', label: '40 × 20 mm' },
    { value: '30x15', label: '30 × 15 mm' },
];

export default function BarcodeSettingsPage() {
    const [settings, setSettings] = useState<BarcodeSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const saved = await invoke<string | null>('get_app_setting', { key: 'barcode_settings' });
            if (saved) {
                const parsed = JSON.parse(saved);
                setSettings({ ...DEFAULT_SETTINGS, ...parsed });
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

    const updateSetting = <K extends keyof BarcodeSettings>(key: K, value: BarcodeSettings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="h-full flex flex-col bg-background">
            <div className="flex justify-between items-center p-6 border-b shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Barcode Settings</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Configure barcode label appearance
                    </p>
                </div>
                <Button onClick={handleSave} disabled={loading}>
                    <IconDeviceFloppy className="mr-2 h-4 w-4" />
                    Save Settings
                </Button>
            </div>

            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-2xl mx-auto space-y-6">
                    <div className="bg-card border rounded-lg p-6 space-y-6">
                        <h3 className="text-lg font-medium">Label Content</h3>

                        {/* Company Name */}
                        <div className="space-y-2">
                            <Label htmlFor="companyName">Company Name</Label>
                            <Input
                                id="companyName"
                                value={settings.companyName}
                                onChange={(e) => updateSetting('companyName', e.target.value)}
                                placeholder="Enter company name to display on labels"
                            />
                            <p className="text-sm text-muted-foreground">
                                Displayed at the top of each label
                            </p>
                        </div>

                        {/* Show Product Name */}
                        <div className="flex items-center gap-4">
                            <Checkbox
                                id="showProductName"
                                checked={settings.showProductName}
                                onCheckedChange={(checked) => updateSetting('showProductName', checked as boolean)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label htmlFor="showProductName" className="text-sm font-medium leading-none">
                                    Show Product Name
                                </label>
                                <p className="text-sm text-muted-foreground">
                                    Display product name below the barcode
                                </p>
                            </div>
                        </div>

                        {/* Show Sales Rate */}
                        <div className="flex items-center gap-4">
                            <Checkbox
                                id="showSalesRate"
                                checked={settings.showSalesRate}
                                onCheckedChange={(checked) => updateSetting('showSalesRate', checked as boolean)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label htmlFor="showSalesRate" className="text-sm font-medium leading-none">
                                    Show Sales Rate
                                </label>
                                <p className="text-sm text-muted-foreground">
                                    Display price on the label
                                </p>
                            </div>
                        </div>

                        {/* Custom Text */}
                        <div className="space-y-2">
                            <Label htmlFor="customText">Custom Text</Label>
                            <Input
                                id="customText"
                                value={settings.customText}
                                onChange={(e) => updateSetting('customText', e.target.value)}
                                placeholder="Optional additional text"
                            />
                            <p className="text-sm text-muted-foreground">
                                Additional text displayed at the bottom of the label
                            </p>
                        </div>
                    </div>

                    <div className="bg-card border rounded-lg p-6 space-y-6">
                        <h3 className="text-lg font-medium">Label Format</h3>

                        {/* Barcode Format */}
                        <div className="space-y-2">
                            <Label>Barcode Format</Label>
                            <Select
                                value={settings.barcodeFormat}
                                onValueChange={(value) => updateSetting('barcodeFormat', value as BarcodeSettings['barcodeFormat'])}
                            >
                                <SelectTrigger className="w-[280px]">
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
                            <p className="text-sm text-muted-foreground">
                                CODE128 works with any text. EAN-13 requires 12-13 digit numbers.
                            </p>
                        </div>

                        {/* Label Size */}
                        <div className="space-y-2">
                            <Label>Label Size</Label>
                            <Select
                                value={settings.labelSize}
                                onValueChange={(value) => updateSetting('labelSize', value as BarcodeSettings['labelSize'])}
                            >
                                <SelectTrigger className="w-[280px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {LABEL_SIZES.map(size => (
                                        <SelectItem key={size.value} value={size.value}>
                                            {size.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
