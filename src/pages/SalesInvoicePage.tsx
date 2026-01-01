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
  setSalesMode,
  setSalesCurrentVoucherId,
  setSalesCurrentVoucherNo,
  setSalesHasUnsavedChanges,
  setSalesNavigationData,
} from '@/store';
import type { RootState, AppDispatch } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import {
  IconCheck,
  IconX,
} from '@tabler/icons-react';


// Global Voucher Components & Hooks
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
import { usePrint } from '@/hooks/usePrint';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';

import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { VoucherItemsSection, ColumnSettings } from '@/components/voucher/VoucherItemsSection';
import PaymentManagementDialog from '@/components/dialogs/PaymentManagementDialog';

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

interface Party {
  id: number;
  name: string;
  type: 'customer' | 'supplier';
}

export default function SalesInvoicePage() {
  const dispatch = useDispatch<AppDispatch>();
  const salesState = useSelector((state: RootState) => state.salesInvoice);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showListView, setShowListView] = useState(false);
  const { print } = usePrint();
  const [showQuickPayment, setShowQuickPayment] = useState(false);
  const [savedInvoiceAmount, setSavedInvoiceAmount] = useState(0);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | undefined>(undefined);
  const [savedPartyName, setSavedPartyName] = useState<string>('');
  const [, setSavedPartyId] = useState<number | undefined>(undefined);
  const [voucherSettings, setVoucherSettings] = useState<{ columns: ColumnSettings[] } | undefined>(undefined);
  const [partyBalance, setPartyBalance] = useState<number | null>(null);


  // Refs for focus management
  const formRef = useRef<HTMLFormElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsData, unitsData, accountsData, settingsData] = await Promise.all([
          invoke<Product[]>('get_products'),
          invoke<Unit[]>('get_units'),
          invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable', 'Accounts Payable'] }),
          invoke<any>('get_voucher_settings', { voucherType: 'sales_invoice' }),
        ]);
        setProducts(productsData);
        setUnits(unitsData);
        if (settingsData) {
          setVoucherSettings(settingsData);
        }

        const combinedParties = accountsData.map(acc => ({
          id: acc.id,
          name: acc.account_name,
          type: acc.account_group === 'Accounts Receivable' ? 'customer' as const : 'supplier' as const
        }));
        setParties(combinedParties);
      } catch (error) {
        toast.error('Failed to load data');
        console.error(error);
      } finally {
        setIsInitializing(false);
      }
    };

    loadData();
  }, [dispatch]);

  // Default Party Selection Effect
  useEffect(() => {
    if (salesState.mode === 'new' && salesState.form.customer_id === 0 && parties.length > 0) {
      // Default to "Cash Sale" account if available, otherwise first party
      const cashSaleAccount = parties.find(p => p.name === 'Cash Sale');
      const defaultParty = cashSaleAccount || parties[0];

      if (defaultParty) {
        dispatch(setSalesCustomer({
          id: defaultParty.id,
          name: defaultParty.name,
          type: defaultParty.type
        }));
        invoke<number>('get_account_balance', { accountId: defaultParty.id })
          .then(bal => setPartyBalance(bal))
          .catch(console.error);
      }
    }
  }, [salesState.mode, salesState.form.customer_id, parties, dispatch]);

  // Auto-add first line if empty and in new mode
  useEffect(() => {
    if (salesState.mode === 'new' && salesState.items.length === 0 && products.length > 0) {
      handleAddItem();
    }
  }, [salesState.mode, products.length, salesState.items.length]);

  const handleAddItem = () => {
    // Get defaults from settings
    const getDesc = (id: string) => {
      const col = voucherSettings?.columns.find(c => c.id === id);
      if (col && col.defaultValue !== undefined && col.defaultValue !== "") {
        return col.defaultValue;
      }
      // Hardcoded defaults if not in settings or empty
      if (id === 'count') return 1;
      if (id === 'deduction') return 1.0;
      return 0;
    };

    // Helper to safely parse
    const parseNum = (val: string | number) => typeof val === 'string' ? parseFloat(val) || 0 : val;

    dispatch(
      addSalesItem({
        product_id: 0,
        product_name: '',
        description: '',
        initial_quantity: parseNum(getDesc('quantity') as string | number),
        count: parseNum(getDesc('count') as string | number) || 1, // Fallback to 1 if 0/undefined
        deduction_per_unit: parseNum(getDesc('deduction') as string | number),
        rate: parseNum(getDesc('rate') as string | number),
        tax_rate: parseNum(getDesc('tax_rate') as string | number),
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
    dispatch(setSalesHasUnsavedChanges(true));
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
        dispatch(setSalesHasUnsavedChanges(true));
        return;
      }
    }

    const updatedItems = [...salesState.items];
    updatedItems[index] = { ...updatedItems[index], [field]: finalValue };
    dispatch(updateSalesItem({ index, data: { [field]: finalValue } }));
    updateTotalsWithItems(updatedItems);
    dispatch(setSalesHasUnsavedChanges(true));
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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (salesState.items.length === 0) {
      toast.error('Add at least one item');
      return;
    }

    // Validate each item
    const hasInvalidItems = salesState.items.some(item => {
      const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
      return !item.product_id || finalQty <= 0 || item.rate <= 0;
    });

    if (hasInvalidItems) {
      toast.error('All items must have a product selected, a positive final quantity, and a non-zero rate');
      return;
    }

    if (!salesState.form.customer_id) {
      toast.error('Select a party');
      return;
    }

    try {
      dispatch(setSalesLoading(true));
      if (salesState.mode === 'editing' && salesState.currentVoucherId) {
        await invoke('update_sales_invoice', {
          id: salesState.currentVoucherId,
          invoice: {
            customer_id: salesState.form.customer_id,
            party_type: salesState.form.party_type,
            voucher_date: salesState.form.voucher_date,
            reference: salesState.form.reference || null,
            narration: salesState.form.narration || null,
            discount_rate: salesState.form.discount_rate || null,
            discount_amount: salesState.form.discount_amount || null,
            items: salesState.items.map(item => ({
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
        toast.success('Sales invoice updated successfully');
      } else {
        const newInvoiceId = await invoke<string>('create_sales_invoice', {
          invoice: {
            customer_id: salesState.form.customer_id,
            party_type: salesState.form.party_type,
            voucher_date: salesState.form.voucher_date,
            reference: salesState.form.reference || null,
            narration: salesState.form.narration || null,
            discount_rate: salesState.form.discount_rate || null,
            discount_amount: salesState.form.discount_amount || null,
            items: salesState.items.map(item => ({
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
        toast.success('Sales invoice created successfully');

        // Auto-prompt for payment after creating invoice
        setSavedInvoiceAmount(salesState.totals.grandTotal);
        setSavedInvoiceId(newInvoiceId);
        const customer = parties.find(p => p.id === salesState.form.customer_id);
        setSavedPartyName(customer?.name || 'Cash Sale');
        setSavedPartyId(customer?.id);
        setShowQuickPayment(true);
      }

      dispatch(setSalesHasUnsavedChanges(false));
      handleNew(true);
    } catch (error) {
      toast.error('Failed to save sales invoice');
      console.error(error);
    } finally {
      dispatch(setSalesLoading(false));
    }
  };

  const loadVoucher = async (id: string) => {
    try {
      dispatch(setSalesLoading(true));
      dispatch(setSalesHasUnsavedChanges(false));
      dispatch(resetSalesForm()); // Clear first

      // Fetch header and items using existing commands
      const invoice = await invoke<any>('get_sales_invoice', { id });
      const items = await invoke<any[]>('get_sales_invoice_items', { voucherId: id });

      // Set the actual voucher number
      dispatch(setSalesCurrentVoucherNo(invoice.voucher_no));

      // Populate Form
      dispatch(setSalesCustomer({ id: invoice.customer_id, name: invoice.customer_name, type: 'customer' })); // Assuming customer only for now
      invoke<number>('get_account_balance', { accountId: invoice.customer_id })
        .then(bal => setPartyBalance(bal))
        .catch(console.error);
      dispatch(setSalesVoucherDate(invoice.voucher_date));
      dispatch(setSalesReference(invoice.reference || ''));
      dispatch(setSalesNarration(invoice.narration || ''));
      dispatch(setSalesDiscountRate(invoice.discount_rate || 0));
      dispatch(setSalesDiscountAmount(invoice.discount_amount || 0));

      // Populate Items
      // Clear default empty item
      // Note: resetSalesForm sets items to [], so we just add
      items.forEach(item => {
        dispatch(addSalesItem({
          product_id: item.product_id || 0, // Using product_id from item if available, else need map
          product_name: item.description, // Fallback
          description: item.description,
          initial_quantity: item.initial_quantity,
          count: item.count,
          deduction_per_unit: item.deduction_per_unit,
          rate: item.rate,
          tax_rate: item.tax_rate,
        }));
      });

      // Calculate totals
      // We need to pass the loaded items to updateTotals
      // Construct items array locally for total calculation
      const loadedItems = items.map(item => ({
        id: `loaded-${item.id}`,
        product_id: item.product_id || 0,
        product_name: item.description,
        description: item.description,
        initial_quantity: item.initial_quantity,
        count: item.count,
        deduction_per_unit: item.deduction_per_unit,
        rate: item.rate,
        tax_rate: item.tax_rate,
      }));

      updateTotalsWithItems(loadedItems, invoice.discount_rate, invoice.discount_amount);

      dispatch(setSalesMode('viewing'));
      dispatch(setSalesHasUnsavedChanges(false));

    } catch (error) {
      console.error("Failed to load invoice", error);
      toast.error("Failed to load invoice");
    } finally {
      dispatch(setSalesLoading(false));
    }
  };

  const {
    handleNavigatePrevious,
    handleNavigateNext,
    handleListSelect,
    handleNew,
    handleEdit,
    handleCancel,
    handleDelete,
  } = useVoucherNavigation({
    voucherType: 'sales_invoice',
    sliceState: salesState,
    actions: {
      setMode: setSalesMode,
      setCurrentVoucherId: setSalesCurrentVoucherId,
      setCurrentVoucherNo: setSalesCurrentVoucherNo,
      setNavigationData: setSalesNavigationData,
      setHasUnsavedChanges: setSalesHasUnsavedChanges,
      resetForm: resetSalesForm
    },
    onLoadVoucher: loadVoucher
  });

  const handleDeleteVoucher = async () => {
    const confirmed = await handleDelete();
    if (confirmed && salesState.currentVoucherId) {
      try {
        dispatch(setSalesLoading(true));
        // Delete the invoice (backend will handle cleanup of related data)
        await invoke('delete_sales_invoice', { id: salesState.currentVoucherId });
        toast.success('Voucher and all associated entries deleted');
        handleNew();
      } catch (e) {
        toast.error('Failed to delete voucher');
        console.error(e);
      } finally {
        dispatch(setSalesLoading(false));
      }
    }
  };

  const handlePrint = () => {
    if (salesState.mode === 'new' || !salesState.currentVoucherId) {
      toast.error("Please save the invoice before printing");
      return;
    }
    print({ voucherId: salesState.currentVoucherId, voucherType: 'sales_invoice' });
  };


  // Global keyboard shortcuts hook
  useVoucherShortcuts({
    onSave: () => formRef.current?.requestSubmit(),
    onNewItem: handleAddItem,
    onClear: handleNew,
    onToggleShortcuts: () => setShowShortcuts(prev => !prev),
    onCloseShortcuts: () => setShowShortcuts(false),

    showShortcuts
  });



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

  // Determine if form should be disabled (viewing mode)
  const isReadOnly = salesState.mode === 'viewing';

  return (
    <div className="h-full flex flex-col bg-background">
      <VoucherPageHeader
        title="Sales Invoice"
        description="Create and manage sales invoices"
        mode={salesState.mode}
        voucherNo={salesState.currentVoucherNo}
        voucherDate={salesState.form.voucher_date}
        isUnsaved={salesState.hasUnsavedChanges}
        hasPrevious={salesState.navigationData.hasPrevious}
        hasNext={salesState.navigationData.hasNext}
        onToggleShortcuts={() => setShowShortcuts(!showShortcuts)}
        onNavigatePrevious={handleNavigatePrevious}
        onNavigateNext={handleNavigateNext}
        onEdit={handleEdit}
        onSave={() => formRef.current?.requestSubmit()}
        onCancel={handleCancel}
        onDelete={handleDeleteVoucher}
        onPrint={handlePrint}
        onNew={handleNew}
        onListView={() => setShowListView(true)}
        onManagePayments={salesState.mode !== 'new' ? () => setShowQuickPayment(true) : undefined}
        loading={salesState.loading}
      />

      <VoucherShortcutPanel
        show={showShortcuts}
      />

      <VoucherListViewSheet
        open={showListView}
        onOpenChange={setShowListView}
        voucherType="sales_invoice"
        onSelectVoucher={handleListSelect}
      />

      <PaymentManagementDialog
        mode="receipt"
        open={showQuickPayment}
        onOpenChange={setShowQuickPayment}
        invoiceId={savedInvoiceId || salesState.currentVoucherId || undefined}
        invoiceNo={salesState.currentVoucherNo}
        invoiceAmount={savedInvoiceAmount || salesState.totals.grandTotal}
        invoiceDate={salesState.form.voucher_date}
        partyName={savedPartyName}
        readOnly={salesState.mode === 'viewing'}
        onSuccess={() => {
          toast.success('Payment saved!');
        }}
      />



      {/* Form Content */}
      <div className="flex-1 overflow-hidden">
        <form ref={formRef} onSubmit={handleSubmit} className="h-full p-5 max-w-7xl mx-auto flex flex-col gap-4">
          {/* Master Section */}
          <div className="bg-card border rounded-lg p-3 space-y-3 shrink-0">
            <div className="grid grid-cols-6 gap-3">
              {/* Customer */}
              <div ref={customerRef} className="col-span-2">
                <Label className="text-xs font-medium mb-1 block">Party (Customer/Supplier) *</Label>
                <Combobox
                  options={parties.map(p => ({
                    value: p.id,
                    label: `${p.name} (${p.type === 'customer' ? 'Customer' : 'Supplier'})`
                  }))}
                  value={salesState.form.customer_id}
                  onChange={(value) => {
                    const party = parties.find((p) => p.id === value);
                    if (party) {
                      dispatch(setSalesCustomer({ id: party.id, name: party.name, type: party.type }));
                      invoke<number>('get_account_balance', { accountId: party.id })
                        .then(bal => setPartyBalance(bal))
                        .catch(console.error);
                    }
                  }}
                  placeholder="Select party"
                  searchPlaceholder="Search parties..."
                  disabled={isReadOnly}
                />
              </div>

              {/* Invoice Date */}
              <div>
                <Label className="text-xs font-medium mb-1 block">Invoice Date *</Label>
                <Input
                  type="date"
                  value={salesState.form.voucher_date}
                  onChange={(e) => {
                    dispatch(setSalesVoucherDate(e.target.value));
                    dispatch(setSalesHasUnsavedChanges(true));
                  }}
                  className="h-8 text-sm"
                  disabled={isReadOnly}
                />
              </div>

              {/* Reference */}
              <div className="col-span-2">
                <Label className="text-xs font-medium mb-1 block">Reference No</Label>
                <Input
                  value={salesState.form.reference}
                  onChange={(e) => {
                    dispatch(setSalesReference(e.target.value));
                    dispatch(setSalesHasUnsavedChanges(true));
                  }}
                  placeholder="PO or reference no"
                  className="h-8 text-sm"
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>

          {/* Items Section */}
          {/* Items Section */}
          <VoucherItemsSection
            items={salesState.items}
            products={products}
            units={units}
            isReadOnly={isReadOnly}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            onUpdateItem={handleUpdateItem}
            getItemAmount={getItemAmount}
            addItemLabel="Add Item (Ctrl+N)"
            disableAdd={isReadOnly}
            settings={voucherSettings}
            footerRightContent={
              partyBalance !== null ? (
                <div className={`text-xs font-mono font-bold ${partyBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Balance: ₹ {Math.abs(partyBalance).toLocaleString()} {partyBalance >= 0 ? 'Dr' : 'Cr'}
                </div>
              ) : null
            }
          />

          {/* Totals and Notes */}
          <div className="grid grid-cols-3 gap-4 shrink-0">
            {/* Notes */}
            <div className="col-span-1 bg-card border rounded-lg p-2.5">
              <Label className="text-xs font-medium mb-1 block">Notes / Narration</Label>
              <Textarea
                value={salesState.form.narration}
                onChange={(e) => { dispatch(setSalesNarration(e.target.value)); dispatch(setSalesHasUnsavedChanges(true)); }}
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
                          dispatch(setSalesHasUnsavedChanges(true));
                          updateTotalsWithItems(salesState.items, rate, undefined);
                        }}
                        placeholder="0.00"
                        className="h-6.5 font-mono text-xs"
                        step="0.01"
                        disabled={isReadOnly}
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs font-medium mb-1 block">Discount ₹</Label>
                      <Input
                        type="number"
                        value={salesState.form.discount_amount || ''}
                        onChange={(e) => {
                          const amount = parseFloat(e.target.value) || 0;
                          dispatch(setSalesHasUnsavedChanges(true));
                          updateTotalsWithItems(salesState.items, undefined, amount);
                        }}
                        placeholder="0.00"
                        className="h-6.5 font-mono text-xs"
                        step="0.01"
                        disabled={isReadOnly}
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

          {/* Bottom Actions - Hidden in viewing mode as they are in header */}
          {!isReadOnly && (
            <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                className="h-9"
                title="Cancel"
              >
                <IconX size={16} />
                Cancel
              </Button>
              <Button type="submit" disabled={salesState.loading} className="h-9" title="Save (Ctrl+S)">
                <IconCheck size={16} />
                {salesState.loading ? 'Saving...' : (salesState.mode === 'editing' ? 'Update Invoice' : 'Save Invoice')}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
