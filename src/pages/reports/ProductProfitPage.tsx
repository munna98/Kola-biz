import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { invoke } from '@tauri-apps/api/core';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { openPath } from '@tauri-apps/plugin-opener';
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
    IconShoppingCart,
    IconReceipt,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useMoney } from '@/hooks/useMoney';


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
    purchase_cost?: number;
    total_expense?: number;
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
    const [updatePaymentToProductCost, setUpdatePaymentToProductCost] = useState(false);

    const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedGroup, setSelectedGroup] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<keyof ProductProfitRow>('gross_profit');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    // Sub-row expansions
    const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
    const [invoiceBreakdown, setInvoiceBreakdown] = useState<Record<string, ProductProfitInvoiceRow[]>>({});
    const [invoicesLoading, setInvoicesLoading] = useState<Record<string, boolean>>({});
    const money = useMoney();
    const companyProfile = useSelector((state: RootState) => state.companyProfile.profile);
    const [isPrinting, setIsPrinting] = useState(false);

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
            const [result, settingVal] = await Promise.all([
                invoke<ProductProfitRow[]>('get_product_profit_report', {
                    fromDate,
                    toDate,
                    groupId: groupParam,
                }),
                invoke<string | null>('get_app_setting', { key: 'update_payment_to_product_cost' }).catch(() => null),
            ]);
            setUpdatePaymentToProductCost(settingVal === 'true' || settingVal === '"true"');
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
    const totalPurchaseCost = filteredAndSortedData.reduce((sum, r) => sum + (r.purchase_cost || 0), 0);
    const totalExpense = filteredAndSortedData.reduce((sum, r) => sum + (r.total_expense || 0), 0);
    const grossProfit = totalRevenue - totalCost;
    const overallMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    const handlePrint = async () => {
        if (filteredAndSortedData.length === 0) {
            toast.error('No product profit data to print');
            return;
        }

        try {
            setIsPrinting(true);
            const timestamp = new Date().toISOString().split('T')[0];
            const fileName = `ProductProfitReport_${fromDate}_to_${toDate}_${timestamp}.pdf`;
            const downloadsPath = await invoke<string>('get_downloads_path');
            const filePath = `${downloadsPath}/${fileName}`;

            const companyName = companyProfile?.company_name || 'Company';
            const currencySymbol = companyProfile?.base_currency_symbol || companyProfile?.base_currency || 'Rs.';

            const groupObj = selectedGroup !== 'all' ? productGroups.find(g => g.id.toString() === selectedGroup) : null;
            const groupLabel = groupObj ? groupObj.name : 'All Groups';

            const pdfData = {
                company_name: companyName,
                period_from: formatDate(fromDate),
                period_to: formatDate(toDate),
                group_label: groupLabel,
                search_query: searchQuery.trim() || null,
                currency_symbol: currencySymbol,
                total_revenue: totalRevenue,
                total_cost: totalCost,
                gross_profit: grossProfit,
                overall_margin: overallMargin,
                total_products: filteredAndSortedData.length,
                is_cost_update_enabled: updatePaymentToProductCost,
                total_purchase_cost: totalPurchaseCost,
                total_expense: totalExpense,
                items: filteredAndSortedData.map(r => ({
                    product_code: r.product_code || '',
                    product_name: r.product_name,
                    group_name: r.group_name || null,
                    qty_sold: r.qty_sold,
                    unit_symbol: r.base_unit_symbol || '',
                    total_revenue: r.total_revenue,
                    total_cost: r.total_cost,
                    gross_profit: r.gross_profit,
                    margin_percent: r.margin_percent,
                    avg_selling_price: r.avg_selling_price,
                    avg_cost_price: r.avg_cost_price,
                    purchase_cost: r.purchase_cost ?? 0,
                    total_expense: r.total_expense ?? 0,
                })),
            };

            await invoke('generate_product_profit_pdf', {
                data: pdfData,
                filePath,
            });

            try {
                await openPath(filePath);
                toast.success(`PDF generated and opened: ${fileName}`);
            } catch (openErr) {
                console.warn('Could not auto-open PDF:', openErr);
                toast.success(`PDF saved to: ${filePath}`, {
                    action: {
                        label: 'Open',
                        onClick: () => openPath(filePath).catch(console.error),
                    },
                });
            }
        } catch (error) {
            console.error('Failed to generate PDF:', error);
            toast.error('Failed to generate PDF');
        } finally {
            setIsPrinting(false);
        }
    };

    const handleExport = () => {
        try {
            const headers = updatePaymentToProductCost
                ? [
                    'Product Code',
                    'Product Name',
                    'Group',
                    'Qty Sold',
                    'Units',
                    'Purchase Cost',
                    'Expense',
                    'Total Cost',
                    'Revenue',
                    'Gross Profit',
                    'Margin %'
                ]
                : [
                    'Product Code',
                    'Product Name',
                    'Group',
                    'Qty Sold',
                    'Units',
                    'Revenue',
                    'COST',
                    'Gross Profit',
                    'Margin %',
                    'Avg Selling Price',
                    'Avg Cost Price'
                ];

            const data = filteredAndSortedData.map(row => updatePaymentToProductCost
                ? [
                    row.product_code || '',
                    row.product_name || '',
                    row.group_name || 'None',
                    row.qty_sold,
                    row.base_unit_symbol || '',
                    row.purchase_cost ?? 0,
                    row.total_expense ?? 0,
                    row.total_cost,
                    row.total_revenue,
                    row.gross_profit,
                    row.margin_percent
                ]
                : [
                    row.product_code || '',
                    row.product_name || '',
                    row.group_name || 'None',
                    row.qty_sold,
                    row.base_unit_symbol || '',
                    row.total_revenue,
                    row.total_cost,
                    row.gross_profit,
                    row.margin_percent,
                    row.avg_selling_price,
                    row.avg_cost_price
                ]
            );

            const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
            ws['!cols'] = [15, 25, 15, 12, 10, 15, 15, 15, 12, 18, 18].map(w => ({ wch: w }));

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Product Profit');

            XLSX.writeFile(wb, `product_profit_report_${fromDate}_to_${toDate}.xlsx`);
            toast.success('Report exported to Excel');
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

                        <Button variant="outline" size="sm" onClick={loadReport}>
                            <IconRefresh size={16} className="mr-1.5" />
                            Refresh
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExport}
                            disabled={filteredAndSortedData.length === 0}
                        >
                            <IconDownload size={16} className="mr-1.5" />
                            Export
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePrint}
                            disabled={loading || isPrinting || filteredAndSortedData.length === 0}
                        >
                            {isPrinting ? (
                                <IconRefresh size={16} className="mr-1.5 animate-spin" />
                            ) : (
                                <IconPrinter size={16} className="mr-1.5" />
                            )}
                            Print PDF
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
                <div className={`grid grid-cols-2 ${updatePaymentToProductCost ? 'lg:grid-cols-6' : 'lg:grid-cols-4'} gap-4`}>
                    {updatePaymentToProductCost ? (
                        <>
                            <Card className="shadow-sm border-neutral-200/50">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-muted text-muted-foreground rounded-lg">
                                        <IconShoppingCart size={22} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Purchase Cost</p>
                                        <h3 className="text-lg font-bold font-mono mt-0.5">
                                            {money(totalPurchaseCost)}
                                        </h3>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border-neutral-200/50">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-muted text-muted-foreground rounded-lg">
                                        <IconReceipt size={22} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Expense</p>
                                        <h3 className="text-lg font-bold font-mono mt-0.5">
                                            {money(totalExpense)}
                                        </h3>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border-neutral-200/50">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-muted text-muted-foreground rounded-lg">
                                        <IconScale size={22} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Cost</p>
                                        <h3 className="text-lg font-bold font-mono mt-0.5">
                                            {money(totalCost)}
                                        </h3>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border-neutral-200/50">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-muted text-muted-foreground rounded-lg">
                                        <IconCash size={22} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Revenue</p>
                                        <h3 className="text-lg font-bold font-mono mt-0.5">
                                            {money(totalRevenue)}
                                        </h3>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border-neutral-200/50">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-muted text-muted-foreground rounded-lg">
                                        <IconTrendingUp size={22} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Gross Profit</p>
                                        <h3 className="text-lg font-bold font-mono mt-0.5">
                                            {money(grossProfit)}
                                        </h3>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border-neutral-200/50">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-muted text-muted-foreground rounded-lg">
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
                        </>
                    ) : (
                        <>
                            <Card className="shadow-sm border-neutral-200/50">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-muted text-muted-foreground rounded-lg">
                                        <IconCash size={22} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Revenue</p>
                                        <h3 className="text-lg font-bold font-mono mt-0.5">
                                            {money(totalRevenue)}
                                        </h3>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border-neutral-200/50">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-muted text-muted-foreground rounded-lg">
                                        <IconScale size={22} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total COST</p>
                                        <h3 className="text-lg font-bold font-mono mt-0.5">
                                            {money(totalCost)}
                                        </h3>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border-neutral-200/50">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-muted text-muted-foreground rounded-lg">
                                        <IconTrendingUp size={22} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Gross Profit</p>
                                        <h3 className="text-lg font-bold font-mono mt-0.5">
                                            {money(grossProfit)}
                                        </h3>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border-neutral-200/50">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-muted text-muted-foreground rounded-lg">
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
                        </>
                    )}
                </div>



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
                                        {updatePaymentToProductCost ? (
                                            <>
                                                <th className="p-3 text-right cursor-pointer hover:bg-muted/60" onClick={() => handleSort('purchase_cost')}>
                                                    Cost {sortField === 'purchase_cost' && (sortDirection === 'asc' ? '▲' : '▼')}
                                                </th>
                                                <th className="p-3 text-right cursor-pointer hover:bg-muted/60" onClick={() => handleSort('total_expense')}>
                                                    Expense {sortField === 'total_expense' && (sortDirection === 'asc' ? '▲' : '▼')}
                                                </th>
                                                <th className="p-3 text-right cursor-pointer hover:bg-muted/60" onClick={() => handleSort('total_cost')}>
                                                    Total Cost {sortField === 'total_cost' && (sortDirection === 'asc' ? '▲' : '▼')}
                                                </th>
                                                <th className="p-3 text-right cursor-pointer hover:bg-muted/60" onClick={() => handleSort('total_revenue')}>
                                                    Revenue {sortField === 'total_revenue' && (sortDirection === 'asc' ? '▲' : '▼')}
                                                </th>
                                                <th className="p-3 text-right cursor-pointer hover:bg-muted/60" onClick={() => handleSort('gross_profit')}>
                                                    Profit {sortField === 'gross_profit' && (sortDirection === 'asc' ? '▲' : '▼')}
                                                </th>
                                                <th className="p-3 text-center cursor-pointer hover:bg-muted/60" onClick={() => handleSort('margin_percent')}>
                                                    Margin % {sortField === 'margin_percent' && (sortDirection === 'asc' ? '▲' : '▼')}
                                                </th>
                                            </>
                                        ) : (
                                            <>
                                                <th className="p-3 text-right cursor-pointer hover:bg-muted/60" onClick={() => handleSort('total_revenue')}>
                                                    Sales Revenue {sortField === 'total_revenue' && (sortDirection === 'asc' ? '▲' : '▼')}
                                                </th>
                                                <th className="p-3 text-right cursor-pointer hover:bg-muted/60" onClick={() => handleSort('total_cost')}>
                                                    COST {sortField === 'total_cost' && (sortDirection === 'asc' ? '▲' : '▼')}
                                                </th>
                                                <th className="p-3 text-right cursor-pointer hover:bg-muted/60" onClick={() => handleSort('gross_profit')}>
                                                    Gross Profit {sortField === 'gross_profit' && (sortDirection === 'asc' ? '▲' : '▼')}
                                                </th>
                                                <th className="p-3 text-center cursor-pointer hover:bg-muted/60" onClick={() => handleSort('margin_percent')}>
                                                    Margin % {sortField === 'margin_percent' && (sortDirection === 'asc' ? '▲' : '▼')}
                                                </th>
                                                <th className="p-3 text-right hidden md:table-cell">Avg Rates (Sell / Cost)</th>
                                            </>
                                        )}
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
                                                    {updatePaymentToProductCost ? (
                                                        <>
                                                            <td className="p-3 text-right font-mono text-muted-foreground">
                                                                {money(row.purchase_cost || 0)}
                                                            </td>
                                                            <td className="p-3 text-right font-mono text-muted-foreground">
                                                                {money(row.total_expense || 0)}
                                                            </td>
                                                            <td className="p-3 text-right font-mono text-foreground font-semibold">
                                                                {money(row.total_cost)}
                                                            </td>
                                                            <td className="p-3 text-right font-mono text-foreground">
                                                                {money(row.total_revenue)}
                                                            </td>
                                                            <td className={`p-3 text-right font-mono font-semibold ${row.gross_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                                {money(row.gross_profit)}
                                                            </td>
                                                            <td className="p-3 text-center">
                                                                <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full border ${getMarginColor(row.margin_percent)}`}>
                                                                    {row.margin_percent.toFixed(1)}%
                                                                </span>
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="p-3 text-right font-mono text-foreground">
                                                                {money(row.total_revenue)}
                                                            </td>
                                                            <td className="p-3 text-right font-mono text-muted-foreground">
                                                                {money(row.total_cost)}
                                                            </td>
                                                            <td className={`p-3 text-right font-mono font-semibold ${row.gross_profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                                {money(row.gross_profit)}
                                                            </td>
                                                            <td className="p-3 text-center">
                                                                <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full border ${getMarginColor(row.margin_percent)}`}>
                                                                    {row.margin_percent.toFixed(1)}%
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-right text-xs font-mono text-muted-foreground hidden md:table-cell">
                                                                <div>S: {money(row.avg_selling_price)}</div>
                                                                <div className="mt-0.5">C: {money(row.avg_cost_price)}</div>
                                                            </td>
                                                        </>
                                                    )}
                                                </tr>

                                                {/* Invoice Breakdown Sub-table */}
                                                {isExpanded && (
                                                    <tr className="bg-muted/5">
                                                        <td colSpan={updatePaymentToProductCost ? 9 : 8} className="p-4 pl-12 border-t border-b">
                                                            <div className="border rounded-lg bg-card overflow-hidden">
                                                                <div className="bg-muted/30 px-4 py-2 border-b flex items-center justify-between">
                                                                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Invoice Movements Breakdown</span>
                                                                    {updatePaymentToProductCost && (
                                                                        <span className="text-xs text-muted-foreground font-mono">
                                                                            Base Cost: <span className="font-semibold text-foreground">{money(row.purchase_cost || 0)}</span> | Expense: <span className="font-semibold text-foreground">{money(row.total_expense || 0)}</span> | Total Cost: <span className="font-semibold text-foreground">{money(row.total_cost)}</span>
                                                                        </span>
                                                                    )}
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
                                                                                    <td className="p-2 text-right font-mono">{money(inv.rate)}</td>
                                                                                    <td className="p-2 text-right font-mono font-semibold">{money(inv.total_revenue)}</td>
                                                                                    <td className="p-2 text-right font-mono text-muted-foreground">{money(inv.cost_rate)}</td>
                                                                                    <td className="p-2 text-right font-mono text-muted-foreground">{money(inv.total_cost)}</td>
                                                                                    <td className={`p-2 text-right font-mono font-semibold ${inv.gross_profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                                                        {money(inv.gross_profit)}
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
