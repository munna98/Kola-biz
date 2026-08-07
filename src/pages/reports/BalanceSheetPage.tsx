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

interface BSAccount {
  id: string;
  account_name: string;
  account_code: string;
  account_group: string;
  amount: number;
}

interface BalanceSheetData {
  groups: AccountGroup[];
  assets: BSAccount[];
  liabilities: BSAccount[];
  equity: BSAccount[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
}

// Tree Node Structure for Report Rendering
interface BSGroupTreeNode extends AccountGroupNode {
  accounts: BSAccount[];
  totalAmount: number;
  bsChildren: BSGroupTreeNode[];
}

function buildBSTRree(
  allGroups: AccountGroup[],
  accounts: BSAccount[],
  sectionType: string // "Asset", "Liability", "Equity"
): BSGroupTreeNode[] {
  // Filter groups belonging to section
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

  // Map accounts to group name
  const accountsByGroup = new Map<string, BSAccount[]>();
  for (const acc of accounts) {
    const list = accountsByGroup.get(acc.account_group) || [];
    list.push(acc);
    accountsByGroup.set(acc.account_group, list);
  }

  // Create node map
  const nodeMap = new Map<string, BSGroupTreeNode>();
  for (const g of sectionGroups) {
    nodeMap.set(g.name, {
      ...g,
      children: [],
      depth: 0,
      accounts: accountsByGroup.get(g.name) || [],
      totalAmount: 0,
      bsChildren: [],
    });
  }

  // Also handle accounts whose group isn't in group table (fallback orphan group)
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
        bsChildren: [],
      });
    }
  }

  // Link children & calculate rolled up totals
  const roots: BSGroupTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (!node.parent_group_id) {
      roots.push(node);
    } else {
      const parent = allGroups.find(g => g.id === node.parent_group_id);
      if (parent && nodeMap.has(parent.name)) {
        nodeMap.get(parent.name)!.bsChildren.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  // Recursive depth and total calculation
  function calculateTotals(node: BSGroupTreeNode, depth: number): number {
    node.depth = depth;
    let sum = node.accounts.reduce((s, a) => s + a.amount, 0);
    for (const child of node.bsChildren) {
      sum += calculateTotals(child, depth + 1);
    }
    node.totalAmount = sum;
    return sum;
  }

  for (const root of roots) {
    calculateTotals(root, 0);
  }

  // Filter out zero-amount groups
  function filterNonZero(nodes: BSGroupTreeNode[]): BSGroupTreeNode[] {
    return nodes
      .filter(n => Math.abs(n.totalAmount) >= 0.01)
      .map(n => ({
        ...n,
        bsChildren: filterNonZero(n.bsChildren),
      }));
  }

  return filterNonZero(roots);
}

// Tree Row Component
interface BSRowProps {
  node: BSGroupTreeNode;
  onDrilldown: (acc: BSAccount) => void;
  expandedGroups: Set<string>;
  toggleExpand: (groupName: string) => void;
  money: (val: number) => string;
}

function BSTRow({ node, onDrilldown, expandedGroups, toggleExpand, money }: BSRowProps) {
  const isExpanded = expandedGroups.has(node.name);
  const hasSubItems = node.bsChildren.length > 0 || node.accounts.length > 0;

  return (
    <>
      {/* Group Header Row */}
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

      {/* Expanded Contents */}
      {isExpanded && (
        <>
          {/* Sub-groups */}
          {node.bsChildren.map(child => (
            <BSTRow
              key={child.id}
              node={child}
              onDrilldown={onDrilldown}
              expandedGroups={expandedGroups}
              toggleExpand={toggleExpand}
              money={money}
            />
          ))}

          {/* Direct Ledgers inside this group */}
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
                  {acc.id !== 'NET_PROFIT' && (
                    <span className="opacity-0 group-hover:opacity-100 text-xs text-primary flex items-center gap-0.5 shrink-0 transition-opacity">
                      Ledger <IconExternalLink size={12} />
                    </span>
                  )}
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

export default function BalanceSheetPage() {
  const dispatch = useDispatch();
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [asOnDate, setAsOnDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const money = useMoney();

  const loadReport = async () => {
    try {
      setLoading(true);
      const result = await invoke<BalanceSheetData>('get_balance_sheet', {
        asOnDate,
      });
      setData(result);

      // Default expand all group names
      if (result.groups) {
        setExpandedGroups(new Set(result.groups.map(g => g.name)));
      }
    } catch (error) {
      toast.error('Failed to load balance sheet');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  // Build trees for Assets, Liabilities, and Equity
  const assetTree = useMemo(() => {
    if (!data) return [];
    return buildBSTRree(data.groups, data.assets, 'Asset');
  }, [data]);

  const liabilityTree = useMemo(() => {
    if (!data) return [];
    return buildBSTRree(data.groups, data.liabilities, 'Liability');
  }, [data]);

  const equityTree = useMemo(() => {
    if (!data) return [];
    return buildBSTRree(data.groups, data.equity, 'Equity');
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

  // Drilldown to Ledger Report
  const handleDrilldown = (acc: BSAccount) => {
    if (acc.id === 'NET_PROFIT') {
      toast.info('Net Profit is derived from Income and Expense accounts for the period.');
      return;
    }
    dispatch(setLedgerReportSelectedAccount(acc.id as any));
    dispatch(
      setActiveSectionWithParams({
        section: 'ledger_report',
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

  const totalLiabilitiesAndEquity = data ? data.total_liabilities + data.total_equity : 0;
  const isBalanced = data ? Math.abs(data.total_assets - totalLiabilitiesAndEquity) < 0.01 : false;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Balance Sheet</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Hierarchical drillable financial position snapshot
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
            <Label className="text-xs mb-1 block">As On Date</Label>
            <Input
              type="date"
              value={asOnDate}
              onChange={(e) => setAsOnDate(e.target.value)}
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
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">Balance Sheet</h1>
            <p className="text-sm text-muted-foreground mt-1">
              As on {formatDate(asOnDate)}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading balance sheet...</p>
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
                {/* ---- Left Column: Assets ---- */}
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="bg-blue-500/10 border-b p-3 flex justify-between items-center">
                      <h2 className="font-bold text-base text-blue-700 dark:text-blue-300">Assets</h2>
                      <span className="font-mono font-bold text-sm text-blue-700 dark:text-blue-300">
                        {money(data.total_assets)}
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
                        {assetTree.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                              No asset accounts recorded
                            </td>
                          </tr>
                        ) : (
                          assetTree.map(root => (
                            <BSTRow
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
                          <td className="p-3 font-bold text-sm">Total Assets</td>
                          <td className="p-3 text-right font-mono font-bold text-sm">
                            {money(data.total_assets)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>

                {/* ---- Right Column: Liabilities & Equity ---- */}
                <div className="space-y-6">
                  {/* Liabilities */}
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="bg-orange-500/10 border-b p-3 flex justify-between items-center">
                        <h2 className="font-bold text-base text-orange-700 dark:text-orange-300">Liabilities</h2>
                        <span className="font-mono font-bold text-sm text-orange-700 dark:text-orange-300">
                          {money(data.total_liabilities)}
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
                          {liabilityTree.length === 0 ? (
                            <tr>
                              <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                                No liability accounts recorded
                              </td>
                            </tr>
                          ) : (
                            liabilityTree.map(root => (
                              <BSTRow
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
                            <td className="p-3 font-bold text-sm">Total Liabilities</td>
                            <td className="p-3 text-right font-mono font-bold text-sm">
                              {money(data.total_liabilities)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </CardContent>
                  </Card>

                  {/* Equity */}
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="bg-purple-500/10 border-b p-3 flex justify-between items-center">
                        <h2 className="font-bold text-base text-purple-700 dark:text-purple-300">Capital & Equity</h2>
                        <span className="font-mono font-bold text-sm text-purple-700 dark:text-purple-300">
                          {money(data.total_equity)}
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
                          {equityTree.length === 0 ? (
                            <tr>
                              <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                                No equity accounts recorded
                              </td>
                            </tr>
                          ) : (
                            equityTree.map(root => (
                              <BSTRow
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
                            <td className="p-3 font-bold text-sm">Total Capital & Equity</td>
                            <td className="p-3 text-right font-mono font-bold text-sm">
                              {money(data.total_equity)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Balance Verification Footer */}
              <Card className="bg-muted/10 border-dashed">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold">Total Liabilities + Capital/Equity</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Must equal Total Assets for a balanced sheet
                      </p>
                    </div>
                    <div className="text-3xl font-bold font-mono">
                      {money(totalLiabilitiesAndEquity)}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3 p-3 rounded-lg border bg-background">
                    {isBalanced ? (
                      <div className="flex items-center gap-2 text-foreground/80">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="font-semibold text-sm">Balance Sheet is Balanced</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-foreground/80">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="font-semibold text-sm">Balance Sheet is NOT Balanced</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          (Difference: {money(Math.abs(data.total_assets - totalLiabilitiesAndEquity))})
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
