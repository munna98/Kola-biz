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
    setReceiptMethod
} from '@/store';
import type { RootState, AppDispatch, ReceiptItem } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import {
    IconPlus,
    IconTrash,
    IconCheck,
    IconX,
    IconReceipt2,
} from '@tabler/icons-react';
import BillAllocationDialog, { AllocationData } from '@/components/dialogs/BillAllocationDialog';

// Global Voucher Components & Hooks
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';
import { useVoucherRowNavigation } from '@/hooks/useVoucherRowNavigation';
import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import QuickPaymentDialog from '@/components/dialogs/QuickPaymentDialog';

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

    const [depositToAccounts, setDepositToAccounts] = useState<AccountData[]>([]);
    const [receivedFromLedgers, setReceivedFromLedgers] = useState<LedgerAccount[]>([]);
    const [isInitializing, setIsInitializing] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showQuickDialog, setShowQuickDialog] = useState(false);
    const [showListView, setShowListView] = useState(false);

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
                const [cashBankData, allLedgersData] = await Promise.all([
                    invoke<AccountData[]>('get_cash_bank_accounts').catch(() => []),
                    invoke<LedgerAccount[]>('get_chart_of_accounts').catch(() => []),
                ]);
                setDepositToAccounts(cashBankData);
                setReceivedFromLedgers(allLedgersData);

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

            await invoke('create_receipt', { receipt: { ...receiptState.form, items: receiptState.items } });
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

    const loadVoucher = async (id: number) => {
        try {
            dispatch(setReceiptLoading(true));
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

            // Populate Items
            items.forEach(item => {
                dispatch(addReceiptItem({
                    description: item.description,
                    amount: item.amount,
                    tax_rate: item.tax_rate,
                    remarks: item.remarks
                }));
            });

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

    // Row navigation hook
    const { handleRowKeyDown } = useVoucherRowNavigation({
        onRemoveItem: handleRemoveItem,
        onAddItem: handleAddItem
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
                title="Receipt Voucher"
                description="Record money received into bank or cash"
                mode={receiptState.mode}
                voucherNo={receiptState.currentVoucherNo}
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

            <QuickPaymentDialog
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
                                />
                            </div>
                        </div>
                    </div>

                    {/* Items Section */}
                    <div className="bg-card border rounded-lg overflow-hidden flex flex-col shrink-0" style={{ height: 'calc(5 * 3.25rem + 2.5rem + 2.5rem)' }}>
                        {/* Table Header */}
                        <div className="bg-muted/50 border-b shrink-0">
                            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground items-center">
                                <div className="col-span-5 flex justify-between items-center">
                                    <span>Received From (Account/Ledger)</span>

                                </div>
                                <div className="col-span-2 text-right">Amount</div>
                                <div className="col-span-4">Remarks</div>
                                <div className="col-span-1"></div>
                            </div>
                        </div>

                        {/* Items - Scrollable */}
                        <div className="divide-y overflow-y-auto flex-1">
                            {receiptState.items.map((item, index) => (
                                <div
                                    key={item.id || index}
                                    data-row-index={index}
                                    className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-muted/30 focus-within:bg-muted/50"
                                    onKeyDown={(e) => handleRowKeyDown(e, index)}
                                >
                                    {/* Received From Ledger */}
                                    <div className="col-span-5" onFocus={() => setFocusedRowIndex(index)}>
                                        <Combobox
                                            value={item.description}
                                            options={receivedFromLedgers.map(l => ({ value: l.account_name, label: l.account_name }))}
                                            onChange={(val) => handleUpdateItem(index, 'description', val)}
                                            placeholder="Select Ledger"
                                            searchPlaceholder="Search ledgers..."
                                        />
                                    </div>

                                    {/* Amount */}
                                    <div className="col-span-2 flex items-start gap-1">
                                        <Input
                                            type="number"
                                            value={item.amount || ''}
                                            onChange={(e) => handleUpdateItem(index, 'amount', parseFloat(e.target.value) || 0)}
                                            onFocus={() => setFocusedRowIndex(index)}
                                            className="h-7 text-xs text-right font-mono"
                                            placeholder="0.00"
                                            step="0.01"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className={`h-7 w-7 p-0 ${(item.allocations?.length || 0) > 0 ? 'text-blue-600 bg-blue-50' : 'text-muted-foreground'}`}
                                            title="Billwise Allocation"
                                            onClick={() => setAllocatingRowIndex(index)}
                                            disabled={!item.description}
                                        >
                                            <IconReceipt2 size={14} />
                                        </Button>
                                    </div>

                                    {/* Remarks */}
                                    <div className="col-span-4">
                                        <Input
                                            value={(item as any).remarks || ''}
                                            onChange={(e) => handleUpdateItem(index, 'remarks', e.target.value)}
                                            className="h-7 text-xs"
                                            placeholder="e.g. For Invoice #001"
                                        />
                                    </div>

                                    {/* Delete */}
                                    <div className="flex justify-end">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveItem(index)}
                                            className="h-6 w-6 p-0"
                                            title="Delete (Ctrl+D)"
                                        >
                                            <IconTrash size={14} />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add Item Button */}
                        <div className="bg-muted/30 border-t px-3 py-2 shrink-0">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleAddItem}
                                className="text-xs h-7"
                            >
                                <IconPlus size={14} />
                                Add Item (Ctrl+N)
                            </Button>
                        </div>
                    </div>

                    {/* Totals */}
                    <div className="bg-card border rounded-lg p-3 shrink-0">
                        <div className="flex justify-between items-end">
                            <div>
                                {focusedRowIndex !== null && rowBalances[focusedRowIndex] !== undefined && (
                                    <div className={`text-sm font-bold ${rowBalances[focusedRowIndex] >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        Cur Bal: ₹ {Math.abs(rowBalances[focusedRowIndex]).toLocaleString()} {rowBalances[focusedRowIndex] >= 0 ? 'Dr' : 'Cr'}
                                    </div>
                                )}
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
