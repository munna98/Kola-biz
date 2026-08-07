import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  IconPlus, IconEdit, IconTrash, IconSettings, IconRefresh,
  IconTrashFilled, IconRecycle, IconHome2, IconSearch,
  IconChevronRight, IconChevronDown, IconFolderFilled, IconFolder, IconListTree
} from '@tabler/icons-react';
import { api, ChartOfAccount, AccountGroup, AccountGroupNode, buildAccountGroupTree, flattenGroupTree } from '@/lib/tauri';
import { toast } from 'sonner';
import AccountGroupsDialog from '@/components/dialogs/AccountGroupsDialog';
import ChartOfAccountDialog from '@/components/dialogs/ChartOfAccountDialog';
import { useMoney } from '@/hooks/useMoney';
import { cn } from '@/lib/utils';

// ---- Sidebar Group Tree Node ----
interface SidebarNodeProps {
  node: AccountGroupNode;
  selectedGroup: string | null;
  onSelect: (name: string | null) => void;
  ledgerCountByGroup: Record<string, number>;
}

function SidebarNode({ node, selectedGroup, onSelect, ledgerCountByGroup }: SidebarNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  // Count ledgers in this group AND all descendants
  const countDescendants = useCallback((n: AccountGroupNode): number => {
    return (ledgerCountByGroup[n.name] || 0) +
      n.children.reduce((sum, c) => sum + countDescendants(c), 0);
  }, [ledgerCountByGroup]);

  const totalCount = countDescendants(node);
  const isSelected = selectedGroup === node.name;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-[5px] rounded-md cursor-pointer group text-sm transition-colors select-none',
          isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50 text-foreground'
        )}
        style={{ paddingLeft: `${node.depth * 14 + 8}px` }}
        onClick={() => onSelect(isSelected ? null : node.name)}
      >
        {hasChildren ? (
          <button
            className="shrink-0 text-muted-foreground"
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          >
            {expanded ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-[13px] shrink-0" />
        )}

        <span className="shrink-0 text-muted-foreground">
          {hasChildren
            ? (expanded ? <IconFolderFilled size={13} /> : <IconFolder size={13} />)
            : <IconFolder size={13} />}
        </span>

        <span className="flex-1 truncate text-xs">{node.name}</span>

        {totalCount > 0 && (
          <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
            {totalCount}
          </span>
        )}
      </div>

      {hasChildren && expanded && (
        <div>
          {node.children.map(child => (
            <SidebarNode
              key={child.id}
              node={child}
              selectedGroup={selectedGroup}
              onSelect={onSelect}
              ledgerCountByGroup={ledgerCountByGroup}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Main Page ----
export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [treeRoots, setTreeRoots] = useState<AccountGroupNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [groupsDialogOpen, setGroupsDialogOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<ChartOfAccount | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const money = useMoney();

  const load = async () => {
    try {
      setLoading(true);
      const [accountsData, groups] = await Promise.all([
        showDeleted ? api.chartOfAccounts.listDeleted() : api.chartOfAccounts.list(),
        api.accountGroups.getTree(),
      ]);
      setAccounts(accountsData);
      setAccountGroups(groups);
      const tree = buildAccountGroupTree(groups);
      setTreeRoots(tree);
    } catch (error) {
      toast.error('Failed to load chart of accounts');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [showDeleted]);

  // Count ledgers per group name
  const ledgerCountByGroup = useMemo(() => {
    const map: Record<string, number> = {};
    for (const acc of accounts) {
      if (!acc.deleted_at) {
        map[acc.account_group] = (map[acc.account_group] || 0) + 1;
      }
    }
    return map;
  }, [accounts]);

  // Get all descendant group names for filtering
  const getDescendantNames = useCallback((groupName: string): Set<string> => {
    const names = new Set<string>([groupName]);
    const flatList = flattenGroupTree(treeRoots);
    const node = flatList.find(n => n.name === groupName);
    if (node) {
      const addChildren = (n: AccountGroupNode) => {
        for (const c of n.children) {
          names.add(c.name);
          addChildren(c);
        }
      };
      addChildren(node);
    }
    return names;
  }, [treeRoots]);

  const filteredAccounts = useMemo(() => {
    let list = accounts;

    // Group filter (includes descendants)
    if (selectedGroup) {
      const groupNames = getDescendantNames(selectedGroup);
      list = list.filter(acc => groupNames.has(acc.account_group));
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(acc =>
        acc.account_code.toLowerCase().includes(term) ||
        acc.account_name.toLowerCase().includes(term) ||
        acc.account_group.toLowerCase().includes(term) ||
        (acc.description && acc.description.toLowerCase().includes(term))
      );
    }

    return list;
  }, [accounts, selectedGroup, searchTerm, getDescendantNames]);

  const handleEdit = (account: ChartOfAccount) => {
    setAccountToEdit(account);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Move this account to Recycle Bin?')) {
      try {
        await api.chartOfAccounts.delete(id);
        toast.success('Account moved to Recycle Bin');
        load();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : error?.toString() || 'Failed to delete account';
        toast.error(errorMessage);
      }
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await api.chartOfAccounts.restore(id);
      toast.success('Account restored successfully');
      load();
    } catch (error) {
      toast.error('Failed to restore account');
    }
  };

  const handleHardDelete = async (id: string) => {
    if (confirm('PERMANENTLY delete this account? This action cannot be undone.')) {
      try {
        await api.chartOfAccounts.hardDelete(id);
        toast.success('Account permanently deleted');
        load();
      } catch (error: any) {
        toast.error(error.toString() || 'Failed to permanently delete account');
      }
    }
  };

  const handleOpenDialog = () => {
    setAccountToEdit(null);
    setOpen(true);
  };

  // Type badge colors
  const typeColor: Record<string, string> = {
    Asset: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    Liability: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    Equity: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    Income: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    Expense: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ---- Top Bar ---- */}
      <div className="flex justify-between items-center gap-4 px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <IconListTree size={18} className="text-muted-foreground" />
          <h2 className="text-lg font-bold">
            {showDeleted ? 'Recycle Bin — Accounts' : 'Accounts / Ledgers'}
          </h2>
          {selectedGroup && !showDeleted && (
            <span className="text-sm text-muted-foreground">
              › <span className="font-medium text-foreground">{selectedGroup}</span>
              <button
                className="ml-1 text-muted-foreground hover:text-foreground underline text-xs"
                onClick={() => setSelectedGroup(null)}
              >
                (clear)
              </button>
            </span>
          )}
        </div>

        <div className="flex gap-2 items-center">
          <div className="relative">
            <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-52 h-8 pl-8 text-sm"
            />
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant='outline' size="sm" onClick={() => setShowDeleted(!showDeleted)}>
                  {showDeleted ? <IconHome2 size={15} /> : <IconRecycle size={15} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showDeleted ? 'View Active Accounts' : 'View Recycle Bin'}</TooltipContent>
            </Tooltip>

            {!showDeleted && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => setGroupsDialogOpen(true)}>
                      <IconSettings size={15} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Manage Groups</TooltipContent>
                </Tooltip>
                <Button size="sm" onClick={handleOpenDialog}>
                  <IconPlus size={15} /> Add Account
                </Button>
              </>
            )}
          </TooltipProvider>
        </div>
      </div>

      {/* ---- Two-Panel Body ---- */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Group Tree Sidebar */}
        {!showDeleted && (
          <div className="w-52 shrink-0 border-r overflow-y-auto p-2 bg-muted/10">
            {/* All accounts option */}
            <div
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors mb-1',
                !selectedGroup ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted/50 text-muted-foreground'
              )}
              onClick={() => setSelectedGroup(null)}
            >
              <IconListTree size={13} />
              <span>All Accounts</span>
              <span className="ml-auto text-[10px] bg-muted rounded-full px-1.5">{accounts.length}</span>
            </div>

            <div className="h-px bg-border mb-1" />

            {treeRoots.map(root => (
              <SidebarNode
                key={root.id}
                node={root}
                selectedGroup={selectedGroup}
                onSelect={setSelectedGroup}
                ledgerCountByGroup={ledgerCountByGroup}
              />
            ))}
          </div>
        )}

        {/* Right: Ledger Table */}
        <div className="flex-1 overflow-auto">
          <Card className="h-full rounded-none border-0">
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 sticky top-0 z-10">
                  <tr className="text-left">
                    <th className="p-3 w-10 text-muted-foreground font-medium">#</th>
                    <th className="p-3 font-medium">Code</th>
                    <th className="p-3 font-medium">Account Name</th>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium">Group</th>
                    <th className="p-3 font-medium">Description</th>
                    <th className="p-3 text-right font-medium">Opening Balance</th>
                    <th className="p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted-foreground">
                        {searchTerm
                          ? 'No accounts match your search.'
                          : selectedGroup
                            ? `No accounts in "${selectedGroup}".`
                            : 'No accounts found. Add your first account to get started.'}
                      </td>
                    </tr>
                  ) : (
                    filteredAccounts.map((account, index) => (
                      <tr key={account.id} className="border-b hover:bg-muted/20 transition-colors">
                        <td className="p-3 text-muted-foreground text-xs">{index + 1}</td>
                        <td className="p-3 font-mono text-xs font-medium">{account.account_code}</td>
                        <td className="p-3 font-medium">{account.account_name}</td>
                        <td className="p-3">
                          <span className={cn(
                            'px-2 py-0.5 rounded text-[11px] font-semibold',
                            typeColor[account.account_type] ?? 'bg-muted text-muted-foreground'
                          )}>
                            {account.account_type}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{account.account_group}</td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[180px] truncate">
                          {account.description || '—'}
                        </td>
                        <td className="p-3 text-right">
                          <span className="tabular-nums">{money(account.opening_balance)}</span>
                          {' '}
                          <span className={cn(
                            'text-[10px] font-bold',
                            account.opening_balance_type === 'Dr' ? 'text-blue-600' : 'text-orange-600'
                          )}>
                            {account.opening_balance_type}
                          </span>
                        </td>
                        <td className="p-3">
                          {!showDeleted ? (
                            <div className="flex gap-1">
                              <Button
                                size="sm" variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => handleEdit(account)}
                                title={account.is_system === 1 ? 'Edit System Account' : 'Edit Account'}
                              >
                                <IconEdit size={14} />
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className={cn(
                                  'h-7 w-7 p-0',
                                  account.is_system === 1 ? 'text-muted-foreground' : 'text-destructive hover:text-destructive'
                                )}
                                onClick={() => handleDelete(account.id)}
                                disabled={account.is_system === 1}
                                title={account.is_system === 1 ? 'System Account (Cannot Delete)' : 'Delete Account'}
                              >
                                <IconTrash size={14} />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700" onClick={() => handleRestore(account.id)}>
                                <IconRefresh size={14} />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleHardDelete(account.id)}>
                                <IconTrashFilled size={14} />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Account Dialog */}
      <ChartOfAccountDialog
        open={open}
        onOpenChange={setOpen}
        accountToEdit={accountToEdit}
        onSave={load}
        accountGroups={accountGroups}
      />

      {/* Account Groups Dialog */}
      <AccountGroupsDialog
        open={groupsDialogOpen}
        onOpenChange={setGroupsDialogOpen}
        onGroupsChanged={load}
      />
    </div>
  );
}
