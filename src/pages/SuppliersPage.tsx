import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { IconPlus, IconEdit, IconTrash, IconRefresh, IconTrashFilled, IconRecycle, IconHome2, IconFileUpload } from '@tabler/icons-react';
import { api, Supplier } from '@/lib/tauri';
import { toast } from 'sonner';
import SupplierDialog from '@/components/dialogs/SupplierDialog';
import ImportExcelDialog from '@/components/dialogs/ImportExcelDialog';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [supplierToEdit, setSupplierToEdit] = useState<Supplier | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const load = async () => {
    try {
      setSuppliers(showDeleted ? await api.suppliers.listDeleted() : await api.suppliers.list());
    } catch (error) {
      toast.error('Failed to load suppliers');
      console.error(error);
    }
  };

  useEffect(() => { load(); }, [showDeleted]);

  const handleEdit = (s: Supplier) => {
    setSupplierToEdit(s);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
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

  const handleRestore = async (id: string) => {
    try {
      await api.suppliers.restore(id);
      toast.success('Supplier restored successfully');
      load();
    } catch (error) {
      toast.error('Failed to restore supplier');
      console.error(error);
    }
  };

  const handleHardDelete = async (id: string) => {
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
    <div className="h-full overflow-auto p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{showDeleted ? 'Recycle Bin - Suppliers' : 'Suppliers'}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {showDeleted ? 'View and restore deleted suppliers' : 'Manage your supplier database'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Search suppliers..."
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
                  <TooltipContent>Import Suppliers</TooltipContent>
                </Tooltip>
                <Button onClick={() => { setOpen(true); setSupplierToEdit(null); }}>
                  <IconPlus size={16} /> Add Supplier
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
                const filteredSuppliers = suppliers.filter(s =>
                  s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (s.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (s.phone || '').includes(searchTerm)
                );

                if (filteredSuppliers.length === 0) {
                  return (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        {searchTerm ? 'No suppliers match your search.' : 'No suppliers found. Add your first supplier to get started.'}
                      </td>
                    </tr>
                  );
                }

                return filteredSuppliers.map((s, index) => (
                  <tr key={s.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 text-sm text-muted-foreground">{index + 1}</td>
                    <td className="p-3 font-medium">{s.name}</td>
                    <td className="p-3 text-sm text-muted-foreground">{s.email || '-'}</td>
                    <td className="p-3 text-sm">{s.phone || '-'}</td>
                    <td className="p-3 text-sm">{s.address_line_1 || '-'}</td>
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
              })()}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <SupplierDialog
        open={open}
        onOpenChange={setOpen}
        supplierToEdit={supplierToEdit}
        onSave={load}
      />

      <ImportExcelDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Suppliers from Excel"
        expectedColumns={['name', 'phone', 'email', 'address_line_1', 'address_line_2', 'city', 'state', 'postal_code', 'gstin', 'code']}
        sampleData={[
          {
            name: "Acme Corp",
            phone: "9876543210",
            email: "sales@acme.com",
            address_line_1: "456 Market St",
            address_line_2: "",
            city: "San Francisco",
            state: "CA",
            postal_code: "94105",
            gstin: "",
            code: "S001"
          }
        ]}
        onImport={async (data) => {
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
          await api.suppliers.batchCreate(formatted);
          load();
        }}
      />
    </div>
  );
}
