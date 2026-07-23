import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
  setDeliveryNoteCustomer,
  setDeliveryNoteVoucherDate,
  setDeliveryNoteReference,
  setDeliveryNoteNarration,
  setDeliveryNoteDiscountRate,
  setDeliveryNoteDiscountAmount,
  addDeliveryNoteItem,
  updateDeliveryNoteItem,
  removeDeliveryNoteItem,
  setDeliveryNoteTotals,
  resetDeliveryNoteForm,
  setDeliveryNoteLoading,
  setDeliveryNoteMode,
  setDeliveryNoteCurrentVoucherId,
  setDeliveryNoteCurrentVoucherNo,
  setDeliveryNoteNavigationData,
  setDeliveryNoteSalespersonId,
  setDeliveryNoteHasUnsavedChanges,
  setDeliveryNoteCreatedByName,
  createNewDeliveryNoteTab,
  switchDeliveryNoteTab,
  closeDeliveryNoteTab,
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
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';
import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { VoucherItemsSection, ColumnSettings, VoucherItemsSectionRef } from '@/components/voucher/VoucherItemsSection';

import { usePrint } from '@/hooks/usePrint';
import CustomerDialog from '@/components/dialogs/CustomerDialog';
import ProductDialog from '@/components/dialogs/ProductDialog';
import { Product, ProductGroup, ProductUnitConversion, Unit, Employee, GstTaxSlab, api } from '@/lib/tauri';
import { buildProductUnitMap, getDefaultProductUnitId, getProductUnitRate } from '@/lib/product-units';
import { calculateVoucherDiscounts } from '@/lib/voucher-discount';
import { ShipToPopover, ShipToAddress } from '@/components/voucher/ShipToPopover';
import { useCurrencyLabel, useMoney } from '@/hooks/useMoney';

interface Party {
  id: number;
  name: string;
  type: 'customer' | 'supplier';
  group: string;
  address_line_1?: string;
}

