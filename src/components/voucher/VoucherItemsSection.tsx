import React, { useMemo, useRef, useImperativeHandle } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { IconTrash, IconPlus } from '@tabler/icons-react';
import { VoucherItemsTable } from '@/components/voucher/VoucherItemsTable';
import { useVoucherRowNavigation } from '@/hooks/useVoucherRowNavigation';
import { cn } from '@/lib/utils';
import { getDefaultProductUnitId, type ProductUnitDefaultKind } from '@/lib/product-units';
import type { GstTaxSlab, Product as TauriProduct } from '@/lib/tauri';

/** Hover card content that lazily fetches stock qty for a product */
const ProductHoverInfo = ({ productId, fullProducts }: { productId: string; fullProducts: TauriProduct[] }) => {
    const [stockQty, setStockQty] = React.useState<number | null>(null);
    const [loading, setLoading] = React.useState(true);
    const product = fullProducts.find(p => String(p.id) === String(productId));

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        invoke<number>('get_product_stock_qty', { productId })
            .then(qty => { if (!cancelled) { setStockQty(qty); setLoading(false); } })
            .catch(() => { if (!cancelled) { setStockQty(0); setLoading(false); } });
        return () => { cancelled = true; };
    }, [productId]);

    if (!product) return <div className="text-xs text-muted-foreground">No product selected</div>;

    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold truncate" title={product.name}>{product.name}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Stock</span>
                <span className="text-right font-mono font-medium">
                    {loading ? '…' : stockQty?.toFixed(3)}
                </span>
                <span className="text-muted-foreground">P. Rate</span>
                <span className="text-right font-mono font-medium">
                    ₹{product.purchase_rate?.toFixed(2) ?? '0.00'}
                </span>
                <span className="text-muted-foreground">MRP</span>
                <span className="text-right font-mono font-medium">
                    ₹{product.mrp?.toFixed(2) ?? '0.00'}
                </span>
            </div>
        </div>
    );
};

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
    const [localValue, setLocalValue] = React.useState('');

    const blurredValue = React.useMemo(() => {
        const valueToDisplay = taxInclusive && resolvedGstRate > 0 ? exTaxRate : rate;
        return Number.isFinite(valueToDisplay) && valueToDisplay !== 0
            ? valueToDisplay.toFixed(2)
            : valueToDisplay === 0
                ? '0.00'
                : '';
    }, [exTaxRate, rate, resolvedGstRate, taxInclusive]);

    React.useEffect(() => {
        if (!isFocused) {
            setLocalValue(blurredValue);
        }
    }, [blurredValue, isFocused]);

    // When focused: show real stored (inclusive) rate for editing
    // When blurred:  show ex-tax rate (reverse-calculated) for clarity
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        setLocalValue(rate ? String(rate) : '');
        // Defer select() so it runs after React re-renders the inclusive rate value.
        // Guard: only call select() if the rate input is still the focused element —
        // prevents a stale RAF from stealing focus back from the quantity input when
        // focusFirstEditableAfterProduct() redirects focus after product selection.
        const el = e.currentTarget;
        requestAnimationFrame(() => {
            if (document.activeElement === el) {
                el.select();
            }
        });
    };

    const handleBlur = () => {
        setIsFocused(false);
        setLocalValue(blurredValue);
    };

    return (
        <Input
            ref={ref}
            data-field="rate"
            type="number"
            value={isFocused ? localValue : blurredValue}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={(e) => {
                setLocalValue(e.target.value);
                onChange(e.target.value);
            }}
            className="h-7 text-xs text-right font-mono"
            placeholder="0.00"
            step="0.01"
            disabled={isReadOnly}
            title={taxInclusive && resolvedGstRate > 0 ? `Inclusive rate: ${rate}  |  Ex-tax: ${exTaxRate.toFixed(2)}` : undefined}
        />
    );
});
RateCell.displayName = 'RateCell';

interface FormattedNumberInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> {
    value: number;
    onChangeValue: (val: string) => void;
    decimals?: number;
    emptyWhenZero?: boolean;
}

