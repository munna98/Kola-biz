import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    addStockJournalDestinationItem,
    addStockJournalSourceItem,
    removeStockJournalDestinationItem,
    removeStockJournalSourceItem,
    resetStockJournalForm,
    RootState,
    setStockJournalCreatedByName,
    setStockJournalCurrentVoucherId,
    setStockJournalCurrentVoucherNo,
    setStockJournalDate,
    setStockJournalDestinationItems,
    setStockJournalHasUnsavedChanges,
    setStockJournalLoading,
    setStockJournalMode,
    setStockJournalNarration,
    setStockJournalNavigationData,
    setStockJournalSourceItems,
    setStockJournalTotals,
    updateStockJournalDestinationItem,
    updateStockJournalSourceItem,
} from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VoucherItemsSection, ColumnSettings } from '@/components/voucher/VoucherItemsSection';
import { VoucherListViewSheet } from '@/components/voucher/VoucherListViewSheet';
import { VoucherPageHeader } from '@/components/voucher/VoucherPageHeader';
import { VoucherShortcutPanel } from '@/components/voucher/VoucherShortcutPanel';
import { PrintPreviewDialog } from '@/components/dialogs/PrintPreviewDialog';
import ProductDialog from '@/components/dialogs/ProductDialog';
import { useVoucherNavigation } from '@/hooks/useVoucherNavigation';
import { useVoucherShortcuts } from '@/hooks/useVoucherShortcuts';
import { IconArrowDown, IconArrowUp, IconCheck, IconX } from '@tabler/icons-react';
import { Product, ProductGroup, ProductUnitConversion, Unit } from '@/lib/tauri';
import { buildProductUnitMap, getDefaultProductUnitId, getProductUnitRate } from '@/lib/product-units';

type JournalSection = 'source' | 'destination';

interface StockJournalItemRow {
    id?: string;
    product_id: string;
    product_name?: string;
    unit_id?: string;
    base_quantity?: number;
    description: string;
    initial_quantity: number;
    quantity: number;
    rate: number;
    amount: number;
}

