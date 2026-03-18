import React, { useMemo, useRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconTrash } from '@tabler/icons-react';
import { VoucherItemsTable } from '@/components/voucher/VoucherItemsTable';
import { useVoucherRowNavigation } from '@/hooks/useVoucherRowNavigation';
import { cn } from '@/lib/utils';
import { getDefaultProductUnitId, type ProductUnitDefaultKind } from '@/lib/product-units';

interface Product {
    id: string;
    code: string;
    name: string;
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
    onAddItem: () => void;
    onRemoveItem: (index: number) => void;
    onUpdateItem: (index: number, field: string, value: any) => void;
    getItemAmount: (item: any) => ItemAmount;
    header?: React.ReactNode;
    addItemLabel?: string;
    disableAdd?: boolean;
    settings?: { columns: ColumnSettings[] };
    footerRightContent?: React.ReactNode;
    onProductCreate?: (name: string, rowIndex: number) => void;
    onSectionExit?: () => void;
    defaultUnitKind?: ProductUnitDefaultKind;
}

export interface VoucherItemsSectionRef {
    focusFirstProduct: () => void;
}

const DEFAULT_COLUMNS: ColumnSettings[] = [
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

export const VoucherItemsSection = React.forwardRef<VoucherItemsSectionRef, VoucherItemsSectionProps>(({
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
    defaultUnitKind = 'sale'
}, ref) => {
    // Ref to the first product combobox
    const firstProductRef = useRef<HTMLButtonElement>(null);

    // Refs for quantity inputs (one per row)
    const quantityRefs = useRef<(HTMLInputElement | null)[]>([]);

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

    const columns = useMemo(() => {
        if (!settings?.columns) return DEFAULT_COLUMNS;
        return [...settings.columns].sort((a, b) => a.order - b.order).filter(c => c.visible);
    }, [settings]);

    // Replicate grid-cols-12 behavior dynamically
    const getGridTemplate = () => {
        return columns.map(col => {
            if (col.id === 'product') return '3fr';
            if (['deduction', 'amount', 'discount_percent', 'discount_amount', 'tax_rate'].includes(col.id)) return '0.6fr';
            return '1fr';
        }).join(' ') + ' 32px'; // w-8 equivalent for delete button
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
        <div style={gridStyle} className="px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/20">
            {columns.map(col => (
                <div key={col.id} className={cn(
                    col.id === 'amount' || col.id === 'total' ? 'text-right' : '',
                    col.id === 'final_qty' ? 'text-center' : '',
                    col.id === 'deduction' ? 'text-left' : ''
                )}>
                    {col.label}
                </div>
            ))}
            <div className="w-8"></div>
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

                // Handle number input changes safely
                const handleNumberChange = (field: string, val: string) => {
                    onUpdateItem(idx, field, parseFloat(val) || 0);
                };

                const renderCell = (col: ColumnSettings) => {
                    switch (col.id) {
                        case 'product':
                            return (
                                <Combobox
                                    key={col.id}
                                    ref={idx === 0 ? firstProductRef : undefined}
                                    options={products.map(p => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
                                    value={item.product_id}
                                    onChange={(value) => {
                                        onUpdateItem(idx, 'product_id', value);

                                        // Auto-focus quantity input after product selection
                                        setTimeout(() => {
                                            if (quantityRefs.current[idx]) {
                                                quantityRefs.current[idx]?.focus();
                                                quantityRefs.current[idx]?.select();
                                            }
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
                                <Input
                                    key={col.id}
                                    ref={el => { quantityRefs.current[idx] = el; }}
                                    type="number"
                                    value={item.initial_quantity || ''}
                                    onChange={(e) => handleNumberChange('initial_quantity', e.target.value)}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="0.00"
                                    step="0.01"
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
                                <Input
                                    key={col.id}
                                    data-field="rate"
                                    type="number"
                                    value={item.rate || ''}
                                    onChange={(e) => handleNumberChange('rate', e.target.value)}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="0.00"
                                    step="0.01"
                                    disabled={isReadOnly}
                                />
                            );
                        case 'count':
                            return (
                                <Input
                                    key={col.id}
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
                                    {calc.finalQty.toFixed(2)}
                                </div>
                            );
                        case 'amount':
                            return (
                                <div key={col.id} className="h-7 text-xs flex items-center justify-start px-3 bg-muted/50 border border-input rounded-md font-medium font-mono">
                                    ₹{calc.amount.toFixed(2)}
                                </div>
                            );
                        case 'discount_percent':
                            return (
                                <Input
                                    key={col.id}
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
                                    type="number"
                                    value={item.tax_rate || ''}
                                    onChange={(e) => handleNumberChange('tax_rate', e.target.value)}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="0.00"
                                    step="0.01"
                                    disabled={isReadOnly}
                                />
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
                        className="px-3 py-2 items-center hover:bg-muted/30 focus-within:bg-muted/50 border-b last:border-0"
                        onKeyDown={(e) => handleRowKeyDown(e, idx)}
                    >
                        {columns.map(col => renderCell(col))}

                        <div className="flex justify-end">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => onRemoveItem(idx)}
                                className="h-6 w-6 p-0"
                                title="Delete (Ctrl+D)"
                                disabled={isReadOnly}
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
