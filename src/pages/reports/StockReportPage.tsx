import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    IconDownload,
    IconPrinter,
    IconRefresh,
    IconChevronDown,
    IconChevronRight,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

interface StockSummary {
    product_id: number;
    product_code: string;
    product_name: string;
    group_name: string | null;
    unit_symbol: string;
    current_stock: number;
    average_rate: number;
    stock_value: number;
    last_purchase_date: string | null;
    last_sale_date: string | null;
}

interface StockMovement {
    date: string;
    voucher_no: string;
    voucher_type: string;
    movement_type: string;
    quantity: number;
    rate: number;
    amount: number;
    balance: number;
    party_name: string | null;
}

interface ProductGroup {
    id: number;
    name: string;
}

export default function StockReportPage() {
    const [stockData, setStockData] = useState<StockSummary[]>([]);
    const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [asOnDate, setAsOnDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedGroup, setSelectedGroup] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedProduct, setExpandedProduct] = useState<number | null>(null);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [movementsLoading, setMovementsLoading] = useState(false);

    useEffect(() => {
        loadProductGroups();
        loadReport();
    }, []);

    const loadProductGroups = async () => {
        try {
            const groups = await invoke<ProductGroup[]>('get_product_groups');
            setProductGroups(groups);
        } catch (error) {
            console.error('Failed to load product groups:', error);
        }
    };

    const loadReport = async () => {
        try {
            setLoading(true);
            const groupId = selectedGroup === 'all' ? null : parseInt(selectedGroup);
            const data = await invoke<StockSummary[]>('get_stock_report', {
                groupId,
                asOnDate,
            });
            setStockData(data);
        } catch (error) {
            toast.error('Failed to load stock report');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const loadMovements = async (productId: number) => {
        try {
            setMovementsLoading(true);
            const data = await invoke<StockMovement[]>('get_stock_movements', {
                productId,
                fromDate: null,
                toDate: asOnDate,
            });
            setMovements(data);
        } catch (error) {
            toast.error('Failed to load stock movements');
            console.error(error);
        } finally {
            setMovementsLoading(false);
        }
    };

    const handleProductClick = (productId: number) => {
        if (expandedProduct === productId) {
            setExpandedProduct(null);
        } else {
            setExpandedProduct(productId);
            loadMovements(productId);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExport = () => {
        toast.info('Export functionality coming soon');
    };

    // Filter stock data based on search query
    const filteredStockData = stockData.filter((item) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            item.product_code.toLowerCase().includes(query) ||
            item.product_name.toLowerCase().includes(query) ||
            (item.group_name && item.group_name.toLowerCase().includes(query))
        );
    });

    const totalProducts = filteredStockData.filter(s => s.current_stock > 0).length;
    const totalValue = filteredStockData.reduce((sum, s) => sum + s.stock_value, 0);

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold">Stock Report</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Current inventory levels and stock movements
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={loadReport}>
                            <IconRefresh size={16} />
                            Refresh
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExport}>
                            <IconDownload size={16} />
                            Export
                        </Button>
                        <Button variant="outline" size="sm" onClick={handlePrint}>
                            <IconPrinter size={16} />
                            Print
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <div className="mt-4 flex gap-4 items-end">
                    <div className="flex-1 max-w-xs">
                        <Label className="text-xs mb-1 block">Product Group</Label>
                        <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                            <SelectTrigger className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Groups</SelectItem>
                                {productGroups.map((group) => (
                                    <SelectItem key={group.id} value={group.id.toString()}>
                                        {group.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex-1 max-w-xs">
                        <Label className="text-xs mb-1 block">As On Date</Label>
                        <Input
                            type="date"
                            value={asOnDate}
                            onChange={(e) => setAsOnDate(e.target.value)}
                            className="h-9"
                        />
                    </div>
                    <div className="flex-1 max-w-sm">
                        <Label className="text-xs mb-1 block">Search Products</Label>
                        <div className="relative">
                            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Search by code, name, or group..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-9 pl-9 pr-9"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <IconX size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                    <Button onClick={loadReport} size="sm">
                        Generate Report
                    </Button>
                </div>
            </div>

            {/* Report Content */}
            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Print Header */}
                    <div className="hidden print:block mb-6 text-center">
                        <h1 className="text-2xl font-bold">Stock Report</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            As on {formatDate(asOnDate)}
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <p className="text-muted-foreground">Loading report...</p>
                        </div>
                    ) : (
                        <Card>
                            <CardContent className="p-0">
                                <table className="w-full">
                                    <thead className="bg-muted/50 border-b">
                                        <tr>
                                            <th className="p-3 text-left text-sm font-semibold w-8"></th>
                                            <th className="p-3 text-left text-sm font-semibold">Code</th>
                                            <th className="p-3 text-left text-sm font-semibold">Product Name</th>
                                            <th className="p-3 text-left text-sm font-semibold">Group</th>
                                            <th className="p-3 text-center text-sm font-semibold">Unit</th>
                                            <th className="p-3 text-right text-sm font-semibold">Stock</th>
                                            <th className="p-3 text-right text-sm font-semibold">Avg Rate</th>
                                            <th className="p-3 text-right text-sm font-semibold">Value</th>
                                            <th className="p-3 text-center text-sm font-semibold">Last Purchase</th>
                                            <th className="p-3 text-center text-sm font-semibold">Last Sale</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStockData.length === 0 ? (
                                            <tr>
                                                <td colSpan={10} className="p-8 text-center text-muted-foreground">
                                                    {searchQuery ? 'No products found matching your search' : 'No stock data available'}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredStockData.map((item) => (
                                                <>
                                                    <tr
                                                        key={item.product_id}
                                                        className="border-b hover:bg-muted/30 cursor-pointer"
                                                        onClick={() => handleProductClick(item.product_id)}
                                                    >
                                                        <td className="p-3">
                                                            {expandedProduct === item.product_id ? (
                                                                <IconChevronDown size={16} className="text-muted-foreground" />
                                                            ) : (
                                                                <IconChevronRight size={16} className="text-muted-foreground" />
                                                            )}
                                                        </td>
                                                        <td className="p-3 text-sm font-mono">{item.product_code}</td>
                                                        <td className="p-3 text-sm font-medium">{item.product_name}</td>
                                                        <td className="p-3 text-sm text-muted-foreground">
                                                            {item.group_name || '-'}
                                                        </td>
                                                        <td className="p-3 text-center text-sm">{item.unit_symbol}</td>
                                                        <td className="p-3 text-right font-mono text-sm font-bold">
                                                            {item.current_stock.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="p-3 text-right font-mono text-sm">
                                                            ₹{item.average_rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="p-3 text-right font-mono text-sm font-bold">
                                                            ₹{item.stock_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="p-3 text-center text-xs text-muted-foreground">
                                                            {item.last_purchase_date ? formatDate(item.last_purchase_date) : '-'}
                                                        </td>
                                                        <td className="p-3 text-center text-xs text-muted-foreground">
                                                            {item.last_sale_date ? formatDate(item.last_sale_date) : '-'}
                                                        </td>
                                                    </tr>
                                                    {expandedProduct === item.product_id && (
                                                        <tr>
                                                            <td colSpan={10} className="p-0 bg-muted/20">
                                                                <div className="p-4">
                                                                    <h3 className="font-bold text-sm mb-3">Stock Movement History</h3>
                                                                    {movementsLoading ? (
                                                                        <div className="text-center py-4 text-sm text-muted-foreground">
                                                                            Loading movements...
                                                                        </div>
                                                                    ) : movements.length === 0 ? (
                                                                        <div className="text-center py-4 text-sm text-muted-foreground">
                                                                            No movements found
                                                                        </div>
                                                                    ) : (
                                                                        <table className="w-full">
                                                                            <thead className="bg-muted/30 border-b">
                                                                                <tr>
                                                                                    <th className="p-2 text-left text-xs font-semibold">Date</th>
                                                                                    <th className="p-2 text-left text-xs font-semibold">Voucher No</th>
                                                                                    <th className="p-2 text-left text-xs font-semibold">Type</th>
                                                                                    <th className="p-2 text-left text-xs font-semibold">Party</th>
                                                                                    <th className="p-2 text-center text-xs font-semibold">Movement</th>
                                                                                    <th className="p-2 text-right text-xs font-semibold">Quantity</th>
                                                                                    <th className="p-2 text-right text-xs font-semibold">Rate</th>
                                                                                    <th className="p-2 text-right text-xs font-semibold">Amount</th>
                                                                                    <th className="p-2 text-right text-xs font-semibold">Balance</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {movements.map((movement, idx) => (
                                                                                    <tr key={idx} className="border-b hover:bg-muted/20">
                                                                                        <td className="p-2 text-xs">{formatDate(movement.date)}</td>
                                                                                        <td className="p-2 text-xs font-mono">{movement.voucher_no}</td>
                                                                                        <td className="p-2 text-xs text-muted-foreground">
                                                                                            {movement.voucher_type.replace('_', ' ')}
                                                                                        </td>
                                                                                        <td className="p-2 text-xs">{movement.party_name || '-'}</td>
                                                                                        <td className="p-2 text-center">
                                                                                            <span
                                                                                                className={`px-2 py-1 rounded text-xs font-bold ${movement.movement_type === 'IN'
                                                                                                    ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                                                                                                    : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                                                                                                    }`}
                                                                                            >
                                                                                                {movement.movement_type}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="p-2 text-right text-xs font-mono">
                                                                                            {movement.quantity.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                                                                        </td>
                                                                                        <td className="p-2 text-right text-xs font-mono">
                                                                                            ₹{movement.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                                        </td>
                                                                                        <td className="p-2 text-right text-xs font-mono">
                                                                                            ₹{movement.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                                        </td>
                                                                                        <td className="p-2 text-right text-xs font-mono font-bold">
                                                                                            {movement.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </>
                                            ))
                                        )}
                                    </tbody>
                                    <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
                                        <tr>
                                            <td colSpan={5} className="p-3 font-bold text-sm">TOTAL</td>
                                            <td className="p-3 text-right font-mono font-bold text-sm">
                                                {totalProducts} Products
                                            </td>
                                            <td colSpan={2} className="p-3 text-right font-mono font-bold text-sm">
                                                ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td colSpan={2}></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
