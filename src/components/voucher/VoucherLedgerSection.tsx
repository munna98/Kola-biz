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

    const defaultHeader = (
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground items-center">
            <div className="col-span-5 flex justify-between items-center">
                <span>Account/Ledger</span>
            </div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-4">Remarks</div>
            <div className="col-span-1"></div>
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
                    className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-muted/30 focus-within:bg-muted/50"
                    onKeyDown={(e) => handleRowKeyDown(e, index)}
                >
                    {/* Ledger Selection */}
                    <div className="col-span-5 flex gap-1 items-center" onFocus={() => onFocusRow?.(index)}>
                        <Combobox
                            value={item.description}
                            options={ledgers.map(l => ({ value: l.account_name, label: l.account_name }))}
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
                    <div className="col-span-2 flex items-start gap-1">
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
                    <div className="col-span-4">
                        <Input
                            value={item.remarks || ''}
                            onChange={(e) => onUpdateItem(index, 'remarks', e.target.value)}
                            className="h-7 text-xs"
                            placeholder="Remarks..."
                            disabled={isReadOnly}
                        />
                    </div>

                    {/* Delete */}
                    <div className="flex justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveItem(index)}
                            className="h-6 w-6 p-0"
                            title="Delete (Ctrl+D)"
                            disabled={isReadOnly}
                        >
                            <IconTrash size={14} />
                        </Button>
                    </div>
                </div>
            ))}
        </VoucherItemsTable>
    );
}
