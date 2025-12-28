import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { IconTrash } from '@tabler/icons-react';
import { VoucherItemsTable } from '@/components/voucher/VoucherItemsTable';
import { useVoucherRowNavigation } from '@/hooks/useVoucherRowNavigation';

// Types typically used in voucher items
// We define them locally or import them if they are shared. 
// For now, based on the page, we'll define interfaces or use 'any' where generic.
// Ideally, these should be shared types, but for this refactor we stick to the requested props.

interface Product {
    id: number;
    code: string;
    name: string;
    unit_id: number;
    purchase_rate?: number;
    sales_rate?: number;
}

interface Unit {
    id: number;
    name: string;
    symbol: string;
}

interface ItemAmount {
    finalQty: number;
    amount: number;
    taxAmount: number;
    total: number;
}

export interface VoucherItemsSectionProps {
    items: any[];
    products: Product[];
    units: Unit[];
    isReadOnly: boolean;
    onAddItem: () => void;
    onRemoveItem: (index: number) => void;
    onUpdateItem: (index: number, field: string, value: any) => void;
    getItemAmount: (item: any) => ItemAmount;
    header?: React.ReactNode;
    addItemLabel?: string;
    disableAdd?: boolean;
}

export function VoucherItemsSection({
    items,
    products,
    units,
    isReadOnly,
    onAddItem,
    onRemoveItem,
    onUpdateItem,
    getItemAmount,
    header,
    addItemLabel,
    disableAdd
}: VoucherItemsSectionProps) {

    // Internal row navigation handling
    const { handleRowKeyDown } = useVoucherRowNavigation({
        onRemoveItem,
        onAddItem
    });

    const defaultHeader = (
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-3">Product</div>
            <div>Qty</div>
            <div>Unit</div>
            <div>Rate</div>
            <div>Count</div>
            <div>Deduction</div>
            <div>Final Qty</div>
            <div className="text-right">Amount</div>
            <div className="text-right">Total</div>
            <div className="w-8"></div>
        </div>
    );

    return (
        <VoucherItemsTable
            header={header || defaultHeader}
            onAddItem={onAddItem}
            addItemLabel={addItemLabel}
            disableAdd={disableAdd ?? isReadOnly}
        >
            {items.map((item, idx) => {
                const calc = getItemAmount(item);
                const product = products.find(p => p.id === item.product_id);

                // Handle number input changes safely
                const handleNumberChange = (field: string, val: string) => {
                    onUpdateItem(idx, field, parseFloat(val) || 0);
                };

                return (
                    <div
                        key={item.id || idx} // Fallback to idx if id is missing, though id is preferred
                        data-row-index={idx}
                        className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-muted/30 focus-within:bg-muted/50"
                        onKeyDown={(e) => handleRowKeyDown(e, idx)}
                    >
                        {/* Product */}
                        <div className="col-span-3">
                            <Combobox
                                options={products.map(p => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
                                value={item.product_id}
                                onChange={(value) => onUpdateItem(idx, 'product_id', value)}
                                placeholder="Select product"
                                searchPlaceholder="Search products..."
                                disabled={isReadOnly}
                            />
                        </div>

                        {/* Initial Quantity */}
                        <div>
                            <Input
                                type="number"
                                value={item.initial_quantity || ''}
                                onChange={(e) => handleNumberChange('initial_quantity', e.target.value)}
                                className="h-7 text-xs text-right font-mono"
                                placeholder="0.00"
                                step="0.01"
                                disabled={isReadOnly}
                            />
                        </div>

                        {/* Unit */}
                        <div className="h-7 text-xs flex items-center justify-end px-3 bg-muted/50 border border-input rounded-md font-medium text-muted-foreground">
                            {units.find(u => u.id === product?.unit_id)?.symbol || '-'}
                        </div>

                        {/* Rate */}
                        <div>
                            <Input
                                type="number"
                                value={item.rate || ''}
                                onChange={(e) => handleNumberChange('rate', e.target.value)}
                                className="h-7 text-xs text-right font-mono"
                                placeholder="0.00"
                                step="0.01"
                                disabled={isReadOnly}
                            />
                        </div>

                        {/* Count */}
                        <div>
                            <Input
                                type="number"
                                value={item.count || ''}
                                onChange={(e) => handleNumberChange('count', e.target.value)}
                                className="h-7 text-xs text-right font-mono"
                                placeholder="1.00"
                                step="0.01"
                                disabled={isReadOnly}
                            />
                        </div>

                        {/* Deduction */}
                        <div>
                            <Input
                                type="number"
                                value={item.deduction_per_unit || ''}
                                onChange={(e) => handleNumberChange('deduction_per_unit', e.target.value)}
                                className="h-7 text-xs text-right font-mono"
                                placeholder="0.00"
                                step="0.01"
                                disabled={isReadOnly}
                            />
                        </div>

                        {/* Final Qty */}
                        <div className="h-7 text-xs flex items-center justify-center bg-muted/50 border border-input rounded-md font-medium font-mono">
                            {calc.finalQty.toFixed(2)}
                        </div>

                        {/* Amount */}
                        <div className="h-7 text-xs flex items-center justify-end px-3 bg-muted/50 border border-input rounded-md font-medium font-mono">
                            ₹{calc.amount.toFixed(2)}
                        </div>

                        {/* Total */}
                        <div className="h-7 text-xs flex items-center justify-end px-3 bg-muted/50 border border-input rounded-md font-bold font-mono">
                            ₹{calc.total.toFixed(2)}
                        </div>

                        {/* Delete */}
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
}
