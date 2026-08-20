import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Combobox } from "@/components/ui/combobox";
import { useVoucherRowNavigation } from '@/hooks/useVoucherRowNavigation';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    IconPlus, IconEdit, IconTrash, IconCheck,
    IconScissors, IconPackage, IconShoppingBag, IconTools,
    IconRefresh, IconCurrencyRupee, IconEye, IconClock,
    IconChevronLeft, IconChevronRight, IconList, IconDeviceFloppy,
    IconX, IconFileInvoice, IconCash,
} from "@tabler/icons-react";
import PaymentManagementDialog from '@/components/dialogs/PaymentManagementDialog';
import CustomerDialog from '@/components/dialogs/CustomerDialog';
import { useSelector } from "react-redux";
import { RootState } from "../store";

interface CustomOrder {
    id: string; order_no: string; order_date: string; delivery_date?: string;
    customer_id: string; customer_name: string; status: string;
    finished_item_name: string; finished_item_qty: number; finished_item_unit?: string;
    sale_price: number; advance_amount: number; advance_voucher_id?: string;
    total_material_cost: number; total_purchase_cost: number; total_service_cost: number;
    total_job_cost: number; final_invoice_id?: string; final_invoice_no?: string;
    reference?: string;
    payment_status: string; total_paid: number; balance_due: number;
    narration?: string; created_at: string;
}
interface CustomOrderDetail { order: CustomOrder; materials: MaterialRow[]; purchases: PurchaseRow[]; services: ServiceRow[]; }
interface MaterialRow { id?: string; product_id: string; product_name?: string; product_code?: string; description?: string; quantity: number; unit_id?: string; unit_name?: string; rate: number; amount: number; }
interface PurchaseRow { id?: string; description: string; supplier_id?: string; supplier_name?: string; quantity: number; unit_id?: string; rate: number; amount: number; expense_account?: string; purchase_date?: string; }
interface ServiceRow { id?: string; service_id?: string; description: string; quantity: number; rate: number; amount: number; expense_account?: string; }
interface Product { id: string; code: string; name: string; purchase_rate: number; unit_id: string; unit_name?: string; }
interface PartyOption { id: string; name: string; code?: string; }
interface CashBankAccount { id: string; name: string; account_name?: string; account_group?: string; }
type PageMode = 'list' | 'new' | 'editing' | 'viewing';

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const today = () => new Date().toISOString().slice(0, 10);
const emptyMaterial = (): MaterialRow => ({ product_id: '', quantity: 1, rate: 0, amount: 0 });
const emptyPurchase = (): PurchaseRow => ({ description: '', supplier_id: '', quantity: 1, rate: 0, amount: 0 });
const emptyService = (): ServiceRow => ({ description: '', quantity: 1, rate: 0, amount: 0 });

