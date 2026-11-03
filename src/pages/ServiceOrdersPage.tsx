import { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    SelectGroup,
    SelectLabel,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    IconDeviceMobile,
    IconPlus,
    IconSearch,
    IconBrandWhatsapp,
    IconTrash,
    IconEye,
    IconTools,
    IconReceipt,
    IconClock,
    IconCheck,
    IconCash,
    IconEdit,
    IconPackage,
    IconChevronLeft,
    IconChevronRight,
    IconList,
    IconDeviceFloppy,
    IconX,
    IconRefresh,
} from '@tabler/icons-react';
import { useMoney } from '@/hooks/useMoney';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import CustomerDialog from '@/components/dialogs/CustomerDialog';
import SupplierDialog from '@/components/dialogs/SupplierDialog';
import type { Product as TauriProduct, Unit } from '@/lib/tauri';
import {
    buildProductComboboxOption,
    getProductComboboxHeaderColumns,
    getProductComboboxWidthClass,
    type ProductComboboxDisplaySettings,
    DEFAULT_COMBOBOX_DISPLAY_SETTINGS,
    type ProductComboboxColumnWidths,
    DEFAULT_COMBOBOX_COLUMN_WIDTHS,
} from '@/lib/combobox-helpers';

// ==================== INTERFACES ====================

type ServiceOrderMode = 'list' | 'new' | 'viewing' | 'editing';

interface ServiceOrder {
    id: string;
    order_no: string;
    order_date: string;
    expected_date?: string | null;
    customer_id: string;
    customer_name: string;
    customer_phone?: string | null;
    device_brand?: string | null;
    device_model?: string | null;
    device_imei?: string | null;
    device_color?: string | null;
    device_condition?: string | null;
    security_pin_pattern?: string | null;
    complaint: string;
    technician_notes?: string | null;
    assigned_to?: string | null;
    technician_name?: string | null;
    commission_type?: string | null;
    commission_rate: number;
    commission_amount: number;
    estimated_cost: number;
    advance_amount: number;
    advance_voucher_id?: string | null;
    total_parts_cost: number;
    total_parts_billed: number;
    total_labour_cost: number;
    discount_rate?: number;
    discount_amount?: number;
    total_amount: number;
    final_invoice_id?: string | null;
    final_invoice_no?: string | null;
    status: string;
    payment_status: string;
    total_paid: number;
    balance_due: number;
    reference?: string | null;
    narration?: string | null;
    created_at: string;
    updated_at: string;
}

interface ServiceOrderPart {
    id: string;
    order_id: string;
    product_id: string;
    product_name: string;
    product_code: string;
    description?: string | null;
    quantity: number;
    unit_id?: string | null;
    unit_name?: string | null;
    cost_rate: number;
    cost_amount: number;
    selling_rate: number;
    selling_amount: number;
    stock_journal_id?: string | null;
    created_at: string;
}

interface ServiceOrderLabour {
    id: string;
    order_id: string;
    service_id?: string | null;
    service_name?: string | null;
    description: string;
    quantity: number;
    rate: number;
    amount: number;
    created_at: string;
}

interface ServiceOrderStatusLog {
    id: string;
    order_id: string;
    old_status?: string | null;
    new_status: string;
    notes?: string | null;
    changed_by?: string | null;
    changed_at: string;
}

interface ServiceOrderDetail {
    order: ServiceOrder;
    parts: ServiceOrderPart[];
    labour: ServiceOrderLabour[];
    status_log: ServiceOrderStatusLog[];
}

interface CustomerOption {
    id: string;
    name: string;
    phone?: string;
}

interface EmployeeOption {
    id: string;
    name: string;
}

interface ServiceMasterOption {
    id: string;
    code?: string;
    name: string;
    sales_rate: number;
}

