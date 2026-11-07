import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    RootState,
    setStockAdjustmentMode,
    setStockAdjustmentCurrentVoucherId,
    setStockAdjustmentCurrentVoucherNo,
    setStockAdjustmentCreatedByName,
    setStockAdjustmentHasUnsavedChanges,
    setStockAdjustmentNavigationData,
    setStockAdjustmentDate,
    setStockAdjustmentNarration,
    addStockAdjustmentItem,
    updateStockAdjustmentItem,
    removeStockAdjustmentItem,
    setStockAdjustmentItems,
    setStockAdjustmentTotal,
    resetStockAdjustmentForm,
    setStockAdjustmentLoading,
    setActiveSectionWithParams,
} from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { VoucherItemsSection, ColumnSettings } from '@/components/voucher/VoucherItemsSection';
import { usePrint } from '@/hooks/usePrint';
import ProductDialog from '@/components/dialogs/ProductDialog';
import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';
import { IconCheck, IconX, IconArrowUp, IconArrowDown } from '@tabler/icons-react';
import { Product, Unit, ProductGroup, ProductUnitConversion } from '@/lib/tauri';
import { buildProductUnitMap, getDefaultProductUnitId, getProductUnitRate } from '@/lib/product-units';
import { useMoney } from '@/hooks/useMoney';

