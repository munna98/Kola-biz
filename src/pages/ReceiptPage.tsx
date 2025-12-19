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
    IconKeyboard,
    IconReceipt,
} from '@tabler/icons-react';

interface AccountData {
    id: number;
    name: string;
}

export default function ReceiptPage() {
    const dispatch = useDispatch<AppDispatch>();
    const receiptState = useSelector((state: RootState) => state.receipt);

    const [depositToAccounts, setDepositToAccounts] = useState<AccountData[]>([]);
    const [receivedFromLedgers, setReceivedFromLedgers] = useState<AccountData[]>([]);
    const [isInitializing, setIsInitializing] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);

    const formRef = useRef<HTMLFormElement>(null);
    const depositToRef = useRef<HTMLDivElement>(null);

    // Load Data
    useEffect(() => {
        const loadData = async () => {
            try {
                const [cashBankData, allLedgersData] = await Promise.all([
                    invoke<AccountData[]>('get_cash_bank_accounts').catch(() => []),
                    invoke<AccountData[]>('get_chart_of_accounts').catch(() => []),
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

    // Calculations
    const calculateTotals = useCallback((items: ReceiptItem[]) => {
        const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
        return { subtotal: total, tax: 0, grandTotal: total };
    }, []);

    const handleUpdateItem = (index: number, field: string, value: any) => {
        const updatedItems = [...receiptState.items];
        updatedItems[index] = { ...updatedItems[index], [field]: value };

        dispatch(updateReceiptItem({ index, data: { [field]: value } }));

        const newTotals = calculateTotals(updatedItems);
        dispatch(setReceiptTotals(newTotals));
    };

    const handleAddItem = () => {
        dispatch(addReceiptItem({ description: '', amount: 0, tax_rate: 0 }));
    };

    const handleRemoveItem = (index: number) => {
        if (receiptState.items.length === 1) return;
        const updatedItems = receiptState.items.filter((_, i) => i !== index);
        dispatch(removeReceiptItem(index));
        dispatch(setReceiptTotals(calculateTotals(updatedItems)));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!receiptState.form.account_id) return toast.error('Select "Deposit To" account');

        try {
            dispatch(setReceiptLoading(true));
            await invoke('create_receipt', { receipt: { ...receiptState.form, items: receiptState.items } });
            toast.success('Receipt saved successfully');
            dispatch(resetReceiptForm());
            handleAddItem();
        } catch (error) {
            toast.error('Failed to save receipt');
        } finally {
            dispatch(setReceiptLoading(false));
        }
    };

    if (isInitializing) return <div className="p-6">Loading...</div>;

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden">
            {/* Header */}
            <div className="p-6 pb-0 flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2"> Receipt</h1>
                    <p className="text-sm text-muted-foreground">Record money received into bank or cash</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowShortcuts(!showShortcuts)}>
                    <IconKeyboard size={16} className="mr-2" /> Shortcuts
                </Button>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col flex-1 p-6 gap-4 overflow-hidden">

                {/* Master Header Section */}
                <div className="grid grid-cols-4 gap-4 p-4 border rounded-lg bg-card shadow-sm">
                    <div className="col-span-2" ref={depositToRef}>
                        <Label className="text-xs">Deposit To (Bank/Cash) *</Label>
                        <Combobox
                            value={receiptState.form.account_id}
                            options={depositToAccounts.map(a => ({ value: a.id, label: a.name }))}
                            onChange={(val) => {
                                const acc = depositToAccounts.find(a => a.id === val);
                                if (acc) dispatch(setReceiptAccount({ id: acc.id, name: acc.name }));
                            }}
                            placeholder="Select destination account"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Date</Label>
                        <Input type="date" value={receiptState.form.voucher_date} onChange={(e) => dispatch(setReceiptDate(e.target.value))} />
                    </div>
                    <div>
                        <Label className="text-xs">Reference Number</Label>
                        <Input value={receiptState.form.reference_number} onChange={(e) => dispatch(setReceiptReference(e.target.value))} placeholder="Cheque/Ref No" />
                    </div>
                    <div className="col-span-4">
                        <Label className="text-xs">Narration (Overall Notes)</Label>
                        <Input
                            value={receiptState.form.narration}
                            onChange={(e) => dispatch(setReceiptNarration(e.target.value))}
                            placeholder="Enter details about this receipt..."
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
                                <th className="text-left p-3 font-medium text-muted-foreground w-1/3">Received From (Account/Ledger)</th>
                                <th className="text-right p-3 font-medium text-muted-foreground w-32">Amount</th>
                                <th className="text-left p-3 font-medium text-muted-foreground">Remarks (Line Info)</th>
                                <th className="p-3 w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y overflow-y-auto">
                            {receiptState.items.map((item, index) => (
                                <tr key={item.id || index} className="hover:bg-muted/30 transition-colors group">
                                    <td className="p-2">
                                        <Combobox
                                            value={item.description}
                                            options={receivedFromLedgers.map(l => ({ value: l.name, label: l.name }))}
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
                                        <Input
                                            value={(item as any).remarks || ''}
                                            onChange={(e) => handleUpdateItem(index, 'remarks', e.target.value)}
                                            className="h-8 text-xs"
                                            placeholder="e.g. For Invoice #001"
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

                {/* Footer Actions */}
                <div className="flex items-center justify-between border-t pt-4 bg-background">
                    <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total Receipt</span>
                        <span className="text-2xl font-mono font-bold text-primary">
                            ₹ {receiptState.totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                    <div className="flex gap-3">
                        <Button type="button" variant="outline" onClick={() => dispatch(resetReceiptForm())} className="px-6">
                            <IconX size={16} className="mr-2" /> Clear
                        </Button>
                        <Button type="submit" disabled={receiptState.loading} className="px-8 shadow-lg">
                            {receiptState.loading ? 'Saving...' : (
                                <>
                                    <IconCheck size={16} className="mr-2" /> Save Receipt
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}