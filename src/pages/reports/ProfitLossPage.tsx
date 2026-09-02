import { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  IconDownload, IconPrinter, IconRefresh, IconChevronDown,
  IconChevronRight, IconFolder, IconFolderFilled, IconExternalLink,
  IconLayoutColumns, IconLayoutList
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate, round2 } from '@/lib/utils';
import { useMoney } from '@/hooks/useMoney';
import { AccountGroup, AccountGroupNode } from '@/lib/tauri';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, setLedgerReportSelectedAccount, setActiveSectionWithParams } from '@/store';
import { cn } from '@/lib/utils';

interface PLAccount {
  id: string;
  account_name: string;
  account_code: string;
  account_group: string;
  amount: number;
}

interface ProfitLossData {
  groups: AccountGroup[];
  income: PLAccount[];
  expenses: PLAccount[];
  direct_expenses?: PLAccount[];
  total_income: number;
  total_expenses: number;
  opening_stock: number;
  purchases: number;
  closing_stock: number;
  cogs: number;
  cogs_from_gl?: number;
  gross_profit: number;
  net_profit: number;
}

// Tree Node Structure for Report Rendering
interface PLGroupTreeNode extends AccountGroupNode {
  accounts: PLAccount[];
  totalAmount: number;
  plChildren: PLGroupTreeNode[];
}

