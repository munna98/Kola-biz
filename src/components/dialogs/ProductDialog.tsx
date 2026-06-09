import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { IconCheck, IconCircleDashedPlus, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { api, Product, CreateProduct, Unit, ProductGroup, ProductBrand, CreateProductUnitConversion, GstTaxSlab } from '@/lib/tauri';
import { toast } from 'sonner';
import { useDialog } from '@/hooks/use-dialog';
import { invoke } from '@tauri-apps/api/core';
import { type ProductDialogFields, DEFAULT_DIALOG_FIELDS } from '@/pages/settings/ProductSettingsPage';

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: Unit[];
  groups: ProductGroup[];
  brands?: ProductBrand[];
  product?: Product;
  onSuccess?: () => void;
}

interface ConversionRow extends CreateProductUnitConversion {
  key: string;
  is_base: boolean;
}

const POPULAR_MODELS: Record<string, string[]> = {
  'Maruti Suzuki': ['Swift', 'Baleno', 'Dzire', 'Alto', 'Wagon R', 'Vitara Brezza', 'Ertiga', 'Celerio', 'Ignis', 'S-Presso', 'Grand Vitara', 'Fronx', 'Jimny'],
  'Hyundai': ['i20', 'i10 Grand', 'Creta', 'Verna', 'Venue', 'Alcazar', 'Tucson', 'Aura', 'Exter'],
  'Tata': ['Nexon', 'Altroz', 'Tiago', 'Tigor', 'Harrier', 'Safari', 'Punch', 'Curvv'],
  'Mahindra': ['Thar', 'XUV700', 'Scorpio Classic', 'Scorpio-N', 'Bolero', 'XUV300', 'XUV400', 'Marazzo'],
  'Honda': ['City', 'Amaze', 'Elevate', 'Civic', 'Jazz', 'WR-V'],
  'Toyota': ['Innova Crysta', 'Innova Hycross', 'Fortuner', 'Glanza', 'Urban Cruiser Taisor', 'Hilux', 'Camry'],
  'Ford': ['EcoSport', 'Endeavour', 'Figo', 'Aspire', 'Freestyle'],
  'Renault': ['Kwid', 'Triber', 'Kiger', 'Duster'],
  'Kia': ['Seltos', 'Sonet', 'Carens', 'Carnival', 'EV6'],
  'MG': ['Hector', 'Astor', 'ZS EV', 'Comet EV', 'Gloster'],
  'Volkswagen': ['Virtus', 'Taigun', 'Polo', 'Vento', 'Tiguan'],
  'Skoda': ['Slavia', 'Kushaq', 'Octavia', 'Superb', 'Kodiaq'],
  'Nissan': ['Magnite', 'Kicks', 'Sunny'],
  'Jeep': ['Compass', 'Meridian', 'Wrangler'],
  'Mercedes-Benz': ['C-Class', 'E-Class', 'S-Class', 'GLA', 'GLC', 'GLE', 'GLS'],
  'BMW': ['3 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X7'],
  'Audi': ['A4', 'A6', 'A8', 'Q3', 'Q5', 'Q7', 'e-tron'],
  'Volvo': ['XC40', 'XC60', 'XC90', 'S90'],
  'Mitsubishi': ['Lancer', 'Pajero', 'Outlander', 'Cedia', 'Montero'],
};

const getDefaultUnitId = (units: Unit[]) => units.find((unit) => unit.is_default === 1)?.id || units[0]?.id || '';

const createBaseRow = (unitId: string, purchaseRate = 0, salesRate = 0): ConversionRow => ({
  key: `base-${unitId || 'empty'}`,
  unit_id: unitId,
  factor_to_base: 1,
  purchase_rate: purchaseRate,
  sales_rate: salesRate,
  is_default_sale: true,
  is_default_purchase: true,
  is_default_report: true,
  is_base: true
});

const createExtraRow = (unitId = ''): ConversionRow => ({
  key: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  unit_id: unitId,
  factor_to_base: 1,
  purchase_rate: 0,
  sales_rate: 0,
  is_default_sale: false,
  is_default_purchase: false,
  is_default_report: false,
  is_base: false
});

