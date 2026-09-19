import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMoney } from '@/hooks/useMoney';
import { formatDate } from '@/lib/utils';
import {
    Search,
    Package,
    Tag,
    Layers,
    Boxes,
    Building2,
    RefreshCw,
    X,
    FileText,
} from 'lucide-react';
import { toast } from 'sonner';

export interface ProductTraceInfo {
    id: string;
    code: string;
    name: string;
    barcode?: string | null;
    unit_symbol: string;
    purchase_rate: number;
    sales_rate: number;
    mrp: number;
    current_stock: number;
    group_name?: string | null;
    brand_name?: string | null;
    supplier_name?: string | null;
}

export interface ProductTraceTransaction {
    voucher_id: string;
    voucher_no: string;
    voucher_type: string;
    voucher_date: string;
    party_name?: string | null;
    movement_type: string; // 'IN' | 'OUT'
    quantity: number;
    unit_symbol: string;
    rate: number;
    discount_percent: number;
    discount_amount: number;
    total_amount: number;
    tax_amount: number;
}

export interface ProductTraceSummary {
    total_purchase_qty: number;
    total_purchase_amount: number;
    avg_purchase_rate: number;
    total_sales_qty: number;
    total_sales_amount: number;
    avg_sales_rate: number;
    current_stock: number;
}

export interface ProductTraceResponse {
    product: ProductTraceInfo;
    summary: ProductTraceSummary;
    transactions: ProductTraceTransaction[];
}

interface ProductTraceDialogProps {
    open: boolean;
    productId: string | null;
    onOpenChange: (open: boolean) => void;
    moneyFormatter?: (amount: number | null | undefined) => string;
}

type TabFilter = 'all' | 'purchases' | 'sales';

