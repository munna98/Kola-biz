import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { IconPlus, IconEdit, IconTrash, IconRuler, IconRefresh, IconTrashFilled, IconRecycle, IconHome2 } from '@tabler/icons-react';
import { api, Product, CreateProduct, Unit } from '@/lib/tauri';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { toast } from 'sonner';
import UnitsDialog from '@/components/dialogs/UnitsDialog';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [form, setForm] = useState<CreateProduct>({ code: '', name: '', unit_id: 1, purchase_rate: 0, sales_rate: 0, mrp: 0 });
  const [editing, setEditing] = useState<number | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const currentUser = useSelector((state: RootState) => state.app.currentUser);

  const load = async () => {
    try {
      setLoading(true);
      const [p, u] = await Promise.all([
        showDeleted ? api.products.listDeleted() : api.products.list(),
        api.units.list()
      ]);
      setProducts(p);
      setUnits(u);
    } catch (error) {
      toast.error('Failed to load data');
      console.error('Load error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [showDeleted]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editing) {
        await api.products.update(editing, form);
        toast.success('Product updated successfully');
      } else {
        await api.products.create(form);
        toast.success('Product created successfully');
      }
      setOpen(false);
      resetForm();
      setEditing(null);
      load();
    } catch (error) {
      toast.error(editing ? 'Failed to update product' : 'Failed to create product');
      console.error(error);
    }
  };

  const resetForm = () => {
    setForm({
      code: '',
      name: '',
      unit_id: units.length > 0 ? units[0].id : 1,
      purchase_rate: 0,
      sales_rate: 0,
      mrp: 0
    });
  };

  const handleEdit = (p: Product) => {
    setForm({
      code: p.code,
      name: p.name,
      unit_id: p.unit_id,
      purchase_rate: p.purchase_rate,
      sales_rate: p.sales_rate,
      mrp: p.mrp
    });
    setEditing(p.id);
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Move this product to Recycle Bin?')) {
      try {
        await api.products.delete(id, currentUser);
        toast.success('Product moved to Recycle Bin');
        load();
      } catch (error) {
        toast.error('Failed to delete product');
        console.error(error);
      }
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await api.products.restore(id);
      toast.success('Product restored successfully');
      load();
    } catch (error) {
      toast.error('Failed to restore product');
      console.error(error);
    }
  };

  const handleHardDelete = async (id: number) => {
    if (confirm('PERMANENTLY delete this product? This action cannot be undone.')) {
      try {
        await api.products.hardDelete(id);
        toast.success('Product permanently deleted');
        load();
      } catch (error: any) {
        toast.error(error.toString() || 'Failed to permanently delete product');
        console.error(error);
      }
    }
  };

  const handleOpenDialog = () => {
    setOpen(true);
    setEditing(null);
    resetForm();
  };

  const handleUnitsChange = () => {
    // Reload units when they change in the dialog
    load();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">{showDeleted ? 'Products (Deleted)' : 'Products'}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {showDeleted ? 'View and restore deleted products' : 'Manage your product inventory'}
          </p>
        </div>
        <div className="flex gap-2">
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
              <TooltipContent>
                {showDeleted ? 'View Active Products' : 'View Recycle Bin'}
              </TooltipContent>
            </Tooltip>
            {!showDeleted && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={() => setUnitsOpen(true)}>
                      <IconRuler size={16} /> Manage Units
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Manage Units</TooltipContent>
                </Tooltip>
                <Button onClick={handleOpenDialog}>
                  <IconPlus size={16} /> Add Product
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
                <th className="p-3">Code</th>
                <th className="p-3">Name</th>
                <th className="p-3">Unit</th>
                <th className="p-3">Purchase</th>
                <th className="p-3">Sales</th>
                <th className="p-3">MRP</th>
                <th className="p-3">Active</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-muted-foreground">
                    No products found. Add your first product to get started.
                  </td>
                </tr>
              ) : (
                products.map(p => (
                  <tr key={p.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono text-sm">{p.code}</td>
                    <td className="p-3">{p.name}</td>
                    <td className="p-3">{units.find(u => u.id === p.unit_id)?.symbol || '-'}</td>
                    <td className="p-3">₹{p.purchase_rate.toFixed(2)}</td>
                    <td className="p-3">₹{p.sales_rate.toFixed(2)}</td>
                    <td className="p-3">₹{p.mrp.toFixed(2)}</td>
                    <td className="p-3">{p.is_active ? '✓' : '✗'}</td>
                    <td className="p-3 flex gap-2">
                      {!showDeleted ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(p)}><IconEdit size={16} /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)}><IconTrash size={16} /></Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" className="text-blue-600 hover:text-blue-700" onClick={() => handleRestore(p.id)}><IconRefresh size={16} /></Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleHardDelete(p.id)}><IconTrashFilled size={16} /></Button>
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

      {/* Product Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Product</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Code</Label>
                <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required />
              </div>
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
            </div>
            <div>
              <Label>Unit</Label>
              <Select
                value={form.unit_id.toString()}
                onValueChange={v => setForm({ ...form, unit_id: +v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {units.map(u => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.name} ({u.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Purchase Rate</Label>
                <Input type="number" step="0.01" value={form.purchase_rate} onChange={e => setForm({ ...form, purchase_rate: +e.target.value })} required />
              </div>
              <div>
                <Label>Sales Rate</Label>
                <Input type="number" step="0.01" value={form.sales_rate} onChange={e => setForm({ ...form, sales_rate: +e.target.value })} required />
              </div>
              <div>
                <Label>MRP</Label>
                <Input type="number" step="0.01" value={form.mrp} onChange={e => setForm({ ...form, mrp: +e.target.value })} required />
              </div>
            </div>
            <Button type="submit" className="w-full">{editing ? 'Update' : 'Create'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Units Management Dialog Component */}
      <UnitsDialog
        open={unitsOpen}
        onOpenChange={setUnitsOpen}
        onUnitsChange={handleUnitsChange}
      />
    </div>
  );
}