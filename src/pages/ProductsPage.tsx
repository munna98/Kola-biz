import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { IconPlus, IconEdit, IconTrash, IconRuler, IconCategory, IconRefresh, IconTrashFilled, IconRecycle, IconHome2, IconBarcode } from '@tabler/icons-react';
import { api, Product, Unit, ProductGroup, GstTaxSlab } from '@/lib/tauri';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { toast } from 'sonner';
import ProductDialog from '@/components/dialogs/ProductDialog';
import UnitsDialog from '@/components/dialogs/UnitsDialog';
import ProductGroupsDialog from '@/components/dialogs/ProductGroupsDialog';
import BarcodeLabelDialog from '@/components/dialogs/BarcodeLabelDialog';
import { invoke } from '@tauri-apps/api/core';

type ProductFilter = 'all' | 'master' | 'child';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstSlabs, setGstSlabs] = useState<GstTaxSlab[]>([]);
  const [masterProductsEnabled, setMasterProductsEnabled] = useState(false);
  const [productFilter, setProductFilter] = useState<ProductFilter>('all');
  const [open, setOpen] = useState(false);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined);
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const currentUser = useSelector((state: RootState) => state.app.currentUser);

  const load = async () => {
    try {
      setLoading(true);
      const [p, u, g, gstSettings, slabs, masterSetting] = await Promise.all([
        showDeleted ? api.products.listDeleted() : api.products.list(),
        api.units.list(),
        api.productGroups.list(),
        api.gst.getSettings(),
        api.gst.getSlabs(),
        invoke<string | null>('get_app_setting', { key: 'enable_master_products' }),
      ]);
      setProducts(p);
      setUnits(u);
      setGroups(g);
      setGstEnabled(gstSettings.gst_enabled);
      setGstSlabs(slabs);
      setMasterProductsEnabled(masterSetting === 'true');
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

  const handleDelete = async (id: string) => {
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

  const handleRestore = async (id: string) => {
    try {
      await api.products.restore(id);
      toast.success('Product restored successfully');
      load();
    } catch (error) {
      toast.error('Failed to restore product');
      console.error(error);
    }
  };

  const handleHardDelete = async (id: string) => {
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

  const handleUnitsChange = () => load();
  const handleGroupsChange = () => load();

  // Apply search + category filter
  const filteredProducts = products.filter(p => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (groups.find(g => g.id === p.group_id)?.name || '').toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (masterProductsEnabled && productFilter === 'master') return p.is_master === 1;
    if (masterProductsEnabled && productFilter === 'child') return !!p.parent_product_id;
    return true;
  });

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
    <div className="h-full overflow-auto p-6 space-y-4">
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
                  <TooltipContent>Manage Groups</TooltipContent>
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

      {/* Filter tabs — only shown when Master Products feature is enabled */}
      {masterProductsEnabled && !showDeleted && (
        <div className="flex gap-1 border-b pb-0">
          {(['all', 'master', 'child'] as ProductFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setProductFilter(f)}
              className={[
                'px-4 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                productFilter === f
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {f === 'all' ? 'All Products' : f === 'master' ? '⬡ Masters' : '◆ Child Batches'}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground self-center pr-1">
            {filteredProducts.length} result{filteredProducts.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr className="text-left text-sm">
                <th className="p-3 w-12">S.No</th>
                <th className="p-3">Code</th>
                <th className="p-3">Name</th>
                <th className="p-3">HSN Code</th>
                <th className="p-3">Group</th>
                <th className="p-3">Unit</th>
                <th className="p-3">Purchase</th>
                <th className="p-3">Sales</th>
                <th className="p-3">MRP</th>
                {gstEnabled && <th className="p-3">Tax Slab</th>}
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-muted-foreground">
                    {searchTerm ? 'No products match your search.' : 'No products found. Add your first product to get started.'}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p, index) => {
                  const isMaster = p.is_master === 1;
                  const isChild = !!p.parent_product_id;

                  return (
                    <tr
                      key={p.id}
                      className={[
                        'border-b hover:bg-muted/30',
                        isChild ? 'bg-blue-50/30 dark:bg-blue-950/10' : '',
                      ].join(' ')}
                    >
                      <td className="p-3 text-sm text-muted-foreground">{index + 1}</td>
                      <td className="p-3 font-mono text-sm">{p.code}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          {p.name}
                          {masterProductsEnabled && isMaster && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-400 text-amber-700 dark:text-amber-400">
                              Master
                            </Badge>
                          )}
                          {masterProductsEnabled && isChild && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-blue-400 text-blue-700 dark:text-blue-400">
                              Batch
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-sm">{p.hsn_sac_code || '-'}</td>
                      <td className="p-3 text-sm">{groups.find(g => g.id === p.group_id)?.name || '-'}</td>
                      <td className="p-3">{units.find(u => u.id === p.unit_id)?.symbol || '-'}</td>
                      <td className="p-3">{isMaster ? <span className="text-muted-foreground text-xs italic">—</span> : `₹${p.purchase_rate.toFixed(2)}`}</td>
                      <td className="p-3">{isMaster ? <span className="text-muted-foreground text-xs italic">—</span> : `₹${p.sales_rate.toFixed(2)}`}</td>
                      <td className="p-3">{isMaster ? <span className="text-muted-foreground text-xs italic">—</span> : `₹${p.mrp.toFixed(2)}`}</td>
                      {gstEnabled && (
                        <td className="p-3 text-sm">
                          {gstSlabs.find(s => s.id === p.gst_slab_id)?.name || '-'}
                        </td>
                      )}
                      <td className="p-3 flex gap-2">
                        {!showDeleted ? (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" onClick={() => { setBarcodeProduct(p); setBarcodeDialogOpen(true); }}><IconBarcode size={16} /></Button>
                              </TooltipTrigger>
                              <TooltipContent>Print Barcode</TooltipContent>
                            </Tooltip>
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
                  );
                })
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

      {/* Barcode Label Dialog */}
      <BarcodeLabelDialog
        open={barcodeDialogOpen}
        onOpenChange={setBarcodeDialogOpen}
        products={barcodeProduct ? [{ code: barcodeProduct.code, name: barcodeProduct.name, salesRate: barcodeProduct.sales_rate }] : []}
      />
    </div>
  );
}