import React, { useMemo, useRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconTrash, IconPlus } from '@tabler/icons-react';
import { VoucherItemsTable } from '@/components/voucher/VoucherItemsTable';
import { useVoucherRowNavigation } from '@/hooks/useVoucherRowNavigation';
import { cn } from '@/lib/utils';
import { getDefaultProductUnitId, type ProductUnitDefaultKind } from '@/lib/product-units';
import type { GstTaxSlab, Product as TauriProduct } from '@/lib/tauri';

const QuantityInput = React.forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>(({ value, onChange, onKeyDown, onBlur, onFocus, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const [localValue, setLocalValue] = React.useState(
        value ? Number(value).toFixed(3) : ''
    );

    React.useEffect(() => {
        if (!isFocused) {
            setLocalValue(value ? Number(value).toFixed(3) : '');
        }
    }, [value, isFocused]);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        setLocalValue(value !== undefined && value !== null ? String(value) : '');
        onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        setLocalValue(e.target.value ? Number(e.target.value).toFixed(3) : '');
        onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalValue(e.target.value);
        onChange?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        onKeyDown?.(e);
        if (e.key === 'Enter' && !e.isDefaultPrevented()) {
             setLocalValue(e.currentTarget.value ? Number(e.currentTarget.value).toFixed(3) : '');
        }
    };

    return (
        <Input
            ref={ref}
            type="number"
            value={localValue}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            {...props}
        />
    );
});
QuantityInput.displayName = 'QuantityInput';

interface RateCellProps {
    rate: number;
    exTaxRate: number;
    taxInclusive: boolean;
    resolvedGstRate: number;
    isReadOnly: boolean;
    onChange: (val: string) => void;
}

const RateCell = React.forwardRef<HTMLInputElement, RateCellProps>(({ rate, exTaxRate, taxInclusive, resolvedGstRate, isReadOnly, onChange }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);
    // When focused: show real stored (inclusive) rate for editing
    // When blurred:  show ex-tax rate (reverse-calculated) for clarity
    const displayValue = isFocused
        ? (rate || '')
        : (taxInclusive && resolvedGstRate > 0 ? Number(exTaxRate.toFixed(4)) || '' : rate || '');

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        // Defer select() so it runs after React re-renders the inclusive rate value
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
    };

    return (
        <Input
            ref={ref}
            data-field="rate"
            type="number"
            value={displayValue}
            onFocus={handleFocus}
            onBlur={() => setIsFocused(false)}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 text-xs text-right font-mono"
            placeholder="0.00"
            step="0.01"
            disabled={isReadOnly}
            title={taxInclusive && resolvedGstRate > 0 ? `Inclusive rate: ${rate}  |  Ex-tax: ${exTaxRate.toFixed(2)}` : undefined}
        />
    );
});
RateCell.displayName = 'RateCell';

interface Product {
    id: string;
    code: string;
    name: string;
    barcode?: string;
    unit_id: string;
    purchase_rate?: number;
    sales_rate?: number;
}

interface Unit {
    id: string;
    name: string;
    symbol: string;
}

interface ItemAmount {
    finalQty: number;
    amount: number;
    taxAmount: number;
    total: number;
}

export interface ColumnSettings {
    id: string;
    label: string;
    visible: boolean;
    order: number;
    defaultValue?: string | number;
    width?: string;
}

export interface VoucherItemsSectionProps {
    items: any[];
    products: Product[];
    productUnitsByProduct?: Record<string, any[]>;
    units: Unit[];
    isReadOnly: boolean;
    onAddItem: (index?: number) => void;
    onRemoveItem: (index: number) => void;
    onUpdateItem: (index: number, field: string, value: any) => void;
    getItemAmount: (item: any) => ItemAmount;
    header?: React.ReactNode;
    addItemLabel?: string;
    disableAdd?: boolean;
    settings?: { columns: ColumnSettings[], skipToNextRowAfterQty?: boolean };
    footerRightContent?: React.ReactNode;
    onProductCreate?: (name: string, rowIndex: number) => void;
    onSectionExit?: () => void;
    defaultUnitKind?: ProductUnitDefaultKind;
    gstSlabs?: GstTaxSlab[];
    fullProducts?: TauriProduct[];
    taxInclusive?: boolean;
}
export interface VoucherItemsSectionRef {
    focusFirstProduct: () => void;
}

