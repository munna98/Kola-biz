import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
  setSupplier,
  setVoucherDate,
  setReference,
  setNarration,
  setDiscountRate,
  setDiscountAmount,
  addItem,
  updateItem,
  removeItem,
  setTotals,
  resetForm,
  setLoading,
  // Navigation Actions
  setPurchaseMode,
  setPurchaseCurrentVoucherId,
  setPurchaseHasUnsavedChanges,
  setPurchaseNavigationData,
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
} from '@tabler/icons-react';

// Global Voucher Components & Hooks
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';
import { useVoucherRowNavigation } from '@/hooks/useVoucherRowNavigation';
import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';

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
  const [showListView, setShowListView] = useState(false);

  // Refs for focus management
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

        if (suppliersData.length > 0 && purchaseState.form.supplier_id === 0 && purchaseState.mode === 'new') {
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

  // Auto-add first line if empty and in new mode
  useEffect(() => {
    if (purchaseState.mode === 'new' && purchaseState.items.length === 0 && products.length > 0) {
      handleAddItem();
    }
  }, [products.length]);

  const markUnsaved = () => {
    if (!purchaseState.hasUnsavedChanges && purchaseState.mode !== 'viewing') {
      dispatch(setPurchaseHasUnsavedChanges(true));
    }
  };

  const handleLoadVoucher = async (id: number) => {
    try {
      dispatch(setLoading(true));

      // Fetch voucher header
      const voucher = await invoke<any>('get_purchase_invoice', { id });

      // Fetch items
      const items = await invoke<any[]>('get_purchase_invoice_items', { voucherId: id });

      // Setup Form
      dispatch(setSupplier({ id: voucher.supplier_id, name: voucher.supplier_name }));
      dispatch(setVoucherDate(voucher.voucher_date));
      dispatch(setReference(voucher.reference || ''));
      dispatch(setNarration(voucher.narration || ''));
      // We cannot exact retrieve discount rate easily if not stored, but we can try
      // Actually discount_rate is not in get_purchase_invoice response struct in backend command 
      // Need to check backend `get_purchase_invoice` struct. 
      // It has `total_amount`, tax stuff. 
      // `PurchaseInvoice` struct doesn't seem to have `discount_rate` in `get_purchase_invoice` output?
      // Let's assume 0 for now or update backend. 
      // Backend `get_purchase_invoice` returns `PurchaseInvoice` struct which has `total_amount`, `grand_total`. 
      // It does NOT have `discount_rate` or `discount_amount`.
      // This is a missing feature in `get_purchase_invoice` command compared to `create_purchase_invoice`.
      // For now, I will set discount to 0 to avoid breaking, but I should note this.
      dispatch(setDiscountRate(0));
      dispatch(setDiscountAmount(0));

      // Setup Items
      dispatch(resetForm()); // Clear items first
      // Re-dispatch form data because resetForm cleared it
      dispatch(setSupplier({ id: voucher.supplier_id, name: voucher.supplier_name }));
      dispatch(setVoucherDate(voucher.voucher_date));
      dispatch(setReference(voucher.reference || ''));
      dispatch(setNarration(voucher.narration || ''));

      // Add items
      const mappedItems = items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        description: item.description || '',
        initial_quantity: item.initial_quantity,
        count: item.count,
        deduction_per_unit: item.deduction_per_unit,
        rate: item.rate,
        tax_rate: item.tax_rate,
        id: item.id.toString() // Ensure ID is string for UI
      }));

      // We need to use `addItem` action or `setItems`? `addItem` pushes one by one.
      // `items` in state is an array.
      // I should probably iterate and dispatch `addItem`. 
      // Since `resetForm` clears items, I can just push them.
      // Ideally I'd have `setItems` action but `addItem` works.
      // Wait, `items` slice in `store` has `addItem` but no `setItems` except `resetForm`.
      // I will add items one by one.

      // Also need to be careful about `markUnsaved` triggering.
      // I should disable unsaved check during load.
      // But `markUnsaved` logic is in handlers, not reducers.
      // So dispatching actions here won't trigger `markUnsaved` unless I call the handlers.
      // Dispatching actions directly is safe.

      mappedItems.forEach(item => dispatch(addItem(item)));

      // Recalculate totals
      updateTotalsWithItems(mappedItems, 0, 0);

      dispatch(setPurchaseHasUnsavedChanges(false));
    } catch (e) {
      console.error(e);
      toast.error('Failed to load voucher');
    } finally {
      dispatch(setLoading(false));
    }
  };

  const nav = useVoucherNavigation({
    voucherType: 'purchase_invoice',
    sliceState: purchaseState,
    actions: {
      setMode: setPurchaseMode,
      setCurrentVoucherId: setPurchaseCurrentVoucherId,
      setNavigationData: setPurchaseNavigationData,
      setHasUnsavedChanges: setPurchaseHasUnsavedChanges,
      resetForm: resetForm
    },
    onLoadVoucher: handleLoadVoucher
  });

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
    markUnsaved();
  };

  const handleRemoveItem = (index: number) => {
    if (purchaseState.items.length === 1) {
      toast.error('At least one item is required');
      return;
    }
    const updatedItems = purchaseState.items.filter((_, i) => i !== index);
    dispatch(removeItem(index));
    updateTotalsWithItems(updatedItems);
    markUnsaved();
  };

  const handleUpdateItem = (index: number, field: string, value: any) => {
    let finalValue = value;

    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      if (product) {
        finalValue = value;
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
        markUnsaved();
        return;
      }
    }

    const updatedItems = [...purchaseState.items];
    updatedItems[index] = { ...updatedItems[index], [field]: finalValue };
    dispatch(updateItem({ index, data: { [field]: finalValue } }));
    updateTotalsWithItems(updatedItems);
    markUnsaved();
  };

  const updateTotalsWithItems = (items: any[], discountRate?: number, discountAmount?: number) => {
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

    let finalDiscountRate = discountRate !== undefined ? discountRate : purchaseState.form.discount_rate;
    let finalDiscountAmount = discountAmount !== undefined ? discountAmount : purchaseState.form.discount_amount;

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

    dispatch(setDiscountRate(finalDiscountRate));
    dispatch(setDiscountAmount(finalDiscountAmount));
    dispatch(setTotals({ subtotal, discount: finalDiscountAmount, tax: totalTax, grandTotal }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

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
      await invoke<number>('create_purchase_invoice', {
        invoice: {
          supplier_id: purchaseState.form.supplier_id,
          voucher_date: purchaseState.form.voucher_date,
          reference: purchaseState.form.reference || null,
          narration: purchaseState.form.narration || null,
          discount_rate: purchaseState.form.discount_rate || null,
          discount_amount: purchaseState.form.discount_amount || null,
          items: purchaseState.items.map(item => ({
            product_id: item.product_id,
            description: item.description,
            initial_quantity: item.initial_quantity,
            count: item.count,
            deduction_per_unit: item.deduction_per_unit,
            rate: item.rate,
            tax_rate: item.tax_rate
          })),
        },
      });

      toast.success('Purchase invoice created successfully');
      nav.handleNew();
    } catch (error) {
      toast.error('Failed to create purchase invoice');
      console.error(error);
      dispatch(setLoading(false));
    }
  };

  const handleDelete = async () => {
    const confirmed = await nav.handleDelete();
    if (confirmed && purchaseState.currentVoucherId) {
      try {
        dispatch(setLoading(true));
        await invoke('delete_purchase_invoice', { id: purchaseState.currentVoucherId });
        toast.success('Voucher deleted');
        nav.handleNew();
      } catch (e) {
        toast.error('Failed to delete voucher');
        console.error(e);
      } finally {
        dispatch(setLoading(false));
      }
    }
  };

  // Global keyboard shortcuts hook
  useVoucherShortcuts({
    onSave: () => formRef.current?.requestSubmit(),
    onNewItem: handleAddItem,
    onClear: nav.handleNew,
    onToggleShortcuts: () => setShowShortcuts(prev => !prev),
    onCloseShortcuts: () => setShowShortcuts(false),
    showShortcuts
  });

  // Row navigation hook
  const { handleRowKeyDown } = useVoucherRowNavigation({
    onRemoveItem: handleRemoveItem,
    onAddItem: handleAddItem
  });

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

  // Determine if form should be disabled (viewing mode)
  const isReadOnly = purchaseState.mode === 'viewing';

  return (
    <div className="h-full flex flex-col bg-background">
      <VoucherPageHeader
        title="Purchase Invoice"
        description="Create and manage purchase invoices"
        mode={purchaseState.mode}
        voucherNo={purchaseState.currentVoucherId ? `PI-${purchaseState.currentVoucherId}` : undefined} // Or fetch real Voucher No in load
        voucherDate={purchaseState.form.voucher_date}
        status={'posted'} // Todo: fetch status
        isUnsaved={purchaseState.hasUnsavedChanges}
        hasPrevious={purchaseState.navigationData.hasPrevious}
        hasNext={purchaseState.navigationData.hasNext}
        onToggleShortcuts={() => setShowShortcuts(!showShortcuts)}
        onNavigatePrevious={nav.handleNavigatePrevious}
        onNavigateNext={nav.handleNavigateNext}
        onNew={nav.handleNew}
        onEdit={nav.handleEdit}
        onCancel={nav.handleCancel}
        onSave={() => formRef.current?.requestSubmit()}
        onDelete={handleDelete}
        onListView={() => setShowListView(true)}
        loading={purchaseState.loading}
      />

      <VoucherShortcutPanel
        show={showShortcuts}
      />

      <VoucherListViewSheet
        open={showListView}
        onOpenChange={setShowListView}
        voucherType="purchase_invoice"
        onSelectVoucher={nav.handleListSelect}
      />

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
                      markUnsaved();
                    }
                  }}
                  placeholder="Select supplier"
                  searchPlaceholder="Search suppliers..."
                  disabled={isReadOnly}
                />
              </div>

              {/* Invoice Date */}
              <div>
                <Label className="text-xs font-medium mb-1 block">Invoice Date *</Label>
                <Input
                  type="date"
                  value={purchaseState.form.voucher_date}
                  onChange={(e) => { dispatch(setVoucherDate(e.target.value)); markUnsaved(); }}
                  className="h-8 text-sm"
                  disabled={isReadOnly}
                />
              </div>

              {/* Reference */}
              <div className="col-span-2">
                <Label className="text-xs font-medium mb-1 block">Reference No</Label>
                <Input
                  value={purchaseState.form.reference}
                  onChange={(e) => { dispatch(setReference(e.target.value)); markUnsaved(); }}
                  placeholder="Supplier invoice no"
                  className="h-8 text-sm"
                  disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
                      >
                        <IconTrash size={14} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Item Button */}
            {!isReadOnly && (
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
            )}
          </div>

          {/* Totals and Notes */}
          <div className="grid grid-cols-3 gap-4 shrink-0">
            {/* Notes */}
            <div className="col-span-1 bg-card border rounded-lg p-2.5">
              <Label className="text-xs font-medium mb-1 block">Notes / Narration</Label>
              <Textarea
                value={purchaseState.form.narration}
                onChange={(e) => { dispatch(setNarration(e.target.value)); markUnsaved(); }}
                placeholder="Additional notes or remarks..."
                className="min-h-14 text-xs"
                disabled={isReadOnly}
              />
            </div>

            {/* Totals */}
            <div className="col-span-2 bg-card border rounded-lg p-2.5 space-y-1.5">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium font-mono">₹{purchaseState.totals.subtotal.toFixed(2)}</span>
                </div>

                {/* Discount */}
                <div className="space-y-1 text-xs">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label className="text-xs font-medium mb-1 block">Discount %</Label>
                      <Input
                        type="number"
                        value={purchaseState.form.discount_rate || ''}
                        onChange={(e) => {
                          const rate = parseFloat(e.target.value) || 0;
                          updateTotalsWithItems(purchaseState.items, rate, undefined);
                          markUnsaved();
                        }}
                        placeholder="0"
                        className="h-6.5 font-mono text-xs"
                        step="0.01"
                        disabled={isReadOnly}
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs font-medium mb-1 block">Discount ₹</Label>
                      <Input
                        type="number"
                        value={purchaseState.form.discount_amount || ''}
                        onChange={(e) => {
                          const amount = parseFloat(e.target.value) || 0;
                          updateTotalsWithItems(purchaseState.items, undefined, amount);
                          markUnsaved();
                        }}
                        placeholder="0"
                        className="h-6.5 font-mono text-xs"
                        step="0.01"
                        disabled={isReadOnly}
                      />
                    </div>
                  </div>
                </div>
                <div className="border-t pt-1.5 flex justify-between text-sm">
                  <span className="font-semibold">Grand Total:</span>
                  <span className="font-bold font-mono text-primary">₹{purchaseState.totals.grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Actions - Hidden in viewing mode as they are in header */}
          {!isReadOnly && (
            <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={nav.handleCancel}
                className="h-9"
                title="Cancel"
              >
                <IconX size={16} />
                Cancel
              </Button>
              <Button type="submit" disabled={purchaseState.loading} className="h-9" title="Save (Ctrl+S)">
                <IconCheck size={16} />
                {purchaseState.loading ? 'Saving...' : 'Save Invoice'}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
