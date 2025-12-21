import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
  setSalesCustomer,
  setSalesVoucherDate,
  setSalesReference,
  setSalesNarration,
  setSalesDiscountRate,
  setSalesDiscountAmount,
  addSalesItem,
  updateSalesItem,
  removeSalesItem,
  setSalesTotals,
  resetSalesForm,
  setSalesLoading,
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
  IconKeyboard,
} from '@tabler/icons-react';

interface Product {
  id: number;
  code: string;
  name: string;
  unit_id: number;
  sales_rate: number;
}

interface Unit {
  id: number;
  name: string;
  symbol: string;
}

interface Customer {
  id: number;
  name: string;
}

export default function SalesInvoicePage() {
  const dispatch = useDispatch<AppDispatch>();
  const salesState = useSelector((state: RootState) => state.salesInvoice);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Refs for keyboard navigation
  const formRef = useRef<HTMLFormElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsData, unitsData, customersData] = await Promise.all([
          invoke<Product[]>('get_products'),
          invoke<Unit[]>('get_units'),
          invoke<Customer[]>('get_customers'),
        ]);
        setProducts(productsData);
        setUnits(unitsData);
        setCustomers(customersData);

        if (customersData.length > 0) {
          dispatch(setSalesCustomer({ id: customersData[0].id, name: customersData[0].name }));
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

  useEffect(() => {
    if (products.length > 0 && salesState.items.length === 0) {
      handleAddItem();
    }
  }, [products.length]);

  const handleAddItem = () => {
    dispatch(
      addSalesItem({
        product_id: 0,
        product_name: '',
        description: '',
        initial_quantity: 0,
        count: 1,
        deduction_per_unit: 0,
        rate: 0,
        tax_rate: 0,
      })
    );
  };

  const handleRemoveItem = (index: number) => {
    if (salesState.items.length === 1) {
      toast.error('At least one item is required');
      return;
    }
    const updatedItems = salesState.items.filter((_, i) => i !== index);
    dispatch(removeSalesItem(index));
    updateTotalsWithItems(updatedItems);
  };

  const handleUpdateItem = (index: number, field: string, value: any) => {
    let finalValue = value;

    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      if (product) {
        finalValue = value;
        const updatedItems = [...salesState.items];
        updatedItems[index] = {
          ...updatedItems[index],
          product_id: value,
          product_name: product.name,
          rate: product.sales_rate || 0,
        };
        dispatch(
          updateSalesItem({
            index,
            data: {
              product_id: value,
              product_name: product.name,
              rate: product.sales_rate || 0,
            },
          })
        );
        updateTotalsWithItems(updatedItems);
        return;
      }
    }

    const updatedItems = [...salesState.items];
    updatedItems[index] = { ...updatedItems[index], [field]: finalValue };
    dispatch(updateSalesItem({ index, data: { [field]: finalValue } }));
    updateTotalsWithItems(updatedItems);
  };

  const updateTotalsWithItems = (items: typeof salesState.items, discountRate?: number, discountAmount?: number) => {
    let subtotal = 0;
    let totalTax = 0;

    items.forEach((item) => {
      const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
      const amount = finalQty * item.rate;
      const taxAmount = amount * (item.tax_rate / 100);
      subtotal += amount;
      totalTax += taxAmount;
    });

    subtotal = Math.round(subtotal * 100) / 100;
    totalTax = Math.round(totalTax * 100) / 100;

    let finalDiscountRate = discountRate !== undefined ? discountRate : salesState.form.discount_rate;
    let finalDiscountAmount = discountAmount !== undefined ? discountAmount : salesState.form.discount_amount;

    if (discountRate !== undefined && discountRate > 0) {
      finalDiscountAmount = Math.round(subtotal * (discountRate / 100) * 100) / 100;
    } else if (discountAmount !== undefined && discountAmount > 0) {
      finalDiscountAmount = Math.round(discountAmount * 100) / 100;
      finalDiscountRate = subtotal > 0 ? Math.round((discountAmount / subtotal) * 100 * 100) / 100 : 0;
    } else {
      finalDiscountAmount = Math.round(finalDiscountAmount * 100) / 100;
      finalDiscountRate = Math.round(finalDiscountRate * 100) / 100;
    }

    const grandTotal = Math.round((subtotal - finalDiscountAmount + totalTax) * 100) / 100;

    dispatch(setSalesDiscountRate(finalDiscountRate));
    dispatch(setSalesDiscountAmount(finalDiscountAmount));
    dispatch(setSalesTotals({ subtotal, discount: finalDiscountAmount, tax: totalTax, grandTotal }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (salesState.items.length === 0) {
      toast.error('Add at least one item');
      return;
    }

    if (!salesState.form.customer_id) {
      toast.error('Select a customer');
      return;
    }

    try {
      dispatch(setSalesLoading(true));
      const invoiceId = await invoke<number>('create_sales_invoice', {
        invoice: {
          customer_id: salesState.form.customer_id,
          voucher_date: salesState.form.voucher_date,
          reference: salesState.form.reference || null,
          narration: salesState.form.narration || null,
          discount_rate: salesState.form.discount_rate || null,
          discount_amount: salesState.form.discount_amount || null,
          items: salesState.items,
        },
      });

      toast.success('Sales invoice created successfully');
      dispatch(resetSalesForm());
      handleAddItem();

      setTimeout(() => customerRef.current?.querySelector('button')?.focus(), 100);
    } catch (error) {
      toast.error('Failed to create sales invoice');
      console.error(error);
    } finally {
      dispatch(setSalesLoading(false));
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleAddItem();
        setTimeout(() => {
          const lastRow = formRef.current?.querySelector('[data-row-index]:last-child');
          lastRow?.querySelector('button')?.focus();
        }, 50);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        dispatch(resetSalesForm());
        handleAddItem();
        setTimeout(() => customerRef.current?.querySelector('button')?.focus(), 100);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }

      if (e.key === 'Escape' && showShortcuts) {
        setShowShortcuts(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showShortcuts, dispatch]);

  // Row keyboard navigation
  const handleRowKeyDown = (e: React.KeyboardEvent, rowIndex: number) => {
    const currentRow = e.currentTarget;
    const inputs = Array.from(currentRow.querySelectorAll('input, button')) as HTMLElement[];
    const currentIndex = inputs.indexOf(document.activeElement as HTMLElement);

    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      handleRemoveItem(rowIndex);
      return;
    }

    const moveToNext = () => {
      if (currentIndex < inputs.length - 1) {
        e.preventDefault();
        const nextInput = inputs[currentIndex + 1];
        nextInput?.focus();
        if (nextInput instanceof HTMLInputElement) {
          nextInput.select();
        }
      } else {
        e.preventDefault();
        const nextRow = currentRow.nextElementSibling;
        if (nextRow) {
          const firstInput = nextRow.querySelector('button') as HTMLElement;
          firstInput?.focus();
          firstInput?.click();
        } else {
          handleAddItem();
          setTimeout(() => {
            const newRow = currentRow.parentElement?.lastElementChild;
            const firstInput = newRow?.querySelector('button') as HTMLElement;
            firstInput?.focus();
            firstInput?.click();
          }, 50);
        }
      }
    };

    if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
      moveToNext();
    }

    if (e.key === 'Tab' && e.shiftKey) {
      if (currentIndex === 0) {
        e.preventDefault();
        const prevRow = currentRow.previousElementSibling;
        if (prevRow) {
          const prevInputs = Array.from(prevRow.querySelectorAll('input, button')) as HTMLElement[];
          const lastInput = prevInputs[prevInputs.length - 1];
          lastInput?.focus();
          if (lastInput instanceof HTMLInputElement) {
            lastInput.select();
          }
        }
      } else {
        e.preventDefault();
        const prevInput = inputs[currentIndex - 1];
        prevInput?.focus();
        if (prevInput instanceof HTMLInputElement) {
          prevInput.select();
        }
      }
    }

    if (e.key === 'ArrowDown' && e.ctrlKey) {
      e.preventDefault();
      const nextRow = currentRow.nextElementSibling;
      if (nextRow) {
        const nextInputs = Array.from(nextRow.querySelectorAll('input, button')) as HTMLElement[];
        const targetInput = nextInputs[currentIndex];
        targetInput?.focus();
        if (targetInput instanceof HTMLInputElement) {
          targetInput.select();
        } else if (currentIndex === 0) {
          targetInput?.click();
        }
      }
    }

    if (e.key === 'ArrowUp' && e.ctrlKey) {
      e.preventDefault();
      const prevRow = currentRow.previousElementSibling;
      if (prevRow) {
        const prevInputs = Array.from(prevRow.querySelectorAll('input, button')) as HTMLElement[];
        const targetInput = prevInputs[currentIndex];
        targetInput?.focus();
        if (targetInput instanceof HTMLInputElement) {
          targetInput.select();
        } else if (currentIndex === 0) {
          targetInput?.click();
        }
      }
    }
  };

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const getItemAmount = (item: typeof salesState.items[0]) => {
    const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
    const amount = finalQty * item.rate;
    const taxAmount = amount * (item.tax_rate / 100);
    return { finalQty, amount, taxAmount, total: amount + taxAmount };
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with Keyboard Hint */}
      <div className="border-b bg-card/50 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold">Sales Invoice</h1>
            <p className="text-xs text-muted-foreground">Create and manage sales invoices</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="h-7 text-xs font-mono"
          >
            <IconKeyboard size={14} />
            Shortcuts (Ctrl+/)
          </Button>
        </div>
      </div>

      {/* Shortcuts Panel */}
      {showShortcuts && (
        <div className="border-b bg-muted/50 px-5 py-3">
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+N</kbd>
                <span>New item</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+S</kbd>
                <span>Save invoice</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+K</kbd>
                <span>Clear form</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+D</kbd>
                <span>Delete row (in row)</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background border rounded font-mono">Tab/Enter</kbd>
                <span>Next field/row</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background border rounded font-mono">Shift+Tab</kbd>
                <span>Previous field/row</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background border rounded font-mono">Ctrl+↑/↓</kbd>
                <span>Navigate rows (same column)</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-background border rounded font-mono">Esc</kbd>
                <span>Close this panel</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form Content */}
      <div className="flex-1 overflow-hidden">
        <form ref={formRef} onSubmit={handleSubmit} className="h-full p-5 max-w-7xl mx-auto flex flex-col gap-4">
          {/* Master Section */}
          <div className="bg-card border rounded-lg p-3 space-y-3 shrink-0">
            <div className="grid grid-cols-6 gap-3">
              {/* Customer */}
              <div ref={customerRef} className="col-span-2">
                <Label className="text-xs font-medium mb-1 block">Customer *</Label>
                <Combobox
                  options={customers.map(c => ({ value: c.id, label: c.name }))}
                  value={salesState.form.customer_id}
                  onChange={(value) => {
                    const customer = customers.find((c) => c.id === value);
                    if (customer) {
                      dispatch(setSalesCustomer({ id: customer.id, name: customer.name }));
                    }
                  }}
                  placeholder="Select customer"
                  searchPlaceholder="Search customers..."
                />
              </div>

              {/* Invoice Date */}
              <div>
                <Label className="text-xs font-medium mb-1 block">Invoice Date *</Label>
                <Input
                  type="date"
                  value={salesState.form.voucher_date}
                  onChange={(e) => dispatch(setSalesVoucherDate(e.target.value))}
                  className="h-8 text-sm"
                />
              </div>

              {/* Reference */}
              <div className="col-span-2">
                <Label className="text-xs font-medium mb-1 block">Reference No</Label>
                <Input
                  value={salesState.form.reference}
                  onChange={(e) => dispatch(setSalesReference(e.target.value))}
                  placeholder="PO or reference no"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Items Section */}
          <div className="bg-card border rounded-lg overflow-hidden flex flex-col shrink-0" style={{ height: 'calc(5 * 3.25rem + 2.5rem + 2.5rem)' }}>
            {/* Table Header */}
            <div className="bg-muted/50 border-b shrink-0">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-3">Product</div>
                <div>Qty</div>
                <div>Unit</div>
                <div>Rate</div>
                <div>Count</div>
                <div>Deduction</div>
                <div>Final Qty</div>
                <div className="text-right">Amount</div>
                <div className="text-right">Total</div>
                <div className="w-8"></div>
              </div>
            </div>

            {/* Items - Scrollable */}
            <div className="divide-y overflow-y-auto flex-1">
              {salesState.items.map((item, idx) => {
                const calc = getItemAmount(item);
                const product = products.find(p => p.id === item.product_id);
                return (
                  <div
                    key={item.id}
                    data-row-index={idx}
                    className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-muted/30 focus-within:bg-muted/50"
                    onKeyDown={(e) => handleRowKeyDown(e, idx)}
                  >
                    {/* Product */}
                    <div className="col-span-3">
                      <Combobox
                        options={products.map(p => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
                        value={item.product_id}
                        onChange={(value) => handleUpdateItem(idx, 'product_id', value)}
                        placeholder="Select product"
                        searchPlaceholder="Search products..."
                      />
                    </div>

                    {/* Initial Quantity */}
                    <div>
                      <Input
                        type="number"
                        value={item.initial_quantity || ''}
                        onChange={(e) =>
                          handleUpdateItem(idx, 'initial_quantity', parseFloat(e.target.value) || 0)
                        }
                        className="h-7 text-xs text-right font-mono"
                        step="0.01"
                      />
                    </div>

                    {/* Unit */}
                    <div className="h-7 text-xs flex items-center justify-end px-3 bg-muted/50 border border-input rounded-md font-medium text-muted-foreground">
                      {units.find(u => u.id === product?.unit_id)?.symbol || '-'}
                    </div>

                    {/* Rate */}
                    <div>
                      <Input
                        type="number"
                        value={item.rate}
                        onChange={(e) => handleUpdateItem(idx, 'rate', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-right font-mono"
                        step="0.01"
                      />
                    </div>

                    {/* Count */}
                    <div>
                      <Input
                        type="number"
                        value={item.count}
                        onChange={(e) => handleUpdateItem(idx, 'count', parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-right font-mono"
                        step="0.01"
                      />
                    </div>

                    {/* Deduction */}
                    <div>
                      <Input
                        type="number"
                        value={item.deduction_per_unit}
                        onChange={(e) =>
                          handleUpdateItem(idx, 'deduction_per_unit', parseFloat(e.target.value) || 0)
                        }
                        className="h-7 text-xs text-right font-mono"
                        step="0.01"
                      />
                    </div>

                    {/* Final Qty */}
                    <div className="h-7 text-xs flex items-center justify-center bg-muted/50 border border-input rounded-md font-medium font-mono">
                      {calc.finalQty.toFixed(2)}
                    </div>

                    {/* Amount */}
                    <div className="h-7 text-xs flex items-center justify-end px-3 bg-muted/50 border border-input rounded-md font-medium font-mono">
                      ₹{calc.amount.toFixed(2)}
                    </div>

                    {/* Total */}
                    <div className="h-7 text-xs flex items-center justify-end px-3 bg-muted/50 border border-input rounded-md font-bold font-mono">
                      ₹{calc.total.toFixed(2)}
                    </div>

                    {/* Delete */}
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(idx)}
                        className="h-6 w-6 p-0"
                        title="Delete (Ctrl+D)"
                      >
                        <IconTrash size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Item Button */}
            <div className="bg-muted/30 border-t px-3 py-2 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddItem}
                className="text-xs h-7"
              >
                <IconPlus size={14} />
                Add Item (Ctrl+N)
              </Button>
            </div>
          </div>

          {/* Totals and Notes */}
          <div className="grid grid-cols-3 gap-4 shrink-0">
            {/* Notes */}
            <div className="col-span-1 bg-card border rounded-lg p-2.5">
              <Label className="text-xs font-medium mb-1 block">Notes / Narration</Label>
              <Textarea
                value={salesState.form.narration}
                onChange={(e) => dispatch(setSalesNarration(e.target.value))}
                placeholder="Additional notes or remarks..."
                className="min-h-14 text-xs"
              />
            </div>

            {/* Totals */}
            <div className="col-span-2 bg-card border rounded-lg p-2.5 space-y-1.5">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium font-mono">₹{salesState.totals.subtotal.toFixed(2)}</span>
                </div>

                {/* Discount */}
                <div className="space-y-1 text-xs">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label className="text-xs font-medium mb-1 block">Discount %</Label>
                      <Input
                        type="number"
                        value={salesState.form.discount_rate || ''}
                        onChange={(e) => {
                          const rate = parseFloat(e.target.value) || 0;
                          updateTotalsWithItems(salesState.items, rate, undefined);
                        }}
                        placeholder="0"
                        className="h-6.5 font-mono text-xs"
                        step="0.01"
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs font-medium mb-1 block">Discount ₹</Label>
                      <Input
                        type="number"
                        value={salesState.form.discount_amount || ''}
                        onChange={(e) => {
                          const amount = parseFloat(e.target.value) || 0;
                          updateTotalsWithItems(salesState.items, undefined, amount);
                        }}
                        placeholder="0"
                        className="h-6.5 font-mono text-xs"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>
                <div className="border-t pt-1.5 flex justify-between text-sm">
                  <span className="font-semibold">Grand Total:</span>
                  <span className="font-bold font-mono text-primary">₹{salesState.totals.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                dispatch(resetSalesForm());
                handleAddItem();
                setTimeout(() => customerRef.current?.querySelector('button')?.focus(), 100);
              }}
              className="h-9"
              title="Clear (Ctrl+K)"
            >
              <IconX size={16} />
              Clear Form
            </Button>
            <Button type="submit" disabled={salesState.loading} className="h-9" title="Save (Ctrl+S)">
              <IconCheck size={16} />
              {salesState.loading ? 'Saving...' : 'Save Invoice'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}