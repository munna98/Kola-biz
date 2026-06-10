import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { IconArrowUp, IconArrowDown, IconDeviceFloppy, IconCalendarStats, IconSortAscendingNumbers } from '@tabler/icons-react';


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
    skipToNextRowAfterQty?: boolean; // Skip to next row on enter after quantity
    skipToNextRowAfterProduct?: boolean; // After product selected, set qty=1 and jump to next row
    incrementQtyOnDuplicate?: boolean; // If same product is entered again, add 1 to existing row qty
    taxInclusive?: boolean; // Treat item rates as inclusive of GST
    updateRatesOnPurchase?: boolean; // Update product sales_rate & mrp at master level when saving purchase invoice
    updatePurchaseRate?: boolean;
    updateSalesRate?: boolean;
    updateMrp?: boolean;
    showProductInfoOnHover?: boolean; // Show Stock, P Rate, MRP on Sl No hover
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
    { id: 'gst_rate', label: 'GST%', defaultVisible: false },
    { id: 'cgst', label: 'CGST ₹', defaultVisible: false },
    { id: 'sgst', label: 'SGST ₹', defaultVisible: false },
    { id: 'igst', label: 'IGST ₹', defaultVisible: false },
    { id: 'total', label: 'Total', defaultVisible: true },
    { id: 'sales_rate', label: 'Sales Rate', defaultVisible: false, purchaseOnly: true },
    { id: 'mrp', label: 'MRP', defaultVisible: false, purchaseOnly: true },
] as const;

const VOUCHER_TYPES = [
    { value: 'sales_invoice', label: 'Sales Invoice' },
    { value: 'sales_quotation', label: 'Sales Quotation' },
    { value: 'purchase_invoice', label: 'Purchase Invoice' },
    { value: 'sales_return', label: 'Sales Return' },
    { value: 'purchase_return', label: 'Purchase Return' },
];

// Voucher types that support date-based renumbering (payment/receipt/journal excluded)
const REASSIGN_SUPPORTED_TYPES = [
    'sales_invoice',
    'sales_quotation',
    'purchase_invoice',
    'sales_return',
    'purchase_return',
];


