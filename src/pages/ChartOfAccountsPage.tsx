import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { IconPlus, IconEdit, IconTrash, IconSettings } from '@tabler/icons-react';
import { api, ChartOfAccount, CreateChartOfAccount } from '@/lib/tauri';
import { toast } from 'sonner';
import AccountGroupsDialog from '@/components/dialogs/AccountGroupsDialog';

export default function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [accountTypes, setAccountTypes] = useState<string[]>([]);
  const [accountGroups, setAccountGroups] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [groupsDialogOpen, setGroupsDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateChartOfAccount>({
    account_code: '',
    account_name: '',
    account_type: 'Asset',
    account_group: 'Current Assets',
    description: '',
    opening_balance: 0,
    opening_balance_type: 'Dr',
  });
  const [editing, setEditing] = useState<number | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const [accountsData, types, groups] = await Promise.all([
        api.chartOfAccounts.list(),
        api.chartOfAccounts.getTypes(),
        api.chartOfAccounts.getGroups(),
      ]);
      setAccounts(accountsData);
      setAccountTypes(types);
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
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editing) {
        await api.chartOfAccounts.update(editing, form);
        toast.success('Account updated successfully');
      } else {
        await api.chartOfAccounts.create(form);
        toast.success('Account created successfully');
      }
      setOpen(false);
      resetForm();
      setEditing(null);
      load();
    } catch (error) {
      toast.error(editing ? 'Failed to update account' : 'Failed to create account');
      console.error(error);
    }
  };

  const resetForm = () => {
    setForm({
      account_code: '',
      account_name: '',
      account_type: 'Asset',
      account_group: 'Current Assets',
      description: '',
      opening_balance: 0,
      opening_balance_type: 'Dr',
    });
  };

  const handleEdit = (account: ChartOfAccount) => {
    setForm({
      account_code: account.account_code,
      account_name: account.account_name,
      account_type: account.account_type,
      account_group: account.account_group,
      description: account.description,
      opening_balance: account.opening_balance,
      opening_balance_type: account.opening_balance_type || 'Dr',
    });
    setEditing(account.id);
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this account?')) {
      try {
        await api.chartOfAccounts.delete(id);
        toast.success('Account deleted successfully');
        load();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete account';
        toast.error(errorMessage);
        console.error(error);
      }
    }
  };

  const handleOpenDialog = () => {
    setOpen(true);
    setEditing(null);
    resetForm();
  };

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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Chart of Accounts</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage your accounting chart</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setGroupsDialogOpen(true)}>
            <IconSettings size={16} /> Manage Groups
          </Button>
          <Button onClick={handleOpenDialog}>
            <IconPlus size={16} /> Add Account
          </Button>
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
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No accounts found. Add your first account to get started.
                  </td>
                </tr>
              ) : (
                accounts.map(account => (
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
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(account)}>
                        <IconEdit size={16} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(account.id)}>
                        <IconTrash size={16} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Account Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Account Code</Label>
                <Input
                  value={form.account_code}
                  onChange={e => setForm({ ...form, account_code: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Account Type</Label>
                <Select
                  value={form.account_type}
                  onValueChange={v => setForm({ ...form, account_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accountTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Account Name</Label>
              <Input
                value={form.account_name}
                onChange={e => setForm({ ...form, account_name: e.target.value })}
                required
              />
            </div>

            <div>
              <Label>Account Group</Label>
              <Select
                value={form.account_group}
                onValueChange={v => setForm({ ...form, account_group: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountGroups.map(group => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Description</Label>
              <Input
                value={form.description || ''}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Opening Balance</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.opening_balance || 0}
                  onChange={e => setForm({ ...form, opening_balance: parseFloat(e.target.value) })}
                />
              </div>

              <div>
                <Label>Balance Type</Label>
                <RadioGroup 
                  value={form.opening_balance_type || 'Dr'}
                  onValueChange={(value) => setForm({ ...form, opening_balance_type: value as 'Dr' | 'Cr' })}
                  className="flex gap-4 mt-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Dr" id="debit" />
                    <Label htmlFor="debit" className="font-normal cursor-pointer">Dr</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Cr" id="credit" />
                    <Label htmlFor="credit" className="font-normal cursor-pointer">Cr</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <Button type="submit" className="w-full">
              {editing ? 'Update' : 'Create'} Account
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Account Groups Management Dialog */}
      <AccountGroupsDialog open={groupsDialogOpen} onOpenChange={setGroupsDialogOpen} />
    </div>
  );
}
