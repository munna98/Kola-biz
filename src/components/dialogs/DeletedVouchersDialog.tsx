import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  IconTrash,
  IconRefresh,
  IconSearch,
  IconAlertTriangle,
  IconTrashFilled,
  IconFileInvoice
} from '@tabler/icons-react';
import { api, type DeletedVoucher } from '@/lib/tauri';
import { useMoney } from '@/hooks/useMoney';
import { toast } from 'sonner';

const VOUCHER_TYPE_OPTIONS = [
  { value: 'all', label: 'All Voucher Types' },
  { value: 'sales_invoice', label: 'Sales Invoice' },
  { value: 'sales_quotation', label: 'Sales Quotation' },
  { value: 'delivery_note', label: 'Delivery Note' },
  { value: 'purchase_invoice', label: 'Purchase Invoice' },
  { value: 'sales_return', label: 'Sales Return' },
  { value: 'purchase_return', label: 'Purchase Return' },
  { value: 'opening_stock', label: 'Opening Stock' },
  { value: 'stock_journal', label: 'Stock Journal' },
  { value: 'payment', label: 'Payment' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'journal', label: 'Journal' },
];

const formatVoucherType = (type: string) => {
  const match = VOUCHER_TYPE_OPTIONS.find((v) => v.value === type);
  if (match) return match.label;
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

interface DeletedVouchersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialVoucherType?: string;
  onVouchersChange?: () => void;
}

