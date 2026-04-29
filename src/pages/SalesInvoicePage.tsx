import { useEffect, useMemo, useRef, useState } from 'react';
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
  setSalesNavigationData,
  setSalesSalespersonId,
  setSalesHasUnsavedChanges,
  setSalesCreatedByName,
  createNewSalesTab,
  switchSalesTab,
  closeSalesTab,
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
  IconPlus,
  IconSettings2,
} from '@tabler/icons-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';


// Global Voucher Components & Hooks
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
// import { usePrint } from '@/hooks/usePrint';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';

import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { VoucherItemsSection, ColumnSettings, VoucherItemsSectionRef } from '@/components/voucher/VoucherItemsSection';

import PaymentManagementDialog from '@/components/dialogs/PaymentManagementDialog';
import { usePrint } from '@/hooks/usePrint';
import CustomerDialog from '@/components/dialogs/CustomerDialog';
import ProductDialog from '@/components/dialogs/ProductDialog';
import { Product, ProductGroup, ProductUnitConversion, Unit, Employee, GstTaxSlab, api } from '@/lib/tauri';
import { buildProductUnitMap, getDefaultProductUnitId, getProductUnitRate } from '@/lib/product-units';
import { calculateVoucherDiscounts } from '@/lib/voucher-discount';



interface Party {
  id: number;
  name: string;
  type: 'customer' | 'supplier';
  group: string;
  address_line_1?: string;
}

