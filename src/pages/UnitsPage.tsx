import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { api, Unit, CreateUnit } from '@/lib/tauri';
import { toast } from 'sonner';

export default function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateUnit>({ name: '', symbol: '' });
  const [editing, setEditing] = useState<number | null>(null);

  const load = async () => {
    try {
      setUnits(await api.units.list());
    } catch (error) {
      toast.error('Failed to load units');
      console.error(error);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.units.update(editing, form);
        toast.success('Unit updated successfully');
      } else {
        await api.units.create(form);
        toast.success('Unit created successfully');
      }
      setOpen(false);
      setForm({ name: '', symbol: '' });
      setEditing(null);
      load();
    } catch (error) {
      toast.error(editing ? 'Failed to update unit' : 'Failed to create unit');
      console.error(error);
    }
  };

  const handleEdit = (u: Unit) => {
    setForm({ name: u.name, symbol: u.symbol });
    setEditing(u.id);
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this unit? Products using this unit will be affected.')) {
      try {
        await api.units.delete(id);
        toast.success('Unit deleted successfully');
        load();
      } catch (error) {
        toast.error('Failed to delete unit');
        console.error(error);
      }
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Units of Measurement</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage units for your products</p>
        </div>
        <Button onClick={() => { 
          setOpen(true); 
          setEditing(null); 
          setForm({ name: '', symbol: '' }); 
        }}>
          <IconPlus size={16} /> Add Unit
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
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
                    No units found. Add your first unit to get started.
                  </td>
                </tr>
              ) : (
                units.map(u => (
                  <tr key={u.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{u.name}</td>
                    <td className="p-3 font-mono text-sm">{u.symbol}</td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3 flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(u)}>
                        <IconEdit size={16} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(u.id)}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Unit</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input 
                placeholder="e.g., Kilogram, Piece, Liter" 
                value={form.name} 
                onChange={e => setForm({...form, name: e.target.value})} 
                required 
              />
            </div>
            <div>
              <Label>Symbol</Label>
              <Input 
                placeholder="e.g., kg, pcs, L" 
                value={form.symbol} 
                onChange={e => setForm({...form, symbol: e.target.value})} 
                required 
              />
            </div>
            <Button type="submit" className="w-full">
              {editing ? 'Update' : 'Create'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}