function buildPLTree(
  allGroups: AccountGroup[],
  accounts: PLAccount[],
  sectionType: string // "Income", "Expense"
): PLGroupTreeNode[] {
  const sectionGroups = allGroups.filter(g => {
    let current: AccountGroup | undefined = g;
    while (current) {
      if (current.base_type) return current.base_type === sectionType;
      if (current.account_type === sectionType) return true;
      if (!current.parent_group_id) break;
      current = allGroups.find(x => x.id === current!.parent_group_id);
    }
    return g.account_type === sectionType;
  });

  const accountsByGroup = new Map<string, PLAccount[]>();
  for (const acc of accounts) {
    const list = accountsByGroup.get(acc.account_group) || [];
    list.push(acc);
    accountsByGroup.set(acc.account_group, list);
  }

  const nodeMap = new Map<string, PLGroupTreeNode>();
  for (const g of sectionGroups) {
    nodeMap.set(g.name, {
      ...g,
      children: [],
      depth: 0,
      accounts: accountsByGroup.get(g.name) || [],
      totalAmount: 0,
      plChildren: [],
    });
  }

  for (const [groupName, accs] of accountsByGroup.entries()) {
    if (!nodeMap.has(groupName)) {
      nodeMap.set(groupName, {
        id: `orphan-${groupName}`,
        name: groupName,
        account_type: sectionType,
        parent_group_id: null,
        is_system: 0,
        base_type: sectionType,
        is_active: 1,
        created_at: '',
        children: [],
        depth: 0,
        accounts: accs,
        totalAmount: 0,
        plChildren: [],
      });
    }
  }

  const roots: PLGroupTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (!node.parent_group_id) {
      roots.push(node);
    } else {
      const parent = allGroups.find(g => g.id === node.parent_group_id);
      if (parent && nodeMap.has(parent.name)) {
        nodeMap.get(parent.name)!.plChildren.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  function calculateTotals(node: PLGroupTreeNode, depth: number): number {
    node.depth = depth;
    let sum = node.accounts.reduce((s, a) => s + a.amount, 0);
    for (const child of node.plChildren) {
      sum += calculateTotals(child, depth + 1);
    }
    node.totalAmount = sum;
    return sum;
  }

  for (const root of roots) {
    calculateTotals(root, 0);
  }

  function filterNonZero(nodes: PLGroupTreeNode[]): PLGroupTreeNode[] {
    return nodes
      .filter(n => Math.abs(n.totalAmount) >= 0.01)
      .map(n => ({
        ...n,
        plChildren: filterNonZero(n.plChildren),
      }));
  }

  return filterNonZero(roots);
}

// Flatten tree structure recursively for Excel export
function flattenPLTreeForExcel(nodes: PLGroupTreeNode[], rows: any[][]) {
  for (const node of nodes) {
    const indent = '  '.repeat(node.depth);
    rows.push([
      '',
      `${indent}${node.name}`,
      'Group',
      node.totalAmount,
    ]);

    for (const child of node.plChildren) {
      flattenPLTreeForExcel([child], rows);
    }

    for (const acc of node.accounts) {
      const accIndent = '  '.repeat(node.depth + 1);
      rows.push([
        acc.account_code,
        `${accIndent}${acc.account_name}`,
        acc.account_group,
        acc.amount,
      ]);
    }
  }
}

// Tree Row Component
interface PLRowProps {
  node: PLGroupTreeNode;
  onDrilldown: (acc: PLAccount) => void;
  expandedGroups: Set<string>;
  toggleExpand: (groupName: string) => void;
  money: (val: number) => string;
}

function PLTRow({ node, onDrilldown, expandedGroups, toggleExpand, money }: PLRowProps) {
  const isExpanded = expandedGroups.has(node.name);
  const hasSubItems = node.plChildren.length > 0 || node.accounts.length > 0;

  return (
    <>
      <tr
        className={cn(
          'border-b transition-colors cursor-pointer select-none',
          node.depth === 0 ? 'bg-muted/40 font-semibold text-foreground' : 'hover:bg-muted/30 text-foreground'
        )}
        onClick={() => toggleExpand(node.name)}
      >
        <td className="p-2 text-sm">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: `${node.depth * 14}px` }}>
            {hasSubItems ? (
              <span className="shrink-0 text-muted-foreground">
                {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
              </span>
            ) : (
              <span className="w-[14px] shrink-0" />
            )}

            <span className="shrink-0 text-muted-foreground">
              {isExpanded ? <IconFolderFilled size={14} /> : <IconFolder size={14} />}
            </span>

            <span className={cn('truncate', node.depth === 0 ? 'font-semibold' : 'font-medium')}>
              {node.name}
            </span>
          </div>
        </td>
        <td className="p-2 text-right font-mono text-sm font-semibold">
          {money(node.totalAmount)}
        </td>
      </tr>

      {isExpanded && (
        <>
          {node.plChildren.map(child => (
            <PLTRow
              key={child.id}
              node={child}
              onDrilldown={onDrilldown}
              expandedGroups={expandedGroups}
              toggleExpand={toggleExpand}
              money={money}
            />
          ))}

          {node.accounts.map(acc => (
            <tr
              key={acc.id}
              className="border-b hover:bg-primary/5 transition-colors group cursor-pointer"
              onClick={() => onDrilldown(acc)}
            >
              <td className="p-1.5 pl-4 text-sm">
                <div
                  className="flex items-center justify-between gap-2"
                  style={{ paddingLeft: `${(node.depth + 1) * 14 + 8}px` }}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-xs text-muted-foreground">{acc.account_code}</span>
                    <span className="font-medium text-foreground group-hover:text-primary transition-colors text-xs">
                      {acc.account_name}
                    </span>
                  </div>
                  <span className="opacity-0 group-hover:opacity-100 text-[11px] text-primary flex items-center gap-0.5 shrink-0 transition-opacity">
                    Ledger <IconExternalLink size={10} />
                  </span>
                </div>
              </td>
              <td className="p-1.5 text-right font-mono text-xs text-foreground/90">
                {money(acc.amount)}
              </td>
            </tr>
          ))}
        </>
      )}
    </>
  );
}

export default function ProfitLossPage() {
  const dispatch = useDispatch();
  const companyProfile = useSelector((state: RootState) => state.companyProfile.profile);
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'horizontal' | 'vertical'>('horizontal');
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setMonth(0);
    date.setDate(1);
    return date.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const money = useMoney();

  const loadReport = async () => {
    try {
      setLoading(true);
      const result = await invoke<ProfitLossData>('get_profit_loss', {
        fromDate,
        toDate,
      });
      setData(result);

      if (result.groups) {
        setExpandedGroups(new Set(result.groups.map(g => g.name)));
      }
    } catch (error) {
      toast.error('Failed to load profit & loss statement');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  const incomeTree = useMemo(() => {
    if (!data) return [];
    return buildPLTree(data.groups, data.income, 'Income');
  }, [data]);

  const expenseTree = useMemo(() => {
    if (!data) return [];
    return buildPLTree(data.groups, data.expenses, 'Expense');
  }, [data]);

  const directExpenseTree = useMemo(() => {
    if (!data) return [];
    return buildPLTree(data.groups, data.direct_expenses || [], 'Expense');
  }, [data]);

  const toggleExpand = useCallback((groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }, []);

  const expandAll = () => {
    if (data?.groups) {
      setExpandedGroups(new Set(data.groups.map(g => g.name)));
    }
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  const handleDrilldown = (acc: PLAccount) => {
    dispatch(setLedgerReportSelectedAccount(acc.id as any));
    dispatch(
      setActiveSectionWithParams({
        section: 'ledger',
        params: { accountId: acc.id },
      })
    );
  };

  const handlePrint = async () => {
    if (!data) {
      toast.error('No profit & loss data to print');
      return;
    }

    try {
      const companyName = companyProfile?.company_name || 'Company';
      const fileName = `Profit_and_Loss_${fromDate}_to_${toDate}.pdf`;
      const downloadsPath = await invoke<string>('get_downloads_path');
      const filePath = `${downloadsPath}/${fileName}`;

      const pdfData = {
        company_name: companyName,
        period_from: formatDate(fromDate),
        period_to: formatDate(toDate),
        opening_stock: data.opening_stock,
        purchases: data.purchases,
        closing_stock: data.closing_stock,
        cogs: data.cogs,
        total_income: data.total_income,
        total_expenses: data.total_expenses,
        gross_profit: data.gross_profit,
        net_profit: data.net_profit,
        currency_symbol: companyProfile?.base_currency_symbol || '',
        income_items: data.income.map(i => ({
          account_code: i.account_code,
          account_name: i.account_name,
          account_group: i.account_group,
          amount: i.amount,
        })),
        expense_items: data.expenses.map(e => ({
          account_code: e.account_code,
          account_name: e.account_name,
          account_group: e.account_group,
          amount: e.amount,
        })),
      };

      await invoke('generate_profit_loss_pdf', {
        data: pdfData,
        filePath,
      });

      toast.success(`PDF generated at: ${filePath}`);
    } catch (error) {
      toast.error('Failed to generate PDF');
      console.error(error);
    }
  };

  const handleExport = () => {
    if (!data) {
      toast.error('No profit & loss data to export');
      return;
    }

    try {
      const companyName = companyProfile?.company_name || 'Company';
      const reportTitle = `${companyName} - Profit & Loss Account`;
      const periodTitle = `Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`;

      const rows: any[][] = [];

      // Title block
      rows.push([reportTitle]);
      rows.push([periodTitle]);
      rows.push([]);

      // 1. TRADING ACCOUNT SECTION
      rows.push(['TRADING ACCOUNT']);
      rows.push(['Particulars (Debit / Expenses)', 'Amount', 'Particulars (Credit / Income)', 'Amount']);
      rows.push(['Opening Stock', data.opening_stock, 'Sales Accounts (Revenue)', data.total_income]);
      rows.push(['Purchase Accounts', data.purchases, 'Closing Stock', data.closing_stock]);

      if (data.gross_profit >= 0) {
        rows.push(['Gross Profit c/o', data.gross_profit, '', '']);
      } else {
        rows.push(['', '', 'Gross Loss c/o', Math.abs(data.gross_profit)]);
      }

      const tradingDebitTotal = round2(data.opening_stock + data.purchases + (data.gross_profit >= 0 ? data.gross_profit : 0));
      const tradingCreditTotal = round2(data.total_income + data.closing_stock + (data.gross_profit < 0 ? Math.abs(data.gross_profit) : 0));
      rows.push(['Total Trading Debit', tradingDebitTotal, 'Total Trading Credit', tradingCreditTotal]);
      rows.push([]);

      // 2. PROFIT & LOSS ACCOUNT SECTION
      const operatingExpensesTotal = round2(data.total_expenses - data.cogs);
      rows.push(['PROFIT & LOSS ACCOUNT']);
      rows.push(['Particulars (Debit / Expenses)', 'Amount', 'Particulars (Credit / Income)', 'Amount']);

      if (data.gross_profit >= 0) {
        rows.push(['Indirect Expenses', operatingExpensesTotal, 'Gross Profit b/f', data.gross_profit]);
      } else {
        rows.push(['Gross Loss b/f', Math.abs(data.gross_profit), 'Indirect Incomes', 0]);
        rows.push(['Indirect Expenses', operatingExpensesTotal, '', '']);
      }

      if (data.net_profit >= 0) {
        rows.push(['Net Profit', data.net_profit, '', '']);
      } else {
        rows.push(['', '', 'Net Loss', Math.abs(data.net_profit)]);
      }

      const plDebitTotal = round2((data.gross_profit < 0 ? Math.abs(data.gross_profit) : 0) + operatingExpensesTotal + (data.net_profit >= 0 ? data.net_profit : 0));
      const plCreditTotal = round2((data.gross_profit >= 0 ? data.gross_profit : 0) + (data.net_profit < 0 ? Math.abs(data.net_profit) : 0));
      rows.push(['Total P&L Debit', plDebitTotal, 'Total P&L Credit', plCreditTotal]);
      rows.push([]);

      // 3. DETAILED TREES FOR OPERATING EXPENSES & INCOMES
      rows.push(['DETAILED OPERATING EXPENSES']);
      rows.push(['Account Code', 'Particulars', 'Type / Group', 'Amount']);
      flattenPLTreeForExcel(expenseTree, rows);
      rows.push([]);

      rows.push(['DETAILED REVENUE / INCOME']);
      rows.push(['Account Code', 'Particulars', 'Type / Group', 'Amount']);
      flattenPLTreeForExcel(incomeTree, rows);

      // Sheet 1: Structured P&L
      const wsPL = XLSX.utils.aoa_to_sheet(rows);
      wsPL['!cols'] = [
        { wch: 35 },
        { wch: 18 },
        { wch: 35 },
        { wch: 18 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsPL, 'Profit & Loss');

      const fileName = `Profit_and_Loss_${fromDate}_to_${toDate}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast.success(`Profit & Loss exported as ${fileName}`);
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export Profit & Loss statement to Excel');
    }
  };

  const operatingExpensesTotal = data ? round2(data.total_expenses - data.cogs) : 0;

  // Trading account totals for horizontal T-account view
  const tradingDebitTotal = data ? round2(data.opening_stock + data.purchases + (data.gross_profit >= 0 ? data.gross_profit : 0)) : 0;
  const tradingCreditTotal = data ? round2(data.total_income + data.closing_stock + (data.gross_profit < 0 ? Math.abs(data.gross_profit) : 0)) : 0;

  // P&L account totals for horizontal T-account view
  const plDebitTotal = data ? round2((data.gross_profit < 0 ? Math.abs(data.gross_profit) : 0) + operatingExpensesTotal + (data.net_profit >= 0 ? data.net_profit : 0)) : 0;
  const plCreditTotal = data ? round2((data.gross_profit >= 0 ? data.gross_profit : 0) + (data.net_profit < 0 ? Math.abs(data.net_profit) : 0)) : 0;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Profit & Loss Statement</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Trading and Profit & Loss Account for the period
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex items-center bg-muted/60 p-0.5 rounded-md border mr-2">
              <Button
                variant={viewMode === 'horizontal' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2.5 gap-1.5"
                onClick={() => setViewMode('horizontal')}
              >
                <IconLayoutColumns size={14} /> Side-by-Side
              </Button>
              <Button
                variant={viewMode === 'vertical' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2.5 gap-1.5"
                onClick={() => setViewMode('vertical')}
              >
                <IconLayoutList size={14} /> Vertical
              </Button>
            </div>

            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={collapseAll}>
              Collapse All
            </Button>
            <Button variant="outline" size="sm" onClick={loadReport}>
              <IconRefresh size={16} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <IconDownload size={16} /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <IconPrinter size={16} /> Print
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
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">{companyProfile?.company_name || 'Company'}</h1>
            <h2 className="text-lg font-semibold text-muted-foreground">Profit & Loss Account</h2>
            <p className="text-sm text-muted-foreground mt-1">
              For the period: {formatDate(fromDate)} to {formatDate(toDate)}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading statement...</p>
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">No data available</p>
            </div>
          ) : viewMode === 'horizontal' ? (
            /* SIDE-BY-SIDE (HORIZONTAL T-ACCOUNT) VIEW */
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground print:hidden flex items-center gap-1.5">
                <span>💡 Side-by-Side View: Trading Account items top, Profit & Loss Account items bottom. Click on groups to expand or drill down.</span>
              </p>

              <Card className="overflow-hidden border shadow-sm">
                <CardContent className="p-0">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-muted/50 border-b text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                        <th className="p-2.5 text-left w-5/12 border-r">Particulars (Debit / Expenses)</th>
                        <th className="p-2.5 text-right w-2/12 border-r">Amount</th>
                        <th className="p-2.5 text-left w-5/12 border-r">Particulars (Credit / Income)</th>
                        <th className="p-2.5 text-right w-2/12">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {/* TRADING ACCOUNT SECTION HEADER */}
                      <tr className="bg-muted/30 font-bold text-xs text-foreground/80 border-b">
                        <td colSpan={2} className="p-2 pl-3 border-r tracking-wider uppercase">
                          Trading Account (Direct Expenses)
                        </td>
                        <td colSpan={2} className="p-2 pl-3 tracking-wider uppercase">
                          Trading Account (Direct Revenue)
                        </td>
                      </tr>

                      {/* TRADING ACCOUNT ITEMS */}
                      <tr>
                        {/* DEBIT SIDE */}
                        <td className="p-0 align-top border-r" colSpan={2}>
                          <table className="w-full">
                            <tbody>
                              <tr className="border-b hover:bg-muted/20">
                                <td className="p-2.5 font-medium">Opening Stock</td>
                                <td className="p-2.5 text-right font-mono font-semibold">{money(data.opening_stock)}</td>
                              </tr>
                              <tr className="border-b hover:bg-muted/20">
                                <td className="p-2.5 font-medium">Purchase Accounts</td>
                                <td className="p-2.5 text-right font-mono font-semibold">{money(data.purchases)}</td>
                              </tr>
                              {directExpenseTree.map(root => (
                                <PLTRow
                                  key={`trading-exp-${root.id}`}
                                  node={root}
                                  onDrilldown={handleDrilldown}
                                  expandedGroups={expandedGroups}
                                  toggleExpand={toggleExpand}
                                  money={money}
                                />
                              ))}
                              {data.gross_profit >= 0 && (
                                <tr className="border-b font-semibold hover:bg-muted/20">
                                  <td className="p-2.5">Gross Profit c/o</td>
                                  <td className="p-2.5 text-right font-mono">{money(data.gross_profit)}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </td>

                        {/* CREDIT SIDE */}
                        <td className="p-0 align-top" colSpan={2}>
                          <table className="w-full">
                            <tbody>
                              {/* Income tree items (Sales) */}
                              {incomeTree.map(root => (
                                <PLTRow
                                  key={`trading-inc-${root.id}`}
                                  node={root}
                                  onDrilldown={handleDrilldown}
                                  expandedGroups={expandedGroups}
                                  toggleExpand={toggleExpand}
                                  money={money}
                                />
                              ))}
                              {incomeTree.length === 0 && (
                                <tr className="border-b hover:bg-muted/20">
                                  <td className="p-2.5 font-medium">Sales Accounts</td>
                                  <td className="p-2.5 text-right font-mono font-semibold">{money(data.total_income)}</td>
                                </tr>
                              )}
                              <tr className="border-b hover:bg-muted/20">
                                <td className="p-2.5 font-medium">Closing Stock</td>
                                <td className="p-2.5 text-right font-mono font-semibold">
                                  {money(data.closing_stock)}
                                </td>
                              </tr>
                              {data.gross_profit < 0 && (
                                <tr className="border-b font-semibold hover:bg-muted/20">
                                  <td className="p-2.5">Gross Loss c/o</td>
                                  <td className="p-2.5 text-right font-mono">{money(Math.abs(data.gross_profit))}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </td>
                      </tr>

                      {/* TRADING ACCOUNT TOTAL ROW */}
                      <tr className="bg-muted/40 font-bold text-sm border-t-2 border-b-2">
                        <td className="p-2.5 text-left border-r">Total Trading Expenses</td>
                        <td className="p-2.5 text-right font-mono border-r">{money(tradingDebitTotal)}</td>
                        <td className="p-2.5 text-left border-r">Total Trading Income</td>
                        <td className="p-2.5 text-right font-mono">{money(tradingCreditTotal)}</td>
                      </tr>

                      {/* PROFIT & LOSS ACCOUNT SECTION HEADER */}
                      <tr className="bg-muted/30 font-bold text-xs text-foreground/80 border-b">
                        <td colSpan={2} className="p-2 pl-3 border-r tracking-wider uppercase">
                          Profit & Loss Account (Indirect Expenses)
                        </td>
                        <td colSpan={2} className="p-2 pl-3 tracking-wider uppercase">
                          Profit & Loss Account (Indirect Income)
                        </td>
                      </tr>

                      {/* PROFIT & LOSS ITEMS */}
                      <tr>
                        {/* DEBIT SIDE (PL) */}
                        <td className="p-0 align-top border-r" colSpan={2}>
                          <table className="w-full">
                            <tbody>
                              {data.gross_profit < 0 && (
                                <tr className="border-b font-semibold hover:bg-muted/20">
                                  <td className="p-2.5">Gross Loss b/f</td>
                                  <td className="p-2.5 text-right font-mono">{money(Math.abs(data.gross_profit))}</td>
                                </tr>
                              )}

                              {/* Indirect Operating Expense Tree */}
                              {expenseTree.map(root => (
                                <PLTRow
                                  key={`pl-exp-${root.id}`}
                                  node={root}
                                  onDrilldown={handleDrilldown}
                                  expandedGroups={expandedGroups}
                                  toggleExpand={toggleExpand}
                                  money={money}
                                />
                              ))}

                              {expenseTree.length === 0 && (
                                <tr className="border-b hover:bg-muted/20">
                                  <td className="p-2.5 font-medium text-muted-foreground">Indirect Expenses</td>
                                  <td className="p-2.5 text-right font-mono">{money(operatingExpensesTotal)}</td>
                                </tr>
                              )}

                              {data.net_profit >= 0 && (
                                <tr className="bg-muted/20 font-bold border-t">
                                  <td className="p-3 text-base">Net Profit</td>
                                  <td className="p-3 text-right font-mono text-base">{money(data.net_profit)}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </td>

                        {/* CREDIT SIDE (PL) */}
                        <td className="p-0 align-top" colSpan={2}>
                          <table className="w-full">
                            <tbody>
                              {data.gross_profit >= 0 && (
                                <tr className="border-b font-semibold hover:bg-muted/20">
                                  <td className="p-2.5">Gross Profit b/f</td>
                                  <td className="p-2.5 text-right font-mono">{money(data.gross_profit)}</td>
                                </tr>
                              )}

                              {data.net_profit < 0 && (
                                <tr className="bg-muted/20 font-bold border-t">
                                  <td className="p-3 text-base">Net Loss</td>
                                  <td className="p-3 text-right font-mono text-base">{money(Math.abs(data.net_profit))}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </td>
                      </tr>

                      {/* PROFIT & LOSS ACCOUNT TOTAL ROW */}
                      <tr className="bg-muted/60 font-bold text-sm border-t-2">
                        <td className="p-3 text-left border-r">Total</td>
                        <td className="p-3 text-right font-mono border-r">{money(plDebitTotal)}</td>
                        <td className="p-3 text-left border-r">Total</td>
                        <td className="p-3 text-right font-mono">{money(plCreditTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          ) : (
            /* VERTICAL STATEMENT VIEW */
            <div className="space-y-6">
              {/* Trading Account Card */}
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="bg-blue-500/10 border-b p-3 flex justify-between items-center">
                    <h2 className="font-bold text-base text-blue-700 dark:text-blue-300">1. Trading Account</h2>
                    <span className="font-mono font-bold text-sm text-blue-700 dark:text-blue-300">
                      Gross Profit: {money(data.gross_profit)}
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      <tr className="hover:bg-muted/20">
                        <td className="p-3 font-medium">Opening Stock</td>
                        <td className="p-3 text-right font-mono font-semibold">{money(data.opening_stock)}</td>
                      </tr>
                      <tr className="hover:bg-muted/20">
                        <td className="p-3 font-medium">Add: Purchases & Direct Expenses</td>
                        <td className="p-3 text-right font-mono font-semibold">{money(data.purchases)}</td>
                      </tr>
                      <tr className="hover:bg-muted/20 text-blue-600 dark:text-blue-400">
                        <td className="p-3 font-medium">Less: Closing Stock</td>
                        <td className="p-3 text-right font-mono font-semibold">−{money(data.closing_stock)}</td>
                      </tr>
                      <tr className="bg-muted/40 font-semibold border-t">
                        <td className="p-3">Cost of Goods Sold (COGS)</td>
                        <td className="p-3 text-right font-mono font-bold text-red-600">{money(data.cogs)}</td>
                      </tr>
                      <tr className="hover:bg-muted/20">
                        <td className="p-3 font-medium">Revenue from Operations (Sales)</td>
                        <td className="p-3 text-right font-mono font-semibold text-emerald-600">{money(data.total_income)}</td>
                      </tr>
                    </tbody>
                    <tfoot className="bg-muted/50 border-t-2">
                      <tr className="font-bold text-base">
                        <td className="p-3.5">Gross Profit</td>
                        <td className={cn('p-3.5 text-right font-mono', data.gross_profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                          {money(data.gross_profit)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Operating Expenses & Net Profit */}
              <div className="grid md:grid-cols-2 gap-6 items-start">
                {/* Revenue & Income */}
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="bg-emerald-500/10 border-b p-3 flex justify-between items-center">
                      <h2 className="font-bold text-base text-emerald-700 dark:text-emerald-300">Income (Revenue)</h2>
                      <span className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-300">
                        {money(data.total_income)}
                      </span>
                    </div>
                    <table className="w-full">
                      <thead className="bg-muted/30 border-b">
                        <tr>
                          <th className="p-2.5 text-left text-xs font-semibold">Group / Account</th>
                          <th className="p-2.5 text-right text-xs font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incomeTree.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                              No income accounts recorded
                            </td>
                          </tr>
                        ) : (
                          incomeTree.map(root => (
                            <PLTRow
                              key={root.id}
                              node={root}
                              onDrilldown={handleDrilldown}
                              expandedGroups={expandedGroups}
                              toggleExpand={toggleExpand}
                              money={money}
                            />
                          ))
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Operating Expenses */}
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="bg-red-500/10 border-b p-3 flex justify-between items-center">
                      <h2 className="font-bold text-base text-red-700 dark:text-red-300">Operating Expenses</h2>
                      <span className="font-mono font-bold text-sm text-red-700 dark:text-red-300">
                        {money(operatingExpensesTotal)}
                      </span>
                    </div>
                    <table className="w-full">
                      <thead className="bg-muted/30 border-b">
                        <tr>
                          <th className="p-2.5 text-left text-xs font-semibold">Group / Account</th>
                          <th className="p-2.5 text-right text-xs font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenseTree.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                              No operating expense accounts recorded
                            </td>
                          </tr>
                        ) : (
                          expenseTree.map(root => (
                            <PLTRow
                              key={root.id}
                              node={root}
                              onDrilldown={handleDrilldown}
                              expandedGroups={expandedGroups}
                              toggleExpand={toggleExpand}
                              money={money}
                            />
                          ))
                        )}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                {/* Net Profit Summary Card */}
                <Card className="md:col-span-2">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-bold">
                          {data.net_profit >= 0 ? 'Net Profit' : 'Net Loss'}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          Gross Profit ({money(data.gross_profit)}) − Indirect Operating Expenses ({money(operatingExpensesTotal)})
                        </p>
                      </div>
                      <div className={cn(
                        'text-3xl font-bold font-mono',
                        data.net_profit >= 0 ? 'text-emerald-600' : 'text-red-600'
                      )}>
                        {money(Math.abs(data.net_profit))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
