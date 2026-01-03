import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import {
    IconCheck,
    IconX,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';

interface PaymentManagementDialogProps {
    mode: 'payment' | 'receipt';
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    invoiceId?: string;
    invoiceNo?: string;
    invoiceAmount?: number;
    invoiceDate?: string;
    partyName?: string;
    readOnly?: boolean;
}

interface Allocation {
    id: string;
    payment_voucher_id: string;
    payment_voucher_no: string;
    payment_voucher_date: string;
    allocated_amount: number;
    allocation_date: string;
    remarks: string | null;
    payment_method: string | null;
    payment_account_id: number;
}

interface CashBankAccount {
    id: number;
    name: string;
}

interface PaymentLine {
    id: string;
    payment_voucher_id?: string; // Exists for existing payments
    account_id: number;
    amount: number;
    method: string;
}

export default function PaymentManagementDialog({
    mode,
    open,
    onOpenChange,
    onSuccess,
    invoiceId,
    invoiceNo = '',
    invoiceAmount = 0,
    invoiceDate = new Date().toISOString().split('T')[0],
    partyName = '',
    readOnly = false,
}: PaymentManagementDialogProps) {
    // Data states
    const [allocations, setAllocations] = useState<Allocation[]>([]);
    const [cashBankAccounts, setCashBankAccounts] = useState<CashBankAccount[]>([]);

    // Loading states
    const [loadingAllocations, setLoadingAllocations] = useState(false);
    const [loading, setLoading] = useState(false);

    // Form states
    const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);

    // Derived state
    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocated_amount, 0);

    const saveButtonRef = useRef<HTMLButtonElement>(null);
    const hasInitialized = useRef(false);

    const paymentMethods = [
        { value: 'cash', label: 'Cash' },
        { value: 'bank', label: 'Bank Transfer' },
        { value: 'cheque', label: 'Cheque' },
        { value: 'card', label: 'Card' },
        { value: 'upi', label: 'UPI' },
    ];

    // Load cash/bank accounts
    useEffect(() => {
        if (open) {
            hasInitialized.current = false; // Reset init state on open
            loadCashBankAccounts();
            if (invoiceId) {
                loadAllocations();
            }
            // Auto-focus save button for quick keyboard workflow
            setTimeout(() => {
                saveButtonRef.current?.focus();
            }, 150);
        }
    }, [open, invoiceId]);

    const loadCashBankAccounts = async () => {
        try {
            const accounts = await invoke<CashBankAccount[]>('get_cash_bank_accounts');
            setCashBankAccounts(accounts);

            // Logic to add default line will be handled after allocations load
            // or if we know there are no alloctions yet.
            // But safely, let's only add if lines are empty.
        } catch (error) {
            console.error('Failed to load accounts:', error);
            toast.error('Failed to load cash/bank accounts');
        }
    };

    const loadAllocations = async () => {
        try {
            setLoadingAllocations(true);
            const data = await invoke<Allocation[]>('get_invoice_allocations_with_details', {
                invoiceVoucherId: invoiceId,
            });
            setAllocations(data);

            // Convert allocations to payment lines for editing
            const existingLines: PaymentLine[] = data.map(alloc => ({
                id: `existing-${alloc.id}`,
                payment_voucher_id: alloc.payment_voucher_id,
                account_id: alloc.payment_account_id || 0, // Fallback if missing, though backend should provide
                amount: alloc.allocated_amount,
                method: alloc.payment_method || 'cash'
            }));

            // Only update payment lines if we haven't modified them yet (on initial load)
            setPaymentLines(prev => {
                // If we already have user-added info, maybe we shouldn't overwrite?
                // For now, simplicity: overwrite on load.
                // But we need to check if there are any *new* lines added automatically?
                // Actually, let's just use existing lines. If none, then check logic for new line.

                if (existingLines.length > 0) {
                    return existingLines;
                }

                // If no existing payments, logic in loadCashBankAccounts handles adding default line
                return prev;
            });

        } catch (error) {
            console.error('Failed to load allocations:', error);
            toast.error('Failed to load existing payments');
        } finally {
            setLoadingAllocations(false);
        }
    };

    // Effect to add default line if everything loaded and empty
    // Only run this ONCE after loading is done and we have no lines
    useEffect(() => {
        if (!loadingAllocations && cashBankAccounts.length > 0 && invoiceId && !hasInitialized.current) {
            if (paymentLines.length === 0) {
                const cashAccount = cashBankAccounts.find(a => a.name.toLowerCase().includes('cash')) || cashBankAccounts[0];
                // Initial load calc - show remaining balance for new payment
                const remaining = invoiceAmount - totalAllocated;
                const prefillAmount = remaining > 0 ? remaining : 0;

                const newLine: PaymentLine = {
                    id: `line-${Date.now()}-${Math.random()}`,
                    account_id: cashAccount.id,
                    amount: prefillAmount,
                    method: 'cash',
                };
                setPaymentLines([newLine]);
            }
            hasInitialized.current = true;
        }
    }, [loadingAllocations, cashBankAccounts, invoiceId, invoiceAmount]); // Removed paymentLines.length to prevent re-adding

    const addPaymentLine = () => {
        const cashAccount = cashBankAccounts.find(a => a.name.toLowerCase().includes('cash')) || cashBankAccounts[0];
        const newLine: PaymentLine = {
            id: `line-${Date.now()}-${Math.random()}`,
            account_id: cashAccount?.id || 0,
            amount: 0,
            method: 'cash',
        };
        setPaymentLines([...paymentLines, newLine]);
    };

    const removePaymentLine = (id: string) => {
        // Allow removing any line during editing
        setPaymentLines(paymentLines.filter(line => line.id !== id));
    };

    const updatePaymentLine = (id: string, field: keyof PaymentLine, value: any) => {
        setPaymentLines(paymentLines.map(line =>
            line.id === id ? { ...line, [field]: value } : line
        ));
    };

    // Number formatting helpers (same as use-dialog hook)
    const parseNumber = (value: string): number => {
        return value === '' ? 0 : parseFloat(value);
    };

    const formatNumber = (value: number | undefined | null): string => {
        return !value ? '' : value.toString();
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        const validLines = paymentLines.filter(line => line.amount > 0);

        // Find deleted allocations
        // Any allocation in `allocations` that is NOT in `validLines` (by checking payment_voucher_id)
        // This includes allocations for lines that were removed OR had amount set to 0
        const currentPaymentVoucherIds = new Set(
            validLines.map(l => l.payment_voucher_id).filter(id => id !== undefined)
        );

        const deletedAllocations = allocations.filter(
            a => !currentPaymentVoucherIds.has(a.payment_voucher_id)
        );

        if (paymentLines.length > 0) {
            // If we have lines, but none are valid (e.g. all 0), effectively we are clearing payments.
            // We allow this execution path to proceed (it will delete removed allocations and add nothing).
        }

        try {
            setLoading(true);

            // 1. Delete removed allocations
            for (const alloc of deletedAllocations) {
                await invoke('delete_allocation', { id: alloc.id });
            }

            // 2. Process current lines (Create or Update)
            for (const line of validLines) {
                const account = cashBankAccounts.find(a => a.id === line.account_id);
                const autoRemarks = `Payment for ${invoiceNo} via ${account?.name || 'Account'}`;

                if (line.payment_voucher_id) {
                    // Update existing
                    await invoke('update_quick_payment', {
                        payment: {
                            payment_voucher_id: line.payment_voucher_id,
                            invoice_id: invoiceId,
                            amount: line.amount,
                            payment_account_id: line.account_id,
                            payment_date: invoiceDate,
                            payment_method: line.method,
                            remarks: autoRemarks,
                        }
                    });
                } else {
                    // Create new
                    await invoke('create_quick_payment', {
                        payment: {
                            invoice_id: invoiceId,
                            amount: line.amount,
                            payment_account_id: line.account_id,
                            payment_date: invoiceDate,
                            payment_method: line.method,
                            reference: null,
                            remarks: autoRemarks,
                        },
                    });
                }
            }

            toast.success('Payments updated successfully');
            if (onSuccess) onSuccess();
            handleClose();
        } catch (error) {
            console.error('Failed to save payments:', error);
            toast.error(typeof error === 'string' ? error : 'Failed to save payments');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setPaymentLines([]);
        setAllocations([]);
        onOpenChange(false);
    };

    const remainingAmount = invoiceAmount - totalAllocated;

    return (
        <>
            <Dialog open={open} onOpenChange={handleClose}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {readOnly ? `View ${mode === 'payment' ? 'Payments' : 'Receipts'}` : `Manage ${mode === 'payment' ? 'Payments' : 'Receipts'}`} - {invoiceNo}
                        </DialogTitle>
                        <div className="text-sm space-y-1">
                            <div className="text-muted-foreground">
                                {partyName} • Invoice Amount: ₹{invoiceAmount.toFixed(2)}
                            </div>
                            {remainingAmount !== invoiceAmount && (
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Remaining Balance:</span>
                                    <span className="font-semibold text-orange-600">₹{remainingAmount.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    </DialogHeader>

                    <form onSubmit={handleSave} className="space-y-6">
                        {/* Existing Allocations Section - REMOVED, now part of paymentLines */}

                        <div className="bg-card border rounded-lg overflow-hidden">
                            <div className="bg-muted/50 border-b px-3 py-2 flex items-center justify-between">
                                <h3 className="text-sm font-medium">
                                    {readOnly ? 'Payments List' : (mode === 'payment' ? 'Manage Payments' : 'Manage Receipts')}
                                </h3>
                                {remainingAmount > 0 && (
                                    <div className="text-xs font-medium">
                                        Remaining: <span className="text-orange-600">₹{remainingAmount.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>

                            <div className="p-3 space-y-4">
                                {/* Header Row */}
                                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                                    <div className="col-span-3">Cash/Bank Account</div>
                                    <div className="col-span-4">Amount</div>
                                    <div className="col-span-4">Method</div>
                                    <div className="w-8"></div>
                                </div>

                                {/* Payment Lines */}
                                {paymentLines.map((line) => (
                                    <div key={line.id} className="grid grid-cols-12 gap-2 items-start">
                                        <div className="col-span-3">
                                            {readOnly ? (
                                                <div className="text-sm py-1.5 px-2 bg-muted/50 rounded border">
                                                    {cashBankAccounts.find(a => a.id === line.account_id)?.name || 'Unknown'}
                                                </div>
                                            ) : (
                                                <Combobox
                                                    options={cashBankAccounts.map(acc => ({
                                                        value: acc.id,
                                                        label: acc.name,
                                                    }))}
                                                    value={line.account_id}
                                                    onChange={(value) => updatePaymentLine(line.id, 'account_id', value)}
                                                    placeholder="Select account"
                                                    searchPlaceholder="Search..."
                                                />
                                            )}
                                        </div>
                                        <div className="col-span-4 relative">
                                            <Input
                                                type="number"
                                                value={formatNumber(line.amount)}
                                                onChange={(e) => updatePaymentLine(line.id, 'amount', parseNumber(e.target.value))}
                                                placeholder="0.00"
                                                className="h-8 text-sm font-mono pr-8"
                                                step="0.01"
                                                readOnly={readOnly}
                                            />
                                            {!readOnly && line.amount > 0 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => updatePaymentLine(line.id, 'amount', 0)}
                                                    className="absolute right-0 top-0 h-8 w-8 p-0"
                                                    title="Clear amount"
                                                >
                                                    <IconX size={14} />
                                                </Button>
                                            )}
                                        </div>
                                        <div className="col-span-4">
                                            {readOnly ? (
                                                <div className="text-sm py-1.5 px-2 bg-muted/50 rounded border capitalize">
                                                    {line.method}
                                                </div>
                                            ) : (
                                                <Combobox
                                                    options={paymentMethods}
                                                    value={line.method}
                                                    onChange={(value) => updatePaymentLine(line.id, 'method', value)}
                                                    placeholder="Method"
                                                />
                                            )}
                                        </div>
                                        {!readOnly && (
                                            <div className="flex justify-end">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removePaymentLine(line.id)}
                                                    className="h-8 w-8 p-0"
                                                >
                                                    <IconTrash size={14} />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* Add Line Button - only in edit mode */}
                                {!readOnly && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={addPaymentLine}
                                        className="w-full mt-2"
                                    >
                                        <IconPlus size={14} className="mr-1" />
                                        Add Line
                                    </Button>
                                )}

                                {/* Total - show total payments now */}
                                <div className="border-t pt-2 mt-2 flex justify-between text-sm font-medium">
                                    <span>Total Payments:</span>
                                    <span className="font-mono">
                                        ₹{paymentLines.reduce((sum, line) => sum + (line.amount || 0), 0).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>


                        {/* Actions */}
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={handleClose}>
                                <IconX size={16} />
                                {readOnly ? 'Close' : 'Cancel'}
                            </Button>
                            {!readOnly && (
                                <Button
                                    ref={saveButtonRef}
                                    type="submit"
                                    disabled={loading}
                                >
                                    <IconCheck size={16} />
                                    {loading ? 'Updating...' : mode === 'payment' ? 'Update Payments' : 'Update Receipts'}
                                </Button>
                            )}
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
