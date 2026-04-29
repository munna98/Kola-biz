import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { IconTrash, IconReceipt2 } from '@tabler/icons-react';
import { VoucherItemsTable } from '@/components/voucher/VoucherItemsTable';
import { useVoucherRowNavigation } from '@/hooks/useVoucherRowNavigation';

interface LedgerAccount {
    id: number;
    account_name: string;
    address_line_1?: string;
}

export interface VoucherLedgerSectionProps {
    items: any[];
    ledgers: LedgerAccount[];
    isReadOnly: boolean;
    onAddItem: () => void;
    onRemoveItem: (index: number) => void;
    onUpdateItem: (index: number, field: string, value: any) => void;
    onAllocations?: (index: number) => void;
    header?: React.ReactNode;
    addItemLabel?: string;
    disableAdd?: boolean;
    rowBalances?: Record<number, number>;
    onFocusRow?: (index: number) => void;
    footerRightContent?: React.ReactNode;
    onCreateLedger?: (name: string, index: number) => void;
    onSectionExit?: () => void;
}

export function VoucherLedgerSection({
    items,
    ledgers,
    isReadOnly,
    onAddItem,
    onRemoveItem,
    onUpdateItem,
    onAllocations,
    header,
    addItemLabel,
    disableAdd,
    onFocusRow,
    footerRightContent,
    onCreateLedger,
    onSectionExit
}: VoucherLedgerSectionProps) {

    // Internal row navigation handling
    const { handleRowKeyDown } = useVoucherRowNavigation({
        onRemoveItem,
        onAddItem
    });

    const gridStyle = {
        gridTemplateColumns: '24px 5fr 2fr 4fr 32px',
        display: 'grid',
        gap: '0.5rem',
        alignItems: 'center'
    };

    const defaultHeader = (
        <div style={gridStyle} className="px-3 py-0.5 text-xs font-medium text-muted-foreground border-b bg-muted/20">
            <div className="text-center">#</div>
            <div className="flex justify-between items-center px-1">
                <span>Account/Ledger</span>
            </div>
            <div className="text-right px-1">Amount</div>
            <div className="px-1">Remarks</div>
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
            {items.map((item, index) => (
                <div
                    key={item.id || index}
                    data-row-index={index}
                    style={gridStyle}
                    className="group px-3 py-0.5 items-center hover:bg-muted/30 focus-within:bg-muted/50 border-b last:border-0"
                    onKeyDown={(e) => handleRowKeyDown(e, index)}
                >
                    {/* Serial Number */}
                    <div className="h-7 text-xs w-full flex items-center justify-center font-medium text-muted-foreground/70 cursor-default select-none pr-1">
                        {index + 1}
                    </div>

                    {/* Ledger Selection */}
                    <div className="flex gap-1 items-center" onFocus={() => onFocusRow?.(index)}>
                        <Combobox
                            value={item.description}
                            options={ledgers.map(l => ({ value: l.account_name, label: l.account_name, subLabel: l.address_line_1 || undefined }))}
                            onChange={(val) => onUpdateItem(index, 'description', val)}
                            placeholder="Select Ledger"
                            searchPlaceholder="Search ledgers..."
                            disabled={isReadOnly}
                            onCreate={onCreateLedger ? (val) => onCreateLedger(val, index) : undefined}
                            onActionClick={onCreateLedger ? () => onCreateLedger('', index) : undefined}
                            className="flex-1"
                            onEmptyEnter={() => {
                                // If it's not the first row, remove it and exit section
                                if (index > 0) {
                                    onRemoveItem(index);
                                    onSectionExit?.();
                                }
                            }}
                        />
                    </div>

                    {/* Amount */}
                    <div className="flex items-start gap-1">
                        <Input
                            type="number"
                            value={item.amount || ''}
                            onChange={(e) => onUpdateItem(index, 'amount', parseFloat(e.target.value) || 0)}
                            onFocus={() => onFocusRow?.(index)}
                            className="h-7 text-xs text-right font-mono"
                            placeholder="0.00"
                            step="0.01"
                            disabled={isReadOnly}
                        />
                        {onAllocations && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={`h-7 w-7 p-0 ${(item.allocations?.length || 0) > 0 ? 'text-blue-600 bg-blue-50' : 'text-muted-foreground'}`}
                                title="Billwise Allocation"
                                onClick={() => onAllocations(index)}
                                disabled={!item.description || isReadOnly}
                            >
                                <IconReceipt2 size={14} />
                            </Button>
                        )}
                    </div>

                    {/* Remarks */}
                    <div>
                        <Input
                            value={item.remarks || ''}
                            onChange={(e) => onUpdateItem(index, 'remarks', e.target.value)}
                            className="h-7 text-xs"
                            placeholder="Remarks..."
                            disabled={isReadOnly}
                        />
                    </div>

                    {/* Delete */}
                    <div className="flex justify-end opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveItem(index)}
                            className="h-6 w-6 p-0"
                            title="Delete (Ctrl+D)"
                            disabled={isReadOnly}
                            data-exclude-nav="true"
                        >
                            <IconTrash size={14} />
                        </Button>
                    </div>
                </div>
            ))}
        </VoucherItemsTable>
    );
}
