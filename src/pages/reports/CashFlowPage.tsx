import { useState, useEffect, Fragment } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useAppNavigation } from '@/hooks/useAppNavigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  IconBuildingBank,
  IconDownload,
  IconPrinter,
  IconRefresh,
  IconChevronDown,
  IconChevronRight,
  IconSearch,
  IconExternalLink,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useMoney } from '@/hooks/useMoney';
import * as XLSX from 'xlsx';

export interface CashFlowItem {
  key?: string;
  description: string;
  amount: number;
  count?: number;
}

export interface CashAccountBreakdown {
  account_id: string;
  account_name: string;
  account_code: string;
  account_group: string;
  opening_balance: number;
  net_change: number;
  closing_balance: number;
  transaction_count?: number;
}

export interface CashFlowData {
  operating_activities: CashFlowItem[];
  investing_activities: CashFlowItem[];
  financing_activities: CashFlowItem[];
  net_operating: number;
  net_investing: number;
  net_financing: number;
  net_change: number;
  opening_cash: number;
  closing_cash: number;
  breakdown?: CashAccountBreakdown[];
}

export interface CashFlowDetailEntry {
  id: string;
  voucher_id: string;
  voucher_no: string;
  voucher_type: string;
  voucher_date: string;
  cash_account_id: string;
  cash_account_name: string;
  cash_account_group: string;
  party_name?: string | null;
  opposing_account?: string | null;
  narration?: string | null;
  flow_type: 'inflow' | 'outflow';
  activity_type: string;
  category: string;
  category_key: string;
  inflow: number;
  outflow: number;
  net_amount: number;
  running_balance?: number | null;
}

export interface CashFlowDrilldownResponse {
  title: string;
  category_key?: string | null;
  account_id?: string | null;
  account_name?: string | null;
  opening_balance: number;
  total_inflow: number;
  total_outflow: number;
  net_change: number;
  closing_balance: number;
  count: number;
  entries: CashFlowDetailEntry[];
}