export default function VoucherSettingsPage() {
    const [selectedVoucher, setSelectedVoucher] = useState('sales_invoice');
    const [columns, setColumns] = useState<ColumnSettings[]>([]);
    const [autoPrint, setAutoPrint] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(true);
    const [enableBarcodePrinting, setEnableBarcodePrinting] = useState(false);
    const [skipToNextRowAfterQty, setSkipToNextRowAfterQty] = useState(false);
    const [skipToNextRowAfterProduct, setSkipToNextRowAfterProduct] = useState(false);
    const [incrementQtyOnDuplicate, setIncrementQtyOnDuplicate] = useState(false);
    const [taxInclusive, setTaxInclusive] = useState(false);
    const [updateRatesOnPurchase, setUpdateRatesOnPurchase] = useState(false);
    const [updatePurchaseRate, setUpdatePurchaseRate] = useState(true);
    const [updateSalesRate, setUpdateSalesRate] = useState(true);
    const [updateMrp, setUpdateMrp] = useState(true);
    const [showProductInfoOnHover, setShowProductInfoOnHover] = useState(false);
    const [loading, setLoading] = useState(false);

    // ---- Reassign Voucher Numbers state ----
    const [reassigning, setReassigning] = useState(false);
    const [showReassignDialog, setShowReassignDialog] = useState(false);

    useEffect(() => {
        loadSettings(selectedVoucher);
    }, [selectedVoucher]);

    const getBaseDefaultValue = (colId: string, voucherType: string) => {
        if (colId === 'count') return 1;
        if (colId === 'deduction') {
            return (voucherType === 'purchase_invoice' || voucherType === 'purchase_return') ? 1.5 : 1.0;
        }
        return undefined;
    };

    const loadSettings = async (voucherType: string) => {
        setLoading(true);
        try {
            const savedSettings = await invoke<VoucherSettings | null>('get_voucher_settings', { voucherType });

            let initialColumns: ColumnSettings[] = [];

            // Columns available for the current voucher type
            const availableCols = AVAILABLE_COLUMNS.filter(
                col => !('purchaseOnly' in col && col.purchaseOnly) || voucherType === 'purchase_invoice'
            );

            if (savedSettings && savedSettings.columns) {
                // Set Auto Print and Payment Modal
                setAutoPrint(savedSettings.autoPrint || false);
                setShowPaymentModal(savedSettings.showPaymentModal !== false); // Default true
                setEnableBarcodePrinting(savedSettings.enableBarcodePrinting || false);
                setSkipToNextRowAfterQty(savedSettings.skipToNextRowAfterQty || false);
                setSkipToNextRowAfterProduct(savedSettings.skipToNextRowAfterProduct || false);
                setIncrementQtyOnDuplicate(savedSettings.incrementQtyOnDuplicate || false);
                setTaxInclusive(savedSettings.taxInclusive || false);
                setUpdateRatesOnPurchase(savedSettings.updateRatesOnPurchase || false);
                setUpdatePurchaseRate(savedSettings.updatePurchaseRate !== false);
                setUpdateSalesRate(savedSettings.updateSalesRate !== false);
                setUpdateMrp(savedSettings.updateMrp !== false);
                setShowProductInfoOnHover(savedSettings.showProductInfoOnHover || false);

                // Merge saved settings with available columns (in case new columns were added to code)
                // This logic ensures we respect saved order and visibility, but also add new columns at the end
                const savedMap = new Map(savedSettings.columns.map(c => [c.id, c]));

                // 1. Add saved columns that still exist in availableCols
                savedSettings.columns.forEach(savedCol => {
                    const baseCol = availableCols.find(c => c.id === savedCol.id);
                    if (baseCol) {
                        initialColumns.push({
                            ...savedCol,
                            // If savedCol doesn't have a defaultValue, try to get the base default
                            defaultValue: savedCol.defaultValue !== undefined && savedCol.defaultValue !== "" 
                                ? savedCol.defaultValue 
                                : getBaseDefaultValue(savedCol.id, voucherType)
                        });
                    }
                });

                // 2. Add any new columns from availableCols that weren't in saved settings
                availableCols.forEach(col => {
                    if (!savedMap.has(col.id)) {
                        initialColumns.push({
                            id: col.id,
                            label: col.label,
                            visible: col.defaultVisible,
                            defaultValue: getBaseDefaultValue(col.id, voucherType),
                            order: initialColumns.length // append to end
                        });
                    }
                });

            } else {
                setAutoPrint(voucherType === 'sales_invoice');
                setShowPaymentModal(true);
                setEnableBarcodePrinting(false);
                setSkipToNextRowAfterQty(false);
                setSkipToNextRowAfterProduct(false);
                setIncrementQtyOnDuplicate(false);
                setTaxInclusive(false);
                setUpdateRatesOnPurchase(false);
                setUpdatePurchaseRate(true);
                setUpdateSalesRate(true);
                setUpdateMrp(true);
                setShowProductInfoOnHover(false);
                initialColumns = availableCols.map((col, index) => ({
                    id: col.id,
                    label: col.label,
                    visible: col.defaultVisible,
                    defaultValue: getBaseDefaultValue(col.id, voucherType),
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
                enableBarcodePrinting: enableBarcodePrinting,
                skipToNextRowAfterQty: skipToNextRowAfterQty,
                skipToNextRowAfterProduct: skipToNextRowAfterProduct,
                incrementQtyOnDuplicate: incrementQtyOnDuplicate,
                taxInclusive: taxInclusive,
                updateRatesOnPurchase: updateRatesOnPurchase,
                updatePurchaseRate: updatePurchaseRate,
                updateSalesRate: updateSalesRate,
                updateMrp: updateMrp,
                showProductInfoOnHover: showProductInfoOnHover,
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

    const handleReassignVoucherNumbers = async () => {
        setReassigning(true);
        try {
            const count = await invoke<number>('reassign_voucher_numbers', {
                voucherType: selectedVoucher,
            });
            toast.success(
                count === 0
                    ? 'No vouchers found in the current financial year'
                    : `${count} voucher${count !== 1 ? 's' : ''} renumbered by invoice date`
            );
            setShowReassignDialog(false);
        } catch (error) {
            toast.error(`Failed to reassign: ${error}`);
        } finally {
            setReassigning(false);
        }
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
                                    When disabled, Cash invoices are auto-paid and other party invoices remain unpaid.
                                </p>
                            </div>
                        </div>

                        {selectedVoucher === 'purchase_invoice' && (
                            <>
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

                                <div className="flex items-start gap-4 mb-6">
                                    <Checkbox
                                        id="update-rates-on-purchase"
                                        checked={updateRatesOnPurchase}
                                        onCheckedChange={(checked) => setUpdateRatesOnPurchase(checked as boolean)}
                                        className="mt-1"
                                    />
                                    <div className="grid gap-1.5 leading-none w-full">
                                        <label
                                            htmlFor="update-rates-on-purchase"
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                        >
                                            Update Rates on Purchase
                                        </label>
                                        <p className="text-sm text-muted-foreground">
                                            When saving a purchase invoice, automatically update product rates at the master level.
                                        </p>

                                        {updateRatesOnPurchase && (
                                            <div className="flex flex-col gap-3 mt-3 ml-1 p-3 bg-muted/30 rounded-md border">
                                                <div className="flex items-center gap-3">
                                                    <Checkbox
                                                        id="update-purchase-rate"
                                                        checked={updatePurchaseRate}
                                                        onCheckedChange={(checked) => setUpdatePurchaseRate(checked as boolean)}
                                                    />
                                                    <label htmlFor="update-purchase-rate" className="text-sm font-medium cursor-pointer leading-none">
                                                        Update Purchase Rate
                                                    </label>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Checkbox
                                                        id="update-sales-rate"
                                                        checked={updateSalesRate}
                                                        onCheckedChange={(checked) => setUpdateSalesRate(checked as boolean)}
                                                    />
                                                    <label htmlFor="update-sales-rate" className="text-sm font-medium cursor-pointer leading-none">
                                                        Update Sales Rate
                                                    </label>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Checkbox
                                                        id="update-mrp"
                                                        checked={updateMrp}
                                                        onCheckedChange={(checked) => setUpdateMrp(checked as boolean)}
                                                    />
                                                    <label htmlFor="update-mrp" className="text-sm font-medium cursor-pointer leading-none">
                                                        Update MRP
                                                    </label>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="flex items-center gap-4 mb-4">
                            <Checkbox
                                id="skip-next-row-qty"
                                checked={skipToNextRowAfterQty}
                                onCheckedChange={(checked) => setSkipToNextRowAfterQty(checked as boolean)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="skip-next-row-qty"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Skip to Next Row After Quantity
                                </label>
                                <p className="text-sm text-muted-foreground">
                                    Pressing Enter on the Quantity field will immediately add/jump to the next row.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mb-4">
                            <Checkbox
                                id="skip-next-row-product"
                                checked={skipToNextRowAfterProduct}
                                onCheckedChange={(checked) => setSkipToNextRowAfterProduct(checked as boolean)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="skip-next-row-product"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Skip to Next Row After Product
                                </label>
                                <p className="text-sm text-muted-foreground">
                                    After selecting a product, automatically set Qty to 1 and jump to the next row (ideal for barcode scanning workflows).
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mb-6">
                            <Checkbox
                                id="increment-qty-duplicate"
                                checked={incrementQtyOnDuplicate}
                                onCheckedChange={(checked) => setIncrementQtyOnDuplicate(checked as boolean)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="increment-qty-duplicate"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Increment Qty on Duplicate Item
                                </label>
                                <p className="text-sm text-muted-foreground">
                                    If the same product is selected again (e.g. via barcode scan), add 1 to the existing row's quantity instead of creating a new row.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mb-6">
                            <Checkbox
                                id="tax-inclusive"
                                checked={taxInclusive}
                                onCheckedChange={(checked) => setTaxInclusive(checked as boolean)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="tax-inclusive"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Tax Inclusive Pricing
                                </label>
                                <p className="text-sm text-muted-foreground">
                                    When enabled, item rates are treated as inclusive of tax. The system will reverse-calculate the base price.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mb-6">
                            <Checkbox
                                id="show-product-info-hover"
                                checked={showProductInfoOnHover}
                                onCheckedChange={(checked) => setShowProductInfoOnHover(checked as boolean)}
                            />
                            <div className="grid gap-1.5 leading-none">
                                <label
                                    htmlFor="show-product-info-hover"
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                    Show Product Info on Sl No Hover
                                </label>
                                <p className="text-sm text-muted-foreground">
                                    Hovering over the serial number will display Stock, Purchase Rate, and MRP for the product in that row.
                                </p>
                            </div>
                        </div>

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

                    {/* ---- Reassign Voucher Numbers Section ---- */}
                    {REASSIGN_SUPPORTED_TYPES.includes(selectedVoucher) && (
                        <div className="bg-card border rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <IconSortAscendingNumbers className="h-5 w-5 text-amber-500" />
                                <h3 className="text-base font-semibold">Reassign Voucher Numbers by Invoice Date</h3>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">
                                Re-numbers all{' '}
                                <strong>{VOUCHER_TYPES.find(v => v.value === selectedVoucher)?.label}</strong>{' '}
                                vouchers within the <strong>current financial year</strong> sequentially by invoice
                                date (oldest first), using the current prefix/suffix format. Useful when vouchers
                                were entered out of date order.
                            </p>

                            <div className="flex items-center gap-3 mb-3">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
                                    <IconCalendarStats size={13} />
                                    {(() => {
                                        const now = new Date();
                                        const m = now.getMonth() + 1;
                                        const y = now.getFullYear();
                                        const s = m >= 4 ? y : y - 1;
                                        return `${s}-04-01  →  ${s + 1}-03-31`;
                                    })()}
                                </div>
                                <Button
                                    variant="outline"
                                    className="border-amber-500 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950"
                                    onClick={() => setShowReassignDialog(true)}
                                    disabled={reassigning}
                                >
                                    <IconSortAscendingNumbers className="mr-2 h-4 w-4" />
                                    Reassign Voucher Numbers
                                </Button>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                ⚠️ This is irreversible. Only vouchers in the current financial year are affected.
                            </p>
                        </div>
                    )}

                </div>
            </div>

            {/* ---- Reassign Confirmation Dialog ---- */}
            <AlertDialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <IconSortAscendingNumbers className="h-5 w-5 text-amber-500" />
                            Reassign Voucher Numbers?
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2 text-sm">
                                <p>
                                    This will permanently renumber all{' '}
                                    <strong>
                                        {VOUCHER_TYPES.find(v => v.value === selectedVoucher)?.label}
                                    </strong>{' '}
                                    vouchers in the <strong>current financial year</strong> in invoice date
                                    order (oldest → newest).
                                </p>
                                <p className="text-amber-600 dark:text-amber-400 font-medium">
                                    Previously printed invoices with old numbers will be outdated.
                                </p>
                                <p className="font-semibold text-destructive">This action cannot be undone.</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={reassigning}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleReassignVoucherNumbers}
                            disabled={reassigning}
                            className="bg-amber-500 hover:bg-amber-600 text-white"
                        >
                            {reassigning ? 'Renumbering…' : 'Confirm Reassign'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
