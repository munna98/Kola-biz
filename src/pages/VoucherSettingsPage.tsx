import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconArrowUp, IconArrowDown, IconDeviceFloppy } from '@tabler/icons-react';


interface ColumnSettings {
    id: string;
    label: string;
    visible: boolean;
    order: number;
    defaultValue?: string | number;
    width?: string;
}

interface VoucherSettings {
    columns: ColumnSettings[];
    autoPrint?: boolean;
    showPaymentModal?: boolean; // Default true - when false, Cash Sale auto-pays, others stay unpaid
    enableBarcodePrinting?: boolean; // Show barcode print button in print preview
}

const AVAILABLE_COLUMNS = [
    { id: 'product', label: 'Product', defaultVisible: true },
    { id: 'quantity', label: 'Qty', defaultVisible: true },
    { id: 'unit', label: 'Unit', defaultVisible: true },
    { id: 'rate', label: 'Rate', defaultVisible: true },
    { id: 'count', label: 'Count', defaultVisible: true },
    { id: 'deduction', label: 'Deduction', defaultVisible: true },
    { id: 'final_qty', label: 'Final Qty', defaultVisible: true },
    { id: 'amount', label: 'Amount', defaultVisible: true },
    { id: 'discount_percent', label: 'Disc %', defaultVisible: false },
    { id: 'discount_amount', label: 'Disc', defaultVisible: false },
    { id: 'tax_rate', label: 'Tax %', defaultVisible: false },
    { id: 'total', label: 'Total', defaultVisible: true },
];

const VOUCHER_TYPES = [
    { value: 'sales_invoice', label: 'Sales Invoice' },
    { value: 'purchase_invoice', label: 'Purchase Invoice' },
    { value: 'sales_return', label: 'Sales Return' },
    { value: 'purchase_return', label: 'Purchase Return' },
];

