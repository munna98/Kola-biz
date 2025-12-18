import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { api, Product, CreateProduct } from './lib/tauri';
import './App.css'; 

function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<CreateProduct>({ name: '', sku: '', price: 0, stock: 0 });
  const [editing, setEditing] = useState<number | null>(null);

  const loadProducts = async () => {
    const data = await api.products.list();
    setProducts(data);
  };

  useEffect(() => { loadProducts(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await api.products.update(editing, form);
      setEditing(null);
    } else {
      await api.products.create(form);
    }
    setForm({ name: '', sku: '', price: 0, stock: 0 });
    loadProducts();
  };

  const handleEdit = (p: Product) => {
    setForm({ name: p.name, sku: p.sku, price: p.price, stock: p.stock });
    setEditing(p.id);
  };

  const handleDelete = async (id: number) => {
    await api.products.delete(id);
    loadProducts();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Product Management</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>{editing ? 'Edit' : 'Add'} Product</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-4">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div>
                <Label>SKU</Label>
                <Input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} required />
              </div>
              <div>
                <Label>Price</Label>
                <Input type="number" step="0.01" value={form.price} onChange={e => setForm({...form, price: +e.target.value})} required />
              </div>
              <div>
                <Label>Stock</Label>
                <Input type="number" value={form.stock} onChange={e => setForm({...form, stock: +e.target.value})} required />
              </div>
              <div className="col-span-4 flex gap-2">
                <Button type="submit"><IconPlus size={16} /> {editing ? 'Update' : 'Add'}</Button>
                {editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm({ name: '', sku: '', price: 0, stock: 0 }); }}>Cancel</Button>}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="border-b">
                <tr className="text-left">
                  <th className="p-4">Name</th>
                  <th className="p-4">SKU</th>
                  <th className="p-4">Price</th>
                  <th className="p-4">Stock</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} className="border-b">
                    <td className="p-4">{p.name}</td>
                    <td className="p-4">{p.sku}</td>
                    <td className="p-4">${p.price.toFixed(2)}</td>
                    <td className="p-4">{p.stock}</td>
                    <td className="p-4 flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(p)}><IconEdit size={16} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}><IconTrash size={16} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;