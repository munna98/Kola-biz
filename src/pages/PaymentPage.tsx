import { useEffect, useState, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    setPaymentAccount,
    setPaymentDate,
    setPaymentMethod,
    setPaymentReference,
    setPaymentNarration,
    addPaymentItem,
    updatePaymentItem,
    removePaymentItem,
    setPaymentTotals,
    resetPaymentForm,
    setPaymentLoading,
} from '@/store';
import type { RootState, AppDispatch, PaymentItem } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import {
    IconPlus,
    IconTrash,
    IconCheck,
    IconX,
    IconKeyboard,
    IconWallet,
} from '@tabler/icons-react';

interface AccountData {
    id: number;
    name: string;
}

export default function PaymentPage() {
    const dispatch = useDispatch<AppDispatch>();
    const paymentState = useSelector((state: RootState) => state.payment);

    const [payFromAccounts, setPayFromAccounts] = useState<AccountData[]>([]);
    const [payToLedgers, setPayToLedgers] = useState<AccountData[]>([]);
    const [isInitializing, setIsInitializing] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);

    const formRef = useRef<HTMLFormElement>(null);
    const payFromRef = useRef<HTMLDivElement>(null);

    // Load Data
    useEffect(() => {
        const loadData = async () => {
            try {
                const [cashBankData, allLedgersData] = await Promise.all([
                    invoke<AccountData[]>('get_cash_bank_accounts').catch(() => []),
                    invoke<AccountData[]>('get_chart_of_accounts').catch(() => []),
                ]);
                setPayFromAccounts(cashBankData);
                setPayToLedgers(allLedgersData);

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

    // Calculations (Simplified: No Tax)
    const calculateTotals = useCallback((items: PaymentItem[]) => {
        const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
        return { subtotal: total, tax: 0, grandTotal: total };
    }, []);

    const handleUpdateItem = (index: number, field: string, value: any) => {
        const updatedItems = [...paymentState.items];
        updatedItems[index] = { ...updatedItems[index], [field]: value };

        dispatch(updatePaymentItem({ index, data: { [field]: value } }));

        const newTotals = calculateTotals(updatedItems);
        dispatch(setPaymentTotals(newTotals));
    };

    const handleAddItem = () => {
        dispatch(addPaymentItem({ description: '', amount: 0, tax_rate: 0 }));
    };

    const handleRemoveItem = (index: number) => {
        if (paymentState.items.length === 1) return;
        const updatedItems = paymentState.items.filter((_, i) => i !== index);
        dispatch(removePaymentItem(index));
        dispatch(setPaymentTotals(calculateTotals(updatedItems)));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentState.form.account_id) return toast.error('Select "Pay From" account');

        try {
            dispatch(setPaymentLoading(true));
            await invoke('create_payment', { payment: { ...paymentState.form, items: paymentState.items } });
            toast.success('Payment saved successfully');
            dispatch(resetPaymentForm());
            handleAddItem();
        } catch (error) {
            toast.error('Failed to save');
        } finally {
            dispatch(setPaymentLoading(false));
        }
    };

    if (isInitializing) return <div className="p-6">Loading...</div>;

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden">
            {/* Header */}
            <div className="p-6 pb-0 flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2"> Payment</h1>
                    <p className="text-sm text-muted-foreground">Record money paid out from bank or cash</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowShortcuts(!showShortcuts)}>
                    <IconKeyboard size={16} className="mr-2" /> Shortcuts
                </Button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col flex-1 p-6 gap-4 overflow-hidden">

                {/* Master Header Section */}
                <div className="grid grid-cols-4 gap-4 p-4 border rounded-lg bg-card shadow-sm">
                    <div className="col-span-2" ref={payFromRef}>
                        <Label className="text-xs">Pay From (Bank/Cash) *</Label>
                        <Combobox
                            value={paymentState.form.account_id}
                            options={payFromAccounts.map(a => ({ value: a.id, label: a.name }))}
                            onChange={(val) => {
                                const acc = payFromAccounts.find(a => a.id === val);
                                if (acc) dispatch(setPaymentAccount({ id: acc.id, name: acc.name }));
                            }}
                            placeholder="Select source account"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Date</Label>
                        <Input type="date" value={paymentState.form.voucher_date} onChange={(e) => dispatch(setPaymentDate(e.target.value))} />
                    </div>
                    <div>
                        <Label className="text-xs">Reference Number</Label>
                        <Input value={paymentState.form.reference_number} onChange={(e) => dispatch(setPaymentReference(e.target.value))} placeholder="Cheque/Ref No" />
                    </div>
                    <div className="col-span-4">
                        <Label className="text-xs">Narration (Overall Notes)</Label>
                        <Input
                            value={paymentState.form.narration}
                            onChange={(e) => dispatch(setPaymentNarration(e.target.value))}
                            placeholder="Enter details about this payment..."
                        />
                    </div>
                </div>

                {/* Shortcuts Bar */}
                {showShortcuts && (
                    <div className="text-[10px] flex gap-4 text-muted-foreground px-2">
                        <span><kbd className="border px-1 rounded bg-muted">Ctrl+S</kbd> Save</span>
                        <span><kbd className="border px-1 rounded bg-muted">Ctrl+N</kbd> Add Line</span>
                        <span><kbd className="border px-1 rounded bg-muted">Tab</kbd> Next Field</span>
                    </div>
                )}

                {/* Items Table */}
                <div className="flex-1 border rounded-lg overflow-hidden flex flex-col bg-card shadow-sm">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b sticky top-0 z-10">
                            <tr>
                                <th className="text-left p-3 font-medium text-muted-foreground w-1/3">Pay To (Account/Ledger)</th>
                                <th className="text-right p-3 font-medium text-muted-foreground w-32">Amount</th>
                                <th className="text-left p-3 font-medium text-muted-foreground">Remarks (Line Info)</th>
                                <th className="p-3 w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y overflow-y-auto">
                            {paymentState.items.map((item, index) => (
                                <tr key={item.id || index} className="hover:bg-muted/30 transition-colors group">
                                    <td className="p-2">
                                        <Combobox
                                            value={item.description}
                                            options={payToLedgers.map(l => ({ value: l.name, label: l.name }))}
                                            onChange={(val) => handleUpdateItem(index, 'description', val)}
                                            placeholder="Select Ledger"
                                            className="h-8"
                                        />
                                    </td>
                                    <td className="p-2">
                                        <Input
                                            type="number"
                                            value={item.amount || ''}
                                            onChange={(e) => handleUpdateItem(index, 'amount', parseFloat(e.target.value) || 0)}
                                            className="h-8 text-right font-mono"
                                            placeholder="0.00"
                                        />
                                    </td>
                                    <td className="p-2">
                                        {/* Using tax_rate field for Remarks temporarily per your state, or update your interface */}
                                        <Input
                                            value={(item as any).remarks || ''}
                                            onChange={(e) => handleUpdateItem(index, 'remarks', e.target.value)}
                                            className="h-8 text-xs"
                                            placeholder="e.g. Bill #123"
                                        />
                                    </td>
                                    <td className="p-2 text-center">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 p-0"
                                            onClick={() => handleRemoveItem(index)}
                                        >
                                            <IconTrash size={14} />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="p-2 border-t bg-muted/10">
                        <Button type="button" variant="ghost" size="sm" onClick={handleAddItem} className="text-xs h-8">
                            <IconPlus size={14} className="mr-1" /> Add Line
                        </Button>
                    </div>
                </div>

                {/* Footer Actions (Same as Purchase Invoice) */}
                <div className="flex items-center justify-between border-t pt-4 bg-background">
                    <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Payment</span>
                        <span className="text-2xl font-mono font-bold text-primary">
                            ₹ {paymentState.totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                    <div className="flex gap-3">
                        <Button type="button" variant="outline" onClick={() => dispatch(resetPaymentForm())} className="px-6">
                            <IconX size={16} className="mr-2" /> Clear
                        </Button>
                        <Button type="submit" disabled={paymentState.loading} className="px-8 shadow-lg">
                            {paymentState.loading ? 'Saving...' : (
                                <>
                                    <IconCheck size={16} className="mr-2" /> Save Payment
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}