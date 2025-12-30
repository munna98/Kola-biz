import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    setSalesReturnCustomer,
    setSalesReturnVoucherDate,
    setSalesReturnReference,
    setSalesReturnNarration,
    setSalesReturnDiscountRate,
    setSalesReturnDiscountAmount,
    addSalesReturnItem,
    updateSalesReturnItem,
    removeSalesReturnItem,
    setSalesReturnTotals,
    resetSalesReturnForm,
    setSalesReturnLoading,
    setSalesReturnMode,
    setSalesReturnCurrentVoucherId,
    setSalesReturnCurrentVoucherNo,
    setSalesReturnHasUnsavedChanges,
    setSalesReturnNavigationData,
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
import { PrintPreviewModal } from '@/components/common/PrintPreviewModal';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';

import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { VoucherItemsSection } from '@/components/voucher/VoucherItemsSection';

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

export default function SalesReturnPage() {
    const dispatch = useDispatch<AppDispatch>();
    const salesReturnState = useSelector((state: RootState) => state.salesReturn);
    const [products, setProducts] = useState<Product[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const [isInitializing, setIsInitializing] = useState(true);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showListView, setShowListView] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);

    // Refs for focus management
    const formRef = useRef<HTMLFormElement>(null);
    const customerRef = useRef<HTMLDivElement>(null);

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            try {
                const [productsData, unitsData, accountsData] = await Promise.all([
                    invoke<Product[]>('get_products'),
                    invoke<Unit[]>('get_units'),
                    invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable', 'Accounts Payable'] }),
                ]);
                setProducts(productsData);
                setUnits(unitsData);

                const combinedParties = accountsData.map(acc => ({
                    id: acc.id,
                    name: acc.account_name,
                    type: acc.account_group === 'Accounts Receivable' ? 'customer' as const : 'supplier' as const
                }));
                setParties(combinedParties);

                // Default to "Cash Sale" account if available, otherwise first party
                if (salesReturnState.form.customer_id === 0 && salesReturnState.mode === 'new') {
                    const cashSaleAccount = combinedParties.find(p => p.name === 'Cash Sale');
                    const defaultParty = cashSaleAccount || combinedParties[0];

                    if (defaultParty) {
                        dispatch(setSalesReturnCustomer({
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
        if (salesReturnState.mode === 'new' && salesReturnState.items.length === 0 && products.length > 0) {
            handleAddItem();
        }
    }, [salesReturnState.mode, products.length]);

    const handleAddItem = () => {
        dispatch(
            addSalesReturnItem({
                product_id: 0,
                product_name: '',
                description: '',
                initial_quantity: 0,
                count: 1,
                deduction_per_unit: 1,
                rate: 0,
                tax_rate: 0,
            })
        );
    };

    const handleRemoveItem = (index: number) => {
        if (salesReturnState.items.length === 1) {
            toast.error('At least one item is required');
            return;
        }
        const updatedItems = salesReturnState.items.filter((_, i) => i !== index);
        dispatch(removeSalesReturnItem(index));
        updateTotalsWithItems(updatedItems);
        dispatch(setSalesReturnHasUnsavedChanges(true));
    };

    const handleUpdateItem = (index: number, field: string, value: any) => {
        let finalValue = value;

        if (field === 'product_id') {
            const product = products.find((p) => p.id === value);
            if (product) {
                finalValue = value;
                const updatedItems = [...salesReturnState.items];
                updatedItems[index] = {
                    ...updatedItems[index],
                    product_id: value,
                    product_name: product.name,
                    rate: product.sales_rate || 0,
                };
                dispatch(
                    updateSalesReturnItem({
                        index,
                        data: {
                            product_id: value,
                            product_name: product.name,
                            rate: product.sales_rate || 0,
                        },
                    })
                );
                updateTotalsWithItems(updatedItems);
                dispatch(setSalesReturnHasUnsavedChanges(true));
                return;
            }
        }

        const updatedItems = [...salesReturnState.items];
        updatedItems[index] = { ...updatedItems[index], [field]: finalValue };
        dispatch(updateSalesReturnItem({ index, data: { [field]: finalValue } }));
        updateTotalsWithItems(updatedItems);
        dispatch(setSalesReturnHasUnsavedChanges(true));
    };

    const updateTotalsWithItems = (items: typeof salesReturnState.items, discountRate?: number, discountAmount?: number) => {
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

        let finalDiscountRate = discountRate !== undefined ? discountRate : salesReturnState.form.discount_rate;
        let finalDiscountAmount = discountAmount !== undefined ? discountAmount : salesReturnState.form.discount_amount;

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

        dispatch(setSalesReturnDiscountRate(finalDiscountRate));
        dispatch(setSalesReturnDiscountAmount(finalDiscountAmount));
        dispatch(setSalesReturnTotals({ subtotal, discount: finalDiscountAmount, tax: totalTax, grandTotal }));
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();

        if (salesReturnState.items.length === 0) {
            toast.error('Add at least one item');
            return;
        }

        // Validate each item
        const hasInvalidItems = salesReturnState.items.some(item => {
            const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
            return !item.product_id || finalQty <= 0 || item.rate <= 0;
        });

        if (hasInvalidItems) {
            toast.error('All items must have a product selected, a positive final quantity, and a non-zero rate');
            return;
        }

        if (!salesReturnState.form.customer_id) {
            toast.error('Select a party');
            return;
        }

        try {
            dispatch(setSalesReturnLoading(true));
            if (salesReturnState.mode === 'editing' && salesReturnState.currentVoucherId) {
                await invoke('update_sales_return', {
                    id: salesReturnState.currentVoucherId,
                    invoice: {
                        customer_id: salesReturnState.form.customer_id,
                        party_type: salesReturnState.form.party_type,
                        voucher_date: salesReturnState.form.voucher_date,
                        reference: salesReturnState.form.reference || null,
                        narration: salesReturnState.form.narration || null,
                        discount_rate: salesReturnState.form.discount_rate || null,
                        discount_amount: salesReturnState.form.discount_amount || null,
                        items: salesReturnState.items.map(item => ({
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
                toast.success('Sales return updated successfully');
            } else {
                await invoke<number>('create_sales_return', {
                    invoice: {
                        customer_id: salesReturnState.form.customer_id,
                        party_type: salesReturnState.form.party_type,
                        voucher_date: salesReturnState.form.voucher_date,
                        reference: salesReturnState.form.reference || null,
                        narration: salesReturnState.form.narration || null,
                        discount_rate: salesReturnState.form.discount_rate || null,
                        discount_amount: salesReturnState.form.discount_amount || null,
                        items: salesReturnState.items.map(item => ({
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
                toast.success('Sales return created successfully');
            }

            dispatch(setSalesReturnHasUnsavedChanges(false));
            handleNew(true);
        } catch (error) {
            toast.error('Failed to save sales return');
            console.error(error);
        } finally {
            dispatch(setSalesReturnLoading(false));
        }
    };

    const loadVoucher = async (id: number) => {
        try {
            dispatch(setSalesReturnLoading(true));
            dispatch(setSalesReturnHasUnsavedChanges(false));
            dispatch(resetSalesReturnForm()); // Clear first

            // Fetch header and items using existing commands
            const invoice = await invoke<any>('get_sales_return', { id });
            const items = await invoke<any[]>('get_sales_return_items', { voucherId: id });

            // Set the actual voucher number
            dispatch(setSalesReturnCurrentVoucherNo(invoice.voucher_no));

            // Populate Form
            dispatch(setSalesReturnCustomer({ id: invoice.customer_id, name: invoice.customer_name, type: 'customer' }));
            dispatch(setSalesReturnVoucherDate(invoice.voucher_date));
            dispatch(setSalesReturnReference(invoice.reference || ''));
            dispatch(setSalesReturnNarration(invoice.narration || ''));
            dispatch(setSalesReturnDiscountRate(invoice.discount_rate || 0));
            dispatch(setSalesReturnDiscountAmount(invoice.discount_amount || 0));

            // Populate Items
            items.forEach(item => {
                dispatch(addSalesReturnItem({
                    product_id: item.product_id || 0,
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

            dispatch(setSalesReturnMode('viewing'));
            dispatch(setSalesReturnHasUnsavedChanges(false));

        } catch (error) {
            console.error("Failed to load return", error);
            toast.error("Failed to load return");
        } finally {
            dispatch(setSalesReturnLoading(false));
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
        voucherType: 'sales_return',
        sliceState: salesReturnState,
        actions: {
            setMode: setSalesReturnMode,
            setCurrentVoucherId: setSalesReturnCurrentVoucherId,
            setCurrentVoucherNo: setSalesReturnCurrentVoucherNo,
            setNavigationData: setSalesReturnNavigationData,
            setHasUnsavedChanges: setSalesReturnHasUnsavedChanges,
            resetForm: resetSalesReturnForm
        },
        onLoadVoucher: loadVoucher
    });

    const handleDeleteVoucher = async () => {
        const confirmed = await handleDelete();
        if (confirmed && salesReturnState.currentVoucherId) {
            try {
                dispatch(setSalesReturnLoading(true));
                await invoke('delete_sales_return', { id: salesReturnState.currentVoucherId });
                toast.success('Voucher and all associated entries deleted');
                handleNew();
            } catch (e) {
                toast.error('Failed to delete voucher');
                console.error(e);
            } finally {
                dispatch(setSalesReturnLoading(false));
            }
        }
    };

    const handlePrint = () => {
        if (salesReturnState.mode === 'new' || !salesReturnState.currentVoucherId) {
            toast.error("Please save first");
            return;
        }
        setShowPrintModal(true);
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

    const getItemAmount = (item: typeof salesReturnState.items[0]) => {
        const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
        const amount = finalQty * item.rate;
        const taxAmount = amount * (item.tax_rate / 100);
        return { finalQty, amount, taxAmount, total: amount + taxAmount };
    };

    // Determine if form should be disabled (viewing mode)
    const isReadOnly = salesReturnState.mode === 'viewing';

    return (
        <div className="h-full flex flex-col bg-background">
            <VoucherPageHeader
                title="Sales Return"
                description="Record customer returns"
                mode={salesReturnState.mode}
                voucherNo={salesReturnState.currentVoucherNo}
                voucherDate={salesReturnState.form.voucher_date}
                isUnsaved={salesReturnState.hasUnsavedChanges}
                hasPrevious={salesReturnState.navigationData.hasPrevious}
                hasNext={salesReturnState.navigationData.hasNext}
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
                loading={salesReturnState.loading}
            />

            <VoucherShortcutPanel
                show={showShortcuts}
            />

            <VoucherListViewSheet
                open={showListView}
                onOpenChange={setShowListView}
                voucherType="sales_return"
                onSelectVoucher={handleListSelect}
            />

            <PrintPreviewModal
                isOpen={showPrintModal}
                onClose={() => setShowPrintModal(false)}
                voucherId={salesReturnState.currentVoucherId}
                voucherType="sales_return"
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
                                    value={salesReturnState.form.customer_id}
                                    onChange={(value) => {
                                        const party = parties.find((p) => p.id === value);
                                        if (party) {
                                            dispatch(setSalesReturnCustomer({ id: party.id, name: party.name, type: party.type }));
                                        }
                                    }}
                                    placeholder="Select party"
                                    searchPlaceholder="Search parties..."
                                    disabled={isReadOnly}
                                />
                            </div>

                            {/* Invoice Date */}
                            <div>
                                <Label className="text-xs font-medium mb-1 block">Return Date *</Label>
                                <Input
                                    type="date"
                                    value={salesReturnState.form.voucher_date}
                                    onChange={(e) => {
                                        dispatch(setSalesReturnVoucherDate(e.target.value));
                                        dispatch(setSalesReturnHasUnsavedChanges(true));
                                    }}
                                    className="h-8 text-sm"
                                    disabled={isReadOnly}
                                />
                            </div>

                            {/* Reference */}
                            <div className="col-span-2">
                                <Label className="text-xs font-medium mb-1 block">Reference (Opt)</Label>
                                <Input
                                    value={salesReturnState.form.reference}
                                    onChange={(e) => {
                                        dispatch(setSalesReturnReference(e.target.value));
                                        dispatch(setSalesReturnHasUnsavedChanges(true));
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
                        items={salesReturnState.items}
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
                                value={salesReturnState.form.narration}
                                onChange={(e) => { dispatch(setSalesReturnNarration(e.target.value)); dispatch(setSalesReturnHasUnsavedChanges(true)); }}
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
                                    <span className="font-medium font-mono">₹{salesReturnState.totals.subtotal.toFixed(2)}</span>
                                </div>

                                {/* Discount */}
                                <div className="space-y-1 text-xs">
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <Label className="text-xs font-medium mb-1 block">Discount %</Label>
                                            <Input
                                                type="number"
                                                value={salesReturnState.form.discount_rate || ''}
                                                onChange={(e) => {
                                                    const rate = parseFloat(e.target.value) || 0;
                                                    dispatch(setSalesReturnHasUnsavedChanges(true));
                                                    updateTotalsWithItems(salesReturnState.items, rate, undefined);
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
                                                value={salesReturnState.form.discount_amount || ''}
                                                onChange={(e) => {
                                                    const amount = parseFloat(e.target.value) || 0;
                                                    dispatch(setSalesReturnHasUnsavedChanges(true));
                                                    updateTotalsWithItems(salesReturnState.items, undefined, amount);
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
                                    <span className="font-bold font-mono text-primary">₹{salesReturnState.totals.grandTotal.toFixed(2)}</span>
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
                            <Button type="submit" disabled={salesReturnState.loading} className="h-9" title="Save (Ctrl+S)">
                                <IconCheck size={16} />
                                {salesReturnState.loading ? 'Saving...' : (salesReturnState.mode === 'editing' ? 'Update Return' : 'Save Return')}
                            </Button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
