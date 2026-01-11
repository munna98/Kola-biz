import { useEffect, useState, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    setReceiptAccount,
    setReceiptDate,
    setReceiptReference,
    setReceiptNarration,
    addReceiptItem,
    updateReceiptItem,
    removeReceiptItem,
    setReceiptTotals,
    resetReceiptForm,
    setReceiptLoading,
    setReceiptMode,
    setReceiptCurrentVoucherId,
    setReceiptCurrentVoucherNo,
    setReceiptHasUnsavedChanges,
    setReceiptNavigationData,
    setReceiptMethod,
    setReceiptCreatedFromInvoiceId,
    setReceiptCreatedByName
} from '@/store';
import type { RootState, AppDispatch, ReceiptItem } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import {
    IconCheck,
    IconX,
} from '@tabler/icons-react';
import BillAllocationDialog, { AllocationData } from '@/components/dialogs/BillAllocationDialog';

// Global Voucher Components & Hooks
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';

import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { VoucherLedgerSection } from '@/components/voucher/VoucherLedgerSection';
import PaymentManagementDialog from '@/components/dialogs/PaymentManagementDialog';
import ChartOfAccountDialog from '@/components/dialogs/ChartOfAccountDialog';
import { AccountGroup, api } from '@/lib/tauri';

interface AccountData {
    id: number;
    name: string;
}

interface LedgerAccount {
    id: number;
    account_name: string;
}