export default function DeletedVouchersDialog({
  open,
  onOpenChange,
  initialVoucherType = 'all',
  onVouchersChange,
}: DeletedVouchersDialogProps) {
  const [vouchers, setVouchers] = useState<DeletedVoucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>(initialVoucherType);
  const [searchTerm, setSearchTerm] = useState('');
  const [restoringVoucher, setRestoringVoucher] = useState<DeletedVoucher | null>(null);
  const [hardDeletingVoucher, setHardDeletingVoucher] = useState<DeletedVoucher | null>(null);
  const [showEmptyBinConfirm, setShowEmptyBinConfirm] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);

  const money = useMoney();

  const loadDeletedVouchers = async () => {
    try {
      setLoading(true);
      const data = await api.vouchers.listDeleted(selectedType === 'all' ? undefined : selectedType);
      setVouchers(data);
    } catch (error: any) {
      toast.error(error?.toString() || 'Failed to load deleted vouchers');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadDeletedVouchers();
    }
  }, [open, selectedType]);

  const filteredVouchers = useMemo(() => {
    if (!searchTerm.trim()) return vouchers;
    const term = searchTerm.toLowerCase();
    return vouchers.filter(
      (v) =>
        v.voucher_no.toLowerCase().includes(term) ||
        (v.party_name && v.party_name.toLowerCase().includes(term)) ||
        v.voucher_date.toLowerCase().includes(term) ||
        v.voucher_type.toLowerCase().includes(term)
    );
  }, [vouchers, searchTerm]);

  const handleRestore = async () => {
    if (!restoringVoucher) return;
    try {
      setActionInProgress(true);
      await api.vouchers.restore(restoringVoucher.id);
      toast.success(`Voucher ${restoringVoucher.voucher_no} restored successfully`);
      setRestoringVoucher(null);
      await loadDeletedVouchers();
      onVouchersChange?.();
    } catch (error: any) {
      toast.error(error?.toString() || 'Failed to restore voucher');
      console.error(error);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleHardDelete = async () => {
    if (!hardDeletingVoucher) return;
    try {
      setActionInProgress(true);
      await api.vouchers.hardDelete(hardDeletingVoucher.id);
      toast.success(`Voucher ${hardDeletingVoucher.voucher_no} permanently deleted`);
      setHardDeletingVoucher(null);
      await loadDeletedVouchers();
      onVouchersChange?.();
    } catch (error: any) {
      toast.error(error?.toString() || 'Failed to permanently delete voucher');
      console.error(error);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleEmptyBin = async () => {
    try {
      setActionInProgress(true);
      const count = await api.vouchers.hardDeleteAll(selectedType === 'all' ? undefined : selectedType);
      toast.success(`${count} deleted voucher${count !== 1 ? 's' : ''} permanently deleted`);
      setShowEmptyBinConfirm(false);
      await loadDeletedVouchers();
      onVouchersChange?.();
    } catch (error: any) {
      toast.error(error?.toString() || 'Failed to empty recycle bin');
      console.error(error);
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader className="shrink-0">
            <div className="flex items-center gap-2">
              <IconTrash className="h-5 w-5 text-destructive" />
              <DialogTitle className="text-xl font-bold">Deleted Vouchers (Recycle Bin)</DialogTitle>
            </div>
            <DialogDescription>
              Review vouchers moved to the Recycle Bin. Restore them to active status or permanently delete them to free references.
            </DialogDescription>
          </DialogHeader>

          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 my-2 shrink-0">
            <div className="flex items-center gap-2 flex-1">
              <div className="w-[180px] shrink-0">
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOUCHER_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative flex-1">
                <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search voucher # or party..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {vouchers.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive/60 text-destructive hover:bg-destructive/10 h-9"
                  onClick={() => setShowEmptyBinConfirm(true)}
                  disabled={loading}
                >
                  <IconTrashFilled className="mr-1.5 h-4 w-4" />
                  Empty Bin ({filteredVouchers.length})
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={loadDeletedVouchers} disabled={loading} className="h-9">
                <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Vouchers Table */}
          <div className="flex-1 overflow-auto border rounded-md">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading deleted vouchers...</div>
            ) : filteredVouchers.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground space-y-2">
                <IconFileInvoice className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="text-base font-medium">No deleted vouchers found</p>
                <p className="text-xs text-muted-foreground">
                  {searchTerm ? 'Try adjusting your search criteria' : 'Recycle Bin is currently empty for this filter'}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b sticky top-0 text-muted-foreground text-xs uppercase font-medium">
                  <tr>
                    <th className="py-2.5 px-3 text-left">Date</th>
                    <th className="py-2.5 px-3 text-left">Voucher #</th>
                    <th className="py-2.5 px-3 text-left">Type</th>
                    <th className="py-2.5 px-3 text-left">Party</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3 text-left">Deleted At</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredVouchers.map((v) => (
                    <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {v.voucher_date}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-medium text-foreground">
                        {v.voucher_no}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge variant="outline" className="text-[11px] font-normal py-0">
                          {formatVoucherType(v.voucher_type)}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 max-w-[180px] truncate" title={v.party_name || 'N/A'}>
                        {v.party_name || 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap">
                        {money(v.grand_total ?? v.total_amount)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-xs text-muted-foreground">
                        {v.deleted_at ? v.deleted_at.replace('T', ' ').substring(0, 16) : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                                  onClick={() => setRestoringVoucher(v)}
                                >
                                  <IconRefresh className="h-3.5 w-3.5 mr-1" />
                                  Restore
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Restore this voucher to active records</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setHardDeletingVoucher(v)}
                                >
                                  <IconTrash className="h-3.5 w-3.5 mr-1" />
                                  Delete
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Permanently delete this voucher</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={Boolean(restoringVoucher)} onOpenChange={(o) => !o && setRestoringVoucher(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <IconRefresh className="h-5 w-5 text-blue-600" />
              Restore Voucher?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Are you sure you want to restore{' '}
                  <strong>
                    {restoringVoucher?.voucher_no} ({restoringVoucher && formatVoucherType(restoringVoucher.voucher_type)})
                  </strong>{' '}
                  dated {restoringVoucher?.voucher_date}?
                </p>
                <p className="text-xs text-muted-foreground">
                  The voucher will be moved back to active records. If any referenced products are in the Recycle Bin,
                  they will also be restored.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionInProgress}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={actionInProgress}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {actionInProgress ? 'Restoring...' : 'Yes, Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanently Delete Confirmation Dialog */}
      <AlertDialog open={Boolean(hardDeletingVoucher)} onOpenChange={(o) => !o && setHardDeletingVoucher(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <IconAlertTriangle className="h-5 w-5 text-destructive" />
              Permanently Delete Voucher?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Permanently delete{' '}
                  <strong>
                    {hardDeletingVoucher?.voucher_no} ({hardDeletingVoucher && formatVoucherType(hardDeletingVoucher.voucher_type)})
                  </strong>
                  ?
                </p>
                <p className="text-xs text-destructive font-medium">
                  ⚠️ This action is completely irreversible. All items and records for this voucher will be permanently erased
                  from the database.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionInProgress}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleHardDelete}
              disabled={actionInProgress}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {actionInProgress ? 'Deleting...' : 'Delete Permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Empty Bin Confirmation Dialog */}
      <AlertDialog open={showEmptyBinConfirm} onOpenChange={setShowEmptyBinConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <IconTrashFilled className="h-5 w-5 text-destructive" />
              Empty Recycle Bin?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Are you sure you want to permanently delete all {filteredVouchers.length} deleted voucher(s)
                  {selectedType !== 'all' ? ` of type "${formatVoucherType(selectedType)}"` : ''}?
                </p>
                <p className="text-xs text-destructive font-medium">
                  ⚠️ This will permanently remove all selected vouchers and their items. This cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionInProgress}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEmptyBin}
              disabled={actionInProgress}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {actionInProgress ? 'Emptying...' : 'Yes, Empty All'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
