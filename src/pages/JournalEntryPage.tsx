// src/pages/JournalEntryPage.tsx
import { useEffect, useState, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    setJournalDate,
    setJournalReference,
    setJournalNarration,
    addJournalLine,
    updateJournalLine,
    removeJournalLine,
    setJournalTotals,
    resetJournalForm,
    setJournalLoading,
} from '@/store';
import type { RootState, AppDispatch, JournalEntryLine } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import {
    IconPlus,
    IconTrash,
    IconCheck,
    IconX,
    IconAlertTriangle,
} from '@tabler/icons-react';

// Global Voucher Components & Hooks
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';
import { useVoucherRowNavigation } from '@/hooks/useVoucherRowNavigation';

interface LedgerAccount {
    id: number;
    account_name: string;
    account_code: string;
    account_type: string;
}

export default function JournalEntryPage() {
    const dispatch = useDispatch<AppDispatch>();
    const journalState = useSelector((state: RootState) => state.journalEntry);

    const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
    const [isInitializing, setIsInitializing] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);

    const formRef = useRef<HTMLFormElement>(null);
    const dateRef = useRef<HTMLInputElement>(null);

    // Load accounts
    useEffect(() => {
        const loadData = async () => {
            try {
                const accountsData = await invoke<LedgerAccount[]>('get_chart_of_accounts').catch(() => []);
                setAccounts(accountsData);
            } catch (error) {
                toast.error('Failed to load accounts');
            } finally {
                setIsInitializing(false);
            }
        };
        loadData();
    }, [dispatch]);

    // Auto-add first line when data is loaded
    useEffect(() => {
        if (accounts.length > 0 && journalState.lines.length === 0) {
            handleAddLine();
        }
    }, [accounts.length]);

    // Calculate totals
    const calculateTotals = useCallback((lines: JournalEntryLine[]) => {
        const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
        const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
        const difference = Math.abs(totalDebit - totalCredit);
        return { totalDebit, totalCredit, difference };
    }, []);

    const handleUpdateLine = (index: number, field: string, value: any) => {
        const updatedLines = [...journalState.lines];

        if (field === 'account_id') {
            const account = accounts.find(a => a.id === value);
            if (account) {
                updatedLines[index] = {
                    ...updatedLines[index],
                    account_id: value,
                    account_name: account.account_name,
                };
            }
        } else if (field === 'debit') {
            updatedLines[index] = {
                ...updatedLines[index],
                debit: parseFloat(value) || 0,
                credit: 0,
            };
        } else if (field === 'credit') {
            updatedLines[index] = {
                ...updatedLines[index],
                credit: parseFloat(value) || 0,
                debit: 0,
            };
        } else {
            updatedLines[index] = { ...updatedLines[index], [field]: value };
        }

        dispatch(updateJournalLine({ index, data: updatedLines[index] }));
        dispatch(setJournalTotals(calculateTotals(updatedLines)));
    };

    const handleAddLine = () => {
        dispatch(addJournalLine({
            account_id: 0,
            account_name: '',
            debit: 0,
            credit: 0,
            narration: ''
        }));
    };

    const handleRemoveLine = (index: number) => {
        if (journalState.lines.length === 1) {
            toast.error('At least one line is required');
            return;
        }
        const updatedLines = journalState.lines.filter((_, i) => i !== index);
        dispatch(removeJournalLine(index));
        dispatch(setJournalTotals(calculateTotals(updatedLines)));
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        if (journalState.lines.length === 0) {
            toast.error('Add at least one journal line');
            return;
        }

        if (journalState.totals.difference > 0.01) {
            toast.error('Journal entry must be balanced (Debits = Credits)');
            return;
        }

        if (journalState.lines.some(line => !line.account_id)) {
            toast.error('All lines must have an account selected');
            return;
        }

        if (journalState.lines.some(line => line.debit === 0 && line.credit === 0)) {
            toast.error('All lines must have either debit or credit amount');
            return;
        }

        try {
            dispatch(setJournalLoading(true));
            await invoke('create_journal_entry', {
                entry: {
                    ...journalState.form,
                    lines: journalState.lines
                }
            });
            toast.success('Journal entry saved successfully');
            dispatch(resetJournalForm());
            handleAddLine();

            setTimeout(() => dateRef.current?.focus(), 100);
        } catch (error) {
            console.error('Journal entry save error:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to save');
        } finally {
            dispatch(setJournalLoading(false));
        }
    };

    const handleClear = () => {
        dispatch(resetJournalForm());
        handleAddLine();
        setTimeout(() => dateRef.current?.focus(), 100);
    };

    // Global keyboard shortcuts hook
    useVoucherShortcuts({
        onSave: () => formRef.current?.requestSubmit(),
        onNewItem: handleAddLine,
        onClear: handleClear,
        onToggleShortcuts: () => setShowShortcuts(prev => !prev),
        onCloseShortcuts: () => setShowShortcuts(false),
        showShortcuts
    });

    // Row navigation hook
    const { handleRowKeyDown } = useVoucherRowNavigation({
        onRemoveItem: handleRemoveLine,
        onAddItem: handleAddLine
    });

    if (isInitializing) {
        return (
            <div className="flex items-center justify-center h-full bg-background">
                <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
        );
    }

    const isBalanced = journalState.totals.difference < 0.01;

    return (
        <div className="h-full flex flex-col bg-background">
            <VoucherPageHeader
                title="Journal Entry"
                description="Create manual journal entries for adjustments and corrections"
                onToggleShortcuts={() => setShowShortcuts(!showShortcuts)}
            />

            <VoucherShortcutPanel
                show={showShortcuts}
            />

            {/* Form Content */}
            <div className="flex-1 overflow-hidden">
                <form ref={formRef} onSubmit={handleSubmit} className="h-full p-5 max-w-7xl mx-auto flex flex-col gap-4">
                    {/* Master Section */}
                    <div className="bg-card border rounded-lg p-3 space-y-3 shrink-0">
                        <div className="grid grid-cols-6 gap-3">
                            {/* Date */}
                            <div>
                                <Label className="text-xs font-medium mb-1 block">Date *</Label>
                                <Input
                                    ref={dateRef}
                                    type="date"
                                    value={journalState.form.voucher_date}
                                    onChange={(e) => dispatch(setJournalDate(e.target.value))}
                                    className="h-8 text-sm"
                                />
                            </div>

                            {/* Reference */}
                            <div className="col-span-2">
                                <Label className="text-xs font-medium mb-1 block">Reference Number</Label>
                                <Input
                                    value={journalState.form.reference}
                                    onChange={(e) => dispatch(setJournalReference(e.target.value))}
                                    placeholder="Reference/Doc No"
                                    className="h-8 text-sm"
                                />
                            </div>

                            {/* Narration */}
                            <div className="col-span-2">
                                <Label className="text-xs font-medium mb-1 block">Narration</Label>
                                <Input
                                    value={journalState.form.narration}
                                    onChange={(e) => dispatch(setJournalNarration(e.target.value))}
                                    placeholder="Description"
                                    className="h-8 text-sm"
                                />
                            </div>

                            {/* Balance Status */}
                            <div className="col-span-1 flex items-end">
                                {!isBalanced && journalState.lines.length > 0 && (
                                    <div className="flex items-center gap-2 text-xs text-destructive">
                                        <IconAlertTriangle size={16} />
                                        <span>Unbalanced: Difference of ₹{journalState.totals.difference.toFixed(2)}</span>
                                    </div>
                                )}
                                {isBalanced && journalState.lines.length > 0 && (
                                    <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                                        <IconCheck size={16} />
                                        <span>Balanced Entry</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Journal Lines Section */}
                    <div className="bg-card border rounded-lg overflow-hidden flex flex-col shrink-0" style={{ height: 'calc(5 * 3.25rem + 2.5rem + 2.5rem)' }}>
                        {/* Table Header */}
                        <div className="bg-muted/50 border-b shrink-0">
                            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                                <div className="col-span-4">Account</div>
                                <div className="col-span-2 text-right">Debit (Dr)</div>
                                <div className="col-span-2 text-right">Credit (Cr)</div>
                                <div className="col-span-3">Line Narration</div>
                                <div className="w-8"></div>
                            </div>
                        </div>

                        {/* Lines - Scrollable */}
                        <div className="divide-y overflow-y-auto flex-1">
                            {/* Journal Entry Lines */}
                            {journalState.lines.map((line, index) => (
                                <div
                                    key={line.id || index}
                                    data-row-index={index}
                                    className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-muted/30 focus-within:bg-muted/50"
                                    onKeyDown={(e) => handleRowKeyDown(e, index)}
                                >
                                    {/* Account */}
                                    <div className="col-span-4">
                                        <Combobox
                                            value={line.account_id}
                                            options={accounts.map(a => ({
                                                value: a.id,
                                                label: `${a.account_code} - ${a.account_name}`
                                            }))}
                                            onChange={(val) => handleUpdateLine(index, 'account_id', val)}
                                            placeholder="Select Account"
                                            searchPlaceholder="Search accounts..."
                                        />
                                    </div>

                                    {/* Debit */}
                                    <div className="col-span-2">
                                        <Input
                                            type="number"
                                            value={line.debit || ''}
                                            onChange={(e) => handleUpdateLine(index, 'debit', e.target.value)}
                                            className="h-7 text-xs text-right font-mono"
                                            placeholder="0.00"
                                            step="0.01"
                                        />
                                    </div>

                                    {/* Credit */}
                                    <div className="col-span-2">
                                        <Input
                                            type="number"
                                            value={line.credit || ''}
                                            onChange={(e) => handleUpdateLine(index, 'credit', e.target.value)}
                                            className="h-7 text-xs text-right font-mono"
                                            placeholder="0.00"
                                            step="0.01"
                                        />
                                    </div>

                                    {/* Narration */}
                                    <div className="col-span-3">
                                        <Input
                                            value={line.narration || ''}
                                            onChange={(e) => handleUpdateLine(index, 'narration', e.target.value)}
                                            className="h-7 text-xs"
                                            placeholder="Line description"
                                        />
                                    </div>

                                    {/* Delete */}
                                    <div className="flex justify-end">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveLine(index)}
                                            className="h-6 w-6 p-0"
                                            title="Delete (Ctrl+D)"
                                        >
                                            <IconTrash size={14} />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add Line Button */}
                        <div className="bg-muted/30 border-t px-3 py-2 shrink-0">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleAddLine}
                                className="text-xs h-7"
                            >
                                <IconPlus size={14} />
                                Add Line (Ctrl+N)
                            </Button>
                        </div>
                    </div>

                    {/* Totals */}
                    <div className="bg-card border rounded-lg p-3 shrink-0">
                        <div className="flex justify-end gap-8">
                            <div className="text-right">
                                <div className="text-xs text-muted-foreground mb-1">Total Debit</div>
                                <div className="text-lg font-mono font-bold">
                                    ₹ {journalState.totals.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-muted-foreground mb-1">Total Credit</div>
                                <div className="text-lg font-mono font-bold">
                                    ₹ {journalState.totals.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-muted-foreground mb-1">Difference</div>
                                <div className={`text-lg font-mono font-bold ${isBalanced ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                                    ₹ {journalState.totals.difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleClear}
                            className="h-9"
                            title="Clear (Ctrl+K)"
                        >
                            <IconX size={16} />
                            Clear Form
                        </Button>
                        <Button
                            type="submit"
                            disabled={journalState.loading || !isBalanced}
                            className="h-9"
                            title="Save (Ctrl+S)"
                        >
                            <IconCheck size={16} />
                            {journalState.loading ? 'Saving...' : 'Save Journal Entry'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
