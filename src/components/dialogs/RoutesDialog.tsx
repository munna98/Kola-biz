import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { api, Route, CreateRoute } from '@/lib/tauri';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useDialog } from '@/hooks/use-dialog';

interface RoutesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRoutesChange?: () => void;
}

export default function RoutesDialog({ open, onOpenChange, onRoutesChange }: RoutesDialogProps) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [form, setForm] = useState<CreateRoute>({ name: '', description: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const orderedFields = ['name', 'description'];
  const { register, handleKeyDown, refs } = useDialog(open, onOpenChange, orderedFields);

  const loadRoutes = async () => {
    try {
      setLoading(true);
      setRoutes(await api.routes.list());
    } catch (error) {
      toast.error('Failed to load routes');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadRoutes();
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      if (editingId) {
        await api.routes.update(editingId, form);
        toast.success('Route updated successfully');
      } else {
        await api.routes.create(form);
        toast.success('Route created successfully');
      }
      setForm({ name: '', description: '' });
      setEditingId(null);
      loadRoutes();
      onRoutesChange?.();
      if (!editingId) {
        setTimeout(() => refs.current['name']?.focus(), 100);
      }
    } catch (error) {
      toast.error(editingId ? 'Failed to update route' : 'Failed to create route');
      console.error(error);
    }
  };

  const handleEdit = (r: Route) => {
    setForm({ name: r.name, description: r.description });
    setEditingId(r.id);
    setTimeout(() => refs.current['name']?.focus(), 100);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this route? Customers/suppliers assigned to it will have no route.')) {
      try {
        await api.routes.delete(id);
        toast.success('Route deleted successfully');
        loadRoutes();
        onRoutesChange?.();
      } catch (error) {
        toast.error('Failed to delete route');
        console.error(error);
      }
    }
  };

  const handleCancelEdit = () => {
    setForm({ name: '', description: '' });
    setEditingId(null);
    setTimeout(() => refs.current['name']?.focus(), 100);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage Routes</DialogTitle>
          <DialogDescription>
            Create and manage delivery/distribution routes for customers and suppliers
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Form */}
          <form onSubmit={handleSubmit} className="grid grid-cols-12 gap-4 pb-4 border-b items-end">
            <div className="col-span-12 md:col-span-5">
              <Label className="text-xs font-medium mb-1 block">Route Name *</Label>
              <Input
                ref={register('name') as any}
                placeholder="e.g., North Route"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                onKeyDown={e => handleKeyDown(e, 'name')}
                className="h-8 text-sm"
                required
              />
            </div>
            <div className="col-span-12 md:col-span-5">
              <Label className="text-xs font-medium mb-1 block">Description</Label>
              <Input
                ref={register('description') as any}
                placeholder="Optional description"
                value={form.description || ''}
                onChange={e => setForm({ ...form, description: e.target.value })}
                onKeyDown={e => handleKeyDown(e, 'description')}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-12 md:col-span-2 flex gap-2">
              <Button type="submit" size="sm">
                {editingId ? 'Update' : 'Add'}
              </Button>
              {editingId && (
                <Button type="button" size="sm" variant="outline" onClick={handleCancelEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          {/* Routes List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading routes...</div>
            ) : (
              <table className="w-full">
                <thead className="border-b bg-muted/50 sticky top-0">
                  <tr className="text-left text-sm">
                    <th className="p-3">Route Name</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No routes found. Add your first route above.
                      </td>
                    </tr>
                  ) : (
                    routes.map(r => (
                      <tr key={r.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{r.name}</td>
                        <td className="p-3 text-sm text-muted-foreground">{r.description || '-'}</td>
                        <td className="p-3 text-sm text-muted-foreground">{formatDate(r.created_at)}</td>
                        <td className="p-3 flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(r)}>
                            <IconEdit size={16} />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(r.id)}>
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
