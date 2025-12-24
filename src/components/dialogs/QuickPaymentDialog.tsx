import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IconCheck, IconX } from '@tabler/icons-react';

interface QuickPaymentDialogProps {
    mode: 'payment' | 'receipt';
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    // Pre-fill data from invoice
    invoiceAmount?: number;
    partyName?: string;
    partyId?: number;
    invoiceId?: number;
}

interface AccountData {
    id: number;
    name: string;
    account_group: string;
}

interface LedgerAccount {
    id: number;
    account_name: string;
}

interface PaymentState {
    accountId: number;
    accountName: string;
    amount: number;
}

export default function QuickPaymentDialog({
    mode,
    open,
    onOpenChange,
    onSuccess,
    invoiceAmount = 0,
    partyName = '',
    partyId,
    invoiceId,
}: QuickPaymentDialogProps) {
    const [cashBankAccounts, setCashBankAccounts] = useState<AccountData[]>([]);
    const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>([]);
    const [loading, setLoading] = useState(false);

    // Active Tab
    const [activeTab, setActiveTab] = useState<'Cash' | 'Bank'>('Cash');

    // Separate states for Cash and Bank
    const [cashState, setCashState] = useState<PaymentState>({ accountId: 0, accountName: '', amount: 0 });
    const [bankState, setBankState] = useState<PaymentState>({ accountId: 0, accountName: '', amount: 0 });

    // For manual selection when partyName is not provided
    const [manualLedgerName, setManualLedgerName] = useState('');

    // Form state
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        narration: '',
    });

    const isPayment = mode === 'payment';
    const title = isPayment ? 'Quick Payment' : 'Quick Receipt';
    const accountLabel = isPayment ? 'Pay From' : 'Deposit To';
    const ledgerLabel = isPayment ? 'Pay To (Account/Ledger)' : 'Received From (Account/Ledger)';

    // Determine the effective party name to use
    const effectivePartyName = partyName || manualLedgerName;
    const isAutoMode = !!partyName;

    // Load accounts when dialog opens
    useEffect(() => {
        if (open) {
            loadAccounts();
            resetForm();
        }
    }, [open, invoiceAmount, partyName]);

    const resetForm = () => {
        const initialAmount = invoiceAmount > 0 ? invoiceAmount : 0;

        setActiveTab('Cash');
        setCashState({ accountId: 0, accountName: '', amount: initialAmount });
        setBankState({ accountId: 0, accountName: '', amount: 0 });

        setFormData({
            date: new Date().toISOString().split('T')[0],
            narration: partyName ? `Payment from ${partyName}` : '',
        });

        setManualLedgerName('');
    };

    const loadAccounts = async () => {
        try {
            const [cashBankData, allLedgersData] = await Promise.all([
                invoke<AccountData[]>('get_cash_bank_accounts').catch(() => []),
                invoke<LedgerAccount[]>('get_chart_of_accounts').catch(() => []),
            ]);

            setCashBankAccounts(cashBankData);
            setLedgerAccounts(allLedgersData);

            // Auto-select first accounts
            const firstCash = cashBankData.find(a => a.account_group === 'Cash');
            const firstBank = cashBankData.find(a => a.account_group === 'Bank Account');

            if (firstCash) {
                setCashState(prev => ({ ...prev, accountId: firstCash.id, accountName: firstCash.name }));
            }
            if (firstBank) {
                setBankState(prev => ({ ...prev, accountId: firstBank.id, accountName: firstBank.name }));
            }
        } catch (error) {
            toast.error('Failed to load accounts');
            console.error(error);
        }
    };

    const handleAccountChange = (id: number) => {
        const account = cashBankAccounts.find(a => a.id === id);
        if (!account) return;

        if (activeTab === 'Cash') {
            setCashState(prev => ({ ...prev, accountId: account.id, accountName: account.name }));
        } else {
            setBankState(prev => ({ ...prev, accountId: account.id, accountName: account.name }));
        }
    };

    const handleAmountChange = (val: number) => {
        if (activeTab === 'Cash') {
            setCashState(prev => ({ ...prev, amount: val }));
        } else {
            setBankState(prev => ({ ...prev, amount: val }));
        }
    };

    const filteredAccounts = cashBankAccounts.filter(a =>
        activeTab === 'Cash' ? a.account_group === 'Cash' : a.account_group === 'Bank Account'
    );

    const activeState = activeTab === 'Cash' ? cashState : bankState;
    const totalAmount = (cashState.amount || 0) + (bankState.amount || 0);

    const getRemainingAmount = () => {
        if (invoiceAmount <= 0) return 0;
        return invoiceAmount - totalAmount;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate
        if (totalAmount <= 0) {
            toast.error('Total payment amount must be greater than 0');
            return;
        }

        if (cashState.amount > 0 && !cashState.accountId) {
            toast.error('Please select a Cash account');
            return;
        }
        if (bankState.amount > 0 && !bankState.accountId) {
            toast.error('Please select a Bank account');
            return;
        }

        // Check if party/ledger is provided
        if (!effectivePartyName) {
            toast.error(`Please select "${ledgerLabel}"`);
            return;
        }

        try {
            setLoading(true);

            const commandName = isPayment ? 'create_payment' : 'create_receipt';

            // Prepare payloads
            const payloads = [];

            if (cashState.amount > 0) {
                const allocations = invoiceId ? [{
                    invoice_id: invoiceId,
                    amount: cashState.amount
                }] : undefined;

                payloads.push({
                    [isPayment ? 'payment' : 'receipt']: {
                        account_id: cashState.accountId,
                        voucher_date: formData.date,
                        [isPayment ? 'payment_method' : 'receipt_method']: 'Cash',
                        reference_number: null,
                        narration: formData.narration || `${isPayment ? 'Payment to' : 'Receipt from'} ${effectivePartyName}`,
                        items: [
                            {
                                description: effectivePartyName,
                                account_id: isAutoMode ? partyId : undefined,
                                amount: cashState.amount,
                                tax_rate: 0,
                                remarks: `${cashState.accountName} - ${invoiceAmount > 0 ? 'Invoice payment' : ''}`,
                                allocations,
                            },
                        ],
                    },
                });
            }

            if (bankState.amount > 0) {
                const allocations = invoiceId ? [{
                    invoice_id: invoiceId,
                    amount: bankState.amount
                }] : undefined;

                payloads.push({
                    [isPayment ? 'payment' : 'receipt']: {
                        account_id: bankState.accountId,
                        voucher_date: formData.date,
                        [isPayment ? 'payment_method' : 'receipt_method']: 'Bank Transfer',
                        reference_number: null,
                        narration: formData.narration || `${isPayment ? 'Payment to' : 'Receipt from'} ${effectivePartyName}`,
                        items: [
                            {
                                description: effectivePartyName,
                                account_id: isAutoMode ? partyId : undefined,
                                amount: bankState.amount,
                                tax_rate: 0,
                                remarks: `${bankState.accountName} - ${invoiceAmount > 0 ? 'Invoice payment' : ''}`,
                                allocations,
                            },
                        ],
                    },
                });
            }

            // Execute commands
            for (const payload of payloads) {
                await invoke(commandName, payload);
            }

            toast.success(`${isPayment ? 'Payment' : 'Receipt'} saved successfully`);
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            console.error('Save error:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to save');
        } finally {
            setLoading(false);
        }
    };

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

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Manual Ledger Selection (Only show if NOT in auto mode) */}
                    {!isAutoMode && (
                        <div>
                            <Label className="text-sm font-medium mb-1.5 block">{ledgerLabel} *</Label>
                            <Combobox
                                value={manualLedgerName}
                                options={ledgerAccounts.map(l => ({ value: l.account_name, label: l.account_name }))}
                                onChange={(val) => setManualLedgerName(val as string)}
                                placeholder="Select ledger"
                                searchPlaceholder="Search ledgers..."
                            />
                        </div>
                    )}

                    <div className="space-y-4 border rounded-md p-4 bg-muted/20">
                        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'Cash' | 'Bank')} className="w-full">
                            <TabsList className="grid w-full grid-cols-2 mb-4">
                                <TabsTrigger value="Cash">
                                    Cash {cashState.amount > 0 && `(₹${cashState.amount})`}
                                </TabsTrigger>
                                <TabsTrigger value="Bank">
                                    Bank {bankState.amount > 0 && `(₹${bankState.amount})`}
                                </TabsTrigger>
                            </TabsList>

                            <div className="space-y-4">
                                {/* Account Selection */}
                                <div>
                                    <Label className="text-sm font-medium mb-1.5 block">
                                        {accountLabel} ({activeTab}) *
                                    </Label>
                                    <Combobox
                                        value={activeState.accountId}
                                        options={filteredAccounts.map(a => ({ value: a.id, label: a.name }))}
                                        onChange={(val) => handleAccountChange(val as number)}
                                        placeholder={`Select ${activeTab} Account`}
                                        searchPlaceholder="Search accounts..."
                                    />
                                    {filteredAccounts.length === 0 && (
                                        <p className="text-xs text-red-500 mt-1">No {activeTab} accounts found.</p>
                                    )}
                                </div>

                                {/* Amount */}
                                <div>
                                    <Label className="text-sm font-medium mb-1.5 block">Amount *</Label>
                                    <Input
                                        type="number"
                                        value={activeState.amount || ''}
                                        onChange={(e) => handleAmountChange(parseFloat(e.target.value) || 0)}
                                        placeholder="0.00"
                                        step="0.01"
                                        className="font-mono text-lg"
                                        autoFocus
                                    />
                                </div>
                            </div>
                        </Tabs>

                        {/* Total and Remaining Display */}
                        {hasInvoiceAmount && (
                            <div className="bg-background border rounded p-3 text-sm space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Invoice Amount:</span>
                                    <span className="font-mono">₹{invoiceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className={`flex justify-between font-medium ${remainingAmount > 0 ? 'text-orange-600' : remainingAmount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    <span>{remainingAmount > 0 ? 'Remaining:' : remainingAmount < 0 ? 'Excess:' : 'Balanced'}</span>
                                    <span className="font-mono">
                                        {remainingAmount === 0 ? '✓' : `₹${Math.abs(remainingAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                className="min-h-[38px] h-10 py-2 resize-none text-sm"
                            />
                        </div>
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
            </DialogContent>
        </Dialog>
    );
}