export default function CustomOrdersPage() {
    const { user } = useSelector((state: RootState) => state.auth);
    const { activeSectionParams } = useSelector((state: RootState) => state.app);

    const [mode, setMode] = useState<PageMode>('list');
    const [currentOrder, setCurrentOrder] = useState<CustomOrder | null>(null);
    const [currentDetail, setCurrentDetail] = useState<CustomOrderDetail | null>(null);
    const [hasPrevious, setHasPrevious] = useState(false);
    const [hasNext, setHasNext] = useState(false);
    const [previousId, setPreviousId] = useState<string | null>(null);
    const [nextId, setNextId] = useState<string | null>(null);
    const [nextOrderNo, setNextOrderNo] = useState<string | undefined>(undefined);
    const [hasLastOrder, setHasLastOrder] = useState(false);
    const [lastOrderId, setLastOrderId] = useState<string | null>(null);
    const [orders, setOrders] = useState<CustomOrder[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<PartyOption[]>([]);
    const [suppliers, setSuppliers] = useState<PartyOption[]>([]);
    const [cashBankAccounts, setCashBankAccounts] = useState<CashBankAccount[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [activeTab, setActiveTab] = useState('details');
    const [orderDate, setOrderDate] = useState(today());
    const [deliveryDate, setDeliveryDate] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [reference, setReference] = useState('');
    const [finishedItemName, setFinishedItemName] = useState('');
    const [finishedItemQty, setFinishedItemQty] = useState(1);
    const [finishedItemRate, setFinishedItemRate] = useState<number>(0);
    const [salePrice, setSalePrice] = useState(0);
    const [narration, setNarration] = useState('');
    const [materials, setMaterials] = useState<MaterialRow[]>([emptyMaterial()]);
    const [purchases, setPurchases] = useState<PurchaseRow[]>([emptyPurchase()]);
    const [services, setServices] = useState<ServiceRow[]>([emptyService()]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleteOrderNo, setDeleteOrderNo] = useState('');
    const [advanceOrder, setAdvanceOrder] = useState<CustomOrder | null>(null);
    const [advanceAmount, setAdvanceAmount] = useState('');
    const [advanceDate, setAdvanceDate] = useState(today());
    const [advanceCashBank, setAdvanceCashBank] = useState('');
    const [advanceNarration, setAdvanceNarration] = useState('');
    const [savingAdvance, setSavingAdvance] = useState(false);
    const [finalizeOrder, setFinalizeOrder] = useState<CustomOrder | null>(null);
    const [finalizeDate, setFinalizeDate] = useState(today());
    const [finalizeSalePrice, setFinalizeSalePrice] = useState(0);
    const [finalizeNarration, setFinalizeNarration] = useState('');
    const [finalizing, setFinalizing] = useState(false);
    const [paymentInvoice, setPaymentInvoice] = useState<{ id: string; no: string; amount: number; date: string; partyName: string; } | null>(null);
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');

    const matTotal = materials.filter(m => m.product_id).reduce((s, m) => s + m.amount, 0);
    const purTotal = purchases.filter(p => p.description).reduce((s, p) => s + p.amount, 0);
    const svcTotal = services.filter(s => s.description).reduce((s, sv) => s + sv.amount, 0);
    const jobTotal = matTotal + purTotal + svcTotal;
    const margin = salePrice - jobTotal;

    const orderDateRef = useRef<HTMLInputElement>(null);
    const deliveryDateRef = useRef<HTMLInputElement>(null);
    const referenceRef = useRef<HTMLInputElement>(null);
    const finishedItemNameRef = useRef<HTMLInputElement>(null);
    const finishedItemQtyRef = useRef<HTMLInputElement>(null);
    const finishedItemRateRef = useRef<HTMLInputElement>(null);
    const salePriceRef = useRef<HTMLInputElement>(null);
    const narrationRef = useRef<HTMLTextAreaElement>(null);

    const addMaterial = (index?: number) => {
        setMaterials(prev => {
            if (typeof index === 'number') {
                const next = [...prev];
                next.splice(index, 0, emptyMaterial());
                return next;
            }
            return [...prev, emptyMaterial()];
        });
        setHasUnsavedChanges(true);
    };

    const removeMaterial = (index: number) => {
        setMaterials(prev => (prev.length > 1 ? prev.filter((_, j) => j !== index) : [emptyMaterial()]));
        setHasUnsavedChanges(true);
    };

    const { handleRowKeyDown: handleMaterialKeyDown } = useVoucherRowNavigation({
        onRemoveItem: removeMaterial,
        onAddItem: () => addMaterial(),
    });

    const addPurchase = (index?: number) => {
        setPurchases(prev => {
            if (typeof index === 'number') {
                const next = [...prev];
                next.splice(index, 0, emptyPurchase());
                return next;
            }
            return [...prev, emptyPurchase()];
        });
        setHasUnsavedChanges(true);
    };

    const removePurchase = (index: number) => {
        setPurchases(prev => (prev.length > 1 ? prev.filter((_, j) => j !== index) : [emptyPurchase()]));
        setHasUnsavedChanges(true);
    };

    const { handleRowKeyDown: handlePurchaseKeyDown } = useVoucherRowNavigation({
        onRemoveItem: removePurchase,
        onAddItem: () => addPurchase(),
    });

    const addService = (index?: number) => {
        setServices(prev => {
            if (typeof index === 'number') {
                const next = [...prev];
                next.splice(index, 0, emptyService());
                return next;
            }
            return [...prev, emptyService()];
        });
        setHasUnsavedChanges(true);
    };

    const removeService = (index: number) => {
        setServices(prev => (prev.length > 1 ? prev.filter((_, j) => j !== index) : [emptyService()]));
        setHasUnsavedChanges(true);
    };

    const { handleRowKeyDown: handleServiceKeyDown } = useVoucherRowNavigation({
        onRemoveItem: removeService,
        onAddItem: () => addService(),
    });

    const loadOrders = useCallback(async () => {
        setLoading(true);
        try {
            const status = filterStatus === 'all' ? null : filterStatus;
            const data = await invoke<CustomOrder[]>('list_custom_orders', { status, customerId: null, fromDate: null, toDate: null });
            setOrders(data);
        } catch (err) { toast.error(String(err)); }
        finally { setLoading(false); }
    }, [filterStatus]);

    useEffect(() => { loadOrders(); }, [loadOrders]);

    const fetchNewModeData = useCallback(async () => {
        try {
            const [previewNo, lastId] = await Promise.all([
                invoke<string>('get_next_voucher_number_preview', { voucherType: 'custom_order' }),
                invoke<string | null>('get_last_voucher_id', { voucherType: 'custom_order' }),
            ]);
            setNextOrderNo(previewNo); setLastOrderId(lastId); setHasLastOrder(lastId !== null);
        } catch { /**/ }
    }, []);

    const checkNavigation = useCallback(async (id: string) => {
        try {
            const [prevId, nxtId] = await Promise.all([
                invoke<string | null>('get_previous_voucher_id', { voucherType: 'custom_order', currentId: id }),
                invoke<string | null>('get_next_voucher_id', { voucherType: 'custom_order', currentId: id }),
            ]);
            setHasPrevious(prevId !== null); setHasNext(nxtId !== null); setPreviousId(prevId); setNextId(nxtId);
        } catch { /**/ }
    }, []);

    const loadReferenceData = useCallback(async () => {
        try {
            const prodData = await invoke<any[]>('get_products');
            setProducts(prodData.map((p: any) => ({ id: p.id, code: p.code || '', name: p.name || '', purchase_rate: Number(p.purchase_rate) || 0, unit_id: p.unit_id || '' })));
        } catch (e) { console.error('products', e); }
        try {
            const list: PartyOption[] = []; const seenCodes = new Set<string>();
            const accounts = await invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable'] }).catch(() => []);
            if (Array.isArray(accounts) && accounts.length > 0) {
                accounts.forEach((acc: any) => { const key = acc.account_code || acc.account_name || acc.id; if (!seenCodes.has(key)) { seenCodes.add(key); list.push({ id: acc.id, name: acc.account_name || acc.name || 'Unnamed', code: acc.account_code || '' }); } });
            } else {
                const custs = await invoke<any[]>('get_customers').catch(() => []);
                custs.forEach((c: any) => { const key = c.code || c.name || c.id; if (!seenCodes.has(key)) { seenCodes.add(key); list.push({ id: c.id, name: c.name || 'Unnamed', code: c.code || '' }); } });
            }
            setCustomers(list);
        } catch (e) { console.error('customers', e); }
        try {
            const suppList: PartyOption[] = []; const seenSupp = new Set<string>();
            const accounts = await invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Payable'] }).catch(() => []);
            if (Array.isArray(accounts) && accounts.length > 0) {
                accounts.forEach((acc: any) => { const key = acc.account_code || acc.account_name || acc.id; if (!seenSupp.has(key)) { seenSupp.add(key); suppList.push({ id: acc.id, name: acc.account_name || acc.name || 'Unnamed', code: acc.account_code || '' }); } });
            } else {
                const supps = await invoke<any[]>('get_suppliers').catch(() => []);
                supps.forEach((s: any) => { const key = s.code || s.name || s.id; if (!seenSupp.has(key)) { seenSupp.add(key); suppList.push({ id: s.id, name: s.name || 'Unnamed', code: s.code || '' }); } });
            }
            setSuppliers(suppList);
        } catch (e) { console.error('suppliers', e); }
        try {
            const cb = await invoke<any[]>('get_cash_bank_accounts').catch(() => []);
            const mappedCb: CashBankAccount[] = (cb || []).map((a: any) => ({ id: a.id, name: a.name || a.account_name || 'Cash', account_group: a.account_group || '' }));
            setCashBankAccounts(mappedCb);
            if (mappedCb.length > 0) setAdvanceCashBank(mappedCb[0].id);
        } catch (e) { console.error('cash/bank', e); }
    }, []);

    const handleCreateCustomerSave = async (newCustomer?: any) => {
        try {
            await loadReferenceData();
            if (newCustomer) {
                const accounts = await invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable'] }).catch(() => []);
                const found = accounts.find((acc: any) => acc.account_name === newCustomer.name || acc.name === newCustomer.name);
                if (found) {
                    setCustomerId(found.id);
                } else if (newCustomer.id) {
                    setCustomerId(newCustomer.id);
                }
                setHasUnsavedChanges(true);
            }
        } catch (e) {
            console.error("Failed to refresh parties after create", e);
        }
        setShowCreateCustomer(false);
    };

    useEffect(() => { loadReferenceData(); }, [loadReferenceData]);

    useEffect(() => {
        if (activeSectionParams?.orderId) {
            invoke<CustomOrderDetail>('get_custom_order', { id: activeSectionParams.orderId })
                .then(async detail => { setCurrentOrder(detail.order); setCurrentDetail(detail); setMode('viewing'); await checkNavigation(detail.order.id); })
                .catch(err => console.error('order from params:', err));
        }
    }, [activeSectionParams, checkNavigation]);

    const resetForm = () => {
        setOrderDate(today()); setDeliveryDate(''); setCustomerId(''); setReference(''); setFinishedItemName('');
        setFinishedItemQty(1); setFinishedItemRate(0); setSalePrice(0); setNarration('');
        setMaterials([emptyMaterial()]); setPurchases([emptyPurchase()]); setServices([emptyService()]);
        setActiveTab('details'); setHasUnsavedChanges(false);
    };

    const populateFormFromOrder = (order: CustomOrder, detail: CustomOrderDetail) => {
        setOrderDate(order.order_date); setDeliveryDate(order.delivery_date || ''); setCustomerId(order.customer_id);
        setReference(order.reference || '');
        setFinishedItemName(order.finished_item_name); setFinishedItemQty(order.finished_item_qty || 1);
        const r = (order.finished_item_qty && order.finished_item_qty > 0)
            ? Math.round((order.sale_price / order.finished_item_qty) * 100) / 100
            : order.sale_price;
        setFinishedItemRate(r);
        setSalePrice(order.sale_price); setNarration(order.narration || '');
        setMaterials(detail.materials.length ? detail.materials : [emptyMaterial()]);
        setPurchases(detail.purchases.length ? detail.purchases : [emptyPurchase()]);
        setServices(detail.services.length ? detail.services : [emptyService()]);
        setActiveTab('details'); setHasUnsavedChanges(false);
    };

    const openNew = async () => {
        resetForm(); setCurrentOrder(null); setCurrentDetail(null); setMode('new');
        setHasPrevious(false); setHasNext(false); setPreviousId(null); setNextId(null);
        await fetchNewModeData();
    };

    const openViewOrder = async (order: CustomOrder) => {
        try {
            const detail = await invoke<CustomOrderDetail>('get_custom_order', { id: order.id });
            setCurrentOrder(detail.order); setCurrentDetail(detail); setMode('viewing'); await checkNavigation(order.id);
        } catch (err) { toast.error(String(err)); }
    };

    const openEditFromView = () => {
        if (!currentOrder || !currentDetail) return;
        if (currentOrder.status === 'delivered') { toast.error('Delivered orders cannot be edited'); return; }
        populateFormFromOrder(currentOrder, currentDetail); setMode('editing');
    };

    const handleCancelEdit = () => {
        if (currentOrder && currentDetail) { setMode('viewing'); setHasUnsavedChanges(false); }
        else { setMode('list'); }
    };

    const handleNavigatePrevious = async () => {
        if (mode === 'new' && hasLastOrder && lastOrderId) {
            try { const d = await invoke<CustomOrderDetail>('get_custom_order', { id: lastOrderId }); setCurrentOrder(d.order); setCurrentDetail(d); setMode('viewing'); await checkNavigation(d.order.id); } catch { /**/ } return;
        }
        if (previousId) { try { const d = await invoke<CustomOrderDetail>('get_custom_order', { id: previousId }); setCurrentOrder(d.order); setCurrentDetail(d); setMode('viewing'); await checkNavigation(d.order.id); } catch { /**/ } }
    };

    const handleNavigateNext = async () => {
        if (nextId) { try { const d = await invoke<CustomOrderDetail>('get_custom_order', { id: nextId }); setCurrentOrder(d.order); setCurrentDetail(d); setMode('viewing'); await checkNavigation(d.order.id); } catch { /**/ } }
        else if (mode === 'viewing') { await openNew(); }
    };

    const updateMaterial = (i: number, field: keyof MaterialRow, value: any) => {
        setMaterials(prev => {
            const rows = [...prev]; const numF: (keyof MaterialRow)[] = ['quantity','rate','amount'];
            const val = numF.includes(field) ? (Number(value)||0) : value;
            rows[i] = { ...rows[i], [field]: val };
            if (field==='quantity'||field==='rate') { const q=field==='quantity'?Number(value)||0:Number(rows[i].quantity)||0; const r=field==='rate'?Number(value)||0:Number(rows[i].rate)||0; rows[i].amount=Math.round(q*r*100)/100; }
            if (field==='product_id') { const prod=products.find(p=>p.id===value); if(prod){rows[i].rate=Number(prod.purchase_rate)||0;rows[i].unit_id=prod.unit_id;rows[i].amount=Math.round((Number(rows[i].quantity)||0)*(Number(prod.purchase_rate)||0)*100)/100;rows[i].product_name=prod.name;rows[i].product_code=prod.code;} }
            setHasUnsavedChanges(true); return rows;
        });
    };

    const updatePurchase = (i: number, field: keyof PurchaseRow, value: any) => {
        setPurchases(prev => {
            const rows = [...prev]; const numF: (keyof PurchaseRow)[] = ['quantity','rate','amount'];
            const val = numF.includes(field) ? (Number(value)||0) : value;
            rows[i] = { ...rows[i], [field]: val };
            if (field==='quantity'||field==='rate') { const q=field==='quantity'?Number(value)||0:Number(rows[i].quantity)||0; const r=field==='rate'?Number(value)||0:Number(rows[i].rate)||0; rows[i].amount=Math.round(q*r*100)/100; }
            setHasUnsavedChanges(true); return rows;
        });
    };

    const updateService = (i: number, field: keyof ServiceRow, value: any) => {
        setServices(prev => {
            const rows = [...prev]; const numF: (keyof ServiceRow)[] = ['quantity','rate','amount'];
            const val = numF.includes(field) ? (Number(value)||0) : value;
            rows[i] = { ...rows[i], [field]: val };
            if (field==='quantity'||field==='rate') { const q=field==='quantity'?Number(value)||0:Number(rows[i].quantity)||0; const r=field==='rate'?Number(value)||0:Number(rows[i].rate)||0; rows[i].amount=Math.round(q*r*100)/100; }
            setHasUnsavedChanges(true); return rows;
        });
    };

    const handleSave = async () => {
        if (!customerId) { toast.error('Please select a customer'); return; }
        if (!finishedItemName.trim()) { toast.error('Finished item name is required'); return; }
        const payload = {
            order_date: orderDate, delivery_date: deliveryDate||null, customer_id: customerId,
            reference: reference || null,
            finished_item_name: finishedItemName, finished_item_qty: Number(finishedItemQty)||1,
            finished_item_unit: null, sale_price: Number(salePrice)||0, narration: narration||null,
            materials: materials.filter(m=>m.product_id).map(m=>({ product_id:m.product_id, description:m.description||null, quantity:Number(m.quantity)||0, unit_id:m.unit_id||null, rate:Number(m.rate)||0, amount:Number(m.amount)||0 })),
            purchases: purchases.filter(p=>p.description&&p.description.trim()).map(p=>({ description:p.description.trim(), supplier_id:p.supplier_id||null, quantity:Number(p.quantity)||0, unit_id:null, rate:Number(p.rate)||0, amount:Number(p.amount)||0, expense_account:null, purchase_date:p.purchase_date||null })),
            services: services.filter(s=>s.description&&s.description.trim()).map(s=>({ service_id:s.service_id||null, description:s.description.trim(), quantity:Number(s.quantity)||0, rate:Number(s.rate)||0, amount:Number(s.amount)||0, expense_account:null })),
            user_id: user?.id||null,
        };
        setSaving(true);
        try {
            if (mode==='editing'&&currentOrder) {
                await invoke('update_custom_order', { id: currentOrder.id, data: payload }); toast.success('Order updated');
                const detail = await invoke<CustomOrderDetail>('get_custom_order', { id: currentOrder.id });
                setCurrentOrder(detail.order); setCurrentDetail(detail); setMode('viewing'); setHasUnsavedChanges(false); await checkNavigation(detail.order.id);
            } else {
                const newId = await invoke<string>('create_custom_order', { data: payload }); toast.success('Order created');
                const detail = await invoke<CustomOrderDetail>('get_custom_order', { id: newId });
                setCurrentOrder(detail.order); setCurrentDetail(detail); setMode('viewing'); setHasUnsavedChanges(false); await checkNavigation(newId);
            }
            loadOrders();
        } catch (err) { toast.error(String(err)); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        try { await invoke('delete_custom_order', { id: deleteId }); toast.success('Order deleted'); if (currentOrder?.id===deleteId) { setCurrentOrder(null); setCurrentDetail(null); setMode('list'); } setDeleteId(null); loadOrders(); }
        catch (err) { toast.error(String(err)); setDeleteId(null); }
    };

    const handleSaveAdvance = async () => {
        if (!advanceOrder) return;
        if (!advanceAmount||Number(advanceAmount)<=0) { toast.error('Enter a valid amount'); return; }
        if (!advanceCashBank) { toast.error('Select a cash/bank account'); return; }
        setSavingAdvance(true);
        try {
            await invoke('record_custom_order_advance', { payload: { order_id:advanceOrder.id, amount:Number(advanceAmount), payment_date:advanceDate, cash_bank_account_id:advanceCashBank, narration:advanceNarration||null, user_id:user?.id||null } });
            toast.success('Advance recorded'); setAdvanceOrder(null); loadOrders();
            if (currentOrder?.id===advanceOrder.id) { const d=await invoke<CustomOrderDetail>('get_custom_order',{id:advanceOrder.id}); setCurrentOrder(d.order); setCurrentDetail(d); }
        } catch (err) { toast.error(String(err)); }
        finally { setSavingAdvance(false); }
    };

    const openFinalize = (order: CustomOrder) => { setFinalizeOrder(order); setFinalizeDate(today()); setFinalizeSalePrice(order.sale_price); setFinalizeNarration(''); };

    const handleFinalize = async () => {
        if (!finalizeOrder) return;
        if (!finalizeSalePrice||finalizeSalePrice<=0) { toast.error('Enter a valid sale price'); return; }
        setFinalizing(true);
        try {
            await invoke('finalize_custom_order', { payload: { order_id:finalizeOrder.id, voucher_date:finalizeDate, sale_price:Number(finalizeSalePrice)||0, tax_rate:0, gst_disabled:true, narration:finalizeNarration||null, user_id:user?.id||null } });
            toast.success('Order finalized! Invoice created.'); setFinalizeOrder(null); loadOrders();
            if (currentOrder?.id===finalizeOrder.id) { const d=await invoke<CustomOrderDetail>('get_custom_order',{id:finalizeOrder.id}); setCurrentOrder(d.order); setCurrentDetail(d); }
        } catch (err) { toast.error(String(err)); }
        finally { setFinalizing(false); }
    };

    const openCollectPayment = (order: CustomOrder) => {
        if (!order.final_invoice_id) { toast.error('No invoice generated for this order yet.'); return; }
        setPaymentInvoice({ id:order.final_invoice_id, no:order.final_invoice_no||order.order_no, amount:order.sale_price, date:order.delivery_date||order.order_date, partyName:order.customer_name });
    };

    const filteredOrders = orders.filter(o => filterStatus==='all'||o.status===filterStatus);
    const displayOrderNo = mode==='new' ? nextOrderNo : currentOrder?.order_no;
    const isFormMode = mode==='new'||mode==='editing';
    const isViewMode = mode==='viewing';

    const renderHeader = () => (
        <div className="border-b bg-card/50 px-5 py-3 backdrop-blur-sm shrink-0 h-[65px] flex items-center z-0">
            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 mr-2">
                        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                            disabled={mode==='new'?!hasLastOrder:!hasPrevious} onClick={handleNavigatePrevious}
                            title={mode==='new'?'Go to last order':'Previous (Alt+Left)'}>
                            <IconChevronLeft size={16} />
                        </Button>
                        {displayOrderNo && (
                            <span className={`h-8 flex items-center justify-center px-3 text-xs font-mono font-bold rounded-md border shrink-0 ${mode==='new'?'text-muted-foreground/70 border-dashed border-muted-foreground/30 bg-muted/20':'text-primary border-primary/20 bg-primary/10'}`}>
                                {displayOrderNo}
                            </span>
                        )}
                        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0"
                            disabled={mode==='new'?true:!hasNext} onClick={handleNavigateNext}
                            title={mode==='new'?'No next in new mode':'Next (Alt+Right)'}>
                            <IconChevronRight size={16} />
                        </Button>
                    </div>
                    <div>
                        {isFormMode ? (
                            <div className="flex items-center gap-2"><div><h1 className="text-base font-semibold">{mode==='editing'?'Edit Custom Order':'New Custom Order'}</h1><p className="text-xs text-muted-foreground">Custom Orders</p></div>{hasUnsavedChanges&&<Badge variant="outline" className="text-xs text-amber-600 border-amber-400">Unsaved</Badge>}</div>
                        ) : isViewMode&&currentOrder ? (
                            <div className="flex items-center gap-2">
                                <h1 className="text-base font-semibold">Custom Orders</h1>
                                <Badge variant={currentOrder.status==='delivered'?'default':'secondary'} className="gap-1">{currentOrder.status==='delivered'?<><IconCheck size={12}/> Delivered</>:<><IconClock size={12}/> Pending</>}</Badge>
                                {currentOrder.payment_status==='paid'?<Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 gap-1"><IconCheck size={12}/> Paid</Badge>:<Badge variant="secondary" className="gap-1"><IconClock size={12}/> Payment Pending</Badge>}
                            </div>
                        ) : (
                            <div><h1 className="text-base font-semibold">Custom Orders</h1><p className="text-xs text-muted-foreground">Manage tailored work orders</p></div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {mode!=='list'&&<Button variant="outline" size="icon" className="h-8 w-8" onClick={()=>{setMode('list');setCurrentOrder(null);setCurrentDetail(null);}} title="Back to list"><IconList size={16}/></Button>}
                    {isViewMode&&currentOrder&&(
                        <>
                            <div className="flex items-center gap-1 border-r pr-2 mr-1">
                                {currentOrder.status!=='delivered'&&<Button variant="outline" size="icon" className="h-8 w-8" onClick={openEditFromView} title="Edit"><IconEdit size={16}/></Button>}
                                <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={()=>{setDeleteId(currentOrder.id);setDeleteOrderNo(currentOrder.order_no);}} title="Delete" disabled={currentOrder.status==='delivered'}><IconTrash size={16}/></Button>
                            </div>
                            {currentOrder.status==='pending'&&!currentOrder.advance_voucher_id&&<Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={()=>{setAdvanceOrder(currentOrder);setAdvanceAmount('');setAdvanceDate(today());setAdvanceNarration('');}}><IconCash size={14}/> Advance</Button>}
                            {currentOrder.status==='pending'&&<Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={()=>openFinalize(currentOrder)}><IconFileInvoice size={14}/> Finalize</Button>}
                            {currentOrder.status==='delivered'&&(currentOrder.balance_due??0)>0&&currentOrder.final_invoice_id&&<Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={()=>openCollectPayment(currentOrder)}><IconCurrencyRupee size={14}/> Collect (₹{fmt(currentOrder.balance_due||0)})</Button>}
                            <Button variant="default" size="sm" className="h-8 text-xs gap-1.5" onClick={openNew}><IconPlus size={14}/> New</Button>
                        </>
                    )}
                    {isFormMode&&(
                        <>
                            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCancelEdit}><IconX size={14} className="mr-1"/> Cancel</Button>
                            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={saving}><IconDeviceFloppy size={14}/>{saving?'Saving...':mode==='editing'?'Update Order':'Save Order'}</Button>
                        </>
                    )}
                    {mode==='list'&&(
                        <>
                            <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-36 h-8 text-xs"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All Orders</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="delivered">Delivered</SelectItem></SelectContent></Select>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={loadOrders}><IconRefresh size={16}/></Button>
                            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openNew}><IconPlus size={14}/> New Order</Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    if (mode==='viewing'&&currentOrder&&currentDetail) {
        const o = currentOrder;
        const grossMargin = o.sale_price - o.total_job_cost;
        return (
            <div className="flex flex-col h-full overflow-hidden">
                {renderHeader()}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-8 gap-4 px-5 py-3 border-b bg-muted/20 shrink-0 text-sm">
                    <div><span className="text-xs text-muted-foreground block">Customer</span><strong>{o.customer_name}</strong></div>
                    <div><span className="text-xs text-muted-foreground block">Reference</span><span className="text-foreground font-mono">{o.reference||'—'}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Finished Item</span><strong>{o.finished_item_name}{o.finished_item_qty>1?` (${o.finished_item_qty})`:''}</strong></div>
                    <div><span className="text-xs text-muted-foreground block">Order Date</span><span>{o.order_date}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Delivery Date</span><span>{o.delivery_date||'—'}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Sale Price</span><strong className="text-base text-primary">₹{fmt(o.sale_price)}</strong></div>
                    <div><span className="text-xs text-muted-foreground block">Advance Paid</span><span>{o.advance_amount>0?`₹${fmt(o.advance_amount)}`:'None'}</span></div>
                    <div><span className="text-xs text-muted-foreground block">Balance Due</span><strong className={`text-base ${(o.balance_due??0)>0?'text-amber-600':'text-green-600'}`}>₹{fmt(o.balance_due||0)}</strong></div>
                </div>
                <div className="flex-1 overflow-auto p-5 space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {([['Stock Materials',o.total_material_cost],['Direct Purchases',o.total_purchase_cost],['Services & Labour',o.total_service_cost],['Total Job Cost',o.total_job_cost]] as [string,number][]).map(([label,val])=>(
                            <div key={label} className="p-3 bg-muted/30 rounded-lg border"><span className="text-xs text-muted-foreground">{label}</span><p className="font-semibold text-lg mt-1">₹{fmt(val)}</p></div>
                        ))}
                        <div className="p-3 bg-muted/30 rounded-lg border"><span className="text-xs text-muted-foreground">Gross Profit</span><p className={`font-semibold text-lg mt-1 ${grossMargin>=0?'text-green-600':'text-red-600'}`}>₹{fmt(grossMargin)}</p></div>
                    </div>
                    {currentDetail.materials.length>0&&(<div className="space-y-2"><h3 className="font-semibold text-sm flex items-center gap-2"><IconPackage size={16} className="text-primary"/>Stock Materials Consumed ({currentDetail.materials.length})</h3><div className="border rounded-lg overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="text-left p-3 font-medium">Product</th><th className="text-left p-3 font-medium">Unit</th><th className="text-right p-3 font-medium">Qty</th><th className="text-right p-3 font-medium">Rate</th><th className="text-right p-3 font-medium">Amount</th></tr></thead><tbody>{currentDetail.materials.map((m,idx)=>(<tr key={idx} className="border-t hover:bg-muted/10"><td className="p-3"><span className="font-medium">{m.product_name||m.product_code}</span>{m.description&&<span className="text-xs text-muted-foreground block">{m.description}</span>}</td><td className="p-3 text-muted-foreground">{m.unit_name||'—'}</td><td className="p-3 text-right">{m.quantity}</td><td className="p-3 text-right">₹{fmt(m.rate)}</td><td className="p-3 text-right font-medium">₹{fmt(m.amount)}</td></tr>))}</tbody></table></div></div>)}
                    {currentDetail.purchases.length>0&&(<div className="space-y-2"><h3 className="font-semibold text-sm flex items-center gap-2"><IconShoppingBag size={16} className="text-primary"/>Direct Purchases ({currentDetail.purchases.length})</h3><div className="border rounded-lg overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="text-left p-3 font-medium">Description</th><th className="text-left p-3 font-medium">Supplier / Paid Via</th><th className="text-right p-3 font-medium">Qty</th><th className="text-right p-3 font-medium">Rate</th><th className="text-right p-3 font-medium">Amount</th></tr></thead><tbody>{currentDetail.purchases.map((p,idx)=>(<tr key={idx} className="border-t hover:bg-muted/10"><td className="p-3 font-medium">{p.description}</td><td className="p-3 text-muted-foreground">{p.supplier_name||'Cash'}</td><td className="p-3 text-right">{p.quantity}</td><td className="p-3 text-right">₹{fmt(p.rate)}</td><td className="p-3 text-right font-medium">₹{fmt(p.amount)}</td></tr>))}</tbody></table></div></div>)}
                    {currentDetail.services.length>0&&(<div className="space-y-2"><h3 className="font-semibold text-sm flex items-center gap-2"><IconTools size={16} className="text-primary"/>Services & Labour Charges ({currentDetail.services.length})</h3><div className="border rounded-lg overflow-hidden"><table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="text-left p-3 font-medium">Description</th><th className="text-right p-3 font-medium">Qty</th><th className="text-right p-3 font-medium">Rate</th><th className="text-right p-3 font-medium">Amount</th></tr></thead><tbody>{currentDetail.services.map((s,idx)=>(<tr key={idx} className="border-t hover:bg-muted/10"><td className="p-3 font-medium">{s.description}</td><td className="p-3 text-right">{s.quantity}</td><td className="p-3 text-right">₹{fmt(s.rate)}</td><td className="p-3 text-right font-medium">₹{fmt(s.amount)}</td></tr>))}</tbody></table></div></div>)}
                    {o.narration&&<div className="bg-muted/20 p-4 rounded-lg border text-sm"><span className="text-xs text-muted-foreground font-medium uppercase tracking-wider block mb-1">Notes / Instructions</span><p>{o.narration}</p></div>}
                </div>
                {paymentInvoice&&<PaymentManagementDialog mode="receipt" open={!!paymentInvoice} onOpenChange={open=>!open&&setPaymentInvoice(null)} invoiceId={paymentInvoice.id} invoiceNo={paymentInvoice.no} invoiceAmount={paymentInvoice.amount} invoiceDate={paymentInvoice.date} partyName={paymentInvoice.partyName} onSuccess={async()=>{ toast.success('Payment recorded'); setPaymentInvoice(null); loadOrders(); const d=await invoke<CustomOrderDetail>('get_custom_order',{id:o.id}); setCurrentOrder(d.order); setCurrentDetail(d); }}/>}
            </div>
        );
    }

    if (mode==='new'||mode==='editing') {
        return (
            <div className="flex flex-col h-full overflow-hidden bg-background">
                {renderHeader()}

                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    <div className="flex-1 min-h-0 p-5 max-w-7xl mx-auto w-full flex flex-col gap-4">

                        {/* ── Master Section ── */}
                        <div className="bg-card border rounded-lg p-3 shrink-0">
                            <div className="flex flex-wrap lg:flex-nowrap items-end gap-3 w-full">

                                {/* Customer — widest field */}
                                <div className="flex-[3] min-w-[260px]">
                                    <Label className="text-xs font-medium mb-1 block">Customer *</Label>
                                    <Combobox
                                        options={customers.map(c=>({value:c.id,label:c.code?`${c.code} - ${c.name}`:c.name,searchString:`${c.code||''} ${c.name}`}))}
                                        value={customerId}
                                        onChange={val=>{setCustomerId(String(val));setHasUnsavedChanges(true);}}
                                        onAfterSelect={() => {
                                            requestAnimationFrame(() => {
                                                orderDateRef.current?.focus();
                                            });
                                        }}
                                        placeholder="Select customer..."
                                        searchPlaceholder="Search by name or code..."
                                        className="w-full"
                                        onActionClick={() => { setNewCustomerName(''); setShowCreateCustomer(true); }}
                                        onCreate={(name) => { setNewCustomerName(name); setShowCreateCustomer(true); }}
                                    />
                                </div>

                                {/* Order Date */}
                                <div className="w-36 shrink-0">
                                    <Label className="text-xs font-medium mb-1 block">Order Date *</Label>
                                    <Input
                                        ref={orderDateRef}
                                        type="date" value={orderDate}
                                        onChange={e=>{setOrderDate(e.target.value);setHasUnsavedChanges(true);}}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                deliveryDateRef.current?.focus();
                                            }
                                        }}
                                        className="h-8 text-sm"
                                    />
                                </div>

                                {/* Delivery Date */}
                                <div className="w-36 shrink-0">
                                    <Label className="text-xs font-medium mb-1 block">Delivery Date</Label>
                                    <Input
                                        ref={deliveryDateRef}
                                        type="date" value={deliveryDate}
                                        onChange={e=>{setDeliveryDate(e.target.value);setHasUnsavedChanges(true);}}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                referenceRef.current?.focus();
                                            }
                                        }}
                                        className="h-8 text-sm"
                                    />
                                </div>

                                {/* Reference No */}
                                <div className="flex-1 min-w-[140px]">
                                    <Label className="text-xs font-medium mb-1 block">Reference No</Label>
                                    <Input
                                        ref={referenceRef}
                                        value={reference}
                                        onChange={e=>{setReference(e.target.value);setHasUnsavedChanges(true);}}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (activeTab === 'details') {
                                                    finishedItemNameRef.current?.focus();
                                                    finishedItemNameRef.current?.select();
                                                } else if (activeTab === 'materials') {
                                                    const firstBtn = document.querySelector('[data-material-row="0"] button:not([disabled]):not([data-exclude-nav="true"])') as HTMLElement | null;
                                                    firstBtn?.focus();
                                                    firstBtn?.click();
                                                } else if (activeTab === 'purchases') {
                                                    const firstInput = document.querySelector('[data-purchase-row="0"] input:not([disabled]):not([data-exclude-nav="true"])') as HTMLInputElement | null;
                                                    firstInput?.focus();
                                                    firstInput?.select();
                                                } else if (activeTab === 'services') {
                                                    const firstInput = document.querySelector('[data-service-row="0"] input:not([disabled]):not([data-exclude-nav="true"])') as HTMLInputElement | null;
                                                    firstInput?.focus();
                                                    firstInput?.select();
                                                }
                                            }
                                        }}
                                        placeholder="Reference or PO no"
                                        className="h-8 text-sm"
                                    />
                                </div>

                            </div>
                        </div>


                        {/* ── Items Section (tabs) ── */}
                        <div className="bg-card border rounded-lg flex-1 min-h-0 flex flex-col overflow-hidden">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
                                <div className="px-3 py-2 shrink-0 border-b bg-muted/20">
                                    <TabsList className="mb-0 h-8">
                                        <TabsTrigger value="details" className="text-xs h-7">
                                            <IconScissors size={13} className="mr-1"/>
                                            Order Details
                                        </TabsTrigger>
                                        <TabsTrigger value="materials" className="text-xs h-7">
                                            <IconPackage size={13} className="mr-1"/>
                                            Stock Used
                                            {materials.filter(m=>m.product_id).length > 0 && (
                                                <span className="ml-1.5 min-w-4 h-4 px-1 rounded-full bg-primary/15 text-primary text-[10px] leading-4 text-center">
                                                    {materials.filter(m=>m.product_id).length}
                                                </span>
                                            )}
                                        </TabsTrigger>
                                        <TabsTrigger value="purchases" className="text-xs h-7">
                                            <IconShoppingBag size={13} className="mr-1"/>
                                            Direct Purchases
                                            {purchases.filter(p=>p.description).length > 0 && (
                                                <span className="ml-1.5 min-w-4 h-4 px-1 rounded-full bg-primary/15 text-primary text-[10px] leading-4 text-center">
                                                    {purchases.filter(p=>p.description).length}
                                                </span>
                                            )}
                                        </TabsTrigger>
                                        <TabsTrigger value="services" className="text-xs h-7">
                                            <IconTools size={13} className="mr-1"/>
                                            Services &amp; Charges
                                            {services.filter(s=>s.description).length > 0 && (
                                                <span className="ml-1.5 min-w-4 h-4 px-1 rounded-full bg-primary/15 text-primary text-[10px] leading-4 text-center">
                                                    {services.filter(s=>s.description).length}
                                                </span>
                                            )}
                                        </TabsTrigger>
                                    </TabsList>
                                </div>

                                {/* Order Details */}
                                <TabsContent value="details" className="flex-1 min-h-0 flex flex-col overflow-hidden mt-0">
                                    <div className="bg-muted/40 border-b px-3 py-1.5 shrink-0 grid grid-cols-[3fr_0.8fr_1fr_1fr] gap-2 text-xs font-medium text-muted-foreground">
                                        <span>Finished Item / Description *</span>
                                        <span>Qty</span>
                                        <span className="text-right">Rate (₹)</span>
                                        <span className="text-right">Amount (₹) *</span>
                                    </div>
                                    <div className="flex-1 overflow-auto p-3 space-y-1.5 min-h-0">
                                        <div className="grid grid-cols-[3fr_0.8fr_1fr_1fr] gap-2 items-center">
                                            <Input
                                                ref={finishedItemNameRef}
                                                value={finishedItemName}
                                                onChange={e => { setFinishedItemName(e.target.value); setHasUnsavedChanges(true); }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        finishedItemQtyRef.current?.focus();
                                                        finishedItemQtyRef.current?.select();
                                                    }
                                                }}
                                                placeholder="Bridal dress"
                                                className="h-8 text-sm"
                                            />
                                            <Input
                                                ref={finishedItemQtyRef}
                                                type="number"
                                                min={1}
                                                value={finishedItemQty}
                                                onChange={e => {
                                                    const q = Number(e.target.value);
                                                    setFinishedItemQty(q);
                                                    if (finishedItemRate > 0) {
                                                        setSalePrice(Math.round(q * finishedItemRate * 100) / 100);
                                                    }
                                                    setHasUnsavedChanges(true);
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        finishedItemRateRef.current?.focus();
                                                        finishedItemRateRef.current?.select();
                                                    }
                                                }}
                                                onFocus={e => e.target.select()}
                                                className="h-8 text-sm"
                                            />
                                            <Input
                                                ref={finishedItemRateRef}
                                                type="number"
                                                value={finishedItemRate || ''}
                                                onChange={e => {
                                                    const r = Number(e.target.value) || 0;
                                                    setFinishedItemRate(r);
                                                    setSalePrice(Math.round((finishedItemQty || 1) * r * 100) / 100);
                                                    setHasUnsavedChanges(true);
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        salePriceRef.current?.focus();
                                                        salePriceRef.current?.select();
                                                    }
                                                }}
                                                onFocus={e => e.target.select()}
                                                placeholder="0.00"
                                                className="h-8 text-sm text-right font-mono"
                                            />
                                            <Input
                                                ref={salePriceRef}
                                                type="number"
                                                value={salePrice || ''}
                                                onChange={e => {
                                                    const amt = Number(e.target.value) || 0;
                                                    setSalePrice(amt);
                                                    const q = finishedItemQty || 1;
                                                    if (q > 0) {
                                                        setFinishedItemRate(Math.round((amt / q) * 100) / 100);
                                                    }
                                                    setHasUnsavedChanges(true);
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        narrationRef.current?.focus();
                                                    }
                                                }}
                                                onFocus={e => e.target.select()}
                                                placeholder="0.00"
                                                className="h-8 text-sm text-right font-mono font-medium"
                                            />
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* Stock Used */}
                                <TabsContent value="materials" className="flex-1 min-h-0 flex flex-col overflow-hidden mt-0">
                                    <div className="bg-muted/40 border-b px-3 py-1.5 shrink-0 grid grid-cols-[2.5fr_0.8fr_0.9fr_0.9fr_68px] gap-2 text-xs font-medium text-muted-foreground">
                                        <span>Product</span><span>Qty</span><span className="text-right">Rate (₹)</span><span className="text-right">Amount (₹)</span><span className="text-right">Actions</span>
                                    </div>
                                    <div className="flex-1 overflow-auto p-3 space-y-1.5 min-h-0">
                                        {materials.map((row, i) => (
                                            <div
                                                key={i}
                                                data-row-index={i}
                                                data-material-row={i}
                                                onKeyDown={e => handleMaterialKeyDown(e, i)}
                                                className="grid grid-cols-[2.5fr_0.8fr_0.9fr_0.9fr_68px] gap-2 items-center"
                                            >
                                                <Combobox
                                                    options={products.map(p => ({ value: p.id, label: `${p.code} — ${p.name}`, searchString: `${p.code} ${p.name}` }))}
                                                    value={row.product_id}
                                                    onChange={v => updateMaterial(i, 'product_id', String(v))}
                                                    onAfterSelect={() => {
                                                        const rowEl = document.querySelector(`[data-material-row="${i}"]`);
                                                        const qtyInput = rowEl?.querySelector('[data-field="quantity"]') as HTMLInputElement | null;
                                                        requestAnimationFrame(() => {
                                                            qtyInput?.focus();
                                                            qtyInput?.select();
                                                        });
                                                    }}
                                                    placeholder="Select product..."
                                                    searchPlaceholder="Search product..."
                                                    className="w-full"
                                                />
                                                <Input
                                                    data-field="quantity"
                                                    type="number"
                                                    value={row.quantity}
                                                    min={0}
                                                    onChange={e => updateMaterial(i, 'quantity', e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    className="h-8 text-sm"
                                                />
                                                <Input
                                                    data-field="rate"
                                                    type="number"
                                                    value={row.rate}
                                                    min={0}
                                                    onChange={e => updateMaterial(i, 'rate', e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    className="h-8 text-sm text-right font-mono"
                                                />
                                                <Input
                                                    type="number"
                                                    value={row.amount}
                                                    readOnly
                                                    tabIndex={-1}
                                                    data-exclude-nav="true"
                                                    className="h-8 text-sm text-right font-mono bg-muted/30"
                                                />
                                                <div className="flex items-center gap-0.5 shrink-0 justify-end">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                        title="Insert Row Below"
                                                        onClick={() => addMaterial(i + 1)}
                                                        data-exclude-nav="true"
                                                    >
                                                        <IconPlus size={14} />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        title="Delete Row (Ctrl+D)"
                                                        onClick={() => removeMaterial(i)}
                                                        data-exclude-nav="true"
                                                    >
                                                        <IconTrash size={14} />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-muted/30 border-t px-3 py-2 shrink-0 flex justify-between items-center">
                                        <Button type="button" variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => addMaterial()}>
                                            <IconPlus size={14} /> Add Row
                                        </Button>
                                        <span className="text-sm font-semibold font-mono">Total: ₹{fmt(matTotal)}</span>
                                    </div>
                                </TabsContent>

                                {/* Direct Purchases */}
                                <TabsContent value="purchases" className="flex-1 min-h-0 flex flex-col overflow-hidden mt-0">
                                    <div className="bg-muted/40 border-b px-3 py-1.5 shrink-0 grid grid-cols-[2fr_1.6fr_0.7fr_0.9fr_0.9fr_68px] gap-2 text-xs font-medium text-muted-foreground">
                                        <span>Description</span><span>Supplier / Paid Via</span><span>Qty</span><span className="text-right">Rate (₹)</span><span className="text-right">Amount (₹)</span><span className="text-right">Actions</span>
                                    </div>
                                    <div className="flex-1 overflow-auto p-3 space-y-1.5 min-h-0">
                                        {purchases.map((row, i) => (
                                            <div
                                                key={i}
                                                data-row-index={i}
                                                data-purchase-row={i}
                                                onKeyDown={e => handlePurchaseKeyDown(e, i)}
                                                className="grid grid-cols-[2fr_1.6fr_0.7fr_0.9fr_0.9fr_68px] gap-2 items-center"
                                            >
                                                <Input
                                                    data-field="description"
                                                    value={row.description}
                                                    onChange={e => updatePurchase(i, 'description', e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    placeholder="Imported Lace"
                                                    className="h-8 text-sm"
                                                />
                                                <Combobox
                                                    options={[{ value: '', label: 'Cash', searchString: 'Cash Default' }, ...suppliers.map(s => ({ value: s.id, label: s.code ? `${s.code} - ${s.name}` : s.name, searchString: `${s.code || ''} ${s.name}` }))]}
                                                    value={row.supplier_id || ''}
                                                    onChange={val => updatePurchase(i, 'supplier_id', String(val))}
                                                    onAfterSelect={() => {
                                                        const rowEl = document.querySelector(`[data-purchase-row="${i}"]`);
                                                        const qtyInput = rowEl?.querySelector('[data-field="quantity"]') as HTMLInputElement | null;
                                                        requestAnimationFrame(() => {
                                                            qtyInput?.focus();
                                                            qtyInput?.select();
                                                        });
                                                    }}
                                                    placeholder="Cash"
                                                    searchPlaceholder="Search supplier..."
                                                    className="w-full"
                                                />
                                                <Input
                                                    data-field="quantity"
                                                    type="number"
                                                    value={row.quantity}
                                                    min={0}
                                                    onChange={e => updatePurchase(i, 'quantity', e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    className="h-8 text-sm"
                                                />
                                                <Input
                                                    data-field="rate"
                                                    type="number"
                                                    value={row.rate}
                                                    min={0}
                                                    onChange={e => updatePurchase(i, 'rate', e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    className="h-8 text-sm text-right font-mono"
                                                />
                                                <Input
                                                    type="number"
                                                    value={row.amount}
                                                    readOnly
                                                    tabIndex={-1}
                                                    data-exclude-nav="true"
                                                    className="h-8 text-sm text-right font-mono bg-muted/30"
                                                />
                                                <div className="flex items-center gap-0.5 shrink-0 justify-end">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                        title="Insert Row Below"
                                                        onClick={() => addPurchase(i + 1)}
                                                        data-exclude-nav="true"
                                                    >
                                                        <IconPlus size={14} />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        title="Delete Row (Ctrl+D)"
                                                        onClick={() => removePurchase(i)}
                                                        data-exclude-nav="true"
                                                    >
                                                        <IconTrash size={14} />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-muted/30 border-t px-3 py-2 shrink-0 flex justify-between items-center">
                                        <Button type="button" variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => addPurchase()}>
                                            <IconPlus size={14} /> Add Row
                                        </Button>
                                        <span className="text-sm font-semibold font-mono">Total: ₹{fmt(purTotal)}</span>
                                    </div>
                                </TabsContent>

                                {/* Services */}
                                <TabsContent value="services" className="flex-1 min-h-0 flex flex-col overflow-hidden mt-0">
                                    <div className="bg-muted/40 border-b px-3 py-1.5 shrink-0 grid grid-cols-[2fr_0.7fr_0.9fr_0.9fr_68px] gap-2 text-xs font-medium text-muted-foreground">
                                        <span>Description</span><span>Qty</span><span className="text-right">Rate (₹)</span><span className="text-right">Amount (₹)</span><span className="text-right">Actions</span>
                                    </div>
                                    <div className="flex-1 overflow-auto p-3 space-y-1.5 min-h-0">
                                        {services.map((row, i) => (
                                            <div
                                                key={i}
                                                data-row-index={i}
                                                data-service-row={i}
                                                onKeyDown={e => handleServiceKeyDown(e, i)}
                                                className="grid grid-cols-[2fr_0.7fr_0.9fr_0.9fr_68px] gap-2 items-center"
                                            >
                                                <Input
                                                    data-field="description"
                                                    value={row.description}
                                                    onChange={e => updateService(i, 'description', e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    placeholder="e.g. Stitching Charges"
                                                    className="h-8 text-sm"
                                                />
                                                <Input
                                                    data-field="quantity"
                                                    type="number"
                                                    value={row.quantity}
                                                    min={0}
                                                    onChange={e => updateService(i, 'quantity', e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    className="h-8 text-sm"
                                                />
                                                <Input
                                                    data-field="rate"
                                                    type="number"
                                                    value={row.rate}
                                                    min={0}
                                                    onChange={e => updateService(i, 'rate', e.target.value)}
                                                    onFocus={e => e.target.select()}
                                                    className="h-8 text-sm text-right font-mono"
                                                />
                                                <Input
                                                    type="number"
                                                    value={row.amount}
                                                    readOnly
                                                    tabIndex={-1}
                                                    data-exclude-nav="true"
                                                    className="h-8 text-sm text-right font-mono bg-muted/30"
                                                />
                                                <div className="flex items-center gap-0.5 shrink-0 justify-end">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                                        title="Insert Row Below"
                                                        onClick={() => addService(i + 1)}
                                                        data-exclude-nav="true"
                                                    >
                                                        <IconPlus size={14} />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        title="Delete Row (Ctrl+D)"
                                                        onClick={() => removeService(i)}
                                                        data-exclude-nav="true"
                                                    >
                                                        <IconTrash size={14} />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-muted/30 border-t px-3 py-2 shrink-0 flex justify-between items-center">
                                        <Button type="button" variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => addService()}>
                                            <IconPlus size={14} /> Add Row
                                        </Button>
                                        <span className="text-sm font-semibold font-mono">Total: ₹{fmt(svcTotal)}</span>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>

                        {/* ── Footer Section ── */}
                        <div className="grid grid-cols-3 gap-4 shrink-0">

                            {/* Notes / Narration */}
                            <div className="col-span-1 bg-card border rounded-lg p-2.5">
                                <Label className="text-xs font-medium mb-1 block">Notes / Narration</Label>
                                <Textarea
                                    ref={narrationRef}
                                    value={narration}
                                    onChange={e=>{setNarration(e.target.value);setHasUnsavedChanges(true);}}
                                    placeholder="Special instructions, measurements, notes..."
                                    className="min-h-[60px] text-xs resize-none"
                                    rows={3}
                                />
                            </div>

                            {/* Cost Summary + Totals */}
                            <div className="col-span-2 bg-card border rounded-lg p-3 shrink-0">
                                <div className="flex justify-between items-end h-full">

                                    {/* Left: cost breakdown */}
                                    <div className="space-y-1.5 text-xs min-w-[220px]">
                                        <div className="flex justify-between gap-6">
                                            <span className="text-foreground/80 font-medium">Stock Materials</span>
                                            <span className="font-mono font-semibold text-foreground">₹{fmt(matTotal)}</span>
                                        </div>
                                        <div className="flex justify-between gap-6">
                                            <span className="text-foreground/80 font-medium">Direct Purchases</span>
                                            <span className="font-mono font-semibold text-foreground">₹{fmt(purTotal)}</span>
                                        </div>
                                        <div className="flex justify-between gap-6">
                                            <span className="text-foreground/80 font-medium">Services &amp; Labour</span>
                                            <span className="font-mono font-semibold text-foreground">₹{fmt(svcTotal)}</span>
                                        </div>
                                        <div className="flex justify-between gap-6 font-bold border-t pt-1.5 mt-1.5 text-foreground text-sm">
                                            <span>Total Job Cost</span>
                                            <span className="font-mono text-primary font-bold">₹{fmt(jobTotal)}</span>
                                        </div>
                                    </div>

                                    {/* Right: sale price + margin */}
                                    <div className="text-right space-y-1">
                                        <div className="flex justify-between items-center gap-4 text-xs">
                                            <span className="text-foreground/80 font-medium">Sale Price</span>
                                            <span className="font-mono font-semibold text-foreground">₹{fmt(salePrice)}</span>
                                        </div>
                                        <div className={`flex justify-between items-center gap-4 text-xs font-semibold ${margin>=0?'text-green-600 dark:text-green-400':'text-red-600 dark:text-red-400'}`}>
                                            <span>Gross Margin</span>
                                            <span className="font-mono">₹{fmt(margin)}</span>
                                        </div>
                                        <div className="text-2xl font-mono font-bold pt-1 text-foreground">
                                            ₹{fmt(salePrice)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Bottom Action Bar ── */}
                        <div className="flex justify-end items-center gap-2 shrink-0 pt-3 border-t">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleCancelEdit}
                                className="h-9 text-xs"
                                title="Cancel"
                            >
                                <IconX size={15} className="mr-1.5" />
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="h-9 text-xs gap-1.5"
                                title="Save (Ctrl+S)"
                                id="voucher-save-btn"
                            >
                                <IconCheck size={16} />
                                {saving ? 'Saving...' : (mode === 'editing' ? 'Update Order' : 'Save Order')}
                            </Button>
                        </div>

                    </div>
                </div>
                <CustomerDialog
                    open={showCreateCustomer}
                    onOpenChange={setShowCreateCustomer}
                    customerToEdit={null}
                    onSave={handleCreateCustomerSave}
                    initialName={newCustomerName}
                />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {renderHeader()}
            <div className="flex-1 overflow-auto">
                {loading?<div className="flex items-center justify-center h-40 text-muted-foreground">Loading...</div>:filteredOrders.length===0?(
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><IconScissors size={40} className="mb-2 opacity-20"/><p>No custom orders yet.</p><Button variant="outline" className="mt-3" onClick={openNew}><IconPlus size={14} className="mr-1"/> Create First Order</Button></div>
                ):(
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 sticky top-0"><tr><th className="text-left p-3 font-medium">Order No</th><th className="text-left p-3 font-medium">Date</th><th className="text-left p-3 font-medium">Customer</th><th className="text-left p-3 font-medium">Item</th><th className="text-left p-3 font-medium">Delivery</th><th className="text-left p-3 font-medium">Status</th><th className="text-left p-3 font-medium">Payment</th><th className="text-right p-3 font-medium">Sale Price</th><th className="text-center p-3 font-medium">Actions</th></tr></thead>
                        <tbody>
                            {filteredOrders.map(order=>(
                                <tr key={order.id} className="border-b hover:bg-muted/20 transition-colors cursor-pointer" onClick={()=>openViewOrder(order)}>
                                    <td className="p-3 font-mono text-xs">{order.order_no}</td>
                                    <td className="p-3">{order.order_date}</td>
                                    <td className="p-3">{order.customer_name}</td>
                                    <td className="p-3">{order.finished_item_name}</td>
                                    <td className="p-3 text-muted-foreground">{order.delivery_date||'—'}</td>
                                    <td className="p-3"><Badge variant={order.status==='delivered'?'default':'secondary'} className="gap-1">{order.status==='delivered'?<><IconCheck size={12}/> Delivered</>:<><IconClock size={12}/> Pending</>}</Badge></td>
                                    <td className="p-3">{order.payment_status==='paid'?<Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 gap-1"><IconCheck size={12}/> Paid</Badge>:<Badge variant="secondary" className="gap-1"><IconClock size={12}/> Pending</Badge>}</td>
                                    <td className="p-3 text-right">₹{fmt(order.sale_price)}</td>
                                    <td className="p-3" onClick={e=>e.stopPropagation()}>
                                        <div className="flex items-center justify-center gap-1">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title="View" onClick={()=>openViewOrder(order)}><IconEye size={14}/></Button>
                                            {order.status==='pending'&&(<>
                                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={()=>{ invoke<CustomOrderDetail>('get_custom_order',{id:order.id}).then(d=>{setCurrentOrder(d.order);setCurrentDetail(d);populateFormFromOrder(d.order,d);setMode('editing');}).catch(err=>toast.error(String(err))); }}><IconEdit size={14}/></Button>
                                                {!order.advance_voucher_id&&<Button variant="ghost" size="icon" className="h-7 w-7" title="Record Advance" onClick={()=>{setAdvanceOrder(order);setAdvanceAmount('');setAdvanceDate(today());setAdvanceNarration('');}}><IconCurrencyRupee size={14}/></Button>}
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" title="Finalize & Invoice" onClick={()=>openFinalize(order)}><IconCheck size={14}/></Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Delete" onClick={()=>{setDeleteId(order.id);setDeleteOrderNo(order.order_no);}}><IconTrash size={14}/></Button>
                                            </>)}
                                            {order.status==='delivered'&&(order.balance_due??0)>0&&order.final_invoice_id&&<Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700" title={`Collect Remaining (₹${fmt(order.balance_due||0)})`} onClick={()=>openCollectPayment(order)}><IconCurrencyRupee size={15}/></Button>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            <AlertDialog open={!!deleteId} onOpenChange={open=>!open&&setDeleteId(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete Custom Order?</AlertDialogTitle><AlertDialogDescription>This will delete order <strong>{deleteOrderNo}</strong> and reverse all stock deductions. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
            <Dialog open={!!advanceOrder} onOpenChange={open=>!open&&setAdvanceOrder(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Record Advance Payment</DialogTitle></DialogHeader><div className="space-y-4 py-2"><p className="text-sm text-muted-foreground">Customer: <strong>{advanceOrder?.customer_name}</strong><br/>Order: <strong>{advanceOrder?.order_no}</strong></p><div className="space-y-1"><Label>Advance Amount (₹) *</Label><Input type="number" value={advanceAmount} onChange={e=>setAdvanceAmount(e.target.value)} placeholder="0.00"/></div><div className="space-y-1"><Label>Payment Date *</Label><Input type="date" value={advanceDate} onChange={e=>setAdvanceDate(e.target.value)}/></div><div className="space-y-1"><Label>Cash / Bank Account *</Label><Select value={advanceCashBank} onValueChange={setAdvanceCashBank}><SelectTrigger><SelectValue placeholder="Select account..."/></SelectTrigger><SelectContent>{cashBankAccounts.map(a=>(<SelectItem key={a.id} value={a.id}>{a.name||a.account_name}</SelectItem>))}</SelectContent></Select></div><div className="space-y-1"><Label>Narration</Label><Input value={advanceNarration} onChange={e=>setAdvanceNarration(e.target.value)} placeholder="Optional note..."/></div></div><DialogFooter><Button variant="outline" onClick={()=>setAdvanceOrder(null)}>Cancel</Button><Button onClick={handleSaveAdvance} disabled={savingAdvance}>{savingAdvance?'Saving...':'Record Advance'}</Button></DialogFooter></DialogContent></Dialog>
            <Dialog open={!!finalizeOrder} onOpenChange={open=>!open&&setFinalizeOrder(null)}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Finalize Order & Create Invoice</DialogTitle></DialogHeader>{finalizeOrder&&(<div className="space-y-4 py-2"><div className="bg-muted/40 rounded-md p-3 text-sm space-y-1"><p><span className="text-muted-foreground">Customer:</span> <strong>{finalizeOrder.customer_name}</strong></p><p><span className="text-muted-foreground">Item:</span> <strong>{finalizeOrder.finished_item_name}</strong></p><p><span className="text-muted-foreground">Total Job Cost:</span> <strong>₹{fmt(finalizeOrder.total_job_cost)}</strong></p>{finalizeOrder.advance_amount>0&&<p><span className="text-muted-foreground">Advance Paid:</span> <strong>₹{fmt(finalizeOrder.advance_amount)}</strong></p>}</div><div className="space-y-1"><Label>Invoice Date *</Label><Input type="date" value={finalizeDate} onChange={e=>setFinalizeDate(e.target.value)}/></div><div className="space-y-1"><Label>Sale Price (₹) *</Label><Input type="number" value={finalizeSalePrice} onChange={e=>setFinalizeSalePrice(Number(e.target.value))}/></div>{finalizeOrder.advance_amount>0&&<div className="bg-blue-50 dark:bg-blue-950/30 rounded p-2 text-sm">Balance due after advance: <strong>₹{fmt(finalizeSalePrice-finalizeOrder.advance_amount)}</strong></div>}<div className="space-y-1"><Label>Narration</Label><Input value={finalizeNarration} onChange={e=>setFinalizeNarration(e.target.value)} placeholder="Optional..."/></div><p className="text-xs text-muted-foreground">This will create a Sales Invoice with one line item: "{finalizeOrder.finished_item_name}". The job cost (₹{fmt(finalizeOrder.total_job_cost)}) will be posted as COGS automatically.</p></div>)}<DialogFooter><Button variant="outline" onClick={()=>setFinalizeOrder(null)}>Cancel</Button><Button onClick={handleFinalize} disabled={finalizing}>{finalizing?'Creating Invoice...':'Finalize & Create Invoice'}</Button></DialogFooter></DialogContent></Dialog>
            {paymentInvoice&&<PaymentManagementDialog mode="receipt" open={!!paymentInvoice} onOpenChange={open=>!open&&setPaymentInvoice(null)} invoiceId={paymentInvoice.id} invoiceNo={paymentInvoice.no} invoiceAmount={paymentInvoice.amount} invoiceDate={paymentInvoice.date} partyName={paymentInvoice.partyName} onSuccess={()=>{toast.success('Payment recorded successfully');setPaymentInvoice(null);loadOrders();}}/>}
            <CustomerDialog
                open={showCreateCustomer}
                onOpenChange={setShowCreateCustomer}
                customerToEdit={null}
                onSave={handleCreateCustomerSave}
                initialName={newCustomerName}
            />
        </div>
    );
}
