import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { IconPlus, IconEdit, IconTrash, IconSettings, IconRefresh, IconTrashFilled, IconRecycle, IconHome2 } from '@tabler/icons-react';
import { api, ChartOfAccount, AccountGroup } from '@/lib/tauri';
import { toast } from 'sonner';
import AccountGroupsDialog from '@/components/dialogs/AccountGroupsDialog';
import ChartOfAccountDialog from '@/components/dialogs/ChartOfAccountDialog';

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [groupsDialogOpen, setGroupsDialogOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<ChartOfAccount | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [accountsData, groups] = await Promise.all([
        showDeleted ? api.chartOfAccounts.listDeleted() : api.chartOfAccounts.list(),
        api.accountGroups.list(),
      ]);
      setAccounts(accountsData);
      setAccountGroups(groups);
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

  const handleEdit = (account: ChartOfAccount) => {
    setAccountToEdit(account);
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Move this account to Recycle Bin?')) {
      try {
        await api.chartOfAccounts.delete(id);
        toast.success('Account moved to Recycle Bin');
        load();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : error?.toString() || 'Failed to delete account';
        toast.error(errorMessage);
        console.error(error);
      }
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await api.chartOfAccounts.restore(id);
      toast.success('Account restored successfully');
      load();
    } catch (error) {
      toast.error('Failed to restore account');
      console.error(error);
    }
  };

  const handleHardDelete = async (id: number) => {
    if (confirm('PERMANENTLY delete this account? This action cannot be undone.')) {
      try {
        await api.chartOfAccounts.hardDelete(id);
        toast.success('Account permanently deleted');
        load();
      } catch (error: any) {
        toast.error(error.toString() || 'Failed to permanently delete account');
        console.error(error);
      }
    }
  };

  const handleOpenDialog = () => {
    setAccountToEdit(null);
    setOpen(true);
  };

  const filteredAccounts = accounts.filter(account =>
    account.account_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.account_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.account_group.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (account.description && account.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">{showDeleted ? 'Recycle Bin - Accounts' : 'Chart of Accounts'}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {showDeleted ? 'View and restore deleted accounts' : 'Manage your accounting chart'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Search accounts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='outline'
                  onClick={() => setShowDeleted(!showDeleted)}
                >
                  {showDeleted ? <IconHome2 size={16} /> : <IconRecycle size={16} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showDeleted ? 'View Active Accounts' : 'View Recycle Bin'}
              </TooltipContent>
            </Tooltip>
            {!showDeleted && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={() => setGroupsDialogOpen(true)}>
                      <IconSettings size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Manage Groups</TooltipContent>
                </Tooltip>
                <Button onClick={handleOpenDialog}>
                  <IconPlus size={16} /> Add Account
                </Button>
              </>
            )}
          </TooltipProvider>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr className="text-left text-sm">
                <th className="p-3">Code</th>
                <th className="p-3">Account Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Group</th>
                <th className="p-3">Description</th>
                <th className="p-3">Opening Balance</th>
                <th className="p-3">Active</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    {searchTerm ? 'No accounts match your search.' : 'No accounts found. Add your first account to get started.'}
                  </td>
                </tr>
              ) : (
                filteredAccounts.map(account => (
                  <tr key={account.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono text-sm font-medium">{account.account_code}</td>
                    <td className="p-3">{account.account_name}</td>
                    <td className="p-3">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                        {account.account_type}
                      </span>
                    </td>
                    <td className="p-3 text-sm">{account.account_group}</td>
                    <td className="p-3 text-sm text-muted-foreground">{account.description || '-'}</td>
                    <td className="p-3 text-right">₹{account.opening_balance.toFixed(2)} <span className="text-xs font-medium text-primary">{account.opening_balance_type}</span></td>
                    <td className="p-3">{account.is_active ? '✓' : '✗'}</td>
                    <td className="p-3 flex gap-2">
                      {!showDeleted ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(account)}
                            title={account.is_system === 1 ? "Edit System Account" : "Edit Account"}
                          >
                            <IconEdit size={16} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={account.is_system === 1 ? "text-muted-foreground" : "text-destructive hover:text-destructive"}
                            onClick={() => handleDelete(account.id)}
                            disabled={account.is_system === 1}
                            title={account.is_system === 1 ? "System Account (Cannot Delete)" : "Delete Account"}
                          >
                            <IconTrash size={16} />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700" onClick={() => handleRestore(account.id)}>
                            <IconRefresh size={16} />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleHardDelete(account.id)}>
                            <IconTrashFilled size={16} />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Account Dialog */}
      <ChartOfAccountDialog
        open={open}
        onOpenChange={setOpen}
        accountToEdit={accountToEdit}
        onSave={load}

        accountGroups={accountGroups}
      />

      {/* Account Groups Management Dialog */}
      <AccountGroupsDialog open={groupsDialogOpen} onOpenChange={setGroupsDialogOpen} />
    </div>
  );
}
