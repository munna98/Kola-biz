import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMoney } from '@/hooks/useMoney';
import { toast } from 'sonner';

interface PendingInvoice {
    id: string;
    voucher_no: string;
    voucher_date: string;
    voucher_type: string;
    total_amount: number;
    pending_amount: number;
    narration: string | null;
    exchange_rate?: number | null;
    foreign_total?: number | null;
    foreign_pending_amount?: number | null;
}

export interface AllocationData {
    invoice_id: string;
    amount: number;
}

interface BillAllocationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    partyId: number;
    amountToAllocate: number; // The amount entered in the payment line
    allocations: AllocationData[];
    onConfirm: (allocations: AllocationData[]) => void;
    moneyFormatter?: (amount: number | null | undefined) => string;
}

export default function BillAllocationDialog({
    open,
    onOpenChange,
    partyId,
    amountToAllocate,
    allocations: initialAllocations,
    onConfirm,
    moneyFormatter,
}: BillAllocationDialogProps) {
    const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
    const [allocations, setAllocations] = useState<AllocationData[]>([]);
    const [loading, setLoading] = useState(false);
    const defaultMoney = useMoney();
    const money = moneyFormatter || defaultMoney;

    const getEffectivePending = (inv: PendingInvoice) => {
        return (moneyFormatter && inv.foreign_pending_amount != null && inv.foreign_pending_amount > 0)
            ? inv.foreign_pending_amount
            : inv.pending_amount;
    };

    // Map for easy lookup [invoiceId]: allocatedAmount
    const allocationMap = useMemo(() => {
        const map = new Map<string, number>();
        allocations.forEach(a => map.set(a.invoice_id, a.amount));
        return map;
    }, [allocations]);

    useEffect(() => {
        if (open && partyId) {
            fetchPendingInvoices();
            setAllocations(initialAllocations);
        }
    }, [open, partyId]);

    const fetchPendingInvoices = async () => {
        try {
            setLoading(true);
            const data = await invoke<PendingInvoice[]>('get_pending_invoices', { accountId: partyId });
            setInvoices(data);
        } catch (error) {
            console.error('Failed to fetch pending invoices:', error);
            toast.error('Failed to load pending invoices');
        } finally {
            setLoading(false);
        }
    };

    const handleAllocationChange = (invoice: PendingInvoice, newAmount: number) => {
        const pending = getEffectivePending(invoice);
        // Clamp amount between 0 and pending amount
        const clampedAmount = Math.max(0, Math.min(newAmount, pending));

        setAllocations(prev => {
            const others = prev.filter(a => a.invoice_id !== invoice.id);
            if (clampedAmount <= 0) return others;
            return [...others, { invoice_id: invoice.id, amount: clampedAmount }];
        });
    };

    const handleToggleInvoice = (invoice: PendingInvoice, checked: boolean) => {
        const pending = getEffectivePending(invoice);
        if (checked) {
            // Calculate remaining unallocated from voucher amount
            const currentAllocatedTotal = allocations.reduce((sum, a) => sum + a.amount, 0);
            const remainingVoucherAmount = Math.max(0, amountToAllocate - currentAllocatedTotal);

            const fillAmount = remainingVoucherAmount > 0
                ? Math.min(pending, remainingVoucherAmount)
                : pending; // If no remaining budget, just fill full pending (user can edit)

            handleAllocationChange(invoice, fillAmount);
        } else {
            handleAllocationChange(invoice, 0);
        }
    };

    const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
    const remainingToAllocate = amountToAllocate - totalAllocated;

    const handleSave = () => {
        onConfirm(allocations);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Billwise Allocation</DialogTitle>
                    <DialogDescription>
                        Allocate voucher amount ({money(amountToAllocate)}) against pending invoices.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex justify-between items-center py-2 px-1 bg-muted/50 rounded-md text-sm mb-2">
                    <div>
                        <span className="text-muted-foreground mr-2">Allocated:</span>
                        <span className="font-semibold text-blue-600">{money(totalAllocated)}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground mr-2">Unallocated:</span>
                        <span className={`font-semibold ${remainingToAllocate < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {money(remainingToAllocate)}
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto border rounded-md">
                    <table className="w-full text-sm">
                        <thead className="bg-muted sticky top-0 z-10">
                            <tr className="text-left">
                                <th className="p-2 w-10"></th>
                                <th className="p-2 font-medium">Date</th>
                                <th className="p-2 font-medium">Ref No</th>
                                <th className="p-2 font-medium">Pending</th>
                                <th className="p-2 font-medium text-right">Allocation</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr><td colSpan={5} className="p-4 text-center">Loading invoices...</td></tr>
                            ) : invoices.length === 0 ? (
                                <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No pending invoices found</td></tr>
                            ) : (
                                invoices.map(inv => {
                                    const allocated = allocationMap.get(inv.id) || 0;
                                    const isSelected = allocated > 0;

                                    return (
                                        <tr key={inv.id} className={isSelected ? 'bg-blue-50/50' : ''}>
                                            <td className="p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => handleToggleInvoice(inv, e.target.checked)}
                                                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                                                />
                                            </td>
                                            <td className="p-2 text-muted-foreground">{new Date(inv.voucher_date).toLocaleDateString()}</td>
                                            <td className="p-2 font-medium">{inv.voucher_no} {inv.voucher_type === 'sales_invoice' ? '(SI)' : '(PI)'}</td>
                                            <td className="p-2 text-muted-foreground">{money(getEffectivePending(inv))}</td>
                                            <td className="p-2 text-right">
                                                <Input
                                                    type="number"
                                                    className={`h-7 w-32 ml-auto text-right ${isSelected ? 'border-blue-300 ring-blue-100' : ''}`}
                                                    value={allocated || ''}
                                                    placeholder="0.00"
                                                    onChange={(e) => handleAllocationChange(inv, parseFloat(e.target.value) || 0)}
                                                    onFocus={(e) => e.target.select()}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Confirm Allocation</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
