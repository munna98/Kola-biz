import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    setPurchaseReturnSupplier,
    setPurchaseReturnVoucherDate,
    setPurchaseReturnReference,
    setPurchaseReturnNarration,
    setPurchaseReturnDiscountRate,
    setPurchaseReturnDiscountAmount,
    addPurchaseReturnItem,
    updatePurchaseReturnItem,
    removePurchaseReturnItem,
    setPurchaseReturnTotals,
    resetPurchaseReturnForm,
    setPurchaseReturnLoading,
    setPurchaseReturnMode,
    setPurchaseReturnCurrentVoucherId,
    setPurchaseReturnCurrentVoucherNo,
    setPurchaseReturnHasUnsavedChanges,
    setPurchaseReturnNavigationData,
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
    IconSettings2,
} from '@tabler/icons-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';


// Global Voucher Components & Hooks
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
import { usePrint } from '@/hooks/usePrint';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';

import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { VoucherItemsSection, ColumnSettings } from '@/components/voucher/VoucherItemsSection';
import { Product, ProductUnitConversion, Unit, GstTaxSlab, api } from '@/lib/tauri';
import { buildProductUnitMap, getDefaultProductUnitId, getProductUnitRate } from '@/lib/product-units';
import { calculateVoucherDiscounts } from '@/lib/voucher-discount';

interface Party {
    id: number;
    name: string;
    type: 'customer' | 'supplier';
}

