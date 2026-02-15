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
    setOpeningBalanceMode,
    setOpeningBalanceCurrentVoucherId,
    setOpeningBalanceCurrentVoucherNo,
    setOpeningBalanceHasUnsavedChanges,
    setOpeningBalanceNavigationData
} from '@/store';
import type { RootState, AppDispatch, OpeningBalanceLine } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
    IconCheck,
    IconX,
} from '@tabler/icons-react';

// Global Voucher Components & Hooks
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';

import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';

import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
import { VoucherJournalSection } from '@/components/voucher/VoucherJournalSection';

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
    const [isListViewOpen, setIsListViewOpen] = useState(false);

    const formRef = useRef<HTMLFormElement>(null);
    const dateRef = useRef<HTMLInputElement>(null);

    // Load accounts
    useEffect(() => {
        const loadData = async () => {
            try {
                const accountsData = await invoke<LedgerAccount[]>('get_chart_of_accounts').catch(() => []);
                // Filter for eligible accounts if needed? Usually any account can have opening balance except maybe some system ones.
                // Opening Balance Adjustment (3004) should ideally be hidden or auto-handled.
                setAccounts(accountsData);
            } catch (error) {
                toast.error('Failed to load accounts');
            } finally {
                setIsInitializing(false);
            }
        };
        loadData();
    }, [dispatch]);

    // Load Voucher Effect
    const loadVoucher = useCallback(async (id: string) => {
        try {
            dispatch(setOpeningBalanceLoading(true));
            dispatch(setOpeningBalanceHasUnsavedChanges(false));
            const entry = await invoke<any>('get_opening_balance', { id });
            const lines = await invoke<any[]>('get_opening_balance_lines', { voucherId: id });

            dispatch(resetOpeningBalanceForm());

            // Populate Form
            dispatch(setOpeningBalanceCurrentVoucherNo(entry.voucher_no));
            dispatch(setOpeningBalanceDate(entry.voucher_date));
            dispatch(setOpeningBalanceReference(entry.reference || ''));
            dispatch(setOpeningBalanceNarration(entry.narration || ''));

            // Add lines
            for (const line of lines) {
                dispatch(addOpeningBalanceLine(line));
            }

            // Recalculate totals
            const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
            const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
            const difference = totalDebit - totalCredit;
            // In OB, difference is just net since it auto-balances against equity/suspense usually, but here we enforce explicit dual entry?
            // Wait, create_opening_balance logic:
            // "Insert journal entries for each line - create dual entries"
            // "Second entry: balancing entry in Opening Balance Adjustment account"
            // So the USER only enters one side (Debit OR Credit) for each account.
            // The system balances it automatically per line.
            // So the 'difference' in the UI state is just the sum of user entries, which doesn't NEED to be zero.
            // But usually opening balances for a company should theoretically balance if complete?
            // But here the backend auto-balances EACH line individually against a suspense account.
            // So `difference` is just informational.

            dispatch(setOpeningBalanceTotals({ totalDebit, totalCredit, difference }));

            dispatch(setOpeningBalanceMode('viewing'));
            dispatch(setOpeningBalanceCurrentVoucherId(id));
            dispatch(setOpeningBalanceHasUnsavedChanges(false));
        } catch (error) {
            console.error('Failed to load opening balance:', error);
            toast.error('Failed to load opening balance');
            dispatch(setOpeningBalanceMode('new'));
        } finally {
            dispatch(setOpeningBalanceLoading(false));
            setIsListViewOpen(false);
        }
    }, [dispatch]);

    // Hook for navigation
    const {
        handleNavigateNext,
        handleNew,
        handleCancel
    } = useVoucherNavigation({
        voucherType: 'opening_balance',
        sliceState: openingBalanceState,
        actions: {
            setMode: setOpeningBalanceMode,
            setCurrentVoucherId: setOpeningBalanceCurrentVoucherId,
            setCurrentVoucherNo: setOpeningBalanceCurrentVoucherNo,
            setNavigationData: setOpeningBalanceNavigationData,
            setHasUnsavedChanges: setOpeningBalanceHasUnsavedChanges,
            resetForm: resetOpeningBalanceForm,
        },
        onLoadVoucher: loadVoucher,
    });

    // Auto-add first line when data is loaded
    useEffect(() => {
        if (openingBalanceState.mode === 'new' && accounts.length > 0 && openingBalanceState.lines.length === 0) {
            handleAddLine();
        }
    }, [accounts.length, openingBalanceState.mode]);

    // Calculate totals
    const calculateTotals = useCallback((lines: OpeningBalanceLine[]) => {
        const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
        const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
        const difference = totalDebit - totalCredit;
        return { totalDebit, totalCredit, difference };
    }, []);

    const handleUpdateLine = (index: number, field: string, value: any) => {

        dispatch(setOpeningBalanceHasUnsavedChanges(true));

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

        dispatch(updateOpeningBalanceLine({ index, data: updatedLines[index] }));
        dispatch(setOpeningBalanceTotals(calculateTotals(updatedLines)));
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
        dispatch(setOpeningBalanceHasUnsavedChanges(true));
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

            if (openingBalanceState.mode === 'editing' && openingBalanceState.currentVoucherId) {
                await invoke('update_opening_balance', {
                    id: openingBalanceState.currentVoucherId,
                    entry: {
                        form: openingBalanceState.form,
                        lines: openingBalanceState.lines
                    }
                });
                toast.success('Opening balance updated successfully');
                dispatch(setOpeningBalanceMode('viewing'));
                dispatch(setOpeningBalanceHasUnsavedChanges(false));
            } else {
                await invoke('create_opening_balance', {
                    entry: {
                        form: openingBalanceState.form,
                        lines: openingBalanceState.lines
                    }
                });
                toast.success('Opening balance saved successfully');
                dispatch(resetOpeningBalanceForm());
                handleAddLine();
                dispatch(setOpeningBalanceMode('new'));
                dispatch(setOpeningBalanceHasUnsavedChanges(false));
                setTimeout(() => dateRef.current?.focus(), 100);
            }

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
        dispatch(setOpeningBalanceMode('new'));
        dispatch(setOpeningBalanceCurrentVoucherId(null));
        dispatch(setOpeningBalanceCurrentVoucherNo(undefined));
        dispatch(setOpeningBalanceHasUnsavedChanges(false));
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
                description="Record account opening balances"
                mode={openingBalanceState.mode}
                voucherNo={openingBalanceState.currentVoucherNo}
                isUnsaved={openingBalanceState.hasUnsavedChanges}
                hasPrevious={openingBalanceState.navigationData.hasPrevious}
                onNavigateNext={handleNavigateNext}
                onNew={handleNew}
                onEdit={() => dispatch(setOpeningBalanceMode('editing'))}
                onCancel={handleCancel}
                onSave={() => formRef.current?.requestSubmit()}
                onToggleShortcuts={() => setShowShortcuts(!showShortcuts)}
                onListView={() => setIsListViewOpen(true)}
            />

            <VoucherListViewSheet
                open={isListViewOpen}
                onOpenChange={setIsListViewOpen}
                title="Opening Balance Vouchers"
                voucherType="opening_balance"
                onSelectVoucher={(id) => loadVoucher(id)}
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
                                    value={openingBalanceState.form.voucher_date}
                                    onChange={(e) => {
                                        dispatch(setOpeningBalanceDate(e.target.value));
                                        dispatch(setOpeningBalanceHasUnsavedChanges(true));
                                    }}
                                    className="h-8 text-sm"
                                    disabled={openingBalanceState.mode === 'viewing'}
                                />
                            </div>

                            {/* Reference */}
                            <div className="col-span-2">
                                <Label className="text-xs font-medium mb-1 block">Reference Number</Label>
                                <Input
                                    value={openingBalanceState.form.reference}
                                    onChange={(e) => {
                                        dispatch(setOpeningBalanceReference(e.target.value));
                                        dispatch(setOpeningBalanceHasUnsavedChanges(true));
                                    }}
                                    placeholder="Reference/Doc No"
                                    className="h-8 text-sm"
                                    disabled={openingBalanceState.mode === 'viewing'}
                                />
                            </div>

                            {/* Narration */}
                            <div className="col-span-3">
                                <Label className="text-xs font-medium mb-1 block">Narration</Label>
                                <Input
                                    value={openingBalanceState.form.narration}
                                    onChange={(e) => {
                                        dispatch(setOpeningBalanceNarration(e.target.value));
                                        dispatch(setOpeningBalanceHasUnsavedChanges(true));
                                    }}
                                    placeholder="Description"
                                    className="h-8 text-sm"
                                    disabled={openingBalanceState.mode === 'viewing'}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Lines Section */}
                    <VoucherJournalSection
                        lines={openingBalanceState.lines}
                        accounts={accounts}
                        isReadOnly={openingBalanceState.mode === 'viewing'}
                        onAddLine={handleAddLine}
                        onRemoveLine={handleRemoveLine}
                        onUpdateLine={handleUpdateLine}
                        addItemLabel="Add Line (Ctrl+N)"
                        onSectionExit={() => {
                            setTimeout(() => {
                                document.getElementById('voucher-save-btn')?.focus();
                            }, 50);
                        }}
                    />

                    {/* Totals */}
                    <div className="bg-card border rounded-lg p-3 shrink-0">
                        <div className="flex justify-end gap-8">
                            <div className="text-right">
                                <div className="text-xs text-muted-foreground mb-1">Total Debit</div>
                                <div className="text-lg font-mono font-bold">
                                    ₹ {openingBalanceState.totals.totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-muted-foreground mb-1">Total Credit</div>
                                <div className="text-lg font-mono font-bold">
                                    ₹ {openingBalanceState.totals.totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                            id="voucher-save-btn"
                            type="submit"
                            disabled={openingBalanceState.loading}
                            className="h-9"
                            title="Save (Ctrl+S)"
                        >
                            <IconCheck size={16} />
                            {openingBalanceState.loading ? 'Saving...' : (openingBalanceState.mode === 'editing' ? 'Update Opening Balance' : 'Save Opening Balance')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
