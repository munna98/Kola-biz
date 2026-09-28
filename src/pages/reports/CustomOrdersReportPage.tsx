import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  IconDownload,
  IconPrinter,
  IconRefresh,
  IconFilter,
  IconX,
  IconSearch,
  IconEye,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useMoney } from '@/hooks/useMoney';
import { useDispatch } from 'react-redux';
import { setActiveSectionWithParams } from '@/store';

interface CustomOrderMarginRow {
  id: string;
  order_no: string;
  order_date: string;
  delivery_date: string | null;
  customer_id: string;
  customer_name: string;
  status: string;
  finished_item_name: string;
  finished_item_qty: number;
  finished_item_unit: string | null;
  sale_price: number;
  total_material_cost: number;
  total_purchase_cost: number;
  total_service_cost: number;
  total_job_cost: number;
  margin_amount: number;
  margin_percentage: number;
  advance_amount: number;
  payment_status: string;
  total_paid: number;
  balance_due: number;
  final_invoice_id: string | null;
  final_invoice_no: string | null;
}

interface Party {
  id: string;
  party_name: string;
  party_type: string;
}

interface CustomOrderDetail {
  order: any;
  materials: Array<{
    id: string;
    product_name: string;
    product_code: string;
    description: string | null;
    quantity: number;
    unit_name: string | null;
    rate: number;
    amount: number;
  }>;
  purchases: Array<{
    id: string;
    description: string;
    supplier_name: string | null;
    quantity: number;
    rate: number;
    amount: number;
  }>;
  services: Array<{
    id: string;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
}

export default function CustomOrdersReportPage() {
  const dispatch = useDispatch();
  const money = useMoney();

  const [rows, setRows] = useState<CustomOrderMarginRow[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<string>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');

  // Breakdown Dialog
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<CustomOrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    loadCustomers();
    loadReport();
  }, []);

  const loadCustomers = async () => {
    try {
      const all = await invoke<Party[]>('get_all_parties');
      setParties(all.filter((p) => p.party_type === 'customer'));
    } catch (err) {
      console.error('Failed to load customers', err);
    }
  };