export default function PurchaseReturnPage() {
    const dispatch = useDispatch<AppDispatch>();
    const purchaseReturnState = useSelector((state: RootState) => state.purchaseReturn);
    const [products, setProducts] = useState<Product[]>([]);
    const [productUnitConversions, setProductUnitConversions] = useState<ProductUnitConversion[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [gstSlabs, setGstSlabs] = useState<GstTaxSlab[]>([]);
    const [gstDisabled, setGstDisabled] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showListView, setShowListView] = useState(false);
    const [voucherSettings, setVoucherSettings] = useState<{ columns: ColumnSettings[], autoPrint?: boolean, skipToNextRowAfterQty?: boolean, taxInclusive?: boolean } | undefined>(undefined);
    const { print } = usePrint();
    const productUnitsByProduct = useMemo(
        () => buildProductUnitMap(productUnitConversions),
        [productUnitConversions]
    );

    // Refs for focus management
    const formRef = useRef<HTMLFormElement>(null);
    const supplierRef = useRef<HTMLDivElement>(null);

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            try {
                const [productsData, unitsData, productUnitConversionsData, accountsData, settingsData, gstSettings, slabsData] = await Promise.all([
                    invoke<Product[]>('get_products'),
                    invoke<Unit[]>('get_units'),
                    invoke<ProductUnitConversion[]>('get_all_product_unit_conversions'),
                    invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Payable', 'Accounts Receivable', 'Cash', 'Bank Account'] }),
                    invoke<any>('get_voucher_settings', { voucherType: 'purchase_return' }),
                    api.gst.getSettings().catch(() => null),
                    api.gst.getSlabs().catch(() => [] as GstTaxSlab[]),
                ]);
                setProducts(productsData);
                setUnits(unitsData);
                setProductUnitConversions(productUnitConversionsData);
                if (gstSettings?.gst_enabled) {
                    setGstSlabs(slabsData);
                }
                if (settingsData) setVoucherSettings(settingsData);

                const combinedParties = accountsData.map(acc => ({
                    id: acc.id,
                    name: acc.account_name,
                    type: acc.account_group === 'Accounts Payable' ? 'supplier' as const : 'customer' as const
                }));
                setParties(combinedParties);

                // Default to "Cash Purchase" account if available, otherwise first party
                if (purchaseReturnState.form.supplier_id === 0 && purchaseReturnState.mode === 'new') {
                    const cashPurchaseAccount = combinedParties.find(p => p.name === 'Cash');
                    const defaultParty = cashPurchaseAccount || combinedParties[0];

                    if (defaultParty) {
                        dispatch(setPurchaseReturnSupplier({
                            id: defaultParty.id,
                            name: defaultParty.name,
                            type: defaultParty.type
                        }));
                    }
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
        if (purchaseReturnState.mode === 'new' && purchaseReturnState.items.length === 0 && products.length > 0) {
            handleAddItem();
        }
    }, [purchaseReturnState.mode, products.length]);

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
            addPurchaseReturnItem({
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
        if (purchaseReturnState.items.length === 1) {
            toast.error('At least one item is required');
            return;
        }
        const updatedItems = purchaseReturnState.items.filter((_, i) => i !== index);
        dispatch(removePurchaseReturnItem(index));
        updateTotalsWithItems(updatedItems);
        dispatch(setPurchaseReturnHasUnsavedChanges(true));
    };

    const handleUpdateItem = (index: number, field: string, value: any) => {
        let finalValue = value;

        if (field === 'product_id') {
            const product = products.find((p) => p.id === value);
            if (product) {
                const defaultUnitId = getDefaultProductUnitId(
                    productUnitsByProduct[value],
                    'purchase',
                    product.unit_id
                );
                const rate = getProductUnitRate(
                    productUnitsByProduct[value],
                    defaultUnitId,
                    'purchase',
                    product.purchase_rate || 0
                );
                finalValue = value;
                const updatedItems = [...purchaseReturnState.items];
                updatedItems[index] = {
                    ...updatedItems[index],
                    product_id: value,
                    product_name: product.name,
                    unit_id: defaultUnitId,
                    rate,
                };
                dispatch(
                    updatePurchaseReturnItem({
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
                dispatch(setPurchaseReturnHasUnsavedChanges(true));
                return;
            }
        }

        if (field === 'unit_id') {
            const currentItem = purchaseReturnState.items[index];
            const productId = String(currentItem.product_id);
            const product = products.find((p) => p.id === productId);
            const rate = getProductUnitRate(
                productUnitsByProduct[productId],
                value,
                'purchase',
                product?.purchase_rate || currentItem.rate || 0
            );
            finalValue = value;
            const updatedItems = [...purchaseReturnState.items];
            updatedItems[index] = {
                ...updatedItems[index],
                unit_id: value,
                rate
            };
            dispatch(updatePurchaseReturnItem({ index, data: { unit_id: value, rate } }));
            updateTotalsWithItems(updatedItems);
            dispatch(setPurchaseReturnHasUnsavedChanges(true));
            return;
        }

        const updatedItems = [...purchaseReturnState.items];
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
        dispatch(updatePurchaseReturnItem({ index, data: item }));
        updateTotalsWithItems(updatedItems);
        dispatch(setPurchaseReturnHasUnsavedChanges(true));
    };

    const updateTotalsWithItems = (items: typeof purchaseReturnState.items, discountRate?: number, discountAmount?: number) => {
        // Slab-aware GST resolution mapper
        const slabMap: Record<string, GstTaxSlab> = {};
        gstSlabs.forEach(s => { slabMap[s.id] = s; });
        const productMap: Record<string, Product> = {};
        products.forEach(p => { productMap[String(p.id)] = p; });

        const resolveItemGstRate = (item: typeof purchaseReturnState.items[number]) => {
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
            discountRate: discountRate !== undefined ? discountRate : purchaseReturnState.form.discount_rate,
            discountAmount:
                discountRate !== undefined
                    ? undefined
                    : discountAmount !== undefined
                        ? discountAmount
                        : purchaseReturnState.form.discount_amount,
            taxInclusive: !!voucherSettings?.taxInclusive,
            resolveGstRate: resolveItemGstRate,
        });

        dispatch(setPurchaseReturnDiscountRate(calculation.discountRate));
        dispatch(setPurchaseReturnDiscountAmount(calculation.discountAmount));
        dispatch(setPurchaseReturnTotals({
            subtotal: calculation.subtotal,
            discount: calculation.discountAmount,
            tax: calculation.tax,
            grandTotal: calculation.grandTotal
        }));
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        if (purchaseReturnState.items.length === 0) {
            toast.error('Add at least one item');
            return;
        }

        // Validate each item
        const hasInvalidItems = purchaseReturnState.items.some(item => {
            const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
            return !item.product_id || finalQty <= 0 || item.rate <= 0;
        });

        if (hasInvalidItems) {
            toast.error('All items must have a product selected, a positive final quantity, and a non-zero rate');
            return;
        }

        if (!purchaseReturnState.form.supplier_id) {
            toast.error('Select a party');
            return;
        }

        try {
            dispatch(setPurchaseReturnLoading(true));
            if (purchaseReturnState.mode === 'editing' && purchaseReturnState.currentVoucherId) {
                await invoke('update_purchase_return', {
                    id: purchaseReturnState.currentVoucherId,
                    invoice: {
                        supplier_id: purchaseReturnState.form.supplier_id,
                        party_type: purchaseReturnState.form.party_type,
                        voucher_date: purchaseReturnState.form.voucher_date,
                        reference: purchaseReturnState.form.reference || null,
                        narration: purchaseReturnState.form.narration || null,
                        discount_rate: purchaseReturnState.form.discount_rate || null,
                        discount_amount: purchaseReturnState.form.discount_amount || null,
                        items: purchaseReturnState.items.map(item => ({
                            product_id: item.product_id,
                            unit_id: item.unit_id || null,
                            description: item.description,
                            initial_quantity: item.initial_quantity,
                            count: item.count,
                            deduction_per_unit: item.deduction_per_unit,
                            rate: item.rate,
                            tax_rate: item.tax_rate,
                            discount_percent: item.discount_percent || 0,
                            discount_amount: item.discount_amount || 0,
                        })),
                        gst_disabled: gstDisabled,
                    },
                });
                toast.success('Purchase return updated successfully');
            } else {
                const newId = await invoke<string>('create_purchase_return', {
                    invoice: {
                        supplier_id: purchaseReturnState.form.supplier_id,
                        party_type: purchaseReturnState.form.party_type,
                        voucher_date: purchaseReturnState.form.voucher_date,
                        reference: purchaseReturnState.form.reference || null,
                        narration: purchaseReturnState.form.narration || null,
                        discount_rate: purchaseReturnState.form.discount_rate || null,
                        discount_amount: purchaseReturnState.form.discount_amount || null,
                        items: purchaseReturnState.items.map(item => ({
                            product_id: item.product_id,
                            unit_id: item.unit_id || null,
                            description: item.description,
                            initial_quantity: item.initial_quantity,
                            count: item.count,
                            deduction_per_unit: item.deduction_per_unit,
                            rate: item.rate,
                            tax_rate: item.tax_rate,
                            discount_percent: item.discount_percent || 0,
                            discount_amount: item.discount_amount || 0,
                        })),
                        gst_disabled: gstDisabled,
                    },
                });
                toast.success('Purchase return created successfully');

                if (voucherSettings?.autoPrint) {
                    print({ voucherId: newId, voucherType: 'purchase_return' });
                }
            }

            if (purchaseReturnState.mode === 'editing' && voucherSettings?.autoPrint && purchaseReturnState.currentVoucherId) {
                print({ voucherId: purchaseReturnState.currentVoucherId, voucherType: 'purchase_return' });
            }

            dispatch(setPurchaseReturnHasUnsavedChanges(false));
            handleNew(true);
        } catch (error) {
            toast.error('Failed to save purchase return');
            console.error(error);
        } finally {
            dispatch(setPurchaseReturnLoading(false));
        }
    };

    const loadVoucher = async (id: string) => {
        try {
            dispatch(setPurchaseReturnLoading(true));
            dispatch(setPurchaseReturnHasUnsavedChanges(false));
            dispatch(resetPurchaseReturnForm()); // Clear first

            // Fetch header and items using existing commands
            const invoice = await invoke<any>('get_purchase_return', { id });
            const items = await invoke<any[]>('get_purchase_return_items', { voucherId: id });

            // Set the actual voucher number
            dispatch(setPurchaseReturnCurrentVoucherNo(invoice.voucher_no));

            // Populate Form
            dispatch(setPurchaseReturnSupplier({ id: invoice.supplier_id, name: invoice.supplier_name, type: invoice.party_type }));
            dispatch(setPurchaseReturnVoucherDate(invoice.voucher_date));
            dispatch(setPurchaseReturnReference(invoice.reference || ''));
            dispatch(setPurchaseReturnNarration(invoice.narration || ''));
            dispatch(setPurchaseReturnDiscountRate(invoice.discount_rate || 0));
            dispatch(setPurchaseReturnDiscountAmount(invoice.discount_amount || 0));

            // Populate Items
            items.forEach(item => {
                dispatch(addPurchaseReturnItem({
                    product_id: item.product_id || 0,
                    product_name: item.description, // Fallback
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
                    description: item.description,
                    initial_quantity: item.initial_quantity,
                    count: item.count,
                    deduction_per_unit: item.deduction_per_unit,
                    rate: item.rate,
                    tax_rate: item.tax_rate,
                    discount_percent: item.discount_percent || 0,
                    discount_amount: item.discount_amount || 0,
                }));
            });

            // Calculate totals
            const loadedItems = items.map(item => ({
                id: `loaded-${item.id}`,
                product_id: item.product_id || 0,
                product_name: item.description,
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
                description: item.description,
                initial_quantity: item.initial_quantity,
                count: item.count,
                deduction_per_unit: item.deduction_per_unit,
                rate: item.rate,
                tax_rate: item.tax_rate,
                discount_percent: item.discount_percent || 0,
                discount_amount: item.discount_amount || 0,
            }));

            updateTotalsWithItems(loadedItems, invoice.discount_rate, invoice.discount_amount);

            dispatch(setPurchaseReturnMode('viewing'));
            dispatch(setPurchaseReturnHasUnsavedChanges(false));

        } catch (error) {
            console.error("Failed to load return", error);
            toast.error("Failed to load return");
        } finally {
            dispatch(setPurchaseReturnLoading(false));
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
        voucherType: 'purchase_return',
        sliceState: purchaseReturnState,
        actions: {
            setMode: setPurchaseReturnMode,
            setCurrentVoucherId: setPurchaseReturnCurrentVoucherId,
            setCurrentVoucherNo: setPurchaseReturnCurrentVoucherNo,
            setNavigationData: setPurchaseReturnNavigationData,
            setHasUnsavedChanges: setPurchaseReturnHasUnsavedChanges,
            resetForm: resetPurchaseReturnForm
        },
        onLoadVoucher: loadVoucher
    });

    const handleDeleteVoucher = async () => {
        const confirmed = await handleDelete();
        if (confirmed && purchaseReturnState.currentVoucherId) {
            try {
                dispatch(setPurchaseReturnLoading(true));
                await invoke('delete_purchase_return', { id: purchaseReturnState.currentVoucherId });
                toast.success('Voucher and all associated entries deleted');
                handleNew();
            } catch (e) {
                toast.error('Failed to delete voucher');
                console.error(e);
            } finally {
                dispatch(setPurchaseReturnLoading(false));
            }
        }
    };

    const handlePrint = () => {
        if (purchaseReturnState.mode === 'new' || !purchaseReturnState.currentVoucherId) {
            toast.error("Please save first");
            return;
        }
        print({ voucherId: purchaseReturnState.currentVoucherId, voucherType: 'purchase_return' });
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

    const getItemAmount = (item: typeof purchaseReturnState.items[0]) => {
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

        const sourceItems = purchaseReturnState.items.some((candidate) => candidate.id === item.id) ? purchaseReturnState.items : [item];
        const calculation = calculateVoucherDiscounts(sourceItems, {
            discountRate: purchaseReturnState.form.discount_rate,
            discountAmount: purchaseReturnState.form.discount_amount,
            taxInclusive: !!voucherSettings?.taxInclusive,
            resolveGstRate: () => gstRate,
        });
        const lineIndex = sourceItems.length === 1 ? 0 : sourceItems.findIndex((candidate) => candidate.id === item.id);
        const line = calculation.lines[Math.max(lineIndex, 0)];
        const grossTax = Math.round(line.netBeforeInvoiceDiscount * (gstRate / 100) * 100) / 100;
        return { finalQty: line.finalQty, amount: line.netBeforeInvoiceDiscount, taxAmount: grossTax, total: Math.round((line.netBeforeInvoiceDiscount + grossTax) * 100) / 100 };
    };

    // Determine if form should be disabled (viewing mode)
    const isReadOnly = purchaseReturnState.mode === 'viewing';

    return (
        <div className="h-full flex flex-col bg-background">
            <VoucherPageHeader
                title="Purchase Return"
                description="Record supplier returns"
                mode={purchaseReturnState.mode}
                voucherNo={purchaseReturnState.currentVoucherNo}
                voucherDate={purchaseReturnState.form.voucher_date}
                isUnsaved={purchaseReturnState.hasUnsavedChanges}
                hasPrevious={purchaseReturnState.navigationData.hasPrevious}
                hasNext={purchaseReturnState.navigationData.hasNext}
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
                loading={purchaseReturnState.loading}
            />

            <VoucherShortcutPanel
                show={showShortcuts}
            />

            <VoucherListViewSheet
                open={showListView}
                onOpenChange={setShowListView}
                voucherType="purchase_return"
                onSelectVoucher={handleListSelect}
            />



            {/* Form Content */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <form ref={formRef} onSubmit={handleSubmit} className="flex-1 min-h-0 p-5 max-w-7xl mx-auto flex flex-col gap-4">
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
                                    value={purchaseReturnState.form.supplier_id}
                                    onChange={(value) => {
                                        const party = parties.find((p) => p.id === value);
                                        if (party) {
                                            dispatch(setPurchaseReturnSupplier({ id: party.id, name: party.name, type: party.type }));
                                        }
                                    }}
                                    placeholder="Select party"
                                    searchPlaceholder="Search parties..."
                                    disabled={isReadOnly}
                                />
                            </div>

                            {/* Voucher Date */}
                            <div>
                                <Label className="text-xs font-medium mb-1 block">Return Date *</Label>
                                <Input
                                    type="date"
                                    value={purchaseReturnState.form.voucher_date}
                                    onChange={(e) => {
                                        dispatch(setPurchaseReturnVoucherDate(e.target.value));
                                        dispatch(setPurchaseReturnHasUnsavedChanges(true));
                                    }}
                                    className="h-8 text-sm"
                                    disabled={isReadOnly}
                                />
                            </div>

                            {/* Reference */}
                            <div className="col-span-2">
                                <Label className="text-xs font-medium mb-1 block">Reference (Opt)</Label>
                                <Input
                                    value={purchaseReturnState.form.reference}
                                    onChange={(e) => {
                                        dispatch(setPurchaseReturnReference(e.target.value));
                                        dispatch(setPurchaseReturnHasUnsavedChanges(true));
                                    }}
                                    placeholder="Return Ref / Invoice No"
                                    className="h-8 text-sm"
                                    disabled={isReadOnly}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Items Section */}
                    <VoucherItemsSection
                        items={purchaseReturnState.items}
                        products={products}
                        units={units}
                        productUnitsByProduct={productUnitsByProduct}
                        isReadOnly={isReadOnly}
                        onAddItem={handleAddItem}
                        onRemoveItem={handleRemoveItem}
                        onUpdateItem={handleUpdateItem}
                        getItemAmount={getItemAmount}
                        addItemLabel="Add Return Item (Ctrl+N)"
                        disableAdd={isReadOnly}
                        settings={voucherSettings}
                        onSectionExit={() => {
                            // Focus discount amount input
                            setTimeout(() => {
                                document.getElementById('voucher-discount-amount')?.focus();
                            }, 50);
                        }}
                        gstSlabs={gstDisabled ? [] : gstSlabs}
                        fullProducts={products as any}
                        taxInclusive={voucherSettings?.taxInclusive}
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
                                  <label className="text-xs text-muted-foreground cursor-pointer select-none" htmlFor="purchase-return-gst-disable-switch">
                                    Disable GST for this voucher
                                  </label>
                                  <Switch
                                    id="purchase-return-gst-disable-switch"
                                    checked={gstDisabled}
                                    onCheckedChange={setGstDisabled}
                                  />
                                </div>
                                {gstDisabled && (
                                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                    GST columns hidden. Return will be saved without tax.
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
                                value={purchaseReturnState.form.narration}
                                onChange={(e) => { dispatch(setPurchaseReturnNarration(e.target.value)); dispatch(setPurchaseReturnHasUnsavedChanges(true)); }}
                                placeholder="Reason for return..."
                                className="min-h-14 text-xs"
                                disabled={isReadOnly}
                            />
                        </div>

                        {/* Totals */}
                        <div className="col-span-2 bg-card border rounded-lg p-2.5 space-y-1.5">
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center gap-2 text-xs">
                                    <span className="text-muted-foreground">Subtotal:</span>
                                    <span className="font-medium font-mono">₹ {purchaseReturnState.totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                {purchaseReturnState.totals.discount > 0 && (
                                    <div className="text-xs font-mono text-muted-foreground">
                                        Discount: ₹ {purchaseReturnState.totals.discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </div>
                                )}
                                {purchaseReturnState.totals.tax > 0 && (
                                    <div className="text-xs font-mono text-muted-foreground">
                                        Tax: ₹ {purchaseReturnState.totals.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </div>
                                )}

                                {/* Discount */}
                                <div className="space-y-1 text-xs">
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <Label className="text-xs font-medium mb-1 block">Discount %</Label>
                                            <Input
                                                type="number"
                                                value={purchaseReturnState.form.discount_rate}
                                                onChange={(e) => {
                                                    const rate = parseFloat(e.target.value) || 0;
                                                    dispatch(setPurchaseReturnHasUnsavedChanges(true));
                                                    updateTotalsWithItems(purchaseReturnState.items, rate, undefined);
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
                                                id="voucher-discount-amount"
                                                type="number"
                                                value={purchaseReturnState.form.discount_amount}
                                                onChange={(e) => {
                                                    const amount = parseFloat(e.target.value) || 0;
                                                    dispatch(setPurchaseReturnHasUnsavedChanges(true));
                                                    updateTotalsWithItems(purchaseReturnState.items, undefined, amount);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        document.getElementById('voucher-save-btn')?.focus();
                                                    }
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
                                    <span className="font-semibold">Grand Total</span>
                                    <span className="font-bold font-mono text-primary">₹ {purchaseReturnState.totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
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
                                id="voucher-save-btn"
                                type="submit"
                                disabled={purchaseReturnState.loading}
                                className="h-9"
                                title="Save (Ctrl+S)"
                            >
                                <IconCheck size={16} />
                                {purchaseReturnState.loading ? 'Saving...' : (purchaseReturnState.mode === 'editing' ? 'Update Return' : 'Save Return')}
                            </Button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
