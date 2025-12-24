import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import { IconCheck, IconX, IconPlus, IconTrash } from '@tabler/icons-react';

interface QuickPaymentDialogProps {
    mode: 'payment' | 'receipt';
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    // Pre-fill data from invoice
    invoiceAmount?: number;
    partyName?: string;
    partyId?: number;
}

interface AccountData {
    id: number;
    name: string;
}

interface PaymentLine {
    id: string;
    account_id: number;
    account_name: string;
    amount: number;
}

export default function QuickPaymentDialog({
    mode,
    open,
    onOpenChange,
    onSuccess,
    invoiceAmount = 0,
    partyName = '',
    partyId = 0,
}: QuickPaymentDialogProps) {
    const [cashBankAccounts, setCashBankAccounts] = useState<AccountData[]>([]);
    const [loading, setLoading] = useState(false);

    // Multiple payment lines for split payments
    const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([
        { id: '1', account_id: 0, account_name: '', amount: 0 }
    ]);

    // Form state
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        narration: '',
    });

    const isPayment = mode === 'payment';
    const title = isPayment ? 'Quick Payment' : 'Quick Receipt';
    const accountLabel = isPayment ? 'Pay From (Bank/Cash)' : 'Deposit To (Bank/Cash)';
    const partyLabel = isPayment ? 'Paid To' : 'Received From';

    // Load accounts when dialog opens
    useEffect(() => {
        if (open) {
            loadAccounts();
            resetForm();
        }
    }, [open, invoiceAmount, partyName]);

    const resetForm = () => {
        // If invoice amount provided, split 100% to first account
        const initialAmount = invoiceAmount > 0 ? invoiceAmount : 0;

        setPaymentLines([
            { id: '1', account_id: 0, account_name: '', amount: initialAmount }
        ]);

        setFormData({
            date: new Date().toISOString().split('T')[0],
            narration: partyName ? `Payment from ${partyName}` : '',
        });
    };

    const loadAccounts = async () => {
        try {
            const cashBankData = await invoke<AccountData[]>('get_cash_bank_accounts').catch(() => []);
            setCashBankAccounts(cashBankData);

            // Auto-select first account if only one line
            if (cashBankData.length > 0 && paymentLines.length === 1 && paymentLines[0].account_id === 0) {
                setPaymentLines([{
                    ...paymentLines[0],
                    account_id: cashBankData[0].id,
                    account_name: cashBankData[0].name,
                }]);
            }
        } catch (error) {
            toast.error('Failed to load accounts');
            console.error(error);
        }
    };

    const handleAddLine = () => {
        setPaymentLines([...paymentLines, {
            id: Date.now().toString(),
            account_id: 0,
            account_name: '',
            amount: 0,
        }]);
    };

    const handleRemoveLine = (id: string) => {
        if (paymentLines.length === 1) {
            toast.error('At least one payment line is required');
            return;
        }
        setPaymentLines(paymentLines.filter(line => line.id !== id));
    };

    const handleUpdateLine = (id: string, field: keyof PaymentLine, value: any) => {
        setPaymentLines(paymentLines.map(line =>
            line.id === id ? { ...line, [field]: value } : line
        ));
    };

    const handleAccountChange = (lineId: string, accountId: number) => {
        const account = cashBankAccounts.find(a => a.id === accountId);
        if (account) {
            handleUpdateLine(lineId, 'account_id', account.id);
            handleUpdateLine(lineId, 'account_name', account.name);
        }
    };

    const getTotalAmount = () => {
        return paymentLines.reduce((sum, line) => sum + (line.amount || 0), 0);
    };

    const getRemainingAmount = () => {
        if (invoiceAmount <= 0) return 0;
        return invoiceAmount - getTotalAmount();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        const invalidLines = paymentLines.filter(line => !line.account_id || line.amount <= 0);
        if (invalidLines.length > 0) {
            toast.error('All payment lines must have an account selected and amount > 0');
            return;
        }

        // Check if party is provided
        if (!partyId || !partyName) {
            toast.error('Party information is missing');
            return;
        }

        try {
            setLoading(true);

            // Create a receipt/payment for each payment line
            for (const line of paymentLines) {
                const commandName = isPayment ? 'create_payment' : 'create_receipt';
                const payload = {
                    [isPayment ? 'payment' : 'receipt']: {
                        account_id: line.account_id,
                        voucher_date: formData.date,
                        reference_number: null,
                        narration: formData.narration || `${isPayment ? 'Payment to' : 'Receipt from'} ${partyName}`,
                        items: [
                            {
                                description: partyName, // Party name as the ledger
                                amount: line.amount,
                                tax_rate: 0,
                                remarks: `${line.account_name} - ${invoiceAmount > 0 ? 'Invoice payment' : ''}`,
                            },
                        ],
                    },
                };

                await invoke(commandName, payload);
            }

            toast.success(`${isPayment ? 'Payment' : 'Receipt'} saved successfully (${paymentLines.length} ${paymentLines.length > 1 ? 'entries' : 'entry'})`);
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            console.error('Save error:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to save');
        } finally {
            setLoading(false);
        }
    };

    const totalAmount = getTotalAmount();
    const remainingAmount = getRemainingAmount();
    const hasInvoiceAmount = invoiceAmount > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Quick entry for {isPayment ? 'payments made' : 'receipts received'}.
                        {hasInvoiceAmount && ` Invoice amount: ₹${invoiceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Party Information (Read-only) */}
                    {partyName && (
                        <div className="bg-muted/50 p-3 rounded-lg">
                            <Label className="text-sm font-medium mb-1 block">{partyLabel}</Label>
                            <div className="text-base font-semibold">{partyName}</div>
                        </div>
                    )}

                    {/* Payment Lines */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <Label className="text-sm font-semibold">Payment Details</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleAddLine}
                                className="h-7 text-xs"
                            >
                                <IconPlus size={14} />
                                Add Line (Split Payment)
                            </Button>
                        </div>

                        {paymentLines.map((line, index) => (
                            <div key={line.id} className="grid grid-cols-12 gap-2 items-end p-3 bg-card border rounded-lg">
                                {/* Account Selection */}
                                <div className="col-span-6">
                                    <Label className="text-xs font-medium mb-1 block">
                                        {accountLabel} {index + 1} *
                                    </Label>
                                    <Combobox
                                        value={line.account_id}
                                        options={cashBankAccounts.map(a => ({ value: a.id, label: a.name }))}
                                        onChange={(val) => handleAccountChange(line.id, val as number)}
                                        placeholder="Select account"
                                        searchPlaceholder="Search accounts..."
                                    />
                                </div>

                                {/* Amount */}
                                <div className="col-span-5">
                                    <Label className="text-xs font-medium mb-1 block">Amount *</Label>
                                    <Input
                                        type="number"
                                        value={line.amount || ''}
                                        onChange={(e) => handleUpdateLine(line.id, 'amount', parseFloat(e.target.value) || 0)}
                                        placeholder="0.00"
                                        step="0.01"
                                        className="font-mono"
                                    />
                                </div>

                                {/* Delete Button */}
                                <div className="col-span-1 flex items-end">
                                    {paymentLines.length > 1 && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleRemoveLine(line.id)}
                                            className="h-9 w-9 p-0"
                                        >
                                            <IconTrash size={16} />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Total and Remaining Display */}
                    <div className="bg-muted/30 p-3 rounded-lg space-y-1.5">
                        <div className="flex justify-between text-sm">
                            <span className="font-medium">Total Amount:</span>
                            <span className="font-mono font-bold">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {hasInvoiceAmount && (
                            <>
                                <div className="flex justify-between text-sm">
                                    <span className="font-medium">Invoice Amount:</span>
                                    <span className="font-mono">₹{invoiceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className={`flex justify-between text-sm ${remainingAmount > 0 ? 'text-orange-600 dark:text-orange-400' : remainingAmount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                    <span className="font-medium">
                                        {remainingAmount > 0 ? 'Remaining:' : remainingAmount < 0 ? 'Excess:' : 'Balanced ✓'}
                                    </span>
                                    <span className="font-mono font-bold">
                                        {remainingAmount !== 0 && `₹${Math.abs(remainingAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Date */}
                    <div>
                        <Label className="text-sm font-medium mb-1.5 block">Date *</Label>
                        <Input
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                        />
                    </div>

                    {/* Narration */}
                    <div>
                        <Label className="text-sm font-medium mb-1.5 block">Narration / Remarks</Label>
                        <Textarea
                            value={formData.narration}
                            onChange={(e) => setFormData(prev => ({ ...prev, narration: e.target.value }))}
                            placeholder="Optional notes..."
                            className="min-h-[60px] text-sm"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-2 border-t">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            <IconX size={16} />
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            <IconCheck size={16} />
                            {loading ? 'Saving...' : `Save ${isPayment ? 'Payment' : 'Receipt'}`}
                        </Button>
                    </div>
                </form>

                <div className="text-xs text-muted-foreground border-t pt-2">
                    <strong>Tips:</strong> Click "Add Line" to split payment across multiple accounts (e.g., ₹500 Cash + ₹500 Bank)
                </div>
            </DialogContent>
        </Dialog>
    );
}
