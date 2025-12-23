import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { api, AccountGroup, CreateAccountGroup } from '@/lib/tauri';
import { toast } from 'sonner';

interface AccountGroupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AccountGroupsDialog({ open, onOpenChange }: AccountGroupsDialogProps) {
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CreateAccountGroup>({
    name: '',
    account_type: 'Asset',
  });

  const accountTypes = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

  const load = async () => {
    try {
      setLoading(true);
      const data = await api.accountGroups.list();
      setGroups(data);
    } catch (error) {
      toast.error('Failed to load account groups');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      load();
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await api.accountGroups.create(form);
      toast.success('Account group created successfully');
      setForm({ name: '', account_type: 'Asset' });
      load();
    } catch (error) {
      toast.error('Failed to create account group');
      console.error(error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this account group?')) {
      try {
        await api.accountGroups.delete(id);
        toast.success('Account group deleted successfully');
        load();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete account group';
        toast.error(errorMessage);
        console.error(error);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Account Groups</DialogTitle>
          <DialogDescription>
            Create and manage groups to organize your chart of accounts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create New Group Form */}
          <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-muted/30 rounded-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Group Name</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Fixed Assets, Intangible Assets"
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
            <Button type="submit" className="w-full">
              <IconPlus size={16} /> Add New Group
            </Button>
          </form>

          {/* Existing Groups */}
          <div>
            <h3 className="font-semibold mb-3">Existing Groups</h3>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : groups.length === 0 ? (
              <p className="text-muted-foreground">No account groups found.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {accountTypes.map(type => (
                  <div key={type}>
                    <p className="text-sm font-medium text-muted-foreground mb-2">{type}</p>
                    <div className="space-y-2 mb-3">
                      {groups
                        .filter(g => g.account_type === type)
                        .map(group => (
                          <div
                            key={group.id}
                            className="flex items-center justify-between p-2 bg-card rounded border"
                          >
                            <span>{group.name}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(group.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <IconTrash size={16} />
                            </Button>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
