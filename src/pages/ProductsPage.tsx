import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { IconPlus, IconEdit, IconTrash, IconRuler, IconCategory, IconRefresh, IconTrashFilled, IconRecycle, IconHome2, IconBarcode, IconFileUpload, IconTag, IconPhoto, IconCloudUpload, IconLink, IconDotsVertical, IconBrandWhatsapp } from '@tabler/icons-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api, Product, Unit, ProductGroup, ProductBrand, GstTaxSlab } from '@/lib/tauri';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { toast } from 'sonner';
import ProductDialog from '@/components/dialogs/ProductDialog';
import UnitsDialog from '@/components/dialogs/UnitsDialog';
import ProductGroupsDialog from '@/components/dialogs/ProductGroupsDialog';
import ProductBrandsDialog from '@/components/dialogs/ProductBrandsDialog';
import BarcodeLabelDialog from '@/components/dialogs/BarcodeLabelDialog';
import ImportExcelDialog from '@/components/dialogs/ImportExcelDialog';
import ProductImagesDialog from '@/components/dialogs/ProductImagesDialog';
import { invoke } from '@tauri-apps/api/core';
import { type ProductTableColumns, DEFAULT_TABLE_COLUMNS } from '@/pages/settings/ProductSettingsPage';

type ProductFilter = 'all' | 'master' | 'child';

