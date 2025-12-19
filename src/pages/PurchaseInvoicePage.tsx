import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
  setSupplier,
  setVoucherDate,
  setReference,
  setNarration,
  addItem,
  updateItem,
  removeItem,
  setTotals,
  resetForm,
  setSavedInvoices,
  setLoading,
} from '@/store';
import type { RootState, AppDispatch } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import {
  IconPlus,
  IconTrash,
  IconCheck,
  IconX,
  IconDownload,
} from '@tabler/icons-react';

interface Product {
  id: number;
  code: string;
  name: string;
  unit_id: number;
  purchase_rate: number;
}

interface Unit {
  id: number;
  name: string;
  symbol: string;
}

interface Supplier {
  id: number;
  name: string;
}

export default function PurchaseInvoicePage() {
  const dispatch = useDispatch<AppDispatch>();
  const purchaseState = useSelector((state: RootState) => state.purchaseInvoice);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsData, unitsData, suppliersData] = await Promise.all([
          invoke<Product[]>('get_products'),
          invoke<Unit[]>('get_units'),
          invoke<Supplier[]>('get_suppliers'),
        ]);
        setProducts(productsData);
        setUnits(unitsData);
        setSuppliers(suppliersData);

        // Set default supplier
        if (suppliersData.length > 0) {
          dispatch(setSupplier({ id: suppliersData[0].id, name: suppliersData[0].name }));
        }
      } catch (error) {
        toast.error('Failed to load data');
        console.error(error);
      } finally {
        setIsInitializing(false);
      }
    };

    loadData();
  }, [dispatch]);

  // Auto-add initial item
  useEffect(() => {
    if (products.length > 0 && purchaseState.items.length === 0) {
      handleAddItem();
    }
  }, [products.length]);

  const handleAddItem = () => {
    if (products.length === 0) {
      toast.error('No products available');
      return;
    }
    dispatch(
      addItem({
        product_id: products[0].id,
        product_name: products[0].name,
        description: '',
        initial_quantity: 0,
        count: 1,
        waste_per_unit: 0,
        rate: products[0].purchase_rate || 0,
        tax_rate: 0,
      })
    );
  };

  const handleRemoveItem = (index: number) => {
    if (purchaseState.items.length === 1) {
      toast.error('At least one item is required');
      return;
    }
    dispatch(removeItem(index));
  };

  const handleUpdateItem = (index: number, field: string, value: any) => {
    let finalValue = value;

    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      if (product) {
        finalValue = value;
        dispatch(
          updateItem({
            index,
            data: {
              product_id: value,
              product_name: product.name,
              rate: product.purchase_rate || 0,
            },
          })
        );
        updateTotals();
        return;
      }
    }

    dispatch(updateItem({ index, data: { [field]: finalValue } }));
    updateTotals();
  };

  const updateTotals = () => {
    let subtotal = 0;
    let totalTax = 0;

    purchaseState.items.forEach((item) => {
      const finalQty = item.initial_quantity - item.count * item.waste_per_unit;
      const amount = finalQty * item.rate;
      const taxAmount = amount * (item.tax_rate / 100);
      subtotal += amount;
      totalTax += taxAmount;
    });

    dispatch(setTotals({ subtotal, tax: totalTax, grandTotal: subtotal + totalTax }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (purchaseState.items.length === 0) {
      toast.error('Add at least one item');
      return;
    }

    if (!purchaseState.form.supplier_id) {
      toast.error('Select a supplier');
      return;
    }

    try {
      dispatch(setLoading(true));
      const invoiceId = await invoke<number>('create_purchase_invoice', {
        invoice: {
          supplier_id: purchaseState.form.supplier_id,
          voucher_date: purchaseState.form.voucher_date,
          reference: purchaseState.form.reference || null,
          narration: purchaseState.form.narration || null,
          items: purchaseState.items,
        },
      });

      toast.success('Purchase invoice created successfully');
      dispatch(resetForm());
      handleAddItem();
    } catch (error) {
      toast.error('Failed to create purchase invoice');
      console.error(error);
    } finally {
      dispatch(setLoading(false));
    }
  };

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const getItemAmount = (item: typeof purchaseState.items[0]) => {
    const finalQty = item.initial_quantity - item.count * item.waste_per_unit;
    const amount = finalQty * item.rate;
    const taxAmount = amount * (item.tax_rate / 100);
    return { finalQty, amount, taxAmount, total: amount + taxAmount };
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-5 py-3 backdrop-blur-sm">
        <div>
          <h1 className="text-base font-semibold">Purchase Invoice</h1>
          <p className="text-xs text-muted-foreground">Create and manage purchase invoices</p>
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-auto">
        <form onSubmit={handleSubmit} className="p-5 max-w-7xl mx-auto space-y-4">
          {/* Master Section */}
          <div className="bg-card border rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-6 gap-3">
              {/* Supplier */}
              <div className="col-span-2">
                <Label className="text-xs font-medium mb-1 block">Supplier *</Label>
                <Combobox
                  options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                  value={purchaseState.form.supplier_id}
                  onChange={(value) => {
                    const supplier = suppliers.find((s) => s.id === value);
                    if (supplier) {
                      dispatch(setSupplier({ id: supplier.id, name: supplier.name }));
                    }
                  }}
                  placeholder="Select supplier"
                  searchPlaceholder="Search suppliers..."
                />
              </div>

              {/* Invoice Date */}
              <div>
                <Label className="text-xs font-medium mb-1 block">Invoice Date *</Label>
                <Input
                  type="date"
                  value={purchaseState.form.voucher_date}
                  onChange={(e) => dispatch(setVoucherDate(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>

              {/* Reference */}
              <div className="col-span-2">
                <Label className="text-xs font-medium mb-1 block">Reference No</Label>
                <Input
                  value={purchaseState.form.reference}
                  onChange={(e) => dispatch(setReference(e.target.value))}
                  placeholder="Supplier invoice no"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Items Section */}
          <div className="bg-card border rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="sticky top-0 bg-muted/50 border-b">
              <div className="grid grid-cols-11 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-2">Product</div>
                <div>Rate</div>
                <div>Unit</div>
                <div>Qty</div>
                <div>Count</div>
                <div>Waste</div>
                <div>Final Qty</div>
                <div className="text-right">Amount</div>
                <div className="text-right">Total</div>
                <div className="w-8"></div>
              </div>
            </div>

            {/* Items */}
            <div className="divide-y">
              {purchaseState.items.map((item, idx) => {
                const calc = getItemAmount(item);
                const product = products.find(p => p.id === item.product_id);
                return (
                  <div key={item.id} className="grid grid-cols-11 gap-2 px-3 py-2 items-center hover:bg-muted/30">
                    {/* Product */}
                    <div className="col-span-2">
                      <Combobox
                        options={products.map(p => ({ value: p.id, label: p.name }))}
                        value={item.product_id}
                        onChange={(value) => handleUpdateItem(idx, 'product_id', value)}
                        placeholder="Select product"
                        searchPlaceholder="Search products..."
                      />
                    </div>

                    {/* Rate */}
                    <div>
                      <Input
                        type="number"
                        value={item.rate}
                        onChange={(e) => handleUpdateItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs"
                        step="0.01"
                      />
                    </div>

                    {/* Unit */}
                    <div className="text-xs text-muted-foreground text-center font-medium">
                      {units.find(u => u.id === product?.unit_id)?.symbol || '-'}
                    </div>

                    {/* Initial Quantity */}
                    <div>
                      <Input
                        type="number"
                        value={item.initial_quantity || ''}
                        onChange={(e) =>
                          handleUpdateItem(idx, 'initial_quantity', parseFloat(e.target.value) || 0)
                        }
                        className="h-7 text-xs"
                        step="0.01"
                      />
                    </div>

                    {/* Count */}
                    <div>
                      <Input
                        type="number"
                        value={item.count}
                        onChange={(e) => handleUpdateItem(idx, 'count', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs"
                        step="0.01"
                      />
                    </div>

                    {/* Waste */}
                    <div>
                      <Input
                        type="number"
                        value={item.waste_per_unit}
                        onChange={(e) =>
                          handleUpdateItem(idx, 'waste_per_unit', parseFloat(e.target.value) || 0)
                        }
                        className="h-7 text-xs"
                        step="0.01"
                      />
                    </div>

                    {/* Final Qty */}
                    <div className="text-center text-xs font-medium">{calc.finalQty.toFixed(2)}</div>

                    {/* Amount */}
                    <div className="text-right text-xs font-medium">₹{calc.amount.toFixed(2)}</div>

                    {/* Total */}
                    <div className="text-right text-xs font-bold">₹{calc.total.toFixed(2)}</div>

                    {/* Delete */}
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(idx)}
                        className="h-6 w-6 p-0"
                      >
                        <IconTrash size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Item Button */}
            <div className="bg-muted/30 border-t px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddItem}
                className="text-xs h-7"
              >
                <IconPlus size={14} />
                Add Item
              </Button>
            </div>
          </div>

          {/* Totals and Notes */}
          <div className="grid grid-cols-3 gap-4">
            {/* Notes */}
            <div className="col-span-2 bg-card border rounded-lg p-3">
              <Label className="text-xs font-medium mb-2 block">Notes / Narration</Label>
              <Textarea
                value={purchaseState.form.narration}
                onChange={(e) => dispatch(setNarration(e.target.value))}
                placeholder="Additional notes or remarks..."
                className="min-h-20 text-sm"
              />
            </div>

            {/* Totals */}
            <div className="bg-card border rounded-lg p-3 space-y-2">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">₹{purchaseState.totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax:</span>
                  <span className="font-medium">₹{purchaseState.totals.tax.toFixed(2)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between text-base">
                  <span className="font-semibold">Grand Total:</span>
                  <span className="font-bold text-primary">₹{purchaseState.totals.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => dispatch(resetForm())}
              className="h-9"
            >
              <IconX size={16} />
              Clear Form
            </Button>
            <Button type="submit" disabled={purchaseState.loading} className="h-9">
              <IconCheck size={16} />
              {purchaseState.loading ? 'Saving...' : 'Save Invoice'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
