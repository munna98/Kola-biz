import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
    IconTrash,
    IconCash,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Allocation {
    id: number;
    payment_voucher_id: number;
    payment_voucher_no: string;
    payment_voucher_date: string;
    allocated_amount: number;
    allocation_date: string;
    remarks: string | null;
    payment_method: string | null;
}

interface AllocationsListProps {
    invoiceId: number | undefined;
    paymentType: 'payment' | 'receipt';
    onAllocationDeleted?: () => void;
    onQuickPayment?: () => void;
    readOnly?: boolean;
}

export function AllocationsList({
    invoiceId,
    paymentType,
    onAllocationDeleted,
    onQuickPayment,
    readOnly = false,
}: AllocationsListProps) {
    const [allocations, setAllocations] = useState<Allocation[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedAllocationId, setSelectedAllocationId] = useState<number | null>(null);

    const loadAllocations = async () => {
        if (!invoiceId) {
            setAllocations([]);
            return;
        }

        try {
            setLoading(true);
            const data = await invoke<Allocation[]>('get_invoice_allocations_with_details', {
                invoiceVoucherId: invoiceId,
            });
            setAllocations(data);
        } catch (error) {
            console.error('Failed to load allocations:', error);
            toast.error('Failed to load payment allocations');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAllocations();
    }, [invoiceId]);

    const handleDeleteClick = (allocationId: number) => {
        setSelectedAllocationId(allocationId);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!selectedAllocationId) return;

        try {
            await invoke('delete_allocation', { id: selectedAllocationId });
            toast.success('Allocation deleted successfully');
            setDeleteDialogOpen(false);
            setSelectedAllocationId(null);
            await loadAllocations();
            onAllocationDeleted?.();
        } catch (error) {
            console.error('Failed to delete allocation:', error);
            toast.error('Failed to delete allocation');
        }
    };

    const parsePaymentMethod = (metadata: string | null): string => {
        if (!metadata) return '-';
        try {
            const parsed = JSON.parse(metadata);
            return parsed.method || '-';
        } catch {
            return '-';
        }
    };

    const totalAllocated = allocations.reduce((sum, a) => sum + a.allocated_amount, 0);

    if (!invoiceId) {
        return null;
    }

    return (
        <div className="bg-card border rounded-lg overflow-hidden">
            <div className="bg-muted/50 border-b px-3 py-2 flex items-center justify-between">
                <h3 className="text-sm font-medium">
                    {paymentType === 'payment' ? 'Payments' : 'Receipts'} Allocated
                </h3>
                {!readOnly && onQuickPayment && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onQuickPayment}
                        className="h-7 text-xs"
                    >
                        <IconCash size={14} className="mr-1" />
                        Quick {paymentType === 'payment' ? 'Payment' : 'Receipt'}
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    Loading allocations...
                </div>
            ) : allocations.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No {paymentType === 'payment' ? 'payments' : 'receipts'} allocated yet
                </div>
            ) : (
                <>
                    <div className="divide-y">
                        {allocations.map((allocation) => (
                            <div
                                key={allocation.id}
                                className="px-3 py-2 hover:bg-muted/30 flex items-center justify-between"
                            >
                                <div className="flex-1 grid grid-cols-5 gap-3 text-sm">
                                    <div>
                                        <div className="font-medium text-xs text-muted-foreground mb-0.5">
                                            Voucher No
                                        </div>
                                        <div className="font-mono">{allocation.payment_voucher_no}</div>
                                    </div>
                                    <div>
                                        <div className="font-medium text-xs text-muted-foreground mb-0.5">Date</div>
                                        <div>{new Date(allocation.payment_voucher_date).toLocaleDateString()}</div>
                                    </div>
                                    <div>
                                        <div className="font-medium text-xs text-muted-foreground mb-0.5">
                                            Amount
                                        </div>
                                        <div className="font-mono font-medium">
                                            ₹{allocation.allocated_amount.toFixed(2)}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="font-medium text-xs text-muted-foreground mb-0.5">
                                            Method
                                        </div>
                                        <div className="capitalize">
                                            {parsePaymentMethod(allocation.payment_method)}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="font-medium text-xs text-muted-foreground mb-0.5">
                                            Remarks
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {allocation.remarks || '-'}
                                        </div>
                                    </div>
                                </div>
                                {!readOnly && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteClick(allocation.id)}
                                        className="h-7 w-7 p-0 ml-2"
                                        title="Delete allocation"
                                    >
                                        <IconTrash size={14} />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="bg-muted/50 border-t px-3 py-2 flex justify-between text-sm font-medium">
                        <span>Total Allocated:</span>
                        <span className="font-mono">₹{totalAllocated.toFixed(2)}</span>
                    </div>
                </>
            )}

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Allocation</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this allocation? This action cannot be undone and
                            will update the invoice payment status.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
