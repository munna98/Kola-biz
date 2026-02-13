import { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    setOpeningStockMode,
    setOpeningStockCurrentVoucherId,
    setOpeningStockCurrentVoucherNo,
    setOpeningStockCreatedByName,
    setOpeningStockHasUnsavedChanges,
    setOpeningStockNavigationData,
    setOpeningStockDate,
    setOpeningStockNarration,
    addOpeningStockItem,
    updateOpeningStockItem,
    removeOpeningStockItem,
    setOpeningStockTotal,
    resetOpeningStockForm,
    setOpeningStockLoading,
} from '@/store';
import { RootState } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VoucherItemsSection, ColumnSettings } from '@/components/voucher/VoucherItemsSection';
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
import { PrintPreviewDialog } from '@/components/dialogs/PrintPreviewDialog';
import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';
import { IconCheck, IconX } from '@tabler/icons-react';
import { Product, Unit } from '@/lib/tauri';

export default function OpeningStockPage() {
    const dispatch = useDispatch();
    const openingStockState = useSelector((state: RootState) => state.openingStock);
    const { user } = useSelector((state: RootState) => state.auth);

    // Local state for dependencies
    const [products, setProducts] = useState<Product[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showListView, setShowListView] = useState(false);
    const [showPrintPreview, setShowPrintPreview] = useState(false);

    const formRef = useRef<HTMLFormElement>(null);

    // Derived state
    const isReadOnly = openingStockState.mode === 'viewing';

    // Load dependencies
    useEffect(() => {
        const loadDependencies = async () => {
            try {
                const [productsData, unitsData] = await Promise.all([
                    invoke<Product[]>('get_products'),
                    invoke<Unit[]>('get_units'),
                ]);
                setProducts(productsData);
                setUnits(unitsData);
            } catch (error) {
                console.error('Failed to load dependencies:', error);
                toast.error('Failed to load products or units');
            }
        };
        loadDependencies();
    }, []);

    // Auto-add first item when products are loaded (matching Purchase/Sales page UX)
    useEffect(() => {
        if (products.length > 0 && openingStockState.items.length === 0 && openingStockState.mode === 'new') {
            handleAddItem();
        }
    }, [products.length]);

    const handleLoadVoucher = async (id: string) => {
        try {
            dispatch(setOpeningStockLoading(true));
            const voucher: any = await invoke('get_opening_stock', { id });
            const items: any[] = await invoke('get_opening_stock_items', { voucherId: id });

            dispatch(setOpeningStockCurrentVoucherId(voucher.id));
            dispatch(setOpeningStockCurrentVoucherNo(voucher.voucher_no));
            dispatch(setOpeningStockDate(voucher.voucher_date));
            dispatch(setOpeningStockNarration(voucher.narration || ''));
            dispatch(setOpeningStockCreatedByName(voucher.created_by_name));

            dispatch(resetOpeningStockForm());

            // Restore date and narration again as reset cleared them
            dispatch(setOpeningStockDate(voucher.voucher_date));
            dispatch(setOpeningStockNarration(voucher.narration || ''));
            dispatch(setOpeningStockCreatedByName(voucher.created_by_name));

            items.forEach(item => {
                dispatch(addOpeningStockItem({
                    id: item.id,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    description: item.description || '',
                    quantity: item.quantity,
                    rate: item.rate,
                    amount: item.amount,
                }));
            });

            dispatch(setOpeningStockMode('viewing'));
            dispatch(setOpeningStockHasUnsavedChanges(false));

            // Recalculate total after loading
            const total = items.reduce((sum, item) => sum + item.amount, 0);
            dispatch(setOpeningStockTotal(total));

        } catch (error) {
            console.error('Failed to load opening stock:', error);
            toast.error('Failed to load opening stock entry');
            dispatch(setOpeningStockMode('new'));
        } finally {
            dispatch(setOpeningStockLoading(false));
        }
    };

    // Use the voucher navigation hook
    const nav = useVoucherNavigation({
        voucherType: 'opening_stock',
        sliceState: openingStockState,
        actions: {
            setMode: setOpeningStockMode,
            setCurrentVoucherId: setOpeningStockCurrentVoucherId,
            setCurrentVoucherNo: setOpeningStockCurrentVoucherNo,
            setNavigationData: setOpeningStockNavigationData,
            setHasUnsavedChanges: setOpeningStockHasUnsavedChanges,
            resetForm: resetOpeningStockForm,
        },
        onLoadVoucher: (id) => handleLoadVoucher(id),
    });

    // Calculate total whenever items change
    useEffect(() => {
        const total = openingStockState.items.reduce((sum, item) => sum + item.amount, 0);
        dispatch(setOpeningStockTotal(total));
    }, [openingStockState.items, dispatch]);


    const handleSave = async (e?: React.FormEvent) => {
        e?.preventDefault();

        if (openingStockState.items.length === 0) {
            toast.error('Please add at least one product');
            return;
        }

        try {
            dispatch(setOpeningStockLoading(true));

            const data = {
                voucher_date: openingStockState.form.voucher_date,
                narration: openingStockState.form.narration,
                items: openingStockState.items.map(item => ({
                    product_id: item.product_id,
                    description: item.description,
                    quantity: item.quantity,
                    rate: item.rate,
                    amount: item.amount,
                })),
                user_id: user?.id,
            };

            if (openingStockState.mode === 'editing' && openingStockState.currentVoucherId) {
                await invoke('update_opening_stock', {
                    id: openingStockState.currentVoucherId,
                    data
                });
                toast.success('Opening stock updated successfully');
                handleLoadVoucher(openingStockState.currentVoucherId);
            } else {
                const id = await invoke('create_opening_stock', { data });
                toast.success('Opening stock created successfully');
                handleLoadVoucher(id as string);
                nav.handleNew(true); // Reset to new after save, passing true to keep it in new mode? Or better to stay in view mode of created?
                // Actually usually after save we might want to stay in view mode or go to new.
                // Purchase page goes to new. Let's follow that pattern or check user pref. 
                // For now, let's just go to view mode of the created one or new.
                // Purchase page does: nav.handleNew(true); which implies going to NEW mode.
                // But wait, if I want to see what I just saved, I should load it.
                // The handleLoadVoucher above does that.
                // But nav.handleNew(true) effectively resets it for the NEXT entry.
                // Let's stick to showing the saved one for now or just resetting?
                // Purchase invoice code:
                // toast.success('Purchase invoice created successfully');
                // ... logic to show payment dialog ...
                // nav.handleNew(true); 

                // Let's load the saved one so they see it's done. 
                // Actually, standard pattern in high volume entry is to clear for next.
                // But for Opening Stock, maybe view is better. 
                // Let's stick to View mode for the newly created one for safety.
            }
        } catch (error) {
            console.error('Failed to save opening stock:', error);
            toast.error(typeof error === 'string' ? error : 'Failed to save opening stock');
        } finally {
            dispatch(setOpeningStockLoading(false));
        }
    };

    const handleDelete = async () => {
        const confirmed = await nav.handleDelete();
        if (confirmed && openingStockState.currentVoucherId) {
            try {
                dispatch(setOpeningStockLoading(true));
                await invoke('delete_opening_stock', { id: openingStockState.currentVoucherId });
                toast.success('Opening stock deleted successfully');
                nav.handleNew();
            } catch (error) {
                console.error('Failed to delete opening stock:', error);
                toast.error('Failed to delete opening stock');
            } finally {
                dispatch(setOpeningStockLoading(false));
            }
        }
    };

    const handlePrint = () => {
        if (openingStockState.mode === 'new' || !openingStockState.currentVoucherId) {
            toast.error("Please save the voucher before printing");
            return;
        }
        setShowPrintPreview(true);
    };

    const handleAddItem = () => {
        dispatch(addOpeningStockItem({
            product_id: '',
            description: '',
            quantity: 1,
            rate: 0,
            amount: 0
        }));
        dispatch(setOpeningStockHasUnsavedChanges(true));
    };

    // Global keyboard shortcuts
    useVoucherShortcuts({
        onSave: () => formRef.current?.requestSubmit(),
        onNewItem: handleAddItem,
        onClear: nav.handleNew,
        onToggleShortcuts: () => setShowShortcuts(prev => !prev),
        onCloseShortcuts: () => setShowShortcuts(false),
        showShortcuts
    });


    // Columns for VoucherItemsSection
    const columns: ColumnSettings[] = [
        { id: 'product', label: 'Product', visible: true, order: 0, width: '40%' },
        { id: 'quantity', label: 'Qty', visible: true, order: 1, width: '15%' },
        { id: 'unit', label: 'Unit', visible: true, order: 2, width: '10%' },
        { id: 'rate', label: 'Rate', visible: true, order: 3, width: '15%' },
        { id: 'total', label: 'Total', visible: true, order: 4, width: '15%' },
    ];

    return (
        <div className="h-full flex flex-col bg-background">
            <VoucherPageHeader
                title="Opening Stock"
                description="Record and manage opening stock entries"
                mode={openingStockState.mode}
                voucherNo={openingStockState.currentVoucherNo}
                voucherDate={openingStockState.form.voucher_date}
                createdBy={openingStockState.created_by_name}
                isUnsaved={openingStockState.hasUnsavedChanges}
                hasPrevious={openingStockState.navigationData.hasPrevious}
                hasNext={openingStockState.navigationData.hasNext}
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
                loading={openingStockState.loading}
            />

            <VoucherShortcutPanel show={showShortcuts} />

            <VoucherListViewSheet
                open={showListView}
                onOpenChange={setShowListView}
                voucherType="opening_stock"
                onSelectVoucher={nav.handleListSelect}
            />

            <PrintPreviewDialog
                open={showPrintPreview}
                onOpenChange={setShowPrintPreview}
                voucherId={openingStockState.currentVoucherId || undefined}
                voucherType="opening_stock"
                title={openingStockState.currentVoucherNo ? `Print Opening Stock - ${openingStockState.currentVoucherNo}` : 'Print Opening Stock'}
            />

            <div className="flex-1 overflow-hidden">
                <form ref={formRef} onSubmit={handleSave} className="h-full p-5 max-w-7xl mx-auto flex flex-col gap-4">
                    {/* Master Section */}
                    <div className="bg-card border rounded-lg p-3 space-y-3 shrink-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs font-medium mb-1 block">Voucher Date</Label>
                                <Input
                                    type="date"
                                    value={openingStockState.form.voucher_date}
                                    onChange={(e) => {
                                        dispatch(setOpeningStockDate(e.target.value));
                                        dispatch(setOpeningStockHasUnsavedChanges(true));
                                    }}
                                    disabled={isReadOnly}
                                    className="h-8"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-medium mb-1 block">Narration</Label>
                                <Input
                                    value={openingStockState.form.narration || ''}
                                    onChange={(e) => {
                                        dispatch(setOpeningStockNarration(e.target.value));
                                        dispatch(setOpeningStockHasUnsavedChanges(true));
                                    }}
                                    placeholder="Optional remarks..."
                                    disabled={isReadOnly}
                                    className="h-8"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Items Section */}
                    <VoucherItemsSection
                        items={openingStockState.items}
                        products={products}
                        units={units}
                        isReadOnly={isReadOnly}
                        settings={{ columns }}
                        onAddItem={handleAddItem}
                        onRemoveItem={(index) => {
                            dispatch(removeOpeningStockItem(index));
                            dispatch(setOpeningStockHasUnsavedChanges(true));
                        }}
                        onUpdateItem={(index, field, value) => {
                            dispatch(updateOpeningStockItem({ index, data: { [field]: value } }));

                            // Auto-calculate amount if quantity or rate changes
                            const item = openingStockState.items[index];
                            if (field === 'quantity' || field === 'rate') {
                                const qty = field === 'quantity' ? Number(value) : item.quantity;
                                const rate = field === 'rate' ? Number(value) : item.rate;
                                dispatch(updateOpeningStockItem({
                                    index,
                                    data: { amount: qty * rate }
                                }));
                            }

                            // If product changes, set rate from product purchase_rate
                            if (field === 'product_id') {
                                const product = products.find(p => p.id === value);
                                if (product) {
                                    dispatch(updateOpeningStockItem({
                                        index,
                                        data: {
                                            rate: product.purchase_rate,
                                            amount: item.quantity * (product.purchase_rate || 0),
                                            product_name: product.name
                                        }
                                    }));
                                }
                            }

                            dispatch(setOpeningStockHasUnsavedChanges(true));
                        }}
                        getItemAmount={(item) => ({
                            finalQty: item.quantity,
                            amount: item.amount,
                            taxAmount: 0,
                            total: item.amount
                        })}
                    />

                    {/* Totals Card */}
                    <div className="bg-card border rounded-lg p-3 shrink-0">
                        <div className="flex justify-between items-end">
                            <div></div>
                            <div className="text-right">
                                <div className="text-xs text-muted-foreground mb-1">Total Value</div>
                                <div className="text-lg font-mono font-bold">
                                    ₹ {openingStockState.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                            <Button type="submit" disabled={openingStockState.loading} className="h-9" title="Save (Ctrl+S)">
                                <IconCheck size={16} />
                                {openingStockState.loading ? 'Saving...' : (openingStockState.mode === 'editing' ? 'Update' : 'Save')}
                            </Button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