const FormattedNumberInput = React.forwardRef<HTMLInputElement, FormattedNumberInputProps>(
    ({ value, onChangeValue, decimals = 2, emptyWhenZero = true, onFocus, onBlur, onKeyDown, ...props }, ref) => {
        const [isFocused, setIsFocused] = React.useState(false);
        const [localValue, setLocalValue] = React.useState('');

        const blurredValue = React.useMemo(() => {
            if (!Number.isFinite(value)) {
                return '';
            }

            if (value === 0 && emptyWhenZero) {
                return '';
            }

            return value.toFixed(decimals);
        }, [decimals, emptyWhenZero, value]);

        React.useEffect(() => {
            if (!isFocused) {
                setLocalValue(blurredValue);
            }
        }, [blurredValue, isFocused]);

        const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
            setIsFocused(true);
            setLocalValue(value || value === 0 ? String(value) : '');
            onFocus?.(e);
            requestAnimationFrame(() => e.currentTarget.select());
        };

        const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            setIsFocused(false);
            setLocalValue(blurredValue);
            onBlur?.(e);
        };

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            setLocalValue(e.target.value);
            onChangeValue(e.target.value);
        };

        return (
            <Input
                ref={ref}
                type="number"
                value={isFocused ? localValue : blurredValue}
                onFocus={handleFocus}
                onBlur={handleBlur}
                onChange={handleChange}
                onKeyDown={onKeyDown}
                {...props}
            />
        );
    }
);
FormattedNumberInput.displayName = 'FormattedNumberInput';

interface Product {
    id: string;
    code: string;
    name: string;
    barcode?: string;
    unit_id: string;
    purchase_rate?: number;
    sales_rate?: number;
    mrp?: number;
}

interface Service {
    id: string;
    code: string;
    name: string;
    unit_id?: string;
    hsn_sac_code?: string;
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
    services?: Service[];               // NEW: list of services for service rows
    productUnitsByProduct?: Record<string, any[]>;
    units: Unit[];
    isReadOnly: boolean;
    onAddItem: (index?: number) => void;
    onRemoveItem: (index: number) => void;
    onUpdateItem: (index: number, field: string, value: any, options?: { initialQuantity?: number }) => void;
    getItemAmount: (item: any) => ItemAmount;
    header?: React.ReactNode;
    addItemLabel?: string;
    disableAdd?: boolean;
    settings?: { columns: ColumnSettings[], skipToNextRowAfterQty?: boolean, skipToNextRowAfterProduct?: boolean, incrementQtyOnDuplicate?: boolean, updateRatesOnPurchase?: boolean, showProductInfoOnHover?: boolean, masterProductsEnabled?: boolean };
    footerRightContent?: React.ReactNode;
    footerLeftContent?: React.ReactNode;
    onProductCreate?: (name: string, rowIndex: number) => void;
    onServiceCreate?: (name: string, rowIndex: number) => void; // NEW
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
    { id: 'product', label: 'Item', visible: true, order: 0 },
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
    services = [],
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
    footerLeftContent,
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
            if (['deduction', 'amount', 'discount_percent', 'discount_amount', 'tax_rate', 'gst_rate', 'sales_rate', 'mrp'].includes(col.id)) return '0.6fr';
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
            footerLeftContent={footerLeftContent}
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