const normalizeRows = (
  rows: ConversionRow[],
  baseUnitId: string,
  basePurchaseRate: number,
  baseSalesRate: number
): ConversionRow[] => {
  const withoutEmpty = rows.filter((row) => row.is_base || row.unit_id);
  const baseRow = withoutEmpty.find((row) => row.is_base) ?? createBaseRow(baseUnitId, basePurchaseRate, baseSalesRate);
  const baseNormalized = {
    ...baseRow,
    key: `base-${baseUnitId || 'empty'}`,
    unit_id: baseUnitId,
    factor_to_base: 1,
    purchase_rate: basePurchaseRate,
    sales_rate: baseSalesRate,
    is_base: true
  };

  const extras: ConversionRow[] = [];
  for (const row of withoutEmpty) {
    if (row.is_base || !row.unit_id || row.unit_id === baseUnitId) continue;
    if (extras.some((item) => item.unit_id === row.unit_id)) continue;
    extras.push(row);
  }

  const combined = [baseNormalized, ...extras];
  const ensureOneDefault = (field: 'is_default_sale' | 'is_default_purchase' | 'is_default_report') => {
    if (!combined.some((row) => row[field])) {
      combined[0][field] = true;
    }
  };

  ensureOneDefault('is_default_sale');
  ensureOneDefault('is_default_purchase');
  ensureOneDefault('is_default_report');

  return combined;
};