export default function DeliveryNotePage() {
  const dispatch = useDispatch<AppDispatch>();
  const noteState = useSelector((state: RootState) => state.deliveryNote);
  const activeSectionParams = useSelector((state: RootState) => state.app.activeSectionParams);
  const user = useSelector((state: RootState) => state.auth.user);
  const money = useMoney();
  const currencyLabel = useCurrencyLabel();
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
  const [voucherSettings, setVoucherSettings] = useState<{ columns: ColumnSettings[], autoPrint?: boolean, showPaymentModal?: boolean, skipToNextRowAfterQty?: boolean, skipToNextRowAfterProduct?: boolean, incrementQtyOnDuplicate?: boolean, taxInclusive?: boolean, showProductInfoOnHover?: boolean, showShipTo?: boolean } | undefined>(undefined);
  const [isTaxInclusive, setIsTaxInclusive] = useState(false);
  const [partyBalance, setPartyBalance] = useState<number | null>(null);
  const [gstSlabs, setGstSlabs] = useState<GstTaxSlab[]>([]);
  const gstDisabled = true; const setGstDisabled = () => {};
  const [services, setServices] = useState<any[]>([]);
  const [masterProductsEnabled, setMasterProductsEnabled] = useState(false);

  const productUnitsByProduct = useMemo(
    () => buildProductUnitMap(productUnitConversions),
    [productUnitConversions]
  );

  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');

  // Ship To State
  const [shipToMap, setShipToMap] = useState<Record<string, ShipToAddress | undefined>>({});
  const activeShipTo = shipToMap[noteState.activeTabId];
  const setActiveShipTo = (shipTo: ShipToAddress | undefined) => {
    setShipToMap(prev => ({ ...prev, [noteState.activeTabId]: shipTo }));
    dispatch(setDeliveryNoteHasUnsavedChanges(true));
  };

  const formRef = useRef<HTMLFormElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  const voucherItemsRef = useRef<VoucherItemsSectionRef>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsData, unitsData, productUnitConversionsData, accountsData, settingsData, groupsData, employeesData, gstSettings, slabsData, servicesData, masterSettingVal] = await Promise.all([
          invoke<Product[]>('get_products'),
          invoke<Unit[]>('get_units'),
          invoke<ProductUnitConversion[]>('get_all_product_unit_conversions'),
          invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable', 'Accounts Payable', 'Cash', 'Bank Account'] }),
          invoke<any>('get_voucher_settings', { voucherType: 'delivery_note' }),
          invoke<ProductGroup[]>('get_product_groups'),
          invoke<Employee[]>('get_employees'),
          api.gst.getSettings().catch(() => null),
          api.gst.getSlabs().catch(() => [] as GstTaxSlab[]),
          invoke<any[]>('get_services').catch(() => []),
          invoke<string | null>('get_app_setting', { key: 'enable_master_products' }).catch(() => null),
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
        setServices(servicesData);
        setMasterProductsEnabled(masterSettingVal === 'true');
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
    if (noteState.mode === 'new' && !noteState.currentVoucherId) {
      setIsTaxInclusive(!!voucherSettings?.taxInclusive);
    }
  }, [noteState.mode, noteState.currentVoucherId, voucherSettings?.taxInclusive]);

  // Default Party Selection Effect
  useEffect(() => {
    if (noteState.mode === 'new' && noteState.form.customer_id === 0 && parties.length > 0) {
      const cashSaleAccount = parties.find(p => p.name === 'Cash');
      const defaultParty = cashSaleAccount || parties[0];
      if (defaultParty) {
        dispatch(setDeliveryNoteCustomer({ id: defaultParty.id, name: defaultParty.name, type: defaultParty.type }));
        invoke<number>('get_account_balance', { accountId: defaultParty.id })
          .then(bal => setPartyBalance(bal))
          .catch(console.error);
      }
    }
  }, [noteState.mode, noteState.form.customer_id, parties, dispatch]);

  // Auto-add first line if empty and in new mode
  useEffect(() => {
    if (noteState.mode === 'new' && noteState.items.length === 0 && products.length > 0) {
      handleAddItem();
    }
  }, [noteState.mode, products.length, noteState.items.length]);

  const handleAddItem = (insertAt?: number) => {
    const getDesc = (id: string) => {
      const col = voucherSettings?.columns.find(c => c.id === id);
      if (col && col.defaultValue !== undefined && col.defaultValue !== "") {
        return col.defaultValue;
      }
      if (id === 'count') return 1;
      if (id === 'deduction') return 1.0;
      return 0;
    };

    const parseNum = (val: string | number) => typeof val === 'string' ? parseFloat(val) || 0 : val;

    dispatch(
      addDeliveryNoteItem({
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
  };

  const handleRemoveItem = (index: number) => {
    if (noteState.items.length === 1) {
      toast.error('At least one item is required');
      return;
    }
    const updatedItems = noteState.items.filter((_, i) => i !== index);
    dispatch(removeDeliveryNoteItem(index));
    updateTotalsWithItems(updatedItems);
    dispatch(setDeliveryNoteHasUnsavedChanges(true));
  };

  const handleUpdateItem = (index: number, field: string, value: any, options?: { initialQuantity?: number }) => {
    let finalValue = value;

    if (field === 'product_id') {
      const product = products.find((p) => String(p.id) === String(value));
      if (product) {
        const productId = String(product.id);
        const productConversions = productUnitsByProduct[productId];
        const defaultUnitId = getDefaultProductUnitId(productConversions, 'sale', product.unit_id);
        const rate = getProductUnitRate(productConversions, defaultUnitId, 'sale', product.sales_rate || 0);
        finalValue = value;
        const updatedItems = [...noteState.items];
        updatedItems[index] = {
          ...updatedItems[index],
          item_type: 'product',
          product_id: value,
          service_id: null,
          product_name: product.name,
          unit_id: defaultUnitId,
          rate,
          ...(options?.initialQuantity !== undefined ? { initial_quantity: options.initialQuantity } : {}),
        };
        dispatch(updateDeliveryNoteItem({ index, data: { item_type: 'product', product_id: value, service_id: null, product_name: product.name, unit_id: defaultUnitId, rate, ...(options?.initialQuantity !== undefined ? { initial_quantity: options.initialQuantity } : {}) } }));
        updateTotalsWithItems(updatedItems);
        dispatch(setDeliveryNoteHasUnsavedChanges(true));
        return;
      }
    }

    if (field === 'service_id') {
      const service = services.find((s) => String(s.id) === String(value));
      if (service) {
        finalValue = value;
        const updatedItems = [...noteState.items];
        updatedItems[index] = { ...updatedItems[index], item_type: 'service', service_id: value, product_id: 0, product_name: service.name, unit_id: service.unit_id || null, rate: 0 };
        dispatch(updateDeliveryNoteItem({ index, data: { item_type: 'service', service_id: value, product_id: 0, product_name: service.name, unit_id: service.unit_id || null, rate: 0 } }));
        updateTotalsWithItems(updatedItems);
        dispatch(setDeliveryNoteHasUnsavedChanges(true));
        return;
      }
    }

    if (field === 'unit_id') {
      const currentItem = noteState.items[index];
      const productId = String(currentItem.product_id);
      const product = products.find((p) => String(p.id) === productId);
      const rate = getProductUnitRate(productUnitsByProduct[productId], value, 'sale', product?.sales_rate || currentItem.rate || 0);
      finalValue = value;
      const updatedItems = [...noteState.items];
      updatedItems[index] = { ...updatedItems[index], unit_id: value, rate };
      dispatch(updateDeliveryNoteItem({ index, data: { unit_id: value, rate } }));
      updateTotalsWithItems(updatedItems);
      dispatch(setDeliveryNoteHasUnsavedChanges(true));
      return;
    }

    const updatedItems = [...noteState.items];
    let item = { ...updatedItems[index], [field]: finalValue };

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
    dispatch(updateDeliveryNoteItem({ index, data: item }));
    updateTotalsWithItems(updatedItems);
    dispatch(setDeliveryNoteHasUnsavedChanges(true));
  };

  const updateTotalsWithItems = (items: typeof noteState.items, discountRate?: number, discountAmount?: number) => {
    const productMap: Record<string, Product> = {};
    products.forEach(p => { productMap[String(p.id)] = p; });
    const slabMap: Record<string, GstTaxSlab> = {};
    gstSlabs.forEach(s => { slabMap[s.id] = s; });

    const resolveItemGstRate = (item: typeof noteState.items[number]) => {
      if (gstDisabled) return 0;
      if (typeof item.resolved_gst_rate === 'number' && item.resolved_gst_rate > 0) return item.resolved_gst_rate;
      if (item.gst_slab_id) {
        const savedSlab = slabMap[item.gst_slab_id];
        if (savedSlab) return savedSlab.is_dynamic === 1 ? (item.rate <= savedSlab.threshold ? savedSlab.below_rate : savedSlab.above_rate) : savedSlab.fixed_rate;
      }
      const product = productMap[String(item.product_id)];
      if (product?.gst_slab_id) {
        const slab = slabMap[product.gst_slab_id];
        if (slab) return slab.is_dynamic === 1 ? (item.rate <= slab.threshold ? slab.below_rate : slab.above_rate) : slab.fixed_rate;
      }
      return item.tax_rate || 0;
    };

    const calculation = calculateVoucherDiscounts(items, {
      discountRate: discountRate !== undefined ? discountRate : noteState.form.discount_rate,
      discountAmount:
        discountRate !== undefined ? undefined
          : discountAmount !== undefined ? discountAmount
          : noteState.form.discount_amount,
      taxInclusive: isTaxInclusive,
      resolveGstRate: resolveItemGstRate,
    });

    dispatch(setDeliveryNoteDiscountRate(calculation.discountRate));
    dispatch(setDeliveryNoteDiscountAmount(calculation.discountAmount));
    dispatch(setDeliveryNoteTotals({
      subtotal: calculation.subtotal,
      discount: calculation.discountAmount,
      tax: calculation.tax,
      grandTotal: calculation.grandTotal,
    }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (noteState.items.length === 0) { toast.error('Add at least one item'); return; }

    const hasInvalidItems = noteState.items.some(item => {
      const isService = item.item_type === 'service';
      const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
      if (isService) return !item.service_id || finalQty <= 0 || item.rate <= 0;
      return !item.product_id || finalQty <= 0 || item.rate <= 0;
    });

    if (hasInvalidItems) {
      toast.error('All items must have a product/service selected, a positive final quantity, and a non-zero rate');
      return;
    }

    if (!noteState.form.customer_id) { toast.error('Select a party'); return; }

    const notePayload = {
      customer_id: noteState.form.customer_id,
      salesperson_id: noteState.form.salesperson_id || null,
      party_type: noteState.form.party_type,
      voucher_date: noteState.form.voucher_date,
      reference: noteState.form.reference || null,
      narration: noteState.form.narration || null,
      discount_rate: noteState.form.discount_rate || null,
      discount_amount: noteState.form.discount_amount || null,
      items: noteState.items.map(item => ({
        item_type: item.item_type || 'product',
        product_id: item.item_type === 'service' ? null : (item.product_id || null),
        service_id: item.item_type === 'service' ? (item.service_id || null) : null,
        unit_id: item.unit_id || null,
        description: item.description,
        initial_quantity: item.initial_quantity,
        count: item.count,
        deduction_per_unit: item.deduction_per_unit,
        rate: item.rate,
        tax_rate: item.tax_rate,
        discount_percent: item.discount_percent || null,
        discount_amount: item.discount_amount || null,
      })),
      tax_inclusive: isTaxInclusive,
      gst_disabled: gstDisabled,
      ship_to: activeShipTo,
    };

    try {
      dispatch(setDeliveryNoteLoading(true));
      if (noteState.mode === 'editing' && noteState.currentVoucherId) {
        await invoke('update_delivery_note', { id: noteState.currentVoucherId, note: notePayload });
        toast.success('Delivery note updated successfully');
        if (voucherSettings?.autoPrint) {
          setTimeout(() => printVoucher({ voucherId: noteState.currentVoucherId!, voucherType: 'delivery_note', filename: noteState.currentVoucherNo }), 100);
        }
      } else {
        const newNoteId = await invoke<string>('create_delivery_note', { note: { ...notePayload, user_id: user?.id.toString() } });
        toast.success('Delivery note created successfully');
        if (voucherSettings?.autoPrint) {
          const newNote = await invoke<any>('get_delivery_note', { id: newNoteId });
          setTimeout(() => printVoucher({ voucherId: newNoteId, voucherType: 'delivery_note', filename: newNote.voucher_no }), 100);
        }
      }

      dispatch(setDeliveryNoteHasUnsavedChanges(false));
      handleNewNote(true);
    } catch (error: any) {
      toast.error(`Failed to save delivery note: ${error?.message || error}`);
      console.error(error);
    } finally {
      dispatch(setDeliveryNoteLoading(false));
    }
  };

  const loadVoucher = async (id: string) => {
    try {
      dispatch(setDeliveryNoteLoading(true));
      dispatch(setDeliveryNoteHasUnsavedChanges(false));
      dispatch(resetDeliveryNoteForm());

      const note = await invoke<any>('get_delivery_note', { id });
      const items = await invoke<any[]>('get_delivery_note_items', { voucherId: id });

      dispatch(setDeliveryNoteCurrentVoucherNo(note.voucher_no));
      dispatch(setDeliveryNoteCustomer({ id: note.customer_id, name: note.customer_name, type: 'customer' }));
      invoke<number>('get_account_balance', { accountId: note.customer_id })
        .then(bal => setPartyBalance(bal)).catch(console.error);
      dispatch(setDeliveryNoteVoucherDate(note.voucher_date));
      dispatch(setDeliveryNoteSalespersonId(note.salesperson_id || undefined));
      dispatch(setDeliveryNoteReference(note.reference || ''));
      dispatch(setDeliveryNoteNarration(note.narration || ''));
      dispatch(setDeliveryNoteDiscountRate(note.discount_rate || 0));
      dispatch(setDeliveryNoteDiscountAmount(note.discount_amount || 0));
      const loadedTaxInclusive = Boolean(note.tax_inclusive);
      setIsTaxInclusive(loadedTaxInclusive);
      dispatch(setDeliveryNoteCreatedByName(note.created_by_name));

      if (note.metadata) {
        try {
          const meta = JSON.parse(note.metadata);
          if (meta.ship_to) {
            setShipToMap(prev => ({ ...prev, [id]: meta.ship_to }));
          } else {
            setShipToMap(prev => ({ ...prev, [id]: undefined }));
          }
        } catch (e) {
          console.error("Failed to parse metadata", e);
          setShipToMap(prev => ({ ...prev, [id]: undefined }));
        }
      } else {
        setShipToMap(prev => ({ ...prev, [id]: undefined }));
      }

      items.forEach(item => {
        const storedGstRate = item.resolved_gst_rate || item.tax_rate || 0;
        const displayRate = loadedTaxInclusive ? item.rate * (1 + (storedGstRate / 100)) : item.rate;
        dispatch(addDeliveryNoteItem({
          product_id: item.product_id || 0,
          product_code: item.product_code,
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

      const loadedItems = items.map(item => ({
        id: `loaded-${item.id}`,
        product_id: item.product_id || 0,
        product_code: item.product_code,
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
        rate: loadedTaxInclusive ? item.rate * (1 + (((item.resolved_gst_rate || item.tax_rate) || 0) / 100)) : item.rate,
        tax_rate: item.tax_rate,
        discount_percent: item.discount_percent || 0,
        discount_amount: item.discount_amount || 0,
      }));

      updateTotalsWithItems(loadedItems, note.discount_amount ? undefined : note.discount_rate, note.discount_amount || undefined);

      dispatch(setDeliveryNoteMode('viewing'));
      dispatch(setDeliveryNoteHasUnsavedChanges(false));
    } catch (error) {
      console.error('Failed to load delivery note', error);
      toast.error('Failed to load delivery note');
    } finally {
      dispatch(setDeliveryNoteLoading(false));
    }
  };

  useEffect(() => {
    if (activeSectionParams?.refreshInvoiceId) {
      loadVoucher(String(activeSectionParams.refreshInvoiceId));
    }
  }, [activeSectionParams?.refreshInvoiceId, activeSectionParams?.refreshKey]);

  const {
    handleNavigatePrevious,
    handleNavigateNext,
    handleListSelect,
    handleNew,
    handleEdit,
    handleCancel,
    handleDelete,
    nextVoucherNo,
    hasLastVoucher,
    handleNavigateToLast,
  } = useVoucherNavigation({
    voucherType: 'delivery_note',
    sliceState: noteState,
    actions: {
      setMode: setDeliveryNoteMode,
      setCurrentVoucherId: setDeliveryNoteCurrentVoucherId,
      setCurrentVoucherNo: setDeliveryNoteCurrentVoucherNo,
      setNavigationData: setDeliveryNoteNavigationData,
      setHasUnsavedChanges: setDeliveryNoteHasUnsavedChanges,
      resetForm: resetDeliveryNoteForm,
    },
    onLoadVoucher: loadVoucher,
  });

  const handleNewNote = (skipConfirm?: boolean) => handleNew(skipConfirm);

  const handleDeleteVoucher = async () => {
    const confirmed = await handleDelete();
    if (confirmed && noteState.currentVoucherId) {
      try {
        dispatch(setDeliveryNoteLoading(true));
        await invoke('delete_delivery_note', { id: noteState.currentVoucherId });
        toast.success('Delivery note and associated stock movements deleted');
        handleNewNote();
      } catch (e) {
        toast.error('Failed to delete delivery note');
        console.error(e);
      } finally {
        dispatch(setDeliveryNoteLoading(false));
      }
    }
  };

  const handlePrint = () => {
    if (noteState.mode === 'new' || !noteState.currentVoucherId) {
      toast.error('Please save before printing');
      return;
    }
    printVoucher({ voucherId: noteState.currentVoucherId, voucherType: 'delivery_note', filename: noteState.currentVoucherNo });
  };

  const handleSend = async () => {
    if (!noteState.currentVoucherId) { toast.error('Save before sending'); return; }
    try {
      const phone = await invoke<string | null>('get_party_phone_for_voucher', { voucherId: noteState.currentVoucherId });
      let normPhone = '';
      if (phone && phone.trim() !== '') {
        const digits = phone.replace(/\D/g, '');
        normPhone = digits.length === 10 ? `91${digits}` : digits;
      }
      const customerName = parties.find(p => p.id === noteState.form.customer_id)?.name || '';
      const noteNo = noteState.currentVoucherNo || '';
      const amount = noteState.totals.grandTotal;
      const dateStr = noteState.form.voucher_date
        ? new Date(noteState.form.voucher_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
      const lines: string[] = [];
      if (customerName && customerName.toLowerCase() !== 'cash') { lines.push(`Dear ${customerName},`); lines.push(''); }
      lines.push(`Delivery Note *${noteNo}*${dateStr ? ` dated ${dateStr}` : ''} for *\u20B9${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}* is ready.`);
      lines.push(''); lines.push('Thank you for your business!');
      const message = lines.join('\n');
      try {
        const html = await invoke<string>('render_invoice', { voucherId: noteState.currentVoucherId, voucherType: 'delivery_note', templateId: null });
        const savedPath = await invoke<string>('save_invoice_pdf', { html, fileName: noteNo || noteState.currentVoucherId });
        await invoke('open_whatsapp_url', { phone: normPhone, message });
        toast.success(`WhatsApp opened! PDF saved to:\n${savedPath}\nAttach it in the chat.`, { duration: 6000 });
      } catch {
        await invoke('open_whatsapp_url', { phone: normPhone, message });
        toast.success('Opening WhatsApp…');
      }
    } catch (err) {
      console.error(err); toast.error('Failed to open WhatsApp');
    }
  };

  // Global keyboard shortcuts
  useVoucherShortcuts({
    onSave: () => formRef.current?.requestSubmit(),
    onNewItem: handleAddItem,
    onClear: handleNew,
    onToggleShortcuts: () => setShowShortcuts(prev => !prev),
    onCloseShortcuts: () => setShowShortcuts(false),
    onNewTab: () => dispatch(createNewDeliveryNoteTab()),
    onCloseTab: () => dispatch(closeDeliveryNoteTab(noteState.activeTabId)),
    onNextTab: () => {
      const allTabs = [
        ...(noteState.inactiveTabs || []).map(t => ({ ...t, isActive: false })),
        { id: noteState.activeTabId || 'tab-1', isActive: true },
      ].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      const activeIndex = allTabs.findIndex(t => t.isActive);
      if (activeIndex !== -1 && activeIndex < allTabs.length - 1) dispatch(switchDeliveryNoteTab(allTabs[activeIndex + 1].id));
      else if (allTabs.length > 1) dispatch(switchDeliveryNoteTab(allTabs[0].id));
    },
    onPrevTab: () => {
      const allTabs = [
        ...(noteState.inactiveTabs || []).map(t => ({ ...t, isActive: false })),
        { id: noteState.activeTabId || 'tab-1', isActive: true },
      ].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      const activeIndex = allTabs.findIndex(t => t.isActive);
      if (activeIndex > 0) dispatch(switchDeliveryNoteTab(allTabs[activeIndex - 1].id));
      else if (allTabs.length > 1) dispatch(switchDeliveryNoteTab(allTabs[allTabs.length - 1].id));
    },
    showShortcuts,
  });

  // Alt+C shortcut for creating customer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyC') {
        e.preventDefault();
        setNewCustomerName('');
        setShowCreateCustomer(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  const handleCreateCustomerSave = async (newCustomer?: any) => {
    try {
      const accountsData = await invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable', 'Accounts Payable', 'Cash', 'Bank Account'] });
      const combinedParties = accountsData.map(acc => ({
        id: acc.id, name: acc.account_name,
        type: acc.account_group === 'Accounts Receivable' ? 'customer' as const : 'supplier' as const,
        group: acc.account_group as string, address_line_1: acc.address_line_1 as string | undefined,
      }));
      setParties(combinedParties);
      if (newCustomer) {
        const createdParty = combinedParties.find(p => p.name === newCustomer.name);
        if (createdParty) { dispatch(setDeliveryNoteCustomer({ id: createdParty.id, name: createdParty.name, type: 'customer' })); setPartyBalance(0); }
      }
    } catch (e) { console.error('Failed to refresh parties', e); }
    setShowCreateCustomer(false);
  };

  const handleProductCreate = (name: string, rowIndex: number) => {
    setNewProductName(name); setCreatingProductRowIndex(rowIndex); setShowCreateProduct(true);
  };

  const handleCreateProductSave = async () => {
    try {
      const [productsData, productUnitConversionsData] = await Promise.all([
        invoke<Product[]>('get_products'),
        invoke<ProductUnitConversion[]>('get_all_product_unit_conversions'),
      ]);
      setProducts(productsData); setProductUnitConversions(productUnitConversionsData);
      if (creatingProductRowIndex !== null && newProductName) {
        const createdProduct = productsData.find(p => p.name.toLowerCase() === newProductName.toLowerCase());
        if (createdProduct) handleUpdateItem(creatingProductRowIndex, 'product_id', createdProduct.id);
      }
    } catch (e) { console.error('Failed to refresh products', e); }
    setShowCreateProduct(false); setCreatingProductRowIndex(null);
  };

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const getItemAmount = (item: typeof noteState.items[0]) => {
    let gstRate = item.tax_rate || 0;
    if (typeof item.resolved_gst_rate === 'number' && item.resolved_gst_rate > 0) {
      gstRate = item.resolved_gst_rate;
    } else if (item.gst_slab_id) {
      const savedSlab = gstSlabs.find(s => s.id === item.gst_slab_id);
      if (savedSlab) gstRate = savedSlab.is_dynamic === 1 ? (item.rate <= savedSlab.threshold ? savedSlab.below_rate : savedSlab.above_rate) : savedSlab.fixed_rate;
    } else {
      const product = products.find(p => String(p.id) === String(item.product_id));
      if (product?.gst_slab_id) {
        const slab = gstSlabs.find(s => s.id === product.gst_slab_id);
        if (slab) gstRate = slab.is_dynamic === 1 ? (item.rate <= slab.threshold ? slab.below_rate : slab.above_rate) : slab.fixed_rate;
      }
    }
    const sourceItems = noteState.items.some((candidate) => candidate.id === item.id) ? noteState.items : [item];
    const calculation = calculateVoucherDiscounts(sourceItems, {
      discountRate: noteState.form.discount_rate,
      discountAmount: noteState.form.discount_amount,
      taxInclusive: isTaxInclusive,
      resolveGstRate: () => gstRate,
    });
    const lineIndex = sourceItems.length === 1 ? 0 : sourceItems.findIndex((candidate) => candidate.id === item.id);
    const line = calculation.lines[Math.max(lineIndex, 0)];
    const grossTax = Math.round(line.netBeforeInvoiceDiscount * (gstRate / 100) * 100) / 100;
    return { finalQty: line.finalQty, amount: line.netBeforeInvoiceDiscount, taxAmount: grossTax, total: Math.round((line.netBeforeInvoiceDiscount + grossTax) * 100) / 100 };
  };

  const isReadOnly = noteState.mode === 'viewing';
  const currentCustomerParty = parties.find(p => p.id === noteState.form.customer_id);
  const shouldShowPartyBalance = currentCustomerParty?.name.trim().toLowerCase() !== 'cash';

  return (
    <div className="h-full flex flex-col bg-background">
      <VoucherPageHeader
        title="Delivery Note"
        description="Create and manage delivery notes"
        mode={noteState.mode}
        voucherNo={noteState.currentVoucherNo}
        voucherDate={noteState.form.voucher_date}
        createdBy={noteState.created_by_name}
        isUnsaved={noteState.hasUnsavedChanges}
        nextVoucherNo={nextVoucherNo}
        hasPrevious={noteState.mode === 'new' ? hasLastVoucher : noteState.navigationData.hasPrevious}
        onNavigateToLast={handleNavigateToLast}
        hasNext={noteState.navigationData.hasNext}
        onToggleShortcuts={() => setShowShortcuts(!showShortcuts)}
        onNavigatePrevious={handleNavigatePrevious}
        onNavigateNext={handleNavigateNext}
        onEdit={handleEdit}
        onSave={() => formRef.current?.requestSubmit()}
        onCancel={handleCancel}
        onDelete={handleDeleteVoucher}
        onPrint={handlePrint}
        onSend={noteState.mode === 'viewing' ? handleSend : undefined}
        onNew={handleNewNote}
        onListView={() => setShowListView(true)}
        loading={noteState.loading}
        customActionsPrefix={
          <>
            {noteState.mode === 'new' && (
              <div className="flex items-center gap-1 overflow-x-auto max-w-[40vw] pr-2 border-r mr-1">
                {(() => {
                  const allTabs = [
                    ...(noteState.inactiveTabs || []).map(t => ({ ...t, isActive: false })),
                    { id: noteState.activeTabId || 'tab-1', title: noteState.form?.customer_name || noteState.currentVoucherNo || 'New Note', isActive: true },
                  ].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

                  return allTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => !tab.isActive && dispatch(switchDeliveryNoteTab(tab.id))}
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
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); dispatch(closeDeliveryNoteTab(tab.id)); }}
                      >
                        <IconX size={12} stroke={2.5} />
                      </div>
                    </button>
                  ));
                })()}
                <button
                  type="button"
                  onClick={() => dispatch(createNewDeliveryNoteTab())}
                  className="p-1 px-2 text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground rounded-md transition-colors flex-shrink-0 mx-1 border border-dashed border-muted-foreground/30"
                  title="New Tab"
                >
                  <IconPlus size={14} />
                </button>
              </div>
            )}
          </>
        }
      />

      <VoucherShortcutPanel show={showShortcuts} />

      <VoucherListViewSheet
        open={showListView}
        onOpenChange={setShowListView}
        voucherType="delivery_note"
        onSelectVoucher={handleListSelect}
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
        product={undefined}
      />

      {/* Form Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <form ref={formRef} onSubmit={handleSubmit} className="flex-1 min-h-0 p-5 max-w-7xl mx-auto flex flex-col gap-4">
          {/* Master Section */}
          <div className="bg-card border rounded-lg p-3 space-y-3 shrink-0">
            <div className="grid grid-cols-6 gap-3">
              {/* Customer */}
              <div ref={customerRef} className="col-span-2 flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs font-medium mb-1 block">Party *</Label>
                  <Combobox
                    options={parties.map(p => ({ value: p.id, label: p.name, subLabel: p.address_line_1 || undefined }))}
                    value={noteState.form.customer_id}
                    onChange={(value) => {
                      const party = parties.find((p) => p.id === value);
                      if (party) {
                        dispatch(setDeliveryNoteCustomer({ id: party.id, name: party.name, type: party.type }));
                        invoke<number>('get_account_balance', { accountId: party.id }).then(bal => setPartyBalance(bal)).catch(console.error);
                        setTimeout(() => { voucherItemsRef.current?.focusFirstProduct(); }, 100);
                      }
                    }}
                    placeholder="Select party"
                    searchPlaceholder="Search parties..."
                    disabled={isReadOnly}
                    onActionClick={() => { setNewCustomerName(''); setShowCreateCustomer(true); }}
                    onCreate={(name) => { setNewCustomerName(name); setShowCreateCustomer(true); }}
                  />
                </div>
                {voucherSettings?.showShipTo && (
                  <ShipToPopover
                    shipTo={activeShipTo}
                    onChange={setActiveShipTo}
                    defaultAddress={noteState.form.customer_id ? {
                      name: noteState.form.customer_name,
                      address_line_1: parties.find(p => p.id === noteState.form.customer_id)?.address_line_1
                    } : undefined}
                    disabled={isReadOnly || !noteState.form.customer_id}
                  />
                )}
              </div>

              {/* Date */}
              <div>
                <Label className="text-xs font-medium mb-1 block">Delivery Date *</Label>
                <Input
                  type="date"
                  value={noteState.form.voucher_date}
                  onChange={(e) => { dispatch(setDeliveryNoteVoucherDate(e.target.value)); dispatch(setDeliveryNoteHasUnsavedChanges(true)); }}
                  className="h-8 text-sm"
                  disabled={isReadOnly}
                />
              </div>

              {/* Sales Rep */}
              <div>
                <Label className="text-xs font-medium mb-1 block">Sales Rep</Label>
                <Combobox
                  options={employees.map(e => ({ value: e.id, label: e.name }))}
                  value={noteState.form.salesperson_id || ''}
                  onChange={(value) => { dispatch(setDeliveryNoteSalespersonId(value as string || undefined)); dispatch(setDeliveryNoteHasUnsavedChanges(true)); }}
                  placeholder="Select Sales Rep"
                  searchPlaceholder="Search employees..."
                  disabled={isReadOnly}
                />
              </div>

              {/* Reference */}
              <div className="col-span-2">
                <Label className="text-xs font-medium mb-1 block">Reference No</Label>
                <Input
                  value={noteState.form.reference}
                  onChange={(e) => { dispatch(setDeliveryNoteReference(e.target.value)); dispatch(setDeliveryNoteHasUnsavedChanges(true)); }}
                  placeholder="Sales order or reference no"
                  className="h-8 text-sm"
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>

          {/* Items Section */}
          <VoucherItemsSection
            ref={voucherItemsRef}
            items={noteState.items}
            products={masterProductsEnabled ? products.filter(p => (p as any).is_master !== 1) : products}
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
            services={services}
            onServiceCreate={(_name, _idx) => { }}
            onSectionExit={() => { setTimeout(() => { document.getElementById('dn-discount-amount')?.focus(); }, 50); }}
            defaultUnitKind="sale"
            gstSlabs={gstDisabled ? [] : gstSlabs}
            fullProducts={products as any}
            taxInclusive={isTaxInclusive}
            footerRightContent={
              partyBalance !== null && shouldShowPartyBalance ? (
                <div className={`text-base font-mono font-bold ${partyBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Balance: {money(Math.abs(partyBalance), { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {partyBalance >= 0 ? 'Dr' : 'Cr'}
                </div>
              ) : null
            }
            footerLeftContent={
              <div className="flex items-center gap-1">
                {!isReadOnly && gstSlabs.length > 0 ? (
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
                        <label className="text-xs text-muted-foreground cursor-pointer select-none" htmlFor="dn-gst-disable-switch">
                          Disable GST for this voucher
                        </label>
                        <Switch id="dn-gst-disable-switch" checked={gstDisabled} onCheckedChange={setGstDisabled} />
                      </div>
                      {gstDisabled && (<p className="text-xs text-amber-600 dark:text-amber-400 mt-2">GST columns hidden. Note will be saved without tax.</p>)}
                    </PopoverContent>
                  </Popover>
                ) : null}
              </div>
            }
          />

          {/* Totals and Notes */}
          <div className="grid grid-cols-3 gap-4 shrink-0">
            {/* Notes */}
            <div className="col-span-1 bg-card border rounded-lg p-2.5">
              <Label className="text-xs font-medium mb-1 block">Notes / Narration</Label>
              <Textarea
                value={noteState.form.narration}
                onChange={(e) => { dispatch(setDeliveryNoteNarration(e.target.value)); dispatch(setDeliveryNoteHasUnsavedChanges(true)); }}
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
                      value={noteState.form.discount_rate || ''}
                      onChange={(e) => { const rate = parseFloat(e.target.value) || 0; dispatch(setDeliveryNoteHasUnsavedChanges(true)); updateTotalsWithItems(noteState.items, rate, undefined); }}
                      placeholder="0.00"
                      className="h-7 w-24 font-mono text-xs"
                      step="0.01"
                      disabled={isReadOnly}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium mb-1 block">Discount{currencyLabel ? ` (${currencyLabel})` : ''}</Label>
                    <Input
                      type="number"
                      value={noteState.form.discount_amount || ''}
                      onChange={(e) => { const amount = parseFloat(e.target.value) || 0; updateTotalsWithItems(noteState.items, undefined, amount); dispatch(setDeliveryNoteHasUnsavedChanges(true)); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('dn-save-btn')?.focus(); } }}
                      placeholder="0.00"
                      className="h-7 w-28 font-mono text-xs"
                      step="0.01"
                      disabled={isReadOnly}
                      id="dn-discount-amount"
                    />
                  </div>
                </div>
                <div className="text-right space-y-0.5">
                  <div className="flex justify-between items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-mono font-medium">{money(noteState.totals.subtotal)}</span>
                  </div>
                  {noteState.totals.discount > 0 && (
                    <div className="text-xs font-mono text-muted-foreground">
                      Discount: {money(noteState.totals.discount)}
                    </div>
                  )}
                  {noteState.totals.tax > 0 && (
                    <div className="text-xs font-mono text-muted-foreground">Tax: {money(noteState.totals.tax)}</div>
                  )}
                  <div className="text-lg font-mono font-bold">{money(noteState.totals.grandTotal)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Actions */}
          {!isReadOnly && (
            <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
              <Button type="button" variant="outline" onClick={handleCancel} className="h-9" title="Cancel">
                <IconX size={16} />
                Cancel
              </Button>
              <Button type="submit" disabled={noteState.loading} className="h-9" title="Save (Ctrl+S)" id="dn-save-btn">
                <IconCheck size={16} />
                {noteState.loading ? 'Saving...' : (noteState.mode === 'editing' ? 'Update Note' : 'Save Delivery Note')}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
