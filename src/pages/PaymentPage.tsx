import { useEffect, useState, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    setPaymentAccount,
    setPaymentDate,
    setPaymentReference,
    setPaymentNarration,
    addPaymentItem,
    updatePaymentItem,
    removePaymentItem,
    setPaymentTotals,
    resetPaymentForm,
    setPaymentLoading,
    setPaymentMode,
    setPaymentCurrentVoucherId,
    setPaymentCurrentVoucherNo,
    setPaymentHasUnsavedChanges,
    setPaymentNavigationData,
    setPaymentMethod,
    setPaymentCreatedFromInvoiceId
} from '@/store';
import type { RootState, AppDispatch, PaymentItem } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import {
    IconCheck,
    IconX,
} from '@tabler/icons-react';

// Global Voucher Components & Hooks
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';
import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { VoucherLedgerSection } from '@/components/voucher/VoucherLedgerSection';
import PaymentManagementDialog from '@/components/dialogs/PaymentManagementDialog';
import BillAllocationDialog, { AllocationData } from '@/components/dialogs/BillAllocationDialog';
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

export default function PaymentPage() {
    const dispatch = useDispatch<AppDispatch>();
    const paymentState = useSelector((state: RootState) => state.payment);

    const [payFromAccounts, setPayFromAccounts] = useState<AccountData[]>([]);
    const [payToLedgers, setPayToLedgers] = useState<LedgerAccount[]>([]);
    const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]); // For Create Dialog
    const [isInitializing, setIsInitializing] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showQuickDialog, setShowQuickDialog] = useState(false);
    const [showListView, setShowListView] = useState(false);

    // Create Account State
    const [showCreateAccount, setShowCreateAccount] = useState(false);
    const [newAccountName, setNewAccountName] = useState('');
    const [creatingForIndex, setCreatingForIndex] = useState<number | null>(null);

    // Allocation & Balance State
    // Allocation & Balance State
    const [allocatingRowIndex, setAllocatingRowIndex] = useState<number | null>(null);
    const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
    const [rowBalances, setRowBalances] = useState<Record<number, number>>({});

    const formRef = useRef<HTMLFormElement>(null);
    const payFromRef = useRef<HTMLDivElement>(null);

    // Load Data
    useEffect(() => {
        const loadData = async () => {
            try {
                const [cashBankData, allLedgersData, allGroups] = await Promise.all([
                    invoke<AccountData[]>('get_cash_bank_accounts').catch(() => []),
                    invoke<LedgerAccount[]>('get_chart_of_accounts').catch(() => []),
                    api.accountGroups.list().catch(() => []),
                ]);
                setPayFromAccounts(cashBankData);
                setPayToLedgers(allLedgersData);
                setAccountGroups(allGroups);

                if (cashBankData.length > 0 && paymentState.form.account_id === 0) {
                    dispatch(setPaymentAccount({ id: cashBankData[0].id, name: cashBankData[0].name }));
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
        if (payToLedgers.length > 0 && paymentState.items.length === 0) {
            handleAddItem();
        }
    }, [payToLedgers.length]);

    // Calculations
    const calculateTotals = useCallback((items: PaymentItem[]) => {
        const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
        return { subtotal: total, tax: 0, grandTotal: total };
    }, []);

    const handleUpdateItem = (index: number, field: string, value: any) => {
        const updatedItems = [...paymentState.items];
        updatedItems[index] = { ...updatedItems[index], [field]: value };

        dispatch(updatePaymentItem({ index, data: { [field]: value } }));

        if (field === 'description') {
            const ledger = payToLedgers.find(l => l.account_name === value);
            if (ledger) {
                // Update account_id alongside description
                dispatch(updatePaymentItem({ index, data: { account_id: ledger.id } }));

                // Fetch Balance
                invoke<number>('get_account_balance', { accountId: ledger.id })
                    .then(bal => setRowBalances(prev => ({ ...prev, [index]: bal })))
                    .catch(console.error);
            }
        }

        const newTotals = calculateTotals(updatedItems);
        dispatch(setPaymentTotals(newTotals));
    };

    const handleAllocationConfirm = (allocations: AllocationData[]) => {
        if (allocatingRowIndex !== null) {
            handleUpdateItem(allocatingRowIndex, 'allocations', allocations);
            setAllocatingRowIndex(null);
        }
    };

    const handleAddItem = () => {
        dispatch(addPaymentItem({ description: '', amount: 0, tax_rate: 0 }));
    };

    const handleRemoveItem = (index: number) => {
        if (paymentState.items.length === 1) {
            toast.error('At least one item is required');
            return;
        }
        const updatedItems = paymentState.items.filter((_, i) => i !== index);
        dispatch(removePaymentItem(index));
        dispatch(setPaymentTotals(calculateTotals(updatedItems)));
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!paymentState.form.account_id) return toast.error('Select "Pay From" account');

        if (paymentState.items.length === 0) {
            toast.error('Add at least one item');
            return;
        }

        // Validate each item
        const hasEmptyItems = paymentState.items.some(item => !item.description || item.amount <= 0);
        if (hasEmptyItems) {
            toast.error('All items must have a ledger selected and a non-zero amount');
            return;
        }

        try {
            dispatch(setPaymentLoading(true));

            if (paymentState.mode === 'editing' && paymentState.currentVoucherId) {
                await invoke('update_payment', {
                    id: paymentState.currentVoucherId,
                    payment: { ...paymentState.form, items: paymentState.items }
                });
                toast.success('Payment updated successfully');
                dispatch(setPaymentLoading(false));

                // Return to list view or just clear? Usually editing returns to view or stays. 
                // Let's reset for now to be consistent with creating new.
                // Ideally we might want to stay in view mode of the updated voucher.
                // But for now, let's reset to allow next entry.
                dispatch(resetPaymentForm());
                handleAddItem();
                dispatch(setPaymentHasUnsavedChanges(false));
                dispatch(setPaymentMode('new'));
                // Refresh list if needed (handled by sheet verify)
                return;
            }

            await invoke('create_payment', { payment: { ...paymentState.form, items: paymentState.items } });
            toast.success('Payment saved successfully');
            dispatch(resetPaymentForm());
            handleAddItem();

            // Focus back to pay from after save
            setTimeout(() => payFromRef.current?.querySelector('button')?.focus(), 100);
        } catch (error) {
            console.error('Payment save error:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to save');
        } finally {
            dispatch(setPaymentLoading(false));
        }
    };

    const handleClear = () => {
        dispatch(resetPaymentForm());
        handleAddItem();
        setTimeout(() => payFromRef.current?.querySelector('button')?.focus(), 100);
    };

    const loadVoucher = async (id: string) => {
        try {
            dispatch(setPaymentLoading(true));
            dispatch(setPaymentHasUnsavedChanges(false));
            dispatch(resetPaymentForm());

            const payment = await invoke<any>('get_payment', { id });
            const items = await invoke<any[]>('get_payment_items', { voucherId: id });

            // Populate Form
            dispatch(setPaymentCurrentVoucherNo(payment.voucher_no));
            dispatch(setPaymentAccount({ id: payment.account_id, name: payment.account_name }));
            dispatch(setPaymentDate(payment.voucher_date));
            dispatch(setPaymentReference(payment.reference_number || ''));
            dispatch(setPaymentNarration(payment.narration || ''));
            dispatch(setPaymentMethod(payment.payment_method || 'bank'));
            dispatch(setPaymentCreatedFromInvoiceId(payment.created_from_invoice_id || null));

            // Populate Items
            items.forEach(item => {
                dispatch(addPaymentItem({
                    description: item.description,
                    account_id: item.ledger_id || undefined,
                    amount: item.amount,
                    tax_rate: item.tax_rate,
                    remarks: item.remarks
                }));
            });

            // Use totals from backend
            dispatch(setPaymentTotals({
                subtotal: payment.subtotal || 0,
                tax: payment.tax_amount || 0,
                grandTotal: payment.total_amount || 0
            }));

            dispatch(setPaymentMode('viewing'));
            dispatch(setPaymentHasUnsavedChanges(false));

        } catch (error) {
            console.error("Failed to load payment", error);
            toast.error("Failed to load payment");
        } finally {
            dispatch(setPaymentLoading(false));
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
        voucherType: 'payment',
        sliceState: paymentState,
        actions: {
            setMode: setPaymentMode,
            setCurrentVoucherId: setPaymentCurrentVoucherId,
            setNavigationData: setPaymentNavigationData,
            setHasUnsavedChanges: setPaymentHasUnsavedChanges,
            resetForm: resetPaymentForm
        },
        onLoadVoucher: loadVoucher
    });

    const handleDeleteVoucher = async () => {
        const confirmed = await handleDelete();
        if (confirmed && paymentState.currentVoucherId) {
            try {
                dispatch(setPaymentLoading(true));
                await invoke('delete_payment', { id: paymentState.currentVoucherId });
                toast.success('Payment deleted');
                handleNew();
            } catch (e) {
                toast.error('Failed to delete payment');
                console.error(e);
            } finally {
                dispatch(setPaymentLoading(false));
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

    // Global "Alt+C" Shortcut for creating account (generic)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                setNewAccountName('');
                setCreatingForIndex(null); // Generic creation, not tied to specific row initially
                setShowCreateAccount(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleCreateAccountSave = async (newAccount?: any) => {
        // Refresh ledgers
        try {
            const allLedgersData = await invoke<LedgerAccount[]>('get_chart_of_accounts');
            setPayToLedgers(allLedgersData);

            if (newAccount) {
                // If created for a specific row, update that row
                if (creatingForIndex !== null) {
                    handleUpdateItem(creatingForIndex, 'description', newAccount.account_name);
                    // handleUpdateItem handles account_id update via name lookup, but we just updated the list
                    // so we might need to Trigger it or manually set it.
                    // The handleUpdateItem logic: const ledger = payToLedgers.find...
                    // Since setPayToLedgers is async/batched, the find inside handleUpdateItem might use old state.
                    // It's safer to dispatch directly here for the specific updates.

                    // Find in NEW list? Or just use the returned object.
                    // Ideally we should dispatch the update.
                    dispatch(updatePaymentItem({
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
                title="Payment Voucher"
                description="Record money paid out from bank or cash"
                mode={paymentState.mode}
                voucherNo={paymentState.currentVoucherNo}
                isUnsaved={paymentState.hasUnsavedChanges}
                hasPrevious={paymentState.navigationData.hasPrevious}
                hasNext={paymentState.navigationData.hasNext}
                onToggleShortcuts={() => setShowShortcuts(!showShortcuts)}
                onNavigatePrevious={handleNavigatePrevious}
                onNavigateNext={handleNavigateNext}
                onEdit={handleEdit}
                onSave={() => formRef.current?.requestSubmit()}
                onCancel={handleCancel}
                onDelete={handleDeleteVoucher}
                onNew={handleNew}
                onListView={() => setShowListView(true)}
                editDisabled={!!paymentState.form.created_from_invoice_id}
                deleteDisabled={!!paymentState.form.created_from_invoice_id}
            />

            <VoucherShortcutPanel
                show={showShortcuts}
            />

            <VoucherListViewSheet
                open={showListView}
                onOpenChange={setShowListView}
                voucherType="payment"
                onSelectVoucher={handleListSelect}
                title="Payment Vouchers"
            />

            <PaymentManagementDialog
                mode="payment"
                open={showQuickDialog}
                onOpenChange={setShowQuickDialog}
                onSuccess={() => {
                    // Optionally reload or refresh data after quick payment
                    toast.success('Payment recorded!');
                }}
            />

            {allocatingRowIndex !== null && paymentState.items[allocatingRowIndex] && (
                <BillAllocationDialog
                    open={true}
                    onOpenChange={(open) => !open && setAllocatingRowIndex(null)}
                    partyId={payToLedgers.find(l => l.account_name === paymentState.items[allocatingRowIndex].description)?.id || 0}
                    amountToAllocate={paymentState.items[allocatingRowIndex].amount || 0}
                    allocations={paymentState.items[allocatingRowIndex].allocations || []}
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
                            {/* Pay From */}
                            <div ref={payFromRef} className="col-span-2">
                                <Label className="text-xs font-medium mb-1 block">Pay From (Bank/Cash) *</Label>
                                <Combobox
                                    value={paymentState.form.account_id}
                                    options={payFromAccounts.map(a => ({ value: a.id, label: a.name }))}
                                    onChange={(val) => {
                                        const acc = payFromAccounts.find(a => a.id === val);
                                        if (acc) dispatch(setPaymentAccount({ id: acc.id, name: acc.name }));
                                    }}
                                    placeholder="Select source account"
                                    searchPlaceholder="Search accounts..."
                                    disabled={paymentState.mode === 'viewing'}
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
                                    value={paymentState.form.voucher_date}
                                    onChange={(e) => dispatch(setPaymentDate(e.target.value))}
                                    className="h-8 text-sm"
                                    disabled={paymentState.mode === 'viewing'}
                                />
                            </div>

                            {/* Reference */}
                            <div className="col-span-1">
                                <Label className="text-xs font-medium mb-1 block">Reference Number</Label>
                                <Input
                                    value={paymentState.form.reference_number}
                                    onChange={(e) => dispatch(setPaymentReference(e.target.value))}
                                    placeholder="Cheque/Ref No"
                                    className="h-8 text-sm"
                                    disabled={paymentState.mode === 'viewing'}
                                />
                            </div>

                            {/* Narration */}
                            <div className="col-span-2">
                                <Label className="text-xs font-medium mb-1 block">Narration</Label>
                                <Input
                                    value={paymentState.form.narration}
                                    onChange={(e) => dispatch(setPaymentNarration(e.target.value))}
                                    placeholder="Enter details about this payment..."
                                    className="h-8 text-sm"
                                    disabled={paymentState.mode === 'viewing'}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Items Section */}
                    <VoucherLedgerSection
                        items={paymentState.items}
                        ledgers={payToLedgers}
                        isReadOnly={paymentState.mode === 'viewing'}
                        onAddItem={handleAddItem}
                        onRemoveItem={handleRemoveItem}
                        onUpdateItem={handleUpdateItem}
                        onAllocations={setAllocatingRowIndex}
                        addItemLabel="Add Item (Ctrl+N)"
                        disableAdd={paymentState.mode === 'viewing'}
                        rowBalances={rowBalances}
                        onCreateLedger={(name, index) => {
                            setNewAccountName(name);
                            setCreatingForIndex(index);
                            setShowCreateAccount(true);
                        }}

                        onFocusRow={setFocusedRowIndex}
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
                            <div></div>
                            <div className="text-right">
                                <div className="text-xs text-muted-foreground mb-1">Total Payment</div>
                                <div className="text-lg font-mono font-bold">
                                    ₹ {paymentState.totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                            disabled={paymentState.loading}
                            className="h-9"
                            title="Save (Ctrl+S)"
                        >
                            <IconCheck size={16} />
                            {paymentState.loading ? 'Saving...' : (paymentState.mode === 'editing' ? 'Update Payment' : 'Save Payment')}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