const formatProductSpecs = (p: Product) => {
  let text = `*${p.name.toUpperCase()}*\n`;
  if (p.code) text += `• *Code:* ${p.code}\n`;
  if (p.sales_rate !== undefined && p.sales_rate !== null) {
    text += `• *Price:* ₹${p.sales_rate.toLocaleString('en-IN')}\n`;
  }
  if (p.mrp !== undefined && p.mrp !== null) {
    text += `• *MRP:* ₹${p.mrp.toLocaleString('en-IN')}\n`;
  }

  // Vehicle specifications
  const vehicleSpecs: string[] = [];
  if (p.vehicle_manufacturer) vehicleSpecs.push(`• *Manufacturer:* ${p.vehicle_manufacturer}`);
  if (p.vehicle_model) vehicleSpecs.push(`• *Model:* ${p.vehicle_model}`);
  if (p.vehicle_year) vehicleSpecs.push(`• *Year:* ${p.vehicle_year}`);
  if (p.vehicle_odometer !== undefined && p.vehicle_odometer !== null) {
    vehicleSpecs.push(`• *Odometer:* ${p.vehicle_odometer.toLocaleString('en-IN')} km`);
  }
  if (p.vehicle_fuel_type) vehicleSpecs.push(`• *Fuel Type:* ${p.vehicle_fuel_type}`);
  if (p.vehicle_transmission) vehicleSpecs.push(`• *Transmission:* ${p.vehicle_transmission}`);
  if (p.vehicle_owner) {
    const ownerStr = p.vehicle_owner === '1' ? '1st' : p.vehicle_owner === '2' ? '2nd' : p.vehicle_owner === '3' ? '3rd' : p.vehicle_owner;
    vehicleSpecs.push(`• *Owner:* ${ownerStr} Owner`);
  }
  if (p.vehicle_color) vehicleSpecs.push(`• *Color:* ${p.vehicle_color}`);

  if (vehicleSpecs.length > 0) {
    text += `\n*Specifications:*\n` + vehicleSpecs.join('\n') + `\n`;
  }

  return text;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [brands, setBrands] = useState<ProductBrand[]>([]);
  const [loading, setLoading] = useState(true);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstSlabs, setGstSlabs] = useState<GstTaxSlab[]>([]);
  const [masterProductsEnabled, setMasterProductsEnabled] = useState(false);
  const [productFilter, setProductFilter] = useState<ProductFilter>('all');
  const [columnSettings, setColumnSettings] = useState<ProductTableColumns>(DEFAULT_TABLE_COLUMNS);
  const [open, setOpen] = useState(false);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined);
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [imagesDialogOpen, setImagesDialogOpen] = useState(false);
  const [imagesProduct, setImagesProduct] = useState<Product | null>(null);
  const [r2Enabled, setR2Enabled] = useState(false);
  const [r2WebsiteUrl, setR2WebsiteUrl] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [sharingProduct, setSharingProduct] = useState<Product | null>(null);
  const [isSharingWhatsapp, setIsSharingWhatsapp] = useState(false);
  const [whatsappShareEnabled, setWhatsappShareEnabled] = useState(false);
  const currentUser = useSelector((state: RootState) => state.app.currentUser);

  const load = async () => {
    try {
      setLoading(true);
      const [p, u, g, b, gstSettings, slabs, masterSetting, colSetting, r2En, r2Wu, waShare] = await Promise.all([
        showDeleted ? api.products.listDeleted() : api.products.list(),
        api.units.list(),
        api.productGroups.list(),
        api.productBrands.list(),
        api.gst.getSettings(),
        api.gst.getSlabs(),
        invoke<string | null>('get_app_setting', { key: 'enable_master_products' }),
        invoke<string | null>('get_app_setting', { key: 'product_table_columns' }),
        invoke<string | null>('get_app_setting', { key: 'r2_sync_enabled' }),
        invoke<string | null>('get_app_setting', { key: 'r2_website_url' }),
        invoke<string | null>('get_app_setting', { key: 'whatsapp_share_enabled' }),
      ]);
      setProducts(p);
      setUnits(u);
      setGroups(g);
      setBrands(b);
      setGstEnabled(gstSettings.gst_enabled);
      setGstSlabs(slabs);
      setMasterProductsEnabled(masterSetting === 'true');
      if (colSetting) {
        try { setColumnSettings({ ...DEFAULT_TABLE_COLUMNS, ...JSON.parse(colSetting) }); } catch { /* ignore */ }
      }
      setR2Enabled(r2En === 'true');
      setR2WebsiteUrl(r2Wu?.trim().replace(/\/$/, '') || '');
      setWhatsappShareEnabled(waShare === 'true');
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
  const handleBrandsChange = () => load();

  const handleSyncCatalog = async () => {
    setSyncing(true);
    try {
      await api.products.syncAllToR2();
      toast.success('Catalog synced to R2 successfully!');
    } catch (error: any) {
      toast.error(error?.toString() || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleCopyLink = (productId: string) => {
    const base = r2WebsiteUrl || '';
    const url = base ? `${base}/?id=${productId}` : productId;
    navigator.clipboard.writeText(url).then(() => {
      toast.success('Product link copied!');
    }).catch(() => {
      toast.error('Failed to copy link');
    });
  };

  const handleShareWhatsApp = async (product: Product) => {
    try {
      setSharingProduct(product);
      setIsSharingWhatsapp(true);

      const specsText = formatProductSpecs(product);
      const imgs = await api.products.getImages(product.id);
      const paths = imgs.map(img => img.image_path);

      try {
        await openUrl("whatsapp://");
      } catch (err) {
        console.warn("whatsapp:// native protocol failed, falling back to wa.me:", err);
        await openUrl("https://wa.me/");
      }
      await new Promise(resolve => setTimeout(resolve, 1200));

      await invoke("share_listing_to_whatsapp", { specsText, imagePaths: paths });
      toast.success("Product info shared to WhatsApp successfully!");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.toString() || "Failed to share listing to WhatsApp");
    } finally {
      setIsSharingWhatsapp(false);
      setSharingProduct(null);
    }
  };

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
                    <Button variant="outline" onClick={() => setImportOpen(true)}>
                      <IconFileUpload size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Import Products</TooltipContent>
                </Tooltip>
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
                    <Button variant="outline" onClick={() => setBrandsOpen(true)}>
                      <IconTag size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Manage Brands</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" onClick={() => setUnitsOpen(true)}>
                      <IconRuler size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Manage Units</TooltipContent>
                </Tooltip>
                {r2Enabled && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={handleSyncCatalog}
                        disabled={syncing}
                        id="sync-catalog-btn"
                      >
                        <IconCloudUpload size={16} className={syncing ? 'animate-pulse' : ''} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Sync Catalog</TooltipContent>
                  </Tooltip>
                )}
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
                {columnSettings.code && <th className="p-3">Code</th>}
                <th className="p-3">Name</th>
                {columnSettings.hsn_sac_code && <th className="p-3">HSN Code</th>}
                {columnSettings.group && <th className="p-3">Group</th>}
                {columnSettings.brand && <th className="p-3">Brand</th>}
                {columnSettings.unit && <th className="p-3">Unit</th>}
                {columnSettings.purchase_rate && <th className="p-3">Purchase</th>}
                {columnSettings.sales_rate && <th className="p-3">Sales</th>}
                {columnSettings.mrp && <th className="p-3">MRP</th>}
                {columnSettings.cost && <th className="p-3">Cost</th>}
                {gstEnabled && columnSettings.tax_slab && <th className="p-3">Tax Slab</th>}
                {columnSettings.vehicle_manufacturer && <th className="p-3">Manufacturer</th>}
                {columnSettings.vehicle_model && <th className="p-3">Model</th>}
                {columnSettings.vehicle_year && <th className="p-3">Year</th>}
                {columnSettings.vehicle_odometer && <th className="p-3">Odometer</th>}
                {columnSettings.vehicle_fuel_type && <th className="p-3">Fuel Type</th>}
                {columnSettings.vehicle_transmission && <th className="p-3">Transmission</th>}
                {columnSettings.vehicle_owner && <th className="p-3">Owner</th>}
                {columnSettings.vehicle_color && <th className="p-3">Color</th>}
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      3 +
                      (columnSettings.code ? 1 : 0) +
                      (columnSettings.hsn_sac_code ? 1 : 0) +
                      (columnSettings.group ? 1 : 0) +
                      (columnSettings.brand ? 1 : 0) +
                      (columnSettings.unit ? 1 : 0) +
                      (columnSettings.purchase_rate ? 1 : 0) +
                      (columnSettings.sales_rate ? 1 : 0) +
                      (columnSettings.mrp ? 1 : 0) +
                      (columnSettings.cost ? 1 : 0) +
                      (gstEnabled && columnSettings.tax_slab ? 1 : 0) +
                      (columnSettings.vehicle_manufacturer ? 1 : 0) +
                      (columnSettings.vehicle_model ? 1 : 0) +
                      (columnSettings.vehicle_year ? 1 : 0) +
                      (columnSettings.vehicle_odometer ? 1 : 0) +
                      (columnSettings.vehicle_fuel_type ? 1 : 0) +
                      (columnSettings.vehicle_transmission ? 1 : 0) +
                      (columnSettings.vehicle_owner ? 1 : 0) +
                      (columnSettings.vehicle_color ? 1 : 0)
                    }
                    className="p-4 text-center text-muted-foreground"
                  >
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
                      {columnSettings.code && <td className="p-3 font-mono text-sm">{p.code}</td>}
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
                      {columnSettings.hsn_sac_code && <td className="p-3 text-sm">{p.hsn_sac_code || '-'}</td>}
                      {columnSettings.group && <td className="p-3 text-sm">{groups.find(g => g.id === p.group_id)?.name || '-'}</td>}
                      {columnSettings.brand && <td className="p-3 text-sm">{brands.find(b => b.id === p.brand_id)?.name || '-'}</td>}
                      {columnSettings.unit && <td className="p-3">{units.find(u => u.id === p.unit_id)?.symbol || '-'}</td>}
                      {columnSettings.purchase_rate && <td className="p-3">{isMaster ? <span className="text-muted-foreground text-xs italic">—</span> : `₹${p.purchase_rate.toFixed(2)}`}</td>}
                      {columnSettings.sales_rate && <td className="p-3">{isMaster ? <span className="text-muted-foreground text-xs italic">—</span> : `₹${p.sales_rate.toFixed(2)}`}</td>}
                      {columnSettings.mrp && <td className="p-3">{isMaster ? <span className="text-muted-foreground text-xs italic">—</span> : `₹${p.mrp.toFixed(2)}`}</td>}
                      {columnSettings.cost && <td className="p-3">{isMaster ? <span className="text-muted-foreground text-xs italic">—</span> : p.cost !== undefined && p.cost !== null ? `₹${p.cost.toFixed(2)}` : '-'}</td>}
                      {gstEnabled && columnSettings.tax_slab && (
                        <td className="p-3 text-sm">
                          {gstSlabs.find(s => s.id === p.gst_slab_id)?.name || '-'}
                        </td>
                      )}
                      {columnSettings.vehicle_manufacturer && <td className="p-3 text-sm">{p.vehicle_manufacturer || '-'}</td>}
                      {columnSettings.vehicle_model && <td className="p-3 text-sm">{p.vehicle_model || '-'}</td>}
                      {columnSettings.vehicle_year && <td className="p-3 text-sm font-mono">{p.vehicle_year || '-'}</td>}
                      {columnSettings.vehicle_odometer && (
                        <td className="p-3 text-sm font-mono">
                          {p.vehicle_odometer !== undefined && p.vehicle_odometer !== null ? `${p.vehicle_odometer.toLocaleString()} km` : '-'}
                        </td>
                      )}
                      {columnSettings.vehicle_fuel_type && <td className="p-3 text-sm">{p.vehicle_fuel_type || '-'}</td>}
                      {columnSettings.vehicle_transmission && <td className="p-3 text-sm">{p.vehicle_transmission || '-'}</td>}
                      {columnSettings.vehicle_owner && (
                        <td className="p-3 text-sm">
                          {p.vehicle_owner ? `${p.vehicle_owner} Owner` : '-'}
                        </td>
                      )}
                      {columnSettings.vehicle_color && <td className="p-3 text-sm">{p.vehicle_color || '-'}</td>}
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                              <IconDotsVertical size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!showDeleted ? (
                              <>
                                <DropdownMenuItem onClick={() => handleEdit(p)}>
                                  <IconEdit size={14} className="mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setBarcodeProduct(p); setBarcodeDialogOpen(true); }}>
                                  <IconBarcode size={14} className="mr-2" /> Print Barcode
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => { setImagesProduct(p); setImagesDialogOpen(true); }}>
                                  <IconPhoto size={14} className="mr-2" /> Manage Images
                                </DropdownMenuItem>
                                {whatsappShareEnabled && (
                                  <DropdownMenuItem onClick={() => handleShareWhatsApp(p)}>
                                    <IconBrandWhatsapp size={14} className="mr-2 text-green-500" /> Share on WhatsApp
                                  </DropdownMenuItem>
                                )}
                                {r2Enabled && (
                                  <DropdownMenuItem onClick={() => handleCopyLink(p.id)}>
                                    <IconLink size={14} className="mr-2" /> Copy Public Link
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => handleDelete(p.id)}
                                >
                                  <IconTrash size={14} className="mr-2" /> Move to Recycle Bin
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  className="text-blue-600 focus:text-blue-600"
                                  onClick={() => handleRestore(p.id)}
                                >
                                  <IconRefresh size={14} className="mr-2" /> Restore
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => handleHardDelete(p.id)}
                                >
                                  <IconTrashFilled size={14} className="mr-2" /> Delete Permanently
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
        brands={brands}
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

      {/* Product Brands Management Dialog Component */}
      <ProductBrandsDialog
        open={brandsOpen}
        onOpenChange={setBrandsOpen}
        onBrandsChange={handleBrandsChange}
      />

      {/* Product Images Dialog */}
      <ProductImagesDialog
        open={imagesDialogOpen}
        onOpenChange={setImagesDialogOpen}
        productId={imagesProduct?.id || ''}
        productName={imagesProduct?.name || ''}
      />

      {/* Barcode Label Dialog */}
      <BarcodeLabelDialog
        open={barcodeDialogOpen}
        onOpenChange={setBarcodeDialogOpen}
        products={barcodeProduct ? [{ code: barcodeProduct.code, name: barcodeProduct.name, salesRate: barcodeProduct.sales_rate }] : []}
      />

      <ImportExcelDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Products from Excel"
        expectedColumns={['name', 'code', 'group', 'unit', 'purchase_rate', 'sales_rate', 'mrp', 'barcode', 'hsn_sac_code']}
        sampleData={[
          {
            name: "Premium Widget",
            code: "PW-001",
            group: "General",
            unit: "PCS",
            purchase_rate: 100.0,
            sales_rate: 150.0,
            mrp: 199.0,
            barcode: "1234567890123",
            hsn_sac_code: "8471"
          }
        ]}
        onImport={async (data) => {
          if (units.length === 0) {
            throw new Error("You must have at least one unit created before importing products.");
          }

          const defaultUnitId = units[0].id;
          
          const validData = data.filter(r => r.name && String(r.name).trim() !== '');
          const formatted = validData.map(r => {
            const unitName = String(r.unit || '').trim().toLowerCase();
            const matchedUnit = units.find(u => u.name.toLowerCase() === unitName || u.symbol.toLowerCase() === unitName);
            const unitId = matchedUnit ? matchedUnit.id : defaultUnitId;

            const groupName = String(r.group || '').trim().toLowerCase();
            const matchedGroup = groups.find(g => g.name.toLowerCase() === groupName);
            const groupId = matchedGroup ? matchedGroup.id : undefined;

            return {
              name: String(r.name),
              code: r.code ? String(r.code) : '',
              group_id: groupId,
              unit_id: unitId,
              purchase_rate: Number(r.purchase_rate) || 0,
              sales_rate: Number(r.sales_rate) || 0,
              mrp: Number(r.mrp) || 0,
              barcode: r.barcode ? String(r.barcode) : undefined,
              hsn_sac_code: r.hsn_sac_code ? String(r.hsn_sac_code) : undefined,
              conversions: [],
              is_master: false
            };
          });
          
          await api.products.batchCreate(formatted);
          load();
        }}
      />

      {/* WhatsApp Sharing Overlay Modal */}
      {isSharingWhatsapp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center">
          <div className="bg-card border p-6 rounded-lg max-w-md w-full shadow-2xl text-center space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="relative mx-auto w-16 h-16 flex items-center justify-center bg-green-100 dark:bg-green-950/50 rounded-full text-green-500">
              <IconBrandWhatsapp size={36} className="animate-bounce" />
              <div className="absolute inset-0 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
            </div>
            <h3 className="text-lg font-bold">Sharing listing to WhatsApp</h3>
            <p className="text-sm text-muted-foreground">
              Sending assets to WhatsApp... Please do not switch windows or click away.
            </p>
            {sharingProduct && (
              <div className="bg-muted p-3 rounded text-left text-xs font-mono max-h-32 overflow-y-auto border whitespace-pre-wrap">
                {formatProductSpecs(sharingProduct)}
              </div>
            )}
            <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2 rounded border border-amber-500/20">
              <strong>Crucial:</strong> Ensure WhatsApp is open and the active chat has cursor focus so the automated pasting lands in the correct message box!
            </div>
          </div>
        </div>
      )}
    </div>
  );
}