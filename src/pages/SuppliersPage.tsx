import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { api, Supplier, CreateSupplier } from '@/lib/tauri';
import { toast } from 'sonner';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateSupplier>({ name: '', email: '', phone: '', address: '' });
  const [editing, setEditing] = useState<number | null>(null);

  const load = async () => {
    try {
      setSuppliers(await api.suppliers.list());
    } catch (error) {
      toast.error('Failed to load suppliers');
      console.error(error);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.suppliers.update(editing, form);
        toast.success('Supplier updated successfully');
      } else {
        await api.suppliers.create(form);
        toast.success('Supplier created successfully');
      }
      setOpen(false);
      setForm({ name: '', email: '', phone: '', address: '' });
      setEditing(null);
      load();
    } catch (error) {
      toast.error(editing ? 'Failed to update supplier' : 'Failed to create supplier');
      console.error(error);
    }
  };

  const handleEdit = (s: Supplier) => {
    setForm({ name: s.name, email: s.email || '', phone: s.phone || '', address: s.address || '' });
    setEditing(s.id);
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete supplier?')) {
      try {
        await api.suppliers.delete(id);
        toast.success('Supplier deleted successfully');
        load();
      } catch (error) {
        toast.error('Failed to delete supplier');
        console.error(error);
      }
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Suppliers</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage your supplier database</p>
        </div>
        <Button onClick={() => { setOpen(true); setEditing(null); setForm({ name: '', email: '', phone: '', address: '' }); }}>
          <IconPlus size={16} /> Add Supplier
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr className="text-left text-sm">
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Address</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No suppliers found. Add your first supplier to get started.
                  </td>
                </tr>
              ) : (
                suppliers.map(s => (
                  <tr key={s.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{s.name}</td>
                    <td className="p-3 text-sm text-muted-foreground">{s.email || '-'}</td>
                    <td className="p-3 text-sm">{s.phone || '-'}</td>
                    <td className="p-3 text-sm">{s.address || '-'}</td>
                    <td className="p-3 flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(s)}><IconEdit size={16} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}><IconTrash size={16} /></Button>
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
            <DialogTitle>{editing ? 'Edit' : 'Add'} Supplier</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
            </div>
            <Button type="submit" className="w-full">{editing ? 'Update' : 'Create'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}