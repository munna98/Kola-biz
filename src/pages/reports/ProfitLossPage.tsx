import { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  IconDownload, IconPrinter, IconRefresh, IconChevronDown,
  IconChevronRight, IconFolder, IconFolderFilled, IconExternalLink
} from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useMoney } from '@/hooks/useMoney';
import { AccountGroup, AccountGroupNode } from '@/lib/tauri';
import { useDispatch } from 'react-redux';
import { setLedgerReportSelectedAccount, setActiveSectionWithParams } from '@/store';
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
  total_income: number;
  total_expenses: number;
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
        <td className="p-2.5 text-sm">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: `${node.depth * 16}px` }}>
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

            <span className={cn('truncate', node.depth === 0 ? 'font-bold' : 'font-medium')}>
              {node.name}
            </span>
          </div>
        </td>
        <td className="p-2.5 text-right font-mono text-sm font-semibold">
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
              <td className="p-2 pl-4 text-sm">
                <div
                  className="flex items-center justify-between gap-2"
                  style={{ paddingLeft: `${(node.depth + 1) * 16 + 10}px` }}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-xs text-muted-foreground">{acc.account_code}</span>
                    <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {acc.account_name}
                    </span>
                  </div>
                  <span className="opacity-0 group-hover:opacity-100 text-xs text-primary flex items-center gap-0.5 shrink-0 transition-opacity">
                    Ledger <IconExternalLink size={12} />
                  </span>
                </div>
              </td>
              <td className="p-2 text-right font-mono text-sm text-foreground/90">
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
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [loading, setLoading] = useState(false);
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

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    toast.info('Export functionality coming soon');
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Profit & Loss Statement</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Hierarchical drillable income and expense summary
            </p>
          </div>
          <div className="flex gap-2 items-center">
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
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">Profit & Loss Statement</h1>
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
          ) : (
            <>
              {/* Guidance Tip */}
              <p className="text-xs text-muted-foreground print:hidden flex items-center gap-1.5">
                <span>💡 Click on any group to expand/collapse. Click on any ledger to drill down to its detailed Ledger Report.</span>
              </p>

              <div className="grid md:grid-cols-2 gap-6 items-start">
                {/* Income Section */}
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="bg-green-500/10 border-b p-3 flex justify-between items-center">
                      <h2 className="font-bold text-base text-green-700 dark:text-green-300">Income</h2>
                      <span className="font-mono font-bold text-sm text-green-700 dark:text-green-300">
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
                      <tfoot className="bg-muted/30 border-t-2">
                        <tr>
                          <td className="p-3 font-bold text-sm">Total Income</td>
                          <td className="p-3 text-right font-mono font-bold text-sm text-green-600">
                            {money(data.total_income)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>

                {/* Expenses Section */}
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="bg-red-500/10 border-b p-3 flex justify-between items-center">
                      <h2 className="font-bold text-base text-red-700 dark:text-red-300">Expenses</h2>
                      <span className="font-mono font-bold text-sm text-red-700 dark:text-red-300">
                        {money(data.total_expenses)}
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
                              No expense accounts recorded
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
                      <tfoot className="bg-muted/30 border-t-2">
                        <tr>
                          <td className="p-3 font-bold text-sm">Total Expenses</td>
                          <td className="p-3 text-right font-mono font-bold text-sm text-red-600">
                            {money(data.total_expenses)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>

                {/* Net Profit / Loss */}
                <Card className="md:col-span-2">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-bold">
                          {data.net_profit >= 0 ? 'Net Profit' : 'Net Loss'}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          Total Income ({money(data.total_income)}) − Total Expenses ({money(data.total_expenses)})
                        </p>
                      </div>
                      <div className={cn(
                        'text-3xl font-bold font-mono',
                        data.net_profit >= 0 ? 'text-green-600' : 'text-red-600'
                      )}>
                        {money(Math.abs(data.net_profit))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