export default function SalesInvoicePage() {
  const dispatch = useDispatch<AppDispatch>();
  const salesState = useSelector((state: RootState) => state.salesInvoice);
  const user = useSelector((state: RootState) => state.auth.user);
  const [products, setProducts] = useState<Product[]>([]);
  const [productUnitConversions, setProductUnitConversions] = useState<ProductUnitConversion[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showListView, setShowListView] = useState(false);
  const { print: printVoucher } = usePrint();
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [creatingProductRowIndex, setCreatingProductRowIndex] = useState<number | null>(null);
  const [showQuickPayment, setShowQuickPayment] = useState(false);
  const [savedInvoiceAmount, setSavedInvoiceAmount] = useState(0);
  const [savedInvoiceId, setSavedInvoiceId] = useState<string | undefined>(undefined);
  const [savedInvoiceNo, setSavedInvoiceNo] = useState<string | undefined>(undefined);
  const [savedInvoiceDate, setSavedInvoiceDate] = useState<string | undefined>(undefined);
  const [savedPartyName, setSavedPartyName] = useState<string>('');
  const [, setSavedPartyId] = useState<number | undefined>(undefined);
  const [savedIsCashBankParty, setSavedIsCashBankParty] = useState(false);
  const [voucherSettings, setVoucherSettings] = useState<{ columns: ColumnSettings[], autoPrint?: boolean, showPaymentModal?: boolean, skipToNextRowAfterQty?: boolean, taxInclusive?: boolean } | undefined>(undefined);
  const [isTaxInclusive, setIsTaxInclusive] = useState(false);
  const [partyBalance, setPartyBalance] = useState<number | null>(null);
  const [gstSlabs, setGstSlabs] = useState<GstTaxSlab[]>([]);
  const [gstDisabled, setGstDisabled] = useState(false);


  const productUnitsByProduct = useMemo(
    () => buildProductUnitMap(productUnitConversions),
    [productUnitConversions]
  );

  // Create Customer Shortcut State
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');


  // Refs for focus management
  const formRef = useRef<HTMLFormElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  const voucherItemsRef = useRef<VoucherItemsSectionRef>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsData, unitsData, productUnitConversionsData, accountsData, settingsData, groupsData, employeesData, gstSettings, slabsData] = await Promise.all([
          invoke<Product[]>('get_products'),
          invoke<Unit[]>('get_units'),
          invoke<ProductUnitConversion[]>('get_all_product_unit_conversions'),
          invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable', 'Accounts Payable', 'Cash', 'Bank Account'] }),
          invoke<any>('get_voucher_settings', { voucherType: 'sales_invoice' }),
          invoke<ProductGroup[]>('get_product_groups'),
          invoke<Employee[]>('get_employees'),
          api.gst.getSettings().catch(() => null),
          api.gst.getSlabs().catch(() => [] as GstTaxSlab[]),
        ]);
        setProducts(productsData);
        setUnits(unitsData);
        setProductUnitConversions(productUnitConversionsData);
        if (settingsData) {
          setVoucherSettings(settingsData);
          setIsTaxInclusive(!!settingsData.taxInclusive);
        }
        setProductGroups(groupsData);
        setEmployees(employeesData.filter((e: Employee) => e.status === 'active'));
        // Only show GST columns if GST is enabled in settings
        if (gstSettings?.gst_enabled) {
          setGstSlabs(slabsData);
        }

        const combinedParties = accountsData.map(acc => ({
          id: acc.id,
          name: acc.account_name,
          type: acc.account_group === 'Accounts Receivable' ? 'customer' as const : 'supplier' as const,
          group: acc.account_group as string,
          address_line_1: acc.address_line_1 as string | undefined,
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
    if (salesState.mode === 'new' && !salesState.currentVoucherId) {
      setIsTaxInclusive(!!voucherSettings?.taxInclusive);
    }
  }, [salesState.mode, salesState.currentVoucherId, voucherSettings?.taxInclusive]);

  // Clear savedInvoiceId when navigating to a different voucher (so we don't hold onto stale IDs)
  useEffect(() => {
    if (salesState.currentVoucherId) {
      setSavedInvoiceId(undefined);
      setSavedInvoiceNo(undefined);
      setSavedInvoiceDate(undefined);
    }
  }, [salesState.currentVoucherId]);

  // Default Party Selection Effect
  useEffect(() => {
    if (salesState.mode === 'new' && salesState.form.customer_id === 0 && parties.length > 0) {
      // Default to "Cash Sale" account if available, otherwise first party
      const cashSaleAccount = parties.find(p => p.name === 'Cash');
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

  const handleAddItem = (insertAt?: number) => {
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
        insertAt,
        product_id: 0,
        product_name: '',
        description: '',
        initial_quantity: parseNum(getDesc('quantity') as string | number),
        count: parseNum(getDesc('count') as string | number) || 1, // Fallback to 1 if 0/undefined
        deduction_per_unit: parseNum(getDesc('deduction') as string | number),
        rate: parseNum(getDesc('rate') as string | number),
        tax_rate: parseNum(getDesc('tax_rate') as string | number),
        discount_percent: 0,
        discount_amount: 0,
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
      const product = products.find((p) => String(p.id) === String(value));
      if (product) {
        const productId = String(product.id);
        const productConversions = productUnitsByProduct[productId];
        const defaultUnitId = getDefaultProductUnitId(
          productConversions,
          'sale',
          product.unit_id
        );
        const rate = getProductUnitRate(
          productConversions,
          defaultUnitId,
          'sale',
          product.sales_rate || 0
        );
        finalValue = value;
        const updatedItems = [...salesState.items];
        updatedItems[index] = {
          ...updatedItems[index],
          product_id: value,
          product_name: product.name,
          unit_id: defaultUnitId,
          rate,
        };
        dispatch(
          updateSalesItem({
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
        dispatch(setSalesHasUnsavedChanges(true));
        return;
      }
    }

    if (field === 'unit_id') {
      const currentItem = salesState.items[index];
      const productId = String(currentItem.product_id);
      const product = products.find((p) => String(p.id) === productId);
      const rate = getProductUnitRate(
        productUnitsByProduct[productId],
        value,
        'sale',
        product?.sales_rate || currentItem.rate || 0
      );
      finalValue = value;
      const updatedItems = [...salesState.items];
      updatedItems[index] = {
        ...updatedItems[index],
        unit_id: value,
        rate
      };
      dispatch(updateSalesItem({ index, data: { unit_id: value, rate } }));
      updateTotalsWithItems(updatedItems);
      dispatch(setSalesHasUnsavedChanges(true));
      return;
    }

    const updatedItems = [...salesState.items];
    let item = { ...updatedItems[index], [field]: finalValue };

    // Discount Logic Sync
    if (field === 'discount_percent') {
      const grossAmount = (item.initial_quantity - item.count * item.deduction_per_unit) * item.rate;
      item.discount_amount = parseFloat(((grossAmount * (finalValue as number)) / 100).toFixed(2));
    } else if (field === 'discount_amount') {
      const grossAmount = (item.initial_quantity - item.count * item.deduction_per_unit) * item.rate;
      item.discount_percent = grossAmount > 0 ? parseFloat(((finalValue as number / grossAmount) * 100).toFixed(2)) : 0;
    } else if (field === 'rate' || field === 'initial_quantity' || field === 'count' || field === 'deduction_per_unit') {
      // Re-calc discount amount if relying on percent? Usually we keep percent constant.
      const grossAmount = (item.initial_quantity - item.count * item.deduction_per_unit) * item.rate;
      if (item.discount_percent > 0) {
        item.discount_amount = parseFloat(((grossAmount * item.discount_percent) / 100).toFixed(2));
      }
    }

    updatedItems[index] = item;
    dispatch(updateSalesItem({ index, data: item }));
    updateTotalsWithItems(updatedItems);
    dispatch(setSalesHasUnsavedChanges(true));
  };

  const updateTotalsWithItems = (items: typeof salesState.items, discountRate?: number, discountAmount?: number) => {
    // Slab-aware GST resolution
    const productMap: Record<string, Product> = {};
    products.forEach(p => { productMap[String(p.id)] = p; });
    const slabMap: Record<string, GstTaxSlab> = {};
    gstSlabs.forEach(s => { slabMap[s.id] = s; });

    const resolveItemGstRate = (item: typeof salesState.items[number]) => {
      if (gstDisabled) return 0;
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
      discountRate: discountRate !== undefined ? discountRate : salesState.form.discount_rate,
      discountAmount:
        discountRate !== undefined
          ? undefined
          : discountAmount !== undefined
            ? discountAmount
            : salesState.form.discount_amount,
      taxInclusive: isTaxInclusive,
      resolveGstRate: resolveItemGstRate,
    });

    dispatch(setSalesDiscountRate(calculation.discountRate));
    dispatch(setSalesDiscountAmount(calculation.discountAmount));
    dispatch(setSalesTotals({
      subtotal: calculation.subtotal,
      discount: calculation.discountAmount,
      tax: calculation.tax,
      grandTotal: calculation.grandTotal
    }));
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
            salesperson_id: salesState.form.salesperson_id || null,
            party_type: salesState.form.party_type,
            voucher_date: salesState.form.voucher_date,
            reference: salesState.form.reference || null,
            narration: salesState.form.narration || null,
            discount_rate: salesState.form.discount_rate || null,
            discount_amount: salesState.form.discount_amount || null,
            items: salesState.items.map(item => ({
              product_id: item.product_id,
              unit_id: item.unit_id || null,
              description: item.description,
              initial_quantity: item.initial_quantity,
              count: item.count,
              deduction_per_unit: item.deduction_per_unit,
              rate: item.rate,
              tax_rate: item.tax_rate
            })),
            tax_inclusive: isTaxInclusive,
            gst_disabled: gstDisabled,
          },
        });
        toast.success('Sales invoice updated successfully');

        toast.success('Sales invoice updated successfully');

        // Prepare state for Payment Dialog & Print (persist before reset)
        setSavedInvoiceId(salesState.currentVoucherId);
        setSavedInvoiceNo(salesState.currentVoucherNo);
        setSavedInvoiceDate(salesState.form.voucher_date);
        setSavedInvoiceAmount(salesState.totals.grandTotal);
        const customer = parties.find(p => p.id === salesState.form.customer_id);
        setSavedPartyName(customer?.name || 'Cash');
        setSavedPartyId(customer?.id);

        // Check if party is a Cash or Bank account
        const isCashBankParty = customer?.group === 'Cash' || customer?.group === 'Bank Account';
        setSavedIsCashBankParty(isCashBankParty);

        // Always show payment dialog (for Cash parties: allows split; for regular: normal payment)
        if (voucherSettings?.autoPrint) {
          autoPrintPending.current = true;
        }
        setShowQuickPayment(true);
      } else {
        const newInvoiceId = await invoke<string>('create_sales_invoice', {
          invoice: {
            customer_id: salesState.form.customer_id,
            salesperson_id: salesState.form.salesperson_id || null,
            party_type: salesState.form.party_type,
            voucher_date: salesState.form.voucher_date,
            reference: salesState.form.reference || null,
            narration: salesState.form.narration || null,
            discount_rate: salesState.form.discount_rate || null,
            discount_amount: salesState.form.discount_amount || null,
            items: salesState.items.map(item => ({
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
            tax_inclusive: isTaxInclusive,
            gst_disabled: gstDisabled,
          },
        });
        toast.success('Sales invoice created successfully');

        // Auto-prompt for payment after creating invoice
        setSavedInvoiceAmount(salesState.totals.grandTotal);
        setSavedInvoiceId(newInvoiceId);
        setSavedInvoiceDate(salesState.form.voucher_date);

        // Fetch new invoice to get the generated voucher number
        const newInvoice = await invoke<any>('get_sales_invoice', { id: newInvoiceId });
        setSavedInvoiceNo(newInvoice.voucher_no);

        const customer = parties.find(p => p.id === salesState.form.customer_id);
        const partyName = customer?.name || 'Cash';
        setSavedPartyName(partyName);
        setSavedPartyId(customer?.id);

        // Check if party is a Cash or Bank account
        const isCashBankParty = customer?.group === 'Cash' || customer?.group === 'Bank Account';
        setSavedIsCashBankParty(isCashBankParty);

        if (isCashBankParty) {
          // Cash/Bank party: always show payment modal for split opportunity
          if (voucherSettings?.autoPrint) {
            autoPrintPending.current = true;
          }
          setShowQuickPayment(true);
        } else {
          // Regular party: check payment modal setting
          const shouldShowPaymentModal = voucherSettings?.showPaymentModal !== false;

          if (shouldShowPaymentModal) {
            if (voucherSettings?.autoPrint) {
              autoPrintPending.current = true;
            }
            setShowQuickPayment(true);
          } else {
            // Payment modal disabled for non-cash parties: invoice remains unpaid
            if (voucherSettings?.autoPrint) {
              setTimeout(() => printVoucher({ voucherId: newInvoiceId, voucherType: 'sales_invoice' }), 100);
            }
          }
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
      dispatch(setSalesSalespersonId(invoice.salesperson_id || undefined));
      dispatch(setSalesReference(invoice.reference || ''));
      dispatch(setSalesNarration(invoice.narration || ''));
      dispatch(setSalesDiscountRate(invoice.discount_rate || 0));
      dispatch(setSalesDiscountAmount(invoice.discount_amount || 0));
      const loadedTaxInclusive = Boolean(invoice.tax_inclusive);
      setIsTaxInclusive(loadedTaxInclusive);

      // Set Creator Name
      dispatch(setSalesCreatedByName(invoice.created_by_name));

      // Populate Items
      // Clear default empty item
      // Note: resetSalesForm sets items to [], so we just add
      items.forEach(item => {
        const storedGstRate = item.resolved_gst_rate || item.tax_rate || 0;
        const displayRate = loadedTaxInclusive
          ? item.rate * (1 + (storedGstRate / 100))
          : item.rate;
        dispatch(addSalesItem({
        product_id: item.product_id || 0, // Using product_id from item if available, else need map
        product_name: item.description, // Fallback
        unit_id: item.unit_id,
          hsn_sac_code: item.hsn_sac_code,
          gst_slab_id: item.gst_slab_id,
          resolved_gst_rate: item.resolved_gst_rate,
          cgst_rate: item.cgst_rate,
          sgst_rate: item.sgst_rate,
          igst_rate: item.igst_rate,
          cgst_amount: item.cgst_amount,
          sgst_amount: item.sgst_amount,
          igst_amount: item.igst_amount,
          base_quantity: item.base_quantity,
          description: item.description,
          initial_quantity: item.initial_quantity,
          count: item.count,
          deduction_per_unit: item.deduction_per_unit,
          rate: displayRate,
          tax_rate: item.tax_rate,
          discount_percent: item.discount_percent || 0,
          discount_amount: item.discount_amount || 0,
        }));
      });

      // Calculate totals
      // We need to pass the loaded items to updateTotals
      // Construct items array locally for total calculation
      const loadedItems = items.map(item => ({
        id: `loaded-${item.id}`,
        product_id: item.product_id || 0,
        product_name: item.description,
        unit_id: item.unit_id,
        hsn_sac_code: item.hsn_sac_code,
        gst_slab_id: item.gst_slab_id,
        resolved_gst_rate: item.resolved_gst_rate,
        cgst_rate: item.cgst_rate,
        sgst_rate: item.sgst_rate,
        igst_rate: item.igst_rate,
        cgst_amount: item.cgst_amount,
        sgst_amount: item.sgst_amount,
        igst_amount: item.igst_amount,
        description: item.description,
        initial_quantity: item.initial_quantity,
        count: item.count,
        deduction_per_unit: item.deduction_per_unit,
        rate: loadedTaxInclusive
          ? item.rate * (1 + (((item.resolved_gst_rate || item.tax_rate) || 0) / 100))
          : item.rate,
        tax_rate: item.tax_rate,
        discount_percent: item.discount_percent || 0,
        discount_amount: item.discount_amount || 0,
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
    printVoucher({ voucherId: salesState.currentVoucherId, voucherType: 'sales_invoice' });
  };


  // Global keyboard shortcuts hook
  useVoucherShortcuts({
    onSave: () => formRef.current?.requestSubmit(),
    onNewItem: handleAddItem,
    onClear: handleNew,
    onToggleShortcuts: () => setShowShortcuts(prev => !prev),
    onCloseShortcuts: () => setShowShortcuts(false),
    onNewTab: () => dispatch(createNewSalesTab()),
    onCloseTab: () => dispatch(closeSalesTab(salesState.activeTabId)),
    onNextTab: () => {
      const allTabs = [
        ...(salesState.inactiveTabs || []).map(t => ({...t, isActive: false})),
        { id: salesState.activeTabId || 'tab-1', isActive: true }
      ].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      const activeIndex = allTabs.findIndex(t => t.isActive);
      if (activeIndex !== -1 && activeIndex < allTabs.length - 1) {
        dispatch(switchSalesTab(allTabs[activeIndex + 1].id));
      } else if (allTabs.length > 1) {
        dispatch(switchSalesTab(allTabs[0].id));
      }
    },
    onPrevTab: () => {
      const allTabs = [
        ...(salesState.inactiveTabs || []).map(t => ({...t, isActive: false})),
        { id: salesState.activeTabId || 'tab-1', isActive: true }
      ].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      const activeIndex = allTabs.findIndex(t => t.isActive);
      if (activeIndex > 0) {
        dispatch(switchSalesTab(allTabs[activeIndex - 1].id));
      } else if (allTabs.length > 1) {
        dispatch(switchSalesTab(allTabs[allTabs.length - 1].id));
      }
    },

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
      const accountsData = await invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable', 'Accounts Payable', 'Cash', 'Bank Account'] });
      const combinedParties = accountsData.map(acc => ({
        id: acc.id,
        name: acc.account_name,
        type: acc.account_group === 'Accounts Receivable' ? 'customer' as const : 'supplier' as const,
        group: acc.account_group as string,
        address_line_1: acc.address_line_1 as string | undefined,
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
      const [productsData, productUnitConversionsData] = await Promise.all([
        invoke<Product[]>('get_products'),
        invoke<ProductUnitConversion[]>('get_all_product_unit_conversions')
      ]);
      setProducts(productsData);
      setProductUnitConversions(productUnitConversionsData);

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

    const sourceItems = salesState.items.some((candidate) => candidate.id === item.id) ? salesState.items : [item];
    const calculation = calculateVoucherDiscounts(sourceItems, {
      discountRate: salesState.form.discount_rate,
      discountAmount: salesState.form.discount_amount,
      taxInclusive: isTaxInclusive,
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
  const isReadOnly = salesState.mode === 'viewing';

  // Compute isCashBankParty dynamically so 'Manage Payments' in view mode also routes correctly.
  const currentCustomerParty = parties.find(p => p.id === salesState.form.customer_id);
  const currentPartyIsCashBank = currentCustomerParty?.group === 'Cash' || currentCustomerParty?.group === 'Bank Account';
  const shouldShowPartyBalance = currentCustomerParty?.name.trim().toLowerCase() !== 'cash';
  const isShowingSavedInvoiceContext = !!savedInvoiceId;
  const effectiveIsCashBankParty = isShowingSavedInvoiceContext ? savedIsCashBankParty : currentPartyIsCashBank;

  return (
    <div className="h-full flex flex-col bg-background">
      <VoucherPageHeader
        title="Sales Invoice"
        description="Create and manage sales invoices"
        mode={salesState.mode}
        voucherNo={salesState.currentVoucherNo}
        voucherDate={salesState.form.voucher_date}
        createdBy={salesState.created_by_name}
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
        customActionsPrefix={salesState.mode === 'new' ? (
          <div className="flex items-center gap-1 overflow-x-auto max-w-[40vw] pr-2 border-r mr-1">
            {(()=>{
              const allTabs = [
                ...(salesState.inactiveTabs || []).map(t => ({...t, isActive: false})),
                {
                  id: salesState.activeTabId || 'tab-1',
                  title: salesState.form?.customer_name || salesState.currentVoucherNo || "New Invoice",
                  isActive: true
                }
              ].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

              return allTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => !tab.isActive && dispatch(switchSalesTab(tab.id))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    tab.isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted-foreground/10 bg-transparent'
                  }`}
                >
                  <span className="truncate max-w-[120px]">{tab.title}</span>
                  <div
                    role="button"
                    tabIndex={0}
                    className={`p-0.5 rounded-full cursor-pointer transition-colors ${tab.isActive ? 'hover:bg-primary-foreground/20' : 'hover:bg-muted-foreground/20 text-muted-foreground/70 hover:text-foreground'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      dispatch(closeSalesTab(tab.id));
                    }}
                  >
                    <IconX size={12} stroke={2.5} />
                  </div>
                </button>
              ));
            })()}
            <button
              type="button"
              onClick={() => dispatch(createNewSalesTab())}
              className="p-1 px-2 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground rounded-md transition-colors flex-shrink-0 mx-1 border border-dashed border-muted-foreground/30"
              title="New Tab"
            >
              <IconPlus size={14} />
            </button>
          </div>
        ) : undefined}
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
            const idToPrint = savedInvoiceId || salesState.currentVoucherId;
            if (idToPrint) {
              setTimeout(() => printVoucher({ voucherId: idToPrint, voucherType: 'sales_invoice' }), 100);
            }
          }
        }}
        invoiceId={savedInvoiceId || salesState.currentVoucherId || undefined}
        invoiceNo={savedInvoiceNo || salesState.currentVoucherNo}
        invoiceAmount={savedInvoiceAmount || salesState.totals.grandTotal}
        invoiceDate={savedInvoiceDate || salesState.form.voucher_date}
        partyName={savedPartyName}
        readOnly={salesState.mode === 'viewing'}
        isCashBankParty={effectiveIsCashBankParty}
        onSuccess={() => {
          toast.success('Payment saved!');
        }}
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
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <form ref={formRef} onSubmit={handleSubmit} className="flex-1 min-h-0 p-5 max-w-7xl mx-auto flex flex-col gap-4">
          {/* Master Section */}
          <div className="bg-card border rounded-lg p-3 space-y-3 shrink-0">
            <div className="grid grid-cols-6 gap-3">
              {/* Customer */}
              <div ref={customerRef} className="col-span-2">
                <Label className="text-xs font-medium mb-1 block">Party *</Label>
                <Combobox
                  options={parties.map(p => ({
                    value: p.id,
                    label: p.name,
                    subLabel: p.address_line_1 || undefined,
                  }))}
                  value={salesState.form.customer_id}
                  onChange={(value) => {
                    const party = parties.find((p) => p.id === value);
                    if (party) {
                      dispatch(setSalesCustomer({ id: party.id, name: party.name, type: party.type }));
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

              {/* Sales Rep (Salesperson) */}
              <div>
                <Label className="text-xs font-medium mb-1 block">Sales Rep</Label>
                <Combobox
                  options={employees.map(e => ({
                    value: e.id,
                    label: e.name
                  }))}
                  value={salesState.form.salesperson_id || ''}
                  onChange={(value) => {
                    dispatch(setSalesSalespersonId(value as string || undefined));
                    dispatch(setSalesHasUnsavedChanges(true));
                  }}
                  placeholder="Select Sales Rep"
                  searchPlaceholder="Search employees..."
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
            ref={voucherItemsRef}
            items={salesState.items}
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
            defaultUnitKind="sale"
            gstSlabs={gstDisabled ? [] : gstSlabs}
            fullProducts={products as any}
            taxInclusive={isTaxInclusive}
            footerRightContent={
              partyBalance !== null && shouldShowPartyBalance ? (
                <div className={`text-xs font-mono font-bold ${partyBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Balance: ₹ {Math.abs(partyBalance).toLocaleString()} {partyBalance >= 0 ? 'Dr' : 'Cr'}
                </div>
              ) : null
            }
            footerLeftContent={
              !isReadOnly && gstSlabs.length > 0 ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      title="GST Settings"
                      className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors border ${
                        gstDisabled
                          ? 'bg-amber-100 border-amber-400 text-amber-700 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-400'
                          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <IconSettings2 size={14} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="w-56 p-3">
                    <p className="text-xs font-semibold mb-2 text-foreground">GST Options</p>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs text-muted-foreground cursor-pointer select-none" htmlFor="sales-gst-disable-switch">
                        Disable GST for this voucher
                      </label>
                      <Switch
                        id="sales-gst-disable-switch"
                        checked={gstDisabled}
                        onCheckedChange={setGstDisabled}
                      />
                    </div>
                    {gstDisabled && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        GST columns hidden. Invoice will be saved without tax.
                      </p>
                    )}
                  </PopoverContent>
                </Popover>
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
                <div className="flex gap-3 items-end">
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Discount %</Label>
                    <Input
                      type="number"
                      value={salesState.form.discount_rate}
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
                      value={salesState.form.discount_amount}
                      onChange={(e) => {
                        const amount = parseFloat(e.target.value) || 0;
                        updateTotalsWithItems(salesState.items, undefined, amount);
                        dispatch(setSalesHasUnsavedChanges(true));
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
                    <span className="font-mono font-medium">₹ {salesState.totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {salesState.totals.discount > 0 && (
                    <div className="text-xs font-mono text-muted-foreground">
                      Discount: ₹ {salesState.totals.discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                  {salesState.totals.tax > 0 && (
                    <div className="text-xs font-mono text-muted-foreground">Tax: ₹ {salesState.totals.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  )}
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
              <Button
                type="submit"
                disabled={salesState.loading}
                className="h-9"
                title="Save (Ctrl+S)"
                id="voucher-save-btn"
              >
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
