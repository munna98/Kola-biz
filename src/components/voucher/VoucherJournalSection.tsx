import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { IconTrash, IconPlus } from '@tabler/icons-react';
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
    onAddLine: (index?: number) => void;
    onRemoveLine: (index: number) => void;
    onUpdateLine: (index: number, field: string, value: any) => void;
    header?: React.ReactNode;
    addItemLabel?: string;
    disableAdd?: boolean;
    onFocusRow?: (index: number) => void;
    onSectionExit?: () => void;
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
    onFocusRow,
    onSectionExit
}: VoucherJournalSectionProps) {

    // Internal row navigation handling
    const { handleRowKeyDown } = useVoucherRowNavigation({
        onRemoveItem: onRemoveLine,
        onAddItem: onAddLine
    });

    const gridStyle = {
        gridTemplateColumns: '24px 4fr 1.5fr 1.5fr 4fr 64px',
        display: 'grid',
        gap: '0.5rem',
        alignItems: 'center'
    };

    const defaultHeader = (
        <div style={gridStyle} className="px-3 py-0.5 text-xs font-medium text-muted-foreground border-b bg-muted/20">
            <div className="text-center">#</div>
            <div className="px-1">Account</div>
            <div className="text-right px-1">Debit (Dr)</div>
            <div className="text-right px-1">Credit (Cr)</div>
            <div className="px-1">Line Narration</div>
            <div className="w-16"></div>
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
                    style={gridStyle}
                    className="group px-3 py-0.5 items-center hover:bg-muted/30 focus-within:bg-muted/50 border-b last:border-0"
                    onKeyDown={(e) => handleRowKeyDown(e, index)}
                >
                    {/* Serial Number */}
                    <div className="h-7 text-xs w-full flex items-center justify-center font-medium text-muted-foreground/70 cursor-default select-none pr-1">
                        {index + 1}
                    </div>

                    {/* Account */}
                    <div onFocus={() => onFocusRow?.(index)}>
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
                            onEmptyEnter={() => {
                                // If it's not the first row, remove it and exit section
                                if (index > 0) {
                                    onRemoveLine(index);
                                    onSectionExit?.();
                                }
                            }}
                        />
                    </div>

                    {/* Debit */}
                    <div onFocus={() => onFocusRow?.(index)}>
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
                    <div onFocus={() => onFocusRow?.(index)}>
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
                    <div>
                        <Input
                            value={line.narration || ''}
                            onChange={(e) => onUpdateLine(index, 'narration', e.target.value)}
                            className="h-7 text-xs"
                            placeholder="Line description"
                            disabled={isReadOnly}
                        />
                    </div>

                    {/* Delete */}
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onAddLine(index + 1)}
                            className="h-6 w-6 p-0"
                            title="Insert Line Below"
                            disabled={isReadOnly}
                        >
                            <IconPlus size={14} />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemoveLine(index)}
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
