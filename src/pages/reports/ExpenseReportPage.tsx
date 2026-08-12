import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { buildProductComboboxOption, getProductComboboxHeaderColumns, getProductComboboxWidthClass, type ProductComboboxDisplaySettings, DEFAULT_COMBOBOX_DISPLAY_SETTINGS, type ProductComboboxColumnWidths, DEFAULT_COMBOBOX_COLUMN_WIDTHS } from '@/lib/combobox-helpers';
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
  IconFilter,
  IconX,
  IconChevronDown,
  IconChevronRight,
  IconReceipt,
  IconCalendar,
  IconPackage,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { api } from '@/lib/tauri';
import type { Product } from '@/lib/tauri';
import { useMoney } from '@/hooks/useMoney';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExpenseReportRow {
  group_key: string;
  group_label: string;
  voucher_count: number;
  total_amount: number;
}

interface ExpenseDetail {
  voucher_no: string;
  voucher_date: string;
  account_name: string;
  product_name: string | null;
  amount: number;
  narration: string | null;
}

interface LedgerAccount {
  id: number;
  account_name: string;
  account_type: string;
}

type GroupBy = 'day' | 'account' | 'group' | 'product';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMonthStart() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExpenseReportPage() {
  const fmt = useMoney();

  // Settings
  const [productCostEnabled, setProductCostEnabled] = useState(false);

  // Filters
  const [fromDate, setFromDate] = useState(getMonthStart);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');

  // Data
  const [rows, setRows] = useState<ExpenseReportRow[]>([]);
  const [entryDetails, setEntryDetails] = useState<ExpenseDetail[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [expandedDetails, setExpandedDetails] = useState<Record<string, ExpenseDetail[]>>({});
  const [expandLoading, setExpandLoading] = useState<Record<string, boolean>>({});

  const [products, setProducts] = useState<Product[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<LedgerAccount[]>([]);
  const [comboboxDisplaySettings, setComboboxDisplaySettings] = useState<ProductComboboxDisplaySettings>(DEFAULT_COMBOBOX_DISPLAY_SETTINGS);
  const [columnWidths, setColumnWidths] = useState<ProductComboboxColumnWidths>(DEFAULT_COMBOBOX_COLUMN_WIDTHS);
  const [groups, setGroups] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      try {
        const [settingVal, accounts, cbSet, colW, grps, brnds] = await Promise.all([
          invoke<string | null>('get_app_setting', { key: 'update_payment_to_product_cost' }).catch(() => null),
          invoke<LedgerAccount[]>('get_chart_of_accounts').catch(() => []),
          invoke<string | null>('get_app_setting', { key: 'product_combobox_display_settings' }).catch(() => null),
          invoke<string | null>('get_app_setting', { key: 'product_combobox_column_widths' }).catch(() => null),
          invoke<any[]>('get_product_groups').catch(() => []),
          invoke<any[]>('get_product_brands').catch(() => []),
        ]);

        if (cbSet) {
          try { setComboboxDisplaySettings(JSON.parse(cbSet)); } catch {}
        }
        if (colW) {
          try { setColumnWidths(JSON.parse(colW)); } catch {}
        }
        setGroups(grps);
        setBrands(brnds);

        const isEnabled = settingVal === 'true' || settingVal === '"true"';
        setProductCostEnabled(isEnabled);

        // Only expense-type accounts as filter options
        setExpenseAccounts(accounts.filter(a => a.account_type === 'Expense'));

        if (isEnabled) {
          const productList = await api.products.list().catch(() => []);
          setProducts(productList.filter(p => p.is_active === 1));
          setGroupBy('product'); // default to product when setting is on
        }
      } catch (err) {
        console.error('Expense report init error:', err);
      }
    };
    init();
  }, []);

  // ── Load grouped summary ────────────────────────────────────────────────

  const loadReport = useCallback(async () => {
    setRows([]);
    setEntryDetails([]);
    setExpandedKeys({});
    setExpandedDetails({});
    try {
      const result = await invoke<ExpenseReportRow[]>('get_expense_report', {
        fromDate,
        toDate,
        groupBy,
        productId: selectedProductId || null,
        accountId: selectedAccountId || null,
      });
      setRows(result);
    } catch (err) {
      toast.error('Failed to load expense report');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, groupBy, selectedProductId, selectedAccountId]);

  // ── Load flat entry list for a specific product ─────────────────────────

  const loadProductEntries = useCallback(async (productId: string) => {
    if (!productId) return;
    setDetailLoading(true);
    setEntryDetails([]);
    try {
      const result = await invoke<ExpenseDetail[]>('get_expense_report_details', {
        fromDate,
        toDate,
        productId,
        accountId: selectedAccountId || null,
        groupBy: null,
        groupValue: null,
      });
      setEntryDetails(result);
    } catch (err) {
      toast.error('Failed to load expense entries');
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  }, [fromDate, toDate, selectedAccountId]);

  // Re-load product entries when product selection changes
  useEffect(() => {
    if (selectedProductId && productCostEnabled) {
      loadProductEntries(selectedProductId);
    }
  }, [selectedProductId, loadProductEntries, productCostEnabled]);

  // ── Expand a group row ─────────────────────────────────────────────────

  const toggleExpand = async (groupKey: string) => {
    const isExpanding = !expandedKeys[groupKey];
    setExpandedKeys(prev => ({ ...prev, [groupKey]: isExpanding }));

    if (isExpanding && !expandedDetails[groupKey]) {
      setExpandLoading(prev => ({ ...prev, [groupKey]: true }));
      try {
        const result = await invoke<ExpenseDetail[]>('get_expense_report_details', {
          fromDate,
          toDate,
          productId: selectedProductId || null,
          accountId: selectedAccountId || null,
          groupBy,
          groupValue: groupKey,
        });
        setExpandedDetails(prev => ({ ...prev, [groupKey]: result }));
      } catch (err) {
        toast.error('Failed to load details');
        console.error(err);
      } finally {
        setExpandLoading(prev => ({ ...prev, [groupKey]: false }));
      }
    }
  };

  // ── Filters ────────────────────────────────────────────────────────────

  const handleApply = () => {
    if (selectedProductId && productCostEnabled) {
      loadProductEntries(selectedProductId);
    } else {
      loadReport();
    }
  };

  const handleClear = () => {
    const d = new Date();
    d.setDate(1);
    setFromDate(d.toISOString().split('T')[0]);
    setToDate(new Date().toISOString().split('T')[0]);
    setSelectedProductId('');
    setSelectedAccountId('');
    setGroupBy(productCostEnabled ? 'product' : 'day');
    setRows([]);
    setEntryDetails([]);
    setExpandedKeys({});
    setExpandedDetails({});
  };

  // ── Aggregates ─────────────────────────────────────────────────────────

  const totalExpenses = rows.reduce((s, r) => s + r.total_amount, 0);
  const totalVouchers = rows.reduce((s, r) => s + r.voucher_count, 0);
  const entryTotal = entryDetails.reduce((s, d) => s + d.amount, 0);

  const isProductEntryMode = !!(selectedProductId && productCostEnabled);
  const selectedProduct = products.find(p => p.id === selectedProductId);

  const handlePrint = () => window.print();
  const handleExport = () => toast.info('Export functionality coming soon');

  // ── Group label helper ─────────────────────────────────────────────────

  const formatGroupLabel = (row: ExpenseReportRow) => {
    if (groupBy === 'day') return formatDate(row.group_label);
    return row.group_label;
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* ── Header ── */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden flex-none">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Expense Report</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track and analyze payment expenses by day, account, or product
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={isProductEntryMode ? () => loadProductEntries(selectedProductId) : loadReport}>
              <IconRefresh size={16} className="mr-1.5" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <IconDownload size={16} className="mr-1.5" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <IconPrinter size={16} className="mr-1.5" />
              Print
            </Button>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="mt-4 flex flex-wrap gap-3 items-end">
          {/* From Date */}
          {!isProductEntryMode && (
            <div className="min-w-[140px]">
              <Label className="text-xs mb-1 block">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="h-9"
              />
            </div>
          )}

          {/* To Date */}
          {!isProductEntryMode && (
            <div className="min-w-[140px]">
              <Label className="text-xs mb-1 block">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="h-9"
              />
            </div>
          )}

          {/* Group By — hidden in product entry mode */}
          {!isProductEntryMode && (
            <div className="min-w-[150px]">
              <Label className="text-xs mb-1 block">Group By</Label>
              <Select value={groupBy} onValueChange={v => {
                setGroupBy(v as GroupBy);
                setRows([]);
                setExpandedKeys({});
                setExpandedDetails({});
              }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="account">Account</SelectItem>
                  <SelectItem value="group">Account Group</SelectItem>
                  {productCostEnabled && <SelectItem value="product">Product</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Account filter */}
          <div className="min-w-[180px] max-w-xs">
            <Label className="text-xs mb-1 block">Expense Account</Label>
            <Combobox
              options={[
                { value: '', label: 'All Accounts' },
                ...expenseAccounts.map(a => ({ value: String(a.id), label: a.account_name })),
              ]}
              value={selectedAccountId}
              onChange={val => setSelectedAccountId(val as string)}
              placeholder="All Accounts"
              searchPlaceholder="Search accounts..."
            />
          </div>

          {/* Product filter — only when setting is on */}
          {productCostEnabled && (
            <div className="min-w-[200px] max-w-sm">
              <Label className="text-xs mb-1 block">
                Product
                <span className="ml-1.5 text-[10px] text-primary font-medium">(selecting shows entries)</span>
              </Label>
              <Combobox
                headerColumns={getProductComboboxHeaderColumns(comboboxDisplaySettings, columnWidths)}
                popoverClassName={getProductComboboxWidthClass(comboboxDisplaySettings, columnWidths)}
                options={[
                  { value: '', label: 'All Products' },
                  ...products.map(p => buildProductComboboxOption({
                    product: p,
                    groups,
                    brands,
                    displaySettings: comboboxDisplaySettings,
                  })),
                ]}
                value={selectedProductId}
                onChange={val => setSelectedProductId(val as string)}
                placeholder="Select product..."
                searchPlaceholder="Search products..."
              />
            </div>
          )}

          <Button onClick={handleApply} size="sm" className="h-9">
            <IconFilter size={16} className="mr-1.5" />
            Apply
          </Button>
          <Button onClick={handleClear} variant="outline" size="sm" className="h-9">
            <IconX size={16} className="mr-1.5" />
            Clear
          </Button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* Print header */}
        <div className="hidden print:block text-center mb-6">
          <h1 className="text-2xl font-bold">Expense Report</h1>
          {isProductEntryMode && selectedProduct ? (
            <p className="text-sm text-muted-foreground mt-1">
              All entries for Product: <strong>{selectedProduct.code} - {selectedProduct.name}</strong>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Period: {formatDate(fromDate)} to {formatDate(toDate)}
            </p>
          )}
        </div>

        {/* ── Summary Cards (grouped mode) ── */}
        {!isProductEntryMode && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg">
                  <IconReceipt size={20} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Expenses</p>
                  <p className="text-xl font-bold font-mono mt-0.5 text-rose-600 dark:text-rose-400">
                    {fmt(totalExpenses)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-muted text-muted-foreground rounded-lg">
                  <IconCalendar size={20} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Payments</p>
                  <p className="text-xl font-bold font-mono mt-0.5">{totalVouchers}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-muted text-muted-foreground rounded-lg">
                  <IconPackage size={20} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    {groupBy === 'day' ? 'Days with Expenses' : groupBy === 'group' ? 'Account Groups' : groupBy === 'product' ? 'Products' : 'Accounts'}
                  </p>
                  <p className="text-xl font-bold font-mono mt-0.5">{rows.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Product entry mode — summary card ── */}
        {isProductEntryMode && !detailLoading && entryDetails.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg">
                  <IconReceipt size={20} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Total for {selectedProduct ? `${selectedProduct.code} - ${selectedProduct.name}` : 'Product'}
                  </p>
                  <p className="text-xl font-bold font-mono mt-0.5 text-rose-600 dark:text-rose-400">
                    {fmt(entryTotal)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-muted text-muted-foreground rounded-lg">
                  <IconCalendar size={20} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Entries</p>
                  <p className="text-xl font-bold font-mono mt-0.5">{entryDetails.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Table ── */}
        <Card className="shadow-sm overflow-hidden">

          {/* ── PRODUCT ENTRY MODE — flat table ── */}
          {isProductEntryMode ? (
            detailLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
                <span className="ml-3 text-sm text-muted-foreground">Loading entries…</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* Section heading */}
                <div className="px-4 py-2.5 bg-muted/30 border-b flex items-center gap-2">
                  <IconPackage size={14} className="text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Payment entries for{' '}
                    <span className="text-foreground">
                      {selectedProduct ? `${selectedProduct.code} - ${selectedProduct.name}` : '—'}
                    </span>
                  </span>
                </div>

                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="p-3 text-left font-semibold">Date</th>
                      <th className="p-3 text-left font-semibold">Voucher No</th>
                      <th className="p-3 text-left font-semibold">Expense Account</th>
                      <th className="p-3 text-left font-semibold hidden md:table-cell">Narration</th>
                      <th className="p-3 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entryDetails.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-10 text-center text-muted-foreground">
                          No expense entries found for this product.
                        </td>
                      </tr>
                    ) : (
                      entryDetails.map((d, idx) => (
                        <tr key={idx} className="border-b hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-medium">{formatDate(d.voucher_date)}</td>
                          <td className="p-3 font-mono text-xs">{d.voucher_no}</td>
                          <td className="p-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider bg-muted/50 text-muted-foreground">
                              {d.account_name}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs truncate max-w-xs hidden md:table-cell">
                            {d.narration || '—'}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                            {fmt(d.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {entryDetails.length > 0 && (
                    <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
                      <tr>
                        <td colSpan={4} className="p-3 font-bold text-sm">TOTAL</td>
                        <td className="p-3 text-right font-mono font-bold text-sm text-rose-600 dark:text-rose-400">
                          {fmt(entryTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )
          ) : (

            /* ── GROUPED MODE ── */
            loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
                <span className="ml-3 text-sm text-muted-foreground">Loading report…</span>
              </div>
            ) : (
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="p-3 w-8" />
                      <th className="p-3 text-left font-semibold">
                        {groupBy === 'day' ? 'Date' : groupBy === 'group' ? 'Account Group' : groupBy === 'product' ? 'Product' : 'Expense Account'}
                      </th>
                      <th className="p-3 text-right font-semibold">Payments</th>
                      <th className="p-3 text-right font-semibold">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-10 text-center text-muted-foreground">
                          No expense payments found for the selected period and filters.
                        </td>
                      </tr>
                    ) : (
                      rows.map(row => {
                        const isExpanded = !!expandedKeys[row.group_key];
                        const details = expandedDetails[row.group_key];
                        const isLoadingDetails = expandLoading[row.group_key];

                        return (
                          <>
                            {/* Group row */}
                            <tr
                              key={row.group_key}
                              className={`border-b hover:bg-muted/20 transition-colors cursor-pointer ${isExpanded ? 'bg-muted/10' : ''}`}
                              onClick={() => toggleExpand(row.group_key)}
                            >
                              <td className="p-3 text-center">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground">
                                  {isExpanded
                                    ? <IconChevronDown size={15} />
                                    : <IconChevronRight size={15} />}
                                </span>
                              </td>
                              <td className="p-3 font-medium">{formatGroupLabel(row)}</td>
                              <td className="p-3 text-right text-muted-foreground">{row.voucher_count}</td>
                              <td className="p-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                                {fmt(row.total_amount)}
                              </td>
                            </tr>

                            {/* Expanded detail sub-table */}
                            {isExpanded && (
                              <tr className="bg-muted/5">
                                <td colSpan={4} className="px-4 pb-3 pt-0">
                                  <div className="ml-6 border rounded-lg bg-card overflow-hidden">
                                    <div className="bg-muted/30 px-3 py-1.5 border-b">
                                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                        Payment Entries
                                      </span>
                                    </div>

                                    {isLoadingDetails ? (
                                      <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                                        Loading…
                                      </div>
                                    ) : !details || details.length === 0 ? (
                                      <div className="py-5 text-center text-xs text-muted-foreground">No entries found.</div>
                                    ) : (
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="bg-muted/20 border-b text-muted-foreground">
                                            <th className="p-2 text-left">Date</th>
                                            <th className="p-2 text-left">Voucher No</th>
                                            <th className="p-2 text-left">Account</th>
                                            {groupBy !== 'product' && productCostEnabled && (
                                              <th className="p-2 text-left">Product</th>
                                            )}
                                            <th className="p-2 text-left">Narration</th>
                                            <th className="p-2 text-right">Amount</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                          {details.map((d, i) => (
                                            <tr key={i} className="hover:bg-muted/10">
                                              <td className="p-2 text-muted-foreground">{formatDate(d.voucher_date)}</td>
                                              <td className="p-2 font-mono">{d.voucher_no}</td>
                                              <td className="p-2">{d.account_name}</td>
                                              {groupBy !== 'product' && productCostEnabled && (
                                                <td className="p-2 text-muted-foreground">{d.product_name ?? '—'}</td>
                                              )}
                                              <td className="p-2 text-muted-foreground truncate max-w-[200px]">
                                                {d.narration || '—'}
                                              </td>
                                              <td className="p-2 text-right font-mono font-semibold text-rose-600 dark:text-rose-400">
                                                {fmt(d.amount)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot className="border-t bg-muted/10">
                                          <tr>
                                            <td colSpan={groupBy !== 'product' && productCostEnabled ? 5 : 4}
                                              className="p-2 font-bold text-xs">Subtotal</td>
                                            <td className="p-2 text-right font-mono font-bold text-xs text-rose-600 dark:text-rose-400">
                                              {fmt(details.reduce((s, d) => s + d.amount, 0))}
                                            </td>
                                          </tr>
                                        </tfoot>
                                      </table>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })
                    )}
                  </tbody>
                  {rows.length > 0 && (
                    <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
                      <tr>
                        <td colSpan={3} className="p-3 font-bold text-sm">TOTAL</td>
                        <td className="p-3 text-right font-mono font-bold text-sm text-rose-600 dark:text-rose-400">
                          {fmt(totalExpenses)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </CardContent>
            )
          )}
        </Card>
      </div>
    </div>
  );
}