export default function StockAdjustmentPage() {
    const dispatch = useDispatch();
    const state = useSelector((state: RootState) => state.stockAdjustment);
    const activeSectionParams = useSelector((state: RootState) => state.app.activeSectionParams);
    const { user } = useSelector((state: RootState) => state.auth);
    const money = useMoney();

    const [products, setProducts] = useState<Product[]>([]);
    const [productUnitConversions, setProductUnitConversions] = useState<ProductUnitConversion[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
    const [masterProductsEnabled, setMasterProductsEnabled] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showListView, setShowListView] = useState(false);
    const [stockMap, setStockMap] = useState<Record<string, number>>({});
    const [showCreateProduct, setShowCreateProduct] = useState(false);
    const [newProductName, setNewProductName] = useState('');
    const [creatingProductRowIndex, setCreatingProductRowIndex] = useState<number | null>(null);

    const formRef = useRef<HTMLFormElement>(null);
    const { print: printVoucher } = usePrint();

    const productUnitsByProduct = useMemo(
        () => buildProductUnitMap(productUnitConversions),
        [productUnitConversions]
    );

    const isReadOnly = state.mode === 'viewing';

    const columns: ColumnSettings[] = [
        { id: 'product', label: 'Item', visible: true, order: 0, width: '28%' },
        { id: 'current_stock', label: 'Current Stock', visible: true, order: 1, width: '12%' },
        { id: 'quantity', label: 'Actual Stock', visible: true, order: 2, width: '12%' },
        { id: 'diff_qty', label: 'Diff Qty', visible: true, order: 3, width: '12%' },
        { id: 'unit', label: 'Unit', visible: true, order: 4, width: '8%' },
        { id: 'rate', label: 'Rate', visible: true, order: 5, width: '10%' },
        { id: 'amount', label: 'Amount', visible: true, order: 6, width: '10%' },
        { id: 'reason', label: 'Reason', visible: true, order: 7, width: '12%' },
    ];

    // ---- Load dependencies ----
    useEffect(() => {
        const load = async () => {
            try {
                const [productsData, unitsData, conversionsData, groupsData, masterVal, stockReportData] = await Promise.all([
                    invoke<Product[]>('get_products'),
                    invoke<Unit[]>('get_units'),
                    invoke<ProductUnitConversion[]>('get_all_product_unit_conversions'),
                    invoke<ProductGroup[]>('get_product_groups'),
                    invoke<string | null>('get_app_setting', { key: 'enable_master_products' }).catch(() => null),
                    invoke<any[]>('get_stock_report', { groupId: null, asOnDate: new Date().toISOString().split('T')[0] }).catch(() => []),
                ]);
                setProducts(productsData);
                setUnits(unitsData);
                setProductUnitConversions(conversionsData);
                setProductGroups(groupsData);
                setMasterProductsEnabled(masterVal === 'true');

                const map: Record<string, number> = {};
                for (const item of stockReportData) {
                    map[item.product_id] = item.current_stock;
                }
                setStockMap(map);
            } catch (err) {
                toast.error('Failed to load product data');
            }
        };
        load();
    }, []);

    // Auto-add first row when products load
    useEffect(() => {
        if (products.length > 0 && state.items.length === 0 && state.mode === 'new') {
            handleAddItem();
        }
    }, [products.length, state.mode]);

    // Recompute total on items change
    useEffect(() => {
        const total = state.items.reduce((sum, item) => sum + Math.abs(item.amount || 0), 0);
        dispatch(setStockAdjustmentTotal(total));
    }, [state.items, dispatch]);

    const handleLoadVoucher = async (id: string) => {
        try {
            dispatch(setStockAdjustmentLoading(true));
            const voucher: any = await invoke('get_stock_adjustment', { id });
            const items: any[] = await invoke('get_stock_adjustment_items', { voucherId: id });

            dispatch(resetStockAdjustmentForm());
            dispatch(setStockAdjustmentCurrentVoucherId(voucher.id));
            dispatch(setStockAdjustmentCurrentVoucherNo(voucher.voucher_no));
            dispatch(setStockAdjustmentDate(voucher.voucher_date));
            dispatch(setStockAdjustmentNarration(voucher.narration || ''));
            dispatch(setStockAdjustmentCreatedByName(voucher.created_by_name));

            const loadedItems = items.map(item => ({
                id: item.id,
                product_id: item.product_id,
                product_name: item.product_name,
                unit_id: item.unit_id,
                actual_stock: item.actual_stock ?? item.adjustment_qty,
                current_stock: item.current_stock ?? 0,
                initial_quantity: item.actual_stock ?? item.adjustment_qty,
                quantity: item.actual_stock ?? item.adjustment_qty,
                adjustment_qty: item.adjustment_qty,
                rate: item.rate,
                amount: item.amount,
                reason: item.reason || '',
                description: item.reason || '',
            }));
            dispatch(setStockAdjustmentItems(loadedItems));
            dispatch(setStockAdjustmentMode('viewing'));
            dispatch(setStockAdjustmentHasUnsavedChanges(false));
        } catch (err) {
            console.error('Failed to load stock adjustment:', err);
            toast.error(typeof err === 'string' ? err : 'Failed to load stock adjustment');
            dispatch(setStockAdjustmentMode('new'));
        } finally {
            dispatch(setStockAdjustmentLoading(false));
        }
    };

    useEffect(() => {
        if (activeSectionParams?.voucherId) {
            handleLoadVoucher(String(activeSectionParams.voucherId));
            dispatch(setActiveSectionWithParams({ section: 'stock_adjustment', params: undefined }));
        }
    }, [activeSectionParams?.voucherId]);

    const nav = useVoucherNavigation({
        voucherType: 'stock_adjustment',
        sliceState: state,
        actions: {
            setMode: setStockAdjustmentMode,
            setCurrentVoucherId: setStockAdjustmentCurrentVoucherId,
            setCurrentVoucherNo: setStockAdjustmentCurrentVoucherNo,
            setNavigationData: setStockAdjustmentNavigationData,
            setHasUnsavedChanges: setStockAdjustmentHasUnsavedChanges,
            resetForm: resetStockAdjustmentForm,
        },
        onLoadVoucher: handleLoadVoucher,
        onDelete: () => handleDelete(),
    });

    const handleSave = async (e?: React.FormEvent) => {
        e?.preventDefault();

        // Valid items are those with a selected product and a non-zero difference between actual and current stock
        const validItems = state.items.filter(i => {
            if (!i.product_id) return false;
            const actual = i.actual_stock ?? i.quantity ?? i.initial_quantity ?? 0;
            const current = i.current_stock !== undefined ? i.current_stock : (stockMap[i.product_id] ?? 0);
            const diff = i.adjustment_qty !== undefined ? i.adjustment_qty : (actual - current);
            return Math.abs(diff) > 0.0001;
        });

        if (validItems.length === 0) {
            toast.error('No stock difference found. Please update Actual Stock for the counted items.');
            return;
        }

        try {
            dispatch(setStockAdjustmentLoading(true));
            const payload = {
                voucher_date: state.form.voucher_date,
                narration: state.form.narration,
                items: validItems.map(item => {
                    const actual = item.actual_stock ?? item.quantity ?? item.initial_quantity ?? 0;
                    const current = item.current_stock !== undefined ? item.current_stock : (stockMap[item.product_id] ?? 0);
                    const diff = item.adjustment_qty !== undefined ? item.adjustment_qty : (actual - current);
                    return {
                        product_id: item.product_id,
                        unit_id: item.unit_id || null,
                        actual_stock: actual,
                        current_stock: current,
                        adjustment_qty: diff,
                        rate: item.rate,
                        amount: Math.abs(diff * item.rate),
                        reason: item.reason || item.description || null,
                    };
                }),
                user_id: user?.id,
            };

            if (state.mode === 'editing' && state.currentVoucherId) {
                await invoke('update_stock_adjustment', { id: state.currentVoucherId, data: payload });
                toast.success('Stock adjustment updated');
                await handleLoadVoucher(state.currentVoucherId);
            } else {
                const id = await invoke<string>('create_stock_adjustment', { data: payload });
                toast.success('Stock adjustment saved');
                await handleLoadVoucher(id);
            }
        } catch (err) {
            toast.error(typeof err === 'string' ? err : 'Failed to save stock adjustment');
        } finally {
            dispatch(setStockAdjustmentLoading(false));
        }
    };

    const handleDelete = async () => {
        const confirmed = await nav.handleDelete();
        if (confirmed && state.currentVoucherId) {
            try {
                dispatch(setStockAdjustmentLoading(true));
                await invoke('delete_stock_adjustment', { id: state.currentVoucherId });
                toast.success('Stock adjustment deleted');
                nav.handleNew();
            } catch (err) {
                toast.error('Failed to delete stock adjustment');
            } finally {
                dispatch(setStockAdjustmentLoading(false));
            }
        }
    };

    const handlePrint = () => {
        if (state.mode === 'new' || !state.currentVoucherId) {
            toast.error('Save the voucher before printing');
            return;
        }
        printVoucher({ voucherId: state.currentVoucherId, voucherType: 'stock_adjustment', filename: state.currentVoucherNo });
    };

    const handleAddItem = (insertAt?: number) => {
        dispatch(addStockAdjustmentItem({
            insertAt,
            product_id: '',
            product_name: '',
            initial_quantity: 0,
            quantity: 0,
            actual_stock: 0,
            current_stock: 0,
            adjustment_qty: 0,
            rate: 0,
            amount: 0,
            reason: '',
            description: '',
        }));
        dispatch(setStockAdjustmentHasUnsavedChanges(true));
    };

    useVoucherShortcuts({
        onSave: () => formRef.current?.requestSubmit(),
        onNewItem: () => handleAddItem(),
        onClear: nav.handleNew,
        onToggleShortcuts: () => setShowShortcuts(prev => !prev),
        onCloseShortcuts: () => setShowShortcuts(false),
        showShortcuts,
    });

    const handleProductCreate = (name: string, rowIndex: number) => {
        setNewProductName(name);
        setCreatingProductRowIndex(rowIndex);
        setShowCreateProduct(true);
    };

    const handleCreateProductSave = async () => {
        try {
            const [productsData, conversionsData] = await Promise.all([
                invoke<Product[]>('get_products'),
                invoke<ProductUnitConversion[]>('get_all_product_unit_conversions'),
            ]);
            setProducts(productsData);
            setProductUnitConversions(conversionsData);
            const nextUnitsByProduct = buildProductUnitMap(conversionsData);

            if (creatingProductRowIndex !== null && newProductName) {
                const created = productsData.find(p => p.name.toLowerCase() === newProductName.toLowerCase());
                if (created) {
                    const unitId = getDefaultProductUnitId(nextUnitsByProduct[created.id], 'report', created.unit_id);
                    const rate = getProductUnitRate(nextUnitsByProduct[created.id], unitId, 'purchase', created.purchase_rate);
                    const current = stockMap[created.id] ?? 0;
                    const actual = current;
                    dispatch(updateStockAdjustmentItem({
                        index: creatingProductRowIndex,
                        data: {
                            product_id: created.id,
                            product_name: created.name,
                            unit_id: unitId,
                            current_stock: current,
                            actual_stock: actual,
                            initial_quantity: actual,
                            quantity: actual,
                            adjustment_qty: 0,
                            rate,
                            amount: 0,
                        },
                    }));
                }
            }
        } catch { /* ignore */ }
        setShowCreateProduct(false);
        setCreatingProductRowIndex(null);
    };

    const handleUpdateRow = (index: number, field: string, value: any) => {
        const item = state.items[index];

        dispatch(updateStockAdjustmentItem({ index, data: { [field]: value } }));

        if (field === 'initial_quantity' || field === 'quantity' || field === 'actual_stock') {
            const actual = Number(value);
            const current = item?.current_stock !== undefined
                ? item.current_stock
                : (item?.product_id ? (stockMap[item.product_id] ?? 0) : 0);
            const diff = actual - current;
            const rate = item?.rate || 0;
            dispatch(updateStockAdjustmentItem({
                index,
                data: {
                    actual_stock: actual,
                    initial_quantity: actual,
                    quantity: actual,
                    current_stock: current,
                    adjustment_qty: diff,
                    amount: Math.abs(diff) * rate,
                },
            }));
        }

        if (field === 'rate') {
            const rate = Number(value);
            const actual = item?.actual_stock ?? item?.quantity ?? item?.initial_quantity ?? 0;
            const current = item?.current_stock !== undefined
                ? item.current_stock
                : (item?.product_id ? (stockMap[item.product_id] ?? 0) : 0);
            const diff = actual - current;
            dispatch(updateStockAdjustmentItem({
                index,
                data: {
                    rate,
                    amount: Math.abs(diff) * rate,
                },
            }));
        }

        if (field === 'product_id') {
            const product = products.find(p => p.id === value);
            if (product) {
                const current = stockMap[product.id] ?? 0;
                const unitId = getDefaultProductUnitId(productUnitsByProduct[product.id], 'report', product.unit_id);
                const rate = getProductUnitRate(productUnitsByProduct[product.id], unitId, 'purchase', product.purchase_rate);
                // Default actual stock to current stock (so diff is 0 until user counts & updates it)
                const actual = current;
                const diff = 0;
                dispatch(updateStockAdjustmentItem({
                    index,
                    data: {
                        product_id: product.id,
                        product_name: product.name,
                        unit_id: unitId,
                        current_stock: current,
                        actual_stock: actual,
                        initial_quantity: actual,
                        quantity: actual,
                        adjustment_qty: diff,
                        rate,
                        amount: 0,
                    },
                }));
            }
        }

        if (field === 'unit_id') {
            const product = products.find(p => p.id === item?.product_id);
            if (product) {
                const rate = getProductUnitRate(productUnitsByProduct[product.id], value, 'purchase', product.purchase_rate);
                const actual = item?.actual_stock ?? item?.quantity ?? item?.initial_quantity ?? 0;
                const current = item?.current_stock !== undefined
                    ? item.current_stock
                    : (item?.product_id ? (stockMap[item.product_id] ?? 0) : 0);
                const diff = actual - current;
                dispatch(updateStockAdjustmentItem({
                    index,
                    data: {
                        unit_id: value,
                        rate,
                        amount: Math.abs(diff) * rate,
                    },
                }));
            }
        }

        if (field === 'reason' || field === 'description') {
            dispatch(updateStockAdjustmentItem({
                index,
                data: {
                    reason: value,
                    description: value,
                },
            }));
        }

        dispatch(setStockAdjustmentHasUnsavedChanges(true));
    };

    const netIN = state.items.filter(i => (i.adjustment_qty ?? 0) > 0.0001).reduce((s, i) => s + Math.abs(i.amount || 0), 0);
    const netOUT = state.items.filter(i => (i.adjustment_qty ?? 0) < -0.0001).reduce((s, i) => s + Math.abs(i.amount || 0), 0);

    return (
        <div className="h-full flex flex-col bg-background">
            <VoucherPageHeader
                title="Stock Adjustment"
                description="Correct stock quantities from physical count or write-offs"
                mode={state.mode}
                voucherNo={state.currentVoucherNo}
                voucherDate={state.form.voucher_date}
                createdBy={state.created_by_name}
                isUnsaved={state.hasUnsavedChanges}
                nextVoucherNo={nav.nextVoucherNo}
                hasPrevious={state.mode === 'new' ? nav.hasLastVoucher : state.navigationData.hasPrevious}
                onNavigateToLast={nav.handleNavigateToLast}
                hasNext={state.navigationData.hasNext}
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
                loading={state.loading}
            />

            <VoucherShortcutPanel show={showShortcuts} />

            <VoucherListViewSheet
                open={showListView}
                onOpenChange={setShowListView}
                voucherType="stock_adjustment"
                onSelectVoucher={nav.handleListSelect}
            />

            <ProductDialog
                open={showCreateProduct}
                onOpenChange={setShowCreateProduct}
                units={units}
                groups={productGroups}
                onSuccess={handleCreateProductSave}
                masterProductsEnabled={masterProductsEnabled}
            />

            <div className="flex-1 min-h-0 overflow-auto">
                <form ref={formRef} onSubmit={handleSave} className="p-5 max-w-7xl mx-auto flex flex-col gap-4 min-h-full">

                    {/* Header Card */}
                    <div className="bg-card border rounded-lg p-3 shrink-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs font-medium">Voucher Date</Label>
                                <Input
                                    type="date"
                                    value={state.form.voucher_date}
                                    onChange={e => { dispatch(setStockAdjustmentDate(e.target.value)); dispatch(setStockAdjustmentHasUnsavedChanges(true)); }}
                                    disabled={isReadOnly}
                                    className="h-8"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-medium">Narration</Label>
                                <Input
                                    value={state.form.narration || ''}
                                    onChange={e => { dispatch(setStockAdjustmentNarration(e.target.value)); dispatch(setStockAdjustmentHasUnsavedChanges(true)); }}
                                    placeholder="Optional remarks..."
                                    disabled={isReadOnly}
                                    className="h-8"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Voucher Items Section (Using standard KolaBiz Combobox and grid UI) */}
                    <div className="bg-card border rounded-lg p-3 space-y-3 flex-1 min-h-0 flex flex-col">
                        <VoucherItemsSection
                            items={state.items}
                            products={masterProductsEnabled ? products.filter(p => (p as any).is_master !== 1) : products}
                            units={units}
                            productUnitsByProduct={productUnitsByProduct}
                            isReadOnly={isReadOnly}
                            settings={{ columns }}
                            onProductCreate={handleProductCreate}
                            onAddItem={handleAddItem}
                            onRemoveItem={(index) => {
                                dispatch(removeStockAdjustmentItem(index));
                                dispatch(setStockAdjustmentHasUnsavedChanges(true));
                            }}
                            onUpdateItem={handleUpdateRow}
                            getItemAmount={(item) => {
                                const actual = item.actual_stock ?? item.quantity ?? item.initial_quantity ?? 0;
                                const current = item.current_stock !== undefined
                                    ? item.current_stock
                                    : (item.product_id ? (stockMap[item.product_id] ?? 0) : 0);
                                const diff = item.adjustment_qty !== undefined ? item.adjustment_qty : (actual - current);
                                const amt = Math.abs(diff * (item.rate || 0));
                                return {
                                    finalQty: actual,
                                    amount: amt,
                                    taxAmount: 0,
                                    total: amt,
                                };
                            }}
                            addItemLabel="Add Item (Ctrl+N)"
                            defaultUnitKind="report"
                            onSectionExit={() => {
                                setTimeout(() => {
                                    document.getElementById('voucher-save-btn')?.focus();
                                }, 50);
                            }}
                        />
                    </div>

                    {/* Footer Summary Card */}
                    <div className="bg-card border rounded-lg p-3 shrink-0">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-md border bg-emerald-50/60 dark:bg-emerald-950/20 p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <IconArrowUp size={14} className="text-emerald-600" />
                                    Stock IN (Excess)
                                </div>
                                <div className="text-lg font-mono font-bold text-emerald-600">{money(netIN)}</div>
                            </div>
                            <div className="rounded-md border bg-destructive/5 dark:bg-destructive/10 p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <IconArrowDown size={14} className="text-destructive" />
                                    Stock OUT (Shortage)
                                </div>
                                <div className="text-lg font-mono font-bold text-destructive">{money(netOUT)}</div>
                            </div>
                            <div className="rounded-md border bg-muted/20 p-3">
                                <div className="text-xs text-muted-foreground mb-1">Total Adjustment Value</div>
                                <div className="text-lg font-mono font-bold">{money(state.totalAmount)}</div>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    {!isReadOnly && (
                        <div className="flex justify-end gap-2 pt-4 border-t shrink-0">
                            <Button type="button" variant="outline" onClick={nav.handleCancel} className="h-9">
                                <IconX size={16} />
                                Cancel
                            </Button>
                            <Button id="voucher-save-btn" type="submit" disabled={state.loading} className="h-9">
                                <IconCheck size={16} />
                                {state.loading ? 'Saving...' : state.mode === 'editing' ? 'Update' : 'Save'}
                            </Button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
