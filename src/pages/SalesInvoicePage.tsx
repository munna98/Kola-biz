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
// import { usePrint } from '@/hooks/usePrint';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';

import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { VoucherItemsSection, ColumnSettings } from '@/components/voucher/VoucherItemsSection';

import PaymentManagementDialog from '@/components/dialogs/PaymentManagementDialog';
import { PrintPreviewDialog } from '@/components/dialogs/PrintPreviewDialog';
import CustomerDialog from '@/components/dialogs/CustomerDialog';
import ProductDialog from '@/components/dialogs/ProductDialog';
import { ProductGroup, Unit } from '@/lib/tauri';

interface Product {
  id: number;
  code: string;
  name: string;
  unit_id: number;
  sales_rate: number;
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
  // const { print } = usePrint(); // Removed as we use PrintPreviewDialog which uses usePrint internally // Keeping usePrint for now as it might be used later or we can remove it if completely unused.
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [creatingProductRowIndex, setCreatingProductRowIndex] = useState<number | null>(null);
  // Actually, wait, usePrint is NOT used at all in this file anymore? 
  // checking... yes, only for print() which we removed. 
  // BUT we might want to keep the hook call if it does other init stuff?
  // No, usePrint just returns { print, isPrinting }. 
  // isPrinting is also not used here (it's used in header via salesState.loading maybe? No).
  // I will just remove the line.
  const [showQuickPayment, setShowQuickPayment] = useState(false);
  const [savedInvoiceAmount, setSavedInvoiceAmount] = useState(0);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | undefined>(undefined);
  const [savedInvoiceNo, setSavedInvoiceNo] = useState<string | undefined>(undefined);
  const [savedPartyName, setSavedPartyName] = useState<string>('');
  const [, setSavedPartyId] = useState<number | undefined>(undefined);
  const [voucherSettings, setVoucherSettings] = useState<{ columns: ColumnSettings[], autoPrint?: boolean, showPaymentModal?: boolean } | undefined>(undefined);
  const [partyBalance, setPartyBalance] = useState<number | null>(null);

  // New state for print preview
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Create Customer Shortcut State
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');