interface AccountOption {
    id: string;
    name: string;
}

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
    received: { label: 'Received', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    in_progress: { label: 'In Progress', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
    waiting_parts: { label: 'Waiting Parts', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
    ready: { label: 'Ready', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
    delivered: { label: 'Delivered', badge: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
    cancelled: { label: 'Cancelled', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200' },
};

export default function ServiceOrdersPage() {
    const money = useMoney();

    // Mode: 'list' | 'new' | 'viewing' | 'editing'
    const [mode, setMode] = useState<ServiceOrderMode>('list');
    const [currentOrder, setCurrentOrder] = useState<ServiceOrder | null>(null);
    const [currentDetail, setCurrentDetail] = useState<ServiceOrderDetail | null>(null);
    const [nextOrderNo, setNextOrderNo] = useState<string>('');
    const [activeTab, setActiveTab] = useState<string>('device');

    // Data lists
    const [orders, setOrders] = useState<ServiceOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Masters
    const [customers, setCustomers] = useState<CustomerOption[]>([]);
    const [employees, setEmployees] = useState<EmployeeOption[]>([]);
    const [products, setProducts] = useState<TauriProduct[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [brands, setBrands] = useState<any[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [suppliers, setSuppliers] = useState<AccountOption[]>([]);
    const [stockMap, setStockMap] = useState<Record<string, number>>({});
    const [comboboxDisplaySettings, setComboboxDisplaySettings] = useState<ProductComboboxDisplaySettings>(DEFAULT_COMBOBOX_DISPLAY_SETTINGS);
    const [columnWidths, setColumnWidths] = useState<ProductComboboxColumnWidths>(DEFAULT_COMBOBOX_COLUMN_WIDTHS);
    const [servicesList, setServicesList] = useState<ServiceMasterOption[]>([]);
    const [paymentAccounts, setPaymentAccounts] = useState<AccountOption[]>([]);

    // Form State (for mode === 'new' or mode === 'editing')
    const [formData, setFormData] = useState({
        customerId: '',
        orderDate: new Date().toISOString().split('T')[0],
        expectedDate: '',
        reference: '',
        deviceBrand: '',
        deviceModel: '',
        deviceImei: '',
        deviceColor: '',
        deviceCondition: '',
        securityPinPattern: '',
        complaint: '',
        technicianNotes: '',
        assignedTo: '',
        commissionType: 'percentage',
        commissionRate: 20,
        estimatedCost: 0,
        discountRate: 0,
        discountAmount: 0,
        collectAdvance: false,
        advanceAmount: 0,
        cashBankAccount: '',
    });

    const [formParts, setFormParts] = useState<{
        id?: string;
        productId: string;
        productName: string;
        productCode: string;
        description: string;
        quantity: number;
        costRate: number;
        sellingRate: number;
        sellingAmount: number;
        unitId?: string | null;
    }[]>([]);

    const [formLabour, setFormLabour] = useState<{
        id?: string;
        serviceId?: string | null;
        description: string;
        quantity: number;
        rate: number;
        amount: number;
    }[]>([]);

    const [saving, setSaving] = useState(false);

    // In-line adding Part & Labour state
    const [quickPartActiveRow, setQuickPartActiveRow] = useState<number | null>(null);

    // Modals (Auxiliary only)
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [newStatusValue, setNewStatusValue] = useState('in_progress');
    const [statusNotes, setStatusNotes] = useState('');

    const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
    const [collectPayment, setCollectPayment] = useState(true);
    const [finalizeAccount, setFinalizeAccount] = useState('');
    const [finalizeAmount, setFinalizeAmount] = useState<number>(0);
    const [finalizeDiscountRate, setFinalizeDiscountRate] = useState<number>(0);
    const [finalizeDiscountAmount, setFinalizeDiscountAmount] = useState<number>(0);

    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');

    const [showCreateSupplier, setShowCreateSupplier] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState('');

    const [quickAddPartOpen, setQuickAddPartOpen] = useState(false);
    const [quickPartName, setQuickPartName] = useState('');
    const [quickPartGroupId, setQuickPartGroupId] = useState('');
    const [quickPartUnitId, setQuickPartUnitId] = useState('');
    const [quickPartCostRate, setQuickPartCostRate] = useState<number>(0);
    const [quickPartSellingRate, setQuickPartSellingRate] = useState<number>(0);
    const [quickPartQty, setQuickPartQty] = useState<number>(1);
    const [quickPartPaidFrom, setQuickPartPaidFrom] = useState('');
    const [quickPartBillRef, setQuickPartBillRef] = useState('');
    const [quickPartSaving, setQuickPartSaving] = useState(false);

    // Customer / Supplier created callbacks
    const handleCustomerCreated = async (newCust?: any) => {
        try {
            await loadMasters();
            if (newCust) {
                const accounts = await invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable'] }).catch(() => []);
                const found = (accounts || []).find((acc: any) => acc.account_name === newCust.name || acc.name === newCust.name);
                if (found) {
                    setFormData(f => ({ ...f, customerId: found.id }));
                } else if (newCust.id) {
                    setFormData(f => ({ ...f, customerId: newCust.id }));
                }
            }
        } catch (e) {
            console.error('Failed to reload customers after creation', e);
        }
        setShowCreateCustomer(false);
    };

    const handleSupplierCreated = async (newSup?: any) => {
        try {
            await loadMasters();
            if (newSup) {
                const accounts = await invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Payable'] }).catch(() => []);
                const found = (accounts || []).find((acc: any) => acc.account_name === newSup.name || acc.name === newSup.name);
                if (found) {
                    setQuickPartPaidFrom(found.id);
                } else if (newSup.id) {
                    setQuickPartPaidFrom(newSup.id);
                }
            }
        } catch (e) {
            console.error('Failed to reload suppliers after creation', e);
        }
        setShowCreateSupplier(false);
    };

    // Load main orders list
    const loadOrders = useCallback(async () => {
        try {
            setLoading(true);
            const data = await invoke<ServiceOrder[]>('list_service_orders', {
                status: null,
                customerId: null,
                technicianId: null,
                fromDate: null,
                toDate: null,
                search: searchTerm ? searchTerm : null,
            });
            setOrders(data || []);
        } catch (e: any) {
            toast.error(e?.toString() || 'Failed to load service orders');
        } finally {
            setLoading(false);
        }
    }, [searchTerm]);

    // Load masters
    const loadMasters = async () => {
        try {
            const [custAccounts, legacyCusts] = await Promise.all([
                invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Receivable'] }).catch(() => []),
                invoke<any[]>('get_customers').catch(() => []),
            ]);

            const phoneByCustId = new Map<string, string>();
            const phoneByName = new Map<string, string>();
            (legacyCusts || []).forEach((c: any) => {
                if (c.phone) {
                    if (c.id) phoneByCustId.set(c.id, c.phone);
                    if (c.name) phoneByName.set(c.name.trim().toLowerCase(), c.phone);
                }
            });

            const list: CustomerOption[] = [];
            const seenNames = new Set<string>();

            (custAccounts || []).forEach((acc: any) => {
                const normName = (acc.account_name || acc.name || '').trim().toLowerCase();
                if (!normName || seenNames.has(normName)) return;
                seenNames.add(normName);
                const phone = (acc.party_id && phoneByCustId.get(acc.party_id))
                    || phoneByName.get(normName)
                    || acc.phone
                    || '';
                list.push({ id: acc.id, name: acc.account_name || acc.name, phone });
            });

            (legacyCusts || []).forEach((c: any) => {
                const normName = (c.name || '').trim().toLowerCase();
                if (!normName || seenNames.has(normName)) return;
                seenNames.add(normName);
                list.push({ id: c.id, name: c.name, phone: c.phone || '' });
            });

            list.sort((a, b) => a.name.localeCompare(b.name));
            setCustomers(list);

            const emps = await invoke<any[]>('get_employees').catch(() => []);
            setEmployees((emps || []).map(e => ({ id: e.id, name: e.name })));

            invoke<string | null>('get_app_setting', { key: 'product_combobox_display_settings' })
                .then(v => { if (v) { try { setComboboxDisplaySettings(JSON.parse(v)); } catch {} } })
                .catch(console.error);

            invoke<string | null>('get_app_setting', { key: 'product_combobox_column_widths' })
                .then(v => { if (v) { try { setColumnWidths(JSON.parse(v)); } catch {} } })
                .catch(console.error);

            const [prods, grps, brnds] = await Promise.all([
                invoke<TauriProduct[]>('get_products').catch(() => []),
                invoke<any[]>('get_product_groups').catch(() => []),
                invoke<any[]>('get_product_brands').catch(() => []),
            ]);
            setProducts(prods || []);
            setGroups(grps || []);
            setBrands(brnds || []);

            const svcs = await invoke<any[]>('get_services').catch(() => []);
            setServicesList((svcs || []).map(s => ({ id: s.id, code: s.code, name: s.name, sales_rate: s.sales_rate || 0 })));

            const cb = await invoke<any[]>('get_cash_bank_accounts').catch(() => []);
            const mappedCb: AccountOption[] = (cb || []).map((a: any) => ({
                id: a.id,
                name: a.name || a.account_name || 'Cash',
            }));
            setPaymentAccounts(mappedCb);

            const [supAccs, unitsList] = await Promise.all([
                invoke<any[]>('get_accounts_by_groups', { groups: ['Accounts Payable'] }).catch(() => []),
                invoke<Unit[]>('get_units').catch(() => []),
            ]);
            const mappedSups: AccountOption[] = (supAccs || []).map((a: any) => ({
                id: a.id,
                name: a.account_name || a.name,
            }));
            setSuppliers(mappedSups);
            setUnits(unitsList || []);
            if (unitsList && unitsList.length > 0) {
                const defUnit = unitsList.find((u: Unit) => u.is_default === 1) || unitsList[0];
                setQuickPartUnitId(prev => prev || defUnit.id);
            }
            if (mappedCb.length > 0) {
                setFormData(f => f.cashBankAccount ? f : ({ ...f, cashBankAccount: mappedCb[0].id }));
                setFinalizeAccount(prev => prev || mappedCb[0].id);
                setQuickPartPaidFrom(prev => prev || mappedCb[0].id);
            }
        } catch (err) {
            console.error('Error loading masters', err);
        }
    };

    useEffect(() => {
        loadMasters();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadOrders();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, loadOrders]);

    useEffect(() => {
        if (comboboxDisplaySettings.show_stock) {
            invoke<any[]>('get_stock_report', { groupId: null, asOnDate: new Date().toISOString().split('T')[0] })
                .then((summary: any) => {
                    const map: Record<string, number> = {};
                    for (const item of (summary || [])) {
                        map[item.product_id] = item.current_stock;
                    }
                    setStockMap(map);
                })
                .catch(console.error);
        }
    }, [comboboxDisplaySettings.show_stock]);

    const productOptions = useMemo(() => {
        return products.map(p => {
            const opt = buildProductComboboxOption({
                product: p as any,
                groups,
                brands,
                displaySettings: comboboxDisplaySettings,
                stockMap,
                moneyFormatter: (amt) => (amt !== undefined && amt !== null ? money(amt) : ''),
            });
            return {
                ...opt,
                value: p.id,
            };
        });
    }, [products, groups, brands, comboboxDisplaySettings, stockMap]);

    const cbHeaderCols = useMemo(() => getProductComboboxHeaderColumns(comboboxDisplaySettings, columnWidths), [comboboxDisplaySettings, columnWidths]);
    const cbWidthClass = useMemo(() => getProductComboboxWidthClass(comboboxDisplaySettings, columnWidths), [comboboxDisplaySettings, columnWidths]);

    const filteredOrders = useMemo(() => {
        if (statusFilter === 'all') return orders;
        return orders.filter(o => o.status === statusFilter);
    }, [orders, statusFilter]);

    // Metrics
    const metrics = useMemo(() => {
        const totalCount = orders.length;
        const inRepair = orders.filter(o => o.status === 'in_progress' || o.status === 'waiting_parts').length;
        const readyCount = orders.filter(o => o.status === 'ready').length;
        const deliveredRevenue = orders
            .filter(o => o.status === 'delivered')
            .reduce((sum, o) => sum + o.total_amount, 0);

        return { totalCount, inRepair, readyCount, deliveredRevenue };
    }, [orders]);

    // Navigation logic
    const currentIndex = useMemo(() => {
        if (!currentOrder) return -1;
        return filteredOrders.findIndex(o => o.id === currentOrder.id);
    }, [currentOrder, filteredOrders]);

    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex >= 0 && currentIndex < filteredOrders.length - 1;

    const handleNavigatePrevious = () => {
        if (hasPrevious) {
            openViewOrder(filteredOrders[currentIndex - 1]);
        }
    };

    const handleNavigateNext = () => {
        if (hasNext) {
            openViewOrder(filteredOrders[currentIndex + 1]);
        } else if (mode === 'viewing') {
            openNewOrder();
        }
    };

    // Mode Transitions
    const openNewOrder = async () => {
        try {
            const previewNo = await invoke<string>('get_next_voucher_number_preview', { voucherType: 'service_order' }).catch(() => '');
            setNextOrderNo(previewNo || 'SVO-AUTO');
        } catch {}

        setFormData({
            customerId: '',
            orderDate: new Date().toISOString().split('T')[0],
            expectedDate: '',
            reference: '',
            deviceBrand: '',
            deviceModel: '',
            deviceImei: '',
            deviceColor: '',
            deviceCondition: '',
            securityPinPattern: '',
            complaint: '',
            technicianNotes: '',
            assignedTo: employees[0]?.id || '',
            commissionType: 'percentage',
            commissionRate: 20,
            estimatedCost: 0,
            discountRate: 0,
            discountAmount: 0,
            collectAdvance: false,
            advanceAmount: 0,
            cashBankAccount: paymentAccounts[0]?.id || '',
        });
        setFormParts([{
            productId: '',
            productName: '',
            productCode: '',
            description: '',
            quantity: 1,
            costRate: 0,
            sellingRate: 0,
            sellingAmount: 0,
            unitId: null,
        }]);
        setFormLabour([{
            serviceId: null,
            description: '',
            quantity: 1,
            rate: 0,
            amount: 0,
        }]);
        setCurrentOrder(null);
        setCurrentDetail(null);
        setActiveTab('device');
        setMode('new');
    };

    const openViewOrder = async (order: ServiceOrder) => {
        try {
            setLoading(true);
            const detail = await invoke<ServiceOrderDetail>('get_service_order', { id: order.id });
            setCurrentOrder(detail.order);
            setCurrentDetail(detail);
            setActiveTab('device');
            setMode('viewing');
        } catch (e: any) {
            toast.error(e?.toString() || 'Failed to open order details');
        } finally {
            setLoading(false);
        }
    };

    const refreshCurrentDetail = async () => {
        if (!currentOrder) return;
        try {
            const updated = await invoke<ServiceOrderDetail>('get_service_order', { id: currentOrder.id });
            setCurrentDetail(updated);
            setCurrentOrder(updated.order);
            loadOrders();
        } catch (e) {
            console.error(e);
        }
    };

    const openEditOrder = (targetTab: string = 'device') => {
        if (!currentOrder || !currentDetail) return;
        if (currentOrder.status === 'delivered') {
            toast.error('Delivered and invoiced orders cannot be edited');
            return;
        }

        setFormData({
            customerId: currentOrder.customer_id,
            orderDate: currentOrder.order_date,
            expectedDate: currentOrder.expected_date || '',
            reference: currentOrder.reference || '',
            deviceBrand: currentOrder.device_brand || '',
            deviceModel: currentOrder.device_model || '',
            deviceImei: currentOrder.device_imei || '',
            deviceColor: currentOrder.device_color || '',
            deviceCondition: currentOrder.device_condition || '',
            securityPinPattern: currentOrder.security_pin_pattern || '',
            complaint: currentOrder.complaint || '',
            technicianNotes: currentOrder.technician_notes || '',
            assignedTo: currentOrder.assigned_to || '',
            commissionType: currentOrder.commission_type || 'percentage',
            commissionRate: currentOrder.commission_rate || 20,
            estimatedCost: currentOrder.estimated_cost || 0,
            discountRate: currentOrder.discount_rate || 0,
            discountAmount: currentOrder.discount_amount || 0,
            collectAdvance: false,
            advanceAmount: currentOrder.advance_amount || 0,
            cashBankAccount: paymentAccounts[0]?.id || '',
        });

        const mappedParts = currentDetail.parts.map(p => ({
            id: p.id,
            productId: p.product_id,
            productName: p.product_name,
            productCode: p.product_code,
            description: p.description || p.product_name,
            quantity: p.quantity,
            costRate: p.cost_rate,
            sellingRate: p.selling_rate,
            sellingAmount: p.selling_amount,
            unitId: p.unit_id,
        }));
        setFormParts(mappedParts.length > 0 ? mappedParts : [{
            productId: '',
            productName: '',
            productCode: '',
            description: '',
            quantity: 1,
            costRate: 0,
            sellingRate: 0,
            sellingAmount: 0,
            unitId: null,
        }]);

        const mappedLabour = currentDetail.labour.map(l => ({
            id: l.id,
            serviceId: l.service_id,
            description: l.description,
            quantity: l.quantity,
            rate: l.rate,
            amount: l.amount,
        }));
        setFormLabour(mappedLabour.length > 0 ? mappedLabour : [{
            serviceId: null,
            description: '',
            quantity: 1,
            rate: 0,
            amount: 0,
        }]);

        setActiveTab(targetTab);
        setMode('editing');
    };

    const handleCancelForm = () => {
        if (currentOrder && currentDetail) {
            setMode('viewing');
        } else {
            setMode('list');
        }
    };

    // Calculations for Form mode
    const formPartsTotal = useMemo(() => formParts.reduce((s, p) => p.productId ? s + (p.sellingAmount || (p.quantity * p.sellingRate)) : s, 0), [formParts]);
    const formLabourTotal = useMemo(() => formLabour.reduce((s, l) => s + (l.amount || (l.quantity * l.rate)), 0), [formLabour]);
    const formSubtotal = useMemo(() => formPartsTotal + formLabourTotal, [formPartsTotal, formLabourTotal]);
    const formDiscountAmount = useMemo(() => {
        if (formData.discountAmount > 0) return formData.discountAmount;
        if (formData.discountRate > 0) return Math.round((formSubtotal * formData.discountRate / 100) * 100) / 100;
        return 0;
    }, [formData.discountAmount, formData.discountRate, formSubtotal]);
    const formGrandTotal = useMemo(() => Math.max(0, formSubtotal - formDiscountAmount), [formSubtotal, formDiscountAmount]);
    const formCommission = useMemo(() => {
        if (formData.commissionType === 'fixed') return formData.commissionRate;
        return formLabourTotal * (formData.commissionRate / 100);
    }, [formData.commissionType, formData.commissionRate, formLabourTotal]);

    // Save Form (Create or Edit)
    const handleSaveOrder = async () => {
        if (!formData.customerId) {
            toast.error('Please select a customer');
            return;
        }
        if (!formData.complaint.trim()) {
            toast.error('Please describe the customer complaint / fault');
            return;
        }

        try {
            setSaving(true);
            const payload = {
                order_date: formData.orderDate,
                expected_date: formData.expectedDate || null,
                customer_id: formData.customerId,
                device_brand: formData.deviceBrand || null,
                device_model: formData.deviceModel || null,
                device_imei: formData.deviceImei || null,
                device_color: formData.deviceColor || null,
                device_condition: formData.deviceCondition || null,
                security_pin_pattern: formData.securityPinPattern || null,
                complaint: formData.complaint.trim(),
                technician_notes: formData.technicianNotes || null,
                assigned_to: formData.assignedTo || null,
                commission_type: formData.commissionType,
                commission_rate: Number(formData.commissionRate) || 0,
                estimated_cost: Number(formData.estimatedCost) || 0,
                discount_rate: formData.discountRate || 0,
                discount_amount: formDiscountAmount || 0,
                advance_amount: formData.collectAdvance ? Number(formData.advanceAmount) || 0 : 0,
                cash_bank_account_id: formData.collectAdvance ? formData.cashBankAccount : null,
                reference: formData.reference || null,
                narration: null,
                parts: formParts
                    .filter(p => !!p.productId && p.productId.trim() !== '')
                    .map(p => ({
                        product_id: p.productId,
                        description: p.description || p.productName || null,
                        quantity: p.quantity,
                        cost_rate: p.costRate,
                        selling_rate: p.sellingRate,
                        selling_amount: p.quantity * p.sellingRate,
                        unit_id: p.unitId || null,
                    })),
                labour: formLabour.map(l => ({
                    service_id: l.serviceId || null,
                    description: l.description,
                    quantity: l.quantity,
                    rate: l.rate,
                    amount: l.amount,
                })),
                user_id: null,
            };

            if (mode === 'new') {
                const orderId = await invoke<string>('create_service_order', { data: payload });
                toast.success('Service Order created successfully');
                await loadOrders();
                const detail = await invoke<ServiceOrderDetail>('get_service_order', { id: orderId });
                setCurrentOrder(detail.order);
                setCurrentDetail(detail);
                setMode('viewing');
            } else if (mode === 'editing' && currentOrder) {
                await invoke('update_service_order', { id: currentOrder.id, data: payload });
                toast.success('Service Order updated successfully');
                await loadOrders();
                const detail = await invoke<ServiceOrderDetail>('get_service_order', { id: currentOrder.id });
                setCurrentOrder(detail.order);
                setCurrentDetail(detail);
                setMode('viewing');
            }
        } catch (err: any) {
            toast.error(err?.toString() || 'Failed to save service order');
        } finally {
            setSaving(false);
        }
    };

    // ==================== KEYBOARD ENTER NAVIGATION ====================
    const focusField = useCallback((id: string) => {
        setTimeout(() => {
            const el = document.getElementById(id);
            if (el) {
                el.focus();
                if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                    el.select();
                }
            }
        }, 50);
    }, []);

    const focusPartField = useCallback((idx: number, field: 'product' | 'quantity' | 'costRate' | 'sellingRate') => {
        setTimeout(() => {
            const row = document.querySelector(`[data-part-row="${idx}"]`);
            if (!row) return;
            if (field === 'product') {
                const btn = row.querySelector('button[role="combobox"]') as HTMLElement | null;
                btn?.focus();
            } else {
                const input = row.querySelector(`[data-field="${field}"]`) as HTMLInputElement | null;
                if (input) {
                    input.focus();
                    input.select();
                }
            }
        }, 50);
    }, []);

    const focusLabourField = useCallback((idx: number, field: 'service' | 'quantity' | 'rate') => {
        setTimeout(() => {
            const row = document.querySelector(`[data-labour-row="${idx}"]`);
            if (!row) return;
            if (field === 'service') {
                const btn = row.querySelector('button[role="combobox"]') as HTMLElement | null;
                btn?.focus();
            } else {
                const input = row.querySelector(`[data-field="${field}"]`) as HTMLInputElement | null;
                if (input) {
                    input.focus();
                    input.select();
                }
            }
        }, 50);
    }, []);

    const focusFirstPartRow = useCallback(() => {
        setTimeout(() => {
            const firstBtn = document.querySelector('[data-part-row="0"] button[role="combobox"]') as HTMLElement | null;
            firstBtn?.focus();
        }, 50);
    }, []);

    const focusFirstLabourRow = useCallback(() => {
        setTimeout(() => {
            const firstBtn = document.querySelector('[data-labour-row="0"] button[role="combobox"]') as HTMLElement | null;
            firstBtn?.focus();
        }, 50);
    }, []);

    // Form mode inline parts row handlers
    const handleAddFormPartRow = (insertIndex?: number) => {
        const newRow = {
            productId: '',
            productName: '',
            productCode: '',
            description: '',
            quantity: 1,
            costRate: 0,
            sellingRate: 0,
            sellingAmount: 0,
            unitId: null,
        };
        setFormParts(prev => {
            if (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex < prev.length) {
                const copy = [...prev];
                copy.splice(insertIndex + 1, 0, newRow);
                return copy;
            }
            return [...prev, newRow];
        });
    };

    const handleRemoveFormPartRow = (idx: number) => {
        setFormParts(prev => {
            if (prev.length <= 1) {
                return [{
                    productId: '',
                    productName: '',
                    productCode: '',
                    description: '',
                    quantity: 1,
                    costRate: 0,
                    sellingRate: 0,
                    sellingAmount: 0,
                    unitId: null,
                }];
            }
            return prev.filter((_, i) => i !== idx);
        });
    };

    const handleUpdateFormPartRow = (idx: number, field: string, val: any) => {
        setFormParts(prev => {
            const copy = [...prev];
            const row = { ...copy[idx] };
            if (field === 'productId') {
                const prod = products.find(p => p.id === String(val));
                if (prod) {
                    row.productId = prod.id;
                    row.productName = prod.name;
                    row.productCode = prod.code || '';
                    row.description = prod.name;
                    row.unitId = prod.unit_id || null;
                    row.costRate = prod.purchase_rate || prod.cost || 0;
                    row.sellingRate = prod.sales_rate || prod.mrp || 0;
                    row.quantity = row.quantity || 1;
                    row.sellingAmount = row.quantity * row.sellingRate;
                } else {
                    row.productId = '';
                    row.productName = '';
                    row.productCode = '';
                    row.description = '';
                    row.costRate = 0;
                    row.sellingRate = 0;
                    row.sellingAmount = 0;
                }
            } else if (field === 'quantity') {
                const q = Math.max(0, Number(val) || 0);
                row.quantity = q;
                row.sellingAmount = q * (row.sellingRate || 0);
            } else if (field === 'costRate') {
                row.costRate = Math.max(0, Number(val) || 0);
            } else if (field === 'sellingRate') {
                const r = Math.max(0, Number(val) || 0);
                row.sellingRate = r;
                row.sellingAmount = (row.quantity || 0) * r;
            }
            copy[idx] = row;
            return copy;
        });
    };

    const handleRemovePart = async (idx: number) => {
        if (mode === 'viewing' && currentDetail) {
            try {
                const currentParts = currentDetail.parts.filter((_, i) => i !== idx).map(p => ({
                    product_id: p.product_id,
                    description: p.description || null,
                    quantity: p.quantity,
                    cost_rate: p.cost_rate,
                    selling_rate: p.selling_rate,
                    selling_amount: p.selling_amount,
                    unit_id: p.unit_id || null,
                }));

                const currentLabour = currentDetail.labour.map(l => ({
                    service_id: l.service_id || null,
                    description: l.description,
                    quantity: l.quantity,
                    rate: l.rate,
                    amount: l.amount,
                }));

                const payload = {
                    order_date: currentDetail.order.order_date,
                    expected_date: currentDetail.order.expected_date,
                    customer_id: currentDetail.order.customer_id,
                    device_brand: currentDetail.order.device_brand,
                    device_model: currentDetail.order.device_model,
                    device_imei: currentDetail.order.device_imei,
                    device_color: currentDetail.order.device_color,
                    device_condition: currentDetail.order.device_condition,
                    security_pin_pattern: currentDetail.order.security_pin_pattern,
                    complaint: currentDetail.order.complaint,
                    technician_notes: currentDetail.order.technician_notes,
                    assigned_to: currentDetail.order.assigned_to,
                    commission_type: currentDetail.order.commission_type,
                    commission_rate: currentDetail.order.commission_rate,
                    estimated_cost: currentDetail.order.estimated_cost,
                    advance_amount: currentDetail.order.advance_amount,
                    cash_bank_account_id: null,
                    reference: currentDetail.order.reference,
                    narration: currentDetail.order.narration,
                    parts: currentParts,
                    labour: currentLabour,
                    user_id: null,
                };

                await invoke('update_service_order', { id: currentDetail.order.id, data: payload });
                toast.success('Part removed');
                refreshCurrentDetail();
            } catch (e: any) {
                toast.error(e?.toString() || 'Failed to remove part');
            }
        } else {
            handleRemoveFormPartRow(idx);
        }
    };

    const handleAddFormLabourRow = (insertIndex?: number) => {
        const newRow = {
            serviceId: null,
            description: '',
            quantity: 1,
            rate: 0,
            amount: 0,
        };
        setFormLabour(prev => {
            if (typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex < prev.length) {
                const copy = [...prev];
                copy.splice(insertIndex + 1, 0, newRow);
                return copy;
            }
            return [...prev, newRow];
        });
    };

    const handleRemoveFormLabourRow = (idx: number) => {
        setFormLabour(prev => {
            if (prev.length <= 1) {
                return [{
                    serviceId: null,
                    description: '',
                    quantity: 1,
                    rate: 0,
                    amount: 0,
                }];
            }
            return prev.filter((_, i) => i !== idx);
        });
    };

    const handleUpdateFormLabourRow = (idx: number, field: string, val: any) => {
        setFormLabour(prev => {
            const copy = [...prev];
            const row = { ...copy[idx] };
            if (field === 'serviceId') {
                const svc = servicesList.find(s => s.id === String(val));
                if (svc) {
                    row.serviceId = svc.id;
                    row.description = svc.name;
                    row.rate = svc.sales_rate || 0;
                    row.quantity = row.quantity || 1;
                    row.amount = row.quantity * row.rate;
                } else {
                    row.serviceId = null;
                }
            } else if (field === 'description') {
                const str = String(val).trim();
                row.description = str;
                const matchedSvc = servicesList.find(s => s.name.toLowerCase() === str.toLowerCase());
                if (matchedSvc) {
                    row.serviceId = matchedSvc.id;
                    if (!row.rate) {
                        row.rate = matchedSvc.sales_rate || 0;
                        row.amount = (row.quantity || 1) * row.rate;
                    }
                } else {
                    row.serviceId = null;
                }
            } else if (field === 'quantity') {
                const q = Math.max(0, Number(val) || 0);
                row.quantity = q;
                row.amount = q * (row.rate || 0);
            } else if (field === 'rate') {
                const r = Math.max(0, Number(val) || 0);
                row.rate = r;
                row.amount = (row.quantity || 0) * r;
            }
            copy[idx] = row;
            return copy;
        });
    };

    const handleRemoveLabour = async (idx: number) => {
        if (mode === 'viewing' && currentDetail) {
            try {
                const currentParts = currentDetail.parts.map(p => ({
                    product_id: p.product_id,
                    description: p.description || null,
                    quantity: p.quantity,
                    cost_rate: p.cost_rate,
                    selling_rate: p.selling_rate,
                    selling_amount: p.selling_amount,
                    unit_id: p.unit_id || null,
                }));

                const currentLabour = currentDetail.labour.filter((_, i) => i !== idx).map(l => ({
                    service_id: l.service_id || null,
                    description: l.description,
                    quantity: l.quantity,
                    rate: l.rate,
                    amount: l.amount,
                }));

                const payload = {
                    order_date: currentDetail.order.order_date,
                    expected_date: currentDetail.order.expected_date,
                    customer_id: currentDetail.order.customer_id,
                    device_brand: currentDetail.order.device_brand,
                    device_model: currentDetail.order.device_model,
                    device_imei: currentDetail.order.device_imei,
                    device_color: currentDetail.order.device_color,
                    device_condition: currentDetail.order.device_condition,
                    security_pin_pattern: currentDetail.order.security_pin_pattern,
                    complaint: currentDetail.order.complaint,
                    technician_notes: currentDetail.order.technician_notes,
                    assigned_to: currentDetail.order.assigned_to,
                    commission_type: currentDetail.order.commission_type,
                    commission_rate: currentDetail.order.commission_rate,
                    estimated_cost: currentDetail.order.estimated_cost,
                    advance_amount: currentDetail.order.advance_amount,
                    cash_bank_account_id: null,
                    reference: currentDetail.order.reference,
                    narration: currentDetail.order.narration,
                    parts: currentParts,
                    labour: currentLabour,
                    user_id: null,
                };

                await invoke('update_service_order', { id: currentDetail.order.id, data: payload });
                toast.success('Labour charge removed');
                refreshCurrentDetail();
            } catch (e: any) {
                toast.error(e?.toString() || 'Failed to remove labour');
            }
        } else {
            handleRemoveFormLabourRow(idx);
        }
    };

    const getServiceOptionsForRow = useCallback((l: { serviceId?: string | null; description: string }, idx: number): ComboboxOption[] => {
        const list: ComboboxOption[] = servicesList.map(s => ({
            value: s.id,
            label: s.code ? `${s.code} - ${s.name}` : s.name,
            itemLabel: s.name,
            subLabel: s.sales_rate ? money(s.sales_rate) : undefined,
            searchString: `${s.code || ''} ${s.name}`,
            keywords: [s.code, s.name].filter(Boolean) as string[],
        }));

        if (l.description && !servicesList.some(s => s.id === l.serviceId || s.name.toLowerCase() === l.description.toLowerCase())) {
            return [
                {
                    value: `custom:${idx}`,
                    label: l.description,
                    itemLabel: l.description,
                    searchString: l.description,
                },
                ...list,
            ];
        }
        return list;
    }, [servicesList, money]);

    // Quick Add Spare Part Save
    const handleQuickAddSparePartSave = async () => {
        if (!quickPartName.trim()) {
            toast.error('Please enter a part name');
            return;
        }

        const effectiveUnitId = quickPartUnitId || units.find(u => u.is_default === 1)?.id || units[0]?.id || '';
        if (!effectiveUnitId) {
            toast.error('No unit available. Please configure units first.');
            return;
        }

        try {
            setQuickPartSaving(true);

            // 1. Create product
            const productData: any = {
                code: '',
                name: quickPartName.trim(),
                group_id: quickPartGroupId || null,
                unit_id: effectiveUnitId,
                purchase_rate: Number(quickPartCostRate) || 0,
                sales_rate: Number(quickPartSellingRate) || 0,
                mrp: Number(quickPartSellingRate) || 0,
                cost: Number(quickPartCostRate) || 0,
            };

            const createdProduct = await invoke<TauriProduct>('create_product', { product: productData });

            // 2. Record purchase and inward stock if enabled
            if ((Number(quickPartQty) || 1) > 0) {
                const paidFromAccount = quickPartPaidFrom || paymentAccounts[0]?.id || suppliers[0]?.id;
                if (!paidFromAccount) {
                    toast.error('Please select an account or supplier for the purchase');
                    setQuickPartSaving(false);
                    return;
                }

                const isSupplier = suppliers.some(s => s.id === paidFromAccount);
                const orderLabel = currentOrder ? `for Order #${currentOrder.order_no}` : '';

                const purchasePayload = {
                    voucher_no: null,
                    supplier_id: paidFromAccount,
                    party_type: isSupplier ? 'supplier' : 'cash',
                    voucher_date: new Date().toISOString().split('T')[0],
                    reference: quickPartBillRef.trim() || null,
                    narration: `Spare part purchase ${orderLabel}`.trim(),
                    discount_rate: null,
                    discount_amount: null,
                    freight_charge: null,
                    round_off: null,
                    items: [{
                        item_type: 'product',
                        product_id: createdProduct.id,
                        service_id: null,
                        unit_id: effectiveUnitId,
                        description: createdProduct.name,
                        initial_quantity: Number(quickPartQty) || 1,
                        count: 0,
                        deduction_per_unit: 0,
                        rate: Number(quickPartCostRate) || 0,
                        tax_rate: 0,
                        discount_percent: null,
                        discount_amount: null,
                        remarks: null,
                        sales_rate: Number(quickPartSellingRate) || 0,
                        mrp: Number(quickPartSellingRate) || 0,
                    }],
                    user_id: null,
                    tax_inclusive: false,
                    gst_disabled: true,
                };

                await invoke('create_purchase_invoice', { invoice: purchasePayload });
            }

            await loadMasters();

            // 3. Attach part directly into active context
            const qty = Number(quickPartQty) || 1;
            const costRate = Number(quickPartCostRate) || 0;
            const sellingRate = Number(quickPartSellingRate) || 0;

            if (mode === 'viewing' && currentDetail) {
                const currentParts = currentDetail.parts.map(p => ({
                    product_id: p.product_id,
                    description: p.description || null,
                    quantity: p.quantity,
                    cost_rate: p.cost_rate,
                    selling_rate: p.selling_rate,
                    selling_amount: p.selling_amount,
                    unit_id: p.unit_id || null,
                }));

                currentParts.push({
                    product_id: createdProduct.id,
                    description: createdProduct.name,
                    quantity: qty,
                    cost_rate: costRate,
                    selling_rate: sellingRate,
                    selling_amount: qty * sellingRate,
                    unit_id: effectiveUnitId,
                });

                const currentLabour = currentDetail.labour.map(l => ({
                    service_id: l.service_id || null,
                    description: l.description,
                    quantity: l.quantity,
                    rate: l.rate,
                    amount: l.amount,
                }));

                const payload = {
                    order_date: currentDetail.order.order_date,
                    expected_date: currentDetail.order.expected_date,
                    customer_id: currentDetail.order.customer_id,
                    device_brand: currentDetail.order.device_brand,
                    device_model: currentDetail.order.device_model,
                    device_imei: currentDetail.order.device_imei,
                    device_color: currentDetail.order.device_color,
                    device_condition: currentDetail.order.device_condition,
                    security_pin_pattern: currentDetail.order.security_pin_pattern,
                    complaint: currentDetail.order.complaint,
                    technician_notes: currentDetail.order.technician_notes,
                    assigned_to: currentDetail.order.assigned_to,
                    commission_type: currentDetail.order.commission_type,
                    commission_rate: currentDetail.order.commission_rate,
                    estimated_cost: currentDetail.order.estimated_cost,
                    advance_amount: currentDetail.order.advance_amount,
                    cash_bank_account_id: null,
                    reference: currentDetail.order.reference,
                    narration: currentDetail.order.narration,
                    parts: currentParts,
                    labour: currentLabour,
                    user_id: null,
                };

                await invoke('update_service_order', { id: currentDetail.order.id, data: payload });
                toast.success(`Created "${createdProduct.name}" and added to order`);
                refreshCurrentDetail();
            } else {
                // Form mode
                if (typeof quickPartActiveRow === 'number' && quickPartActiveRow >= 0 && quickPartActiveRow < formParts.length) {
                    setFormParts(prev => {
                        const copy = [...prev];
                        copy[quickPartActiveRow] = {
                            productId: createdProduct.id,
                            productName: createdProduct.name,
                            productCode: createdProduct.code || '',
                            description: createdProduct.name,
                            quantity: qty,
                            costRate: costRate,
                            sellingRate: sellingRate,
                            sellingAmount: qty * sellingRate,
                            unitId: effectiveUnitId,
                        };
                        return copy;
                    });
                } else {
                    setFormParts(prev => [
                        ...prev,
                        {
                            productId: createdProduct.id,
                            productName: createdProduct.name,
                            productCode: createdProduct.code || '',
                            description: createdProduct.name,
                            quantity: qty,
                            costRate: costRate,
                            sellingRate: sellingRate,
                            sellingAmount: qty * sellingRate,
                            unitId: effectiveUnitId,
                        }
                    ]);
                }
                setQuickPartActiveRow(null);
                toast.success(`Created "${createdProduct.name}" and added to parts`);
            }

            setQuickAddPartOpen(false);
            setQuickPartName('');
            setQuickPartCostRate(0);
            setQuickPartSellingRate(0);
            setQuickPartQty(1);
            setQuickPartBillRef('');
        } catch (err: any) {
            console.error(err);
            toast.error(err?.toString() || 'Failed to create spare part');
        } finally {
            setQuickPartSaving(false);
        }
    };

    // Status Update
    const handleStatusUpdate = async () => {
        if (!currentOrder) return;
        try {
            await invoke('update_service_order_status', {
                payload: {
                    order_id: currentOrder.id,
                    new_status: newStatusValue,
                    notes: statusNotes || null,
                    user_id: null,
                },
            });
            toast.success(`Status updated to ${newStatusValue.replace('_', ' ').toUpperCase()}`);
            setStatusModalOpen(false);
            setStatusNotes('');
            refreshCurrentDetail();
        } catch (e: any) {
            toast.error(e?.toString() || 'Failed to update status');
        }
    };

    // Finalize & Invoice
    const handleFinalizeOrder = async () => {
        if (!currentOrder) return;
        try {
            await invoke<string>('finalize_service_order', {
                payload: {
                    order_id: currentOrder.id,
                    voucher_date: new Date().toISOString().split('T')[0],
                    narration: `Service Invoice for Order #${currentOrder.order_no}`,
                    user_id: null,
                    discount_rate: finalizeDiscountRate,
                    discount_amount: finalizeDiscountAmount,
                    collect_payment: collectPayment,
                    payment_amount: finalizeAmount,
                    payment_account_id: finalizeAccount || null,
                },
            });

            toast.success('Service Invoice generated and order delivered!');
            setFinalizeDialogOpen(false);
            refreshCurrentDetail();
        } catch (e: any) {
            toast.error(e?.toString() || 'Failed to finalize order');
        }
    };

    // Delete Order
    const handleDeleteOrder = async () => {
        if (!currentOrder) return;
        if (!confirm(`Are you sure you want to delete Service Order ${currentOrder.order_no}? Consumed stock will be restored.`)) {
            return;
        }
        try {
            await invoke('delete_service_order', { id: currentOrder.id });
            toast.success(`Order ${currentOrder.order_no} deleted`);
            setMode('list');
            setCurrentOrder(null);
            setCurrentDetail(null);
            loadOrders();
        } catch (e: any) {
            toast.error(e?.toString() || 'Failed to delete order');
        }
    };

    // WhatsApp Alert
    const sendWhatsAppAlert = (order: ServiceOrder) => {
        const rawPhone = order.customer_phone?.replace(/[^0-9]/g, '') || '';
        if (!rawPhone) {
            toast.error('No phone number recorded for this customer');
            return;
        }
        const phone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
        let message = '';
        if (order.status === 'ready') {
            message = `Hello ${order.customer_name}, your ${order.device_brand || ''} ${order.device_model || 'mobile'} (Job #${order.order_no}) has been repaired and is ready for pickup! Balance due: ${money(order.balance_due)}. Thank you!`;
        } else if (order.status === 'delivered') {
            message = `Thank you ${order.customer_name} for choosing us! Your mobile repair (Job #${order.order_no}) is complete. Invoice #${order.final_invoice_no || order.order_no} for ${money(order.total_amount)} has been closed.`;
        } else {
            message = `Hello ${order.customer_name}, update on your repair (Job #${order.order_no}): Status is currently ${order.status.replace('_', ' ').toUpperCase()}.`;
        }
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    // ==================== RENDER: TOP HEADER BAR ====================
    const renderHeader = () => {
        const displayNo = mode === 'new' ? nextOrderNo : currentOrder?.order_no;

        return (
            <div className="border-b bg-card/50 px-5 py-3 backdrop-blur-sm shrink-0 h-[65px] flex items-center z-10">
                <div className="flex items-center justify-between w-full">
                    {/* Left: Navigation and Titles */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 mr-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                disabled={mode === 'list' || !hasPrevious}
                                onClick={handleNavigatePrevious}
                                title="Previous Order (Alt+Left)"
                            >
                                <IconChevronLeft size={16} />
                            </Button>
                            {displayNo && (
                                <span className={`h-8 flex items-center justify-center px-3 text-xs font-mono font-bold rounded-md border shrink-0 ${
                                    mode === 'new'
                                        ? 'text-muted-foreground/70 border-dashed border-muted-foreground/30 bg-muted/20'
                                        : 'text-primary border-primary/20 bg-primary/10'
                                }`}>
                                    {displayNo}
                                </span>
                            )}
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                disabled={mode === 'list' || (mode === 'new' && !hasNext)}
                                onClick={handleNavigateNext}
                                title={mode === 'viewing' && !hasNext ? 'New Order (Alt+Right)' : 'Next Order (Alt+Right)'}
                            >
                                <IconChevronRight size={16} />
                            </Button>
                        </div>

                        <div>
                            {mode === 'new' && (
                                <div>
                                    <h1 className="text-base font-semibold">New Service Order</h1>
                                    <p className="text-xs text-muted-foreground">Mobile Phone Repair & Service Intake</p>
                                </div>
                            )}
                            {mode === 'editing' && (
                                <div>
                                    <h1 className="text-base font-semibold">Edit Service Order: {currentOrder?.order_no}</h1>
                                    <p className="text-xs text-muted-foreground">Update Job Details & Assigned Spares</p>
                                </div>
                            )}
                            {mode === 'viewing' && currentOrder && (
                                <div className="flex items-center gap-2">
                                    <h1 className="text-base font-semibold">{currentOrder.order_no}</h1>
                                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_CONFIG[currentOrder.status]?.badge}`}>
                                        {STATUS_CONFIG[currentOrder.status]?.label || currentOrder.status}
                                    </span>
                                    {currentOrder.payment_status === 'paid' ? (
                                        <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 gap-1 text-[11px]">
                                            <IconCheck size={12} /> Paid
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="gap-1 text-[11px]">
                                            <IconClock size={12} /> {money(currentOrder.balance_due)} Due
                                        </Badge>
                                    )}
                                </div>
                            )}
                            {mode === 'list' && (
                                <div>
                                    <h1 className="text-base font-semibold">Service Orders</h1>
                                    <p className="text-xs text-muted-foreground">Mobile Phone Repair & Service Job Cards</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                        {mode !== 'list' && (
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setMode('list')}
                                title="Back to Orders List"
                            >
                                <IconList size={16} />
                            </Button>
                        )}

                        {mode === 'list' && (
                            <>
                                <div className="relative w-56">
                                    <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Search order, IMEI, phone..."
                                        className="pl-8 h-8 text-xs"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-36 h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Orders</SelectItem>
                                        <SelectItem value="received">Received</SelectItem>
                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                        <SelectItem value="waiting_parts">Waiting Parts</SelectItem>
                                        <SelectItem value="ready">Ready</SelectItem>
                                        <SelectItem value="delivered">Delivered</SelectItem>
                                        <SelectItem value="cancelled">Cancelled</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" size="icon" className="h-8 w-8" onClick={loadOrders} title="Refresh">
                                    <IconRefresh size={16} />
                                </Button>
                                <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openNewOrder}>
                                    <IconPlus size={15} /> New Service Order
                                </Button>
                            </>
                        )}

                        {mode === 'viewing' && currentOrder && (
                            <>
                                {currentOrder.customer_phone && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                        onClick={() => sendWhatsAppAlert(currentOrder)}
                                    >
                                        <IconBrandWhatsapp size={15} /> WhatsApp
                                    </Button>
                                )}

                                {currentOrder.status !== 'delivered' && currentOrder.status !== 'cancelled' && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs gap-1"
                                        onClick={() => {
                                            setNewStatusValue(currentOrder.status === 'received' ? 'in_progress' : currentOrder.status === 'in_progress' ? 'ready' : 'in_progress');
                                            setStatusModalOpen(true);
                                        }}
                                    >
                                        <IconTools size={14} /> Update Status
                                    </Button>
                                )}

                                {currentOrder.status === 'ready' && !currentOrder.final_invoice_id && (
                                    <Button
                                        size="sm"
                                        className="h-8 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                        onClick={() => {
                                            const discAmt = currentOrder.discount_amount || 0;
                                            const discRate = currentOrder.discount_rate || 0;
                                            setFinalizeDiscountRate(discRate);
                                            setFinalizeDiscountAmount(discAmt);
                                            const gross = (currentOrder.total_parts_billed || 0) + (currentOrder.total_labour_cost || 0);
                                            const net = Math.max(0, gross - discAmt);
                                            const adv = currentOrder.advance_amount || 0;
                                            setFinalizeAmount(Math.max(0, net - adv));
                                            setFinalizeAccount(paymentAccounts[0]?.id || '');
                                            setFinalizeDialogOpen(true);
                                        }}
                                    >
                                        <IconReceipt size={14} /> Deliver &amp; Invoice
                                    </Button>
                                )}

                                <div className="flex items-center gap-1 border-l pl-2 ml-1">
                                    {currentOrder.status !== 'delivered' && (
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => openEditOrder()}
                                            title="Edit Order"
                                        >
                                            <IconEdit size={15} />
                                        </Button>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                        onClick={handleDeleteOrder}
                                        title="Delete Order"
                                    >
                                        <IconTrash size={15} />
                                    </Button>
                                </div>

                                <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openNewOrder}>
                                    <IconPlus size={15} /> New Order
                                </Button>
                            </>
                        )}

                        {(mode === 'new' || mode === 'editing') && (
                            <>
                                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCancelForm}>
                                    <IconX size={14} className="mr-1" /> Cancel
                                </Button>
                                <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleSaveOrder} disabled={saving}>
                                    <IconDeviceFloppy size={14} />
                                    {saving ? 'Saving...' : mode === 'editing' ? 'Update Order' : 'Save Service Order'}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ==================== VIEW 1: LIST MODE ====================
    const renderListView = () => (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-4 px-6 py-3 border-b bg-muted/20 shrink-0">
                <Card className="shadow-none border">
                    <CardContent className="p-3 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium">Total Orders</p>
                            <p className="text-lg font-bold">{metrics.totalCount}</p>
                        </div>
                        <IconReceipt size={22} className="text-muted-foreground" />
                    </CardContent>
                </Card>

                <Card className="shadow-none border">
                    <CardContent className="p-3 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-amber-600 font-medium">In Repair / Waiting</p>
                            <p className="text-lg font-bold text-amber-700 dark:text-amber-400">{metrics.inRepair}</p>
                        </div>
                        <IconClock size={22} className="text-amber-500" />
                    </CardContent>
                </Card>

                <Card className="shadow-none border">
                    <CardContent className="p-3 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-emerald-600 font-medium">Ready For Pickup</p>
                            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{metrics.readyCount}</p>
                        </div>
                        <IconCheck size={22} className="text-emerald-500" />
                    </CardContent>
                </Card>

                <Card className="shadow-none border">
                    <CardContent className="p-3 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium">Delivered Revenue</p>
                            <p className="text-lg font-bold text-foreground">{money(metrics.deliveredRevenue)}</p>
                        </div>
                        <IconCash size={22} className="text-primary" />
                    </CardContent>
                </Card>
            </div>

            {/* Filter Tabs Bar */}
            <div className="flex items-center justify-between px-6 py-2 border-b bg-card shrink-0">
                <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                    {[
                        { id: 'all', label: 'All Orders' },
                        { id: 'received', label: 'Received' },
                        { id: 'in_progress', label: 'In Progress' },
                        { id: 'waiting_parts', label: 'Waiting Parts' },
                        { id: 'ready', label: 'Ready' },
                        { id: 'delivered', label: 'Delivered' },
                        { id: 'cancelled', label: 'Cancelled' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setStatusFilter(tab.id)}
                            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                                statusFilter === tab.id
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="text-xs text-muted-foreground">
                    Showing <span className="font-semibold text-foreground">{filteredOrders.length}</span> orders
                </div>
            </div>

            {/* Orders Table */}
            <div className="flex-1 overflow-auto p-6">
                <Card className="shadow-none border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b bg-muted/50 font-medium text-muted-foreground">
                                    <th className="p-3">Order #</th>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Customer &amp; Phone</th>
                                    <th className="p-3">Device &amp; IMEI</th>
                                    <th className="p-3">Fault / Complaint</th>
                                    <th className="p-3">Technician</th>
                                    <th className="p-3 text-right">Parts</th>
                                    <th className="p-3 text-right">Labour</th>
                                    <th className="p-3 text-right">Total</th>
                                    <th className="p-3 text-center">Status</th>
                                    <th className="p-3 text-center">Payment</th>
                                    <th className="p-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {loading ? (
                                    <tr>
                                        <td colSpan={12} className="p-8 text-center text-muted-foreground">
                                            Loading service orders...
                                        </td>
                                    </tr>
                                ) : filteredOrders.length === 0 ? (
                                    <tr>
                                        <td colSpan={12} className="p-12 text-center text-muted-foreground">
                                            <IconDeviceMobile size={32} className="mx-auto mb-2 opacity-40" />
                                            <p className="font-medium">No service orders found</p>
                                            <p className="text-xs mt-1">Click "New Service Order" to intake a customer device.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredOrders.map(o => {
                                        const cfg = STATUS_CONFIG[o.status] || { label: o.status, badge: 'bg-muted text-muted-foreground' };
                                        return (
                                            <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                                                <td
                                                    className="p-3 font-mono font-semibold text-primary cursor-pointer hover:underline"
                                                    onClick={() => openViewOrder(o)}
                                                >
                                                    {o.order_no}
                                                </td>
                                                <td className="p-3 whitespace-nowrap text-muted-foreground">
                                                    {o.order_date}
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-medium">{o.customer_name}</div>
                                                    <div className="text-[11px] text-muted-foreground">{o.customer_phone || 'No phone'}</div>
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-medium">{o.device_brand} {o.device_model}</div>
                                                    <div className="text-[10px] text-muted-foreground font-mono">{o.device_imei || 'No IMEI'}</div>
                                                </td>
                                                <td className="p-3 max-w-[200px] truncate" title={o.complaint}>
                                                    {o.complaint}
                                                </td>
                                                <td className="p-3 text-muted-foreground">
                                                    {o.technician_name || 'Unassigned'}
                                                </td>
                                                <td className="p-3 text-right font-mono text-muted-foreground">
                                                    {money(o.total_parts_billed)}
                                                </td>
                                                <td className="p-3 text-right font-mono text-muted-foreground">
                                                    {money(o.total_labour_cost)}
                                                </td>
                                                <td className="p-3 text-right font-mono font-bold text-foreground">
                                                    {money(o.total_amount)}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${cfg.badge}`}>
                                                        {cfg.label}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className={`text-[10px] font-semibold ${
                                                        o.payment_status === 'paid' ? 'text-emerald-600' :
                                                        o.payment_status === 'partial' ? 'text-amber-600' : 'text-rose-600'
                                                    }`}>
                                                        {o.payment_status.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-7 w-7 text-primary hover:bg-primary/10"
                                                            onClick={() => openViewOrder(o)}
                                                            title="View Order Details"
                                                        >
                                                            <IconEye size={14} />
                                                        </Button>
                                                        {o.customer_phone && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-7 w-7 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                                                onClick={() => sendWhatsAppAlert(o)}
                                                                title="Send WhatsApp Alert"
                                                            >
                                                                <IconBrandWhatsapp size={14} />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    );

    // ==================== VIEW 2: VIEWING MODE (IN-PAGE TABS) ====================
    const renderViewingView = () => {
        if (!currentOrder || !currentDetail) return null;
        const o = currentOrder;

        return (
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
                {/* Top Device Specs Banner */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 px-6 py-3 border-b bg-muted/20 shrink-0 text-xs">
                    <div>
                        <span className="text-muted-foreground text-[10px] uppercase font-bold block">Customer</span>
                        <span className="font-semibold text-foreground text-sm">{o.customer_name}</span>
                        <span className="text-muted-foreground block text-[11px]">{o.customer_phone || 'No phone'}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground text-[10px] uppercase font-bold block">Device Model</span>
                        <span className="font-semibold text-foreground text-sm">{o.device_brand} {o.device_model}</span>
                        <span className="text-muted-foreground block font-mono text-[11px]">{o.device_imei || 'No IMEI'}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground text-[10px] uppercase font-bold block">Lock PIN / Pattern</span>
                        <span className="font-mono font-bold text-primary text-sm">{o.security_pin_pattern || 'None'}</span>
                        <span className="text-muted-foreground block text-[11px]">{o.device_color || 'Color: Standard'}</span>
                    </div>
                    <div>
                        <span className="text-muted-foreground text-[10px] uppercase font-bold block">Assigned Technician</span>
                        <span className="font-semibold text-foreground text-sm">{o.technician_name || 'Unassigned'}</span>
                        <span className="text-muted-foreground block text-[11px]">
                            {o.commission_type === 'percentage' ? `${o.commission_rate}% Commission` : 'Fixed ₹'}
                        </span>
                    </div>
                    <div>
                        <span className="text-muted-foreground text-[10px] uppercase font-bold block">Intake / Delivery Date</span>
                        <span className="font-medium text-foreground">{o.order_date}</span>
                        <span className="text-muted-foreground block text-[11px]">Exp: {o.expected_date || 'Not set'}</span>
                    </div>
                    <div className="border-l pl-3 min-w-[150px]">
                        <span className="text-muted-foreground text-[10px] uppercase font-bold block">Financial Summary</span>
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Subtotal:</span>
                            <span className="font-mono">{money((o.total_parts_billed || 0) + (o.total_labour_cost || 0))}</span>
                        </div>
                        {(o.discount_amount || 0) > 0 && (
                            <div className="flex items-center justify-between text-[11px] text-amber-600 dark:text-amber-400">
                                <span>Discount:</span>
                                <span className="font-mono font-medium">- {money(o.discount_amount)}</span>
                            </div>
                        )}
                        <div className="flex items-center justify-between text-xs font-semibold">
                            <span>Total:</span>
                            <strong className="font-mono text-foreground">{money(o.total_amount)}</strong>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-amber-600 font-bold">
                            <span>Balance Due:</span>
                            <strong className="font-mono">{money(o.balance_due)}</strong>
                        </div>
                    </div>
                </div>

                {/* In-Page Body with Tabs */}
                <div className="flex-1 min-h-0 flex flex-col p-6 overflow-hidden">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                        <div className="shrink-0 border-b pb-2">
                            <TabsList className="h-8">
                                <TabsTrigger value="device" className="text-xs h-7 gap-1.5">
                                    <IconDeviceMobile size={13} />
                                    Fault &amp; Device Details
                                </TabsTrigger>
                                <TabsTrigger value="parts" className="text-xs h-7 gap-1.5">
                                    <IconPackage size={13} />
                                    Parts Consumed ({currentDetail.parts.length})
                                </TabsTrigger>
                                <TabsTrigger value="labour" className="text-xs h-7 gap-1.5">
                                    <IconTools size={13} />
                                    Labour &amp; Services ({currentDetail.labour.length})
                                </TabsTrigger>
                                <TabsTrigger value="history" className="text-xs h-7 gap-1.5">
                                    <IconClock size={13} />
                                    Status History ({currentDetail.status_log.length})
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* TAB 1: FAULT & DEVICE DETAILS */}
                        <TabsContent value="device" className="flex-1 overflow-auto pt-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <Card className="shadow-none border">
                                    <CardContent className="p-4 space-y-2">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer Complaint / Fault</h4>
                                        <p className="text-sm font-medium text-foreground whitespace-pre-wrap">{o.complaint}</p>
                                    </CardContent>
                                </Card>

                                <Card className="shadow-none border">
                                    <CardContent className="p-4 space-y-2">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Condition on Arrival</h4>
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{o.device_condition || 'Not specified'}</p>
                                    </CardContent>
                                </Card>
                            </div>

                            {o.technician_notes && (
                                <Card className="shadow-none border">
                                    <CardContent className="p-4 space-y-2">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Technician Diagnostics &amp; Notes</h4>
                                        <p className="text-sm text-foreground whitespace-pre-wrap">{o.technician_notes}</p>
                                    </CardContent>
                                </Card>
                            )}

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <div className="p-3 bg-muted/30 rounded-lg border text-xs">
                                    <span className="text-muted-foreground block mb-0.5">Gross Bill</span>
                                    <span className="font-bold text-sm font-mono">{money((o.total_parts_billed || 0) + (o.total_labour_cost || 0))}</span>
                                </div>
                                <div className="p-3 bg-muted/30 rounded-lg border text-xs">
                                    <span className="text-muted-foreground block mb-0.5">Discount</span>
                                    <span className="font-bold text-sm font-mono text-amber-600">{(o.discount_amount || 0) > 0 ? `- ${money(o.discount_amount)}` : '₹0.00'}</span>
                                </div>
                                <div className="p-3 bg-muted/30 rounded-lg border text-xs">
                                    <span className="text-muted-foreground block mb-0.5">Advance Received</span>
                                    <span className="font-bold text-sm font-mono text-blue-600">{money(o.advance_amount)}</span>
                                </div>
                                <div className="p-3 bg-muted/30 rounded-lg border text-xs">
                                    <span className="text-muted-foreground block mb-0.5">Tech Commission</span>
                                    <span className="font-bold text-sm font-mono text-foreground">{money(o.commission_amount)}</span>
                                </div>
                                <div className="p-3 bg-muted/30 rounded-lg border text-xs">
                                    <span className="text-muted-foreground block mb-0.5">Net Balance Due</span>
                                    <span className="font-bold text-sm font-mono text-amber-600">{money(o.balance_due)}</span>
                                </div>
                            </div>
                        </TabsContent>

                                                {/* TAB 2: PARTS CONSUMED */}
                        <TabsContent value="parts" className="flex-1 flex flex-col min-h-0 pt-3 space-y-3">
                            <div className="flex justify-between items-center shrink-0">
                                <span className="font-semibold text-xs text-muted-foreground">
                                    Inventory Spare Parts Consumed
                                </span>
                                {o.status !== 'delivered' && o.status !== 'cancelled' && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/5"
                                        onClick={() => openEditOrder('parts')}
                                    >
                                        <IconPlus size={13} /> Add / Edit Spare Parts
                                    </Button>
                                )}
                            </div>

                            {/* Parts Table */}
                            <div className="flex-1 overflow-auto border rounded-lg bg-card">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-muted/50 border-b sticky top-0">
                                        <tr>
                                            <th className="p-2.5 font-semibold text-muted-foreground">Spare Part Name</th>
                                            <th className="p-2.5 text-center w-16 font-semibold text-muted-foreground">Qty</th>
                                            <th className="p-2.5 text-right w-28 font-semibold text-muted-foreground">Cost Price</th>
                                            <th className="p-2.5 text-right w-28 font-semibold text-muted-foreground">Selling Rate</th>
                                            <th className="p-2.5 text-right w-28 font-semibold text-muted-foreground">Amount</th>
                                            {o.status !== 'delivered' && o.status !== 'cancelled' && (
                                                <th className="p-2.5 text-center w-12 font-semibold text-muted-foreground">Action</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {currentDetail.parts.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                                                    No spare parts added to this order.
                                                </td>
                                            </tr>
                                        ) : (
                                            currentDetail.parts.map((p, idx) => (
                                                <tr key={p.id || idx}>
                                                    <td className="p-2.5 font-medium">
                                                        <div className="font-medium text-foreground">{p.product_name}</div>
                                                        {p.product_code && <div className="text-[10px] text-muted-foreground font-mono">{p.product_code}</div>}
                                                    </td>
                                                    <td className="p-2.5 text-center font-mono">{p.quantity}</td>
                                                    <td className="p-2.5 text-right font-mono text-muted-foreground">{money(p.cost_rate)}</td>
                                                    <td className="p-2.5 text-right font-mono">{money(p.selling_rate)}</td>
                                                    <td className="p-2.5 text-right font-mono font-bold text-foreground">{money(p.selling_amount)}</td>
                                                    {o.status !== 'delivered' && o.status !== 'cancelled' && (
                                                        <td className="p-2.5 text-center">
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                                                onClick={() => handleRemovePart(idx)}
                                                                title="Remove part"
                                                            >
                                                                <IconTrash size={13} />
                                                            </Button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    <tfoot className="border-t bg-muted/20 font-semibold">
                                        <tr>
                                            <td colSpan={4} className="p-2.5 text-left">
                                                {o.status !== 'delivered' && o.status !== 'cancelled' && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openEditOrder('parts')}
                                                        className="text-xs h-7 gap-1 font-medium text-primary hover:bg-primary/5"
                                                    >
                                                        <IconPlus size={14} /> Add / Edit Spare Parts
                                                    </Button>
                                                )}
                                            </td>
                                            <td className="p-2.5 text-right font-mono text-primary font-bold">{money(o.total_parts_billed)}</td>
                                            {o.status !== 'delivered' && o.status !== 'cancelled' && <td />}
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </TabsContent>

                        {/* TAB 3: LABOUR & SERVICES */}
                        <TabsContent value="labour" className="flex-1 flex flex-col min-h-0 pt-3 space-y-3">
                            <div className="flex justify-between items-center shrink-0">
                                <span className="font-semibold text-xs text-muted-foreground">
                                    Labour &amp; Repair Services
                                </span>
                                {o.status !== 'delivered' && o.status !== 'cancelled' && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/5"
                                        onClick={() => openEditOrder('labour')}
                                    >
                                        <IconPlus size={13} /> Add / Edit Labour
                                    </Button>
                                )}
                            </div>

                            {/* Labour Table */}
                            <div className="flex-1 overflow-auto border rounded-lg bg-card">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-muted/50 border-b sticky top-0">
                                        <tr>
                                            <th className="p-2.5 font-semibold text-muted-foreground">Service Description</th>
                                            <th className="p-2.5 text-center w-16 font-semibold text-muted-foreground">Qty</th>
                                            <th className="p-2.5 text-right w-28 font-semibold text-muted-foreground">Rate</th>
                                            <th className="p-2.5 text-right w-28 font-semibold text-muted-foreground">Amount</th>
                                            {o.status !== 'delivered' && o.status !== 'cancelled' && (
                                                <th className="p-2.5 text-center w-12 font-semibold text-muted-foreground">Action</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {currentDetail.labour.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                                                    No labour charges added to this order.
                                                </td>
                                            </tr>
                                        ) : (
                                            currentDetail.labour.map((l, idx) => (
                                                <tr key={l.id || idx}>
                                                    <td className="p-2.5 font-medium">{l.description}</td>
                                                    <td className="p-2.5 text-center font-mono">{l.quantity}</td>
                                                    <td className="p-2.5 text-right font-mono">{money(l.rate)}</td>
                                                    <td className="p-2.5 text-right font-mono font-bold text-foreground">{money(l.amount)}</td>
                                                    {o.status !== 'delivered' && o.status !== 'cancelled' && (
                                                        <td className="p-2.5 text-center">
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                                                onClick={() => handleRemoveLabour(idx)}
                                                                title="Remove labour"
                                                            >
                                                                <IconTrash size={13} />
                                                            </Button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                    <tfoot className="border-t bg-muted/20 font-semibold">
                                        <tr>
                                            <td colSpan={3} className="p-2.5 text-left">
                                                {o.status !== 'delivered' && o.status !== 'cancelled' && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openEditOrder('labour')}
                                                        className="text-xs h-7 gap-1 font-medium text-primary hover:bg-primary/5"
                                                    >
                                                        <IconPlus size={14} /> Add / Edit Labour & Services
                                                    </Button>
                                                )}
                                            </td>
                                            <td className="p-2.5 text-right font-mono text-primary font-bold">{money(o.total_labour_cost)}</td>
                                            {o.status !== 'delivered' && o.status !== 'cancelled' && <td />}
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </TabsContent>

                        {/* TAB 4: STATUS HISTORY */}
                        <TabsContent value="history" className="flex-1 overflow-auto pt-3 space-y-2">
                            {currentDetail.status_log.length === 0 ? (
                                <p className="text-xs text-muted-foreground p-4 text-center">No status history logged yet.</p>
                            ) : (
                                currentDetail.status_log.map(log => (
                                    <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card text-xs">
                                        <div className="mt-0.5 p-1 rounded-full bg-primary/10 text-primary">
                                            <IconCheck size={13} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <span className="font-semibold uppercase tracking-wider text-[11px] text-foreground">
                                                    {log.new_status.replace('_', ' ')}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">{log.changed_at}</span>
                                            </div>
                                            {log.notes && (
                                                <p className="text-muted-foreground text-xs mt-1">{log.notes}</p>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
        );
    };

    // ==================== VIEW 3: NEW / EDIT FORM MODE (IN-PAGE TABS) ====================
    const renderFormView = () => (
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
            <div className="flex-1 min-h-0 p-5 max-w-7xl mx-auto w-full flex flex-col gap-4 overflow-hidden">
                {/* Master Details Card */}
                <div className="bg-card border rounded-lg p-3 shrink-0">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        <div className="md:col-span-2">
                            <Label className="text-xs font-medium mb-1 block">
                                Customer <span className="text-destructive">*</span>
                            </Label>
                            <Combobox
                                options={customers.map(c => ({
                                    value: c.id,
                                    label: c.phone ? `${c.name} (${c.phone})` : c.name,
                                    searchString: `${c.name} ${c.phone || ''}`,
                                }))}
                                value={formData.customerId}
                                onChange={v => setFormData(f => ({ ...f, customerId: String(v) }))}
                                onAfterSelect={() => focusField('so-order-date')}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        focusField('so-order-date');
                                    }
                                }}
                                placeholder="Search or select customer..."
                                searchPlaceholder="Type name or phone..."
                                className="h-8 text-xs w-full"
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

                        <div>
                            <Label className="text-xs font-medium mb-1 block">Intake Date *</Label>
                            <Input
                                id="so-order-date"
                                type="date"
                                className="h-8 text-xs"
                                value={formData.orderDate}
                                onChange={e => setFormData(f => ({ ...f, orderDate: e.target.value }))}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        focusField('so-expected-date');
                                    }
                                }}
                            />
                        </div>

                        <div>
                            <Label className="text-xs font-medium mb-1 block">Expected Delivery</Label>
                            <Input
                                id="so-expected-date"
                                type="date"
                                className="h-8 text-xs"
                                value={formData.expectedDate}
                                onChange={e => setFormData(f => ({ ...f, expectedDate: e.target.value }))}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        focusField('so-device-brand');
                                    }
                                }}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3 pt-3 mt-3 border-t text-xs">
                        <div>
                            <Label className="text-xs font-medium mb-1 block">Device Brand</Label>
                            <Input
                                id="so-device-brand"
                                placeholder="e.g. Apple, Samsung"
                                className="h-8 text-xs"
                                value={formData.deviceBrand}
                                onChange={e => setFormData(f => ({ ...f, deviceBrand: e.target.value }))}
                                onFocus={e => e.target.select()}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        focusField('so-device-model');
                                    }
                                }}
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-medium mb-1 block">Device Model</Label>
                            <Input
                                id="so-device-model"
                                placeholder="e.g. iPhone 13, A53"
                                className="h-8 text-xs"
                                value={formData.deviceModel}
                                onChange={e => setFormData(f => ({ ...f, deviceModel: e.target.value }))}
                                onFocus={e => e.target.select()}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        focusField('so-device-imei');
                                    }
                                }}
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-medium mb-1 block">IMEI / Serial No.</Label>
                            <Input
                                id="so-device-imei"
                                placeholder="15-digit IMEI"
                                className="h-8 text-xs font-mono"
                                value={formData.deviceImei}
                                onChange={e => setFormData(f => ({ ...f, deviceImei: e.target.value }))}
                                onFocus={e => e.target.select()}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        focusField('so-device-color');
                                    }
                                }}
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-medium mb-1 block">Device Color</Label>
                            <Input
                                id="so-device-color"
                                placeholder="e.g. Midnight Black"
                                className="h-8 text-xs"
                                value={formData.deviceColor}
                                onChange={e => setFormData(f => ({ ...f, deviceColor: e.target.value }))}
                                onFocus={e => e.target.select()}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        setActiveTab('device');
                                        focusField('so-complaint');
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Form Tabs Section */}
                <div className="bg-card border rounded-lg flex-1 min-h-0 flex flex-col overflow-hidden">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                        <div className="px-3 py-2 shrink-0 border-b bg-muted/20">
                            <TabsList className="h-8">
                                <TabsTrigger value="device" className="text-xs h-7 gap-1.5">
                                    <IconDeviceMobile size={13} />
                                    Fault &amp; Assignment
                                </TabsTrigger>
                                <TabsTrigger value="parts" className="text-xs h-7 gap-1.5">
                                    <IconPackage size={13} />
                                    Parts Consumed
                                    {formParts.some(p => !!p.productId) && (
                                        <span className="ml-1 min-w-4 h-4 px-1 rounded-full bg-primary/15 text-primary text-[10px] leading-4 text-center">
                                            {formParts.filter(p => !!p.productId).length}
                                        </span>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger value="labour" className="text-xs h-7 gap-1.5">
                                    <IconTools size={13} />
                                    Labour &amp; Services
                                    {formLabour.length > 0 && (
                                        <span className="ml-1 min-w-4 h-4 px-1 rounded-full bg-primary/15 text-primary text-[10px] leading-4 text-center">
                                            {formLabour.length}
                                        </span>
                                    )}
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* TAB 1: FAULT & ASSIGNMENT */}
                        <TabsContent value="device" className="flex-1 overflow-auto p-4 space-y-4 text-xs">
                            <div>
                                <Label className="text-xs font-medium mb-1 block">
                                    Customer Complaint / Fault Description <span className="text-destructive">*</span>
                                </Label>
                                <Textarea
                                    id="so-complaint"
                                    rows={3}
                                    placeholder="e.g. Display screen flickering, battery draining fast, device not charging..."
                                    className="text-xs"
                                    value={formData.complaint}
                                    onChange={e => setFormData(f => ({ ...f, complaint: e.target.value }))}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            focusField('so-device-condition');
                                        }
                                    }}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-xs font-medium mb-1 block">Condition on Arrival</Label>
                                    <Input
                                        id="so-device-condition"
                                        placeholder="e.g. Broken front glass, minor back scratches"
                                        className="h-8 text-xs"
                                        value={formData.deviceCondition}
                                        onChange={e => setFormData(f => ({ ...f, deviceCondition: e.target.value }))}
                                        onFocus={e => e.target.select()}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                focusField('so-security-pin');
                                            }
                                        }}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs font-medium mb-1 block">Screen Lock PIN / Pattern</Label>
                                    <Input
                                        id="so-security-pin"
                                        placeholder="Device password/PIN for testing"
                                        className="h-8 text-xs font-mono"
                                        value={formData.securityPinPattern}
                                        onChange={e => setFormData(f => ({ ...f, securityPinPattern: e.target.value }))}
                                        onFocus={e => e.target.select()}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                focusField('so-technician');
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-4 p-3 bg-muted/20 rounded-lg border">
                                <div>
                                    <Label className="text-xs font-medium mb-1 block">Assign Technician</Label>
                                    <Select
                                        value={formData.assignedTo}
                                        onValueChange={v => {
                                            setFormData(f => ({ ...f, assignedTo: v }));
                                            focusField('so-commission-type');
                                        }}
                                    >
                                        <SelectTrigger
                                            id="so-technician"
                                            className="h-8 text-xs"
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    focusField('so-commission-type');
                                                }
                                            }}
                                        >
                                            <SelectValue placeholder="Select Technician" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {employees.map(e => (
                                                <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs font-medium mb-1 block">Commission Model</Label>
                                    <Select
                                        value={formData.commissionType}
                                        onValueChange={v => {
                                            setFormData(f => ({ ...f, commissionType: v }));
                                            focusField('so-commission-rate');
                                        }}
                                    >
                                        <SelectTrigger
                                            id="so-commission-type"
                                            className="h-8 text-xs"
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    focusField('so-commission-rate');
                                                }
                                            }}
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="percentage">% of Labour</SelectItem>
                                            <SelectItem value="fixed">Fixed ₹ Per Job</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs font-medium mb-1 block">
                                        {formData.commissionType === 'percentage' ? 'Commission %' : 'Commission ₹'}
                                    </Label>
                                    <Input
                                        id="so-commission-rate"
                                        type="number"
                                        className="h-8 text-xs"
                                        value={formData.commissionRate}
                                        onChange={e => setFormData(f => ({ ...f, commissionRate: Number(e.target.value) }))}
                                        onFocus={e => e.target.select()}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                focusField('so-estimated-cost');
                                            }
                                        }}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs font-medium mb-1 block">Estimated Cost (₹)</Label>
                                    <Input
                                        id="so-estimated-cost"
                                        type="number"
                                        className="h-8 text-xs font-mono"
                                        value={formData.estimatedCost}
                                        onChange={e => setFormData(f => ({ ...f, estimatedCost: Number(e.target.value) }))}
                                        onFocus={e => e.target.select()}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (formData.collectAdvance) {
                                                    focusField('so-advance-amount');
                                                } else {
                                                    focusField('formAdvCheck');
                                                }
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Advance payment */}
                            <div className="p-3 bg-muted/30 rounded-lg border space-y-2">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="formAdvCheck"
                                        checked={formData.collectAdvance}
                                        onChange={e => {
                                            const checked = e.target.checked;
                                            setFormData(f => ({ ...f, collectAdvance: checked }));
                                            if (checked) {
                                                focusField('so-advance-amount');
                                            }
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (formData.collectAdvance) {
                                                    focusField('so-advance-amount');
                                                } else {
                                                    setActiveTab('parts');
                                                    focusFirstPartRow();
                                                }
                                            }
                                        }}
                                        className="rounded border-gray-300"
                                    />
                                    <Label htmlFor="formAdvCheck" className="cursor-pointer font-medium text-xs">
                                        Collect advance payment now
                                    </Label>
                                </div>

                                {formData.collectAdvance && (
                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                        <div>
                                            <Label className="text-xs">Advance Amount (₹)</Label>
                                            <Input
                                                id="so-advance-amount"
                                                type="number"
                                                min={0}
                                                className="h-8 text-xs font-mono"
                                                value={formData.advanceAmount}
                                                onChange={e => setFormData(f => ({ ...f, advanceAmount: Number(e.target.value) }))}
                                                onFocus={e => e.target.select()}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        focusField('so-advance-account');
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Payment Ledger Account</Label>
                                            <Select
                                                value={formData.cashBankAccount}
                                                onValueChange={v => {
                                                    setFormData(f => ({ ...f, cashBankAccount: v }));
                                                    setActiveTab('parts');
                                                    focusFirstPartRow();
                                                }}
                                            >
                                                <SelectTrigger
                                                    id="so-advance-account"
                                                    className="h-8 text-xs"
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            setActiveTab('parts');
                                                            focusFirstPartRow();
                                                        }
                                                    }}
                                                >
                                                    <SelectValue placeholder="Select Cash / Bank" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {paymentAccounts.map(a => (
                                                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        {/* TAB 2: PARTS CONSUMED */}
                        <TabsContent value="parts" className="flex-1 flex flex-col min-h-0 p-3 space-y-3 text-xs">
                            <div className="flex justify-between items-center shrink-0">
                                <span className="font-semibold text-xs text-muted-foreground">
                                    Assign Spare Parts to Order
                                </span>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/5"
                                    onClick={() => {
                                        setQuickPartActiveRow(null);
                                        setQuickPartName('');
                                        setQuickAddPartOpen(true);
                                    }}
                                >
                                    <IconPlus size={13} /> Quick Add Spare Part
                                </Button>
                            </div>

                            {/* Sales Invoice Style Parts Table */}
                            <div className="bg-card border rounded-lg overflow-hidden flex flex-col flex-1 min-h-0">
                                {/* Table Header */}
                                <div className="bg-muted/50 border-b shrink-0 px-3 py-1.5 text-xs font-semibold text-muted-foreground grid grid-cols-[32px_2.5fr_72px_100px_100px_100px_64px] gap-2 items-center select-none">
                                    <div className="text-center">#</div>
                                    <div>Spare Part / Product *</div>
                                    <div className="text-center">Qty</div>
                                    <div className="text-right">Cost Price (₹)</div>
                                    <div className="text-right">Selling Rate (₹)</div>
                                    <div className="text-right">Total (₹)</div>
                                    <div className="text-center">Action</div>
                                </div>

                                {/* Items Scrollable List */}
                                <div className="divide-y overflow-y-auto flex-1">
                                    {formParts.length === 0 ? (
                                        <div className="p-8 text-center text-muted-foreground">
                                            No spare parts added. Click &quot;Add Spare Part&quot; below.
                                        </div>
                                    ) : (
                                        formParts.map((p, idx) => (
                                            <div
                                                key={idx}
                                                data-part-row={idx}
                                                className="px-3 py-1.5 grid grid-cols-[32px_2.5fr_72px_100px_100px_100px_64px] gap-2 items-center hover:bg-muted/10 transition-colors"
                                            >
                                                {/* 1. Sl No */}
                                                <div className="text-xs text-muted-foreground text-center font-medium select-none">
                                                    {idx + 1}
                                                </div>

                                                {/* 2. Product Combobox */}
                                                <div className="min-w-0">
                                                    <Combobox
                                                        headerColumns={cbHeaderCols}
                                                        popoverClassName={cbWidthClass}
                                                        options={productOptions}
                                                        value={p.productId || undefined}
                                                        onChange={v => handleUpdateFormPartRow(idx, 'productId', v)}
                                                        onAfterSelect={() => focusPartField(idx, 'quantity')}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' && !p.productId) {
                                                                e.preventDefault();
                                                                setActiveTab('labour');
                                                                focusFirstLabourRow();
                                                            }
                                                        }}
                                                        onActionClick={() => {
                                                            setQuickPartActiveRow(idx);
                                                            setQuickPartName('');
                                                            setQuickAddPartOpen(true);
                                                        }}
                                                        onCreate={name => {
                                                            setQuickPartActiveRow(idx);
                                                            setQuickPartName(name);
                                                            setQuickAddPartOpen(true);
                                                        }}
                                                        placeholder="Select or search spare part from stock..."
                                                        searchPlaceholder="Search products by name, code, barcode..."
                                                        className="h-8 text-xs w-full"
                                                    />
                                                </div>

                                                {/* 3. Quantity */}
                                                <div>
                                                    <Input
                                                        data-field="quantity"
                                                        type="number"
                                                        min={1}
                                                        className="h-8 text-xs font-mono text-center"
                                                        value={p.quantity}
                                                        onChange={e => handleUpdateFormPartRow(idx, 'quantity', e.target.value)}
                                                        onFocus={e => e.target.select()}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                focusPartField(idx, 'costRate');
                                                            }
                                                        }}
                                                    />
                                                </div>

                                                {/* 4. Cost Price */}
                                                <div>
                                                    <Input
                                                        data-field="costRate"
                                                        type="number"
                                                        min={0}
                                                        step="any"
                                                        className="h-8 text-xs font-mono text-right"
                                                        value={p.costRate}
                                                        onChange={e => handleUpdateFormPartRow(idx, 'costRate', e.target.value)}
                                                        onFocus={e => e.target.select()}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                focusPartField(idx, 'sellingRate');
                                                            }
                                                        }}
                                                    />
                                                </div>

                                                {/* 5. Selling Rate */}
                                                <div>
                                                    <Input
                                                        data-field="sellingRate"
                                                        type="number"
                                                        min={0}
                                                        step="any"
                                                        className="h-8 text-xs font-mono text-right font-medium"
                                                        value={p.sellingRate}
                                                        onChange={e => handleUpdateFormPartRow(idx, 'sellingRate', e.target.value)}
                                                        onFocus={e => e.target.select()}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                if (idx === formParts.length - 1) {
                                                                    if (p.productId) {
                                                                        handleAddFormPartRow();
                                                                        focusPartField(idx + 1, 'product');
                                                                    } else {
                                                                        setActiveTab('labour');
                                                                        focusFirstLabourRow();
                                                                    }
                                                                } else {
                                                                    focusPartField(idx + 1, 'product');
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>

                                                {/* 6. Total Amount */}
                                                <div className="text-right font-mono font-bold text-xs text-foreground pr-1 truncate">
                                                    {money(p.sellingAmount || (p.quantity * p.sellingRate))}
                                                </div>

                                                {/* 7. Action buttons */}
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                                        onClick={() => handleAddFormPartRow(idx)}
                                                        title="Insert row below"
                                                    >
                                                        <IconPlus size={13} />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleRemoveFormPartRow(idx)}
                                                        title="Delete row"
                                                    >
                                                        <IconTrash size={13} />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Table Footer */}
                                <div className="bg-muted/30 border-t px-3 py-2 shrink-0 flex justify-between items-center text-xs">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleAddFormPartRow()}
                                        className="text-xs h-7 gap-1 font-medium text-primary hover:bg-primary/5"
                                    >
                                        <IconPlus size={14} /> Add Spare Part
                                    </Button>
                                    <div className="text-xs font-semibold text-muted-foreground">
                                        Total Parts Billed: <span className="font-mono font-bold text-primary text-sm ml-1">{money(formPartsTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {/* TAB 3: LABOUR & SERVICES */}
                        <TabsContent value="labour" className="flex-1 flex flex-col min-h-0 p-3 space-y-3 text-xs">
                            <div className="flex justify-between items-center shrink-0">
                                <span className="font-semibold text-xs text-muted-foreground">
                                    Assign Labour / Services
                                </span>
                            </div>

                            {/* Sales Invoice Style Labour Table */}
                            <div className="bg-card border rounded-lg overflow-hidden flex flex-col flex-1 min-h-0">
                                {/* Table Header */}
                                <div className="bg-muted/50 border-b shrink-0 px-3 py-1.5 text-xs font-semibold text-muted-foreground grid grid-cols-[32px_2.5fr_72px_110px_110px_64px] gap-2 items-center select-none">
                                    <div className="text-center">#</div>
                                    <div>Service / Labour Description *</div>
                                    <div className="text-center">Qty</div>
                                    <div className="text-right">Rate (₹)</div>
                                    <div className="text-right">Total (₹)</div>
                                    <div className="text-center">Action</div>
                                </div>

                                {/* Items Scrollable List */}
                                <div className="divide-y overflow-y-auto flex-1">
                                    {formLabour.length === 0 ? (
                                        <div className="p-8 text-center text-muted-foreground">
                                            No labour charges added. Click &quot;Add Labour / Service&quot; below.
                                        </div>
                                    ) : (
                                        formLabour.map((l, idx) => (
                                            <div
                                                key={idx}
                                                data-labour-row={idx}
                                                className="px-3 py-1.5 grid grid-cols-[32px_2.5fr_72px_110px_110px_64px] gap-2 items-center hover:bg-muted/10 transition-colors"
                                            >
                                                {/* 1. Sl No */}
                                                <div className="text-xs text-muted-foreground text-center font-medium select-none">
                                                    {idx + 1}
                                                </div>

                                                {/* 2. Service Combobox */}
                                                <div className="min-w-0">
                                                    <Combobox
                                                        options={getServiceOptionsForRow(l, idx)}
                                                        value={l.serviceId ? l.serviceId : (l.description ? `custom:${idx}` : undefined)}
                                                        onChange={val => {
                                                            const strVal = String(val);
                                                            if (strVal.startsWith('custom:')) return;
                                                            handleUpdateFormLabourRow(idx, 'serviceId', strVal);
                                                        }}
                                                        onCreate={name => {
                                                            handleUpdateFormLabourRow(idx, 'description', name);
                                                            focusLabourField(idx, 'rate');
                                                        }}
                                                        onAfterSelect={() => focusLabourField(idx, 'quantity')}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' && !l.description && !l.serviceId) {
                                                                e.preventDefault();
                                                                focusField('so-discount-rate');
                                                            }
                                                        }}
                                                        placeholder="Select preset service or type custom description..."
                                                        searchPlaceholder="Search service or type custom..."
                                                        className="h-8 text-xs w-full"
                                                    />
                                                </div>

                                                {/* 3. Quantity */}
                                                <div>
                                                    <Input
                                                        data-field="quantity"
                                                        type="number"
                                                        min={1}
                                                        className="h-8 text-xs font-mono text-center"
                                                        value={l.quantity}
                                                        onChange={e => handleUpdateFormLabourRow(idx, 'quantity', e.target.value)}
                                                        onFocus={e => e.target.select()}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                focusLabourField(idx, 'rate');
                                                            }
                                                        }}
                                                    />
                                                </div>

                                                {/* 4. Rate */}
                                                <div>
                                                    <Input
                                                        data-field="rate"
                                                        type="number"
                                                        min={0}
                                                        step="any"
                                                        className="h-8 text-xs font-mono text-right font-medium"
                                                        value={l.rate}
                                                        onChange={e => handleUpdateFormLabourRow(idx, 'rate', e.target.value)}
                                                        onFocus={e => e.target.select()}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                if (idx === formLabour.length - 1) {
                                                                    if (l.description || l.serviceId) {
                                                                        handleAddFormLabourRow();
                                                                        focusLabourField(idx + 1, 'service');
                                                                    } else {
                                                                        focusField('so-discount-rate');
                                                                    }
                                                                } else {
                                                                    focusLabourField(idx + 1, 'service');
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>

                                                {/* 5. Total Amount */}
                                                <div className="text-right font-mono font-bold text-xs text-foreground pr-1 truncate">
                                                    {money(l.amount || (l.quantity * l.rate))}
                                                </div>

                                                {/* 6. Action buttons */}
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                                        onClick={() => handleAddFormLabourRow(idx)}
                                                        title="Insert row below"
                                                    >
                                                        <IconPlus size={13} />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleRemoveFormLabourRow(idx)}
                                                        title="Delete row"
                                                    >
                                                        <IconTrash size={13} />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Table Footer */}
                                <div className="bg-muted/30 border-t px-3 py-2 shrink-0 flex justify-between items-center text-xs">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleAddFormLabourRow()}
                                        className="text-xs h-7 gap-1 font-medium text-primary hover:bg-primary/5"
                                    >
                                        <IconPlus size={14} /> Add Labour / Service
                                    </Button>
                                    <div className="text-xs font-semibold text-muted-foreground">
                                        Total Labour Charges: <span className="font-mono font-bold text-primary text-sm ml-1">{money(formLabourTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Sticky Bottom Summary Bar */}
                <div className="p-3 bg-muted/40 rounded-lg border flex items-center justify-between text-xs shrink-0">
                    <div className="flex items-center gap-3 text-muted-foreground">
                        <div>Parts: <strong className="text-foreground font-mono">{money(formPartsTotal)}</strong></div>
                        <div>Labour: <strong className="text-foreground font-mono">{money(formLabourTotal)}</strong></div>
                        <div>Subtotal: <strong className="text-foreground font-mono">{money(formSubtotal)}</strong></div>
                        <div>Commission: <strong className="text-foreground font-mono">{money(formCommission)}</strong></div>
                        <div className="flex items-center gap-1.5 border-l pl-3">
                            <span className="font-medium text-foreground">Discount:</span>
                            <div className="flex items-center gap-0.5">
                                <Input
                                    id="so-discount-rate"
                                    type="number"
                                    min={0}
                                    max={100}
                                    placeholder="0"
                                    className="h-7 w-14 text-xs font-mono text-right p-1"
                                    value={formData.discountRate || ''}
                                    onChange={e => {
                                        const rate = Math.max(0, Number(e.target.value) || 0);
                                        const amt = formSubtotal > 0 ? Math.round((formSubtotal * rate / 100) * 100) / 100 : 0;
                                        setFormData(prev => ({ ...prev, discountRate: rate, discountAmount: amt }));
                                    }}
                                    onFocus={e => e.target.select()}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            focusField('so-discount-amount');
                                        }
                                    }}
                                    title="Discount Percentage (%)"
                                />
                                <span className="text-[11px] text-muted-foreground">%</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                                <span className="text-[11px] text-muted-foreground">₹</span>
                                <Input
                                    id="so-discount-amount"
                                    type="number"
                                    min={0}
                                    placeholder="0.00"
                                    className="h-7 w-20 text-xs font-mono text-right p-1"
                                    value={formData.discountAmount || ''}
                                    onChange={e => {
                                        const amt = Math.max(0, Number(e.target.value) || 0);
                                        const rate = formSubtotal > 0 ? Math.round((amt / formSubtotal * 100) * 100) / 100 : 0;
                                        setFormData(prev => ({ ...prev, discountAmount: amt, discountRate: rate }));
                                    }}
                                    onFocus={e => e.target.select()}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            focusField('so-save-button');
                                        }
                                    }}
                                    title="Discount Amount (₹)"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-sm font-semibold">
                            Net Total: <span className="font-mono text-primary text-base font-bold">{money(formGrandTotal)}</span>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleCancelForm} disabled={saving}>
                            Cancel
                        </Button>
                        <Button id="so-save-button" size="sm" className="gap-1.5" onClick={handleSaveOrder} disabled={saving}>
                            <IconDeviceFloppy size={14} />
                            {saving ? 'Saving...' : mode === 'editing' ? 'Update Order' : 'Save Order'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full overflow-hidden bg-background">
            {/* Top Unified Header */}
            {renderHeader()}

            {/* Dynamic Content by Mode */}
            {mode === 'list' && renderListView()}
            {mode === 'viewing' && renderViewingView()}
            {(mode === 'new' || mode === 'editing') && renderFormView()}

            {/* AUXILIARY DIALOGS ONLY */}

            {/* 1. Quick Add Customer Dialog */}
            <CustomerDialog
                open={showCreateCustomer}
                onOpenChange={setShowCreateCustomer}
                customerToEdit={null}
                onSave={handleCustomerCreated}
                initialName={newCustomerName}
            />

            {/* 2. Quick Add Supplier Dialog */}
            <SupplierDialog
                open={showCreateSupplier}
                onOpenChange={setShowCreateSupplier}
                supplierToEdit={null}
                onSave={handleSupplierCreated}
                initialName={newSupplierName}
            />

            {/* 3. Quick Add Spare Part Dialog */}
            <Dialog open={quickAddPartOpen} onOpenChange={setQuickAddPartOpen}>
                <DialogContent className="sm:max-w-xl max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2">
                            <IconPackage size={18} className="text-primary" />
                            Quick Add Spare Part
                        </DialogTitle>
                        <p className="text-xs text-muted-foreground">
                            Create a new spare part and record inward stock / purchase in one step.
                        </p>
                    </DialogHeader>

                    <div className="space-y-4 py-2 text-xs">
                        <div className="space-y-3.5 p-3.5 bg-muted/30 rounded-lg border">
                            <div>
                                <Label className="text-xs block mb-1">
                                    Part Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    placeholder="e.g. iPhone 13 Screen (Original) or Type-C Charging Port"
                                    className="h-8 text-xs"
                                    value={quickPartName}
                                    onChange={e => setQuickPartName(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            focusField('qp-cost-rate');
                                        }
                                    }}
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs block mb-1">Group / Category</Label>
                                    <Select value={quickPartGroupId} onValueChange={setQuickPartGroupId}>
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Select group (optional)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {groups.map((g: any) => (
                                                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs block mb-1">Unit</Label>
                                    <Select value={quickPartUnitId} onValueChange={setQuickPartUnitId}>
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Select unit" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {units.map((u: Unit) => (
                                                <SelectItem key={u.id} value={u.id}>{u.name} ({u.symbol})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <Label className="text-xs block mb-1">
                                        Purchase Price / Cost (₹) <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="qp-cost-rate"
                                        type="number"
                                        min="0"
                                        step="any"
                                        placeholder="0"
                                        className="h-8 text-xs font-mono"
                                        value={quickPartCostRate}
                                        onChange={e => setQuickPartCostRate(Number(e.target.value))}
                                        onFocus={e => e.target.select()}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                focusField('qp-selling-rate');
                                            }
                                        }}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs block mb-1">
                                        Selling Rate (₹) <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="qp-selling-rate"
                                        type="number"
                                        min="0"
                                        step="any"
                                        placeholder="0"
                                        className="h-8 text-xs font-mono"
                                        value={quickPartSellingRate}
                                        onChange={e => setQuickPartSellingRate(Number(e.target.value))}
                                        onFocus={e => e.target.select()}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                focusField('qp-qty');
                                            }
                                        }}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs block mb-1">Quantity</Label>
                                    <Input
                                        id="qp-qty"
                                        type="number"
                                        min="1"
                                        className="h-8 text-xs font-mono"
                                        value={quickPartQty}
                                        onChange={e => setQuickPartQty(Math.max(1, Number(e.target.value)))}
                                        onFocus={e => e.target.select()}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                focusField('qp-bill-ref');
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs block mb-1">Supplier / Paid From</Label>
                                    <Select value={quickPartPaidFrom} onValueChange={setQuickPartPaidFrom}>
                                        <SelectTrigger
                                            className="h-8 text-xs w-full"
                                            onActionClick={() => {
                                                setNewSupplierName('');
                                                setShowCreateSupplier(true);
                                            }}
                                            actionTitle="New Supplier"
                                        >
                                            <SelectValue placeholder="Select Paid From or Supplier" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {paymentAccounts.length > 0 && (
                                                <SelectGroup>
                                                    <SelectLabel>Cash &amp; Bank Accounts</SelectLabel>
                                                    {paymentAccounts.map(a => (
                                                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            )}
                                            {suppliers.length > 0 && (
                                                <SelectGroup>
                                                    <SelectLabel>Suppliers (Accounts Payable)</SelectLabel>
                                                    {suppliers.map(s => (
                                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                    ))}
                                                </SelectGroup>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label className="text-xs block mb-1">Ref Number</Label>
                                    <Input
                                        id="qp-bill-ref"
                                        placeholder="e.g. Cash Memo #42"
                                        className="h-8 text-xs"
                                        value={quickPartBillRef}
                                        onChange={e => setQuickPartBillRef(e.target.value)}
                                        onFocus={e => e.target.select()}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                focusField('qp-save-button');
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setQuickAddPartOpen(false)}
                            disabled={quickPartSaving}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            className="bg-primary text-primary-foreground"
                            onClick={handleQuickAddSparePartSave}
                            disabled={quickPartSaving || !quickPartName.trim()}
                        >
                            {quickPartSaving ? 'Saving...' : 'Save & Add Part'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 4. Status Update Modal */}
            <Dialog open={statusModalOpen} onOpenChange={setStatusModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold">
                            Update Order Status: {currentOrder?.order_no}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2 text-xs">
                        <div>
                            <Label className="text-xs">Next Status</Label>
                            <Select value={newStatusValue} onValueChange={setNewStatusValue}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="received">Received</SelectItem>
                                    <SelectItem value="in_progress">In Progress (Repair Started)</SelectItem>
                                    <SelectItem value="waiting_parts">Waiting Parts (On Hold)</SelectItem>
                                    <SelectItem value="ready">Ready (Repaired &amp; Tested)</SelectItem>
                                    <SelectItem value="cancelled">Cancelled (Restore Stock)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label className="text-xs">Notes / Reason (Optional)</Label>
                            <Textarea
                                rows={3}
                                placeholder="e.g. Display installed and passed touch test..."
                                className="text-xs"
                                value={statusNotes}
                                onChange={e => setStatusNotes(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setStatusModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={handleStatusUpdate}>
                            Update Status
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 5. Finalize & Invoice Modal */}
            <Dialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2">
                            <IconReceipt size={20} className="text-emerald-600" />
                            Deliver Device &amp; Generate Invoice
                        </DialogTitle>
                    </DialogHeader>

                    {currentOrder && (
                        <div className="space-y-4 py-2 text-xs">
                            <div className="p-3 rounded-lg bg-muted/40 space-y-1.5 font-mono">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Order #:</span>
                                    <span className="font-bold">{currentOrder.order_no}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Device:</span>
                                    <span>{currentOrder.device_brand} {currentOrder.device_model}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Gross Subtotal:</span>
                                    <span>{money((currentOrder.total_parts_billed || 0) + (currentOrder.total_labour_cost || 0))}</span>
                                </div>
                                <div className="flex justify-between items-center text-amber-600 dark:text-amber-400 font-sans py-0.5">
                                    <span className="font-medium">Discount Given:</span>
                                    <div className="flex items-center gap-1 font-mono">
                                        <span className="text-xs">- ₹</span>
                                        <Input
                                            type="number"
                                            min={0}
                                            className="h-7 w-24 text-xs font-mono text-right p-1"
                                            value={finalizeDiscountAmount || ''}
                                            placeholder="0.00"
                                            onChange={e => {
                                                const disc = Math.max(0, Number(e.target.value) || 0);
                                                setFinalizeDiscountAmount(disc);
                                                const gross = (currentOrder.total_parts_billed || 0) + (currentOrder.total_labour_cost || 0);
                                                const net = Math.max(0, gross - disc);
                                                const bal = Math.max(0, net - (currentOrder.advance_amount || 0));
                                                setFinalizeAmount(bal);
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-between border-t pt-1 font-medium">
                                    <span className="text-muted-foreground">Net Invoice Total:</span>
                                    <span className="text-foreground font-bold">
                                        {money(Math.max(0, ((currentOrder.total_parts_billed || 0) + (currentOrder.total_labour_cost || 0)) - finalizeDiscountAmount))}
                                    </span>
                                </div>
                                <div className="flex justify-between text-blue-600">
                                    <span>Advance Paid:</span>
                                    <span>- {money(currentOrder.advance_amount)}</span>
                                </div>
                                <div className="flex justify-between border-t pt-1 font-bold text-sm text-foreground">
                                    <span>Balance to Collect:</span>
                                    <span className="text-emerald-600">
                                        {money(Math.max(0, Math.max(0, ((currentOrder.total_parts_billed || 0) + (currentOrder.total_labour_cost || 0)) - finalizeDiscountAmount) - (currentOrder.advance_amount || 0)))}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-3 border-t pt-3">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="collectBal"
                                        checked={collectPayment}
                                        onChange={e => setCollectPayment(e.target.checked)}
                                        className="rounded border-gray-300"
                                    />
                                    <Label htmlFor="collectBal" className="cursor-pointer font-medium text-xs">
                                        Collect remaining balance now
                                    </Label>
                                </div>

                                {collectPayment && (
                                    <div className="grid grid-cols-2 gap-3 pt-1">
                                        <div>
                                            <Label className="text-xs">Payment Account</Label>
                                            <Select value={finalizeAccount} onValueChange={setFinalizeAccount}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="Select Account" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {paymentAccounts.map(a => (
                                                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-xs">Amount Paid (₹)</Label>
                                            <Input
                                                type="number"
                                                className="h-8 text-xs font-mono"
                                                value={finalizeAmount}
                                                onChange={e => setFinalizeAmount(Number(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setFinalizeDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleFinalizeOrder}>
                            Confirm &amp; Generate Invoice
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
