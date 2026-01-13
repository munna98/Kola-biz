import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { IconPlus, IconEdit, IconTrash, IconRuler, IconCategory, IconRefresh, IconTrashFilled, IconRecycle, IconHome2 } from '@tabler/icons-react';
import { api, Product, Unit, ProductGroup } from '@/lib/tauri';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { toast } from 'sonner';
import ProductDialog from '@/components/dialogs/ProductDialog';
import UnitsDialog from '@/components/dialogs/UnitsDialog';
import ProductGroupsDialog from '@/components/dialogs/ProductGroupsDialog';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined);
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const currentUser = useSelector((state: RootState) => state.app.currentUser);

  const load = async () => {
    try {
      setLoading(true);
      const [p, u, g] = await Promise.all([
        showDeleted ? api.products.listDeleted() : api.products.list(),
        api.units.list(),
        api.productGroups.list()
      ]);
      setProducts(p);
      setUnits(u);
      setGroups(g);
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

  const handleEdit = (p: Product) => {
    setEditingProduct(p);
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
    setEditingProduct(undefined);
  };

  const handleUnitsChange = () => {
    // Reload units when they change in the dialog
    load();
  };

  const handleGroupsChange = () => {
    // Reload groups when they change in the dialog
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
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Search products..."
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
              <TooltipContent>
                {showDeleted ? 'View Active Products' : 'View Recycle Bin'}
              </TooltipContent>
            </Tooltip>
            {!showDeleted && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={() => setGroupsOpen(true)}>
                      <IconCategory size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Manage  Groups</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={() => setUnitsOpen(true)}>
                      <IconRuler size={16} />
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
                <th className="p-3">Group</th>
                <th className="p-3">Unit</th>
                <th className="p-3">Purchase</th>
                <th className="p-3">Sales</th>
                <th className="p-3">MRP</th>
                <th className="p-3">Active</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.filter(p =>
                p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (groups.find(g => g.id === p.group_id)?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
              ).length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-muted-foreground">
                    {searchTerm ? 'No products match your search.' : 'No products found. Add your first product to get started.'}
                  </td>
                </tr>
              ) : (
                products.filter(p =>
                  p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (groups.find(g => g.id === p.group_id)?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
                ).map(p => (
                  <tr key={p.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono text-sm">{p.code}</td>
                    <td className="p-3">{p.name}</td>
                    <td className="p-3 text-sm">{groups.find(g => g.id === p.group_id)?.name || '-'}</td>
                    <td className="p-3">{units.find(u => u.id === p.unit_id)?.symbol || '-'}</td>
                    <td className="p-3">₹{p.purchase_rate.toFixed(2)}</td>
                    <td className="p-3">₹{p.sales_rate.toFixed(2)}</td>
                    <td className="p-3">₹{p.mrp.toFixed(2)}</td>
                    <td className="p-3">
                      <Badge variant={p.is_active ? 'default' : 'secondary'}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
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
      <ProductDialog
        open={open}
        onOpenChange={setOpen}
        units={units}
        groups={groups}
        product={editingProduct}
        onSuccess={load}
      />

      {/* Units Management Dialog Component */}
      <UnitsDialog
        open={unitsOpen}
        onOpenChange={setUnitsOpen}
        onUnitsChange={handleUnitsChange}
      />

      {/* Product Groups Management Dialog Component */}
      <ProductGroupsDialog
        open={groupsOpen}
        onOpenChange={setGroupsOpen}
        onGroupsChange={handleGroupsChange}
      />
    </div>
  );
}