export default function CashFlowPage() {
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setMonth(0);
    date.setDate(1);
    return date.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const money = useMoney();
  const { navigateTo } = useAppNavigation();
  const companyProfile = useSelector((state: RootState) => state.companyProfile.profile);

  // Inline expanded rows
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [inlineDetails, setInlineDetails] = useState<Record<string, CashFlowDetailEntry[]>>({});
  const [inlineLoading, setInlineLoading] = useState<Record<string, boolean>>({});
  const [inlineSearch, setInlineSearch] = useState<Record<string, string>>({});

  const cashAccounts =
    data?.breakdown?.filter(
      (a) =>
        a.account_group.toLowerCase().includes('cash') ||
        a.account_name.toLowerCase().includes('cash')
    ) || [];
  const bankAccounts =
    data?.breakdown?.filter(
      (a) =>
        !a.account_group.toLowerCase().includes('cash') &&
        !a.account_name.toLowerCase().includes('cash')
    ) || [];

  const totalCashOpening = cashAccounts.reduce((sum, a) => sum + a.opening_balance, 0);
  const totalCashClosing = cashAccounts.reduce((sum, a) => sum + a.closing_balance, 0);
  const totalBankOpening = bankAccounts.reduce((sum, a) => sum + a.opening_balance, 0);
  const totalBankClosing = bankAccounts.reduce((sum, a) => sum + a.closing_balance, 0);

  const loadReport = async () => {
    try {
      setLoading(true);
      // Clear expanded cache on reload
      setExpandedRows({});
      setInlineDetails({});
      setInlineSearch({});
      const result = await invoke<CashFlowData>('get_cash_flow', {
        fromDate,
        toDate,
      });
      setData(result);
    } catch (error) {
      toast.error('Failed to load cash flow statement');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  // Export full cash flow statement to Excel
  const handleExport = () => {
    if (!data) {
      toast.error('No cash flow data to export');
      return;
    }
    try {
      const companyName = companyProfile?.company_name || 'Company';
      const rows: any[][] = [];

      rows.push([`${companyName} - CASH FLOW STATEMENT`]);
      rows.push([`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`]);
      rows.push([]);

      // Operating Activities
      rows.push(['CASH FLOW FROM OPERATING ACTIVITIES', 'AMOUNT']);
      data.operating_activities.forEach((item) => {
        rows.push([item.description, item.amount]);
      });
      rows.push(['Net Cash from Operating Activities', data.net_operating]);
      rows.push([]);

      // Investing Activities
      rows.push(['CASH FLOW FROM INVESTING ACTIVITIES', 'AMOUNT']);
      data.investing_activities.forEach((item) => {
        rows.push([item.description, item.amount]);
      });
      rows.push(['Net Cash from Investing Activities', data.net_investing]);
      rows.push([]);

      // Financing Activities
      rows.push(['CASH FLOW FROM FINANCING ACTIVITIES', 'AMOUNT']);
      data.financing_activities.forEach((item) => {
        rows.push([item.description, item.amount]);
      });
      rows.push(['Net Cash from Financing Activities', data.net_financing]);
      rows.push([]);

      // Summary
      rows.push(['SUMMARY', 'AMOUNT']);
      rows.push(['Opening Cash & Cash Equivalents', data.opening_cash]);
      rows.push(['Net Change in Cash', data.net_change]);
      rows.push(['Closing Cash & Cash Equivalents', data.closing_cash]);
      rows.push([]);

      // Breakdown
      if (data.breakdown && data.breakdown.length > 0) {
        rows.push(['CASH & BANK BALANCES BREAKDOWN']);
        rows.push(['Account', 'Group', 'Opening Balance', 'Net Change', 'Closing Balance']);
        data.breakdown.forEach((acc) => {
          rows.push([
            `${acc.account_name} (${acc.account_code})`,
            acc.account_group,
            acc.opening_balance,
            acc.net_change,
            acc.closing_balance,
          ]);
        });
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cash Flow Statement');
      const filename = `CashFlow_${fromDate}_to_${toDate}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success(`Exported as ${filename}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to export Cash Flow to Excel');
    }
  };

  // Toggle inline accordion row
  const toggleInlineRow = async (rowKey: string, categoryKey?: string, accountId?: string) => {
    const isExpanding = !expandedRows[rowKey];
    setExpandedRows((prev) => ({ ...prev, [rowKey]: isExpanding }));

    if (isExpanding && !inlineDetails[rowKey]) {
      setInlineLoading((prev) => ({ ...prev, [rowKey]: true }));
      try {
        const res = await invoke<CashFlowDrilldownResponse>('get_cash_flow_drilldown', {
          fromDate,
          toDate,
          categoryKey: categoryKey || null,
          accountId: accountId || null,
        });
        setInlineDetails((prev) => ({ ...prev, [rowKey]: res.entries }));
      } catch (err) {
        toast.error('Failed to load entries');
        console.error(err);
      } finally {
        setInlineLoading((prev) => ({ ...prev, [rowKey]: false }));
      }
    }
  };

  // Expand all rows inline
  const expandAll = async () => {
    if (!data) return;
    const newExpanded: Record<string, boolean> = {};
    const itemsToFetch: { rowKey: string; categoryKey?: string; accountId?: string }[] = [];

    data.operating_activities.forEach((item, idx) => {
      const key = `op-${idx}-${item.key || item.description}`;
      newExpanded[key] = true;
      if (!inlineDetails[key]) itemsToFetch.push({ rowKey: key, categoryKey: item.key });
    });

    data.investing_activities.forEach((item, idx) => {
      const key = `inv-${idx}-${item.key || item.description}`;
      newExpanded[key] = true;
      if (!inlineDetails[key]) itemsToFetch.push({ rowKey: key, categoryKey: 'investing' });
    });

    data.financing_activities.forEach((item, idx) => {
      const key = `fin-${idx}-${item.key || item.description}`;
      newExpanded[key] = true;
      if (!inlineDetails[key]) itemsToFetch.push({ rowKey: key, categoryKey: 'financing' });
    });

    if (data.breakdown) {
      data.breakdown.forEach((acc) => {
        const key = `acc-${acc.account_id}`;
        newExpanded[key] = true;
        if (!inlineDetails[key]) itemsToFetch.push({ rowKey: key, accountId: acc.account_id });
      });
    }

    setExpandedRows(newExpanded);

    // Fetch missing details in parallel
    await Promise.all(
      itemsToFetch.map(async (item) => {
        setInlineLoading((prev) => ({ ...prev, [item.rowKey]: true }));
        try {
          const res = await invoke<CashFlowDrilldownResponse>('get_cash_flow_drilldown', {
            fromDate,
            toDate,
            categoryKey: item.categoryKey || null,
            accountId: item.accountId || null,
          });
          setInlineDetails((prev) => ({ ...prev, [item.rowKey]: res.entries }));
        } catch (err) {
          console.error(err);
        } finally {
          setInlineLoading((prev) => ({ ...prev, [item.rowKey]: false }));
        }
      })
    );
  };

  const collapseAll = () => {
    setExpandedRows({});
  };

  // Navigation to voucher
  const handleVoucherClick = (voucherId: string, voucherType: string) => {
    let section = '';
    switch (voucherType) {
      case 'sales_invoice':
        section = 'sales';
        break;
      case 'co_invoice':
        section = 'custom_orders';
        break;
      case 'purchase_invoice':
        section = 'purchase';
        break;
      case 'payment':
        section = 'payments';
        break;
      case 'receipt':
        section = 'receipts';
        break;
      case 'journal':
        section = 'journal';
        break;
      case 'sales_return':
        section = 'sales_return';
        break;
      case 'purchase_return':
        section = 'purchase_return';
        break;
      case 'opening_balance':
        section = 'opening';
        break;
      case 'delivery_note':
        section = 'delivery_note';
        break;
      case 'sales_quotation':
      case 'quotation':
        section = 'sales_quotation';
        break;
      case 'stock_journal':
        section = 'stock_journal';
        break;
      case 'opening_stock':
        section = 'opening_stock';
        break;
      default:
        toast.info(`Voucher type: ${voucherType}`);
        return;
    }
    navigateTo(section, { voucherId });
  };

  const getVoucherBadgeClass = (type: string) => {
    switch (type) {
      case 'sales_invoice':
      case 'co_invoice':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      case 'receipt':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30';
      case 'purchase_invoice':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
      case 'payment':
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
      case 'journal':
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getVoucherTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      sales_invoice: 'Sales',
      co_invoice: 'Custom Order',
      purchase_invoice: 'Purchase',
      payment: 'Payment',
      receipt: 'Receipt',
      journal: 'Journal',
      sales_return: 'Sales Return',
      purchase_return: 'Purchase Return',
      opening_balance: 'Opening Balance',
    };
    return labels[type] || type.replace(/_/g, ' ');
  };

  // Render an activity row with inline drilldown expander
  const renderActivityRow = (
    item: CashFlowItem,
    rowKey: string,
    categoryKey?: string
  ) => {
    const isExpanded = !!expandedRows[rowKey];
    const details = inlineDetails[rowKey];
    const isDetailsLoading = inlineLoading[rowKey];
    const searchQuery = (inlineSearch[rowKey] || '').toLowerCase().trim();

    const filteredDetails = details
      ? details.filter((d) => {
          if (!searchQuery) return true;
          return (
            d.voucher_no.toLowerCase().includes(searchQuery) ||
            (d.party_name || '').toLowerCase().includes(searchQuery) ||
            (d.opposing_account || '').toLowerCase().includes(searchQuery) ||
            d.cash_account_name.toLowerCase().includes(searchQuery) ||
            (d.narration || '').toLowerCase().includes(searchQuery)
          );
        })
      : [];

    return (
      <div key={rowKey} className="border-b last:border-b-0">
        <div
          className={`flex items-center justify-between p-3.5 transition-colors cursor-pointer select-none ${
            isExpanded ? 'bg-muted/40' : 'hover:bg-muted/20'
          }`}
          onClick={() => toggleInlineRow(rowKey, categoryKey || item.key)}
        >
          <div className="flex items-center gap-2.5">
            <span className="p-1 rounded text-muted-foreground hover:text-foreground">
              {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
            </span>
            <div>
              <span className="text-sm font-medium">{item.description}</span>
              {item.count !== undefined && item.count > 0 && (
                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 font-normal">
                  {item.count} {item.count === 1 ? 'txn' : 'txns'}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-sm font-semibold ${
                item.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {item.amount >= 0 ? '+' : ''}
              {money(item.amount)}
            </span>
          </div>
        </div>

        {/* Inline Detail Accordion */}
        {isExpanded && (
          <div className="bg-muted/10 p-3.5 border-t">
            {isDetailsLoading ? (
              <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                Loading transaction details…
              </div>
            ) : !details || details.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No individual transactions found for this item.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-muted-foreground px-1 pb-1">
                  <span>
                    Showing <strong>{filteredDetails.length}</strong> of <strong>{details.length}</strong> transactions for{' '}
                    <strong>{item.description}</strong>
                  </span>
                  {details.length > 3 && (
                    <div className="relative w-56">
                      <IconSearch size={13} className="absolute left-2.5 top-2 text-muted-foreground" />
                      <Input
                        placeholder="Search transactions…"
                        value={inlineSearch[rowKey] || ''}
                        onChange={(e) =>
                          setInlineSearch((prev) => ({ ...prev, [rowKey]: e.target.value }))
                        }
                        className="h-7 text-xs pl-7 py-0 bg-background"
                      />
                    </div>
                  )}
                </div>
                <div className="overflow-x-auto rounded border bg-card shadow-xs">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30 border-b text-muted-foreground font-semibold">
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Voucher No</th>
                        <th className="p-2 text-left">Type</th>
                        <th className="p-2 text-left">Cash / Bank A/c</th>
                        <th className="p-2 text-left hidden md:table-cell">Narration</th>
                        <th className="p-2 text-right">Inflow</th>
                        <th className="p-2 text-right">Outflow</th>
                        <th className="p-2 text-right">Net Flow</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredDetails.map((d) => (
                        <tr
                          key={d.id}
                          className="hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => handleVoucherClick(d.voucher_id, d.voucher_type)}
                          title="Click to view voucher"
                        >
                          <td className="p-2 font-medium whitespace-nowrap">{formatDate(d.voucher_date)}</td>
                          <td className="p-2 font-mono text-primary font-semibold hover:underline whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              {d.voucher_no}
                              <IconExternalLink size={12} className="opacity-60" />
                            </span>
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getVoucherBadgeClass(
                                d.voucher_type
                              )}`}
                            >
                              {getVoucherTypeLabel(d.voucher_type)}
                            </span>
                          </td>
                          <td className="p-2 text-muted-foreground whitespace-nowrap">{d.cash_account_name}</td>
                          <td className="p-2 text-muted-foreground truncate max-w-xs hidden md:table-cell">
                            {d.narration || '-'}
                          </td>
                          <td className="p-2 text-right font-mono text-green-600 dark:text-green-400 whitespace-nowrap">
                            {d.inflow > 0 ? `+${money(d.inflow)}` : '-'}
                          </td>
                          <td className="p-2 text-right font-mono text-red-600 dark:text-red-400 whitespace-nowrap">
                            {d.outflow > 0 ? `-${money(d.outflow)}` : '-'}
                          </td>
                          <td
                            className={`p-2 text-right font-mono font-bold whitespace-nowrap ${
                              d.net_amount >= 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {d.net_amount >= 0 ? '+' : ''}
                            {money(d.net_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {filteredDetails.length > 0 && (
                      <tfoot className="bg-muted/30 border-t font-semibold">
                        <tr>
                          <td colSpan={5} className="p-2 text-muted-foreground">
                            Subtotal ({filteredDetails.length} items)
                          </td>
                          <td className="p-2 text-right font-mono text-green-600 dark:text-green-400">
                            +{money(filteredDetails.reduce((s, e) => s + e.inflow, 0))}
                          </td>
                          <td className="p-2 text-right font-mono text-red-600 dark:text-red-400">
                            -{money(filteredDetails.reduce((s, e) => s + e.outflow, 0))}
                          </td>
                          <td
                            className={`p-2 text-right font-mono font-bold ${
                              filteredDetails.reduce((s, e) => s + e.net_amount, 0) >= 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {filteredDetails.reduce((s, e) => s + e.net_amount, 0) >= 0 ? '+' : ''}
                            {money(filteredDetails.reduce((s, e) => s + e.net_amount, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Cash Flow Statement</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Analysis of cash inflows and outflows by activity type
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={expandAll}
              title="Expand all activity categories inline"
              className="h-8 text-xs"
            >
              Expand All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={collapseAll}
              title="Collapse all activity categories"
              className="h-8 text-xs"
            >
              Collapse All
            </Button>
            <Button variant="outline" size="sm" onClick={loadReport} className="gap-1.5 h-8">
              <IconRefresh size={15} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 h-8">
              <IconDownload size={15} />
              Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 h-8">
              <IconPrinter size={15} />
              Print
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex gap-4 items-end">
          <div className="flex-1 max-w-xs">
            <Label className="text-xs mb-1 block">From Date</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex-1 max-w-xs">
            <Label className="text-xs mb-1 block">To Date</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9"
            />
          </div>
          <Button onClick={loadReport} size="sm">
            Generate Report
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">
              {companyProfile?.company_name || 'Cash Flow Statement'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              For the period: {formatDate(fromDate)} to {formatDate(toDate)}
            </p>
          </div>


          {loading ? (
            <div className="flex items-center justify-center h-64 gap-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              <p className="text-muted-foreground text-sm">Loading statement...</p>
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">No data available</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Operating Activities */}
              <Card className="overflow-hidden shadow-xs">
                <CardContent className="p-0">
                  <div className="bg-muted/40 border-b p-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-base">Cash Flow from Operating Activities</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cash receipts and disbursements from core sales, purchases, and operations
                      </p>
                    </div>
                    <span
                      className={`font-mono font-bold text-sm ${
                        data.net_operating >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {data.net_operating >= 0 ? '+' : ''}
                      {money(data.net_operating)}
                    </span>
                  </div>

                  <div>
                    {data.operating_activities.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        No operating activities recorded
                      </div>
                    ) : (
                      data.operating_activities.map((item, idx) =>
                        renderActivityRow(item, `op-${idx}-${item.key || item.description}`)
                      )
                    )}
                  </div>

                  <div className="bg-muted/20 border-t-2 flex justify-between items-center p-3.5 text-sm font-bold">
                    <span>Net Cash from Operating Activities</span>
                    <span
                      className={`font-mono ${
                        data.net_operating >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {data.net_operating >= 0 ? '+' : ''}
                      {money(data.net_operating)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Investing Activities */}
              <Card className="overflow-hidden shadow-xs">
                <CardContent className="p-0">
                  <div className="bg-muted/40 border-b p-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-base">Cash Flow from Investing Activities</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cash movements for fixed assets, capital expenditures, or investments
                      </p>
                    </div>
                    <span
                      className={`font-mono font-bold text-sm ${
                        data.net_investing >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {data.net_investing >= 0 ? '+' : ''}
                      {money(data.net_investing)}
                    </span>
                  </div>

                  <div>
                    {data.investing_activities.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        No investing activities recorded
                      </div>
                    ) : (
                      data.investing_activities.map((item, idx) =>
                        renderActivityRow(item, `inv-${idx}-${item.key || item.description}`, 'investing')
                      )
                    )}
                  </div>

                  <div className="bg-muted/20 border-t-2 flex justify-between items-center p-3.5 text-sm font-bold">
                    <span>Net Cash from Investing Activities</span>
                    <span
                      className={`font-mono ${
                        data.net_investing >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {data.net_investing >= 0 ? '+' : ''}
                      {money(data.net_investing)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Financing Activities */}
              <Card className="overflow-hidden shadow-xs">
                <CardContent className="p-0">
                  <div className="bg-muted/40 border-b p-4 flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-base">Cash Flow from Financing Activities</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cash transactions involving loans, capital introduced, or equity withdrawals
                      </p>
                    </div>
                    <span
                      className={`font-mono font-bold text-sm ${
                        data.net_financing >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {data.net_financing >= 0 ? '+' : ''}
                      {money(data.net_financing)}
                    </span>
                  </div>

                  <div>
                    {data.financing_activities.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground text-sm">
                        No financing activities recorded
                      </div>
                    ) : (
                      data.financing_activities.map((item, idx) =>
                        renderActivityRow(item, `fin-${idx}-${item.key || item.description}`, 'financing')
                      )
                    )}
                  </div>

                  <div className="bg-muted/20 border-t-2 flex justify-between items-center p-3.5 text-sm font-bold">
                    <span>Net Cash from Financing Activities</span>
                    <span
                      className={`font-mono ${
                        data.net_financing >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {data.net_financing >= 0 ? '+' : ''}
                      {money(data.net_financing)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card className="shadow-xs">
                <CardContent className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-sm font-semibold">Opening Cash & Cash Equivalents</span>
                      {data.breakdown && data.breakdown.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>
                            Cash in Hand:{' '}
                            <strong className="font-mono text-foreground">{money(totalCashOpening)}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Bank Accounts:{' '}
                            <strong className="font-mono text-foreground">{money(totalBankOpening)}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-base">{money(data.opening_cash)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-4">
                    <span className="text-sm font-semibold">Net Change in Cash</span>
                    <span
                      className={`font-mono font-bold ${
                        data.net_change >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {data.net_change >= 0 ? '+' : ''}
                      {money(data.net_change)}
                    </span>
                  </div>
                  <div className="flex justify-between items-start border-t pt-4">
                    <div>
                      <span className="text-lg font-bold">Closing Cash & Cash Equivalents</span>
                      {data.breakdown && data.breakdown.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>
                            Cash in Hand:{' '}
                            <strong className="font-mono text-foreground">{money(totalCashClosing)}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Bank Accounts:{' '}
                            <strong className="font-mono text-foreground">{money(totalBankClosing)}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="text-2xl font-mono font-bold text-primary">
                      {money(data.closing_cash)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Cash & Bank Account Breakdown Card */}
              {data.breakdown && data.breakdown.length > 0 && (
                <Card className="shadow-xs overflow-hidden">
                  <CardContent className="p-0">
                    <div className="bg-muted/40 border-b p-4 flex items-center justify-between">
                      <div>
                        <h2 className="font-bold text-base flex items-center gap-2">
                          <IconBuildingBank size={18} className="text-primary" />
                          Cash & Bank Balances Breakdown (Cash Equivalents)
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">
                          Reconciliation of Cash in Hand and Bank accounts. Click any account to drill down its cash movement.
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/10 text-xs text-muted-foreground font-semibold">
                            <th className="p-3 w-8"></th>
                            <th className="p-3 text-left">Account</th>
                            <th className="p-3 text-left w-32">Group</th>
                            <th className="p-3 text-right w-36">Opening Balance</th>
                            <th className="p-3 text-right w-36">Net Change</th>
                            <th className="p-3 text-right w-36">Closing Balance</th>
                            <th className="p-3 text-center w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.breakdown.map((acc) => {
                            const accRowKey = `acc-${acc.account_id}`;
                            const isAccExpanded = !!expandedRows[accRowKey];
                            const accDetails = inlineDetails[accRowKey];
                            const isAccLoading = inlineLoading[accRowKey];
                            const accSearch = (inlineSearch[accRowKey] || '').toLowerCase().trim();

                            const filteredAccDetails = accDetails
                              ? accDetails.filter((d) => {
                                  if (!accSearch) return true;
                                  return (
                                    d.voucher_no.toLowerCase().includes(accSearch) ||
                                    (d.narration || '').toLowerCase().includes(accSearch)
                                  );
                                })
                              : [];

                            return (
                              <Fragment key={acc.account_id}>
                                <tr
                                  className={`border-b hover:bg-muted/30 text-sm transition-colors cursor-pointer ${
                                    isAccExpanded ? 'bg-muted/20' : ''
                                  }`}
                                  onClick={() => toggleInlineRow(accRowKey, undefined, acc.account_id)}
                                >
                                  <td className="p-3 text-center w-8">
                                    <span className="p-1 rounded text-muted-foreground">
                                      {isAccExpanded ? (
                                        <IconChevronDown size={15} />
                                      ) : (
                                        <IconChevronRight size={15} />
                                      )}
                                    </span>
                                  </td>
                                  <td className="p-3">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{acc.account_name}</span>
                                      <span className="text-xs text-muted-foreground font-mono">
                                        ({acc.account_code})
                                      </span>
                                      {acc.transaction_count !== undefined && acc.transaction_count > 0 && (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] px-1.5 py-0 font-normal ml-1"
                                        >
                                          {acc.transaction_count} {acc.transaction_count === 1 ? 'txn' : 'txns'}
                                        </Badge>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-3 text-xs w-32">
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                        acc.account_group.toLowerCase().includes('cash')
                                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                      }`}
                                    >
                                      {acc.account_group}
                                    </span>
                                  </td>
                                  <td className="p-3 text-right font-mono text-sm w-36">
                                    {money(acc.opening_balance)}
                                  </td>
                                  <td
                                    className={`p-3 text-right font-mono text-sm w-36 ${
                                      acc.net_change >= 0
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-red-600 dark:text-red-400'
                                    }`}
                                  >
                                    {acc.net_change >= 0 ? '+' : ''}
                                    {money(acc.net_change)}
                                  </td>
                                  <td className="p-3 text-right font-mono text-sm font-semibold w-36">
                                    {money(acc.closing_balance)}
                                  </td>
                                  <td className="p-3 text-center w-24" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                      title="Open full ledger report"
                                      onClick={() => navigateTo('ledger', { accountId: acc.account_id })}
                                    >
                                      Ledger
                                    </Button>
                                  </td>
                                </tr>

                                {/* Inline Account Transactions */}
                                {isAccExpanded && (
                                  <tr className="border-b">
                                    <td colSpan={7} className="bg-muted/10 p-3.5">
                                      {isAccLoading ? (
                                        <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
                                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                                          Loading account cash flow…
                                        </div>
                                      ) : !accDetails || accDetails.length === 0 ? (
                                        <div className="py-4 text-center text-xs text-muted-foreground">
                                          No transactions recorded for this account during the period.
                                        </div>
                                      ) : (
                                        <div className="space-y-2">
                                          <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-muted-foreground px-1 pb-1">
                                            <span>
                                              Opening: <strong className="font-mono text-foreground">{money(acc.opening_balance)}</strong>
                                              {'  •  '}
                                              Net Change: <strong className="font-mono text-foreground">{money(acc.net_change)}</strong>
                                              {'  •  '}
                                              Closing: <strong className="font-mono text-foreground">{money(acc.closing_balance)}</strong>
                                            </span>
                                            {accDetails.length > 3 && (
                                              <div className="relative w-56">
                                                <IconSearch size={13} className="absolute left-2.5 top-2 text-muted-foreground" />
                                                <Input
                                                  placeholder="Search account entries…"
                                                  value={inlineSearch[accRowKey] || ''}
                                                  onChange={(e) =>
                                                    setInlineSearch((prev) => ({
                                                      ...prev,
                                                      [accRowKey]: e.target.value,
                                                    }))
                                                  }
                                                  className="h-7 text-xs pl-7 py-0 bg-background"
                                                />
                                              </div>
                                            )}
                                          </div>
                                          <div className="overflow-x-auto rounded border bg-card shadow-xs">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="bg-muted/30 border-b text-muted-foreground font-semibold">
                                                  <th className="p-2 text-left">Date</th>
                                                  <th className="p-2 text-left">Voucher No</th>
                                                  <th className="p-2 text-left">Type</th>
                                                  <th className="p-2 text-left hidden md:table-cell">Narration</th>
                                                  <th className="p-2 text-right">Inflow</th>
                                                  <th className="p-2 text-right">Outflow</th>
                                                  <th className="p-2 text-right">Net</th>
                                                  <th className="p-2 text-right">Running Balance</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y">
                                                {filteredAccDetails.map((d) => (
                                                  <tr
                                                    key={d.id}
                                                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                                                    onClick={() => handleVoucherClick(d.voucher_id, d.voucher_type)}
                                                    title="Click to view voucher"
                                                  >
                                                    <td className="p-2 font-medium whitespace-nowrap">{formatDate(d.voucher_date)}</td>
                                                    <td className="p-2 font-mono text-primary font-semibold hover:underline whitespace-nowrap">
                                                      <span className="flex items-center gap-1">
                                                        {d.voucher_no}
                                                        <IconExternalLink size={12} className="opacity-60" />
                                                      </span>
                                                    </td>
                                                    <td className="p-2 whitespace-nowrap">
                                                      <span
                                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getVoucherBadgeClass(
                                                          d.voucher_type
                                                        )}`}
                                                      >
                                                        {getVoucherTypeLabel(d.voucher_type)}
                                                      </span>
                                                    </td>
                                                    <td className="p-2 text-muted-foreground truncate max-w-xs hidden md:table-cell">
                                                      {d.narration || '-'}
                                                    </td>
                                                    <td className="p-2 text-right font-mono text-green-600 dark:text-green-400 whitespace-nowrap">
                                                      {d.inflow > 0 ? `+${money(d.inflow)}` : '-'}
                                                    </td>
                                                    <td className="p-2 text-right font-mono text-red-600 dark:text-red-400 whitespace-nowrap">
                                                      {d.outflow > 0 ? `-${money(d.outflow)}` : '-'}
                                                    </td>
                                                    <td
                                                      className={`p-2 text-right font-mono font-semibold whitespace-nowrap ${
                                                        d.net_amount >= 0
                                                          ? 'text-green-600 dark:text-green-400'
                                                          : 'text-red-600 dark:text-red-400'
                                                      }`}
                                                    >
                                                      {d.net_amount >= 0 ? '+' : ''}
                                                      {money(d.net_amount)}
                                                    </td>
                                                    <td className="p-2 text-right font-mono font-bold text-foreground whitespace-nowrap">
                                                      {d.running_balance !== null && d.running_balance !== undefined
                                                        ? money(d.running_balance)
                                                        : '-'}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-muted/20 border-t-2 font-bold text-sm">
                          <tr>
                            <td colSpan={3} className="p-3">
                              Total Cash & Cash Equivalents
                            </td>
                            <td className="p-3 text-right font-mono">{money(data.opening_cash)}</td>
                            <td
                              className={`p-3 text-right font-mono ${
                                data.net_change >= 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {data.net_change >= 0 ? '+' : ''}
                              {money(data.net_change)}
                            </td>
                            <td className="p-3 text-right font-mono text-primary font-bold">
                              {money(data.closing_cash)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
