import { useEffect, useState, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    setOpeningBalanceDate,
    setOpeningBalanceReference,
    setOpeningBalanceNarration,
    addOpeningBalanceLine,
    updateOpeningBalanceLine,
    removeOpeningBalanceLine,
    setOpeningBalanceTotals,
    resetOpeningBalanceForm,
    setOpeningBalanceLoading,
} from '@/store';
import type { RootState, AppDispatch, OpeningBalanceLine } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import {
    IconPlus,
    IconTrash,
    IconCheck,
    IconX,
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

export default function OpeningBalancePage() {
    const dispatch = useDispatch<AppDispatch>();
    const openingBalanceState = useSelector((state: RootState) => state.openingBalance);

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
        if (accounts.length > 0 && openingBalanceState.lines.length === 0) {
            handleAddLine();
        }
    }, [accounts.length, dispatch]);

    // Calculate totals and auto-balance
    const calculateTotals = useCallback((lines: OpeningBalanceLine[]) => {
        let totalDebit = 0;
        let totalCredit = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            totalDebit += line.debit || 0;
            totalCredit += line.credit || 0;
        }

        const difference = totalDebit - totalCredit;

        return { totalDebit, totalCredit, difference };
    }, []);

    const handleUpdateLine = (index: number, field: string, value: any) => {
        const updatedLines = [...openingBalanceState.lines];

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

        const totals = calculateTotals(updatedLines);

        dispatch(updateOpeningBalanceLine({ index, data: updatedLines[index] }));
        dispatch(setOpeningBalanceTotals({
            totalDebit: totals.totalDebit,
            totalCredit: totals.totalCredit,
            difference: totals.difference,
        }));
    };

    const handleAddLine = () => {
        dispatch(addOpeningBalanceLine({
            account_id: 0,
            account_name: '',
            debit: 0,
            credit: 0,
            narration: ''
        }));
    };

    const handleRemoveLine = (index: number) => {
        if (openingBalanceState.lines.length === 1) {
            toast.error('At least one line is required');
            return;
        }
        const updatedLines = openingBalanceState.lines.filter((_, i) => i !== index);
        dispatch(removeOpeningBalanceLine(index));
        dispatch(setOpeningBalanceTotals(calculateTotals(updatedLines)));
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        if (openingBalanceState.lines.length === 0) {
            toast.error('Add at least one line');
            return;
        }

        if (openingBalanceState.lines.some(line => !line.account_id)) {
            toast.error('All lines must have an account selected');
            return;
        }

        if (openingBalanceState.lines.some(line => (line.debit || 0) <= 0 && (line.credit || 0) <= 0)) {
            toast.error('All lines must have either debit or credit amount greater than zero');
            return;
        }

        try {
            dispatch(setOpeningBalanceLoading(true));
            await invoke('create_opening_balance', {
                entry: {
                    form: openingBalanceState.form,
                    lines: openingBalanceState.lines
                }
            });
            toast.success('Opening balance saved successfully');
            dispatch(resetOpeningBalanceForm());
            handleAddLine();

            setTimeout(() => dateRef.current?.focus(), 100);
        } catch (error) {
            console.error('Opening balance save error:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to save');
        } finally {
            dispatch(setOpeningBalanceLoading(false));
        }
    };

    const handleClear = () => {
        dispatch(resetOpeningBalanceForm());
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

    return (
        <div className="h-full flex flex-col bg-background">
            <VoucherPageHeader
                title="Opening Balance"
                description="Set up initial account balances for the financial year"
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
                                <Label className="text-xs font-medium mb-1 block">As on Date *</Label>
                                <Input
                                    ref={dateRef}
                                    type="date"
                                    value={openingBalanceState.form.voucher_date}
                                    onChange={(e) => dispatch(setOpeningBalanceDate(e.target.value))}
                                    className="h-8 text-sm"
                                />
                            </div>

                            {/* Reference */}
                            <div className="col-span-2">
                                <Label className="text-xs font-medium mb-1 block">Reference Number</Label>
                                <Input
                                    value={openingBalanceState.form.reference}
                                    onChange={(e) => dispatch(setOpeningBalanceReference(e.target.value))}
                                    placeholder="Reference/Doc No"
                                    className="h-8 text-sm"
                                />
                            </div>

                            {/* Narration */}
                            <div className="col-span-2">
                                <Label className="text-xs font-medium mb-1 block">Narration</Label>
                                <Input
                                    value={openingBalanceState.form.narration}
                                    onChange={(e) => dispatch(setOpeningBalanceNarration(e.target.value))}
                                    placeholder="Description"
                                    className="h-8 text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Lines Section */}
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
                            {openingBalanceState.lines.map((line, index) => (
                                <div
                                    key={line.id || index}
                                    data-row-index={index}
                                    className={`grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-muted/30 focus-within:bg-muted/50`}
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
                        <div className="flex justify-end">
                            <div className="text-right">
                                <div className="text-xs text-muted-foreground mb-1">Total</div>
                                <div className="text-lg font-mono font-bold">
                                    ₹ {(openingBalanceState.totals.totalDebit || openingBalanceState.totals.totalCredit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                            disabled={openingBalanceState.loading}
                            className="h-9"
                            title="Save (Ctrl+S)"
                        >
                            <IconCheck size={16} />
                            {openingBalanceState.loading ? 'Saving...' : 'Save Opening Balance'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