export default function ProductDialog({
  open,
  onOpenChange,
  units,
  groups,
  brands = [],
  product,
  onSuccess
}: ProductDialogProps) {
  const defaultUnitId = getDefaultUnitId(units);
  const [form, setForm] = useState<CreateProduct>({
    code: '',
    name: '',
    barcode: '',
    unit_id: defaultUnitId,
    purchase_rate: 0,
    sales_rate: 0,
    mrp: 0,
    cost: 0,
    conversions: defaultUnitId ? [createBaseRow(defaultUnitId)] : [],
    hsn_sac_code: '',
    gst_slab_id: 'gst_0',
    brand_id: undefined,
    vehicle_manufacturer: undefined,
    vehicle_model: undefined,
    vehicle_year: undefined,
    vehicle_odometer: undefined,
    vehicle_fuel_type: undefined,
    vehicle_transmission: undefined,
    vehicle_owner: undefined,
    vehicle_color: undefined,
  });
  const [isMaster, setIsMaster] = useState(false);
  const [masterProductsEnabled, setMasterProductsEnabled] = useState(false);
  const [conversionRows, setConversionRows] = useState<ConversionRow[]>(defaultUnitId ? [createBaseRow(defaultUnitId)] : []);
  const [loading, setLoading] = useState(false);
  const [showUnitSection, setShowUnitSection] = useState(false);
  const [gstSlabs, setGstSlabs] = useState<GstTaxSlab[]>([]);
  const [dialogFields, setDialogFields] = useState<ProductDialogFields>(DEFAULT_DIALOG_FIELDS);
  const unitLocked = Boolean(product?.has_transactions);

  const orderedFields = ['code', 'name', 'group', 'brand', 'unit', 'hsn', 'gst_slab', 'purchase', 'sales', 'mrp', 'cost', 'barcode'];

  const { register, handleKeyDown, handleSelectKeyDown, parseNumber, formatNumber } = useDialog(
    open,
    onOpenChange,
    orderedFields
  );

  // Load GST slabs once
  useEffect(() => {
    api.gst.getSlabs().then(setGstSlabs).catch(console.error);
    // Load master product feature flag
    invoke<string | null>('get_app_setting', { key: 'enable_master_products' })
      .then(v => setMasterProductsEnabled(v === 'true'))
      .catch(console.error);
    // Load dialog field visibility settings
    invoke<string | null>('get_app_setting', { key: 'product_dialog_fields' })
      .then(v => {
        if (v) {
          try { setDialogFields({ ...DEFAULT_DIALOG_FIELDS, ...JSON.parse(v) }); } catch { /* ignore */ }
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!open) return;

    const initialUnitId = product?.unit_id || getDefaultUnitId(units);
    const initialPurchaseRate = product?.purchase_rate || 0;
    const initialSalesRate = product?.sales_rate || 0;
    setShowUnitSection(false);

    const loadDialogData = async () => {
      if (product) {
        setIsMaster(product.is_master === 1);
        setForm({
          code: product.code,
          name: product.name,
          barcode: product.barcode || '',
          group_id: product.group_id,
          brand_id: product.brand_id,
          unit_id: product.unit_id,
          purchase_rate: product.purchase_rate,
          sales_rate: product.sales_rate,
          mrp: product.mrp,
          cost: product.cost || 0,
          conversions: [],
          hsn_sac_code: product.hsn_sac_code || '',
          gst_slab_id: product.gst_slab_id,
          is_master: product.is_master === 1,
          vehicle_manufacturer: product.vehicle_manufacturer,
          vehicle_model: product.vehicle_model,
          vehicle_year: product.vehicle_year,
          vehicle_odometer: product.vehicle_odometer,
          vehicle_fuel_type: product.vehicle_fuel_type,
          vehicle_transmission: product.vehicle_transmission,
          vehicle_owner: product.vehicle_owner,
          vehicle_color: product.vehicle_color,
        });

        try {
          const conversions = await api.products.listUnitConversions(product.id);
          const rows = normalizeRows(
            conversions.map((conversion) => ({
              key: conversion.id,
              unit_id: conversion.unit_id,
              factor_to_base: conversion.factor_to_base,
              purchase_rate: conversion.purchase_rate,
              sales_rate: conversion.sales_rate,
              is_default_sale: conversion.is_default_sale === 1,
              is_default_purchase: conversion.is_default_purchase === 1,
              is_default_report: conversion.is_default_report === 1,
              is_base: conversion.unit_id === product.unit_id
            })),
            product.unit_id,
            product.purchase_rate,
            product.sales_rate
          );
          setConversionRows(rows);
        } catch (error) {
          console.error(error);
          toast.error('Failed to load product units');
          setConversionRows([createBaseRow(product.unit_id, product.purchase_rate, product.sales_rate)]);
        }
      } else {
        setIsMaster(false);
        setForm({
          code: '',
          name: '',
          barcode: '',
          group_id: undefined,
          brand_id: undefined,
          unit_id: initialUnitId,
          purchase_rate: 0,
          sales_rate: 0,
          mrp: 0,
          cost: 0,
          conversions: [],
          hsn_sac_code: '',
          gst_slab_id: 'gst_0',
          is_master: false,
          vehicle_manufacturer: undefined,
          vehicle_model: undefined,
          vehicle_year: undefined,
          vehicle_odometer: undefined,
          vehicle_fuel_type: undefined,
          vehicle_transmission: undefined,
          vehicle_owner: undefined,
          vehicle_color: undefined,
        });
        setConversionRows(initialUnitId ? [createBaseRow(initialUnitId, initialPurchaseRate, initialSalesRate)] : []);
      }
    };

    loadDialogData();
  }, [open, product, units]);

  useEffect(() => {
    if (open && !product) {
      // Only auto-generate code for non-master products
      if (!isMaster) {
        api.products.getNextCode().then((code) => {
          setForm(prev => ({ ...prev, code }));
        }).catch(console.error);
      } else {
        setForm(prev => ({ ...prev, code: '' }));
      }
    }
  }, [open, product, isMaster]);

  useEffect(() => {
    if (!open || !form.unit_id) return;
    setConversionRows((prev) => normalizeRows(prev, form.unit_id, form.purchase_rate, form.sales_rate));
  }, [form.unit_id, form.purchase_rate, form.sales_rate, open]);

  const resetForm = () => {
    const unitId = getDefaultUnitId(units);
    setIsMaster(false);
    setForm({
      code: '',
      name: '',
      barcode: '',
      group_id: undefined,
      brand_id: undefined,
      unit_id: unitId,
      purchase_rate: 0,
      sales_rate: 0,
      mrp: 0,
      cost: 0,
      conversions: [],
      hsn_sac_code: '',
      gst_slab_id: 'gst_0',
      is_master: false,
      vehicle_manufacturer: undefined,
      vehicle_model: undefined,
      vehicle_year: undefined,
      vehicle_odometer: undefined,
      vehicle_fuel_type: undefined,
      vehicle_transmission: undefined,
      vehicle_owner: undefined,
      vehicle_color: undefined,
    });
    setConversionRows(unitId ? [createBaseRow(unitId)] : []);
    setShowUnitSection(false);
  };

  const setDefaultFlag = (
    rowIndex: number,
    field: 'is_default_sale' | 'is_default_purchase' | 'is_default_report',
    checked: boolean
  ) => {
    setConversionRows((prev) => prev.map((row, index) => ({
      ...row,
      [field]: checked ? index === rowIndex : (index === rowIndex ? false : row[field])
    })));
  };

  const updateConversionRow = (rowIndex: number, patch: Partial<ConversionRow>) => {
    setConversionRows((prev) => {
      const next = prev.map((row, index) => index === rowIndex ? { ...row, ...patch } : row);
      return normalizeRows(next, form.unit_id, form.purchase_rate, form.sales_rate);
    });
  };

  const removeConversionRow = (rowIndex: number) => {
    setConversionRows((prev) => normalizeRows(
      prev.filter((_, index) => index !== rowIndex),
      form.unit_id,
      form.purchase_rate,
      form.sales_rate
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.code.trim()) {
      toast.error(isMaster ? 'Master products require a unique code (e.g. SHIRT-M).' : 'Product code is required');
      return;
    }

    if (!form.name.trim()) {
      toast.error('Product name is required');
      return;
    }

    if (!form.unit_id) {
      toast.error('Base unit is required');
      return;
    }

    const normalizedConversions = normalizeRows(
      conversionRows,
      form.unit_id,
      form.purchase_rate,
      form.sales_rate
    ).map(({ key, is_base, ...row }) => row);

    try {
      setLoading(true);
      const payload: CreateProduct = {
        ...form,
        cost: (!product && (!form.cost || form.cost === 0)) ? form.purchase_rate : form.cost,
        is_master: isMaster,
        conversions: normalizedConversions
      };

      if (product) {
        await api.products.update(product.id, payload);
        toast.success('Product updated successfully');
        onOpenChange(false);
      } else {
        await api.products.create(payload);
        toast.success('Product created successfully');
        resetForm();
      }
      onSuccess?.();
    } catch (error) {
      const errorMessage = typeof error === 'string'
        ? error
        : (error instanceof Error ? error.message : String(error));
      toast.error(errorMessage || (product ? 'Failed to update product' : 'Failed to create product'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit' : 'Add'} Product</DialogTitle>
          <DialogDescription>
            {product
              ? 'Update the details of the existing product.'
              : 'Fill in the details to add a new product to your inventory.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Master Product Toggle — only shown when feature is enabled */}
          {masterProductsEnabled && !product?.parent_product_id && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 px-4 py-2.5">
              <Switch
                id="is-master-toggle"
                checked={isMaster}
                onCheckedChange={(checked) => {
                  setIsMaster(checked);
                  setForm(prev => ({
                    ...prev,
                    is_master: checked,
                    // Clear code when switching to master so user types their own
                    code: checked ? '' : prev.code,
                  }));
                  // When turning off master mode, re-fetch the next sequential code
                  if (!checked && !product) {
                    api.products.getNextCode().then(code => setForm(prev => ({ ...prev, code }))).catch(console.error);
                  }
                }}
              />
              <div>
                <Label htmlFor="is-master-toggle" className="text-sm font-medium cursor-pointer">
                  Master Product (Template)
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isMaster
                    ? 'Child batches with auto-generated codes will be created per purchase line.'
                    : 'Enable to use this product as a template for batch creation during purchase.'}
                </p>
              </div>
              {isMaster && (
                <Badge variant="secondary" className="ml-auto shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                  Master
                </Badge>
              )}
            </div>
          )}

          {/* Read-only child batch notice */}
          {product?.parent_product_id && (
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20 px-4 py-2.5">
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">Batch</Badge>
              <p className="text-xs text-muted-foreground">
                This is a child batch. Name and tax fields are inherited from the master product.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            {dialogFields.code && (
              <div>
                <Label className="text-xs font-medium mb-1 block">Code *</Label>
                <Input
                  ref={register('code') as any}
                  value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value })}
                  onKeyDown={(e) => handleKeyDown(e, 'code')}
                  placeholder="e.g., PROD001"
                  className="h-8 text-sm"
                />
              </div>
            )}
            <div className={dialogFields.code ? '' : 'col-span-2'}>
              <Label className="text-xs font-medium mb-1 block">Name *</Label>
              <Input
                ref={register('name') as any}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => handleKeyDown(e, 'name')}
                placeholder="e.g., Product Name"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {(dialogFields.group || dialogFields.brand) && (
            <div className="grid grid-cols-3 gap-4">
              {dialogFields.group && (
                <div>
                  <Label className="text-xs font-medium mb-1 block">Product Group</Label>
                  <Select
                    value={form.group_id?.toString() || 'none'}
                    onValueChange={v => setForm({ ...form, group_id: v === 'none' ? undefined : v })}
                  >
                    <SelectTrigger
                      ref={register('group') as any}
                      className="h-8 text-sm"
                      onKeyDown={(e) => handleSelectKeyDown(e, 'group')}
                    >
                      <SelectValue placeholder="Select a group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Group</SelectItem>
                      {groups.map(g => (
                        <SelectItem key={g.id} value={g.id.toString()}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {dialogFields.brand && (
                <div>
                  <Label className="text-xs font-medium mb-1 block">Brand</Label>
                  <Select
                    value={form.brand_id?.toString() || 'none'}
                    onValueChange={v => setForm({ ...form, brand_id: v === 'none' ? undefined : v })}
                  >
                    <SelectTrigger
                      ref={register('brand') as any}
                      className="h-8 text-sm"
                      onKeyDown={(e) => handleSelectKeyDown(e, 'brand')}
                    >
                      <SelectValue placeholder="Select a brand" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Brand</SelectItem>
                      {brands.map(b => (
                        <SelectItem key={b.id} value={b.id.toString()}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {/* Base Unit always in this row when group/brand row is visible */}
              <div>
                <Label className="text-xs font-medium mb-1 block">Base Unit</Label>
                <div className="flex gap-1">
                  <Select
                    value={form.unit_id}
                    onValueChange={v => setForm({ ...form, unit_id: v })}
                    disabled={unitLocked}
                  >
                    <SelectTrigger
                      ref={register('unit') as any}
                      className="h-8 text-sm"
                      onKeyDown={(e) => handleSelectKeyDown(e, 'unit')}
                      disabled={unitLocked}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => setShowUnitSection((prev) => !prev)}
                    tabIndex={-1}
                  >
                    <IconCircleDashedPlus size={14} />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Base Unit standalone row — shown when both Group and Brand are hidden */}
          {!dialogFields.group && !dialogFields.brand && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-medium mb-1 block">Base Unit</Label>
                <div className="flex gap-1">
                  <Select
                    value={form.unit_id}
                    onValueChange={v => setForm({ ...form, unit_id: v })}
                    disabled={unitLocked}
                  >
                    <SelectTrigger
                      ref={register('unit') as any}
                      className="h-8 text-sm"
                      onKeyDown={(e) => handleSelectKeyDown(e, 'unit')}
                      disabled={unitLocked}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {units.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => setShowUnitSection((prev) => !prev)}
                    tabIndex={-1}
                  >
                    <IconCircleDashedPlus size={14} />
                  </Button>
                </div>
              </div>
            </div>
          )}


          {/* ── GST / HSN fields ── */}
          {(dialogFields.hsn_sac_code || dialogFields.gst_slab) && (
            <div className="grid grid-cols-2 gap-4">
              {dialogFields.hsn_sac_code && (
                <div>
                  <Label className="text-xs font-medium mb-1 block">HSN / SAC Code</Label>
                  <Input
                    ref={register('hsn') as any}
                    value={form.hsn_sac_code || ''}
                    onChange={e => setForm({ ...form, hsn_sac_code: e.target.value })}
                    onKeyDown={(e) => handleKeyDown(e, 'hsn')}
                    placeholder="e.g. 6109"
                    className="h-8 text-sm font-mono"
                  />
                </div>
              )}
              {dialogFields.gst_slab && (
                <div>
                  <Label className="text-xs font-medium mb-1 block">GST Category</Label>
                  <Select
                    value={form.gst_slab_id || 'gst_0'}
                    onValueChange={v => setForm({ ...form, gst_slab_id: v })}
                  >
                    <SelectTrigger
                      ref={register('gst_slab') as any}
                      className="h-8 text-sm"
                      onKeyDown={(e) => handleSelectKeyDown(e, 'gst_slab')}
                    >
                      <SelectValue placeholder="NIL" />
                    </SelectTrigger>
                    <SelectContent>
                      {gstSlabs.filter(s => s.is_active === 1).map(slab => (
                        <SelectItem key={slab.id} value={slab.id}>
                          <span className="flex items-center gap-2">
                            {slab.name}
                            {slab.is_dynamic === 1 && (
                              <Badge variant="secondary" className="text-[10px] py-0 px-1 ml-1">Threshold</Badge>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {(dialogFields.purchase_rate || dialogFields.sales_rate || dialogFields.mrp || dialogFields.cost || dialogFields.barcode) && (
            <div className="grid grid-cols-4 gap-4">
              {dialogFields.purchase_rate && (
                <div>
                  <Label className="text-xs font-medium mb-1 block">Purchase Rate</Label>
                  <Input
                    ref={register('purchase') as any}
                    type="number"
                    step="0.01"
                    value={formatNumber(form.purchase_rate)}
                    onChange={e => setForm({ ...form, purchase_rate: parseNumber(e.target.value) })}
                    onKeyDown={(e) => handleKeyDown(e, 'purchase')}
                    placeholder="0.00"
                    className="h-8 text-sm text-right font-mono"
                  />
                </div>
              )}
              {dialogFields.sales_rate && (
                <div>
                  <Label className="text-xs font-medium mb-1 block">Sales Rate</Label>
                  <Input
                    ref={register('sales') as any}
                    type="number"
                    step="0.01"
                    value={formatNumber(form.sales_rate)}
                    onChange={e => setForm({ ...form, sales_rate: parseNumber(e.target.value) })}
                    onKeyDown={(e) => handleKeyDown(e, 'sales')}
                    placeholder="0.00"
                    className="h-8 text-sm text-right font-mono"
                  />
                </div>
              )}
              {dialogFields.mrp && (
                <div>
                  <Label className="text-xs font-medium mb-1 block">MRP</Label>
                  <Input
                    ref={register('mrp') as any}
                    type="number"
                    step="0.01"
                    value={formatNumber(form.mrp)}
                    onChange={e => setForm({ ...form, mrp: parseNumber(e.target.value) })}
                    onKeyDown={(e) => handleKeyDown(e, 'mrp')}
                    placeholder="0.00"
                    className="h-8 text-sm text-right font-mono"
                  />
                </div>
              )}
              {dialogFields.cost && (
                <div>
                  <Label className="text-xs font-medium mb-1 block">Cost</Label>
                  <Input
                    ref={register('cost') as any}
                    type="number"
                    step="0.01"
                    value={formatNumber(form.cost)}
                    onChange={e => setForm({ ...form, cost: parseNumber(e.target.value) })}
                    onKeyDown={(e) => handleKeyDown(e, 'cost')}
                    placeholder="0.00"
                    className="h-8 text-sm text-right font-mono"
                  />
                </div>
              )}
              {dialogFields.barcode && (
                <div>
                  <Label className="text-xs font-medium mb-1 block">Barcode</Label>
                  <Input
                    ref={register('barcode') as any}
                    value={form.barcode || ''}
                    onChange={e => setForm({ ...form, barcode: e.target.value })}
                    onKeyDown={(e) => handleKeyDown(e, 'barcode')}
                    placeholder="Scan / Enter"
                    className="h-8 text-sm"
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Vehicle Details ── */}
          {(dialogFields.vehicle_manufacturer ||
            dialogFields.vehicle_model ||
            dialogFields.vehicle_year ||
            dialogFields.vehicle_odometer ||
            dialogFields.vehicle_fuel_type ||
            dialogFields.vehicle_transmission ||
            dialogFields.vehicle_owner ||
            dialogFields.vehicle_color) && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vehicle Details</p>
              <div className="grid grid-cols-3 gap-3">
                {/* Manufacturer */}
                {dialogFields.vehicle_manufacturer && (
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Manufacturer</Label>
                    <Select
                      value={form.vehicle_manufacturer || 'none'}
                      onValueChange={v => setForm({ ...form, vehicle_manufacturer: v === 'none' ? undefined : v })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select manufacturer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        {['Maruti Suzuki','Hyundai','Tata','Mahindra','Honda','Toyota','Ford','Renault','Kia','MG','Volkswagen','Skoda',
                          'Nissan','Jeep','Mercedes-Benz','BMW','Audi','Volvo','Mitsubishi','Other'].map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Model */}
                {dialogFields.vehicle_model && (
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Model</Label>
                    <Input
                      list="vehicle-models-list"
                      value={form.vehicle_model || ''}
                      onChange={e => setForm({ ...form, vehicle_model: e.target.value || undefined })}
                      placeholder="e.g., Swift"
                      className="h-8 text-sm"
                    />
                    <datalist id="vehicle-models-list">
                      {(form.vehicle_manufacturer ? POPULAR_MODELS[form.vehicle_manufacturer] || [] : []).map(m => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </div>
                )}

                {/* Year */}
                {dialogFields.vehicle_year && (
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Year</Label>
                    <Input
                      type="number"
                      step="1"
                      min="1900"
                      max={new Date().getFullYear() + 1}
                      value={form.vehicle_year !== undefined ? String(form.vehicle_year) : ''}
                      onChange={e => setForm({ ...form, vehicle_year: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="e.g., 2021"
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                )}

                {/* Fuel Type */}
                {dialogFields.vehicle_fuel_type && (
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Fuel Type</Label>
                    <Select
                      value={form.vehicle_fuel_type || 'none'}
                      onValueChange={v => setForm({ ...form, vehicle_fuel_type: v === 'none' ? undefined : v })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select fuel type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        <SelectItem value="Petrol">Petrol</SelectItem>
                        <SelectItem value="Diesel">Diesel</SelectItem>
                        <SelectItem value="CNG">CNG</SelectItem>
                        <SelectItem value="Electric">Electric</SelectItem>
                        <SelectItem value="Hybrid">Hybrid</SelectItem>
                        <SelectItem value="LPG">LPG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Transmission */}
                {dialogFields.vehicle_transmission && (
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Transmission</Label>
                    <Select
                      value={form.vehicle_transmission || 'none'}
                      onValueChange={v => setForm({ ...form, vehicle_transmission: v === 'none' ? undefined : v })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        <SelectItem value="Manual">Manual</SelectItem>
                        <SelectItem value="Automatic">Automatic</SelectItem>
                        <SelectItem value="CVT">CVT</SelectItem>
                        <SelectItem value="AMT">AMT</SelectItem>
                        <SelectItem value="DCT">DCT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Owner */}
                {dialogFields.vehicle_owner && (
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Owner</Label>
                    <Select
                      value={form.vehicle_owner || 'none'}
                      onValueChange={v => setForm({ ...form, vehicle_owner: v === 'none' ? undefined : v })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select owner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— None —</SelectItem>
                        <SelectItem value="1">1st Owner</SelectItem>
                        <SelectItem value="2">2nd Owner</SelectItem>
                        <SelectItem value="3">3rd Owner</SelectItem>
                        <SelectItem value="4+">4+ Owners</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Odometer */}
                {dialogFields.vehicle_odometer && (
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Odometer (km)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      value={form.vehicle_odometer !== undefined ? String(form.vehicle_odometer) : ''}
                      onChange={e => setForm({ ...form, vehicle_odometer: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="e.g., 45000"
                      className="h-8 text-sm font-mono"
                    />
                  </div>
                )}

                {/* Color */}
                {dialogFields.vehicle_color && (
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Color</Label>
                    <Input
                      value={form.vehicle_color || ''}
                      onChange={e => setForm({ ...form, vehicle_color: e.target.value || undefined })}
                      placeholder="e.g., Pearl White"
                      className="h-8 text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {showUnitSection && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Product Units</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setConversionRows((prev) => [
                    ...normalizeRows(prev, form.unit_id, form.purchase_rate, form.sales_rate),
                    createExtraRow()
                  ])}
                >
                  <IconPlus size={14} />
                  Add Unit
                </Button>
              </div>

              <div className="space-y-2">
                {conversionRows.map((row, index) => {
                  const availableUnits = units.filter((unit) => {
                    if (unit.id === row.unit_id) return true;
                    return !conversionRows.some((existingRow, existingIndex) => existingIndex !== index && existingRow.unit_id === unit.id);
                  });

                  return (
                    <div key={row.key} className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-2">
                      {/* Row 1: Unit, Factor, Purchase Rate, Sales Rate, Delete */}
                      <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_36px] gap-2 items-end">
                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-1 block">Unit</Label>
                          <Select
                            value={row.unit_id || 'none'}
                            onValueChange={(value) => updateConversionRow(index, { unit_id: value === 'none' ? '' : value })}
                            disabled={row.is_base}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Select unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {!row.is_base && <SelectItem value="none">Select unit</SelectItem>}
                              {availableUnits.map((unit) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  {unit.name} ({unit.symbol})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-1 block">Factor to Base</Label>
                          <Input
                            type="number"
                            step="0.0001"
                            min="0"
                            value={formatNumber(row.factor_to_base)}
                            onChange={(e) => updateConversionRow(index, {
                              factor_to_base: row.is_base ? 1 : Math.max(parseNumber(e.target.value), 0)
                            })}
                            disabled={row.is_base}
                            className="h-8 text-sm text-right font-mono"
                          />
                        </div>

                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-1 block">Purchase Rate</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formatNumber(row.purchase_rate)}
                            onChange={(e) => updateConversionRow(index, { purchase_rate: Math.max(parseNumber(e.target.value), 0) })}
                            disabled={row.is_base}
                            className="h-8 text-sm text-right font-mono"
                          />
                        </div>

                        <div>
                          <Label className="text-[11px] text-muted-foreground mb-1 block">Sales Rate</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formatNumber(row.sales_rate)}
                            onChange={(e) => updateConversionRow(index, { sales_rate: Math.max(parseNumber(e.target.value), 0) })}
                            disabled={row.is_base}
                            className="h-8 text-sm text-right font-mono"
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeConversionRow(index)}
                            disabled={row.is_base}
                          >
                            <IconTrash size={14} />
                          </Button>
                        </div>
                      </div>

                      {/* Row 2: Default checkboxes */}
                      <div className="flex items-center gap-5 pl-1">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <Checkbox
                            checked={row.is_default_sale}
                            onCheckedChange={(checked) => setDefaultFlag(index, 'is_default_sale', checked === true)}
                          />
                          Default Sale
                        </label>

                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <Checkbox
                            checked={row.is_default_purchase}
                            onCheckedChange={(checked) => setDefaultFlag(index, 'is_default_purchase', checked === true)}
                          />
                          Default Purchase
                        </label>

                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <Checkbox
                            checked={row.is_default_report}
                            onCheckedChange={(checked) => setDefaultFlag(index, 'is_default_report', checked === true)}
                          />
                          Default Report
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              className="h-8"
            >
              <IconX size={16} />
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-8"
            >
              <IconCheck size={16} />
              {loading ? 'Saving...' : product ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