                // Prefer the saved voucher-item snapshot for GST display on posted vouchers.
                const fullProduct = fullProducts.find(p => String(p.id) === String(item.product_id));
                let resolvedGstRate = item.tax_rate || 0;
                if (typeof item.resolved_gst_rate === 'number' && item.resolved_gst_rate > 0) {
                    resolvedGstRate = item.resolved_gst_rate;
                } else if (item.gst_slab_id && gstSlabs.length > 0) {
                    const savedSlab = gstSlabs.find(s => s.id === item.gst_slab_id);
                    if (savedSlab) {
                        resolvedGstRate = savedSlab.is_dynamic === 1
                            ? (item.rate < savedSlab.threshold ? savedSlab.below_rate : savedSlab.above_rate)
                            : savedSlab.fixed_rate;
                    }
                } else if (fullProduct?.gst_slab_id && gstSlabs.length > 0) {
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
                const cgstAmt = typeof item.cgst_amount === 'number' ? item.cgst_amount : totalGstAmt / 2;
                const sgstAmt = typeof item.sgst_amount === 'number' ? item.sgst_amount : totalGstAmt / 2;
                const igstAmt = typeof item.igst_amount === 'number' ? item.igst_amount : totalGstAmt;
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
                            return (settings?.showProductInfoOnHover && item.product_id) ? (
                                <HoverCard key={col.id} openDelay={300} closeDelay={100}>
                                    <HoverCardTrigger asChild>
                                        <div className="h-7 text-xs w-full flex items-center justify-center font-medium text-muted-foreground/70 cursor-default select-none pr-1 hover:text-foreground transition-colors">
                                            {idx + 1}
                                        </div>
                                    </HoverCardTrigger>
                                    <HoverCardContent side="right" align="start" className="w-52 p-3">
                                        <ProductHoverInfo productId={item.product_id} fullProducts={fullProducts} />
                                    </HoverCardContent>
                                </HoverCard>
                            ) : (
                                <div key={col.id} className="h-7 text-xs w-full flex items-center justify-center font-medium text-muted-foreground/70 cursor-default select-none pr-1">
                                    {idx + 1}
                                </div>
                            );
                        case 'product': {
                            const productOptions = products.map(p => ({
                                value: `p:${p.id}`,
                                label: `${p.code} - ${p.name}`,
                                searchString: p.barcode ? `${p.code} - ${p.name} ${p.barcode}` : undefined,
                            }));
                            const serviceOptions = (services ?? []).map(s => ({
                                value: `s:${s.id}`,
                                label: `${s.code} - ${s.name}`,
                            }));
                            const allOptions = [...productOptions, ...serviceOptions];
                            const currentValue = item.item_type === 'service' && item.service_id
                                ? `s:${item.service_id}`
                                : item.product_id
                                    ? `p:${item.product_id}`
                                    : null;
                            return (
                                <Combobox
                                    key={col.id}
                                    ref={idx === 0 ? firstProductRef : undefined}
                                    options={allOptions}
                                    value={currentValue ?? undefined}
                                    onChange={(value) => {
                                        if (!value) return;
                                        const strVal = String(value);

                                        if (strVal.startsWith('p:')) {
                                            const prodId = strVal.slice(2);

                                            // --- Increment Qty on Duplicate ---
                                            if (settings?.incrementQtyOnDuplicate) {
                                                const existingIdx = items.findIndex(
                                                    (it, i) => i !== idx && String(it.product_id) === prodId
                                                );
                                                if (existingIdx !== -1) {
                                                    const existingQty = items[existingIdx].initial_quantity || 0;
                                                    onUpdateItem(existingIdx, 'initial_quantity', existingQty + 1);
                                                    // Remove current (new/empty) row if it has no product yet
                                                    if (!items[idx].product_id) {
                                                        onRemoveItem(idx);
                                                    }
                                                    // Focus the incremented row's quantity field
                                                    setTimeout(() => {
                                                        const targetRow = document.querySelector(`[data-row-index="${existingIdx}"]`);
                                                        const qtyInput = targetRow?.querySelector('[data-field="quantity"]') as HTMLElement | null;
                                                        qtyInput?.focus();
                                                        if (qtyInput instanceof HTMLInputElement) qtyInput.select();
                                                    }, 50);
                                                    return;
                                                }
                                            }

                                            // --- Skip to Next Row After Product ---
                                            if (settings?.skipToNextRowAfterProduct) {
                                                onUpdateItem(idx, 'product_id', prodId, { initialQuantity: 1 });
                                                // Jump to next row (add new if needed)
                                                setTimeout(() => {
                                                    const currentRow = document.querySelector(`[data-row-index="${idx}"]`);
                                                    if (currentRow) {
                                                        const nextRow = currentRow.nextElementSibling;
                                                        if (nextRow) {
                                                            const firstInput = nextRow.querySelector('input:not([disabled]), button:not([disabled])') as HTMLElement;
                                                            if (firstInput) {
                                                                firstInput.focus();
                                                                if (firstInput instanceof HTMLButtonElement) firstInput.click();
                                                            }
                                                        } else {
                                                            onAddItem();
                                                            setTimeout(() => {
                                                                const newRow = currentRow.parentElement?.lastElementChild;
                                                                const firstInput = newRow?.querySelector('input:not([disabled]), button:not([disabled])') as HTMLElement;
                                                                if (firstInput) {
                                                                    firstInput.focus();
                                                                    if (firstInput instanceof HTMLButtonElement) firstInput.click();
                                                                }
                                                            }, 50);
                                                        }
                                                    }
                                                }, 100);
                                            } else {
                                                onUpdateItem(idx, 'product_id', prodId);
                                                setTimeout(() => focusFirstEditableAfterProduct(idx), 100);
                                            }
                                        } else if (strVal.startsWith('s:')) {
                                            const svcId = strVal.slice(2);
                                            onUpdateItem(idx, 'service_id', svcId);
                                            setTimeout(() => focusFirstEditableAfterProduct(idx), 100);
                                        }
                                    }}
                                    placeholder="Select product"
                                    searchPlaceholder="Search products..."
                                    disabled={isReadOnly}
                                    onActionClick={() => onProductCreate?.('', idx)}
                                    onCreate={(name) => onProductCreate?.(name, idx)}
                                    onEmptyEnter={() => {
                                        if (idx > 0) { onRemoveItem(idx); onSectionExit?.(); }
                                    }}
                                />
                            );
                        }
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
                                <FormattedNumberInput
                                    key={col.id}
                                    data-field="count"
                                    value={item.count || 0}
                                    onChangeValue={(val) => handleNumberChange('count', val)}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="1.00"
                                    step="0.01"
                                    disabled={isReadOnly}
                                    emptyWhenZero={false}
                                />
                            );
                        case 'deduction':
                            return (
                                <FormattedNumberInput
                                    key={col.id}
                                    data-field="deduction"
                                    value={item.deduction_per_unit || 0}
                                    onChangeValue={(val) => handleNumberChange('deduction_per_unit', val)}
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
                                <FormattedNumberInput
                                    key={col.id}
                                    data-field="discount_percent"
                                    value={item.discount_percent || 0}
                                    onChangeValue={(val) => handleNumberChange('discount_percent', val)}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="0"
                                    step="0.01"
                                    disabled={isReadOnly}
                                />
                            );
                        case 'discount_amount':
                            return (
                                <FormattedNumberInput
                                    key={col.id}
                                    data-field="discount_amount"
                                    value={item.discount_amount || 0}
                                    onChangeValue={(val) => handleNumberChange('discount_amount', val)}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="0.00"
                                    step="0.01"
                                    disabled={isReadOnly}
                                />
                            );
                        case 'tax_rate':
                            return (
                                <FormattedNumberInput
                                    key={col.id}
                                    data-field="tax_rate"
                                    value={item.tax_rate || 0}
                                    onChangeValue={(val) => handleNumberChange('tax_rate', val)}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="0.00"
                                    step="0.01"
                                    disabled={isReadOnly}
                                />
                            );
                        case 'gst_rate':
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-center bg-muted/50 border border-input rounded-md font-medium font-mono">
                                    {resolvedGstRate > 0 ? `${resolvedGstRate}%` : '-'}
                                </div>
                            );
                        case 'cgst':
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-end px-2 bg-muted/50 border border-input rounded-md font-medium font-mono">
                                    {resolvedGstRate > 0 ? `₹${cgstAmt.toFixed(2)}` : '-'}
                                </div>
                            );
                        case 'sgst':
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-end px-2 bg-muted/50 border border-input rounded-md font-medium font-mono">
                                    {resolvedGstRate > 0 ? `₹${sgstAmt.toFixed(2)}` : '-'}
                                </div>
                            );
                        case 'igst':
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-end px-2 bg-muted/50 border border-input rounded-md font-medium font-mono">
                                    {resolvedGstRate > 0 ? `₹${igstAmt.toFixed(2)}` : '-'}
                                </div>
                            );
                        case 'total':
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-end px-3 bg-muted/50 border border-input rounded-md font-bold font-mono">
                                    ₹{calc.total.toFixed(2)}
                                </div>
                            );
                        case 'sales_rate': {
                            const isEditable = (settings?.updateRatesOnPurchase || settings?.masterProductsEnabled) && !isReadOnly;
                            const value = item.sales_rate !== undefined ? item.sales_rate : product?.sales_rate || 0;
                            return (
                                isEditable ? (
                                    <FormattedNumberInput
                                        key={col.id}
                                        data-field="sales_rate"
                                        value={value}
                                        onChangeValue={(val) => handleNumberChange('sales_rate', val)}
                                        className="h-7 text-xs text-right font-mono"
                                        placeholder="0.00"
                                        step="0.01"
                                    />
                                ) : (
                                    <div key={col.id} className="h-7 text-xs flex items-center justify-end px-2 bg-muted/50 border border-input rounded-md font-medium font-mono" title="Current sales rate from product master">
                                        {value ? `₹${value.toFixed(2)}` : '-'}
                                    </div>
                                )
                            );
                        }
                        case 'mrp': {
                            const isEditable = (settings?.updateRatesOnPurchase || settings?.masterProductsEnabled) && !isReadOnly;
                            const value = item.mrp !== undefined ? item.mrp : product?.mrp || 0;
                            return (
                                isEditable ? (
                                    <FormattedNumberInput
                                        key={col.id}
                                        data-field="mrp"
                                        value={value}
                                        onChangeValue={(val) => handleNumberChange('mrp', val)}
                                        className="h-7 text-xs text-right font-mono"
                                        placeholder="0.00"
                                        step="0.01"
                                    />
                                ) : (
                                    <div key={col.id} className="h-7 text-xs flex items-center justify-end px-2 bg-muted/50 border border-input rounded-md font-medium font-mono" title="Current MRP from product master">
                                        {value ? `₹${value.toFixed(2)}` : '-'}
                                    </div>
                                )
                            );
                        }
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