  // Refs for focus management
  const formRef = useRef<HTMLFormElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsData, unitsData, accountsData, settingsData, groupsData] = await Promise.all([
          invoke<Product[]>('get_products'),
          invoke<Unit[]>('get_units'),
          invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable', 'Accounts Payable'] }),
          invoke<any>('get_voucher_settings', { voucherType: 'sales_invoice' }),
          invoke<ProductGroup[]>('get_product_groups'),
        ]);
        setProducts(productsData);
        setUnits(unitsData);
        if (settingsData) {
          setVoucherSettings(settingsData);
        }
        setProductGroups(groupsData);

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

  // Clear savedInvoiceId when navigating to a different voucher (so we don't hold onto stale IDs)
  useEffect(() => {
    if (salesState.currentVoucherId) {
      setSavedInvoiceId(undefined);
      setSavedInvoiceNo(undefined);
    }
  }, [salesState.currentVoucherId]);

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

  // Ref to track if auto-print is pending after payment dialog
  const autoPrintPending = useRef(false);

  // ... (existing code)

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

        toast.success('Sales invoice updated successfully');

        // Prepare state for Payment Dialog & Print (persist before reset)
        setSavedInvoiceId(salesState.currentVoucherId);
        setSavedInvoiceNo(salesState.currentVoucherNo);
        setSavedInvoiceAmount(salesState.totals.grandTotal);
        const customer = parties.find(p => p.id === salesState.form.customer_id);
        setSavedPartyName(customer?.name || 'Cash Sale');
        setSavedPartyId(customer?.id);

        // Auto Print Check - Defer until after payment dialog
        if (voucherSettings?.autoPrint) {
          autoPrintPending.current = true;
        }

        // Show Payment Dialog
        setShowQuickPayment(true);
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

        // Fetch new invoice to get the generated voucher number
        const newInvoice = await invoke<any>('get_sales_invoice', { id: newInvoiceId });
        setSavedInvoiceNo(newInvoice.voucher_no);

        const customer = parties.find(p => p.id === salesState.form.customer_id);
        const partyName = customer?.name || 'Cash Sale';
        setSavedPartyName(partyName);
        setSavedPartyId(customer?.id);

        // Check payment modal setting (default true if undefined)
        const shouldShowPaymentModal = voucherSettings?.showPaymentModal !== false;

        if (!shouldShowPaymentModal) {
          // Payment modal disabled - handle conditionally
          const isCashSale = partyName === 'Cash Sale';

          if (isCashSale && salesState.totals.grandTotal > 0) {
            // Auto-record payment for Cash Sale
            try {
              const cashBankAccounts = await invoke<{ id: number; name: string }[]>('get_cash_bank_accounts');
              const defaultCashAccount = cashBankAccounts.find(a => a.name.toLowerCase().includes('cash')) || cashBankAccounts[0];

              if (defaultCashAccount) {
                await invoke('create_quick_payment', {
                  payment: {
                    invoice_id: newInvoiceId,
                    amount: salesState.totals.grandTotal,
                    payment_account_id: defaultCashAccount.id,
                    payment_date: salesState.form.voucher_date,
                    payment_method: 'cash',
                    reference: null,
                    remarks: `Auto payment for ${newInvoice.voucher_no}`,
                  },
                });
                toast.success('Payment recorded automatically');
              }
            } catch (paymentError) {
              console.error('Failed to auto-record payment:', paymentError);
              toast.error('Invoice saved but payment recording failed');
            }
          }
          // For non-Cash Sale parties: skip payment modal (invoice remains unpaid)

          // Auto Print if enabled
          if (voucherSettings?.autoPrint) {
            setShowPrintPreview(true);
          }
        } else {
          // Show payment modal as usual
          if (voucherSettings?.autoPrint) {
            autoPrintPending.current = true;
          }
          setShowQuickPayment(true);
        }
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
    // Instead of direct print, open preview
    setShowPrintPreview(true);
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

  // Global "Alt+C" Shortcut for creating customer
  // Using e.code for physical key detection (more reliable across keyboard layouts)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyC') {
        e.preventDefault();
        setNewCustomerName(''); // Reset name for blank create
        setShowCreateCustomer(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const handleCreateCustomerSave = async (newCustomer?: any) => {
    // Refresh parties list
    try {
      const accountsData = await invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable', 'Accounts Payable'] });
      const combinedParties = accountsData.map(acc => ({
        id: acc.id,
        name: acc.account_name,
        type: acc.account_group === 'Accounts Receivable' ? 'customer' as const : 'supplier' as const
      }));
      setParties(combinedParties);

      // If a new customer was returned (created), select it
      if (newCustomer) {
        // Find the party in the new list by name to ensure we get the correct Account ID (which might differ from Customer ID)
        const createdParty = combinedParties.find(p => p.name === newCustomer.name);

        if (createdParty) {
          dispatch(setSalesCustomer({
            id: createdParty.id,
            name: createdParty.name,
            type: 'customer'
          }));
          setPartyBalance(0);
        }
      }
    } catch (e) {
      console.error("Failed to refresh parties after create", e);
    }
    setShowCreateCustomer(false);
  };

  const handleProductCreate = (name: string, rowIndex: number) => {
    setNewProductName(name);
    setCreatingProductRowIndex(rowIndex);
    setShowCreateProduct(true);
  };

  const handleCreateProductSave = async () => {
    try {
      // Refresh products
      const productsData = await invoke<Product[]>('get_products');
      setProducts(productsData);

      // If we have a pending row index and a name, try to find and select the new product
      if (creatingProductRowIndex !== null && newProductName) {
        // We match by name since we don't get the ID back directly reliably without a return from dialog
        // But since we just created it, it should be there.
        // Actually, the dialog doesn't return the product, but we can search for it.
        // Ideally the dialog should return it, but for now we look up by name.
        // Wait, the ProductDialog calls onSucccess but doesn't pass the product. 
        // We'll trust the name is unique enough or just use the last created one if we could.
        // Searching by name_is_exact match is safest.

        // Wait, the newProductName state might hold the name we typed, but the USER might have changed it in the dialog.
        // So this is imperfect. 
        // However, standard flow is user types "NewProd", dialog opens with "NewProd", user saves "NewProd".
        // Use a heuristic: find product with this name.

        // BETTER APPROACH: get_products returns most recent? or we sort?
        // Let's just look for the name we initialized with. If user changed it, they might need to select manually.
        // OR better: we can't easily know. 
        // But for "Quick Add", likely they keep the name.

        const createdProduct = productsData.find(p => p.name.toLowerCase() === newProductName.toLowerCase());
        if (createdProduct) {
          handleUpdateItem(creatingProductRowIndex, 'product_id', createdProduct.id);
        }
      }
    } catch (e) {
      console.error("Failed to refresh products", e);
    }
    setShowCreateProduct(false);
    setCreatingProductRowIndex(null);
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
        onOpenChange={(open) => {
          setShowQuickPayment(open);
          if (!open && autoPrintPending.current) {
            autoPrintPending.current = false;
            // Small timeout to allow dialog to fully close visually before opening next one (optional but nicer)
            setTimeout(() => {
              setShowPrintPreview(true);
            }, 100);
          }
        }}
        invoiceId={savedInvoiceId || salesState.currentVoucherId || undefined}
        invoiceNo={savedInvoiceNo || salesState.currentVoucherNo}
        invoiceAmount={savedInvoiceAmount || salesState.totals.grandTotal}
        invoiceDate={salesState.form.voucher_date}
        partyName={savedPartyName}
        readOnly={salesState.mode === 'viewing'}
        onSuccess={() => {
          toast.success('Payment saved!');
        }}
      />

      <PrintPreviewDialog
        open={showPrintPreview}
        onOpenChange={setShowPrintPreview}
        voucherId={savedInvoiceId || salesState.currentVoucherId || undefined}
        voucherType="sales_invoice"
        title={savedInvoiceNo || salesState.currentVoucherNo ? `Print Invoice - ${savedInvoiceNo || salesState.currentVoucherNo}` : 'Print Invoice'}
      />

      <CustomerDialog
        open={showCreateCustomer}
        onOpenChange={setShowCreateCustomer}
        customerToEdit={null}
        onSave={handleCreateCustomerSave}
        initialName={newCustomerName}
      />

      <ProductDialog
        open={showCreateProduct}
        onOpenChange={setShowCreateProduct}
        units={units}
        groups={productGroups}
        onSuccess={handleCreateProductSave}
        product={undefined} // Always new
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
                  onActionClick={() => {
                    setNewCustomerName('');
                    setShowCreateCustomer(true);
                  }}
                  onCreate={(name) => {
                    setNewCustomerName(name);
                    setShowCreateCustomer(true);
                  }}
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
            onProductCreate={handleProductCreate}
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
                className="min-h-8 text-xs"
                disabled={isReadOnly}
              />
            </div>

            {/* Totals */}
            <div className="col-span-2 bg-card border rounded-lg p-3 shrink-0">
              <div className="flex justify-between items-end">
                <div className="flex gap-3">
                  <div>
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
                      className="h-7 w-24 font-mono text-xs"
                      step="0.01"
                      disabled={isReadOnly}
                    />
                  </div>
                  <div>
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
                      className="h-7 w-28 font-mono text-xs"
                      step="0.01"
                      disabled={isReadOnly}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-medium mb-2">₹ {salesState.totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  <div className="text-lg font-mono font-bold">₹ {salesState.totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
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
    </div >
  );
}
