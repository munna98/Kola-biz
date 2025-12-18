import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { api, Product, CreateProduct, Unit } from '@/lib/tauri';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateProduct>({ code: '', name: '', unit_id: 1, purchase_rate: 0, sales_rate: 0, mrp: 0 });
  const [editing, setEditing] = useState<number | null>(null);
  const currentUser = useSelector((state: RootState) => state.app.currentUser);

  const load = async () => {
    const [p, u] = await Promise.all([api.products.list(), api.units.list()]);
    setProducts(p);
    setUnits(u);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await api.products.update(editing, form);
    } else {
      await api.products.create(form);
    }
    setOpen(false);
    setForm({ code: '', name: '', unit_id: 1, purchase_rate: 0, sales_rate: 0, mrp: 0 });
    setEditing(null);
    load();
  };

  const handleEdit = (p: Product) => {
    setForm({ code: p.code, name: p.name, unit_id: p.unit_id, purchase_rate: p.purchase_rate, sales_rate: p.sales_rate, mrp: p.mrp });
    setEditing(p.id);
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this product?')) {
      await api.products.delete(id, currentUser);
      load();
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Products</h2>
        <Button onClick={() => { setOpen(true); setEditing(null); setForm({ code: '', name: '', unit_id: 1, purchase_rate: 0, sales_rate: 0, mrp: 0 }); }}>
          <IconPlus size={16} /> Add Product
        </Button>
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
              {products.map(p => (
                <tr key={p.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-mono text-sm">{p.code}</td>
                  <td className="p-3">{p.name}</td>
                  <td className="p-3">{units.find(u => u.id === p.unit_id)?.symbol}</td>
                  <td className="p-3">₹{p.purchase_rate.toFixed(2)}</td>
                  <td className="p-3">₹{p.sales_rate.toFixed(2)}</td>
                  <td className="p-3">₹{p.mrp.toFixed(2)}</td>
                  <td className="p-3">{p.is_active ? '✓' : '✗'}</td>
                  <td className="p-3 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(p)}><IconEdit size={16} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}><IconTrash size={16} /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} Product</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Code</Label>
                <Input value={form.code} onChange={e => setForm({...form, code: e.target.value})} required />
              </div>
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={form.unit_id.toString()} onValueChange={v => setForm({...form, unit_id: +v})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {units.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.name} ({u.symbol})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Purchase Rate</Label>
                <Input type="number" step="0.01" value={form.purchase_rate} onChange={e => setForm({...form, purchase_rate: +e.target.value})} required />
              </div>
              <div>
                <Label>Sales Rate</Label>
                <Input type="number" step="0.01" value={form.sales_rate} onChange={e => setForm({...form, sales_rate: +e.target.value})} required />
              </div>
              <div>
                <Label>MRP</Label>
                <Input type="number" step="0.01" value={form.mrp} onChange={e => setForm({...form, mrp: +e.target.value})} required />
              </div>
            </div>
            <Button type="submit" className="w-full">{editing ? 'Update' : 'Create'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}