export default function ReceiptPage() {
    const dispatch = useDispatch<AppDispatch>();
    const receiptState = useSelector((state: RootState) => state.receipt);
    const user = useSelector((state: RootState) => state.auth.user);

    const [depositToAccounts, setDepositToAccounts] = useState<AccountData[]>([]);
    const [receivedFromLedgers, setReceivedFromLedgers] = useState<LedgerAccount[]>([]);
    const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
    const [isInitializing, setIsInitializing] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showQuickDialog, setShowQuickDialog] = useState(false);
    const [showListView, setShowListView] = useState(false);

    // Create Account State
    const [showCreateAccount, setShowCreateAccount] = useState(false);
    const [newAccountName, setNewAccountName] = useState('');
    const [creatingForIndex, setCreatingForIndex] = useState<number | null>(null);

    // Allocation & Balance State
    const [allocatingRowIndex, setAllocatingRowIndex] = useState<number | null>(null);
    const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
    const [rowBalances, setRowBalances] = useState<Record<number, number>>({});

    const formRef = useRef<HTMLFormElement>(null);
    const depositToRef = useRef<HTMLDivElement>(null);

    // Load Data
    useEffect(() => {
        const loadData = async () => {
            try {
                const [cashBankData, allLedgersData, allGroups] = await Promise.all([
                    invoke<AccountData[]>('get_cash_bank_accounts').catch(() => []),
                    invoke<LedgerAccount[]>('get_chart_of_accounts').catch(() => []),
                    api.accountGroups.list().catch(() => []),
                ]);
                setDepositToAccounts(cashBankData);
                setReceivedFromLedgers(allLedgersData);
                setAccountGroups(allGroups);

                if (cashBankData.length > 0 && receiptState.form.account_id === 0) {
                    dispatch(setReceiptAccount({ id: cashBankData[0].id, name: cashBankData[0].name }));
                }
            } catch (error) {
                toast.error('Failed to load accounts');
            } finally {
                setIsInitializing(false);
            }
        };
        loadData();
    }, [dispatch]);

    // Auto-add first item when data is loaded
    useEffect(() => {
        if (receivedFromLedgers.length > 0 && receiptState.items.length === 0) {
            handleAddItem();
        }
    }, [receivedFromLedgers.length]);

    // Calculations
    const calculateTotals = useCallback((items: ReceiptItem[]) => {
        const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
        return { subtotal: total, tax: 0, grandTotal: total };
    }, []);

    const handleUpdateItem = (index: number, field: string, value: any) => {
        const updatedItems = [...receiptState.items];
        updatedItems[index] = { ...updatedItems[index], [field]: value };

        dispatch(updateReceiptItem({ index, data: { [field]: value } }));

        if (field === 'description') {
            const ledger = receivedFromLedgers.find(l => l.account_name === value);
            if (ledger) {
                // Update account_id alongside description
                dispatch(updateReceiptItem({ index, data: { account_id: ledger.id } }));

                // Fetch Balance
                invoke<number>('get_account_balance', { accountId: ledger.id })
                    .then(bal => setRowBalances(prev => ({ ...prev, [index]: bal })))
                    .catch(console.error);
            }
        }

        const newTotals = calculateTotals(updatedItems);
        dispatch(setReceiptTotals(newTotals));
    };

    const handleAllocationConfirm = (allocations: AllocationData[]) => {
        if (allocatingRowIndex !== null) {
            handleUpdateItem(allocatingRowIndex, 'allocations', allocations);
            setAllocatingRowIndex(null);
        }
    };

    const handleAddItem = () => {
        dispatch(addReceiptItem({ description: '', amount: 0, tax_rate: 0 }));
    };

    const handleRemoveItem = (index: number) => {
        if (receiptState.items.length === 1) {
            toast.error('At least one item is required');
            return;
        }
        const updatedItems = receiptState.items.filter((_, i) => i !== index);
        dispatch(removeReceiptItem(index));
        dispatch(setReceiptTotals(calculateTotals(updatedItems)));
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!receiptState.form.account_id) return toast.error('Select "Deposit To" account');

        if (receiptState.items.length === 0) {
            toast.error('Add at least one item');
            return;
        }

        // Validate each item
        const hasEmptyItems = receiptState.items.some(item => !item.description || item.amount <= 0);
        if (hasEmptyItems) {
            toast.error('All items must have a ledger selected and a non-zero amount');
            return;
        }

        try {
            dispatch(setReceiptLoading(true));

            if (receiptState.mode === 'editing' && receiptState.currentVoucherId) {
                await invoke('update_receipt', {
                    id: receiptState.currentVoucherId,
                    receipt: { ...receiptState.form, items: receiptState.items }
                });
                toast.success('Receipt updated successfully');
                dispatch(setReceiptLoading(false));

                dispatch(resetReceiptForm());
                handleAddItem();
                dispatch(setReceiptHasUnsavedChanges(false));
                dispatch(setReceiptMode('new'));
                return;
            }

            await invoke('create_receipt', { receipt: { ...receiptState.form, items: receiptState.items, user_id: user?.id.toString() } });
            toast.success('Receipt saved successfully');
            dispatch(resetReceiptForm());
            handleAddItem();

            // Focus back to deposit to after save
            setTimeout(() => depositToRef.current?.querySelector('button')?.focus(), 100);
        } catch (error) {
            toast.error('Failed to save');
        } finally {
            dispatch(setReceiptLoading(false));
        }
    };

    const handleClear = () => {
        dispatch(resetReceiptForm());
        handleAddItem();
        setTimeout(() => depositToRef.current?.querySelector('button')?.focus(), 100);
    };

    const loadVoucher = async (id: string) => {
        try {
            dispatch(setReceiptLoading(true));
            dispatch(setReceiptHasUnsavedChanges(false));
            dispatch(resetReceiptForm());

            const receipt = await invoke<any>('get_receipt', { id });
            const items = await invoke<any[]>('get_receipt_items', { voucherId: id });

            // Populate Form
            dispatch(setReceiptCurrentVoucherNo(receipt.voucher_no));
            dispatch(setReceiptAccount({ id: receipt.account_id, name: receipt.account_name }));
            dispatch(setReceiptDate(receipt.voucher_date));
            dispatch(setReceiptReference(receipt.reference_number || ''));
            dispatch(setReceiptNarration(receipt.narration || ''));
            dispatch(setReceiptMethod(receipt.receipt_method || 'bank'));
            dispatch(setReceiptCreatedFromInvoiceId(receipt.created_from_invoice_id || null));

            // Set Creator Name
            dispatch(setReceiptCreatedByName(receipt.created_by_name));

            // Populate Items
            items.forEach(item => {
                dispatch(addReceiptItem({
                    description: item.description,
                    account_id: item.ledger_id || undefined,
                    amount: item.amount,
                    tax_rate: item.tax_rate,
                    remarks: item.remarks
                }));
            });

            // Use totals from backend
            dispatch(setReceiptTotals({
                subtotal: receipt.subtotal || 0,
                tax: receipt.tax_amount || 0,
                grandTotal: receipt.total_amount || 0
            }));

            dispatch(setReceiptMode('viewing'));
            dispatch(setReceiptHasUnsavedChanges(false));

        } catch (error) {
            console.error("Failed to load receipt", error);
            toast.error("Failed to load receipt");
        } finally {
            dispatch(setReceiptLoading(false));
        }
    };

    const {
        handleNavigatePrevious,
        handleNavigateNext,
        handleListSelect,
        handleNew,
        handleEdit,
        handleCancel,
        handleDelete,
    } = useVoucherNavigation({
        voucherType: 'receipt',
        sliceState: receiptState,
        actions: {
            setMode: setReceiptMode,
            setCurrentVoucherId: setReceiptCurrentVoucherId,
            setNavigationData: setReceiptNavigationData,
            setHasUnsavedChanges: setReceiptHasUnsavedChanges,
            resetForm: resetReceiptForm
        },
        onLoadVoucher: loadVoucher
    });

    const handleDeleteVoucher = async () => {
        const confirmed = await handleDelete();
        if (confirmed && receiptState.currentVoucherId) {
            try {
                dispatch(setReceiptLoading(true));
                await invoke('delete_receipt', { id: receiptState.currentVoucherId });
                toast.success('Receipt deleted');
                handleNew();
            } catch (e) {
                toast.error('Failed to delete receipt');
                console.error(e);
            } finally {
                dispatch(setReceiptLoading(false));
            }
        }
    };

    // Global keyboard shortcuts hook
    useVoucherShortcuts({
        onSave: () => formRef.current?.requestSubmit(),
        onNewItem: handleAddItem,
        onClear: handleNew,
        onToggleShortcuts: () => setShowShortcuts(prev => !prev),
        onCloseShortcuts: () => setShowShortcuts(false),
        onQuickEntry: () => setShowQuickDialog(true),
        showShortcuts
    });

    // Global "Alt+C" Shortcut for creating account
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                setNewAccountName('');
                setCreatingForIndex(null);
                setShowCreateAccount(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, []);

    const handleCreateAccountSave = async (newAccount?: any) => {
        // Refresh ledgers
        try {
            const allLedgersData = await invoke<LedgerAccount[]>('get_chart_of_accounts');
            setReceivedFromLedgers(allLedgersData);

            if (newAccount) {
                // If created for a specific row, update that row
                if (creatingForIndex !== null) {
                    dispatch(updateReceiptItem({
                        index: creatingForIndex,
                        data: {
                            description: newAccount.account_name,
                            account_id: newAccount.id
                        }
                    }));

                    // Fetch Balance for the new account
                    invoke<number>('get_account_balance', { accountId: newAccount.id })
                        .then(bal => setRowBalances(prev => ({ ...prev, [creatingForIndex]: bal })))
                        .catch(console.error);
                }
            }
        } catch (e) {
            console.error("Failed to refresh accounts after create", e);
        }
        setShowCreateAccount(false);
        setCreatingForIndex(null);
    };



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
                title="Receipt Voucher"
                description="Record money received into bank or cash"
                mode={receiptState.mode}
                voucherNo={receiptState.currentVoucherNo}
                voucherDate={receiptState.form.voucher_date}
                createdBy={receiptState.created_by_name}
                isUnsaved={receiptState.hasUnsavedChanges}
                hasPrevious={receiptState.navigationData.hasPrevious}
                hasNext={receiptState.navigationData.hasNext}
                onToggleShortcuts={() => setShowShortcuts(!showShortcuts)}
                onNavigatePrevious={handleNavigatePrevious}
                onNavigateNext={handleNavigateNext}
                onEdit={handleEdit}
                onSave={() => formRef.current?.requestSubmit()}
                onCancel={handleCancel}
                onDelete={handleDeleteVoucher}
                onNew={handleNew}
                onListView={() => setShowListView(true)}
                editDisabled={!!receiptState.form.created_from_invoice_id}
                deleteDisabled={!!receiptState.form.created_from_invoice_id}
            />

            <VoucherShortcutPanel
                show={showShortcuts}
            />

            <VoucherListViewSheet
                open={showListView}
                onOpenChange={setShowListView}
                voucherType="receipt"
                onSelectVoucher={handleListSelect}
                title="Receipt Vouchers"
            />

            <PaymentManagementDialog
                mode="receipt"
                open={showQuickDialog}
                onOpenChange={setShowQuickDialog}
                onSuccess={() => {
                    // Optionally reload or refresh data after quick receipt
                    toast.success('Receipt recorded!');
                }}
            />

            {allocatingRowIndex !== null && receiptState.items[allocatingRowIndex] && (
                <BillAllocationDialog
                    open={true}
                    onOpenChange={(open) => !open && setAllocatingRowIndex(null)}
                    partyId={receivedFromLedgers.find(l => l.account_name === receiptState.items[allocatingRowIndex].description)?.id || 0}
                    amountToAllocate={receiptState.items[allocatingRowIndex].amount || 0}
                    allocations={receiptState.items[allocatingRowIndex].allocations || []}
                    onConfirm={handleAllocationConfirm}
                />
            )}

            <ChartOfAccountDialog
                open={showCreateAccount}
                onOpenChange={setShowCreateAccount}
                accountToEdit={null}
                onSave={handleCreateAccountSave}
                accountGroups={accountGroups}
                initialName={newAccountName}
            />

            {/* Form Content */}
            <div className="flex-1 overflow-hidden">
                <form ref={formRef} onSubmit={handleSubmit} className="h-full p-5 max-w-7xl mx-auto flex flex-col gap-4">
                    {/* Master Section */}
                    <div className="bg-card border rounded-lg p-3 space-y-3 shrink-0">
                        <div className="grid grid-cols-6 gap-3">
                            {/* Deposit To */}
                            <div ref={depositToRef} className="col-span-2">
                                <Label className="text-xs font-medium mb-1 block">Deposit To (Bank/Cash) *</Label>
                                <Combobox
                                    value={receiptState.form.account_id}
                                    options={depositToAccounts.map(a => ({ value: a.id, label: a.name }))}
                                    onChange={(val) => {
                                        const acc = depositToAccounts.find(a => a.id === val);
                                        if (acc) dispatch(setReceiptAccount({ id: acc.id, name: acc.name }));
                                    }}
                                    placeholder="Select destination account"
                                    searchPlaceholder="Search accounts..."
                                    disabled={receiptState.mode === 'viewing'}
                                    onCreate={(name) => {
                                        setNewAccountName(name);
                                        setCreatingForIndex(null);
                                        setShowCreateAccount(true);
                                    }}
                                />
                            </div>

                            {/* Date */}
                            <div>
                                <Label className="text-xs font-medium mb-1 block">Date *</Label>
                                <Input
                                    type="date"
                                    value={receiptState.form.voucher_date}
                                    onChange={(e) => dispatch(setReceiptDate(e.target.value))}
                                    className="h-8 text-sm"
                                    disabled={receiptState.mode === 'viewing'}
                                />
                            </div>

                            {/* Reference */}
                            <div className="col-span-1">
                                <Label className="text-xs font-medium mb-1 block">Reference Number</Label>
                                <Input
                                    value={receiptState.form.reference_number}
                                    onChange={(e) => dispatch(setReceiptReference(e.target.value))}
                                    placeholder="Cheque/Ref No"
                                    className="h-8 text-sm"
                                    disabled={receiptState.mode === 'viewing'}
                                />
                            </div>

                            {/* Narration */}
                            <div className="col-span-2">
                                <Label className="text-xs font-medium mb-1 block">Narration</Label>
                                <Input
                                    value={receiptState.form.narration}
                                    onChange={(e) => dispatch(setReceiptNarration(e.target.value))}
                                    placeholder="Enter details about this receipt..."
                                    className="h-8 text-sm"
                                    disabled={receiptState.mode === 'viewing'}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Items Section */}
                    <VoucherLedgerSection
                        items={receiptState.items}
                        ledgers={receivedFromLedgers}
                        isReadOnly={receiptState.mode === 'viewing'}
                        onAddItem={handleAddItem}
                        onRemoveItem={handleRemoveItem}
                        onUpdateItem={handleUpdateItem}
                        onAllocations={setAllocatingRowIndex}
                        addItemLabel="Add Item (Ctrl+N)"
                        disableAdd={receiptState.mode === 'viewing'}
                        rowBalances={rowBalances}
                        onCreateLedger={(name, index) => {
                            setNewAccountName(name);
                            setCreatingForIndex(index);
                            setShowCreateAccount(true);
                        }}
                        onFocusRow={setFocusedRowIndex}
                        header={
                            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground items-center">
                                <div className="col-span-5 flex justify-between items-center">
                                    <span>Received From (Account/Ledger)</span>
                                </div>
                                <div className="col-span-2 text-right">Amount</div>
                                <div className="col-span-4">Remarks</div>
                                <div className="col-span-1"></div>
                            </div>
                        }
                        footerRightContent={
                            focusedRowIndex !== null && rowBalances[focusedRowIndex] !== undefined ? (
                                <div className={`text-xs font-mono font-bold ${rowBalances[focusedRowIndex] >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    Balance: ₹ {Math.abs(rowBalances[focusedRowIndex]).toLocaleString()} {rowBalances[focusedRowIndex] >= 0 ? 'Dr' : 'Cr'}
                                </div>
                            ) : null
                        }
                    />

                    {/* Totals */}
                    <div className="bg-card border rounded-lg p-3 shrink-0">
                        <div className="flex justify-between items-end">
                            <div>

                            </div>
                            <div className="text-right">
                                <div className="text-xs text-muted-foreground mb-1">Total Receipt</div>
                                <div className="text-lg font-mono font-bold">
                                    ₹ {receiptState.totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                            disabled={receiptState.loading}
                            className="h-9"
                            title="Save (Ctrl+S)"
                        >
                            <IconCheck size={16} />
                            {receiptState.loading ? 'Saving...' : (receiptState.mode === 'editing' ? 'Update Receipt' : 'Save Receipt')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
