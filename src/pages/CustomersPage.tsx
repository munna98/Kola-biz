import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IconPlus, IconEdit, IconTrash, IconRefresh, IconTrashFilled, IconRecycle, IconHome2 } from '@tabler/icons-react';
import { api, Customer } from '@/lib/tauri';
import { toast } from 'sonner';
import CustomerDialog from '@/components/dialogs/CustomerDialog';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const load = async () => {
    try {
      setCustomers(showDeleted ? await api.customers.listDeleted() : await api.customers.list());
    } catch (error) {
      toast.error('Failed to load customers');
      console.error(error);
    }
  };

  useEffect(() => { load(); }, [showDeleted]);

  const handleEdit = (c: Customer) => {
    setCustomerToEdit(c);
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Move this customer to Recycle Bin?')) {
      try {
        await api.customers.delete(id);
        toast.success('Customer moved to Recycle Bin');
        load();
      } catch (error) {
        toast.error('Failed to delete customer');
        console.error(error);
      }
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await api.customers.restore(id);
      toast.success('Customer restored successfully');
      load();
    } catch (error) {
      toast.error('Failed to restore customer');
      console.error(error);
    }
  };

  const handleHardDelete = async (id: number) => {
    if (confirm('PERMANENTLY delete this customer? This action cannot be undone.')) {
      try {
        await api.customers.hardDelete(id);
        toast.success('Customer permanently deleted');
        load();
      } catch (error: any) {
        toast.error(error.toString() || 'Failed to permanently delete customer');
        console.error(error);
      }
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{showDeleted ? 'Customers (Deleted)' : 'Customers'}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {showDeleted ? 'View and restore deleted customers' : 'Manage your customer database'}
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
            <Button onClick={() => { setOpen(true); setCustomerToEdit(null); }}>
              <IconPlus size={16} /> Add Customer
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
                      {!showDeleted ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(c)}><IconEdit size={16} /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)}><IconTrash size={16} /></Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700" onClick={() => handleRestore(c.id)}><IconRefresh size={16} /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleHardDelete(c.id)}><IconTrashFilled size={16} /></Button>
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

      <CustomerDialog
        open={open}
        onOpenChange={setOpen}
        customerToEdit={customerToEdit}
        onSave={load}
      />
    </div>
  );
}
