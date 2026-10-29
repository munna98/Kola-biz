import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  IconDownload,
  IconPrinter,
  IconRefresh,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useMoney } from '@/hooks/useMoney';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setLedgerReportSelectedAccount, setActiveSectionWithParams } from '@/store';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface GroupBalanceRow {
  group_name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
  net_balance: number;
  account_count: number;
}

interface GroupAccountRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  total_debit: number;
  total_credit: number;
  net_balance: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = ['All', 'Asset', 'Liability', 'Equity', 'Income', 'Expense'];

const TYPE_COLORS: Record<string, string> = {
  Asset:     'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  Liability: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  Equity:    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  Income:    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  Expense:   'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function LedgerGroupBalancePage() {
  const dispatch = useDispatch();
  const companyProfile = useSelector((state: RootState) => state.companyProfile.profile);
  const money = useMoney();

  const today = new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(today);
  const [typeFilter, setTypeFilter] = useState('All');

  const [data, setData] = useState<GroupBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Drill-down state
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [drillData, setDrillData] = useState<GroupAccountRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadReport = async () => {
    try {
      setLoading(true);
      setExpandedGroup(null);
      setDrillData([]);
      const result = await invoke<GroupBalanceRow[]>('get_ledger_group_balance', {
        fromDate: fromDate || null,
        toDate,
        accountTypeFilter: typeFilter === 'All' ? null : typeFilter,
      });
      setData(result);
      setHasGenerated(true);
    } catch (err) {
      toast.error('Failed to load group balance report');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadDrillDown = async (groupName: string) => {
    if (expandedGroup === groupName) {
      setExpandedGroup(null);
      setDrillData([]);
      return;
    }
    try {
      setDrillLoading(true);
      setExpandedGroup(groupName);
      const result = await invoke<GroupAccountRow[]>('get_ledger_group_accounts', {
        groupName,
        fromDate: fromDate || null,
        toDate,
      });
      setDrillData(result);
    } catch (err) {
      toast.error('Failed to load account details');
      console.error(err);
    } finally {
      setDrillLoading(false);
    }
  };

  // Load on mount
  useEffect(() => {
    loadReport();
  }, []);

  // ── Navigate to Ledger Report ───────────────────────────────────────────────

  const openLedger = (accountId: string) => {
    dispatch(setLedgerReportSelectedAccount(accountId));
    dispatch(
      setActiveSectionWithParams({
        section: 'ledger',
        params: { accountId },
      })
    );
  };

  // ── Totals ──────────────────────────────────────────────────────────────────

  const totalDebit  = data.reduce((s, r) => s + r.total_debit,  0);
  const totalCredit = data.reduce((s, r) => s + r.total_credit, 0);
  const totalNet    = data.reduce((s, r) => s + r.net_balance,  0);

  // ── Export ──────────────────────────────────────────────────────────────────

  const handleExport = () => {
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }
    try {
      const companyName = companyProfile?.company_name || 'Company';
      const rows: any[][] = [];

      rows.push([`${companyName} — Ledger Group Balance`]);
      rows.push([
        fromDate
          ? `Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`
          : `As of ${formatDate(toDate)}`,
      ]);
      if (typeFilter !== 'All') rows.push([`Type Filter: ${typeFilter}`]);
      rows.push([]);
      rows.push(['Group Name', 'Account Type', 'Accounts', 'Total Debit', 'Total Credit', 'Net Balance']);

      for (const row of data) {
        const drStr =
          row.net_balance >= 0
            ? `${money(Math.abs(row.net_balance))} Dr`
            : `${money(Math.abs(row.net_balance))} Cr`;
        rows.push([
          row.group_name,
          row.account_type,
          row.account_count,
          row.total_debit,
          row.total_credit,
          drStr,
        ]);
      }

      rows.push([]);
      rows.push([
        'TOTAL',
        '',
        '',
        totalDebit,
        totalCredit,
        totalNet >= 0 ? `${money(Math.abs(totalNet))} Dr` : `${money(Math.abs(totalNet))} Cr`,
      ]);

      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        { wch: 30 },
        { wch: 14 },
        { wch: 10 },
        { wch: 18 },
        { wch: 18 },
        { wch: 22 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Group Balance');

      const fileName = `LedgerGroupBalance_${toDate}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success(`Exported as ${fileName}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to export');
    }
  };

  // ── Print ───────────────────────────────────────────────────────────────────

  const handlePrint = () => {
    if (data.length === 0) { toast.error('No data to print'); return; }
    window.print();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-background">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Ledger Group Balance</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Net balance summarised by account group
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadReport} disabled={loading}>
              <IconRefresh size={16} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!hasGenerated || data.length === 0}>
              <IconDownload size={16} />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!hasGenerated || data.length === 0}>
              <IconPrinter size={16} />
              Print
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex gap-4 items-end flex-wrap">
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
          <div>
            <Label className="text-xs mb-1 block">Account Type</Label>
            <div className="flex rounded-md border overflow-hidden h-9">
              {ACCOUNT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 text-xs font-medium border-l first:border-l-0 transition-colors ${
                    typeFilter === t
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={loadReport} size="sm" disabled={loading}>
            {loading ? 'Loading…' : 'Generate Report'}
          </Button>
        </div>
      </div>

      {/* ── Report Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">

          {/* Print header */}
          {hasGenerated && data.length > 0 && (
            <div className="hidden print:block mb-6 text-center">
              <h1 className="text-2xl font-bold">{companyProfile?.company_name}</h1>
              <h2 className="text-lg font-semibold mt-1">Ledger Group Balance</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {fromDate ? `${formatDate(fromDate)} to ${formatDate(toDate)}` : `As of ${formatDate(toDate)}`}
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading group balance…</p>
            </div>
          ) : !hasGenerated ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Click "Generate Report" to view data</p>
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">No transactions found for this period</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-3 text-left text-sm font-semibold w-8"></th>
                      <th className="p-3 text-left text-sm font-semibold">Group Name</th>
                      <th className="p-3 text-left text-sm font-semibold">Type</th>
                      <th className="p-3 text-center text-sm font-semibold">Ledgers</th>
                      <th className="p-3 text-right text-sm font-semibold">Total Debit</th>
                      <th className="p-3 text-right text-sm font-semibold">Total Credit</th>
                      <th className="p-3 text-right text-sm font-semibold">Net Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, idx) => {
                      const isExpanded = expandedGroup === row.group_name;
                      const isDr = row.net_balance >= 0;

                      return (
                        <>
                          {/* Group row */}
                          <tr
                            key={`group-${idx}`}
                            className={`border-b transition-colors cursor-pointer select-none ${
                              isExpanded
                                ? 'bg-primary/5'
                                : 'hover:bg-muted/30'
                            }`}
                            onClick={() => loadDrillDown(row.group_name)}
                          >
                            {/* Expand icon */}
                            <td className="p-3 text-muted-foreground">
                              {isExpanded
                                ? <IconChevronDown size={16} />
                                : <IconChevronRight size={16} />}
                            </td>

                            {/* Group name */}
                            <td className="p-3 text-sm font-medium">{row.group_name}</td>

                            {/* Type badge */}
                            <td className="p-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded ${TYPE_COLORS[row.account_type] ?? 'bg-muted text-muted-foreground'}`}>
                                {row.account_type}
                              </span>
                            </td>

                            {/* Account count */}
                            <td className="p-3 text-center text-sm text-muted-foreground">
                              {row.account_count}
                            </td>

                            {/* Debit */}
                            <td className="p-3 text-right font-mono text-sm">
                              {row.total_debit > 0 ? money(row.total_debit) : '-'}
                            </td>

                            {/* Credit */}
                            <td className="p-3 text-right font-mono text-sm">
                              {row.total_credit > 0 ? money(row.total_credit) : '-'}
                            </td>

                            {/* Net balance */}
                            <td className="p-3 text-right font-mono text-sm font-semibold">
                              <span className={isDr ? 'text-foreground' : 'text-destructive'}>
                                {money(Math.abs(row.net_balance))} {isDr ? 'Dr' : 'Cr'}
                              </span>
                            </td>
                          </tr>

                          {/* Drill-down sub-rows */}
                          {isExpanded && (
                            <tr key={`drill-${idx}`} className="border-b bg-muted/10">
                              <td colSpan={7} className="p-0">
                                {drillLoading ? (
                                  <div className="p-4 text-center text-sm text-muted-foreground">
                                    Loading accounts…
                                  </div>
                                ) : drillData.length === 0 ? (
                                  <div className="p-4 text-center text-sm text-muted-foreground">
                                    No accounts found
                                  </div>
                                ) : (
                                  <table className="w-full">
                                    <thead>
                                      <tr className="border-b bg-muted/30">
                                        <th className="p-2 pl-10 text-left text-xs font-semibold text-muted-foreground">Code</th>
                                        <th className="p-2 text-left text-xs font-semibold text-muted-foreground">Account Name</th>
                                        <th className="p-2 text-right text-xs font-semibold text-muted-foreground">Debit</th>
                                        <th className="p-2 text-right text-xs font-semibold text-muted-foreground">Credit</th>
                                        <th className="p-2 pr-4 text-right text-xs font-semibold text-muted-foreground">Net Balance</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {drillData.map((acc) => {
                                        const accDr = acc.net_balance >= 0;
                                        return (
                                          <tr
                                            key={acc.account_id}
                                            className="border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                                          >
                                            <td className="p-2 pl-10 font-mono text-xs text-muted-foreground">
                                              {acc.account_code}
                                            </td>
                                            <td className="p-2 text-sm">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openLedger(acc.account_id);
                                                }}
                                                className="text-primary hover:underline font-medium text-left cursor-pointer focus:outline-none"
                                                title={`View Ledger for ${acc.account_name}`}
                                              >
                                                {acc.account_name}
                                              </button>
                                            </td>
                                            <td className="p-2 text-right font-mono text-xs">
                                              {acc.total_debit > 0 ? money(acc.total_debit) : '-'}
                                            </td>
                                            <td className="p-2 text-right font-mono text-xs">
                                              {acc.total_credit > 0 ? money(acc.total_credit) : '-'}
                                            </td>
                                            <td className="p-2 pr-4 text-right font-mono text-xs font-semibold">
                                              <span className={accDr ? '' : 'text-destructive'}>
                                                {money(Math.abs(acc.net_balance))} {accDr ? 'Dr' : 'Cr'}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>

                  {/* Totals footer */}
                  <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
                    <tr>
                      <td colSpan={3} className="p-3 font-bold text-sm">TOTAL</td>
                      <td className="p-3 text-center font-bold text-sm">
                        {data.reduce((s, r) => s + r.account_count, 0)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        {money(totalDebit)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        {money(totalCredit)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        <span className={totalNet >= 0 ? '' : 'text-destructive'}>
                          {money(Math.abs(totalNet))} {totalNet >= 0 ? 'Dr' : 'Cr'}
                        </span>
                      </td>
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