export default function StockJournalPage() {
    const dispatch = useDispatch();
    const stockJournalState = useSelector((state: RootState) => state.stockJournal);
    const { user } = useSelector((state: RootState) => state.auth);

    const [products, setProducts] = useState<Product[]>([]);
    const [productUnitConversions, setProductUnitConversions] = useState<ProductUnitConversion[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showListView, setShowListView] = useState(false);
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [showCreateProduct, setShowCreateProduct] = useState(false);
    const [newProductName, setNewProductName] = useState('');
    const [creatingProductRowIndex, setCreatingProductRowIndex] = useState<number | null>(null);
    const [creatingProductSection, setCreatingProductSection] = useState<JournalSection>('source');

    const formRef = useRef<HTMLFormElement>(null);
    const productUnitsByProduct = useMemo(
        () => buildProductUnitMap(productUnitConversions),
        [productUnitConversions]
    );

    const isReadOnly = stockJournalState.mode === 'viewing';
    const columns: ColumnSettings[] = [
        { id: 'product', label: 'Product', visible: true, order: 0, width: '40%' },
        { id: 'quantity', label: 'Qty', visible: true, order: 1, width: '15%' },
        { id: 'unit', label: 'Unit', visible: true, order: 2, width: '10%' },
        { id: 'rate', label: 'Rate', visible: true, order: 3, width: '15%' },
        { id: 'total', label: 'Total', visible: true, order: 4, width: '15%' },
    ];

    useEffect(() => {
        const loadDependencies = async () => {
            try {
                const [productsData, unitsData, productUnitConversionsData, groupsData] = await Promise.all([
                    invoke<Product[]>('get_products'),
                    invoke<Unit[]>('get_units'),
                    invoke<ProductUnitConversion[]>('get_all_product_unit_conversions'),
                    invoke<ProductGroup[]>('get_product_groups'),
                ]);
                setProducts(productsData);
                setUnits(unitsData);
                setProductUnitConversions(productUnitConversionsData);
                setProductGroups(groupsData);
            } catch (error) {
                console.error('Failed to load dependencies:', error);
                toast.error('Failed to load products or units');
            }
        };

        loadDependencies();
    }, []);

    useEffect(() => {
        if (products.length > 0 && stockJournalState.mode === 'new') {
            if (stockJournalState.sourceItems.length === 0) {
                handleAddItem('source');
            }
            if (stockJournalState.destinationItems.length === 0) {
                handleAddItem('destination');
            }
        }
    }, [products.length, stockJournalState.mode]);

    const destinationSignature = useMemo(
        () => stockJournalState.destinationItems
            .map(item => `${item.product_id}|${item.unit_id || ''}|${item.quantity}`)
            .join('||'),
        [stockJournalState.destinationItems]
    );

    useEffect(() => {
        const sourceAmount = stockJournalState.sourceItems.reduce((sum, item) => sum + item.amount, 0);

        const weightedRows = stockJournalState.destinationItems.map(item => {
            const product = products.find(p => p.id === item.product_id);
            const baseRate = product
                ? getProductUnitRate(
                    productUnitsByProduct[product.id],
                    item.unit_id || getDefaultProductUnitId(productUnitsByProduct[product.id], 'report', product.unit_id),
                    'purchase',
                    product.purchase_rate
                )
                : 0;
            return {
                ...item,
                weight: Math.max(0, item.quantity) * Math.max(0, baseRate),
            };
        });

        let totalWeight = weightedRows.reduce((sum, item) => sum + item.weight, 0);
        if (totalWeight <= 0) {
            totalWeight = weightedRows.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
        }

        const nextDestinationItems = weightedRows.map((item, index) => {
            const fallbackWeight = totalWeight > 0 && item.weight <= 0 ? Math.max(0, item.quantity) : item.weight;
            const effectiveWeight = totalWeight > 0 ? fallbackWeight : 0;
            const amount = totalWeight > 0
                ? (index === weightedRows.length - 1
                    ? sourceAmount - weightedRows
                        .slice(0, index)
                        .reduce((sum, row) => sum + (sourceAmount * (((totalWeight > 0 && row.weight <= 0 ? Math.max(0, row.quantity) : row.weight)) / totalWeight)), 0)
                    : sourceAmount * (effectiveWeight / totalWeight))
                : 0;
            const rate = item.quantity > 0 ? amount / item.quantity : 0;

            return {
                ...item,
                rate,
                amount,
            };
        });

        const changed = nextDestinationItems.some((item, index) => {
            const current = stockJournalState.destinationItems[index];
            return current && (
                Math.abs((current.rate || 0) - item.rate) > 0.0001 ||
                Math.abs((current.amount || 0) - item.amount) > 0.0001
            );
        });

        if (changed) {
            dispatch(setStockJournalDestinationItems(nextDestinationItems));
        }

        const destinationAmount = nextDestinationItems.reduce((sum, item) => sum + item.amount, 0);
        dispatch(setStockJournalTotals({
            sourceAmount,
            destinationAmount,
            difference: destinationAmount - sourceAmount,
        }));
    }, [stockJournalState.sourceItems, destinationSignature, products, productUnitsByProduct, dispatch]);

    const handleLoadVoucher = async (id: string) => {
        try {
            dispatch(setStockJournalLoading(true));
            const voucher: any = await invoke('get_stock_journal', { id });
            const items: any[] = await invoke('get_stock_journal_items', { voucherId: id });

            dispatch(resetStockJournalForm());
            dispatch(setStockJournalCurrentVoucherId(voucher.id));
            dispatch(setStockJournalCurrentVoucherNo(voucher.voucher_no));
            dispatch(setStockJournalDate(voucher.voucher_date));
            dispatch(setStockJournalNarration(voucher.narration || ''));
            dispatch(setStockJournalCreatedByName(voucher.created_by_name));

            const sourceItems = items
                .filter(item => item.entry_type === 'source')
                .map(item => ({
                    id: item.id,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    unit_id: item.unit_id,
                    description: item.description || '',
                    initial_quantity: item.quantity,
                    quantity: item.quantity,
                    rate: item.rate,
                    amount: item.amount,
                }));

            const destinationItems = items
                .filter(item => item.entry_type === 'destination')
                .map(item => ({
                    id: item.id,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    unit_id: item.unit_id,
                    description: item.description || '',
                    initial_quantity: item.quantity,
                    quantity: item.quantity,
                    rate: item.rate,
                    amount: item.amount,
                }));

            dispatch(setStockJournalSourceItems(sourceItems));
            dispatch(setStockJournalDestinationItems(destinationItems));
            dispatch(setStockJournalMode('viewing'));
            dispatch(setStockJournalHasUnsavedChanges(false));
        } catch (error) {
            console.error('Failed to load stock journal:', error);
            toast.error('Failed to load stock journal');
            dispatch(setStockJournalMode('new'));
        } finally {
            dispatch(setStockJournalLoading(false));
        }
    };

    const nav = useVoucherNavigation({
        voucherType: 'stock_journal',
        sliceState: stockJournalState,
        actions: {
            setMode: setStockJournalMode,
            setCurrentVoucherId: setStockJournalCurrentVoucherId,
            setCurrentVoucherNo: setStockJournalCurrentVoucherNo,
            setNavigationData: setStockJournalNavigationData,
            setHasUnsavedChanges: setStockJournalHasUnsavedChanges,
            resetForm: resetStockJournalForm,
        },
        onLoadVoucher: handleLoadVoucher,
    });

    const handleSave = async (e?: React.FormEvent) => {
        e?.preventDefault();

        if (stockJournalState.sourceItems.length === 0) {
            toast.error('Please add at least one source item');
            return;
        }

        if (stockJournalState.destinationItems.length === 0) {
            toast.error('Please add at least one destination item');
            return;
        }

        if (stockJournalState.destinationItems.some(item => !item.product_id || item.quantity <= 0)) {
            toast.error('Each destination row needs a product and quantity');
            return;
        }

        try {
            dispatch(setStockJournalLoading(true));

            const data = {
                voucher_date: stockJournalState.form.voucher_date,
                narration: stockJournalState.form.narration,
                source_items: stockJournalState.sourceItems.map(item => ({
                    product_id: item.product_id,
                    unit_id: item.unit_id || null,
                    description: item.description,
                    quantity: item.quantity,
                    rate: item.rate,
                    amount: item.amount,
                })),
                destination_items: stockJournalState.destinationItems.map(item => ({
                    product_id: item.product_id,
                    unit_id: item.unit_id || null,
                    description: item.description,
                    quantity: item.quantity,
                    rate: item.rate,
                    amount: item.amount,
                })),
                user_id: user?.id,
            };

            if (stockJournalState.mode === 'editing' && stockJournalState.currentVoucherId) {
                await invoke('update_stock_journal', {
                    id: stockJournalState.currentVoucherId,
                    data,
                });
                toast.success('Stock journal updated successfully');
                await handleLoadVoucher(stockJournalState.currentVoucherId);
            } else {
                const id = await invoke<string>('create_stock_journal', { data });
                toast.success('Stock journal created successfully');
                await handleLoadVoucher(id);
            }
        } catch (error) {
            console.error('Failed to save stock journal:', error);
            toast.error(typeof error === 'string' ? error : 'Failed to save stock journal');
        } finally {
            dispatch(setStockJournalLoading(false));
        }
    };

    const handleDelete = async () => {
        const confirmed = await nav.handleDelete();
        if (confirmed && stockJournalState.currentVoucherId) {
            try {
                dispatch(setStockJournalLoading(true));
                await invoke('delete_stock_journal', { id: stockJournalState.currentVoucherId });
                toast.success('Stock journal deleted successfully');
                nav.handleNew();
            } catch (error) {
                console.error('Failed to delete stock journal:', error);
                toast.error('Failed to delete stock journal');
            } finally {
                dispatch(setStockJournalLoading(false));
            }
        }
    };

    const handlePrint = () => {
        if (stockJournalState.mode === 'new' || !stockJournalState.currentVoucherId) {
            toast.error('Please save the voucher before printing');
            return;
        }
        setShowPrintPreview(true);
    };

    const handleAddItem = (section: JournalSection) => {
        const payload: StockJournalItemRow = {
            product_id: '',
            product_name: '',
            description: '',
            initial_quantity: 0,
            quantity: 0,
            rate: 0,
            amount: 0,
        };

        if (section === 'source') {
            dispatch(addStockJournalSourceItem(payload));
        } else {
            dispatch(addStockJournalDestinationItem(payload));
        }
        dispatch(setStockJournalHasUnsavedChanges(true));
    };

    useVoucherShortcuts({
        onSave: () => formRef.current?.requestSubmit(),
        onNewItem: () => handleAddItem('source'),
        onClear: nav.handleNew,
        onToggleShortcuts: () => setShowShortcuts(prev => !prev),
        onCloseShortcuts: () => setShowShortcuts(false),
        showShortcuts,
    });

    const handleProductCreate = (section: JournalSection, name: string, rowIndex: number) => {
        setNewProductName(name);
        setCreatingProductSection(section);
        setCreatingProductRowIndex(rowIndex);
        setShowCreateProduct(true);
    };

    const handleCreateProductSave = async () => {
        try {
            const [productsData, productUnitConversionsData] = await Promise.all([
                invoke<Product[]>('get_products'),
                invoke<ProductUnitConversion[]>('get_all_product_unit_conversions'),
            ]);
            const nextUnitsByProduct = buildProductUnitMap(productUnitConversionsData);
            setProducts(productsData);
            setProductUnitConversions(productUnitConversionsData);

            if (creatingProductRowIndex !== null && newProductName) {
                const createdProduct = productsData.find(
                    p => p.name.toLowerCase() === newProductName.toLowerCase()
                );

                if (createdProduct) {
                    const unitId = getDefaultProductUnitId(
                        nextUnitsByProduct[createdProduct.id],
                        'report',
                        createdProduct.unit_id
                    );
                    const rate = getProductUnitRate(
                        nextUnitsByProduct[createdProduct.id],
                        unitId,
                        'purchase',
                        createdProduct.purchase_rate
                    );
                    const targetItems = creatingProductSection === 'source'
                        ? stockJournalState.sourceItems
                        : stockJournalState.destinationItems;
                    const quantity = targetItems[creatingProductRowIndex]?.quantity || 0;

                    if (creatingProductSection === 'source') {
                        dispatch(updateStockJournalSourceItem({
                            index: creatingProductRowIndex,
                            data: {
                                product_id: createdProduct.id,
                                product_name: createdProduct.name,
                                unit_id: unitId,
                                rate,
                                amount: quantity * rate,
                            },
                        }));
                    } else {
                        dispatch(updateStockJournalDestinationItem({
                            index: creatingProductRowIndex,
                            data: {
                                product_id: createdProduct.id,
                                product_name: createdProduct.name,
                                unit_id: unitId,
                                rate,
                                amount: quantity * rate,
                            },
                        }));
                    }
                }
            }
        } catch (error) {
            console.error('Failed to refresh products', error);
        }

        setShowCreateProduct(false);
        setCreatingProductRowIndex(null);
    };

    const updateRow = (section: JournalSection, index: number, field: string, value: any) => {
        const items = section === 'source' ? stockJournalState.sourceItems : stockJournalState.destinationItems;
        const item = items[index];

        if (section === 'source') {
            dispatch(updateStockJournalSourceItem({ index, data: { [field]: value } }));

            if (field === 'initial_quantity') {
                dispatch(updateStockJournalSourceItem({
                    index,
                    data: { quantity: Number(value) },
                }));
            }

            if (field === 'initial_quantity' || field === 'quantity' || field === 'rate') {
                const quantity = field === 'rate' ? item.quantity : Number(value);
                const rate = field === 'rate' ? Number(value) : item.rate;
                dispatch(updateStockJournalSourceItem({
                    index,
                    data: { amount: quantity * rate },
                }));
            }
        } else {
            dispatch(updateStockJournalDestinationItem({ index, data: { [field]: value } }));

            if (field === 'initial_quantity') {
                dispatch(updateStockJournalDestinationItem({
                    index,
                    data: { quantity: Number(value) },
                }));
            }
        }

        if (field === 'product_id') {
            const product = products.find(p => p.id === value);
            if (product) {
                const unitId = getDefaultProductUnitId(
                    productUnitsByProduct[product.id],
                    'report',
                    product.unit_id
                );
                const rate = getProductUnitRate(
                    productUnitsByProduct[product.id],
                    unitId,
                    'purchase',
                    product.purchase_rate
                );

                if (section === 'source') {
                    dispatch(updateStockJournalSourceItem({
                        index,
                        data: {
                            product_name: product.name,
                            unit_id: unitId,
                            rate,
                            amount: item.quantity * rate,
                        },
                    }));
                } else {
                    dispatch(updateStockJournalDestinationItem({
                        index,
                        data: {
                            product_name: product.name,
                            unit_id: unitId,
                        },
                    }));
                }
            }
        }

        if (field === 'unit_id') {
            const product = products.find(p => p.id === item.product_id);
            if (product && section === 'source') {
                const rate = getProductUnitRate(
                    productUnitsByProduct[product.id],
                    value,
                    'purchase',
                    product.purchase_rate
                );
                dispatch(updateStockJournalSourceItem({
                    index,
                    data: {
                        rate,
                        amount: item.quantity * rate,
                    },
                }));
            }
        }

        dispatch(setStockJournalHasUnsavedChanges(true));
    };

    const renderSection = (section: JournalSection, title: string, items: StockJournalItemRow[]) => {
        const removeAction = section === 'source' ? removeStockJournalSourceItem : removeStockJournalDestinationItem;

        return (
            <div className="bg-card border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">{title}</h2>
                    <div className="text-sm font-mono font-medium">
                        ₹ {items.reduce((sum, item) => sum + item.amount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>

                <VoucherItemsSection
                    items={items}
                    products={products}
                    units={units}
                    productUnitsByProduct={productUnitsByProduct}
                    isReadOnly={isReadOnly}
                    settings={{ columns }}
                    defaultUnitKind="report"
                    addItemLabel={section === 'source' ? 'Add Source Item' : 'Add Destination Item'}
                    onProductCreate={(name, rowIndex) => handleProductCreate(section, name, rowIndex)}
                    onAddItem={() => handleAddItem(section)}
                    onRemoveItem={(index) => {
                        dispatch(removeAction(index));
                        dispatch(setStockJournalHasUnsavedChanges(true));
                    }}
                    onUpdateItem={(index, field, value) => updateRow(section, index, field, value)}
                    getItemAmount={(item) => ({
                        finalQty: item.quantity,
                        amount: item.amount,
                        taxAmount: 0,
                        total: item.amount,
                    })}
                    onSectionExit={() => {
                        setTimeout(() => {
                            document.getElementById('voucher-save-btn')?.focus();
                        }, 50);
                    }}
                />
            </div>
        );
    };

    return (
        <div className="h-full flex flex-col bg-background">
            <VoucherPageHeader
                title="Stock Journal"
                description="Convert source stock into destination products"
                mode={stockJournalState.mode}
                voucherNo={stockJournalState.currentVoucherNo}
                voucherDate={stockJournalState.form.voucher_date}
                createdBy={stockJournalState.created_by_name}
                isUnsaved={stockJournalState.hasUnsavedChanges}
                hasPrevious={stockJournalState.navigationData.hasPrevious}
                hasNext={stockJournalState.navigationData.hasNext}
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
                loading={stockJournalState.loading}
            />

            <VoucherShortcutPanel show={showShortcuts} />

            <VoucherListViewSheet
                open={showListView}
                onOpenChange={setShowListView}
                voucherType="stock_journal"
                onSelectVoucher={nav.handleListSelect}
            />

            <PrintPreviewDialog
                open={showPrintPreview}
                onOpenChange={setShowPrintPreview}
                voucherId={stockJournalState.currentVoucherId || undefined}
                voucherType="stock_journal"
                title={stockJournalState.currentVoucherNo ? `Print Stock Journal - ${stockJournalState.currentVoucherNo}` : 'Print Stock Journal'}
            />

            <ProductDialog
                open={showCreateProduct}
                onOpenChange={setShowCreateProduct}
                units={units}
                groups={productGroups}
                onSuccess={handleCreateProductSave}
            />

            <div className="flex-1 overflow-hidden">
                <form ref={formRef} onSubmit={handleSave} className="h-full p-5 max-w-7xl mx-auto flex flex-col gap-4">
                    <div className="bg-card border rounded-lg p-3 space-y-3 shrink-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs font-medium mb-1 block">Voucher Date</Label>
                                <Input
                                    type="date"
                                    value={stockJournalState.form.voucher_date}
                                    onChange={(e) => {
                                        dispatch(setStockJournalDate(e.target.value));
                                        dispatch(setStockJournalHasUnsavedChanges(true));
                                    }}
                                    disabled={isReadOnly}
                                    className="h-8"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-medium mb-1 block">Narration</Label>
                                <Input
                                    value={stockJournalState.form.narration || ''}
                                    onChange={(e) => {
                                        dispatch(setStockJournalNarration(e.target.value));
                                        dispatch(setStockJournalHasUnsavedChanges(true));
                                    }}
                                    placeholder="Optional remarks..."
                                    disabled={isReadOnly}
                                    className="h-8"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-auto pr-1 space-y-4">
                        {renderSection('source', 'Source Products', stockJournalState.sourceItems)}
                        {renderSection('destination', 'Destination Products', stockJournalState.destinationItems)}
                    </div>

                    <div className="bg-card border rounded-lg p-3 shrink-0">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="rounded-md border bg-muted/20 p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <IconArrowUp size={14} />
                                    Issue Value
                                </div>
                                <div className="text-lg font-mono font-bold">
                                    ₹ {stockJournalState.totals.sourceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className="rounded-md border bg-muted/20 p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <IconArrowDown size={14} />
                                    Receipt Value
                                </div>
                                <div className="text-lg font-mono font-bold">
                                    ₹ {stockJournalState.totals.destinationAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className={`rounded-md border p-3 ${Math.abs(stockJournalState.totals.difference) > 0.01 ? 'border-destructive/50 bg-destructive/5' : 'bg-emerald-50/60 dark:bg-emerald-950/20'}`}>
                                <div className="text-xs text-muted-foreground mb-1">Difference</div>
                                <div className="text-lg font-mono font-bold">
                                    ₹ {stockJournalState.totals.difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>
                    </div>

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
                                id="voucher-save-btn"
                                type="submit"
                                disabled={stockJournalState.loading}
                                className="h-9"
                                title="Save (Ctrl+S)"
                            >
                                <IconCheck size={16} />
                                {stockJournalState.loading ? 'Saving...' : (stockJournalState.mode === 'editing' ? 'Update' : 'Save')}
                            </Button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
