import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Combobox } from "@/components/ui/combobox";
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
    IconRefresh, IconX, IconCurrencyRupee, IconEye, IconClock,
} from "@tabler/icons-react";
import PaymentManagementDialog from '@/components/dialogs/PaymentManagementDialog';
import { useSelector } from "react-redux";
import { RootState } from "../store";

// ─────────────────────────── Types ───────────────────────────

interface CustomOrder {
    id: string;
    order_no: string;
    order_date: string;
    delivery_date?: string;
    customer_id: string;
    customer_name: string;
    status: string; // 'pending' | 'delivered'
    finished_item_name: string;
    finished_item_qty: number;
    finished_item_unit?: string;
    sale_price: number;
    advance_amount: number;
    advance_voucher_id?: string;
    total_material_cost: number;
    total_purchase_cost: number;
    total_service_cost: number;
    total_job_cost: number;
    final_invoice_id?: string;
    final_invoice_no?: string;
    payment_status: string; // 'paid' | 'partially_paid' | 'unpaid'
    total_paid: number;
    balance_due: number;
    narration?: string;
    created_at: string;
}

interface CustomOrderDetail {
    order: CustomOrder;
    materials: MaterialRow[];
    purchases: PurchaseRow[];
    services: ServiceRow[];
}

interface MaterialRow {
    id?: string;
    product_id: string;
    product_name?: string;
    product_code?: string;
    description?: string;
    quantity: number;
    unit_id?: string;
    unit_name?: string;
    rate: number;
    amount: number;
}

interface PurchaseRow {
    id?: string;
    description: string;
    supplier_id?: string;
    supplier_name?: string;
    quantity: number;
    unit_id?: string;
    rate: number;
    amount: number;
    expense_account?: string;
    purchase_date?: string;
}

interface ServiceRow {
    id?: string;
    service_id?: string;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
    expense_account?: string;
}

interface Product {
    id: string;
    code: string;
    name: string;
    purchase_rate: number;
    unit_id: string;
    unit_name?: string;
}

interface PartyOption {
    id: string;
    name: string;
    code?: string;
}

interface CashBankAccount {
    id: string;
    name: string;
    account_name?: string;
    account_group?: string;
}

// ─────────────────────────── Helpers ───────────────────────────

const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const today = () => new Date().toISOString().slice(0, 10);

const emptyMaterial = (): MaterialRow => ({ product_id: '', quantity: 1, rate: 0, amount: 0 });
const emptyPurchase = (): PurchaseRow => ({ description: '', supplier_id: '', quantity: 1, rate: 0, amount: 0 });
const emptyService = (): ServiceRow => ({ description: '', quantity: 1, rate: 0, amount: 0 });

// ─────────────────────────── Main Component ───────────────────────────

