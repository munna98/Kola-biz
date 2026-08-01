import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconDeviceFloppy, IconLoader2, IconPackage } from '@tabler/icons-react';

interface ProductCategoryPriceRow {
  category_id: string;
  category_name: string;
  unit_id: string;
  unit_name: string;
  unit_symbol: string;
  sales_rate: number;
}

interface PriceCategoryQuickEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  currentUnitId: string; // highlights the active purchase unit row
}

// Matrix state: key = `${category_id}__${unit_id}`
type PriceMatrix = Record<string, number>;

export default function PriceCategoryQuickEditDialog({
  open,
  onOpenChange,
  productId,
  productName,
  currentUnitId,
}: PriceCategoryQuickEditDialogProps) {
  const [rows, setRows] = useState<ProductCategoryPriceRow[]>([]);
  const [matrix, setMatrix] = useState<PriceMatrix>({});
  const [original, setOriginal] = useState<PriceMatrix>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Derived: unique categories and units from rows
  const categories = (() => {
    const seen = new Set<string>();
    return rows.filter(r => {
      if (seen.has(r.category_id)) return false;
      seen.add(r.category_id);
      return true;
    }).map(r => ({ id: r.category_id, name: r.category_name }));
  })();

  const unitRows = (() => {
    const seen = new Set<string>();
    return rows.filter(r => {
      if (seen.has(r.unit_id)) return false;
      seen.add(r.unit_id);
      return true;
    }).map(r => ({ id: r.unit_id, name: r.unit_name, symbol: r.unit_symbol }));
  })();

  const loadData = useCallback(async () => {
    if (!productId || !open) return;
    setLoading(true);
    try {
      const data = await invoke<ProductCategoryPriceRow[]>('get_product_all_category_prices', {
        productId,
      });
      setRows(data);
      const mat: PriceMatrix = {};
      data.forEach(r => {
        mat[`${r.category_id}__${r.unit_id}`] = r.sales_rate;
      });
      setMatrix(mat);
      setOriginal(mat);
    } catch (err) {
      toast.error(`Failed to load price data: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [productId, open]);

  useEffect(() => {
    if (open && productId) {
      loadData();
    }
  }, [open, productId, loadData]);

  const handleRateChange = (categoryId: string, unitId: string, value: string) => {
    const key = `${categoryId}__${unitId}`;
    const parsed = parseFloat(value);
    setMatrix(prev => ({ ...prev, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build dirty entries (changed from original), skipping zero-rate entries that were never set
      const entries: { price_category_id: string; product_id: string; unit_id: string; sales_rate: number }[] = [];
      Object.entries(matrix).forEach(([key, rate]) => {
        const orig = original[key] ?? 0;
        if (orig !== rate && !(orig === 0 && rate === 0)) {
          const [categoryId, unitId] = key.split('__');
          entries.push({
            price_category_id: categoryId,
            product_id: productId,
            unit_id: unitId,
            sales_rate: rate,
          });
        }
      });

      if (entries.length === 0) {
        toast.info('No changes to save');
        onOpenChange(false);
        return;
      }

      await invoke('upsert_product_price_list', { entries });
      toast.success(`Saved ${entries.length} price${entries.length > 1 ? 's' : ''} for ${productName}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const hasDirty = Object.entries(matrix).some(([key, rate]) => {
    const orig = original[key] ?? 0;
    return orig !== rate && !(orig === 0 && rate === 0);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconPackage size={18} className="text-primary" />
            {productName} — Price Category Rates
          </DialogTitle>
          <DialogDescription>
            Edit selling rates for each price category and unit. The currently selected purchase
            unit is highlighted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
              <IconLoader2 size={18} className="animate-spin" />
              Loading prices…
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">
              No price categories defined yet. Create categories first in{' '}
              <strong>Products → Price Categories</strong>.
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b text-left">
                  <th className="p-3 font-semibold text-muted-foreground w-36">Unit</th>
                  {categories.map(cat => (
                    <th key={cat.id} className="p-3 font-semibold text-center min-w-[110px]">
                      {cat.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unitRows.map(unit => {
                  const isCurrentUnit = unit.id === currentUnitId;
                  return (
                    <tr
                      key={unit.id}
                      className={[
                        'border-b transition-colors',
                        isCurrentUnit
                          ? 'bg-primary/5 border-l-2 border-l-primary'
                          : 'hover:bg-muted/30',
                      ].join(' ')}
                    >
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-1.5">
                          {unit.name}
                          {unit.symbol && unit.symbol !== unit.name && (
                            <span className="text-xs text-muted-foreground">({unit.symbol})</span>
                          )}
                          {isCurrentUnit && (
                            <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-semibold ml-1">
                              current
                            </span>
                          )}
                        </div>
                      </td>
                      {categories.map(cat => {
                        const key = `${cat.id}__${unit.id}`;
                        const rawVal = matrix[key];
                        const displayVal = rawVal === 0 || rawVal === undefined || Number.isNaN(rawVal) ? '' : rawVal;
                        const isDirty = original[key] !== (rawVal ?? 0);
                        return (
                          <td key={cat.id} className="p-2 text-center">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={displayVal}
                              placeholder="0.00"
                              onFocus={e => e.target.select()}
                              onChange={e => handleRateChange(cat.id, unit.id, e.target.value)}
                              className={[
                                'h-8 text-center text-sm w-28 mx-auto font-mono',
                                isDirty ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20' : '',
                              ].join(' ')}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t mt-2 shrink-0">
          <p className="text-xs text-muted-foreground">
            {hasDirty ? (
              <span className="text-amber-600 dark:text-amber-400">
                You have unsaved changes. Click "Save &amp; Close" to persist them.
              </span>
            ) : (
              'The purchase line Sales Rate is not changed by this popup.'
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? (
                <>
                  <IconLoader2 size={14} className="mr-2 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <IconDeviceFloppy size={14} className="mr-2" /> Save &amp; Close
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