export default function VoucherSettingsPage() {
    const [selectedVoucher, setSelectedVoucher] = useState('sales_invoice');
    const [columns, setColumns] = useState<ColumnSettings[]>([]);
    const [autoPrint, setAutoPrint] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(true);
    const [enableBarcodePrinting, setEnableBarcodePrinting] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadSettings(selectedVoucher);
    }, [selectedVoucher]);

    const loadSettings = async (voucherType: string) => {
        setLoading(true);
        try {
            const savedSettings = await invoke<VoucherSettings | null>('get_voucher_settings', { voucherType });

            let initialColumns: ColumnSettings[] = [];

            if (savedSettings && savedSettings.columns) {
                // Set Auto Print and Payment Modal
                setAutoPrint(savedSettings.autoPrint || false);
                setShowPaymentModal(savedSettings.showPaymentModal !== false); // Default true
                setEnableBarcodePrinting(savedSettings.enableBarcodePrinting || false);

                // Merge saved settings with available columns (in case new columns were added to code)
                // This logic ensures we respect saved order and visibility, but also add new columns at the end
                const savedMap = new Map(savedSettings.columns.map(c => [c.id, c]));

                // 1. Add saved columns that still exist in AVAILABLE_COLUMNS
                savedSettings.columns.forEach(savedCol => {
                    if (AVAILABLE_COLUMNS.some(c => c.id === savedCol.id)) {
                        initialColumns.push(savedCol);
                    }
                });

                // 2. Add any new columns from AVAILABLE_COLUMNS that weren't in saved settings
                AVAILABLE_COLUMNS.forEach(col => {
                    if (!savedMap.has(col.id)) {
                        initialColumns.push({
                            id: col.id,
                            label: col.label,
                            visible: col.defaultVisible,
                            order: initialColumns.length // append to end
                        });
                    }
                });

            } else {
                // No saved settings, use defaults
                setAutoPrint(voucherType === 'sales_invoice');
                setShowPaymentModal(true);
                setEnableBarcodePrinting(false);
                initialColumns = AVAILABLE_COLUMNS.map((col, index) => ({
                    id: col.id,
                    label: col.label,
                    visible: col.defaultVisible,
                    order: index
                }));
            }

            setColumns(initialColumns);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const settings: VoucherSettings = {
                columns: columns,
                autoPrint: autoPrint,
                showPaymentModal: showPaymentModal,
                enableBarcodePrinting: enableBarcodePrinting
            };
            await invoke('save_voucher_settings', { voucherType: selectedVoucher, settings });
            toast.success('Settings saved successfully');
        } catch (error) {
            console.error(error);
            toast.error('Failed to save settings');
        } finally {
            setLoading(false);
        }
    };

    const moveColumn = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === columns.length - 1) return;

        const newColumns = [...columns];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        // Swap
        [newColumns[index], newColumns[targetIndex]] = [newColumns[targetIndex], newColumns[index]];

        // Update order property
        newColumns.forEach((col, idx) => col.order = idx);

        setColumns(newColumns);
    };

    const toggleVisibility = (index: number) => {
        const newColumns = [...columns];
        newColumns[index].visible = !newColumns[index].visible;
        setColumns(newColumns);
    };

    const updateLabel = (index: number, newLabel: string) => {
        const newColumns = [...columns];
        newColumns[index].label = newLabel;
        setColumns(newColumns);
    };

    const updateDefaultValue = (index: number, newVal: string) => {
        const newColumns = [...columns];
        newColumns[index].defaultValue = newVal;
        setColumns(newColumns);
    };

    return (
        <div className="h-full flex flex-col bg-background">
            <div className="flex justify-between items-center p-6 border-b shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Voucher Settings</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Configure voucher columns and defaults
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="w-[200px]">
                        <Select value={selectedVoucher} onValueChange={setSelectedVoucher}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {VOUCHER_TYPES.map(type => (
                                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button onClick={handleSave} disabled={loading}>
                        <IconDeviceFloppy className="mr-2 h-4 w-4" />
                        Save Settings
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-4xl mx-auto space-y-6">

                    <div className="bg-card border rounded-lg p-4">
                        <div className="flex items-center gap-4 mb-4">
                            <Checkbox
                                id="auto-print"
                                checked={autoPrint}
                                onCheckedChange={(checked) => setAutoPrint(checked as boolean)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="auto-print"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Auto Print on Save
                                </label>
                                <p className="text-sm text-muted-foreground">
                                    Automatically open print preview after saving a new voucher.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mb-6">
                            <Checkbox
                                id="show-payment-modal"
                                checked={showPaymentModal}
                                onCheckedChange={(checked) => setShowPaymentModal(checked as boolean)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="show-payment-modal"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Show Payment Modal on Save
                                </label>
                                <p className="text-sm text-muted-foreground">
                                    When disabled, Cash Sale invoices are auto-paid and other party invoices remain unpaid.
                                </p>
                            </div>
                        </div>

                        {selectedVoucher === 'purchase_invoice' && (
                            <div className="flex items-center gap-4 mb-6">
                                <Checkbox
                                    id="enable-barcode"
                                    checked={enableBarcodePrinting}
                                    onCheckedChange={(checked) => setEnableBarcodePrinting(checked as boolean)}
                                />
                                <div className="grid gap-1.5 leading-none">
                                    <label
                                        htmlFor="enable-barcode"
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        Enable Barcode Printing
                                    </label>
                                    <p className="text-sm text-muted-foreground">
                                        Show "Print Labels" button in print preview for this voucher type.
                                    </p>
                                </div>
                            </div>
                        )}

                        <h3 className="text-lg font-medium mb-4">Column Configuration</h3>
                        <div className="space-y-2">
                            {/* Header Row */}
                            <div className="grid grid-cols-12 gap-4 pb-2 border-b text-sm font-medium text-muted-foreground px-2">
                                <div className="col-span-1">Visible</div>
                                <div className="col-span-1">Order</div>
                                <div className="col-span-3">Column Name</div>
                                <div className="col-span-3">Display Label</div>
                                <div className="col-span-3">Default Value</div>
                            </div>

                            {/* Rows */}
                            {columns.map((col, index) => (
                                <div key={col.id} className="grid grid-cols-12 gap-4 items-center p-2 hover:bg-muted/50 rounded-md">
                                    <div className="col-span-1 flex justify-center">
                                        <Checkbox
                                            checked={col.visible}
                                            onCheckedChange={() => toggleVisibility(index)}
                                        />
                                    </div>
                                    <div className="col-span-1 flex gap-1">
                                        <Button
                                            variant="ghost" size="icon" className="h-6 w-6"
                                            onClick={() => moveColumn(index, 'up')}
                                            disabled={index === 0}
                                        >
                                            <IconArrowUp size={14} />
                                        </Button>
                                        <Button
                                            variant="ghost" size="icon" className="h-6 w-6"
                                            onClick={() => moveColumn(index, 'down')}
                                            disabled={index === columns.length - 1}
                                        >
                                            <IconArrowDown size={14} />
                                        </Button>
                                    </div>
                                    <div className="col-span-3 text-sm font-medium">
                                        {AVAILABLE_COLUMNS.find(c => c.id === col.id)?.label || col.id}
                                    </div>
                                    <div className="col-span-3">
                                        <Input
                                            value={col.label}
                                            onChange={(e) => updateLabel(index, e.target.value)}
                                            className="h-8 text-sm"
                                        />
                                    </div>
                                    <div className="col-span-3">
                                        <Input
                                            value={col.defaultValue || ''}
                                            onChange={(e) => updateDefaultValue(index, e.target.value)}
                                            placeholder="Optional"
                                            className="h-8 text-sm"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>



                </div>
            </div>
        </div>
    );
}