const DEFAULT_COLUMNS: ColumnSettings[] = [
    { id: 'sl_no', label: '#', visible: true, order: -1 },
    { id: 'product', label: 'Product', visible: true, order: 0 },
    { id: 'quantity', label: 'Qty', visible: true, order: 1 },
    { id: 'unit', label: 'Unit', visible: true, order: 2 },
    { id: 'rate', label: 'Rate', visible: true, order: 3 },
    { id: 'count', label: 'Count', visible: true, order: 4 },
    { id: 'deduction', label: 'Deduction', visible: true, order: 5 },
    { id: 'final_qty', label: 'Final Qty', visible: true, order: 6 },
    { id: 'amount', label: 'Amount', visible: true, order: 7 },
    { id: 'discount_percent', label: 'Disc %', visible: false, order: 8 },
    { id: 'discount_amount', label: 'Disc', visible: false, order: 9 },
    { id: 'total', label: 'Total', visible: true, order: 10 },
];

export const VoucherItemsSection = React.forwardRef<VoucherItemsSectionRef, VoucherItemsSectionProps>((
    {
    items,
    products,
    productUnitsByProduct,
    units,
    isReadOnly,
    onAddItem,
    onRemoveItem,
    onUpdateItem,
    getItemAmount,
    header,
    addItemLabel,
    disableAdd,
    settings,
    footerRightContent,
    onProductCreate,
    onSectionExit,
    defaultUnitKind = 'sale',
    gstSlabs = [],
    fullProducts = [],
    taxInclusive = false,
}, ref) => {
    // Ref to the first product combobox
    const firstProductRef = useRef<HTMLButtonElement>(null);

    // FOCUSABLE_FIELDS: the column ids (in order) that can receive keyboard focus after product selection.
    // 'product' itself is excluded; 'final_qty', 'amount', 'total' are read-only display cells.
    const FOCUSABLE_FIELD_IDS = ['quantity', 'unit', 'rate', 'count', 'deduction', 'discount_percent', 'discount_amount', 'tax_rate'];

    /**
     * Focus the first editable field after 'product' in the current column order.
     * Uses data-field attributes on each rendered cell.
     */
    const focusFirstEditableAfterProduct = (rowIndex: number) => {
        // columns is sorted by order and already filtered to visible ones
        const orderedEditableIds = columns
            .filter(c => c.id !== 'sl_no' && c.id !== 'product' && FOCUSABLE_FIELD_IDS.includes(c.id))
            .map(c => c.id);

        const row = document.querySelector(`[data-row-index="${rowIndex}"]`);
        if (!row) return;

        for (const fieldId of orderedEditableIds) {
            const el = row.querySelector(`[data-field="${fieldId}"]`) as HTMLElement | null;
            if (el) {
                el.focus();
                if (el instanceof HTMLInputElement) el.select();
                return;
            }
        }
    };

    // Expose methods to parent component
    useImperativeHandle(ref, () => ({
        focusFirstProduct: () => {
            if (firstProductRef.current) {
                firstProductRef.current.focus();
            }
        }
    }));

    // Internal row navigation handling
    const { handleRowKeyDown } = useVoucherRowNavigation({
        onRemoveItem,
        onAddItem
    });

    const GST_COL_IDS = ['gst_rate', 'cgst', 'sgst', 'igst'];

    const columns = useMemo(() => {
        let cols = settings?.columns ? [...settings.columns] : DEFAULT_COLUMNS.filter(c => c.id !== 'sl_no');
        cols = cols.sort((a, b) => a.order - b.order).filter(c => c.visible && c.id !== 'sl_no');

        if (gstSlabs.length === 0) {
            // GST disabled -- strip GST columns from saved settings
            cols = cols.filter(c => !GST_COL_IDS.includes(c.id));
        } else if (!cols.some(c => GST_COL_IDS.includes(c.id))) {
            // GST enabled but no GST cols in saved settings yet -- auto-inject defaults
            const amountIdx = cols.findIndex(c => c.id === 'amount');
            const insertAt = amountIdx >= 0 ? amountIdx + 1 : cols.length;
            cols.splice(insertAt, 0,
                { id: 'gst_rate', label: 'GST%',    visible: true, order: 7.4 },
                { id: 'cgst',     label: 'CGST \u20b9', visible: true, order: 7.5 },
                { id: 'sgst',     label: 'SGST \u20b9', visible: true, order: 7.6 },
            );
        }
        // else: user already has GST cols in saved voucher settings -- respect them

        return [{ id: 'sl_no', label: '#', visible: true, order: -1 } as ColumnSettings, ...cols];
    }, [settings, gstSlabs]);

    // Replicate grid-cols-12 behavior dynamically
    const getGridTemplate = () => {
        return columns.map(col => {
            if (col.id === 'sl_no') return '24px';
            if (col.id === 'product') return '3fr';
            if (['cgst', 'sgst', 'igst'].includes(col.id)) return '0.8fr';
            if (['deduction', 'amount', 'discount_percent', 'discount_amount', 'tax_rate', 'gst_rate'].includes(col.id)) return '0.6fr';
            return '1fr';
        }).join(' ') + ' 64px';
    };

    const gridStyle = {
        gridTemplateColumns: getGridTemplate(),
        display: 'grid',
        gap: '0.5rem',
        alignItems: 'center'
    };

    const focusNextFieldFromUnit = (rowIndex: number, currentElement?: HTMLElement | null) => {
        const row = document.querySelector(`[data-row-index="${rowIndex}"]`);
        if (!row) return;

        const focusables = Array.from(
            row.querySelectorAll('[data-unit-trigger="true"], input:not([disabled]), button:not([disabled])')
        ) as HTMLElement[];

        const currentIndex = currentElement
            ? focusables.findIndex(el => el === currentElement)
            : focusables.findIndex(el => el.getAttribute('data-unit-trigger') === 'true');

        if (currentIndex >= 0 && currentIndex + 1 < focusables.length) {
            const nextField = focusables[currentIndex + 1];
            nextField?.focus();
            if (nextField instanceof HTMLInputElement) {
                nextField.select();
            }
            return;
        }

        onSectionExit?.();
    };

    const defaultHeader = (
        <div style={gridStyle} className="px-3 py-0.5 text-xs font-medium text-muted-foreground border-b bg-muted/20">
            {columns.map(col => (
                <div key={col.id} className={cn(
                    col.id === 'amount' || col.id === 'total' ? 'text-right' : '',
                    col.id === 'final_qty' || col.id === 'sl_no' ? 'text-center' : '',
                    col.id === 'deduction' ? 'text-left' : ''
                )}>
                    {col.label}
                </div>
            ))}
            <div className="w-16"></div>
        </div>
    );

    return (
        <VoucherItemsTable
            header={header || defaultHeader}
            onAddItem={onAddItem}
            addItemLabel={addItemLabel}
            disableAdd={disableAdd ?? isReadOnly}
            footerRightContent={footerRightContent}
        >
            {items.map((item, idx) => {
                const calc = getItemAmount(item);
                const product = products.find(p => String(p.id) === String(item.product_id));
                const productUnits = product ? (productUnitsByProduct?.[product.id] ?? []) : [];
                const resolvedUnitId = item.unit_id
                    ? String(item.unit_id)
                    : (product
                        ? getDefaultProductUnitId(productUnits, defaultUnitKind, product.unit_id)
                        : undefined) ?? '';

                // Compute per-item GST rate from slab
                const fullProduct = fullProducts.find(p => String(p.id) === String(item.product_id));
                let resolvedGstRate = item.tax_rate || 0;
                if (fullProduct?.gst_slab_id && gstSlabs.length > 0) {
                    const slab = gstSlabs.find(s => s.id === fullProduct.gst_slab_id);
                    if (slab) {
                        resolvedGstRate = slab.is_dynamic === 1
                            ? (item.rate < slab.threshold ? slab.below_rate : slab.above_rate)
                            : slab.fixed_rate;
                    }
                }
                const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
                const grossAmt = (finalQty * item.rate) - (item.discount_amount || 0);
                // When tax-inclusive: reverse-calculate base and tax from inclusive amount
                const baseAmt = taxInclusive && resolvedGstRate > 0
                    ? grossAmt / (1 + resolvedGstRate / 100)
                    : grossAmt;
                const totalGstAmt = taxInclusive
                    ? grossAmt - baseAmt
                    : grossAmt * (resolvedGstRate / 100);
                const splitAmt = totalGstAmt / 2;
                // Reverse ex-tax rate per unit (for display when blurred)
                const exTaxRate = taxInclusive && resolvedGstRate > 0 && finalQty > 0
                    ? baseAmt / finalQty
                    : item.rate;

                // Handle number input changes safely
                const handleNumberChange = (field: string, val: string) => {
                    onUpdateItem(idx, field, parseFloat(val) || 0);
                };

                const renderCell = (col: ColumnSettings) => {
                    switch (col.id) {
                        case 'sl_no':
                            return (
                                <div key={col.id} className="h-7 text-xs w-full flex items-center justify-center font-medium text-muted-foreground/70 cursor-default select-none pr-1">
                                    {idx + 1}
                                </div>
                            );
                        case 'product':
                            return (
                                <Combobox
                                    key={col.id}
                                    ref={idx === 0 ? firstProductRef : undefined}
                                    options={products.map(p => ({ 
                                        value: p.id, 
                                        label: `${p.code} - ${p.name}`,
                                        searchString: p.barcode ? `${p.code} - ${p.name} ${p.barcode}` : undefined
                                    }))}
                                    value={item.product_id}
                                    onChange={(value) => {
                                        onUpdateItem(idx, 'product_id', value);

                                        // Auto-focus the first editable field after 'product'
                                        // in the order defined by settings (not always quantity)
                                        setTimeout(() => {
                                            focusFirstEditableAfterProduct(idx);
                                        }, 100);
                                    }}
                                    placeholder="Select product"
                                    searchPlaceholder="Search products..."
                                    disabled={isReadOnly}
                                    onActionClick={() => onProductCreate?.('', idx)}
                                    onCreate={(name) => onProductCreate?.(name, idx)}
                                    onEmptyEnter={() => {
                                        // If it's not the first row, remove it and exit section
                                        if (idx > 0) {
                                            onRemoveItem(idx);
                                            onSectionExit?.();
                                        }
                                    }}
                                />
                            );
                        case 'quantity':
                            return (
                                <QuantityInput
                                    key={col.id}
                                    data-field="quantity"
                                    value={item.initial_quantity || ''}
                                    onChange={(e) => handleNumberChange('initial_quantity', e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = e.currentTarget.value;
                                            if (!val || parseFloat(val) <= 0) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            } else if (settings?.skipToNextRowAfterQty) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                
                                                const currentRow = e.currentTarget.closest('[data-row-index]');
                                                if (currentRow) {
                                                    const nextRow = currentRow.nextElementSibling;
                                                    if (nextRow) {
                                                        const firstInput = nextRow.querySelector('input:not([disabled]), button:not([disabled])') as HTMLElement;
                                                        if (firstInput) {
                                                            firstInput.focus();
                                                            if (firstInput instanceof HTMLButtonElement) {
                                                                firstInput.click();
                                                            }
                                                        }
                                                    } else {
                                                        onAddItem();
                                                        setTimeout(() => {
                                                            const newRow = currentRow.parentElement?.lastElementChild;
                                                            const firstInput = newRow?.querySelector('input:not([disabled]), button:not([disabled])') as HTMLElement;
                                                            if (firstInput) {
                                                                firstInput.focus();
                                                                if (firstInput instanceof HTMLButtonElement) {
                                                                    firstInput.click();
                                                                }
                                                            }
                                                        }, 50);
                                                    }
                                                }
                                            }
                                        }
                                    }}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="0.000"
                                    step="0.001"
                                    disabled={isReadOnly}
                                />
                            );
                        case 'unit':
                            return (
                                <Select
                                    key={col.id}
                                    value={resolvedUnitId}
                                    onValueChange={(value) => {
                                        onUpdateItem(idx, 'unit_id', value);
                                        setTimeout(() => {
                                            focusNextFieldFromUnit(
                                                idx,
                                                document.querySelector(`[data-row-index="${idx}"] [data-unit-trigger="true"]`) as HTMLElement | null
                                            );
                                        }, 10);
                                    }}
                                    disabled={isReadOnly || !product || productUnits.length === 0}
                                >
                                    <SelectTrigger
                                        className="h-7 w-full text-xs font-medium"
                                        data-field="unit"
                                        data-unit-trigger="true"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                focusNextFieldFromUnit(idx, e.currentTarget as HTMLElement);
                                            }
                                        }}
                                    >
                                        <SelectValue placeholder="Unit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {productUnits.length > 0 ? productUnits.map((conversion) => {
                                            const unit = units.find(u => u.id === conversion.unit_id);
                                            return (
                                                <SelectItem key={conversion.id} value={String(conversion.unit_id)}>
                                                    {unit ? unit.symbol : conversion.unit_symbol}
                                                </SelectItem>
                                            );
                                        }) : (
                                            <SelectItem value={product?.unit_id ? String(product.unit_id) : 'none'} disabled>
                                                {units.find(u => u.id === resolvedUnitId)?.symbol || '-'}
                                            </SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            );
                        case 'rate':
                            return (
                                <RateCell
                                    key={col.id}
                                    rate={item.rate || 0}
                                    exTaxRate={exTaxRate}
                                    taxInclusive={taxInclusive}
                                    resolvedGstRate={resolvedGstRate}
                                    isReadOnly={isReadOnly}
                                    onChange={(val) => handleNumberChange('rate', val)}
                                />
                            );
                        case 'count':
                            return (
                                <Input
                                    key={col.id}
                                    data-field="count"
                                    type="number"
                                    value={item.count || ''}
                                    onChange={(e) => handleNumberChange('count', e.target.value)}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="1.00"
                                    step="0.01"
                                    disabled={isReadOnly}
                                />
                            );
                        case 'deduction':
                            return (
                                <Input
                                    key={col.id}
                                    data-field="deduction"
                                    type="number"
                                    value={item.deduction_per_unit || ''}
                                    onChange={(e) => handleNumberChange('deduction_per_unit', e.target.value)}
                                    className="h-7 text-xs text-left font-mono"
                                    placeholder="0.00"
                                    step="0.01"
                                    disabled={isReadOnly}
                                />
                            );
                        case 'final_qty':
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-center bg-muted/50 border border-input rounded-md font-medium font-mono">
                                    {calc.finalQty.toFixed(3)}
                                </div>
                            );
                        case 'amount':
                            // Show base (ex-tax) amount when tax-inclusive
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-start px-3 bg-muted/50 border border-input rounded-md font-medium font-mono">
                                    ₹{(taxInclusive ? baseAmt : calc.amount).toFixed(2)}
                                </div>
                            );
                        case 'discount_percent':
                            return (
                                <Input
                                    key={col.id}
                                    data-field="discount_percent"
                                    type="number"
                                    value={item.discount_percent || ''}
                                    onChange={(e) => handleNumberChange('discount_percent', e.target.value)}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="0"
                                    step="0.01"
                                    disabled={isReadOnly}
                                />
                            );
                        case 'discount_amount':
                            return (
                                <Input
                                    key={col.id}
                                    data-field="discount_amount"
                                    type="number"
                                    value={item.discount_amount || ''}
                                    onChange={(e) => handleNumberChange('discount_amount', e.target.value)}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="0.00"
                                    step="0.01"
                                    disabled={isReadOnly}
                                />
                            );
                        case 'tax_rate':
                            return (
                                <Input
                                    key={col.id}
                                    data-field="tax_rate"
                                    type="number"
                                    value={item.tax_rate || ''}
                                    onChange={(e) => handleNumberChange('tax_rate', e.target.value)}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="0.00"
                                    step="0.01"
                                    disabled={isReadOnly}
                                />
                            );
                        case 'gst_rate':
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-center bg-muted/50 border border-input rounded-md font-mono text-muted-foreground">
                                    {resolvedGstRate > 0 ? `${resolvedGstRate}%` : '-'}
                                </div>
                            );
                        case 'cgst':
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-end px-2 bg-muted/50 border border-input rounded-md font-mono text-muted-foreground">
                                    {resolvedGstRate > 0 ? `₹${splitAmt.toFixed(2)}` : '-'}
                                </div>
                            );
                        case 'sgst':
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-end px-2 bg-muted/50 border border-input rounded-md font-mono text-muted-foreground">
                                    {resolvedGstRate > 0 ? `₹${splitAmt.toFixed(2)}` : '-'}
                                </div>
                            );
                        case 'igst':
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-end px-2 bg-muted/50 border border-input rounded-md font-mono text-muted-foreground">
                                    {resolvedGstRate > 0 ? `₹${totalGstAmt.toFixed(2)}` : '-'}
                                </div>
                            );
                        case 'total':
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-end px-3 bg-muted/50 border border-input rounded-md font-bold font-mono">
                                    ₹{calc.total.toFixed(2)}
                                </div>
                            );
                        default:
                            return <div key={col.id}></div>;
                    }
                };

                return (
                    <div
                        key={item.id || idx}
                        data-row-index={idx}
                        style={gridStyle}
                        className="group px-3 py-0.5 items-center hover:bg-muted/30 focus-within:bg-muted/50 border-b last:border-0"
                        onKeyDown={(e) => handleRowKeyDown(e, idx)}
                    >
                        {columns.map(col => renderCell(col))}

                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => onAddItem(idx + 1)}
                                className="h-6 w-6 p-0"
                                title="Insert Item Below"
                                disabled={isReadOnly}
                            >
                                <IconPlus size={14} />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => onRemoveItem(idx)}
                                className="h-6 w-6 p-0"
                                title="Delete (Ctrl+D)"
                                disabled={isReadOnly}
                                data-exclude-nav="true"
                            >
                                <IconTrash size={14} />
                            </Button>
                        </div>
                    </div>
                );
            })}
        </VoucherItemsTable>
    );
});

VoucherItemsSection.displayName = 'VoucherItemsSection';
