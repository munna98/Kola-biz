import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { useDialog } from '@/hooks/use-dialog';

interface PriceCategory {
  id: string;
  name: string;
  description: string | null;
  is_default: number;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface PriceCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCategoriesChange?: () => void;
}

export default function PriceCategoriesDialog({ open, onOpenChange, onCategoriesChange }: PriceCategoriesDialogProps) {
  const [categories, setCategories] = useState<PriceCategory[]>([]);
  const [form, setForm] = useState({ name: '', description: '', is_default: false, sort_order: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const orderedFields = ['name', 'description', 'sort_order'];
  const { register, handleKeyDown, refs } = useDialog(open, onOpenChange, orderedFields);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const cats = await invoke<PriceCategory[]>('list_price_categories');
      setCategories(cats);
    } catch (error) {
      toast.error('Failed to load price categories');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadCategories();
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      if (editingId) {
        await invoke('update_price_category', { id: editingId, category: form });
        toast.success('Price category updated successfully');
      } else {
        await invoke('create_price_category', { category: form });
        toast.success('Price category created successfully');
      }
      setForm({ name: '', description: '', is_default: false, sort_order: 0 });
      setEditingId(null);
      loadCategories();
      onCategoriesChange?.();
      if (!editingId) {
        setTimeout(() => refs.current['name']?.focus(), 100);
      }
    } catch (error: any) {
      toast.error(error?.toString() || (editingId ? 'Failed to update price category' : 'Failed to create price category'));
      console.error(error);
    }
  };

  const handleEdit = (cat: PriceCategory) => {
    setForm({
      name: cat.name,
      description: cat.description || '',
      is_default: cat.is_default === 1,
      sort_order: cat.sort_order,
    });
    setEditingId(cat.id);
    setTimeout(() => refs.current['name']?.focus(), 100);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this price category?')) {
      try {
        await invoke('delete_price_category', { id });
        toast.success('Price category deleted successfully');
        loadCategories();
        onCategoriesChange?.();
      } catch (error: any) {
        toast.error(error?.toString() || 'Failed to delete price category');
        console.error(error);
      }
    }
  };

  const handleCancelEdit = () => {
    setForm({ name: '', description: '', is_default: false, sort_order: 0 });
    setEditingId(null);
    setTimeout(() => refs.current['name']?.focus(), 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage Price Categories</DialogTitle>
          <DialogDescription>
            Create and organize price categories (e.g. Retail, Wholesale, Distributor)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3 pb-4 border-b">
            <div className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-12 md:col-span-4">
                <Label className="text-xs font-medium mb-1 block">Name *</Label>
                <Input
                  ref={register('name') as any}
                  placeholder="e.g. Retail, Wholesale"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, 'name')}
                  className="h-8 text-sm"
                  required
                />
              </div>
              <div className="col-span-12 md:col-span-4">
                <Label className="text-xs font-medium mb-1 block">Description</Label>
                <Input
                  ref={register('description') as any}
                  placeholder="Optional description"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, 'description')}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-6 md:col-span-2">
                <Label className="text-xs font-medium mb-1 block">Sort Order</Label>
                <Input
                  ref={register('sort_order') as any}
                  type="number"
                  value={form.sort_order}
                  onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                  onKeyDown={(e) => handleKeyDown(e, 'sort_order')}
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-6 md:col-span-2 flex gap-2">
                <Button type="submit" size="sm" className="w-full">
                  {editingId ? 'Update' : 'Add'}
                </Button>
                {editingId && (
                  <Button type="button" size="sm" variant="outline" onClick={handleCancelEdit}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="pc-dialog-is-default"
                checked={form.is_default}
                onCheckedChange={checked => setForm({ ...form, is_default: !!checked })}
              />
              <label htmlFor="pc-dialog-is-default" className="text-xs font-medium cursor-pointer">
                Set as default price category
              </label>
            </div>
          </form>

          {/* Categories List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading price categories...</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-3 w-12">#</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-center w-20">Order</th>
                    <th className="p-3 text-center w-24">Default</th>
                    <th className="p-3 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        No price categories found. Add your first category above.
                      </td>
                    </tr>
                  ) : (
                    categories.map((cat, idx) => (
                      <tr key={cat.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 text-muted-foreground">{idx + 1}</td>
                        <td className="p-3 font-medium">{cat.name}</td>
                        <td className="p-3 text-muted-foreground">{cat.description || '—'}</td>
                        <td className="p-3 text-center">{cat.sort_order}</td>
                        <td className="p-3 text-center">
                          {cat.is_default ? <Badge>Default</Badge> : '—'}
                        </td>
                        <td className="p-3 flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(cat)}>
                            <IconEdit size={16} />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(cat.id)}>
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