export default function CustomOrdersPage() {
    const { user } = useSelector((state: RootState) => state.auth);
    const { activeSectionParams } = useSelector((state: RootState) => state.app);

    // Data state
    const [orders, setOrders] = useState<CustomOrder[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<PartyOption[]>([]);
    const [suppliers, setSuppliers] = useState<PartyOption[]>([]);
    const [cashBankAccounts, setCashBankAccounts] = useState<CashBankAccount[]>([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [filterStatus, setFilterStatus] = useState<string>('all');

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('details');
    const [saving, setSaving] = useState(false);

    // Form fields
    const [orderDate, setOrderDate] = useState(today());
    const [deliveryDate, setDeliveryDate] = useState('');
    const [customerId, setCustomerId] = useState('');
    const [finishedItemName, setFinishedItemName] = useState('');
    const [finishedItemQty, setFinishedItemQty] = useState(1);
    const [salePrice, setSalePrice] = useState(0);
    const [narration, setNarration] = useState('');
    const [materials, setMaterials] = useState<MaterialRow[]>([emptyMaterial()]);
    const [purchases, setPurchases] = useState<PurchaseRow[]>([emptyPurchase()]);
    const [services, setServices] = useState<ServiceRow[]>([emptyService()]);

    // Delete
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleteOrderNo, setDeleteOrderNo] = useState('');

    // Advance dialog
    const [advanceOrder, setAdvanceOrder] = useState<CustomOrder | null>(null);
    const [advanceAmount, setAdvanceAmount] = useState('');
    const [advanceDate, setAdvanceDate] = useState(today());
    const [advanceCashBank, setAdvanceCashBank] = useState('');
    const [advanceNarration, setAdvanceNarration] = useState('');
    const [savingAdvance, setSavingAdvance] = useState(false);

    // Finalize dialog
    const [finalizeOrder, setFinalizeOrder] = useState<CustomOrder | null>(null);
    const [finalizeDate, setFinalizeDate] = useState(today());
    const [finalizeSalePrice, setFinalizeSalePrice] = useState(0);
    const [finalizeNarration, setFinalizeNarration] = useState('');
    const [finalizing, setFinalizing] = useState(false);

    // View detail dialog
    const [viewOrderDetail, setViewOrderDetail] = useState<CustomOrderDetail | null>(null);

    // Payment collection dialog
    const [paymentInvoice, setPaymentInvoice] = useState<{
        id: string;
        no: string;
        amount: number;
        date: string;
        partyName: string;
    } | null>(null);

    // ─── Load Orders ───
    const loadOrders = useCallback(async () => {
        setLoading(true);
        try {
            const status = filterStatus === 'all' ? null : filterStatus;
            const data = await invoke<CustomOrder[]>('list_custom_orders', {
                status,
                customerId: null,
                fromDate: null,
                toDate: null,
            });
            setOrders(data);
        } catch (err) {
            toast.error(String(err));
        } finally {
            setLoading(false);
        }
    }, [filterStatus]);

    useEffect(() => {
        loadOrders();
    }, [loadOrders]);

    // Open order directly if navigated with orderId param (e.g. from Sales Voucher)
    useEffect(() => {
        if (activeSectionParams?.orderId) {
            invoke<CustomOrderDetail>('get_custom_order', { id: activeSectionParams.orderId })
                .then(detail => setViewOrderDetail(detail))
                .catch(err => console.error('Failed to load custom order from params:', err));
        }
    }, [activeSectionParams]);

    // ─── Load Reference Data ───
    const loadReferenceData = useCallback(async () => {
        // 1. Load Products
        try {
            const prodData = await invoke<any[]>('get_products');
            setProducts(prodData.map((p: any) => ({
                id: p.id,
                code: p.code || '',
                name: p.name || '',
                purchase_rate: Number(p.purchase_rate) || 0,
                unit_id: p.unit_id || '',
            })));
        } catch (e) {
            console.error('Failed to load products', e);
        }

        // 2. Load Customers
        try {
            const list: PartyOption[] = [];
            const seenCodes = new Set<string>();

            // 1. Primary: Load Accounts Receivable ledger accounts (used for vouchers and accounting)
            const accounts = await invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable'] }).catch(() => []);
            if (Array.isArray(accounts) && accounts.length > 0) {
                accounts.forEach((acc: any) => {
                    const key = acc.account_code || acc.account_name || acc.id;
                    if (!seenCodes.has(key)) {
                        seenCodes.add(key);
                        list.push({
                            id: acc.id,
                            name: acc.account_name || acc.name || 'Unnamed',
                            code: acc.account_code || '',
                        });
                    }
                });
            } else {
                // 2. Fallback: load from customers table
                const custs = await invoke<any[]>('get_customers').catch(() => []);
                if (Array.isArray(custs) && custs.length > 0) {
                    custs.forEach((c: any) => {
                        const key = c.code || c.name || c.id;
                        if (!seenCodes.has(key)) {
                            seenCodes.add(key);
                            list.push({
                                id: c.id,
                                name: c.name || c.account_name || 'Unnamed',
                                code: c.code || '',
                            });
                        }
                    });
                }
            }

            setCustomers(list);
        } catch (e) {
            console.error('Failed to load customers', e);
        }

        // 3. Load Suppliers (Accounts Payable)
        try {
            const suppList: PartyOption[] = [];
            const seenSupp = new Set<string>();

            const accounts = await invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Payable'] }).catch(() => []);
            if (Array.isArray(accounts) && accounts.length > 0) {
                accounts.forEach((acc: any) => {
                    const key = acc.account_code || acc.account_name || acc.id;
                    if (!seenSupp.has(key)) {
                        seenSupp.add(key);
                        suppList.push({
                            id: acc.id,
                            name: acc.account_name || acc.name || 'Unnamed',
                            code: acc.account_code || '',
                        });
                    }
                });
            } else {
                const supps = await invoke<any[]>('get_suppliers').catch(() => []);
                if (Array.isArray(supps) && supps.length > 0) {
                    supps.forEach((s: any) => {
                        const key = s.code || s.name || s.id;
                        if (!seenSupp.has(key)) {
                            seenSupp.add(key);
                            suppList.push({
                                id: s.id,
                                name: s.name || 'Unnamed',
                                code: s.code || '',
                            });
                        }
                    });
                }
            }
            setSuppliers(suppList);
        } catch (e) {
            console.error('Failed to load suppliers', e);
        }

        // 4. Load Cash/Bank Accounts
        try {
            const cb = await invoke<any[]>('get_cash_bank_accounts').catch(() => []);
            const mappedCb: CashBankAccount[] = (cb || []).map((a: any) => ({
                id: a.id,
                name: a.name || a.account_name || 'Cash',
                account_group: a.account_group || '',
            }));
            setCashBankAccounts(mappedCb);
            if (mappedCb.length > 0) {
                setAdvanceCashBank(mappedCb[0].id);
            }
        } catch (e) {
            console.error('Failed to load cash/bank accounts', e);
        }
    }, []);

    useEffect(() => {
        loadReferenceData();
    }, [loadReferenceData]);

    // ─── Form helpers ───
    const resetForm = () => {
        setEditingId(null);
        setOrderDate(today());
        setDeliveryDate('');
        setCustomerId('');
        setFinishedItemName('');
        setFinishedItemQty(1);
        setSalePrice(0);
        setNarration('');
        setMaterials([emptyMaterial()]);
        setPurchases([emptyPurchase()]);
        setServices([emptyService()]);
        setActiveTab('details');
    };

    const openNewForm = () => {
        resetForm();
        setShowForm(true);
    };

    const openEditForm = async (order: CustomOrder) => {
        if (order.status === 'delivered') {
            toast.error('Delivered orders cannot be edited');
            return;
        }
        try {
            const detail = await invoke<CustomOrderDetail>('get_custom_order', { id: order.id });
            setEditingId(order.id);
            setOrderDate(order.order_date);
            setDeliveryDate(order.delivery_date || '');
            setCustomerId(order.customer_id);
            setFinishedItemName(order.finished_item_name);
            setFinishedItemQty(order.finished_item_qty);
            setSalePrice(order.sale_price);
            setNarration(order.narration || '');
            setMaterials(detail.materials.length ? detail.materials : [emptyMaterial()]);
            setPurchases(detail.purchases.length ? detail.purchases : [emptyPurchase()]);
            setServices(detail.services.length ? detail.services : [emptyService()]);
            setActiveTab('details');
            setShowForm(true);
        } catch (err) {
            toast.error(String(err));
        }
    };

    // ─── Computed totals ───
    const matTotal = materials.filter(m => m.product_id).reduce((s, m) => s + m.amount, 0);
    const purTotal = purchases.filter(p => p.description).reduce((s, p) => s + p.amount, 0);
    const svcTotal = services.filter(s => s.description).reduce((s, sv) => s + sv.amount, 0);
    const jobTotal = matTotal + purTotal + svcTotal;
    const margin = salePrice - jobTotal;

    // ─── Row helpers ───
    const updateMaterial = (i: number, field: keyof MaterialRow, value: any) => {
        setMaterials(prev => {
            const rows = [...prev];
            const val = (field === 'quantity' || field === 'rate' || field === 'amount') ? (Number(value) || 0) : value;
            rows[i] = { ...rows[i], [field]: val };
            if (field === 'quantity' || field === 'rate') {
                const q = field === 'quantity' ? Number(value) || 0 : Number(rows[i].quantity) || 0;
                const r = field === 'rate' ? Number(value) || 0 : Number(rows[i].rate) || 0;
                rows[i].amount = Math.round(q * r * 100) / 100;
            }
            if (field === 'product_id') {
                const prod = products.find(p => p.id === value);
                if (prod) {
                    rows[i].rate = Number(prod.purchase_rate) || 0;
                    rows[i].unit_id = prod.unit_id;
                    rows[i].amount = Math.round((Number(rows[i].quantity) || 0) * (Number(prod.purchase_rate) || 0) * 100) / 100;
                    rows[i].product_name = prod.name;
                    rows[i].product_code = prod.code;
                }
            }
            return rows;
        });
    };

    const updatePurchase = (i: number, field: keyof PurchaseRow, value: any) => {
        setPurchases(prev => {
            const rows = [...prev];
            const val = (field === 'quantity' || field === 'rate' || field === 'amount') ? (Number(value) || 0) : value;
            rows[i] = { ...rows[i], [field]: val };
            if (field === 'quantity' || field === 'rate') {
                const q = field === 'quantity' ? Number(value) || 0 : Number(rows[i].quantity) || 0;
                const r = field === 'rate' ? Number(value) || 0 : Number(rows[i].rate) || 0;
                rows[i].amount = Math.round(q * r * 100) / 100;
            }
            return rows;
        });
    };

    const updateService = (i: number, field: keyof ServiceRow, value: any) => {
        setServices(prev => {
            const rows = [...prev];
            const val = (field === 'quantity' || field === 'rate' || field === 'amount') ? (Number(value) || 0) : value;
            rows[i] = { ...rows[i], [field]: val };
            if (field === 'quantity' || field === 'rate') {
                const q = field === 'quantity' ? Number(value) || 0 : Number(rows[i].quantity) || 0;
                const r = field === 'rate' ? Number(value) || 0 : Number(rows[i].rate) || 0;
                rows[i].amount = Math.round(q * r * 100) / 100;
            }
            return rows;
        });
    };

    // ─── Save ───
    const handleSave = async () => {
        if (!customerId) { toast.error('Please select a customer'); return; }
        if (!finishedItemName.trim()) { toast.error('Finished item name is required'); return; }

        const payload = {
            order_date: orderDate,
            delivery_date: deliveryDate || null,
            customer_id: customerId,
            finished_item_name: finishedItemName,
            finished_item_qty: Number(finishedItemQty) || 1,
            finished_item_unit: null,
            sale_price: Number(salePrice) || 0,
            narration: narration || null,
            materials: materials.filter(m => m.product_id).map(m => ({
                product_id: m.product_id,
                description: m.description || null,
                quantity: Number(m.quantity) || 0,
                unit_id: m.unit_id || null,
                rate: Number(m.rate) || 0,
                amount: Number(m.amount) || 0,
            })),
            purchases: purchases.filter(p => p.description && p.description.trim()).map(p => ({
                description: p.description.trim(),
                supplier_id: p.supplier_id || null,
                quantity: Number(p.quantity) || 0,
                unit_id: null,
                rate: Number(p.rate) || 0,
                amount: Number(p.amount) || 0,
                expense_account: null,
                purchase_date: p.purchase_date || null,
            })),
            services: services.filter(s => s.description && s.description.trim()).map(s => ({
                service_id: s.service_id || null,
                description: s.description.trim(),
                quantity: Number(s.quantity) || 0,
                rate: Number(s.rate) || 0,
                amount: Number(s.amount) || 0,
                expense_account: null,
            })),
            user_id: user?.id || null,
        };

        setSaving(true);
        try {
            if (editingId) {
                await invoke('update_custom_order', { id: editingId, data: payload });
                toast.success('Order updated');
            } else {
                await invoke('create_custom_order', { data: payload });
                toast.success('Order created');
            }
            setShowForm(false);
            loadOrders();
        } catch (err) {
            toast.error(String(err));
        } finally {
            setSaving(false);
        }
    };

    // ─── Delete ───
    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await invoke('delete_custom_order', { id: deleteId });
            toast.success('Order deleted');
            setDeleteId(null);
            loadOrders();
        } catch (err) {
            toast.error(String(err));
            setDeleteId(null);
        }
    };

    // ─── Advance ───
    const handleSaveAdvance = async () => {
        if (!advanceOrder) return;
        if (!advanceAmount || Number(advanceAmount) <= 0) { toast.error('Enter a valid amount'); return; }
        if (!advanceCashBank) { toast.error('Select a cash/bank account'); return; }
        setSavingAdvance(true);
        try {
            await invoke('record_custom_order_advance', {
                payload: {
                    order_id: advanceOrder.id,
                    amount: Number(advanceAmount),
                    payment_date: advanceDate,
                    cash_bank_account_id: advanceCashBank,
                    narration: advanceNarration || null,
                    user_id: user?.id || null,
                },
            });
            toast.success('Advance recorded');
            setAdvanceOrder(null);
            loadOrders();
        } catch (err) {
            toast.error(String(err));
        } finally {
            setSavingAdvance(false);
        }
    };

    // ─── Finalize ───
    const openFinalize = (order: CustomOrder) => {
        setFinalizeOrder(order);
        setFinalizeDate(today());
        setFinalizeSalePrice(order.sale_price);
        setFinalizeNarration('');
    };

    const handleFinalize = async () => {
        if (!finalizeOrder) return;
        setFinalizing(true);
        try {
            await invoke<string>('finalize_custom_order', {
                payload: {
                    order_id: finalizeOrder.id,
                    voucher_date: finalizeDate,
                    sale_price: Number(finalizeSalePrice) || 0,
                    tax_rate: 0,
                    gst_disabled: true,
                    narration: finalizeNarration || null,
                    user_id: user?.id || null,
                },
            });
            toast.success('Order finalized! Invoice created.');
            setFinalizeOrder(null);
            loadOrders();
        } catch (err) {
            toast.error(String(err));
        } finally {
            setFinalizing(false);
        }
    };

    // ─── View Order ───
    const openViewOrder = async (order: CustomOrder) => {
        try {
            const detail = await invoke<CustomOrderDetail>('get_custom_order', { id: order.id });
            setViewOrderDetail(detail);
        } catch (err) {
            toast.error(String(err));
        }
    };

    // ─── Collect Payment ───
    const openCollectPayment = (order: CustomOrder) => {
        if (!order.final_invoice_id) {
            toast.error('No invoice generated for this order yet.');
            return;
        }
        setPaymentInvoice({
            id: order.final_invoice_id,
            no: order.final_invoice_no || order.order_no,
            amount: order.sale_price,
            date: order.delivery_date || order.order_date,
            partyName: order.customer_name,
        });
    };

    // ─── Filtered list ───
    const filteredOrders = orders.filter(o =>
        filterStatus === 'all' || o.status === filterStatus
    );

    // ─────────────────────────── Render: View Order Page ───────────────────────────
    if (viewOrderDetail) {
        const o = viewOrderDetail.order;
        const grossMargin = o.sale_price - o.total_job_cost;
        return (
            <div className="flex flex-col h-full overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b shrink-0 bg-background">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={() => setViewOrderDetail(null)}>
                            <IconX size={16} className="mr-1" /> Back to Orders
                        </Button>
                        <h1 className="text-xl font-semibold flex items-center gap-2">
                            <IconScissors size={20} className="text-primary" />
                            <span>Order {o.order_no}</span>
                        </h1>
                        <Badge variant={o.status === 'delivered' ? 'default' : 'secondary'} className="gap-1">
                            {o.status === 'delivered' ? (
                                <><IconCheck size={13} /> Delivered</>
                            ) : (
                                <><IconClock size={13} /> Pending</>
                            )}
                        </Badge>
                        {o.payment_status === 'paid' ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 gap-1">
                                <IconCheck size={13} /> Paid
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="gap-1">
                                <IconClock size={13} /> Pending
                            </Badge>
                        )}
                    </div>
                    {o.status === 'delivered' && (o.balance_due ?? 0) > 0 && o.final_invoice_id && (
                        <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5"
                            onClick={() => openCollectPayment(o)}
                        >
                            <IconCurrencyRupee size={15} /> Collect Remaining (₹{fmt(o.balance_due || 0)})
                        </Button>
                    )}
                </div>

                {/* Info Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-4 p-4 border-b bg-muted/20 shrink-0 text-sm">
                    <div>
                        <span className="text-xs text-muted-foreground block">Customer</span>
                        <strong className="text-foreground">{o.customer_name}</strong>
                    </div>
                    <div>
                        <span className="text-xs text-muted-foreground block">Finished Item</span>
                        <strong className="text-foreground">{o.finished_item_name} {o.finished_item_qty > 1 ? `(${o.finished_item_qty})` : ''}</strong>
                    </div>
                    <div>
                        <span className="text-xs text-muted-foreground block">Order Date</span>
                        <span className="text-foreground">{o.order_date}</span>
                    </div>
                    <div>
                        <span className="text-xs text-muted-foreground block">Delivery Date</span>
                        <span className="text-foreground">{o.delivery_date || '—'}</span>
                    </div>
                    <div>
                        <span className="text-xs text-muted-foreground block">Invoiced Price</span>
                        <strong className="text-base text-primary">₹{fmt(o.sale_price)}</strong>
                    </div>
                    <div>
                        <span className="text-xs text-muted-foreground block">Advance Paid</span>
                        <span className="text-foreground">{o.advance_amount > 0 ? `₹${fmt(o.advance_amount)}` : 'None'}</span>
                    </div>
                    <div>
                        <span className="text-xs text-muted-foreground block">Balance Due</span>
                        <strong className={`text-base ${(o.balance_due ?? 0) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                            ₹{fmt(o.balance_due || 0)}
                        </strong>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-4 space-y-6">
                    {/* Cost Breakdown Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="p-3 bg-muted/30 rounded-lg border">
                            <span className="text-xs text-muted-foreground">Stock Materials</span>
                            <p className="font-semibold text-lg mt-1">₹{fmt(o.total_material_cost)}</p>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-lg border">
                            <span className="text-xs text-muted-foreground">Direct Purchases</span>
                            <p className="font-semibold text-lg mt-1">₹{fmt(o.total_purchase_cost)}</p>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-lg border">
                            <span className="text-xs text-muted-foreground">Services & Labour</span>
                            <p className="font-semibold text-lg mt-1">₹{fmt(o.total_service_cost)}</p>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-lg border">
                            <span className="text-xs text-muted-foreground">Total Job Cost</span>
                            <p className="font-semibold text-lg mt-1">₹{fmt(o.total_job_cost)}</p>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-lg border">
                            <span className="text-xs text-muted-foreground">Gross Profit</span>
                            <p className={`font-semibold text-lg mt-1 ${grossMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ₹{fmt(grossMargin)}
                            </p>
                        </div>
                    </div>

                    {/* Stock Materials Section */}
                    {viewOrderDetail.materials.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                <IconPackage size={16} className="text-primary" />
                                Stock Materials Consumed ({viewOrderDetail.materials.length})
                            </h3>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="text-left p-3 font-medium">Product</th>
                                            <th className="text-left p-3 font-medium">Unit</th>
                                            <th className="text-right p-3 font-medium">Quantity</th>
                                            <th className="text-right p-3 font-medium">Rate</th>
                                            <th className="text-right p-3 font-medium">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {viewOrderDetail.materials.map((m, idx) => (
                                            <tr key={idx} className="border-t hover:bg-muted/10">
                                                <td className="p-3">
                                                    <span className="font-medium">{m.product_name || m.product_code}</span>
                                                    {m.description && <span className="text-xs text-muted-foreground block">{m.description}</span>}
                                                </td>
                                                <td className="p-3 text-muted-foreground">{m.unit_name || '—'}</td>
                                                <td className="p-3 text-right">{m.quantity}</td>
                                                <td className="p-3 text-right">₹{fmt(m.rate)}</td>
                                                <td className="p-3 text-right font-medium">₹{fmt(m.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Direct Purchases Section */}
                    {viewOrderDetail.purchases.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                <IconShoppingBag size={16} className="text-primary" />
                                Direct Purchases ({viewOrderDetail.purchases.length})
                            </h3>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="text-left p-3 font-medium">Description</th>
                                            <th className="text-left p-3 font-medium">Supplier</th>
                                            <th className="text-right p-3 font-medium">Quantity</th>
                                            <th className="text-right p-3 font-medium">Rate</th>
                                            <th className="text-right p-3 font-medium">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {viewOrderDetail.purchases.map((p, idx) => (
                                            <tr key={idx} className="border-t hover:bg-muted/10">
                                                <td className="p-3 font-medium">{p.description}</td>
                                                <td className="p-3 text-muted-foreground">{p.supplier_name || '—'}</td>
                                                <td className="p-3 text-right">{p.quantity}</td>
                                                <td className="p-3 text-right">₹{fmt(p.rate)}</td>
                                                <td className="p-3 text-right font-medium">₹{fmt(p.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Services / Labour Section */}
                    {viewOrderDetail.services.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                <IconTools size={16} className="text-primary" />
                                Services & Labour Charges ({viewOrderDetail.services.length})
                            </h3>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="text-left p-3 font-medium">Description</th>
                                            <th className="text-right p-3 font-medium">Quantity</th>
                                            <th className="text-right p-3 font-medium">Rate</th>
                                            <th className="text-right p-3 font-medium">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {viewOrderDetail.services.map((s, idx) => (
                                            <tr key={idx} className="border-t hover:bg-muted/10">
                                                <td className="p-3 font-medium">{s.description}</td>
                                                <td className="p-3 text-right">{s.quantity}</td>
                                                <td className="p-3 text-right">₹{fmt(s.rate)}</td>
                                                <td className="p-3 text-right font-medium">₹{fmt(s.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    {o.narration && (
                        <div className="bg-muted/20 p-4 rounded-lg border text-sm">
                            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider block mb-1">Notes / Instructions</span>
                            <p className="text-foreground">{o.narration}</p>
                        </div>
                    )}
                </div>

                {paymentInvoice && (
                    <PaymentManagementDialog
                        mode="receipt"
                        open={!!paymentInvoice}
                        onOpenChange={open => !open && setPaymentInvoice(null)}
                        invoiceId={paymentInvoice.id}
                        invoiceNo={paymentInvoice.no}
                        invoiceAmount={paymentInvoice.amount}
                        invoiceDate={paymentInvoice.date}
                        partyName={paymentInvoice.partyName}
                        onSuccess={() => {
                            toast.success('Payment recorded successfully');
                            setPaymentInvoice(null);
                            loadOrders();
                            openViewOrder(o);
                        }}
                    />
                )}
            </div>
        );
    }

    // ─────────────────────────── Render: Form Page ───────────────────────────
    if (showForm) {
        return (
            <div className="flex flex-col h-full overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b shrink-0">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                            <IconX size={16} className="mr-1" /> Back
                        </Button>
                        <h1 className="text-xl font-semibold">
                            {editingId ? 'Edit Custom Order' : 'New Custom Order'}
                        </h1>
                    </div>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : editingId ? 'Update Order' : 'Save Order'}
                    </Button>
                </div>

                {/* Summary bar */}
                <div className="flex gap-6 px-4 py-2 bg-muted/40 border-b shrink-0 text-sm flex-wrap">
                    <span>Materials: <strong>₹{fmt(matTotal)}</strong></span>
                    <span>Purchases: <strong>₹{fmt(purTotal)}</strong></span>
                    <span>Services: <strong>₹{fmt(svcTotal)}</strong></span>
                    <span className="font-semibold">Job Cost: <strong>₹{fmt(jobTotal)}</strong></span>
                    <span>Sale Price: <strong>₹{fmt(salePrice)}</strong></span>
                    <span className={margin >= 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                        Margin: ₹{fmt(margin)}
                    </span>
                </div>

                {/* Tabs */}
                <div className="flex-1 overflow-auto p-4">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="mb-4">
                            <TabsTrigger value="details"><IconScissors size={14} className="mr-1" />Order Details</TabsTrigger>
                            <TabsTrigger value="materials"><IconPackage size={14} className="mr-1" />Stock Used ({materials.filter(m => m.product_id).length})</TabsTrigger>
                            <TabsTrigger value="purchases"><IconShoppingBag size={14} className="mr-1" />Direct Purchases ({purchases.filter(p => p.description).length})</TabsTrigger>
                            <TabsTrigger value="services"><IconTools size={14} className="mr-1" />Services / Charges ({services.filter(s => s.description).length})</TabsTrigger>
                        </TabsList>

                        {/* ── Tab 1: Order Details ── */}
                        <TabsContent value="details" className="space-y-4 max-w-2xl">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label>Customer *</Label>
                                    <Combobox
                                        options={customers.map(c => ({
                                            value: c.id,
                                            label: c.code ? `${c.code} - ${c.name}` : c.name,
                                            searchString: `${c.code || ''} ${c.name}`,
                                        }))}
                                        value={customerId}
                                        onChange={val => setCustomerId(String(val))}
                                        placeholder="Select customer..."
                                        searchPlaceholder="Search customer by name or code..."
                                        className="w-full"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label>Order Date *</Label>
                                    <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <Label>Delivery Date</Label>
                                    <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <Label>Sale Price (₹) *</Label>
                                    <Input
                                        type="number"
                                        value={salePrice || ''}
                                        onChange={e => setSalePrice(Number(e.target.value))}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <Label>Finished Item Name * (appears on invoice)</Label>
                                    <Input
                                        value={finishedItemName}
                                        onChange={e => setFinishedItemName(e.target.value)}
                                        placeholder="e.g. Bridal Dress, Lehenga Set..."
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label>Quantity</Label>
                                    <Input
                                        type="number"
                                        value={finishedItemQty}
                                        onChange={e => setFinishedItemQty(Number(e.target.value))}
                                        min={1}
                                    />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <Label>Narration / Notes</Label>
                                    <Textarea
                                        value={narration}
                                        onChange={e => setNarration(e.target.value)}
                                        placeholder="Order notes..."
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        {/* ── Tab 2: Stock Used ── */}
                        <TabsContent value="materials">
                            <div className="space-y-2">
                                <div className="grid grid-cols-[2.5fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                                    <span>Product</span><span>Qty</span><span>Rate (₹)</span><span>Amount (₹)</span><span></span>
                                </div>
                                {materials.map((row, i) => (
                                    <div key={i} className="grid grid-cols-[2.5fr_1fr_1fr_1fr_auto] gap-2 items-center">
                                        <Combobox
                                            options={products.map(p => ({
                                                value: p.id,
                                                label: `${p.code} — ${p.name}`,
                                                searchString: `${p.code} ${p.name}`,
                                            }))}
                                            value={row.product_id}
                                            onChange={v => updateMaterial(i, 'product_id', String(v))}
                                            placeholder="Select product..."
                                            searchPlaceholder="Search product..."
                                            className="w-full"
                                        />
                                        <Input type="number" value={row.quantity} min={0}
                                            onChange={e => updateMaterial(i, 'quantity', e.target.value)} />
                                        <Input type="number" value={row.rate} min={0}
                                            onChange={e => updateMaterial(i, 'rate', e.target.value)} />
                                        <Input type="number" value={row.amount} readOnly className="bg-muted/30" />
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                                            onClick={() => setMaterials(prev => prev.filter((_, j) => j !== i))}>
                                            <IconTrash size={14} />
                                        </Button>
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={() => setMaterials(prev => [...prev, emptyMaterial()])}>
                                    <IconPlus size={14} className="mr-1" /> Add Material
                                </Button>
                                <div className="text-right text-sm font-semibold pt-2">
                                    Materials Total: ₹{fmt(matTotal)}
                                </div>
                            </div>
                        </TabsContent>

                        {/* ── Tab 3: Direct Purchases ── */}
                        <TabsContent value="purchases">
                            <p className="text-sm text-muted-foreground mb-3">
                                Items purchased specifically for this order. Selecting a supplier logs Accounts Payable under their ledger; otherwise defaults to Cash.
                            </p>
                            <div className="space-y-2">
                                <div className="grid grid-cols-[2fr_1.8fr_0.8fr_0.8fr_0.8fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                                    <span>Description</span><span>Supplier / Paid Via</span><span>Qty</span><span>Rate (₹)</span><span>Amount (₹)</span><span></span>
                                </div>
                                {purchases.map((row, i) => (
                                    <div key={i} className="grid grid-cols-[2fr_1.8fr_0.8fr_0.8fr_0.8fr_auto] gap-2 items-center">
                                        <Input
                                            value={row.description}
                                            onChange={e => updatePurchase(i, 'description', e.target.value)}
                                            placeholder="e.g. Imported Lace 2m"
                                        />
                                        <Combobox
                                            options={[
                                                { value: '', label: 'Cash (Paid Spot)', searchString: 'Cash Spot Paid Default' },
                                                ...suppliers.map(s => ({
                                                    value: s.id,
                                                    label: s.code ? `${s.code} - ${s.name}` : s.name,
                                                    searchString: `${s.code || ''} ${s.name}`,
                                                })),
                                            ]}
                                            value={row.supplier_id || ''}
                                            onChange={val => updatePurchase(i, 'supplier_id', String(val))}
                                            placeholder="Cash (Paid Spot)"
                                            searchPlaceholder="Search supplier or Cash..."
                                            className="w-full"
                                        />
                                        <Input type="number" value={row.quantity} min={0}
                                            onChange={e => updatePurchase(i, 'quantity', e.target.value)} />
                                        <Input type="number" value={row.rate} min={0}
                                            onChange={e => updatePurchase(i, 'rate', e.target.value)} />
                                        <Input type="number" value={row.amount} readOnly className="bg-muted/30" />
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                                            onClick={() => setPurchases(prev => prev.filter((_, j) => j !== i))}>
                                            <IconTrash size={14} />
                                        </Button>
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={() => setPurchases(prev => [...prev, emptyPurchase()])}>
                                    <IconPlus size={14} className="mr-1" /> Add Purchase
                                </Button>
                                <div className="text-right text-sm font-semibold pt-2">
                                    Purchases Total: ₹{fmt(purTotal)}
                                </div>
                            </div>
                        </TabsContent>

                        {/* ── Tab 4: Services / Charges ── */}
                        <TabsContent value="services">
                            <p className="text-sm text-muted-foreground mb-3">
                                Labour and service charges. e.g. Stitching, Handwork, Embroidery.
                            </p>
                            <div className="space-y-2">
                                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                                    <span>Description</span><span>Qty</span><span>Rate (₹)</span><span>Amount (₹)</span><span></span>
                                </div>
                                {services.map((row, i) => (
                                    <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-center">
                                        <Input
                                            value={row.description}
                                            onChange={e => updateService(i, 'description', e.target.value)}
                                            placeholder="e.g. Stitching Charges"
                                        />
                                        <Input type="number" value={row.quantity} min={0}
                                            onChange={e => updateService(i, 'quantity', e.target.value)} />
                                        <Input type="number" value={row.rate} min={0}
                                            onChange={e => updateService(i, 'rate', e.target.value)} />
                                        <Input type="number" value={row.amount} readOnly className="bg-muted/30" />
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                                            onClick={() => setServices(prev => prev.filter((_, j) => j !== i))}>
                                            <IconTrash size={14} />
                                        </Button>
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" onClick={() => setServices(prev => [...prev, emptyService()])}>
                                    <IconPlus size={14} className="mr-1" /> Add Charge
                                </Button>
                                <div className="text-right text-sm font-semibold pt-2">
                                    Services Total: ₹{fmt(svcTotal)}
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        );
    }

    // ─── List View ───
    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b shrink-0">
                <div className="flex items-center gap-3">
                    <IconScissors size={22} className="text-primary" />
                    <h1 className="text-xl font-semibold">Custom Orders</h1>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Orders</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="delivered">Delivered</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" onClick={loadOrders}>
                        <IconRefresh size={16} />
                    </Button>
                    <Button onClick={openNewForm}>
                        <IconPlus size={16} className="mr-1" /> New Order
                    </Button>
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-40 text-muted-foreground">Loading...</div>
                ) : filteredOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                        <IconScissors size={40} className="mb-2 opacity-20" />
                        <p>No custom orders yet.</p>
                        <Button variant="outline" className="mt-3" onClick={openNewForm}>
                            <IconPlus size={14} className="mr-1" /> Create First Order
                        </Button>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-muted/40 sticky top-0">
                            <tr>
                                <th className="text-left p-3 font-medium">Order No</th>
                                <th className="text-left p-3 font-medium">Date</th>
                                <th className="text-left p-3 font-medium">Customer</th>
                                <th className="text-left p-3 font-medium">Item</th>
                                <th className="text-left p-3 font-medium">Delivery</th>
                                <th className="text-left p-3 font-medium">Status</th>
                                <th className="text-left p-3 font-medium">Payment</th>
                                <th className="text-right p-3 font-medium">Sale Price</th>
                                <th className="text-center p-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredOrders.map(order => {
                                return (
                                    <tr key={order.id} className="border-b hover:bg-muted/20 transition-colors">
                                        <td className="p-3 font-mono text-xs">{order.order_no}</td>
                                        <td className="p-3">{order.order_date}</td>
                                        <td className="p-3">{order.customer_name}</td>
                                        <td className="p-3">{order.finished_item_name}</td>
                                        <td className="p-3 text-muted-foreground">{order.delivery_date || '—'}</td>
                                        <td className="p-3">
                                            <Badge variant={order.status === 'delivered' ? 'default' : 'secondary'} className="gap-1">
                                                {order.status === 'delivered' ? (
                                                    <><IconCheck size={12} /> Delivered</>
                                                ) : (
                                                    <><IconClock size={12} /> Pending</>
                                                )}
                                            </Badge>
                                        </td>
                                        <td className="p-3">
                                            {order.payment_status === 'paid' ? (
                                                <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 gap-1">
                                                    <IconCheck size={12} /> Paid
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary" className="gap-1">
                                                    <IconClock size={12} /> Pending
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="p-3 text-right">₹{fmt(order.sale_price)}</td>
                                        <td className="p-3">
                                            <div className="flex items-center justify-center gap-1">
                                                {order.status === 'pending' && (
                                                    <>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7"
                                                            title="Edit" onClick={() => openEditForm(order)}>
                                                            <IconEdit size={14} />
                                                        </Button>
                                                        {!order.advance_voucher_id && (
                                                            <Button variant="ghost" size="icon" className="h-7 w-7"
                                                                title="Record Advance" onClick={() => {
                                                                    setAdvanceOrder(order);
                                                                    setAdvanceAmount('');
                                                                    setAdvanceDate(today());
                                                                    setAdvanceNarration('');
                                                                    if (cashBankAccounts.length > 0 && !advanceCashBank) {
                                                                        setAdvanceCashBank(cashBankAccounts[0].id);
                                                                    }
                                                                }}>
                                                                <IconCurrencyRupee size={14} />
                                                            </Button>
                                                        )}
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary"
                                                            title="Finalize & Invoice" onClick={() => openFinalize(order)}>
                                                            <IconCheck size={14} />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                                            title="Delete" onClick={() => {
                                                                setDeleteId(order.id);
                                                                setDeleteOrderNo(order.order_no);
                                                            }}>
                                                            <IconTrash size={14} />
                                                        </Button>
                                                    </>
                                                )}
                                                {order.status === 'delivered' && (
                                                    <>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary"
                                                            title="View Completed Order" onClick={() => openViewOrder(order)}>
                                                            <IconEye size={15} />
                                                        </Button>
                                                        {(order.balance_due ?? 0) > 0 && order.final_invoice_id && (
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                                                                title={`Collect Remaining Payment (Due: ₹${fmt(order.balance_due || 0)})`} onClick={() => openCollectPayment(order)}>
                                                                <IconCurrencyRupee size={15} />
                                                            </Button>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Delete dialog */}
            <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Custom Order?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will delete order <strong>{deleteOrderNo}</strong> and reverse all stock deductions. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Advance dialog */}
            <Dialog open={!!advanceOrder} onOpenChange={open => !open && setAdvanceOrder(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Record Advance Payment</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <p className="text-sm text-muted-foreground">
                            Customer: <strong>{advanceOrder?.customer_name}</strong><br />
                            Order: <strong>{advanceOrder?.order_no}</strong>
                        </p>
                        <div className="space-y-1">
                            <Label>Advance Amount (₹) *</Label>
                            <Input type="number" value={advanceAmount}
                                onChange={e => setAdvanceAmount(e.target.value)} placeholder="0.00" />
                        </div>
                        <div className="space-y-1">
                            <Label>Payment Date *</Label>
                            <Input type="date" value={advanceDate} onChange={e => setAdvanceDate(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label>Cash / Bank Account *</Label>
                            <Select value={advanceCashBank} onValueChange={setAdvanceCashBank}>
                                <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                                <SelectContent>
                                    {cashBankAccounts.map(a => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {a.name || a.account_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Narration</Label>
                            <Input value={advanceNarration} onChange={e => setAdvanceNarration(e.target.value)}
                                placeholder="Optional note..." />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAdvanceOrder(null)}>Cancel</Button>
                        <Button onClick={handleSaveAdvance} disabled={savingAdvance}>
                            {savingAdvance ? 'Saving...' : 'Record Advance'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Finalize dialog */}
            <Dialog open={!!finalizeOrder} onOpenChange={open => !open && setFinalizeOrder(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Finalize Order & Create Invoice</DialogTitle>
                    </DialogHeader>
                    {finalizeOrder && (
                        <div className="space-y-4 py-2">
                            <div className="bg-muted/40 rounded-md p-3 text-sm space-y-1">
                                <p><span className="text-muted-foreground">Customer:</span> <strong>{finalizeOrder.customer_name}</strong></p>
                                <p><span className="text-muted-foreground">Item:</span> <strong>{finalizeOrder.finished_item_name}</strong></p>
                                <p><span className="text-muted-foreground">Total Job Cost:</span> <strong>₹{fmt(finalizeOrder.total_job_cost)}</strong></p>
                                {finalizeOrder.advance_amount > 0 && (
                                    <p><span className="text-muted-foreground">Advance Paid:</span> <strong>₹{fmt(finalizeOrder.advance_amount)}</strong></p>
                                )}
                            </div>
                            <div className="space-y-1">
                                <Label>Invoice Date *</Label>
                                <Input type="date" value={finalizeDate} onChange={e => setFinalizeDate(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <Label>Sale Price (₹) *</Label>
                                <Input type="number" value={finalizeSalePrice}
                                    onChange={e => setFinalizeSalePrice(Number(e.target.value))} />
                            </div>
                            {finalizeOrder.advance_amount > 0 && (
                                <div className="bg-blue-50 dark:bg-blue-950/30 rounded p-2 text-sm">
                                    Balance due after advance: <strong>₹{fmt(finalizeSalePrice - finalizeOrder.advance_amount)}</strong>
                                </div>
                            )}
                            <div className="space-y-1">
                                <Label>Narration</Label>
                                <Input value={finalizeNarration} onChange={e => setFinalizeNarration(e.target.value)}
                                    placeholder="Optional..." />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                This will create a Sales Invoice with one line item: "{finalizeOrder.finished_item_name}". 
                                The job cost (₹{fmt(finalizeOrder.total_job_cost)}) will be posted as COGS automatically.
                            </p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setFinalizeOrder(null)}>Cancel</Button>
                        <Button onClick={handleFinalize} disabled={finalizing}>
                            {finalizing ? 'Creating Invoice...' : 'Finalize & Create Invoice'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Payment Management Dialog for collecting remaining invoice receipts */}
            {paymentInvoice && (
                <PaymentManagementDialog
                    mode="receipt"
                    open={!!paymentInvoice}
                    onOpenChange={open => !open && setPaymentInvoice(null)}
                    invoiceId={paymentInvoice.id}
                    invoiceNo={paymentInvoice.no}
                    invoiceAmount={paymentInvoice.amount}
                    invoiceDate={paymentInvoice.date}
                    partyName={paymentInvoice.partyName}
                    onSuccess={() => {
                        toast.success('Payment recorded successfully');
                        setPaymentInvoice(null);
                        loadOrders();
                    }}
                />
            )}
        </div>
    );
}
