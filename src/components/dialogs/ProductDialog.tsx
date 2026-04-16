import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconCheck, IconCircleDashedPlus, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { api, Product, CreateProduct, Unit, ProductGroup, CreateProductUnitConversion, GstTaxSlab } from '@/lib/tauri';
import { toast } from 'sonner';
import { useDialog } from '@/hooks/use-dialog';

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: Unit[];
  groups: ProductGroup[];
  product?: Product;
  onSuccess?: () => void;
}

interface ConversionRow extends CreateProductUnitConversion {
  key: string;
  is_base: boolean;
}

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
  product,
  onSuccess
}: ProductDialogProps) {
  const defaultUnitId = getDefaultUnitId(units);
  const [form, setForm] = useState<CreateProduct>({
    code: '',
    name: '',
    unit_id: defaultUnitId,
    purchase_rate: 0,
    sales_rate: 0,
    mrp: 0,
    conversions: defaultUnitId ? [createBaseRow(defaultUnitId)] : [],
    hsn_sac_code: '',
    gst_slab_id: undefined,
  });
  const [conversionRows, setConversionRows] = useState<ConversionRow[]>(defaultUnitId ? [createBaseRow(defaultUnitId)] : []);
  const [loading, setLoading] = useState(false);
  const [showUnitSection, setShowUnitSection] = useState(false);
  const [gstSlabs, setGstSlabs] = useState<GstTaxSlab[]>([]);
  const unitLocked = Boolean(product?.has_transactions);

  const orderedFields = ['code', 'name', 'group', 'unit', 'hsn', 'gst_slab', 'purchase', 'sales', 'mrp'];

  const { register, handleKeyDown, handleSelectKeyDown, parseNumber, formatNumber } = useDialog(
    open,
    onOpenChange,
    orderedFields
  );

  // Load GST slabs once
  useEffect(() => {
    api.gst.getSlabs().then(setGstSlabs).catch(console.error);
  }, []);

  useEffect(() => {
    if (!open) return;

    const initialUnitId = product?.unit_id || getDefaultUnitId(units);
    const initialPurchaseRate = product?.purchase_rate || 0;
    const initialSalesRate = product?.sales_rate || 0;
    setShowUnitSection(false);

    const loadDialogData = async () => {
      if (product) {
        setForm({
          code: product.code,
          name: product.name,
          group_id: product.group_id,
          unit_id: product.unit_id,
          purchase_rate: product.purchase_rate,
          sales_rate: product.sales_rate,
          mrp: product.mrp,
          conversions: [],
          hsn_sac_code: product.hsn_sac_code || '',
          gst_slab_id: product.gst_slab_id,
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
        setForm({
          code: '',
          name: '',
          group_id: undefined,
          unit_id: initialUnitId,
          purchase_rate: 0,
          sales_rate: 0,
          mrp: 0,
          conversions: [],
          hsn_sac_code: '',
          gst_slab_id: undefined,
        });
        setConversionRows(initialUnitId ? [createBaseRow(initialUnitId, initialPurchaseRate, initialSalesRate)] : []);
      }
    };

    loadDialogData();
  }, [open, product, units]);

  useEffect(() => {
    if (open && !product) {
      api.products.getNextCode().then((code) => {
        setForm(prev => ({ ...prev, code }));
      }).catch(console.error);
    }
  }, [open, product]);

  useEffect(() => {
    if (!open || !form.unit_id) return;
    setConversionRows((prev) => normalizeRows(prev, form.unit_id, form.purchase_rate, form.sales_rate));
  }, [form.unit_id, form.purchase_rate, form.sales_rate, open]);

  const resetForm = () => {
    const unitId = getDefaultUnitId(units);
    setForm({
      code: '',
      name: '',
      group_id: undefined,
      unit_id: unitId,
      purchase_rate: 0,
      sales_rate: 0,
      mrp: 0,
      conversions: [],
      hsn_sac_code: '',
      gst_slab_id: undefined,
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
      toast.error('Product code is required');
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
      toast.error(product ? 'Failed to update product' : 'Failed to create product');
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
          <div className="grid grid-cols-2 gap-4">
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
            <div>
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

          <div className="grid grid-cols-2 gap-4">
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

          {/* ── GST / HSN fields ── */}
          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <Label className="text-xs font-medium mb-1 block">GST Category</Label>
              <Select
                value={form.gst_slab_id || 'none'}
                onValueChange={v => setForm({ ...form, gst_slab_id: v === 'none' ? undefined : v })}
              >
                <SelectTrigger
                  ref={register('gst_slab') as any}
                  className="h-8 text-sm"
                  onKeyDown={(e) => handleSelectKeyDown(e, 'gst_slab')}
                >
                  <SelectValue placeholder="No GST" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No GST</SelectItem>
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
          </div>

          <div className="grid grid-cols-3 gap-4">
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
          </div>

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
