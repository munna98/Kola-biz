import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconPlus, IconEdit, IconTrash, IconRefresh, IconTrashFilled, IconRecycle, IconHome2 } from '@tabler/icons-react';
import { api, Supplier, CreateSupplier } from '@/lib/tauri';
import { toast } from 'sonner';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateSupplier>({ name: '', email: '', phone: '', address: '' });
  const [editing, setEditing] = useState<number | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const load = async () => {
    try {
      setSuppliers(showDeleted ? await api.suppliers.listDeleted() : await api.suppliers.list());
    } catch (error) {
      toast.error('Failed to load suppliers');
      console.error(error);
    }
  };

  useEffect(() => { load(); }, [showDeleted]);

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
    if (confirm('Move this supplier to Recycle Bin?')) {
      try {
        await api.suppliers.delete(id);
        toast.success('Supplier moved to Recycle Bin');
        load();
      } catch (error) {
        toast.error('Failed to delete supplier');
        console.error(error);
      }
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await api.suppliers.restore(id);
      toast.success('Supplier restored successfully');
      load();
    } catch (error) {
      toast.error('Failed to restore supplier');
      console.error(error);
    }
  };

  const handleHardDelete = async (id: number) => {
    if (confirm('PERMANENTLY delete this supplier? This action cannot be undone.')) {
      try {
        await api.suppliers.hardDelete(id);
        toast.success('Supplier permanently deleted');
        load();
      } catch (error: any) {
        toast.error(error.toString() || 'Failed to permanently delete supplier');
        console.error(error);
      }
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{showDeleted ? 'Recycle Bin - Suppliers' : 'Suppliers'}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {showDeleted ? 'View and restore deleted suppliers' : 'Manage your supplier database'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowDeleted(!showDeleted)}
          >
            {showDeleted ? <IconHome2 size={16} /> : <IconRecycle size={16} />}
          </Button>
          {!showDeleted && (
            <Button onClick={() => { setOpen(true); setEditing(null); setForm({ name: '', email: '', phone: '', address: '' }); }}>
              <IconPlus size={16} /> Add Supplier
            </Button>
          )}
        </div>
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
                      {!showDeleted ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(s)}><IconEdit size={16} /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(s.id)}><IconTrash size={16} /></Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700" onClick={() => handleRestore(s.id)}><IconRefresh size={16} /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleHardDelete(s.id)}><IconTrashFilled size={16} /></Button>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Supplier</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the details of the existing supplier.' : 'Fill in the details to add a new supplier.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <Button type="submit" className="w-full">{editing ? 'Update' : 'Create'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}