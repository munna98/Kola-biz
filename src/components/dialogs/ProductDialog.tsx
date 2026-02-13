import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IconCheck, IconX } from '@tabler/icons-react';
import { api, Product, CreateProduct, Unit, ProductGroup } from '@/lib/tauri';
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

export default function ProductDialog({
  open,
  onOpenChange,
  units,
  groups,
  product,
  onSuccess
}: ProductDialogProps) {
  const [form, setForm] = useState<CreateProduct>({
    code: '',
    name: '',
    unit_id: units.length > 0 ? units[0].id : '',
    purchase_rate: 0,
    sales_rate: 0,
    mrp: 0
  });
  const [loading, setLoading] = useState(false);

  // Define field order for navigation
  const orderedFields = ['code', 'name', 'group', 'unit', 'purchase', 'sales', 'mrp'];

  const { register, handleKeyDown, handleSelectKeyDown, parseNumber, formatNumber } = useDialog(
    open,
    onOpenChange,
    orderedFields
  );

  // Initialize form when product or dialog opens
  useEffect(() => {
    if (open) {
      if (product) {
        setForm({
          code: product.code,
          name: product.name,
          group_id: product.group_id,
          unit_id: product.unit_id,
          purchase_rate: product.purchase_rate,
          sales_rate: product.sales_rate,
          mrp: product.mrp
        });
      } else {
        setForm({
          code: '',
          name: '',
          group_id: undefined,
          unit_id: units.length > 0 ? units[0].id : '',
          purchase_rate: 0,
          sales_rate: 0,
          mrp: 0
        });
      }
    }
  }, [open, product, units]);

  useEffect(() => {
    if (open && !product) {
      api.products.getNextCode().then((code) => {
        setForm(prev => ({ ...prev, code }));
      }).catch(console.error);
    }
  }, [open, product]);

  const resetForm = () => {
    setForm({
      code: '',
      name: '',
      group_id: undefined,
      unit_id: units.length > 0 ? units[0].id : '',
      purchase_rate: 0,
      sales_rate: 0,
      mrp: 0
    });
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

    try {
      setLoading(true);
      if (product) {
        await api.products.update(product.id, form);
        toast.success('Product updated successfully');
        onOpenChange(false);
      } else {
        await api.products.create(form);
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit' : 'Add'} Product</DialogTitle>
          <DialogDescription>
            {product
              ? 'Update the details of the existing product.'
              : 'Fill in the details to add a new product to your inventory.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Code & Name Row */}
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

          {/* Group & Unit Row */}
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
              <Label className="text-xs font-medium mb-1 block">Unit</Label>
              <Select
                value={form.unit_id.toString()}
                onValueChange={v => setForm({ ...form, unit_id: v })}
              >
                <SelectTrigger
                  ref={register('unit') as any}
                  className="h-8 text-sm"
                  onKeyDown={(e) => handleSelectKeyDown(e, 'unit')}
                >
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
          </div>

          {/* Pricing Row */}
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

          {/* Actions */}
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
