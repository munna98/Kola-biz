import { useEffect, useMemo, useRef, useState } from 'react';
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
  setPurchaseCreatedByName
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
import { VoucherItemsSection, ColumnSettings, VoucherItemsSectionRef } from '@/components/voucher/VoucherItemsSection';
import PaymentManagementDialog from '@/components/dialogs/PaymentManagementDialog';
import { PrintPreviewDialog } from '@/components/dialogs/PrintPreviewDialog';
import SupplierDialog from '@/components/dialogs/SupplierDialog';
import ProductDialog from '@/components/dialogs/ProductDialog';
import BarcodeLabelDialog from '@/components/dialogs/BarcodeLabelDialog';
import { Product, ProductGroup, ProductUnitConversion, Unit, GstTaxSlab, api } from '@/lib/tauri';
import { buildProductUnitMap, getDefaultProductUnitId, getProductUnitRate } from '@/lib/product-units';
import { calculateVoucherDiscounts } from '@/lib/voucher-discount';

interface Party {
  id: number;
  name: string;
  type: 'customer' | 'supplier';
  group: string;
}

export default function PurchaseInvoicePage() {
  const dispatch = useDispatch<AppDispatch>();
  const purchaseState = useSelector((state: RootState) => state.purchaseInvoice);
  const user = useSelector((state: RootState) => state.auth.user);
  const [products, setProducts] = useState<Product[]>([]);
  const [productUnitConversions, setProductUnitConversions] = useState<ProductUnitConversion[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showListView, setShowListView] = useState(false);
  const [showQuickPayment, setShowQuickPayment] = useState(false);
  const [savedInvoiceAmount, setSavedInvoiceAmount] = useState(0);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | undefined>(undefined);
  const [savedInvoiceNo, setSavedInvoiceNo] = useState<string | undefined>(undefined);
  const [savedInvoiceDate, setSavedInvoiceDate] = useState<string | undefined>(undefined);
  const [savedPartyName, setSavedPartyName] = useState<string>('');
  const [, setSavedPartyId] = useState<number | undefined>(undefined);
  const [savedIsCashBankParty, setSavedIsCashBankParty] = useState(false);
  const [voucherSettings, setVoucherSettings] = useState<{ columns: ColumnSettings[], autoPrint?: boolean, showPaymentModal?: boolean, enableBarcodePrinting?: boolean, skipToNextRowAfterQty?: boolean, taxInclusive?: boolean } | undefined>(undefined);
  const [partyBalance, setPartyBalance] = useState<number | null>(null);
  const [gstSlabs, setGstSlabs] = useState<GstTaxSlab[]>([]);

  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [creatingProductRowIndex, setCreatingProductRowIndex] = useState<number | null>(null);

  // New state for print preview
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Create Supplier Shortcut State
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');

  // Barcode dialog state
  const [showBarcodeDialog, setShowBarcodeDialog] = useState(false);
  const [barcodeProducts, setBarcodeProducts] = useState<{ code: string; name: string; salesRate: number; quantity: number }[]>([]);
  const productUnitsByProduct = useMemo(
    () => buildProductUnitMap(productUnitConversions),
    [productUnitConversions]
  );

  // Refs for focus management
  const formRef = useRef<HTMLFormElement>(null);
  const supplierRef = useRef<HTMLDivElement>(null);
  const voucherItemsRef = useRef<VoucherItemsSectionRef>(null);

  // Ref to track if auto-print is pending after payment dialog
  const autoPrintPending = useRef(false);
  // Ref to track if barcode dialog should open after print preview / payment
  const barcodePending = useRef(false);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsData, unitsData, productUnitConversionsData, accountsData, settingsData, groupsData, gstSettings, slabsData] = await Promise.all([
          invoke<Product[]>('get_products'),
          invoke<Unit[]>('get_units'),
          invoke<ProductUnitConversion[]>('get_all_product_unit_conversions'),
          invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable', 'Accounts Payable', 'Cash', 'Bank Account'] }),
          invoke<any>('get_voucher_settings', { voucherType: 'purchase_invoice' }),
          invoke<ProductGroup[]>('get_product_groups'),
          api.gst.getSettings().catch(() => null),
          api.gst.getSlabs().catch(() => [] as GstTaxSlab[]),
        ]);
        setProducts(productsData);
        setUnits(unitsData);
        setProductUnitConversions(productUnitConversionsData);
        if (settingsData) {
          setVoucherSettings(settingsData);
        }
        setProductGroups(groupsData);
        // Only show GST columns if GST is enabled in settings
        if (gstSettings?.gst_enabled) {
          setGstSlabs(slabsData);
        }

        const combinedParties = accountsData.map(acc => ({
          id: acc.id,
          name: acc.account_name,
          type: acc.account_group === 'Accounts Payable' ? 'supplier' as const : 'customer' as const,
          group: acc.account_group as string
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

  useEffect(() => {
    if (purchaseState.currentVoucherId) {
      setSavedInvoiceId(undefined);
      setSavedInvoiceNo(undefined);
      setSavedInvoiceDate(undefined);
    }
  }, [purchaseState.currentVoucherId]);

  // Default Party Selection Effect
  useEffect(() => {
    if (purchaseState.mode === 'new' && purchaseState.form.supplier_id === 0 && parties.length > 0) {
      // Default to "Cash Purchase" account if available, otherwise first party
      const cashPurchaseAccount = parties.find(p => p.name === 'Cash');
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

      // Set Creator Name
      dispatch(setPurchaseCreatedByName(voucher.created_by_name));

      // Add items
      const mappedItems = items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        unit_id: item.unit_id,
        base_quantity: item.base_quantity,
        hsn_sac_code: item.hsn_sac_code,
        gst_slab_id: item.gst_slab_id,
        resolved_gst_rate: item.resolved_gst_rate,
        cgst_rate: item.cgst_rate,
        sgst_rate: item.sgst_rate,
        igst_rate: item.igst_rate,
        cgst_amount: item.cgst_amount,
        sgst_amount: item.sgst_amount,
        igst_amount: item.igst_amount,
        description: item.description || '',
        initial_quantity: item.initial_quantity,
        count: item.count,
        deduction_per_unit: item.deduction_per_unit,
        rate: item.rate,
        tax_rate: item.tax_rate,
        discount_percent: item.discount_percent || 0,
        discount_amount: item.discount_amount || 0,
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

  const handleAddItem = (insertAt?: number) => {
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
        insertAt,
        product_id: 0,
        product_name: '',
        description: '',
        initial_quantity: parseNum(getDesc('quantity') as string | number),
        count: parseNum(getDesc('count') as string | number) || 1,
        deduction_per_unit: parseNum(getDesc('deduction') as string | number),
        rate: parseNum(getDesc('rate') as string | number),
        tax_rate: parseNum(getDesc('tax_rate') as string | number),
        discount_percent: 0,
        discount_amount: 0,
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
      const product = products.find((p) => String(p.id) === String(value));
      if (product) {
        const productId = String(product.id);
        const productConversions = productUnitsByProduct[productId];
        const defaultUnitId = getDefaultProductUnitId(
          productConversions,
          'purchase',
          product.unit_id
        );
        const rate = getProductUnitRate(
          productConversions,
          defaultUnitId,
          'purchase',
          product.purchase_rate || 0
        );
        finalValue = value;
        const updatedItems = [...purchaseState.items];
        updatedItems[index] = {
          ...updatedItems[index],
            product_id: value,
            product_name: product.name,
            unit_id: defaultUnitId,
            rate,
          };
        dispatch(
          updateItem({
            index,
            data: {
              product_id: value,
              product_name: product.name,
              unit_id: defaultUnitId,
              rate,
            },
          })
        );
        updateTotalsWithItems(updatedItems);
        markUnsaved();
        return;
      }
    }

    if (field === 'unit_id') {
      const currentItem = purchaseState.items[index];
      const productId = String(currentItem.product_id);
      const product = products.find((p) => String(p.id) === productId);
      const rate = getProductUnitRate(
        productUnitsByProduct[productId],
        value,
        'purchase',
        product?.purchase_rate || currentItem.rate || 0
      );
      finalValue = value;
      const updatedItems = [...purchaseState.items];
      updatedItems[index] = {
        ...updatedItems[index],
        unit_id: value,
        rate
      };
      dispatch(updateItem({ index, data: { unit_id: value, rate } }));
      updateTotalsWithItems(updatedItems);
      markUnsaved();
      return;
    }

    const updatedItems = [...purchaseState.items];
    let item = { ...updatedItems[index], [field]: finalValue };

    // Discount Logic Sync
    if (field === 'discount_percent') {
      const grossAmount = (item.initial_quantity - item.count * item.deduction_per_unit) * item.rate;
      item.discount_amount = parseFloat(((grossAmount * (finalValue as number)) / 100).toFixed(2));
    } else if (field === 'discount_amount') {
      const grossAmount = (item.initial_quantity - item.count * item.deduction_per_unit) * item.rate;
      item.discount_percent = grossAmount > 0 ? parseFloat(((finalValue as number / grossAmount) * 100).toFixed(2)) : 0;
    } else if (field === 'rate' || field === 'initial_quantity' || field === 'count' || field === 'deduction_per_unit') {
      const grossAmount = (item.initial_quantity - item.count * item.deduction_per_unit) * item.rate;
      if (item.discount_percent > 0) {
        item.discount_amount = parseFloat(((grossAmount * item.discount_percent) / 100).toFixed(2));
      }
    }

    updatedItems[index] = item;
    dispatch(updateItem({ index, data: item }));
    updateTotalsWithItems(updatedItems);
    markUnsaved();
  };

  const updateTotalsWithItems = (items: any[], discountRate?: number, discountAmount?: number) => {
    // Slab-aware GST resolution
    const productMap: Record<string, Product> = {};
    products.forEach(p => { productMap[String(p.id)] = p; });
    const slabMap: Record<string, GstTaxSlab> = {};
    gstSlabs.forEach(s => { slabMap[s.id] = s; });

    const resolveItemGstRate = (item: any) => {
      if (typeof item.resolved_gst_rate === 'number' && item.resolved_gst_rate > 0) {
        return item.resolved_gst_rate;
      }

      if (item.gst_slab_id) {
        const savedSlab = slabMap[item.gst_slab_id];
        if (savedSlab) {
          return savedSlab.is_dynamic === 1
            ? (item.rate < savedSlab.threshold ? savedSlab.below_rate : savedSlab.above_rate)
            : savedSlab.fixed_rate;
        }
      }

      const product = productMap[String(item.product_id)];
      if (product?.gst_slab_id) {
        const slab = slabMap[product.gst_slab_id];
        if (slab) {
          return slab.is_dynamic === 1
            ? (item.rate < slab.threshold ? slab.below_rate : slab.above_rate)
            : slab.fixed_rate;
        }
      }

      return item.tax_rate || 0;
    };

    const calculation = calculateVoucherDiscounts(items, {
      discountRate: discountRate !== undefined ? discountRate : purchaseState.form.discount_rate,
      discountAmount:
        discountRate !== undefined
          ? undefined
          : discountAmount !== undefined
            ? discountAmount
            : purchaseState.form.discount_amount,
      taxInclusive: !!voucherSettings?.taxInclusive,
      resolveGstRate: resolveItemGstRate,
    });

    dispatch(setDiscountRate(calculation.discountRate));
    dispatch(setDiscountAmount(calculation.discountAmount));
    dispatch(setTotals({
      subtotal: calculation.subtotal,
      discount: calculation.discountAmount,
      tax: calculation.tax,
      grandTotal: calculation.grandTotal
    }));
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
              unit_id: item.unit_id || null,
              description: item.description,
              initial_quantity: item.initial_quantity,
              count: item.count,
              deduction_per_unit: item.deduction_per_unit,
              rate: item.rate,
              tax_rate: item.tax_rate
            })),
            tax_inclusive: voucherSettings?.taxInclusive ?? false,
          },
        });

        toast.success('Purchase invoice updated successfully');

        // Prepare state for Payment Dialog & Print (persist before reset)
        setSavedInvoiceId(purchaseState.currentVoucherId);
        setSavedInvoiceNo(purchaseState.currentVoucherNo);
        setSavedInvoiceDate(purchaseState.form.voucher_date);
        setSavedInvoiceAmount(purchaseState.totals.grandTotal);
        const supplier = parties.find(p => p.id === purchaseState.form.supplier_id);
        setSavedPartyName(supplier?.name || 'Cash');
        setSavedPartyId(supplier?.id);

        // Check if party is a Cash or Bank account
        const isCashBankParty = supplier?.group === 'Cash' || supplier?.group === 'Bank Account';
        setSavedIsCashBankParty(isCashBankParty);

        // Show payment dialog if enabled
        const shouldShowPaymentModal = voucherSettings?.showPaymentModal !== false;
        if (shouldShowPaymentModal) {
          if (voucherSettings?.autoPrint) {
            autoPrintPending.current = true;
          }
          if (voucherSettings?.enableBarcodePrinting) {
            barcodePending.current = true;
          }
          setShowQuickPayment(true);
        } else {
          // Payment modal disabled: skip to print/barcode
          if (voucherSettings?.autoPrint) {
            if (voucherSettings?.enableBarcodePrinting) {
              barcodePending.current = true;
            }
            setShowPrintPreview(true);
          } else if (voucherSettings?.enableBarcodePrinting) {
            setShowBarcodeDialog(true);
          }
        }
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
              unit_id: item.unit_id || null,
              description: item.description,
              initial_quantity: item.initial_quantity,
              count: item.count,
              deduction_per_unit: item.deduction_per_unit,
              rate: item.rate,
              tax_rate: item.tax_rate
            })),
            user_id: user?.id.toString(),
            tax_inclusive: voucherSettings?.taxInclusive ?? false,
          },
        });
        toast.success('Purchase invoice created successfully');

        // Auto-prompt for payment after creating invoice
        setSavedInvoiceAmount(purchaseState.totals.grandTotal);
        setSavedInvoiceId(newInvoiceId);
        setSavedInvoiceDate(purchaseState.form.voucher_date);

        // Fetch new invoice to get the generated voucher number
        const newInvoice = await invoke<any>('get_purchase_invoice', { id: newInvoiceId });
        setSavedInvoiceNo(newInvoice.voucher_no);

        const supplier = parties.find(p => p.id === purchaseState.form.supplier_id);
        const partyName = supplier?.name || 'Cash';
        setSavedPartyName(partyName);
        setSavedPartyId(supplier?.id);

        // Check if party is a Cash or Bank account
        const isCashBankParty = supplier?.group === 'Cash' || supplier?.group === 'Bank Account';
        setSavedIsCashBankParty(isCashBankParty);

        if (isCashBankParty) {
          const shouldShowPaymentModal = voucherSettings?.showPaymentModal !== false;
          if (shouldShowPaymentModal) {
            // Cash/Bank party: show payment modal for split opportunity
            if (voucherSettings?.autoPrint) {
              autoPrintPending.current = true;
            }
            if (voucherSettings?.enableBarcodePrinting) {
              barcodePending.current = true;
            }
            setShowQuickPayment(true);
          } else {
            // Payment modal disabled: skip to print/barcode
            if (voucherSettings?.autoPrint) {
              if (voucherSettings?.enableBarcodePrinting) {
                barcodePending.current = true;
              }
              setShowPrintPreview(true);
            } else if (voucherSettings?.enableBarcodePrinting) {
              setShowBarcodeDialog(true);
            }
          }
        } else {
          // Regular party: check payment modal setting
          const shouldShowPaymentModal = voucherSettings?.showPaymentModal !== false;

          if (shouldShowPaymentModal) {
            if (voucherSettings?.autoPrint) {
              autoPrintPending.current = true;
            }
            if (voucherSettings?.enableBarcodePrinting) {
              barcodePending.current = true;
            }
            setShowQuickPayment(true);
          } else {
            // Payment modal disabled for non-cash parties: invoice remains unpaid
            if (voucherSettings?.autoPrint) {
              setShowPrintPreview(true);
            } else if (voucherSettings?.enableBarcodePrinting) {
              // No print preview, but barcode is enabled — open barcode dialog directly
              barcodePending.current = false;
              setShowBarcodeDialog(true);
            }
          }
        }
      }

      // Capture products for barcode dialog before form resets
      if (voucherSettings?.enableBarcodePrinting) {
        const barcodeItems = purchaseState.items
          .filter(item => item.product_id)
          .map(item => {
            const product = products.find(p => String(p.id) === String(item.product_id));
            return {
              code: product?.code || '',
              name: product?.name || item.product_name || '',
              salesRate: product?.sales_rate || item.rate || 0,
              quantity: item.initial_quantity - item.count * item.deduction_per_unit,
            };
          });
        setBarcodeProducts(barcodeItems);
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

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const handleCreateSupplierSave = async (newSupplier?: any) => {
    // Refresh parties list
    try {
      const accountsData = await invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable', 'Accounts Payable', 'Cash', 'Bank Account'] });
      const combinedParties = accountsData.map(acc => ({
        id: acc.id,
        name: acc.account_name,
        type: acc.account_group === 'Accounts Payable' ? 'supplier' as const : 'customer' as const,
        group: acc.account_group as string
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

  const handleProductCreate = (name: string, rowIndex: number) => {
    setNewProductName(name);
    setCreatingProductRowIndex(rowIndex);
    setShowCreateProduct(true);
  };

  const handleCreateProductSave = async () => {
    try {
      // Refresh products
      const [productsData, productUnitConversionsData] = await Promise.all([
        invoke<Product[]>('get_products'),
        invoke<ProductUnitConversion[]>('get_all_product_unit_conversions')
      ]);
      setProducts(productsData);
      setProductUnitConversions(productUnitConversionsData);

      // If we have a pending row index and a name, try to find and select the new product
      if (creatingProductRowIndex !== null && newProductName) {
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

  const getItemAmount = (item: typeof purchaseState.items[0]) => {
    let gstRate = item.tax_rate || 0;
    if (typeof item.resolved_gst_rate === 'number' && item.resolved_gst_rate > 0) {
      gstRate = item.resolved_gst_rate;
    } else if (item.gst_slab_id) {
      const savedSlab = gstSlabs.find(s => s.id === item.gst_slab_id);
      if (savedSlab) {
        gstRate = savedSlab.is_dynamic === 1
          ? (item.rate < savedSlab.threshold ? savedSlab.below_rate : savedSlab.above_rate)
          : savedSlab.fixed_rate;
      }
    } else {
      const product = products.find(p => String(p.id) === String(item.product_id));
      if (product?.gst_slab_id) {
        const slab = gstSlabs.find(s => s.id === product.gst_slab_id);
        if (slab) {
          gstRate = slab.is_dynamic === 1
            ? (item.rate < slab.threshold ? slab.below_rate : slab.above_rate)
            : slab.fixed_rate;
        }
      }
    }

    const sourceItems = purchaseState.items.some((candidate) => candidate.id === item.id) ? purchaseState.items : [item];
    const calculation = calculateVoucherDiscounts(sourceItems, {
      discountRate: purchaseState.form.discount_rate,
      discountAmount: purchaseState.form.discount_amount,
      taxInclusive: !!voucherSettings?.taxInclusive,
      resolveGstRate: () => gstRate,
    });
    const lineIndex = sourceItems.length === 1 ? 0 : sourceItems.findIndex((candidate) => candidate.id === item.id);
    const line = calculation.lines[Math.max(lineIndex, 0)];
    const grossTax = Math.round(line.netBeforeInvoiceDiscount * (gstRate / 100) * 100) / 100;
    return {
      finalQty: line.finalQty,
      amount: line.netBeforeInvoiceDiscount,
      taxAmount: grossTax,
      total: Math.round((line.netBeforeInvoiceDiscount + grossTax) * 100) / 100
    };
  };

  // Determine if form should be disabled (viewing mode)
  const isReadOnly = purchaseState.mode === 'viewing';

  // Compute isCashBankParty dynamically so 'Manage Payments' in view mode also routes correctly.
  const currentSupplierParty = parties.find(p => p.id === purchaseState.form.supplier_id);
  const currentPartyIsCashBank = currentSupplierParty?.group === 'Cash' || currentSupplierParty?.group === 'Bank Account';
  const shouldShowPartyBalance = currentSupplierParty?.name.trim().toLowerCase() !== 'cash';
  const isShowingSavedInvoiceContext = !!savedInvoiceId;
  const effectiveIsCashBankParty = isShowingSavedInvoiceContext ? savedIsCashBankParty : currentPartyIsCashBank;


  return (
    <div className="h-full flex flex-col bg-background">
      <VoucherPageHeader
        title="Purchase Invoice"
        description="Record and manage purchase invoices"
        mode={purchaseState.mode}
        voucherNo={purchaseState.currentVoucherNo}
        voucherDate={purchaseState.form.voucher_date}
        createdBy={purchaseState.created_by_name}
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
        onOpenChange={(open) => {
          setShowQuickPayment(open);
          if (!open && autoPrintPending.current) {
            autoPrintPending.current = false;
            // Small timeout to allow dialog to fully close visually before opening next one
            setTimeout(() => {
              setShowPrintPreview(true);
            }, 100);
          } else if (!open && barcodePending.current) {
            barcodePending.current = false;
            setTimeout(() => {
              setShowBarcodeDialog(true);
            }, 100);
          }
        }}
        invoiceId={savedInvoiceId || purchaseState.currentVoucherId || undefined}
        invoiceNo={savedInvoiceNo || purchaseState.currentVoucherNo}
        invoiceAmount={savedInvoiceAmount || purchaseState.totals.grandTotal}
        invoiceDate={savedInvoiceDate || purchaseState.form.voucher_date}
        partyName={savedPartyName}
        readOnly={purchaseState.mode === 'viewing'}
        isCashBankParty={effectiveIsCashBankParty}
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
        onOpenChange={(open) => {
          setShowPrintPreview(open);
          if (!open && barcodePending.current) {
            barcodePending.current = false;
            setTimeout(() => {
              setShowBarcodeDialog(true);
            }, 100);
          }
        }}
        voucherId={savedInvoiceId || purchaseState.currentVoucherId || undefined}
        voucherType="purchase_invoice"
        title={savedInvoiceNo || purchaseState.currentVoucherNo ? `Print Invoice - ${savedInvoiceNo || purchaseState.currentVoucherNo}` : 'Print Invoice'}
      />

      <BarcodeLabelDialog
        open={showBarcodeDialog}
        onOpenChange={setShowBarcodeDialog}
        products={barcodeProducts}
      />

      <SupplierDialog
        open={showCreateSupplier}
        onOpenChange={setShowCreateSupplier}
        supplierToEdit={null}
        onSave={handleCreateSupplierSave}
        initialName={newSupplierName}
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
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <form ref={formRef} onSubmit={handleSubmit} className="flex-1 min-h-0 p-5 max-w-7xl mx-auto flex flex-col gap-4">
          {/* Master Section */}
          <div className="bg-card border rounded-lg p-3 space-y-3 shrink-0">
            <div className="grid grid-cols-6 gap-3">
              {/* Supplier */}
              <div ref={supplierRef} className="col-span-2">
                <Label className="text-xs font-medium mb-1 block">Party *</Label>
                <Combobox
                  options={parties.map(p => ({
                    value: p.id,
                    label: p.name
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

                      // Auto-focus first product after party selection
                      setTimeout(() => {
                        voucherItemsRef.current?.focusFirstProduct();
                      }, 100);
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
            ref={voucherItemsRef}
            items={purchaseState.items}
            products={products}
            units={units}
            productUnitsByProduct={productUnitsByProduct}
            isReadOnly={isReadOnly}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            onUpdateItem={handleUpdateItem}
            getItemAmount={getItemAmount}
            addItemLabel="Add Item (Ctrl+N)"
            disableAdd={isReadOnly}
            settings={voucherSettings}
            onProductCreate={handleProductCreate}
            onSectionExit={() => {
              // Focus discount amount input
              setTimeout(() => {
                document.getElementById('voucher-discount-amount')?.focus();
              }, 50);
            }}
            defaultUnitKind="purchase"
            gstSlabs={gstSlabs}
            fullProducts={products as any}
            taxInclusive={voucherSettings?.taxInclusive}
            footerRightContent={
              partyBalance !== null && shouldShowPartyBalance ? (
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
                className="min-h-8 text-xs"
                disabled={isReadOnly}
              />
            </div>

            {/* Totals */}
            <div className="col-span-2 bg-card border rounded-lg p-3 shrink-0">
              <div className="flex justify-between items-end">
                <div className="flex gap-3 items-end">
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Discount %</Label>
                    <Input
                      type="number"
                      value={purchaseState.form.discount_rate}
                      onChange={(e) => {
                        const rate = parseFloat(e.target.value) || 0;
                        updateTotalsWithItems(purchaseState.items, rate, undefined);
                        markUnsaved();
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
                      value={purchaseState.form.discount_amount}
                      onChange={(e) => {
                        const amount = parseFloat(e.target.value) || 0;
                        updateTotalsWithItems(purchaseState.items, undefined, amount);
                        markUnsaved();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          document.getElementById('voucher-save-btn')?.focus();
                        }
                      }}
                      placeholder="0.00"
                      className="h-7 w-28 font-mono text-xs"
                      step="0.01"
                      disabled={isReadOnly}
                      id="voucher-discount-amount"
                    />
                  </div>
                </div>
                <div className="text-right space-y-0.5">
                  <div className="flex justify-between items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-mono font-medium">₹ {purchaseState.totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {purchaseState.totals.discount > 0 && (
                    <div className="text-xs font-mono text-muted-foreground">
                      Discount: ₹ {purchaseState.totals.discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                  {purchaseState.totals.tax > 0 && (
                    <div className="text-xs font-mono text-muted-foreground">Tax: ₹ {purchaseState.totals.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  )}
                  <div className="text-lg font-mono font-bold">₹ {purchaseState.totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
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
              <Button
                type="submit"
                disabled={purchaseState.loading}
                className="h-9"
                title="Save (Ctrl+S)"
                id="voucher-save-btn"
              >
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
