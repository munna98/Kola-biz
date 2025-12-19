import { useEffect, useState, useRef, useCallback } from 'react';
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
  IconKeyboard,
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
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  // Refs for keyboard navigation
  const formRef = useRef<HTMLFormElement>(null);
  const supplierRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (products.length > 0 && purchaseState.items.length === 0) {
      handleAddItem();
    }
  }, [products.length]);

  const handleAddItem = () => {
    dispatch(
      addItem({
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
    if (purchaseState.items.length === 1) {
      toast.error('At least one item is required');
      return;
    }
    const updatedItems = purchaseState.items.filter((_, i) => i !== index);
    dispatch(removeItem(index));
    updateTotalsWithItems(updatedItems);
  };

  const handleUpdateItem = (index: number, field: string, value: any) => {
    let finalValue = value;

    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      if (product) {
        finalValue = value;
        // Update item with product details and recalculate totals
        const updatedItems = [...purchaseState.items];
        updatedItems[index] = {
          ...updatedItems[index],
          product_id: value,
          product_name: product.name,
          rate: product.purchase_rate || 0,
        };
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
        updateTotalsWithItems(updatedItems);
        return;
      }
    }

    // Update item and recalculate with updated items
    const updatedItems = [...purchaseState.items];
    updatedItems[index] = { ...updatedItems[index], [field]: finalValue };
    dispatch(updateItem({ index, data: { [field]: finalValue } }));
    updateTotalsWithItems(updatedItems);
  };

  const updateTotalsWithItems = (items: typeof purchaseState.items) => {
    let subtotal = 0;
    let totalTax = 0;

    items.forEach((item) => {
      const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
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
      
      // Focus back to supplier after save
      setTimeout(() => supplierRef.current?.querySelector('button')?.focus(), 100);
    } catch (error) {
      toast.error('Failed to create purchase invoice');
      console.error(error);
    } finally {
      dispatch(setLoading(false));
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + N: New item
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleAddItem();
        // Focus the product selector of the new item
        setTimeout(() => {
          const lastRow = formRef.current?.querySelector('[data-row-index]:last-child');
          lastRow?.querySelector('button')?.focus();
        }, 50);
      }
      
      // Ctrl/Cmd + S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
      
      // Ctrl/Cmd + K: Clear form
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        dispatch(resetForm());
        handleAddItem();
        setTimeout(() => supplierRef.current?.querySelector('button')?.focus(), 100);
      }
      
      // Ctrl/Cmd + /: Show shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }

      // Escape: Close shortcuts panel
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
    
    // Ctrl/Cmd + D: Delete current row
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      handleRemoveItem(rowIndex);
      return;
    }
    
    // Helper function to move to next field/row
    const moveToNext = () => {
      if (currentIndex < inputs.length - 1) {
        // Move to next field in same row
        e.preventDefault();
        const nextInput = inputs[currentIndex + 1];
        nextInput?.focus();
        // Select input text if it's an input element
        if (nextInput instanceof HTMLInputElement) {
          nextInput.select();
        }
      } else {
        // Last field - go to next row or add new
        e.preventDefault();
        const nextRow = currentRow.nextElementSibling;
        if (nextRow) {
          const firstInput = nextRow.querySelector('button') as HTMLElement;
          firstInput?.focus();
          firstInput?.click(); // Auto-open combobox
        } else {
          handleAddItem();
          setTimeout(() => {
            const newRow = currentRow.parentElement?.lastElementChild;
            const firstInput = newRow?.querySelector('button') as HTMLElement;
            firstInput?.focus();
            firstInput?.click(); // Auto-open combobox
          }, 50);
        }
      }
    };
    
    // Tab OR Enter: Move to next field/row
    if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
      moveToNext();
    }
    
    // Shift+Tab: Move to previous field/row
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
        // Navigate to previous field in same row
        e.preventDefault();
        const prevInput = inputs[currentIndex - 1];
        prevInput?.focus();
        if (prevInput instanceof HTMLInputElement) {
          prevInput.select();
        }
      }
    }

    // Arrow keys for row navigation
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
          // First column is combobox, click to open
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
          // First column is combobox, click to open
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

  const getItemAmount = (item: typeof purchaseState.items[0]) => {
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
            <h1 className="text-base font-semibold">Purchase Invoice</h1>
            <p className="text-xs text-muted-foreground">Create and manage purchase invoices</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="h-7 text-xs"
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
              {/* Supplier */}
              <div ref={supplierRef} className="col-span-2">
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
              {purchaseState.items.map((item, idx) => {
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
                        className="h-7 text-xs"
                        step="0.01"
                      />
                    </div>

                    {/* Unit */}
                    <div className="text-xs text-muted-foreground text-center font-medium">
                      {units.find(u => u.id === product?.unit_id)?.symbol || '-'}
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
                        value={item.deduction_per_unit}
                        onChange={(e) =>
                          handleUpdateItem(idx, 'deduction_per_unit', parseFloat(e.target.value) || 0)
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
            <div className="col-span-2 bg-card border rounded-lg p-3">
              <Label className="text-xs font-medium mb-2 block">Notes / Narration</Label>
              <Textarea
                value={purchaseState.form.narration}
                onChange={(e) => dispatch(setNarration(e.target.value))}
                placeholder="Additional notes or remarks..."
                className="min-h-16 text-sm"
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
          <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                dispatch(resetForm());
                handleAddItem();
                setTimeout(() => supplierRef.current?.querySelector('button')?.focus(), 100);
              }}
              className="h-9"
              title="Clear (Ctrl+K)"
            >
              <IconX size={16} />
              Clear Form
            </Button>
            <Button type="submit" disabled={purchaseState.loading} className="h-9" title="Save (Ctrl+S)">
              <IconCheck size={16} />
              {purchaseState.loading ? 'Saving...' : 'Save Invoice'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}