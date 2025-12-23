import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { api, Unit, CreateUnit } from '@/lib/tauri';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

interface UnitsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnitsChange?: () => void;
}

export default function UnitsDialog({ open, onOpenChange, onUnitsChange }: UnitsDialogProps) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitForm, setUnitForm] = useState<CreateUnit>({ name: '', symbol: '' });
  const [editingUnit, setEditingUnit] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const loadUnits = async () => {
    try {
      setLoading(true);
      const u = await api.units.list();
      setUnits(u);
    } catch (error) {
      toast.error('Failed to load units');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadUnits();
    }
  }, [open]);

  const handleUnitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUnit) {
        await api.units.update(editingUnit, unitForm);
        toast.success('Unit updated successfully');
      } else {
        await api.units.create(unitForm);
        toast.success('Unit created successfully');
      }
      setUnitForm({ name: '', symbol: '' });
      setEditingUnit(null);
      loadUnits();
      onUnitsChange?.();
    } catch (error) {
      toast.error(editingUnit ? 'Failed to update unit' : 'Failed to create unit');
      console.error(error);
    }
  };

  const handleEditUnit = (u: Unit) => {
    setUnitForm({ name: u.name, symbol: u.symbol });
    setEditingUnit(u.id);
  };

  const handleDeleteUnit = async (id: number) => {
    if (confirm('Delete this unit? Products using this unit will be affected.')) {
      try {
        await api.units.delete(id);
        toast.success('Unit deleted successfully');
        loadUnits();
        onUnitsChange?.();
      } catch (error) {
        toast.error('Failed to delete unit');
        console.error(error);
      }
    }
  };

  const handleCancelEdit = () => {
    setUnitForm({ name: '', symbol: '' });
    setEditingUnit(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage Units of Measurement</DialogTitle>
          <DialogDescription>
            Add, update, or delete units used for your products (e.g., Kg, Pcs).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Unit Form */}
          <form onSubmit={handleUnitSubmit} className="grid grid-cols-[1fr_1fr_auto] gap-3 pb-4 border-b">
            <div>
              <Input
                placeholder="Unit name (e.g., Kilogram)"
                value={unitForm.name}
                onChange={e => setUnitForm({ ...unitForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Input
                placeholder="Symbol (e.g., kg)"
                value={unitForm.symbol}
                onChange={e => setUnitForm({ ...unitForm, symbol: e.target.value })}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                {editingUnit ? 'Update' : 'Add'}
              </Button>
              {editingUnit && (
                <Button type="button" size="sm" variant="outline" onClick={handleCancelEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          {/* Units List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground">Loading units...</div>
            ) : (
              <table className="w-full">
                <thead className="border-b bg-muted/50 sticky top-0">
                  <tr className="text-left text-sm">
                    <th className="p-3">Name</th>
                    <th className="p-3">Symbol</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {units.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No units found. Add your first unit above.
                      </td>
                    </tr>
                  ) : (
                    units.map(u => (
                      <tr key={u.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{u.name}</td>
                        <td className="p-3 font-mono text-sm">{u.symbol}</td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {formatDate(u.created_at)}
                        </td>
                        <td className="p-3 flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleEditUnit(u)}>
                            <IconEdit size={16} />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteUnit(u.id)}>
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