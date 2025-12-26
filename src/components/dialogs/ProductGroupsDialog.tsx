import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { api, ProductGroup, CreateProductGroup } from '@/lib/tauri';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useDialog } from '@/hooks/use-dialog';

interface ProductGroupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupsChange?: () => void;
}

export default function ProductGroupsDialog({ open, onOpenChange, onGroupsChange }: ProductGroupsDialogProps) {
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [groupForm, setGroupForm] = useState<CreateProductGroup>({ name: '', description: '' });
  const [editingGroup, setEditingGroup] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const orderedFields = ['name', 'description'];
  const { register, handleKeyDown, refs } = useDialog(open, onOpenChange, orderedFields);

  const loadGroups = async () => {
    try {
      setLoading(true);
      const g = await api.productGroups.list();
      setGroups(g);
    } catch (error) {
      toast.error('Failed to load product groups');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadGroups();
    }
  }, [open]);

  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.name.trim()) return;

    try {
      if (editingGroup) {
        await api.productGroups.update(editingGroup, groupForm);
        toast.success('Product group updated successfully');
      } else {
        await api.productGroups.create(groupForm);
        toast.success('Product group created successfully');
      }
      setGroupForm({ name: '', description: '' });
      setEditingGroup(null);
      loadGroups();
      onGroupsChange?.();
      // Keep focus for rapid entry if adding
      if (!editingGroup) {
        setTimeout(() => refs.current['name']?.focus(), 100);
      }
    } catch (error) {
      toast.error(editingGroup ? 'Failed to update group' : 'Failed to create group');
      console.error(error);
    }
  };

  const handleEditGroup = (g: ProductGroup) => {
    setGroupForm({ name: g.name, description: g.description });
    setEditingGroup(g.id);
    setTimeout(() => refs.current['name']?.focus(), 100);
  };

  const handleDeleteGroup = async (id: number) => {
    if (confirm('Delete this product group?')) {
      try {
        await api.productGroups.delete(id);
        toast.success('Product group deleted successfully');
        loadGroups();
        onGroupsChange?.();
      } catch (error) {
        toast.error('Failed to delete product group');
        console.error(error);
      }
    }
  };

  const handleCancelEdit = () => {
    setGroupForm({ name: '', description: '' });
    setEditingGroup(null);
    setTimeout(() => refs.current['name']?.focus(), 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage Product Groups</DialogTitle>
          <DialogDescription>
            Create and organize product groups
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Group Form */}
          <form onSubmit={handleGroupSubmit} className="grid grid-cols-12 gap-4 pb-4 border-b items-end">
            <div className="col-span-12 md:col-span-5">
              <Label className="text-xs font-medium mb-1 block">Name *</Label>
              <Input
                ref={register('name') as any}
                placeholder="e.g., Electronics"
                value={groupForm.name}
                onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'name')}
                className="h-8 text-sm"
                required
              />
            </div>
            <div className="col-span-12 md:col-span-5">
              <Label className="text-xs font-medium mb-1 block">Description</Label>
              <Input
                ref={register('description') as any}
                placeholder="Optional description"
                value={groupForm.description || ''}
                onChange={e => setGroupForm({ ...groupForm, description: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'description')}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-12 md:col-span-2 flex gap-2">
              <Button type="submit" size="sm">
                {editingGroup ? 'Update' : 'Add'}
              </Button>
              {editingGroup && (
                <Button type="button" size="sm" variant="outline" onClick={handleCancelEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          {/* Groups List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading product groups...</div>
            ) : (
              <table className="w-full">
                <thead className="border-b bg-muted/50 sticky top-0">
                  <tr className="text-left text-sm">
                    <th className="p-3">Name</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No product groups found. Add your first group above.
                      </td>
                    </tr>
                  ) : (
                    groups.map(g => (
                      <tr key={g.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{g.name}</td>
                        <td className="p-3 text-sm text-muted-foreground">{g.description || '-'}</td>
                        <td className="p-3 text-sm text-muted-foreground">{formatDate(g.created_at)}</td>
                        <td className="p-3 flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEditGroup(g)}>
                            <IconEdit size={16} />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDeleteGroup(g.id)}>
                            <IconTrash size={16} />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