  const loadReport = async () => {
    try {
      setLoading(true);
      const res = await invoke<CustomOrderMarginRow[]>('get_custom_orders_margin_report', {
        fromDate: fromDate || null,
        toDate: toDate || null,
        status: status === 'all' ? null : status,
        customerId: selectedCustomer || null,
      });
      setRows(res);
    } catch (err) {
      toast.error('Failed to load CO Report');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setStatus('all');
    setSelectedCustomer('');
    setSearchQuery('');
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    setFromDate(d.toISOString().split('T')[0]);
    setToDate(new Date().toISOString().split('T')[0]);
  };

  const handleViewBreakdown = async (orderId: string) => {
    try {
      setLoadingDetail(true);
      setDetailModalOpen(true);
      const detail = await invoke<CustomOrderDetail>('get_custom_order', { id: orderId });
      setSelectedOrderDetail(detail);
    } catch (err) {
      toast.error('Failed to load order cost breakdown');
      console.error(err);
      setDetailModalOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleOrderClick = (orderId: string) => {
    dispatch(
      setActiveSectionWithParams({
        section: 'custom_orders',
        params: { orderId },
      })
    );
  };

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(
      (r) =>
        r.order_no.toLowerCase().includes(q) ||
        r.customer_name.toLowerCase().includes(q) ||
        r.finished_item_name.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  // Summary Metrics
  const summary = useMemo(() => {
    const totalOrders = filteredRows.length;
    const totalRevenue = filteredRows.reduce((sum, r) => sum + r.sale_price, 0);
    const totalMaterialCost = filteredRows.reduce((sum, r) => sum + r.total_material_cost, 0);
    const totalPurchaseCost = filteredRows.reduce((sum, r) => sum + r.total_purchase_cost, 0);
    const totalServiceCost = filteredRows.reduce((sum, r) => sum + r.total_service_cost, 0);
    const totalCost = filteredRows.reduce((sum, r) => sum + r.total_job_cost, 0);
    const totalMargin = totalRevenue - totalCost;
    const avgMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

    return {
      totalOrders,
      totalRevenue,
      totalMaterialCost,
      totalPurchaseCost,
      totalServiceCost,
      totalCost,
      totalMargin,
      avgMarginPct,
    };
  }, [filteredRows]);

  const handleExport = () => {
    if (filteredRows.length === 0) {
      toast.error('No data to export');
      return;
    }

    try {
      const data = filteredRows.map((r) => ({
        'Order No': r.order_no,
        'Order Date': formatDate(r.order_date),
        'Delivery Date': r.delivery_date ? formatDate(r.delivery_date) : '-',
        Customer: r.customer_name,
        Item: r.finished_item_name,
        Qty: `${r.finished_item_qty} ${r.finished_item_unit || ''}`.trim(),
        'Sale Price': r.sale_price,
        'Material Cost': r.total_material_cost,
        'Purchase Cost': r.total_purchase_cost,
        'Service Cost': r.total_service_cost,
        'Total Cost': r.total_job_cost,
        Margin: `${r.margin_amount} (${r.margin_percentage.toFixed(2)}%)`,
        Status: r.status.toUpperCase(),
        'Payment Status': r.payment_status.toUpperCase(),
        'Total Paid': r.total_paid,
        'Balance Due': r.balance_due,
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = [
        { wch: 14 },
        { wch: 12 },
        { wch: 12 },
        { wch: 24 },
        { wch: 22 },
        { wch: 12 },
        { wch: 18 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 12 },
        { wch: 14 },
        { wch: 16 },
        { wch: 14 },
        { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'CO Margin Report');
      XLSX.writeFile(wb, `CO_Reports_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('Report exported to Excel successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to export report');
    }
  };

  const handlePrint = () => window.print();

  const getStatusBadge = (st: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      pending: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
      in_progress: { label: 'In Progress', cls: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
      completed: { label: 'Completed', cls: 'bg-purple-500/10 text-purple-600 border-purple-500/30' },
      delivered: { label: 'Delivered', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
      cancelled: { label: 'Cancelled', cls: 'bg-rose-500/10 text-rose-600 border-rose-500/30' },
    };
    const item = map[st] || { label: st, cls: 'bg-muted text-muted-foreground' };
    return (
      <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${item.cls}`}>
        {item.label}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">CO Reports</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Detailed cost analysis, revenue, and gross profit margin for custom orders
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadReport}>
              <IconRefresh size={16} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <IconDownload size={16} />
              Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <IconPrinter size={16} />
              Print
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 space-y-3">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="w-36">
              <Label className="text-xs mb-1 block">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-36">
              <Label className="text-xs mb-1 block">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-40">
              <Label className="text-xs mb-1 block">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-56">
              <Label className="text-xs mb-1 block">Customer</Label>
              <Combobox
                options={[
                  { value: '', label: 'All Customers' },
                  ...parties.map((p) => ({ value: p.id, label: p.party_name })),
                ]}
                value={selectedCustomer}
                onChange={(val) => setSelectedCustomer(val as string)}
                placeholder="Select customer..."
                searchPlaceholder="Search customer..."
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs mb-1 block">Search</Label>
              <div className="relative">
                <IconSearch size={16} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Order No, customer, finished item..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <Button onClick={loadReport} size="sm">
              <IconFilter size={16} />
              Apply
            </Button>
            <Button onClick={handleClearFilters} variant="outline" size="sm">
              <IconX size={16} />
              Clear
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">CO Reports - Custom Orders Margin & Cost Analysis</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Period: {formatDate(fromDate)} to {formatDate(toDate)}
            </p>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium">Total Orders</p>
                <p className="text-xl font-bold mt-1">{summary.totalOrders}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium">Total Revenue</p>
                <p className="text-xl font-bold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
                  {money(summary.totalRevenue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium">Total Cost</p>
                <p className="text-xl font-bold font-mono mt-1 text-rose-600 dark:text-rose-400">
                  {money(summary.totalCost)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium">Total Margin</p>
                <p
                  className={`text-xl font-bold font-mono mt-1 ${
                    summary.totalMargin >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {money(summary.totalMargin)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Table */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading CO Report...</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-3 text-left font-semibold">Order No</th>
                        <th className="p-3 text-left font-semibold">Date</th>
                        <th className="p-3 text-left font-semibold">Customer</th>
                        <th className="p-3 text-left font-semibold">Finished Item</th>
                        <th className="p-3 text-right font-semibold">Sale Price</th>
                        <th className="p-3 text-right font-semibold">Material Cost</th>
                        <th className="p-3 text-right font-semibold">Purchase Cost</th>
                        <th className="p-3 text-right font-semibold">Service Cost</th>
                        <th className="p-3 text-right font-semibold">Total Cost</th>
                        <th className="p-3 text-right font-semibold">Margin</th>
                        <th className="p-3 text-center font-semibold">Status</th>
                        <th className="p-3 text-center print:hidden font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="p-8 text-center text-muted-foreground text-sm">
                            No custom orders match the criteria
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((r) => {
                          const isProfitable = r.margin_amount >= 0;
                          return (
                            <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="p-3 font-mono font-medium">
                                <button
                                  type="button"
                                  onClick={() => handleOrderClick(r.id)}
                                  className="text-primary hover:underline font-mono text-left cursor-pointer"
                                >
                                  {r.order_no}
                                </button>
                              </td>
                              <td className="p-3">{formatDate(r.order_date)}</td>
                              <td className="p-3 font-medium">{r.customer_name}</td>
                              <td className="p-3">
                                {r.finished_item_name}{' '}
                                <span className="text-muted-foreground">
                                  ({r.finished_item_qty} {r.finished_item_unit || ''})
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono font-medium">{money(r.sale_price)}</td>
                              <td className="p-3 text-right font-mono text-muted-foreground">
                                {money(r.total_material_cost)}
                              </td>
                              <td className="p-3 text-right font-mono text-muted-foreground">
                                {money(r.total_purchase_cost)}
                              </td>
                              <td className="p-3 text-right font-mono text-muted-foreground">
                                {money(r.total_service_cost)}
                              </td>
                              <td className="p-3 text-right font-mono font-semibold">{money(r.total_job_cost)}</td>
                              <td
                                className={`p-3 text-right font-mono font-bold ${
                                  isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {money(r.margin_amount)}
                              </td>
                              <td className="p-3 text-center">{getStatusBadge(r.status)}</td>
                              <td className="p-3 text-center print:hidden">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewBreakdown(r.id)}
                                  title="View Cost Breakdown"
                                  className="h-7 w-7 p-0"
                                >
                                  <IconEye size={15} />
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {filteredRows.length > 0 && (
                      <tfoot className="bg-muted/40 border-t-2 border-foreground/20 font-bold">
                        <tr>
                          <td colSpan={4} className="p-3 text-sm">TOTALS</td>
                          <td className="p-3 text-right font-mono text-sm text-emerald-600 dark:text-emerald-400">
                            {money(summary.totalRevenue)}
                          </td>
                          <td className="p-3 text-right font-mono text-xs text-muted-foreground">
                            {money(summary.totalMaterialCost)}
                          </td>
                          <td className="p-3 text-right font-mono text-xs text-muted-foreground">
                            {money(summary.totalPurchaseCost)}
                          </td>
                          <td className="p-3 text-right font-mono text-xs text-muted-foreground">
                            {money(summary.totalServiceCost)}
                          </td>
                          <td className="p-3 text-right font-mono text-sm text-rose-600 dark:text-rose-400">
                            {money(summary.totalCost)}
                          </td>
                          <td
                            className={`p-3 text-right font-mono text-sm ${
                              summary.totalMargin >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {money(summary.totalMargin)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Cost Breakdown Dialog */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Cost Breakdown — {selectedOrderDetail?.order?.order_no || 'Custom Order'}
            </DialogTitle>
          </DialogHeader>

          {loadingDetail ? (
            <div className="p-8 text-center text-muted-foreground">Loading cost breakdown...</div>
          ) : selectedOrderDetail ? (
            <div className="space-y-6 text-xs">
              {/* Overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/40 p-3 rounded-lg">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Customer</span>
                  <span className="font-semibold">{selectedOrderDetail.order.customer_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Finished Item</span>
                  <span className="font-semibold">
                    {selectedOrderDetail.order.finished_item_name} ({selectedOrderDetail.order.finished_item_qty})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Sale Price</span>
                  <span className="font-semibold font-mono text-emerald-600">
                    {money(selectedOrderDetail.order.sale_price)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Total Cost</span>
                  <span className="font-semibold font-mono text-rose-600">
                    {money(selectedOrderDetail.order.total_job_cost)}
                  </span>
                </div>
              </div>

              {/* Material Costs */}
              <div>
                <h4 className="font-bold text-sm mb-2 text-foreground flex items-center justify-between">
                  <span>1. Materials Used</span>
                  <span className="font-mono text-xs">
                    Subtotal: {money(selectedOrderDetail.order.total_material_cost)}
                  </span>
                </h4>
                {selectedOrderDetail.materials.length === 0 ? (
                  <p className="text-muted-foreground italic">No materials added</p>
                ) : (
                  <table className="w-full border rounded">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-left">Product</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2 text-right">Rate</th>
                        <th className="p-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderDetail.materials.map((m) => (
                        <tr key={m.id} className="border-t">
                          <td className="p-2">{m.product_name}</td>
                          <td className="p-2 text-right font-mono">
                            {m.quantity} {m.unit_name || ''}
                          </td>
                          <td className="p-2 text-right font-mono">{money(m.rate)}</td>
                          <td className="p-2 text-right font-mono font-medium">{money(m.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Purchases */}
              <div>
                <h4 className="font-bold text-sm mb-2 text-foreground flex items-center justify-between">
                  <span>2. Purchases & Procurement</span>
                  <span className="font-mono text-xs">
                    Subtotal: {money(selectedOrderDetail.order.total_purchase_cost)}
                  </span>
                </h4>
                {selectedOrderDetail.purchases.length === 0 ? (
                  <p className="text-muted-foreground italic">No purchases added</p>
                ) : (
                  <table className="w-full border rounded">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-left">Description</th>
                        <th className="p-2 text-left">Supplier</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2 text-right">Rate</th>
                        <th className="p-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderDetail.purchases.map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="p-2">{p.description}</td>
                          <td className="p-2 text-muted-foreground">{p.supplier_name || '-'}</td>
                          <td className="p-2 text-right font-mono">{p.quantity}</td>
                          <td className="p-2 text-right font-mono">{money(p.rate)}</td>
                          <td className="p-2 text-right font-mono font-medium">{money(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Services */}
              <div>
                <h4 className="font-bold text-sm mb-2 text-foreground flex items-center justify-between">
                  <span>3. Services & Labor Charges</span>
                  <span className="font-mono text-xs">
                    Subtotal: {money(selectedOrderDetail.order.total_service_cost)}
                  </span>
                </h4>
                {selectedOrderDetail.services.length === 0 ? (
                  <p className="text-muted-foreground italic">No services added</p>
                ) : (
                  <table className="w-full border rounded">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-2 text-left">Service / Job</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2 text-right">Rate</th>
                        <th className="p-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderDetail.services.map((s) => (
                        <tr key={s.id} className="border-t">
                          <td className="p-2">{s.description}</td>
                          <td className="p-2 text-right font-mono">{s.quantity}</td>
                          <td className="p-2 text-right font-mono">{money(s.rate)}</td>
                          <td className="p-2 text-right font-mono font-medium">{money(s.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
