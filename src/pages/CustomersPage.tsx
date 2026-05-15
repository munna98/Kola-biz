import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { IconPlus, IconEdit, IconTrash, IconRefresh, IconTrashFilled, IconRecycle, IconHome2, IconFileUpload } from '@tabler/icons-react';
import { api, Customer } from '@/lib/tauri';
import { toast } from 'sonner';
import CustomerDialog from '@/components/dialogs/CustomerDialog';
import ImportExcelDialog from '@/components/dialogs/ImportExcelDialog';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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

  const handleDelete = async (id: string) => {
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

  const handleRestore = async (id: string) => {
    try {
      await api.customers.restore(id);
      toast.success('Customer restored successfully');
      load();
    } catch (error) {
      toast.error('Failed to restore customer');
      console.error(error);
    }
  };

  const handleHardDelete = async (id: string) => {
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
    <div className="h-full overflow-auto p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{showDeleted ? 'Customers (Deleted)' : 'Customers'}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {showDeleted ? 'View and restore deleted customers' : 'Manage your customer database'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => setShowDeleted(!showDeleted)}
                >
                  {showDeleted ? <IconHome2 size={16} /> : <IconRecycle size={16} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showDeleted ? 'View Active' : 'View Recycle Bin'}</TooltipContent>
            </Tooltip>
            {!showDeleted && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={() => setImportOpen(true)}>
                      <IconFileUpload size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Import Customers</TooltipContent>
                </Tooltip>
                <Button onClick={() => { setOpen(true); setCustomerToEdit(null); }}>
                  <IconPlus size={16} /> Add Customer
                </Button>
              </>
            )}
          </TooltipProvider>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr className="text-left text-sm">
                <th className="p-3 w-12">S.No</th>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Address</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filteredCustomers = customers.filter(c =>
                  c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (c.phone || '').includes(searchTerm)
                );

                if (filteredCustomers.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        {searchTerm ? 'No customers match your search.' : 'No customers found. Add your first customer to get started.'}
                      </td>
                    </tr>
                  );
                }

                return filteredCustomers.map((c, index) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 text-sm text-muted-foreground">{index + 1}</td>
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3 text-sm text-muted-foreground">{c.email || '-'}</td>
                    <td className="p-3 text-sm">{c.phone || '-'}</td>
                    <td className="p-3 text-sm">{c.address_line_1 || '-'}</td>
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
              })()}
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

      <ImportExcelDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Customers from Excel"
        expectedColumns={['name', 'phone', 'email', 'address_line_1', 'address_line_2', 'city', 'state', 'postal_code', 'gstin', 'code']}
        sampleData={[
          {
            name: "John Doe",
            phone: "9876543210",
            email: "john@example.com",
            address_line_1: "123 Main St",
            address_line_2: "",
            city: "New York",
            state: "NY",
            postal_code: "10001",
            gstin: "",
            code: "C001"
          }
        ]}
        onImport={async (data) => {
          // data is an array of objects representing rows. Keys are column headers.
          // Filter out empty rows (where name is missing)
          const validData = data.filter(r => r.name && String(r.name).trim() !== '');
          const formatted = validData.map(r => ({
            name: String(r.name),
            phone: r.phone ? String(r.phone) : undefined,
            email: r.email ? String(r.email) : undefined,
            address_line_1: r.address_line_1 ? String(r.address_line_1) : undefined,
            address_line_2: r.address_line_2 ? String(r.address_line_2) : undefined,
            city: r.city ? String(r.city) : undefined,
            state: r.state ? String(r.state) : undefined,
            postal_code: r.postal_code ? String(r.postal_code) : undefined,
            gstin: r.gstin ? String(r.gstin) : undefined,
            code: r.code ? String(r.code) : undefined,
          }));
          await api.customers.batchCreate(formatted);
          load();
        }}
      />
    </div>
  );
}
