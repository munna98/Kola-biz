import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { IconSearch, IconList } from '@tabler/icons-react';
import { formatDate } from '@/lib/utils';

interface VoucherSummary {
    id: number;
    voucher_no: string;
    voucher_date: string;
    party_name: string | null;
    total_amount: number;
    voucher_type: string;
}

interface VoucherListViewSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    voucherType: string;
    onSelectVoucher: (id: number) => void;
    trigger?: React.ReactNode;
    title?: string;
}

export function VoucherListViewSheet({
    open,
    onOpenChange,
    voucherType,
    onSelectVoucher,
    trigger,
    title
}: VoucherListViewSheetProps) {
    const [vouchers, setVouchers] = useState<VoucherSummary[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            loadVouchers();
        }
    }, [open, searchQuery]); // Reload when search changes or opened

    const loadVouchers = async () => {
        try {
            setLoading(true);
            // Default limit 50, offset 0 for now
            const data = await invoke<VoucherSummary[]>('list_vouchers', {
                voucherType,
                limit: 50,
                offset: 0,
                searchQuery: searchQuery || null
            });
            setVouchers(data);
        } catch (error) {
            console.error('Failed to list vouchers:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
            <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0 gap-0" side="right">
                <SheetHeader className="px-6 py-4 border-b">
                    <SheetTitle className="flex items-center gap-2">
                        <IconList size={20} />
                        {title || 'Voucher List'}
                    </SheetTitle>
                    <div className="relative mt-2">
                        <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by number or party..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 bg-muted/50"
                        />
                    </div>
                </SheetHeader>

                <ScrollArea className="flex-1">
                    <div className="flex flex-col p-2 gap-1">
                        {loading ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
                        ) : vouchers.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">No vouchers found</div>
                        ) : (
                            vouchers.map((voucher) => (
                                <button
                                    key={voucher.id}
                                    className="flex flex-col gap-1 p-3 text-left rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
                                    onClick={() => {
                                        onSelectVoucher(voucher.id);
                                        onOpenChange(false);
                                    }}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-mono font-medium text-sm">{voucher.voucher_no}</span>
                                        <span className="text-xs text-muted-foreground">{formatDate(voucher.voucher_date)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm truncate max-w-[200px]" title={voucher.party_name || 'N/A'}>
                                            {voucher.party_name || 'N/A'}
                                        </span>
                                        <span className="font-bold text-sm">
                                            ₹{voucher.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </ScrollArea>

                <div className="p-4 border-t text-xs text-center text-muted-foreground bg-muted/20">
                    Showing latest 50 vouchers
                </div>
            </SheetContent>
        </Sheet>
    );
}