export default function ProductTraceDialog({
    open,
    productId,
    onOpenChange,
    moneyFormatter,
}: ProductTraceDialogProps) {
    const defaultMoney = useMoney();
    const money = moneyFormatter || defaultMoney;

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<ProductTraceResponse | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [tabFilter, setTabFilter] = useState<TabFilter>('all');

    useEffect(() => {
        if (open && productId) {
            fetchTraceData(productId);
        } else if (!open) {
            setData(null);
            setSearchQuery('');
            setTabFilter('all');
        }
    }, [open, productId]);

    const fetchTraceData = async (id: string) => {
        try {
            setLoading(true);
            const res = await invoke<ProductTraceResponse>('get_product_trace', {
                productId: id,
                fromDate: null,
                toDate: null,
            });
            setData(res);
        } catch (error) {
            console.error('Failed to fetch product trace:', error);
            toast.error(typeof error === 'string' ? error : 'Failed to load product trace');
        } finally {
            setLoading(false);
        }
    };

    const formatVoucherType = (type: string) => {
        switch (type) {
            case 'purchase_invoice':
                return 'Purchase Invoice';
            case 'sales_invoice':
                return 'Sales Invoice';
            case 'purchase_return':
                return 'Purchase Return';
            case 'sales_return':
                return 'Sales Return';
            case 'delivery_note':
                return 'Delivery Note';
            case 'opening_stock':
                return 'Opening Stock';
            case 'stock_journal':
                return 'Stock Journal';
            default:
                return type.replace(/_/g, ' ').toUpperCase();
        }
    };

    const filteredTransactions = useMemo(() => {
        if (!data?.transactions) return [];
        let list = data.transactions;

        // Apply Tab Filter
        if (tabFilter === 'purchases') {
            list = list.filter(t => t.voucher_type === 'purchase_invoice' || t.voucher_type === 'sales_return' || t.voucher_type === 'opening_stock');
        } else if (tabFilter === 'sales') {
            list = list.filter(t => t.voucher_type === 'sales_invoice' || t.voucher_type === 'purchase_return' || t.voucher_type === 'delivery_note');
        }

        // Apply Search Query
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(
                t =>
                    t.voucher_no.toLowerCase().includes(q) ||
                    (t.party_name && t.party_name.toLowerCase().includes(q)) ||
                    t.voucher_date.includes(q) ||
                    t.voucher_type.toLowerCase().includes(q)
            );
        }

        return list;
    }, [data, tabFilter, searchQuery]);

    const product = data?.product;

    const purchaseCount = useMemo(() => {
        return data?.transactions.filter(t => t.voucher_type === 'purchase_invoice' || t.voucher_type === 'sales_return' || t.voucher_type === 'opening_stock').length || 0;
    }, [data]);

    const salesCount = useMemo(() => {
        return data?.transactions.filter(t => t.voucher_type === 'sales_invoice' || t.voucher_type === 'purchase_return' || t.voucher_type === 'delivery_note').length || 0;
    }, [data]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-background border shadow-2xl">
                {/* Header Section */}
                <DialogHeader className="p-5 border-b bg-muted/30">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="p-1.5 rounded-md bg-primary/10 text-primary">
                                    <Package size={20} />
                                </span>
                                <DialogTitle className="text-xl font-bold truncate">
                                    {product?.name || (loading ? 'Loading product trace...' : 'Product Trace')}
                                </DialogTitle>
                                {product?.code && (
                                    <Badge variant="outline" className="font-mono text-xs font-semibold">
                                        {product.code}
                                    </Badge>
                                )}
                                {product?.barcode && (
                                    <Badge variant="secondary" className="font-mono text-xs">
                                        <Tag size={11} className="mr-1 inline" />
                                        {product.barcode}
                                    </Badge>
                                )}
                            </div>

                            {/* Product Sub-info badges */}
                            {product && (
                                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 flex-wrap">
                                    {product.group_name && (
                                        <span className="flex items-center gap-1">
                                            <Layers size={13} />
                                            {product.group_name}
                                        </span>
                                    )}
                                    {product.brand_name && (
                                        <span className="flex items-center gap-1">
                                            <Boxes size={13} />
                                            {product.brand_name}
                                        </span>
                                    )}
                                    {product.supplier_name && (
                                        <span className="flex items-center gap-1">
                                            <Building2 size={13} />
                                            Default Supplier: <strong className="text-foreground font-medium">{product.supplier_name}</strong>
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0 mr-8">
                            {productId && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fetchTraceData(productId)}
                                    disabled={loading}
                                    className="h-8 text-xs gap-1"
                                >
                                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                                    Refresh
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogHeader>

                {/* Filter and Search Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b bg-muted/10">
                    {/* Filter Tabs */}
                    <div className="flex items-center p-1 bg-muted rounded-lg text-xs font-medium">
                        <button
                            type="button"
                            onClick={() => setTabFilter('all')}
                            className={`px-3 py-1 rounded-md transition-all ${
                                tabFilter === 'all'
                                    ? 'bg-background text-foreground shadow-sm font-semibold'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            All ({data?.transactions.length || 0})
                        </button>
                        <button
                            type="button"
                            onClick={() => setTabFilter('purchases')}
                            className={`px-3 py-1 rounded-md transition-all ${
                                tabFilter === 'purchases'
                                    ? 'bg-background text-emerald-600 dark:text-emerald-400 shadow-sm font-semibold'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Purchases ({purchaseCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setTabFilter('sales')}
                            className={`px-3 py-1 rounded-md transition-all ${
                                tabFilter === 'sales'
                                    ? 'bg-background text-blue-600 dark:text-blue-400 shadow-sm font-semibold'
                                    : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Sales ({salesCount})
                        </button>
                    </div>

                    {/* Search Input */}
                    <div className="relative flex-1 max-w-xs min-w-[200px]">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Filter party, voucher no..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 pl-8 text-xs"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-y-auto max-h-[450px]">
                    <table className="w-full text-xs">
                        <thead className="bg-muted/60 sticky top-0 z-10 border-b select-none">
                            <tr className="text-left text-muted-foreground font-semibold">
                                <th className="p-2.5 pl-4">Date</th>
                                <th className="p-2.5">Type</th>
                                <th className="p-2.5">Voucher No</th>
                                <th className="p-2.5">Party</th>
                                <th className="p-2.5 text-right">Qty</th>
                                <th className="p-2.5 text-right">Rate</th>
                                <th className="p-2.5 text-right">Discount</th>
                                <th className="p-2.5 pr-4 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <RefreshCw size={20} className="animate-spin text-primary" />
                                            <span>Fetching product trace transactions...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <FileText size={24} className="opacity-40" />
                                            <span>
                                                {searchQuery
                                                    ? 'No transactions match your search filter'
                                                    : 'No purchase or sales history recorded for this product yet'}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredTransactions.map((tx, idx) => {
                                    return (
                                        <tr
                                            key={`${tx.voucher_id}-${idx}`}
                                            className="hover:bg-muted/40 transition-colors"
                                        >
                                            <td className="p-2.5 pl-4 font-mono text-muted-foreground whitespace-nowrap">
                                                {formatDate(tx.voucher_date)}
                                            </td>
                                            <td className="p-2.5 whitespace-nowrap">
                                                <Badge variant="outline" className="font-normal text-[11px]">
                                                    {formatVoucherType(tx.voucher_type)}
                                                </Badge>
                                            </td>
                                            <td className="p-2.5 font-mono font-medium whitespace-nowrap">
                                                {tx.voucher_no}
                                            </td>
                                            <td className="p-2.5 font-medium truncate max-w-[220px]" title={tx.party_name || 'Counter / Cash'}>
                                                {tx.party_name || 'Counter / Cash'}
                                            </td>
                                            <td className="p-2.5 text-right font-mono font-semibold whitespace-nowrap">
                                                <span className={tx.movement_type === 'IN' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}>
                                                    {tx.movement_type === 'IN' ? '+' : '-'}{tx.quantity} {tx.unit_symbol}
                                                </span>
                                            </td>
                                            <td className="p-2.5 text-right font-mono whitespace-nowrap">
                                                {money(tx.rate)}
                                            </td>
                                            <td className="p-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">
                                                {tx.discount_amount > 0 ? (
                                                    <span>
                                                        {money(tx.discount_amount)}
                                                        {tx.discount_percent > 0 && ` (${tx.discount_percent}%)`}
                                                    </span>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                            <td className="p-2.5 pr-4 text-right font-mono font-bold text-foreground whitespace-nowrap">
                                                {money(tx.total_amount)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Bar */}
                <div className="p-3 border-t bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
                    <div>
                        Showing <strong>{filteredTransactions.length}</strong> of{' '}
                        <strong>{data?.transactions.length || 0}</strong> transaction records
                    </div>
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8">
                        Close (Esc)
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
