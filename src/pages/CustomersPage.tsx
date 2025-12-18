import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { api, Customer, CreateCustomer } from '@/lib/tauri';
import { toast } from 'sonner';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateCustomer>({ name: '', email: '', phone: '', address: '' });
  const [editing, setEditing] = useState<number | null>(null);

  const load = async () => {
    try {
      setCustomers(await api.customers.list());
    } catch (error) {
      toast.error('Failed to load customers');
      console.error(error);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.customers.update(editing, form);
        toast.success('Customer updated successfully');
      } else {
        await api.customers.create(form);
        toast.success('Customer created successfully');
      }
      setOpen(false);
      setForm({ name: '', email: '', phone: '', address: '' });
      setEditing(null);
      load();
    } catch (error) {
      toast.error(editing ? 'Failed to update customer' : 'Failed to create customer');
      console.error(error);
    }
  };

  const handleEdit = (c: Customer) => {
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '' });
    setEditing(c.id);
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete customer?')) {
      try {
        await api.customers.delete(id);
        toast.success('Customer deleted successfully');
        load();
      } catch (error) {
        toast.error('Failed to delete customer');
        console.error(error);
      }
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Customers</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage your customer database</p>
        </div>
        <Button onClick={() => { setOpen(true); setEditing(null); setForm({ name: '', email: '', phone: '', address: '' }); }}>
          <IconPlus size={16} /> Add Customer
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
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No customers found. Add your first customer to get started.
                  </td>
                </tr>
              ) : (
                customers.map(c => (
                  <tr key={c.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3 text-sm text-muted-foreground">{c.email || '-'}</td>
                    <td className="p-3 text-sm">{c.phone || '-'}</td>
                    <td className="p-3 text-sm">{c.address || '-'}</td>
                    <td className="p-3 flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(c)}><IconEdit size={16} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)}><IconTrash size={16} /></Button>
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
            <DialogTitle>{editing ? 'Edit' : 'Add'} Customer</DialogTitle>
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