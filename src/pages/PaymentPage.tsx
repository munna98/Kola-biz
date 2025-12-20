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
} from '@tabler/icons-react';

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
                    invoke<LedgerAccount[]>('get_chart_of_accounts').catch(() => []),
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

        const newTotals = calculateTotals(updatedItems);
        dispatch(setPaymentTotals(newTotals));
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentState.form.account_id) return toast.error('Select "Pay From" account');

        if (paymentState.items.length === 0) {
            toast.error('Add at least one item');
            return;
        }

        try {
            dispatch(setPaymentLoading(true));
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

    // Global keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl/Cmd + N: New item
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                handleAddItem();
                setTimeout(() => {
                    const lastRow = formRef.current?.querySelector('[data-row-index]:last-child');
                    lastRow?.querySelector('button')?.focus();
                }, 50);
            }
            
            // Ctrl/Cmd + S: Save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                formRef.current?.requestSubmit();
            }
            
            // Ctrl/Cmd + K: Clear form
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                dispatch(resetPaymentForm());
                handleAddItem();
                setTimeout(() => payFromRef.current?.querySelector('button')?.focus(), 100);
            }
            
            // Ctrl/Cmd + /: Show shortcuts
            if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                e.preventDefault();
                setShowShortcuts(prev => !prev);
            }

            // Escape: Close shortcuts panel
            if (e.key === 'Escape' && showShortcuts) {
                setShowShortcuts(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showShortcuts, dispatch]);

    // Row keyboard navigation
    const handleRowKeyDown = (e: React.KeyboardEvent, rowIndex: number) => {
        const currentRow = e.currentTarget;
        const inputs = Array.from(currentRow.querySelectorAll('input, button')) as HTMLElement[];
        const currentIndex = inputs.indexOf(document.activeElement as HTMLElement);
        
        // Ctrl/Cmd + D: Delete current row
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault();
            handleRemoveItem(rowIndex);
            return;
        }
        
        const moveToNext = () => {
            if (currentIndex < inputs.length - 1) {
                e.preventDefault();
                const nextInput = inputs[currentIndex + 1];
                nextInput?.focus();
                if (nextInput instanceof HTMLInputElement) {
                    nextInput.select();
                }
            } else {
                e.preventDefault();
                const nextRow = currentRow.nextElementSibling;
                if (nextRow) {
                    const firstInput = nextRow.querySelector('button') as HTMLElement;
                    firstInput?.focus();
                    firstInput?.click();
                } else {
                    handleAddItem();
                    setTimeout(() => {
                        const newRow = currentRow.parentElement?.lastElementChild;
                        const firstInput = newRow?.querySelector('button') as HTMLElement;
                        firstInput?.focus();
                        firstInput?.click();
                    }, 50);
                }
            }
        };
        
        if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
            moveToNext();
        }
        
        if (e.key === 'Tab' && e.shiftKey) {
            if (currentIndex === 0) {
                e.preventDefault();
                const prevRow = currentRow.previousElementSibling;
                if (prevRow) {
                    const prevInputs = Array.from(prevRow.querySelectorAll('input, button')) as HTMLElement[];
                    const lastInput = prevInputs[prevInputs.length - 1];
                    lastInput?.focus();
                    if (lastInput instanceof HTMLInputElement) {
                        lastInput.select();
                    }
                }
            } else {
                e.preventDefault();
                const prevInput = inputs[currentIndex - 1];
                prevInput?.focus();
                if (prevInput instanceof HTMLInputElement) {
                    prevInput.select();
                }
            }
        }

        if (e.key === 'ArrowDown' && e.ctrlKey) {
            e.preventDefault();
            const nextRow = currentRow.nextElementSibling;
            if (nextRow) {
                const nextInputs = Array.from(nextRow.querySelectorAll('input, button')) as HTMLElement[];
                const targetInput = nextInputs[currentIndex];
                targetInput?.focus();
                if (targetInput instanceof HTMLInputElement) {
                    targetInput.select();
                } else if (currentIndex === 0) {
                    targetInput?.click();
                }
            }
        }
        
        if (e.key === 'ArrowUp' && e.ctrlKey) {
            e.preventDefault();
            const prevRow = currentRow.previousElementSibling;
            if (prevRow) {
                const prevInputs = Array.from(prevRow.querySelectorAll('input, button')) as HTMLElement[];
                const targetInput = prevInputs[currentIndex];
                targetInput?.focus();
                if (targetInput instanceof HTMLInputElement) {
                    targetInput.select();
                } else if (currentIndex === 0) {
                    targetInput?.click();
                }
            }
        }
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
            {/* Header */}
            <div className="border-b bg-card/50 px-5 py-3 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-base font-semibold">Payment Voucher</h1>
                        <p className="text-xs text-muted-foreground">Record money paid out from bank or cash</p>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowShortcuts(!showShortcuts)}
                        className="h-7 text-xs"
                    >
                        <IconKeyboard size={14} />
                        Shortcuts (Ctrl+/)
                    </Button>
                </div>
            </div>

            {/* Shortcuts Panel */}
            {showShortcuts && (
                <div className="border-b bg-muted/50 px-5 py-3">
                    <div className="grid grid-cols-3 gap-4 text-xs">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+N</kbd>
                                <span>New item</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+S</kbd>
                                <span>Save payment</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+K</kbd>
                                <span>Clear form</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+D</kbd>
                                <span>Delete row (in row)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <kbd className="px-2 py-1 bg-background border rounded font-mono">Tab/Enter</kbd>
                                <span>Next field/row</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <kbd className="px-2 py-1 bg-background border rounded font-mono">Shift+Tab</kbd>
                                <span>Previous field/row</span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+↑/↓</kbd>
                                <span>Navigate rows (same column)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <kbd className="px-2 py-1 bg-background border rounded font-mono">Esc</kbd>
                                <span>Close this panel</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
                                />
                            </div>

                            {/* Reference */}
                            <div className="col-span-2">
                                <Label className="text-xs font-medium mb-1 block">Reference Number</Label>
                                <Input 
                                    value={paymentState.form.reference_number} 
                                    onChange={(e) => dispatch(setPaymentReference(e.target.value))} 
                                    placeholder="Cheque/Ref No"
                                    className="h-8 text-sm"
                                />
                            </div>
                        </div>

                        {/* Narration */}
                        <div>
                            <Label className="text-xs font-medium mb-1 block">Narration (Overall Notes)</Label>
                            <Input
                                value={paymentState.form.narration}
                                onChange={(e) => dispatch(setPaymentNarration(e.target.value))}
                                placeholder="Enter details about this payment..."
                                className="h-8 text-sm"
                            />
                        </div>
                    </div>

                    {/* Items Section */}
                    <div className="bg-card border rounded-lg overflow-hidden flex flex-col shrink-0" style={{ height: 'calc(5 * 3.25rem + 2.5rem + 2.5rem)' }}>
                        {/* Table Header */}
                        <div className="bg-muted/50 border-b shrink-0">
                            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                                <div className="col-span-5">Pay To (Account/Ledger)</div>
                                <div className="col-span-2 text-right">Amount</div>
                                <div className="col-span-4">Remarks (Line Info)</div>
                                <div className="w-8"></div>
                            </div>
                        </div>

                        {/* Items - Scrollable */}
                        <div className="divide-y overflow-y-auto flex-1">
                            {paymentState.items.map((item, index) => (
                                <div 
                                    key={item.id || index}
                                    data-row-index={index}
                                    className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-muted/30 focus-within:bg-muted/50"
                                    onKeyDown={(e) => handleRowKeyDown(e, index)}
                                >
                                    {/* Pay To Ledger */}
                                    <div className="col-span-5">
                                        <Combobox
                                            value={item.description}
                                            options={payToLedgers.map(l => ({ value: l.account_name, label: l.account_name }))}
                                            onChange={(val) => handleUpdateItem(index, 'description', val)}
                                            placeholder="Select Ledger"
                                            searchPlaceholder="Search ledgers..."
                                        />
                                    </div>

                                    {/* Amount */}
                                    <div className="col-span-2">
                                        <Input
                                            type="number"
                                            value={item.amount || ''}
                                            onChange={(e) => handleUpdateItem(index, 'amount', parseFloat(e.target.value) || 0)}
                                            className="h-7 text-xs text-right font-mono"
                                            placeholder="0.00"
                                            step="0.01"
                                        />
                                    </div>

                                    {/* Remarks */}
                                    <div className="col-span-4">
                                        <Input
                                            value={(item as any).remarks || ''}
                                            onChange={(e) => handleUpdateItem(index, 'remarks', e.target.value)}
                                            className="h-7 text-xs"
                                            placeholder="e.g. Bill #123"
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

                    {/* Bottom Actions */}
                    <div className="flex items-center justify-between border-t pt-4 shrink-0">
                        <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground font-medium">Total Payment</span>
                            <span className="text-2xl font-mono font-bold text-primary">
                                ₹ {paymentState.totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => {
                                    dispatch(resetPaymentForm());
                                    handleAddItem();
                                    setTimeout(() => payFromRef.current?.querySelector('button')?.focus(), 100);
                                }}
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
                                {paymentState.loading ? 'Saving...' : 'Save Payment'}
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}