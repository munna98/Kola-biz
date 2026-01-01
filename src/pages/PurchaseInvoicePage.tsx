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
  setPurchaseCurrentVoucherNo,
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
  IconCheck,
  IconX,
} from '@tabler/icons-react';

// Global Voucher Components & Hooks
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';

import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { VoucherItemsSection, ColumnSettings } from '@/components/voucher/VoucherItemsSection';
import PaymentManagementDialog from '@/components/dialogs/PaymentManagementDialog';
import { PrintPreviewDialog } from '@/components/dialogs/PrintPreviewDialog';
import SupplierDialog from '@/components/dialogs/SupplierDialog';

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

interface Party {
  id: number;
  name: string;
  type: 'customer' | 'supplier';
}

export default function PurchaseInvoicePage() {
  const dispatch = useDispatch<AppDispatch>();
  const purchaseState = useSelector((state: RootState) => state.purchaseInvoice);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showListView, setShowListView] = useState(false);
  const [showQuickPayment, setShowQuickPayment] = useState(false);
  const [savedInvoiceAmount, setSavedInvoiceAmount] = useState(0);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | undefined>(undefined);
  const [savedPartyName, setSavedPartyName] = useState<string>('');
  const [voucherSettings, setVoucherSettings] = useState<{ columns: ColumnSettings[] } | undefined>(undefined);
  const [partyBalance, setPartyBalance] = useState<number | null>(null);

  // New state for print preview
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Create Supplier Shortcut State
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');

  // Refs for focus management
  const formRef = useRef<HTMLFormElement>(null);
  const supplierRef = useRef<HTMLDivElement>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsData, unitsData, accountsData, settingsData] = await Promise.all([
          invoke<Product[]>('get_products'),
          invoke<Unit[]>('get_units'),
          invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable', 'Accounts Payable'] }),
          invoke<any>('get_voucher_settings', { voucherType: 'purchase_invoice' }),
        ]);
        setProducts(productsData);
        setUnits(unitsData);
        if (settingsData) {
          setVoucherSettings(settingsData);
        }

        const combinedParties = accountsData.map(acc => ({
          id: acc.id,
          name: acc.account_name,
          type: acc.account_group === 'Accounts Payable' ? 'supplier' as const : 'customer' as const
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
    if (purchaseState.mode === 'new' && purchaseState.form.supplier_id === 0 && parties.length > 0) {
      // Default to "Cash Purchase" account if available, otherwise first party
      const cashPurchaseAccount = parties.find(p => p.name === 'Cash Purchase');
      const defaultParty = cashPurchaseAccount || parties[0];

      if (defaultParty) {
        dispatch(setSupplier({
          id: defaultParty.id,
          name: defaultParty.name,
          type: defaultParty.type
        }));
        invoke<number>('get_account_balance', { accountId: defaultParty.id })
          .then(bal => setPartyBalance(bal))
          .catch(console.error);
      }
    }
  }, [purchaseState.mode, purchaseState.form.supplier_id, parties, dispatch]);

  // Auto-add first line if empty and in new mode
  useEffect(() => {
    if (purchaseState.mode === 'new' && purchaseState.items.length === 0 && products.length > 0) {
      handleAddItem();
    }
  }, [purchaseState.mode, products.length, purchaseState.items.length]);

  const markUnsaved = () => {
    if (!purchaseState.hasUnsavedChanges && purchaseState.mode !== 'viewing') {
      dispatch(setPurchaseHasUnsavedChanges(true));
    }
  };

  const handleLoadVoucher = async (id: string) => {
    try {
      dispatch(setLoading(true));
      dispatch(setPurchaseHasUnsavedChanges(false));

      // Fetch voucher header
      const voucher = await invoke<any>('get_purchase_invoice', { id });

      // Fetch items
      const items = await invoke<any[]>('get_purchase_invoice_items', { voucherId: id });

      // Setup Items
      dispatch(resetForm()); // Clear items first

      // Set the actual voucher number (after resetForm to prevent it from being cleared)
      dispatch(setPurchaseCurrentVoucherNo(voucher.voucher_no));

      // Re-dispatch form data because resetForm cleared it
      dispatch(setSupplier({
        id: voucher.supplier_id,
        name: voucher.supplier_name,
        type: voucher.party_type
      }));
      invoke<number>('get_account_balance', { accountId: voucher.supplier_id })
        .then(bal => setPartyBalance(bal))
        .catch(console.error);
      dispatch(setVoucherDate(voucher.voucher_date));
      dispatch(setReference(voucher.reference || ''));
      dispatch(setNarration(voucher.narration || ''));

      // Load discount fields from backend
      dispatch(setDiscountRate(voucher.discount_rate || 0));
      dispatch(setDiscountAmount(voucher.discount_amount || 0));

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
      setCurrentVoucherNo: setPurchaseCurrentVoucherNo,
      setNavigationData: setPurchaseNavigationData,
      setHasUnsavedChanges: setPurchaseHasUnsavedChanges,
      resetForm: resetForm
    },
    onLoadVoucher: handleLoadVoucher
  });

  const handleAddItem = () => {
    // Get defaults from settings
    const getDesc = (id: string) => {
      const col = voucherSettings?.columns.find(c => c.id === id);
      if (col && col.defaultValue !== undefined && col.defaultValue !== "") {
        return col.defaultValue;
      }
      // Hardcoded defaults if not in settings or empty
      if (id === 'count') return 1;
      if (id === 'deduction') return 1.5;
      return 0;
    };

    // Helper to safely parse
    const parseNum = (val: string | number) => typeof val === 'string' ? parseFloat(val) || 0 : val;

    dispatch(
      addItem({
        product_id: 0,
        product_name: '',
        description: '',
        initial_quantity: parseNum(getDesc('quantity') as string | number),
        count: parseNum(getDesc('count') as string | number) || 1,
        deduction_per_unit: parseNum(getDesc('deduction') as string | number),
        rate: parseNum(getDesc('rate') as string | number),
        tax_rate: parseNum(getDesc('tax_rate') as string | number),
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

    // Validate each item
    const hasInvalidItems = purchaseState.items.some(item => {
      const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
      return !item.product_id || finalQty <= 0 || item.rate <= 0;
    });

    if (hasInvalidItems) {
      toast.error('All items must have a product selected, a positive final quantity, and a non-zero rate');
      return;
    }

    if (!purchaseState.form.supplier_id) {
      toast.error('Select a party');
      return;
    }

    try {
      dispatch(setLoading(true));
      if (purchaseState.mode === 'editing' && purchaseState.currentVoucherId) {
        await invoke('update_purchase_invoice', {
          id: purchaseState.currentVoucherId,
          invoice: {
            supplier_id: purchaseState.form.supplier_id,
            party_type: purchaseState.form.party_type,
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

        toast.success('Purchase invoice updated successfully');
      } else {
        const newInvoiceId = await invoke<string>('create_purchase_invoice', {
          invoice: {
            supplier_id: purchaseState.form.supplier_id,
            party_type: purchaseState.form.party_type,
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

        // Auto-prompt for payment after creating invoice
        setSavedInvoiceAmount(purchaseState.totals.grandTotal);
        setSavedInvoiceId(newInvoiceId);
        const supplier = parties.find(p => p.id === purchaseState.form.supplier_id);
        setSavedPartyName(supplier?.name || 'Cash Purchase');
        setShowQuickPayment(true);
      }

      dispatch(setPurchaseHasUnsavedChanges(false));
      nav.handleNew(true);
    } catch (error) {
      toast.error('Failed to save purchase invoice');
      console.error(error);
    } finally {
      dispatch(setLoading(false));
    }
  };

  const handleDelete = async () => {
    const confirmed = await nav.handleDelete();
    if (confirmed && purchaseState.currentVoucherId) {
      try {
        dispatch(setLoading(true));
        // Delete the invoice (backend will handle cleanup of related data)
        await invoke('delete_purchase_invoice', { id: purchaseState.currentVoucherId });
        toast.success('Voucher and all associated entries deleted');
        nav.handleNew();
      } catch (e) {
        toast.error('Failed to delete voucher');
        console.error(e);
      } finally {
        dispatch(setLoading(false));
      }
    }
  };

  const handlePrint = () => {
    if (purchaseState.mode === 'new' || !purchaseState.currentVoucherId) {
      toast.error("Please save the invoice before printing");
      return;
    }
    // Instead of direct print, open preview
    setShowPrintPreview(true);
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

  // Global "Alt+C" Shortcut for creating supplier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        setNewSupplierName('');
        setShowCreateSupplier(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCreateSupplierSave = async (newSupplier?: any) => {
    // Refresh parties list
    try {
      const accountsData = await invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable', 'Accounts Payable'] });
      const combinedParties = accountsData.map(acc => ({
        id: acc.id,
        name: acc.account_name,
        type: acc.account_group === 'Accounts Payable' ? 'supplier' as const : 'customer' as const
      }));
      setParties(combinedParties);

      // If a new supplier was returned (created), select it
      if (newSupplier) {
        console.log("New supplier created:", newSupplier);
        // Find the party in the new list by name to ensure we get the correct Account ID
        const createdParty = combinedParties.find(p => p.name === newSupplier.name);
        console.log("Found supplier in list:", createdParty);

        if (createdParty) {
          dispatch(setSupplier({
            id: createdParty.id,
            name: createdParty.name,
            type: 'supplier'
          }));
          // Balance is 0 for new
          setPartyBalance(0);
        } else {
          console.warn("Could not find created supplier in refreshed list. Names:", combinedParties.map(p => p.name));
        }
      }
    } catch (e) {
      console.error("Failed to refresh parties after create", e);
    }
    setShowCreateSupplier(false);
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

  // Determine if form should be disabled (viewing mode)
  const isReadOnly = purchaseState.mode === 'viewing';

  return (
    <div className="h-full flex flex-col bg-background">
      <VoucherPageHeader
        title="Purchase Invoice"
        description="Create and manage purchase invoices"
        mode={purchaseState.mode}
        voucherNo={purchaseState.currentVoucherNo}
        voucherDate={purchaseState.form.voucher_date}
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
        onPrint={handlePrint}
        onListView={() => setShowListView(true)}
        onManagePayments={purchaseState.mode !== 'new' ? () => setShowQuickPayment(true) : undefined}
        loading={purchaseState.loading}
      />

      <VoucherShortcutPanel
        show={showShortcuts}
      />

      <PaymentManagementDialog
        mode="payment"
        open={showQuickPayment}
        onOpenChange={setShowQuickPayment}
        invoiceId={savedInvoiceId || purchaseState.currentVoucherId || undefined}
        invoiceNo={purchaseState.currentVoucherNo}
        invoiceAmount={savedInvoiceAmount || purchaseState.totals.grandTotal}
        invoiceDate={purchaseState.form.voucher_date}
        partyName={savedPartyName}
        readOnly={purchaseState.mode === 'viewing'}
        onSuccess={() => {
          toast.success('Payment saved!');
        }}
      />

      <VoucherListViewSheet
        open={showListView}
        onOpenChange={setShowListView}
        voucherType="purchase_invoice"
        onSelectVoucher={nav.handleListSelect}
      />

      <PrintPreviewDialog
        open={showPrintPreview}
        onOpenChange={setShowPrintPreview}
        voucherId={purchaseState.currentVoucherId || undefined}
        voucherType="purchase_invoice"
        title={`Print Invoice - ${purchaseState.currentVoucherNo}`}
      />

      <SupplierDialog
        open={showCreateSupplier}
        onOpenChange={setShowCreateSupplier}
        supplierToEdit={null}
        onSave={handleCreateSupplierSave}
        initialName={newSupplierName}
      />

      {/* Form Content */}
      <div className="flex-1 overflow-hidden">
        <form ref={formRef} onSubmit={handleSubmit} className="h-full p-5 max-w-7xl mx-auto flex flex-col gap-4">
          {/* Master Section */}
          <div className="bg-card border rounded-lg p-3 space-y-3 shrink-0">
            <div className="grid grid-cols-6 gap-3">
              {/* Supplier */}
              <div ref={supplierRef} className="col-span-2">
                <Label className="text-xs font-medium mb-1 block">Party (Supplier/Customer) *</Label>
                <Combobox
                  options={parties.map(p => ({
                    value: p.id,
                    label: `${p.name} (${p.type === 'supplier' ? 'Supplier' : 'Customer'})`
                  }))}
                  value={purchaseState.form.supplier_id}
                  onChange={(value) => {
                    const party = parties.find((p) => p.id === value);
                    if (party) {
                      dispatch(setSupplier({ id: party.id, name: party.name, type: party.type }));
                      markUnsaved();
                      invoke<number>('get_account_balance', { accountId: party.id })
                        .then(bal => setPartyBalance(bal))
                        .catch(console.error);
                    }
                  }}
                  placeholder="Select party"
                  searchPlaceholder="Search parties..."
                  disabled={isReadOnly}
                  onActionClick={() => {
                    setNewSupplierName('');
                    setShowCreateSupplier(true);
                  }}
                  onCreate={(name) => {
                    setNewSupplierName(name);
                    setShowCreateSupplier(true);
                  }}
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
          <VoucherItemsSection
            items={purchaseState.items}
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
                        value={purchaseState.form.discount_amount || ''}
                        onChange={(e) => {
                          const amount = parseFloat(e.target.value) || 0;
                          updateTotalsWithItems(purchaseState.items, undefined, amount);
                          markUnsaved();
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
                {purchaseState.loading ? 'Saving...' : (purchaseState.mode === 'editing' ? 'Update Invoice' : 'Save Invoice')}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
