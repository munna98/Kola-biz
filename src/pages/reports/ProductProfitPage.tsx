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
    IconTrendingUp,
    IconScale,
    IconCash,
    IconPercentage,
    IconFileInvoice,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ProductProfitRow {
    product_id: string;
    product_code: string;
    product_name: string;
    group_name: string | null;
    base_unit_symbol: string;
    qty_sold: number;
    total_revenue: number;
    total_cost: number;
    gross_profit: number;
    margin_percent: number;
    avg_selling_price: number;
    avg_cost_price: number;
    units_sold_text: string | null;
}

interface ProductProfitInvoiceRow {
    voucher_id: string;
    voucher_no: string;
    voucher_type: string;
    voucher_date: string;
    party_name: string;
    qty_sold: number;
    unit_symbol: string;
    rate: number;
    total_revenue: number;
    cost_rate: number;
    total_cost: number;
    gross_profit: number;
    margin_percent: number;
}

interface ProductGroup {
    id: number;
    name: string;
}

export default function ProductProfitPage() {
    const [reportData, setReportData] = useState<ProductProfitRow[]>([]);
    const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [showChart, setShowChart] = useState(true);

    const [fromDate, setFromDate] = useState(() => {
        const date = new Date();
        date.setMonth(0); // Start of year
        date.setDate(1);
        return date.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedGroup, setSelectedGroup] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<keyof ProductProfitRow>('gross_profit');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // Sub-row expansions
    const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
    const [invoiceBreakdown, setInvoiceBreakdown] = useState<Record<string, ProductProfitInvoiceRow[]>>({});
    const [invoicesLoading, setInvoicesLoading] = useState<Record<string, boolean>>({});

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
            setExpandedProducts({});
            setInvoiceBreakdown({});
            const groupParam = selectedGroup === 'all' ? null : selectedGroup;
            const result = await invoke<ProductProfitRow[]>('get_product_profit_report', {
                fromDate,
                toDate,
                groupId: groupParam,
            });
            setReportData(result);
        } catch (error) {
            toast.error('Failed to load product profit report');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const loadInvoices = async (productId: string) => {
        if (invoiceBreakdown[productId] || invoicesLoading[productId]) return;

        try {
            setInvoicesLoading(prev => ({ ...prev, [productId]: true }));
            const result = await invoke<ProductProfitInvoiceRow[]>('get_product_profit_invoices', {
                productId,
                fromDate,
                toDate,
            });
            setInvoiceBreakdown(prev => ({ ...prev, [productId]: result }));
        } catch (error) {
            toast.error('Failed to load invoice details');
            console.error(error);
        } finally {
            setInvoicesLoading(prev => ({ ...prev, [productId]: false }));
        }
    };

    const handleSort = (field: keyof ProductProfitRow) => {
        if (sortField === field) {
            setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const toggleProductExpand = (productId: string) => {
        setExpandedProducts(prev => {
            const isExpanding = !prev[productId];
            if (isExpanding) {
                loadInvoices(productId);
            }
            return { ...prev, [productId]: isExpanding };
        });
    };

    // Filters & Sorting in memory
    const filteredAndSortedData = reportData
        .filter(row => {
            const matchesSearch =
                row.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                row.product_code.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesSearch;
        })
        .sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];

            if (valA === null || valA === undefined) return sortDirection === 'asc' ? -1 : 1;
            if (valB === null || valB === undefined) return sortDirection === 'asc' ? 1 : -1;

            if (typeof valA === 'string' && typeof valB === 'string') {
                return sortDirection === 'asc'
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA);
            }

            return sortDirection === 'asc'
                ? (valA as number) - (valB as number)
                : (valB as number) - (valA as number);
        });

    // KPI Aggregates
    const totalRevenue = filteredAndSortedData.reduce((sum, r) => sum + r.total_revenue, 0);
    const totalCost = filteredAndSortedData.reduce((sum, r) => sum + r.total_cost, 0);
    const grossProfit = totalRevenue - totalCost;
    const overallMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // Chart Data (Top 10 by profit)
    const chartData = [...filteredAndSortedData]
        .sort((a, b) => b.gross_profit - a.gross_profit)
        .slice(0, 10)
        .map(row => ({
            name: row.product_name.length > 15 ? `${row.product_name.substring(0, 15)}...` : row.product_name,
            profit: row.gross_profit,
            revenue: row.total_revenue,
        }));

    const handlePrint = () => {
        window.print();
    };

    const handleExport = () => {
        try {
            let csvContent = 'data:text/csv;charset=utf-8,';
            csvContent += 'Product Code,Product Name,Group,Qty Sold,Units,Revenue,COGS,Gross Profit,Margin %,Avg Selling Price,Avg Cost Price\n';

            filteredAndSortedData.forEach(row => {
                const nameEscaped = `"${row.product_name.replace(/"/g, '""')}"`;
                const groupEscaped = row.group_name ? `"${row.group_name.replace(/"/g, '""')}"` : 'None';
                
                csvContent += `${row.product_code},${nameEscaped},${groupEscaped},${row.qty_sold},${row.base_unit_symbol},${row.total_revenue},${row.total_cost},${row.gross_profit},${row.margin_percent.toFixed(2)},${row.avg_selling_price.toFixed(2)},${row.avg_cost_price.toFixed(2)}\n`;
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `product_profit_report_${fromDate}_to_${toDate}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('Report exported to CSV');
        } catch (error) {
            toast.error('Failed to export report');
            console.error(error);
        }
    };

    // Helper to color margin badge
    const getMarginColor = (margin: number) => {
        if (margin > 25) return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200';
        if (margin > 10) return 'text-sky-600 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-400 border-sky-200';
        if (margin >= 0) return 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200';
        return 'text-rose-600 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200';
    };

    return (
        <div className="h-full flex flex-col bg-background overflow-hidden">
            {/* Header */}
            <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden flex-none">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">Product Profit Report</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Analyze revenue, cost of sales, and margins on a per-product basis
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowChart(!showChart)}>
                            {showChart ? 'Hide Chart' : 'Show Chart'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={loadReport}>
                            <IconRefresh size={16} className="mr-1.5" />
                            Refresh
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleExport}>
                            <IconDownload size={16} className="mr-1.5" />
                            Export CSV
                        </Button>
                        <Button variant="outline" size="sm" onClick={handlePrint}>
                            <IconPrinter size={16} className="mr-1.5" />
                            Print
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <div className="mt-4 flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[150px] max-w-xs">
                        <Label className="text-xs mb-1 block">From Date</Label>
                        <Input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="h-9"
                        />
                    </div>
                    <div className="flex-1 min-w-[150px] max-w-xs">
                        <Label className="text-xs mb-1 block">To Date</Label>
                        <Input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="h-9"
                        />
                    </div>
                    <div className="flex-1 min-w-[150px] max-w-xs">
                        <Label className="text-xs mb-1 block">Product Group</Label>
                        <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="All Groups" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Groups</SelectItem>
                                {productGroups.map(g => (
                                    <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex-2 min-w-[200px] max-w-sm relative">
                        <Label className="text-xs mb-1 block">Search</Label>
                        <div className="relative">
                            <IconSearch size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Search by name or code..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-9 pl-9 pr-8"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                                >
                                    &times;
                                </button>
                            )}
                        </div>
                    </div>
                    <Button onClick={loadReport} size="sm" className="h-9 px-4">
                        Generate
                    </Button>
                </div>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Print Header */}
                <div className="hidden print:block text-center mb-6">
                    <h1 className="text-2xl font-bold">Product Profit Report</h1>
                    <p className="text-sm text-muted-foreground">
                        For the period: {formatDate(fromDate)} to {formatDate(toDate)}
                    </p>
                </div>

                {/* KPI Overview Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="shadow-sm border-neutral-200/50">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-lg">
                                <IconCash size={22} />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Revenue</p>
                                <h3 className="text-lg font-bold font-mono mt-0.5">
                                    ₹{totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </h3>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-neutral-200/50">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-lg">
                                <IconScale size={22} />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total COGS</p>
                                <h3 className="text-lg font-bold font-mono mt-0.5">
                                    ₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </h3>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-neutral-200/50">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-lg">
                                <IconTrendingUp size={22} />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Gross Profit</p>
                                <h3 className="text-lg font-bold font-mono mt-0.5">
                                    ₹{grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </h3>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-neutral-200/50">
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="p-2 bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-lg">
                                <IconPercentage size={22} />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Avg Margin</p>
                                <h3 className="text-lg font-bold font-mono mt-0.5">
                                    {overallMargin.toFixed(2)}%
                                </h3>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Top Profit Chart */}
                {showChart && chartData.length > 0 && (
                    <Card className="shadow-sm border-neutral-200/50 print:hidden p-4">
                        <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">Top 10 Products by Gross Profit</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" fontSize={11} tickLine={false} />
                                    <YAxis fontSize={11} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        formatter={(val: any) => [`₹${(val || 0).toLocaleString('en-IN')}`, '']}
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                                    />
                                    <Bar dataKey="profit" fill="#10b981" radius={[4, 4, 0, 0]} name="Gross Profit" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                )}

                {/* Main Table */}
                <Card className="shadow-sm border-neutral-200/50 overflow-hidden">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <p className="text-sm text-muted-foreground">Generating report data...</p>
                        </div>
                    ) : filteredAndSortedData.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-muted-foreground">No product profit records found for the selected period.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto w-full">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider select-none">
                                        <th className="p-3 w-10"></th>
                                        <th className="p-3 cursor-pointer hover:bg-muted/60" onClick={() => handleSort('product_name')}>
                                            Product Details {sortField === 'product_name' && (sortDirection === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th className="p-3 text-right cursor-pointer hover:bg-muted/60" onClick={() => handleSort('qty_sold')}>
                                            Qty Sold {sortField === 'qty_sold' && (sortDirection === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th className="p-3 text-right cursor-pointer hover:bg-muted/60" onClick={() => handleSort('total_revenue')}>
                                            Sales Revenue {sortField === 'total_revenue' && (sortDirection === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th className="p-3 text-right cursor-pointer hover:bg-muted/60" onClick={() => handleSort('total_cost')}>
                                            COGS {sortField === 'total_cost' && (sortDirection === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th className="p-3 text-right cursor-pointer hover:bg-muted/60" onClick={() => handleSort('gross_profit')}>
                                            Gross Profit {sortField === 'gross_profit' && (sortDirection === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th className="p-3 text-center cursor-pointer hover:bg-muted/60" onClick={() => handleSort('margin_percent')}>
                                            Margin % {sortField === 'margin_percent' && (sortDirection === 'asc' ? '▲' : '▼')}
                                        </th>
                                        <th className="p-3 text-right hidden md:table-cell">Avg Rates (Sell / Cost)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y text-sm">
                                    {filteredAndSortedData.map(row => {
                                        const isExpanded = !!expandedProducts[row.product_id];
                                        return (
                                            <>
                                                {/* Product Row */}
                                                <tr key={row.product_id} className={`hover:bg-muted/20 transition-colors ${isExpanded ? 'bg-muted/10 font-medium' : ''}`}>
                                                    <td className="p-3 text-center">
                                                        <button
                                                            onClick={() => toggleProductExpand(row.product_id)}
                                                            className="p-1 hover:bg-muted rounded"
                                                        >
                                                            {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                                                        </button>
                                                    </td>
                                                    <td className="p-3">
                                                        <div>
                                                            <span className="font-semibold text-foreground">{row.product_name}</span>
                                                            <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                                                                <span>{row.product_code}</span>
                                                                {row.group_name && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span>{row.group_name}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-right font-mono">
                                                        <div className="font-semibold">{row.qty_sold} {row.base_unit_symbol}</div>
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-foreground">
                                                        ₹{row.total_revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-muted-foreground">
                                                        ₹{row.total_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className={`p-3 text-right font-mono font-semibold ${row.gross_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                        ₹{row.gross_profit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full border ${getMarginColor(row.margin_percent)}`}>
                                                            {row.margin_percent.toFixed(1)}%
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right text-xs font-mono text-muted-foreground hidden md:table-cell">
                                                        <div>S: ₹{row.avg_selling_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                                        <div className="mt-0.5">C: ₹{row.avg_cost_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                                    </td>
                                                </tr>

                                                {/* Invoice Breakdown Sub-table */}
                                                {isExpanded && (
                                                    <tr className="bg-muted/5">
                                                        <td colSpan={8} className="p-4 pl-12 border-t border-b">
                                                            <div className="border rounded-lg bg-card overflow-hidden">
                                                                <div className="bg-muted/30 px-4 py-2 border-b flex items-center justify-between">
                                                                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Invoice Movements Breakdown</span>
                                                                </div>
                                                                {invoicesLoading[row.product_id] ? (
                                                                    <div className="p-6 text-center text-xs text-muted-foreground flex justify-center items-center gap-2">
                                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                                                                        <span>Loading invoices...</span>
                                                                    </div>
                                                                ) : !invoiceBreakdown[row.product_id] || invoiceBreakdown[row.product_id].length === 0 ? (
                                                                    <div className="p-6 text-center text-xs text-muted-foreground">No invoices recorded.</div>
                                                                ) : (
                                                                    <table className="w-full text-xs">
                                                                        <thead>
                                                                            <tr className="bg-muted/20 border-b text-muted-foreground">
                                                                                <th className="p-2 text-left">Invoice No</th>
                                                                                <th className="p-2 text-left">Date</th>
                                                                                <th className="p-2 text-left">Customer / Ledger</th>
                                                                                <th className="p-2 text-right">Qty</th>
                                                                                <th className="p-2 text-right">Rate</th>
                                                                                <th className="p-2 text-right">Amount</th>
                                                                                <th className="p-2 text-right">Cost Rate</th>
                                                                                <th className="p-2 text-right">Cost Amt</th>
                                                                                <th className="p-2 text-right">Profit</th>
                                                                                <th className="p-2 text-center">Margin %</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y">
                                                                            {invoiceBreakdown[row.product_id].map(inv => (
                                                                                <tr key={inv.voucher_id} className="hover:bg-muted/10">
                                                                                    <td className="p-2 font-medium flex items-center gap-1">
                                                                                        <IconFileInvoice size={14} className="text-muted-foreground" />
                                                                                        {inv.voucher_no}
                                                                                        {inv.voucher_type === 'sales_return' && (
                                                                                            <span className="text-[9px] bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 px-1 rounded font-semibold ml-1">Return</span>
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="p-2 text-muted-foreground">{formatDate(inv.voucher_date)}</td>
                                                                                    <td className="p-2 text-foreground font-medium">{inv.party_name}</td>
                                                                                    <td className="p-2 text-right font-mono">{inv.qty_sold} {inv.unit_symbol}</td>
                                                                                    <td className="p-2 text-right font-mono">₹{inv.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                                    <td className="p-2 text-right font-mono font-semibold">₹{inv.total_revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                                    <td className="p-2 text-right font-mono text-muted-foreground">₹{inv.cost_rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                                    <td className="p-2 text-right font-mono text-muted-foreground">₹{inv.total_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                                    <td className={`p-2 text-right font-mono font-semibold ${inv.gross_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                                        ₹{inv.gross_profit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                                    </td>
                                                                                    <td className="p-2 text-center font-mono">
                                                                                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getMarginColor(inv.margin_percent)}`}>
                                                                                            {inv.margin_percent.toFixed(1)}%
                                                                                        </span>
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
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
