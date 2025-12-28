import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { IconTrash } from '@tabler/icons-react';
import { VoucherItemsTable } from '@/components/voucher/VoucherItemsTable';
import { useVoucherRowNavigation } from '@/hooks/useVoucherRowNavigation';

interface LedgerAccount {
    id: number;
    account_name: string;
    account_code: string;
}

export interface VoucherJournalSectionProps {
    lines: any[];
    accounts: LedgerAccount[];
    isReadOnly: boolean;
    onAddLine: () => void;
    onRemoveLine: (index: number) => void;
    onUpdateLine: (index: number, field: string, value: any) => void;
    header?: React.ReactNode;
    addItemLabel?: string;
    disableAdd?: boolean;
    onFocusRow?: (index: number) => void;
}

export function VoucherJournalSection({
    lines,
    accounts,
    isReadOnly,
    onAddLine,
    onRemoveLine,
    onUpdateLine,
    header,
    addItemLabel,
    disableAdd,
    onFocusRow
}: VoucherJournalSectionProps) {

    // Internal row navigation handling
    const { handleRowKeyDown } = useVoucherRowNavigation({
        onRemoveItem: onRemoveLine,
        onAddItem: onAddLine
    });

    const defaultHeader = (
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
            <div className="col-span-4">Account</div>
            <div className="col-span-2 text-right">Debit (Dr)</div>
            <div className="col-span-2 text-right">Credit (Cr)</div>
            <div className="col-span-3">Line Narration</div>
            <div className="w-8"></div>
        </div>
    );

    return (
        <VoucherItemsTable
            header={header || defaultHeader}
            onAddItem={onAddLine}
            addItemLabel={addItemLabel}
            disableAdd={disableAdd ?? isReadOnly}
        >
            {lines.map((line, index) => (
                <div
                    key={line.id || index}
                    data-row-index={index}
                    className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-muted/30 focus-within:bg-muted/50"
                    onKeyDown={(e) => handleRowKeyDown(e, index)}
                >
                    {/* Account */}
                    <div className="col-span-4" onFocus={() => onFocusRow?.(index)}>
                        <Combobox
                            value={line.account_id}
                            options={accounts.map(a => ({
                                value: a.id,
                                label: `${a.account_code || ''} - ${a.account_name}`.replace(/^- /, '') // Handle optional code
                            }))}
                            onChange={(val) => onUpdateLine(index, 'account_id', val)}
                            placeholder="Select Account"
                            searchPlaceholder="Search accounts..."
                            disabled={isReadOnly}
                        />
                    </div>

                    {/* Debit */}
                    <div className="col-span-2" onFocus={() => onFocusRow?.(index)}>
                        <Input
                            type="number"
                            value={line.debit || ''}
                            onChange={(e) => onUpdateLine(index, 'debit', e.target.value)}
                            className="h-7 text-xs text-right font-mono"
                            placeholder="0.00"
                            step="0.01"
                            onFocus={(e) => e.target.select()}
                            disabled={isReadOnly}
                        />
                    </div>

                    {/* Credit */}
                    <div className="col-span-2" onFocus={() => onFocusRow?.(index)}>
                        <Input
                            type="number"
                            value={line.credit || ''}
                            onChange={(e) => onUpdateLine(index, 'credit', e.target.value)}
                            className="h-7 text-xs text-right font-mono"
                            placeholder="0.00"
                            step="0.01"
                            onFocus={(e) => e.target.select()}
                            disabled={isReadOnly}
                        />
                    </div>

                    {/* Narration */}
                    <div className="col-span-3">
                        <Input
                            value={line.narration || ''}
                            onChange={(e) => onUpdateLine(index, 'narration', e.target.value)}
                            className="h-7 text-xs"
                            placeholder="Line description"
                            disabled={isReadOnly}
                        />
                    </div>

                    {/* Delete */}
                    <div className="flex justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveLine(index)}
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
