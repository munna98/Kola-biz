import { useEffect, useState, useRef } from 'react';
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
} from '@tabler/icons-react';


// Global Voucher Components & Hooks
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
import { usePrint } from '@/hooks/usePrint';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';

import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { VoucherItemsSection } from '@/components/voucher/VoucherItemsSection';

interface Product {
    id: string;
    code: string;
    name: string;
    unit_id: string;
    sales_rate: number;
    purchase_rate: number;
}

interface Unit {
    id: string;
    name: string;
    symbol: string;
}

interface Party {
    id: number;
    name: string;
    type: 'customer' | 'supplier';
}

export default function PurchaseReturnPage() {
    const dispatch = useDispatch<AppDispatch>();
    const purchaseReturnState = useSelector((state: RootState) => state.purchaseReturn);
    const [products, setProducts] = useState<Product[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isInitializing, setIsInitializing] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showListView, setShowListView] = useState(false);
    const { print } = usePrint();

    // Refs for focus management
    const formRef = useRef<HTMLFormElement>(null);
    const supplierRef = useRef<HTMLDivElement>(null);

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            try {
                const [productsData, unitsData, accountsData] = await Promise.all([
                    invoke<Product[]>('get_products'),
                    invoke<Unit[]>('get_units'),
                    // Fetch both Suppliers (Accounts Payable) and Customers (Accounts Receivable) for flexibility
                    invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Payable', 'Accounts Receivable'] }),
                ]);
                setProducts(productsData);
                setUnits(unitsData);

                const combinedParties = accountsData.map(acc => ({
                    id: acc.id,
                    name: acc.account_name,
                    type: acc.account_group === 'Accounts Payable' ? 'supplier' as const : 'customer' as const
                }));
                setParties(combinedParties);

                // Default to "Cash Purchase" account if available, otherwise first party
                if (purchaseReturnState.form.supplier_id === 0 && purchaseReturnState.mode === 'new') {
                    const cashPurchaseAccount = combinedParties.find(p => p.name === 'Cash Purchase');
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

    const handleAddItem = () => {
        dispatch(
            addPurchaseReturnItem({
                product_id: 0,
                product_name: '',
                description: '',
                initial_quantity: 0,
                count: 1,
                deduction_per_unit: 1.5, // Default deduction for Purchase Return (same as Pi?) - User asked for Pi=1.5, assuming Pr=1.5 too?
                rate: 0,
                tax_rate: 0,
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
                finalValue = value;
                const updatedItems = [...purchaseReturnState.items];
                updatedItems[index] = {
                    ...updatedItems[index],
                    product_id: value,
                    product_name: product.name,
                    rate: product.purchase_rate || 0, // Use purchase rate
                };
                dispatch(
                    updatePurchaseReturnItem({
                        index,
                        data: {
                            product_id: value,
                            product_name: product.name,
                            rate: product.purchase_rate || 0,
                        },
                    })
                );
                updateTotalsWithItems(updatedItems);
                dispatch(setPurchaseReturnHasUnsavedChanges(true));
                return;
            }
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
        let subtotal = 0;
        let totalTax = 0;

        items.forEach((item) => {
            const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
            const amount = finalQty * item.rate;

            const discountAmount = item.discount_amount || 0;
            const taxableAmount = amount - discountAmount;
            const taxAmount = taxableAmount * (item.tax_rate / 100);

            subtotal += taxableAmount;
            totalTax += taxAmount;
        });

        subtotal = Math.round(subtotal * 100) / 100;
        totalTax = Math.round(totalTax * 100) / 100;

        let finalDiscountRate = discountRate !== undefined ? discountRate : purchaseReturnState.form.discount_rate;
        let finalDiscountAmount = discountAmount !== undefined ? discountAmount : purchaseReturnState.form.discount_amount;

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

        dispatch(setPurchaseReturnDiscountRate(finalDiscountRate));
        dispatch(setPurchaseReturnDiscountAmount(finalDiscountAmount));
        dispatch(setPurchaseReturnTotals({ subtotal, discount: finalDiscountAmount, tax: totalTax, grandTotal }));
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
                            description: item.description,
                            initial_quantity: item.initial_quantity,
                            count: item.count,
                            deduction_per_unit: item.deduction_per_unit,
                            rate: item.rate,
                            tax_rate: item.tax_rate,
                            discount_percent: item.discount_percent || 0,
                            discount_amount: item.discount_amount || 0,
                        })),
                    },
                });
                toast.success('Purchase return updated successfully');
            } else {
                await invoke<string>('create_purchase_return', {
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
                            description: item.description,
                            initial_quantity: item.initial_quantity,
                            count: item.count,
                            deduction_per_unit: item.deduction_per_unit,
                            rate: item.rate,
                            tax_rate: item.tax_rate
                        })),
                    },
                });
                toast.success('Purchase return created successfully');
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
        const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
        const amount = finalQty * item.rate;
        const taxAmount = amount * (item.tax_rate / 100);
        return { finalQty, amount, taxAmount, total: amount + taxAmount };
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
                        isReadOnly={isReadOnly}
                        onAddItem={handleAddItem}
                        onRemoveItem={handleRemoveItem}
                        onUpdateItem={handleUpdateItem}
                        getItemAmount={getItemAmount}
                        addItemLabel="Add Return Item (Ctrl+N)"
                        disableAdd={isReadOnly}
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
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">Subtotal:</span>
                                    <span className="font-medium font-mono">₹{purchaseReturnState.totals.subtotal.toFixed(2)}</span>
                                </div>

                                {/* Discount */}
                                <div className="space-y-1 text-xs">
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <Label className="text-xs font-medium mb-1 block">Discount %</Label>
                                            <Input
                                                type="number"
                                                value={purchaseReturnState.form.discount_rate || ''}
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
                                                type="number"
                                                value={purchaseReturnState.form.discount_amount || ''}
                                                onChange={(e) => {
                                                    const amount = parseFloat(e.target.value) || 0;
                                                    dispatch(setPurchaseReturnHasUnsavedChanges(true));
                                                    updateTotalsWithItems(purchaseReturnState.items, undefined, amount);
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
                                    <span className="font-bold font-mono text-primary">₹{purchaseReturnState.totals.grandTotal.toFixed(2)}</span>
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
                            <Button type="submit" disabled={purchaseReturnState.loading} className="h-9" title="Save (Ctrl+S)">
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
