import React, { useState, useEffect, useMemo } from 'react';
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
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
    IconUser,
    IconCash,
} from '@tabler/icons-react';
import { useMoney } from '@/hooks/useMoney';
import { Combobox } from '@/components/ui/combobox';
import CustomerDialog from '@/components/dialogs/CustomerDialog';
import type { Product as TauriProduct } from '@/lib/tauri';
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
    const [stockMap, setStockMap] = useState<Record<string, number>>({});
    const [comboboxDisplaySettings, setComboboxDisplaySettings] = useState<ProductComboboxDisplaySettings>(DEFAULT_COMBOBOX_DISPLAY_SETTINGS);
    const [columnWidths, setColumnWidths] = useState<ProductComboboxColumnWidths>(DEFAULT_COMBOBOX_COLUMN_WIDTHS);
    const [servicesList, setServicesList] = useState<ServiceMasterOption[]>([]);
    const [paymentAccounts, setPaymentAccounts] = useState<AccountOption[]>([]);

    // Modals
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
    const [selectedDetail, setSelectedDetail] = useState<ServiceOrderDetail | null>(null);
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [statusModalOrder, setStatusModalOrder] = useState<ServiceOrder | null>(null);
    const [newStatusValue, setNewStatusValue] = useState('in_progress');
    const [statusNotes, setStatusNotes] = useState('');
    const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
    const [finalizeOrder, setFinalizeOrder] = useState<ServiceOrder | null>(null);
    const [collectPayment, setCollectPayment] = useState(true);
    const [finalizeAccount, setFinalizeAccount] = useState('');
    const [finalizeAmount, setFinalizeAmount] = useState<number>(0);
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');

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

    // Add Part Dialog within Drawer
    const [addPartOpen, setAddPartOpen] = useState(false);
    const [selectedPartProduct, setSelectedPartProduct] = useState('');
    const [partQty, setPartQty] = useState(1);
    const [partSellingRate, setPartSellingRate] = useState(0);

    // Add Labour Dialog within Drawer
    const [addLabourOpen, setAddLabourOpen] = useState(false);
    const [selectedLabourSvc, setSelectedLabourSvc] = useState('');
    const [labourDesc, setLabourDesc] = useState('');
    const [labourRate, setLabourRate] = useState(0);

    // Create Order Form State
    const [formData, setFormData] = useState({
        customerId: '',
        orderDate: new Date().toISOString().split('T')[0],
        expectedDate: '',
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
        collectAdvance: false,
        advanceAmount: 0,
        cashBankAccount: '',
    });

    // Form line items
    const [formParts, setFormParts] = useState<{
        productId: string;
        description: string;
        quantity: number;
        costRate: number;
        sellingRate: number;
    }[]>([]);

    const [formLabour, setFormLabour] = useState<{
        serviceId?: string;
        description: string;
        quantity: number;
        rate: number;
        amount: number;
    }[]>([]);

    // Load main orders list
    const loadOrders = async () => {
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
    };

    // Load master dependencies
    const loadMasters = async () => {
        try {
            // Customers: unify Chart of Accounts (receivables) with Customers table to attach phone & eliminate duplicates
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

            // 1. Chart of Accounts receivables (primary accounting ledgers)
            (custAccounts || []).forEach((acc: any) => {
                const normName = (acc.account_name || acc.name || '').trim().toLowerCase();
                if (!normName || seenNames.has(normName)) return;
                seenNames.add(normName);

                const phone = (acc.party_id && phoneByCustId.get(acc.party_id))
                    || phoneByName.get(normName)
                    || acc.phone
                    || '';

                list.push({
                    id: acc.id,
                    name: acc.account_name || acc.name,
                    phone,
                });
            });

            // 2. Legacy customers table fallback (if any customer does not have a COA ledger yet)
            (legacyCusts || []).forEach((c: any) => {
                const normName = (c.name || '').trim().toLowerCase();
                if (!normName || seenNames.has(normName)) return;
                seenNames.add(normName);

                list.push({
                    id: c.id,
                    name: c.name,
                    phone: c.phone || '',
                });
            });

            list.sort((a, b) => a.name.localeCompare(b.name));
            setCustomers(list);

            // Employees / Technicians
            const emps = await invoke<any[]>('get_employees').catch(() => []);
            setEmployees((emps || []).map(e => ({ id: e.id, name: e.name })));

            // App settings for product combobox
            invoke<string | null>('get_app_setting', { key: 'product_combobox_display_settings' })
                .then(v => { if (v) { try { setComboboxDisplaySettings(JSON.parse(v)); } catch {} } })
                .catch(console.error);

            invoke<string | null>('get_app_setting', { key: 'product_combobox_column_widths' })
                .then(v => { if (v) { try { setColumnWidths(JSON.parse(v)); } catch {} } })
                .catch(console.error);

            // Products, Groups, Brands
            const [prods, grps, brnds] = await Promise.all([
                invoke<TauriProduct[]>('get_products').catch(() => []),
                invoke<any[]>('get_product_groups').catch(() => []),
                invoke<any[]>('get_product_brands').catch(() => []),
            ]);
            setProducts(prods || []);
            setGroups(grps || []);
            setBrands(brnds || []);

            // Services
            const svcs = await invoke<any[]>('get_services').catch(() => []);
            setServicesList((svcs || []).map(s => ({ id: s.id, name: s.name, sales_rate: s.sales_rate || 0 })));

            // Payment Cash/Bank Accounts
            const cb = await invoke<any[]>('get_cash_bank_accounts').catch(() => []);
            const mappedCb: AccountOption[] = (cb || []).map((a: any) => ({
                id: a.id,
                name: a.name || a.account_name || 'Cash',
            }));
            setPaymentAccounts(mappedCb);
            if (mappedCb.length > 0) {
                setFormData(f => f.cashBankAccount ? f : ({ ...f, cashBankAccount: mappedCb[0].id }));
                setFinalizeAccount(prev => prev || mappedCb[0].id);
            }
        } catch (err) {
            console.error('Error loading masters', err);
        }
    };

    useEffect(() => {
        loadMasters();
    }, []);

    // Tab filtering is instant client-side across loaded orders

    // Search with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            loadOrders();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

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

    // Open detail drawer
    const openOrderDetail = async (id: string) => {
        try {
            const detail = await invoke<ServiceOrderDetail>('get_service_order', { id });
            setSelectedDetail(detail);
            setDetailDrawerOpen(true);
        } catch (e: any) {
            toast.error(e?.toString() || 'Failed to fetch order details');
        }
    };

    // Refresh current detail
    const refreshCurrentDetail = async () => {
        if (!selectedDetail) return;
        try {
            const updated = await invoke<ServiceOrderDetail>('get_service_order', { id: selectedDetail.order.id });
            setSelectedDetail(updated);
            loadOrders();
        } catch (e) {
            console.error(e);
        }
    };

    // WhatsApp Notification Trigger
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

    // Handle Create Order Submit
    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.customerId) {
            toast.error('Please select a customer');
            return;
        }
        if (!formData.complaint.trim()) {
            toast.error('Please describe the complaint/fault');
            return;
        }

        try {
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
                advance_amount: formData.collectAdvance ? Number(formData.advanceAmount) || 0 : 0,
                cash_bank_account_id: formData.collectAdvance ? formData.cashBankAccount : null,
                reference: null,
                narration: null,
                parts: formParts.map(p => ({
                    product_id: p.productId,
                    description: p.description || null,
                    quantity: p.quantity,
                    cost_rate: p.costRate,
                    selling_rate: p.sellingRate,
                    selling_amount: p.quantity * p.sellingRate,
                    unit_id: null,
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

            const orderId = await invoke<string>('create_service_order', { data: payload });
            toast.success('Service Order created successfully');
            setCreateDialogOpen(false);

            // Reset form
            setFormData({
                customerId: '',
                orderDate: new Date().toISOString().split('T')[0],
                expectedDate: '',
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
                collectAdvance: false,
                advanceAmount: 0,
                cashBankAccount: '',
            });
            setFormParts([]);
            setFormLabour([]);

            loadOrders();
            openOrderDetail(orderId);
        } catch (err: any) {
            toast.error(err?.toString() || 'Failed to create service order');
        }
    };

    // Add Part into existing order
    const handleAddPartToOrder = async () => {
        if (!selectedDetail || !selectedPartProduct) return;
        const prod = products.find(p => p.id === selectedPartProduct);
        if (!prod) return;

        try {
            const currentParts = selectedDetail.parts.map(p => ({
                product_id: p.product_id,
                description: p.description || null,
                quantity: p.quantity,
                cost_rate: p.cost_rate,
                selling_rate: p.selling_rate,
                selling_amount: p.selling_amount,
                unit_id: p.unit_id || null,
            }));

            currentParts.push({
                product_id: prod.id,
                description: prod.name,
                quantity: partQty,
                cost_rate: prod.purchase_rate,
                selling_rate: partSellingRate,
                selling_amount: partQty * partSellingRate,
                unit_id: prod.unit_id || null,
            });

            const currentLabour = selectedDetail.labour.map(l => ({
                service_id: l.service_id || null,
                description: l.description,
                quantity: l.quantity,
                rate: l.rate,
                amount: l.amount,
            }));

            const payload = {
                order_date: selectedDetail.order.order_date,
                expected_date: selectedDetail.order.expected_date,
                customer_id: selectedDetail.order.customer_id,
                device_brand: selectedDetail.order.device_brand,
                device_model: selectedDetail.order.device_model,
                device_imei: selectedDetail.order.device_imei,
                device_color: selectedDetail.order.device_color,
                device_condition: selectedDetail.order.device_condition,
                security_pin_pattern: selectedDetail.order.security_pin_pattern,
                complaint: selectedDetail.order.complaint,
                technician_notes: selectedDetail.order.technician_notes,
                assigned_to: selectedDetail.order.assigned_to,
                commission_type: selectedDetail.order.commission_type,
                commission_rate: selectedDetail.order.commission_rate,
                estimated_cost: selectedDetail.order.estimated_cost,
                advance_amount: selectedDetail.order.advance_amount,
                cash_bank_account_id: null,
                reference: selectedDetail.order.reference,
                narration: selectedDetail.order.narration,
                parts: currentParts,
                labour: currentLabour,
                user_id: null,
            };

            await invoke('update_service_order', { id: selectedDetail.order.id, data: payload });
            toast.success(`Added ${prod.name} and deducted from inventory`);
            setAddPartOpen(false);
            setSelectedPartProduct('');
            setPartQty(1);
            setPartSellingRate(0);
            refreshCurrentDetail();
        } catch (e: any) {
            toast.error(e?.toString() || 'Failed to add part');
        }
    };

    // Add Labour charge into existing order
    const handleAddLabourToOrder = async () => {
        if (!selectedDetail || (!labourDesc.trim() && !selectedLabourSvc)) return;
        const desc = labourDesc.trim() || servicesList.find(s => s.id === selectedLabourSvc)?.name || 'Labour Charge';

        try {
            const currentParts = selectedDetail.parts.map(p => ({
                product_id: p.product_id,
                description: p.description || null,
                quantity: p.quantity,
                cost_rate: p.cost_rate,
                selling_rate: p.selling_rate,
                selling_amount: p.selling_amount,
                unit_id: p.unit_id || null,
            }));

            const currentLabour = selectedDetail.labour.map(l => ({
                service_id: l.service_id || null,
                description: l.description,
                quantity: l.quantity,
                rate: l.rate,
                amount: l.amount,
            }));

            currentLabour.push({
                service_id: selectedLabourSvc || null,
                description: desc,
                quantity: 1,
                rate: labourRate,
                amount: labourRate,
            });

            const payload = {
                order_date: selectedDetail.order.order_date,
                expected_date: selectedDetail.order.expected_date,
                customer_id: selectedDetail.order.customer_id,
                device_brand: selectedDetail.order.device_brand,
                device_model: selectedDetail.order.device_model,
                device_imei: selectedDetail.order.device_imei,
                device_color: selectedDetail.order.device_color,
                device_condition: selectedDetail.order.device_condition,
                security_pin_pattern: selectedDetail.order.security_pin_pattern,
                complaint: selectedDetail.order.complaint,
                technician_notes: selectedDetail.order.technician_notes,
                assigned_to: selectedDetail.order.assigned_to,
                commission_type: selectedDetail.order.commission_type,
                commission_rate: selectedDetail.order.commission_rate,
                estimated_cost: selectedDetail.order.estimated_cost,
                advance_amount: selectedDetail.order.advance_amount,
                cash_bank_account_id: null,
                reference: selectedDetail.order.reference,
                narration: selectedDetail.order.narration,
                parts: currentParts,
                labour: currentLabour,
                user_id: null,
            };

            await invoke('update_service_order', { id: selectedDetail.order.id, data: payload });
            toast.success(`Added ${desc}`);
            setAddLabourOpen(false);
            setLabourDesc('');
            setSelectedLabourSvc('');
            setLabourRate(0);
            refreshCurrentDetail();
        } catch (e: any) {
            toast.error(e?.toString() || 'Failed to add labour');
        }
    };

    // Handle Status Update Submit
    const handleStatusUpdate = async () => {
        if (!statusModalOrder) return;
        try {
            await invoke('update_service_order_status', {
                payload: {
                    order_id: statusModalOrder.id,
                    new_status: newStatusValue,
                    notes: statusNotes || null,
                    user_id: null,
                },
            });
            toast.success(`Status updated to ${newStatusValue.replace('_', ' ')}`);
            setStatusModalOpen(false);
            setStatusNotes('');
            loadOrders();
            if (selectedDetail && selectedDetail.order.id === statusModalOrder.id) {
                refreshCurrentDetail();
            }
        } catch (e: any) {
            toast.error(e?.toString() || 'Failed to update status');
        }
    };

    // Handle Finalize & Generate Invoice
    const handleFinalizeOrder = async () => {
        if (!finalizeOrder) return;
        try {
            await invoke<string>('finalize_service_order', {
                payload: {
                    order_id: finalizeOrder.id,
                    voucher_date: new Date().toISOString().split('T')[0],
                    narration: `Service Invoice for Order #${finalizeOrder.order_no}`,
                    user_id: null,
                    collect_payment: collectPayment,
                    payment_amount: finalizeAmount,
                    payment_account_id: finalizeAccount || null,
                },
            });

            toast.success('Service Invoice generated and order delivered!');
            setFinalizeDialogOpen(false);
            loadOrders();
            if (selectedDetail && selectedDetail.order.id === finalizeOrder.id) {
                refreshCurrentDetail();
            }
        } catch (e: any) {
            toast.error(e?.toString() || 'Failed to finalize order');
        }
    };

    // Handle Delete Order
    const handleDeleteOrder = async (id: string, orderNo: string) => {
        if (!confirm(`Are you sure you want to delete Service Order ${orderNo}? Consumed stock will be restored.`)) {
            return;
        }
        try {
            await invoke('delete_service_order', { id });
            toast.success(`Order ${orderNo} deleted`);
            loadOrders();
            if (selectedDetail?.order.id === id) {
                setDetailDrawerOpen(false);
            }
        } catch (e: any) {
            toast.error(e?.toString() || 'Failed to delete order');
        }
    };

    // Calculate metrics
    const metrics = useMemo(() => {
        const totalCount = orders.length;
        const inRepair = orders.filter(o => o.status === 'in_progress' || o.status === 'waiting_parts').length;
        const readyCount = orders.filter(o => o.status === 'ready').length;
        const deliveredRevenue = orders
            .filter(o => o.status === 'delivered')
            .reduce((sum, o) => sum + o.total_amount, 0);

        return { totalCount, inRepair, readyCount, deliveredRevenue };
    }, [orders]);

    const filteredOrders = useMemo(() => {
        if (statusFilter === 'all') return orders;
        return orders.filter(o => o.status === statusFilter);
    }, [orders, statusFilter]);

    return (
        <div className="flex flex-col h-full overflow-hidden bg-background">
            {/* Top Bar Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-card shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <IconDeviceMobile size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">Service Orders</h1>
                        <p className="text-xs text-muted-foreground">Mobile Phone Repair & Service Job Cards</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative w-64">
                        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search Order, IMEI, Phone, Model..."
                            className="pl-9 h-9 text-xs"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button
                        size="sm"
                        onClick={() => setCreateDialogOpen(true)}
                        className="gap-1.5"
                    >
                        <IconPlus size={16} /> New Service Order
                    </Button>
                </div>
            </div>

            {/* Metric KPI Cards */}
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

            {/* Filter Tabs */}
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
                    Showing <span className="font-semibold text-foreground">{filteredOrders.length}</span> of {orders.length} orders
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
                                    <th className="p-3">Customer & Phone</th>
                                    <th className="p-3">Device & IMEI</th>
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
                                                <td className="p-3 font-mono font-semibold text-primary cursor-pointer hover:underline" onClick={() => openOrderDetail(o.id)}>
                                                    {o.order_no}
                                                </td>
                                                <td className="p-3 whitespace-nowrap text-muted-foreground">
                                                    {o.order_date}
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-medium text-foreground">{o.customer_name}</div>
                                                    {o.customer_phone && (
                                                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                                            {o.customer_phone}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    <div className="font-medium">
                                                        {o.device_brand} {o.device_model}
                                                        {o.device_color && <span className="text-muted-foreground text-[10px] ml-1">({o.device_color})</span>}
                                                    </div>
                                                    {o.device_imei && (
                                                        <div className="text-[10px] font-mono text-muted-foreground">
                                                            IMEI: {o.device_imei}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="p-3 max-w-[200px] truncate" title={o.complaint}>
                                                    {o.complaint}
                                                </td>
                                                <td className="p-3 whitespace-nowrap">
                                                    {o.technician_name ? (
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-muted px-2 py-0.5 rounded">
                                                            <IconUser size={12} /> {o.technician_name}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground text-[11px]">Unassigned</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right font-mono">{money(o.total_parts_billed)}</td>
                                                <td className="p-3 text-right font-mono">{money(o.total_labour_cost)}</td>
                                                <td className="p-3 text-right font-mono font-semibold">{money(o.total_amount)}</td>
                                                <td className="p-3 text-center">
                                                    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${cfg.badge}`}>
                                                        {cfg.label}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">
                                                    {o.balance_due <= 0 && o.total_amount > 0 ? (
                                                        <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded font-medium">
                                                            Paid
                                                        </span>
                                                    ) : o.advance_amount > 0 ? (
                                                        <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.5 rounded font-medium">
                                                            Adv {money(o.advance_amount)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded font-medium">
                                                            Due {money(o.balance_due)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center justify-center gap-1">
                                                        {/* View Details */}
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                                            title="View Job Card"
                                                            onClick={() => openOrderDetail(o.id)}
                                                        >
                                                            <IconEye size={14} />
                                                        </Button>

                                                        {/* WhatsApp Alert */}
                                                        {o.customer_phone && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                                                title="WhatsApp Alert"
                                                                onClick={() => sendWhatsAppAlert(o)}
                                                            >
                                                                <IconBrandWhatsapp size={14} />
                                                            </Button>
                                                        )}

                                                        {/* Status Update Modal */}
                                                        {o.status !== 'delivered' && o.status !== 'cancelled' && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-7 w-7 text-amber-600 hover:text-amber-700"
                                                                title="Change Status"
                                                                onClick={() => {
                                                                    setStatusModalOrder(o);
                                                                    setNewStatusValue(o.status === 'received' ? 'in_progress' : o.status === 'in_progress' ? 'ready' : 'in_progress');
                                                                    setStatusModalOpen(true);
                                                                }}
                                                            >
                                                                <IconTools size={14} />
                                                            </Button>
                                                        )}

                                                        {/* Finalize & Invoice */}
                                                        {o.status === 'ready' && !o.final_invoice_id && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                                                                title="Deliver & Generate Invoice"
                                                                onClick={() => {
                                                                    setFinalizeOrder(o);
                                                                    setFinalizeAmount(o.balance_due);
                                                                    setFinalizeAccount(paymentAccounts[0]?.id || '');
                                                                    setFinalizeDialogOpen(true);
                                                                }}
                                                            >
                                                                <IconReceipt size={14} />
                                                            </Button>
                                                        )}

                                                        {/* Delete */}
                                                        {o.status !== 'delivered' && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                                                title="Delete Order"
                                                                onClick={() => handleDeleteOrder(o.id, o.order_no)}
                                                            >
                                                                <IconTrash size={14} />
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

            {/* CREATE SERVICE ORDER DIALOG */}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="sm:max-w-5xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold">
                            <IconDeviceMobile size={20} className="text-primary" /> New Service Order (Job Card)
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleCreateOrder} className="space-y-4 text-xs">
                        {/* Section 1: Customer & Date */}
                        <div className="p-3 bg-muted/30 rounded-lg border space-y-3">
                            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider">1. Customer & Dates</h4>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <Label className="text-xs block mb-1">Customer <span className="text-destructive">*</span></Label>
                                    <Combobox
                                        options={customers.map(c => ({
                                            value: c.id,
                                            label: c.phone ? `${c.name} (${c.phone})` : c.name,
                                            searchString: `${c.name} ${c.phone || ""}`,
                                        }))}
                                        value={formData.customerId}
                                        onChange={v => setFormData(f => ({ ...f, customerId: String(v) }))}
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
                                    <Label className="text-xs">Intake Date</Label>
                                    <Input
                                        type="date"
                                        className="h-8 text-xs"
                                        value={formData.orderDate}
                                        onChange={e => setFormData(f => ({ ...f, orderDate: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Expected Delivery Date</Label>
                                    <Input
                                        type="date"
                                        className="h-8 text-xs"
                                        value={formData.expectedDate}
                                        onChange={e => setFormData(f => ({ ...f, expectedDate: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Mobile Device Details */}
                        <div className="p-3 bg-muted/30 rounded-lg border space-y-3">
                            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider">2. Mobile Device Details</h4>
                            <div className="grid grid-cols-4 gap-3">
                                <div>
                                    <Label className="text-xs">Device Brand</Label>
                                    <Input
                                        placeholder="e.g. Apple, Samsung"
                                        className="h-8 text-xs"
                                        value={formData.deviceBrand}
                                        onChange={e => setFormData(f => ({ ...f, deviceBrand: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Device Model</Label>
                                    <Input
                                        placeholder="e.g. iPhone 13, A53"
                                        className="h-8 text-xs"
                                        value={formData.deviceModel}
                                        onChange={e => setFormData(f => ({ ...f, deviceModel: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">IMEI / Serial No.</Label>
                                    <Input
                                        placeholder="15-digit IMEI"
                                        className="h-8 text-xs font-mono"
                                        value={formData.deviceImei}
                                        onChange={e => setFormData(f => ({ ...f, deviceImei: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Device Color</Label>
                                    <Input
                                        placeholder="e.g. Midnight Black"
                                        className="h-8 text-xs"
                                        value={formData.deviceColor}
                                        onChange={e => setFormData(f => ({ ...f, deviceColor: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Condition on Arrival</Label>
                                    <Input
                                        placeholder="e.g. Broken screen, minor scratches on back"
                                        className="h-8 text-xs"
                                        value={formData.deviceCondition}
                                        onChange={e => setFormData(f => ({ ...f, deviceCondition: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Screen Lock PIN / Pattern</Label>
                                    <Input
                                        placeholder="Device password/PIN for testing"
                                        className="h-8 text-xs font-mono"
                                        value={formData.securityPinPattern}
                                        onChange={e => setFormData(f => ({ ...f, securityPinPattern: e.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Fault & Technician Assignment */}
                        <div className="p-3 bg-muted/30 rounded-lg border space-y-3">
                            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider">3. Complaint & Technician</h4>
                            <div>
                                <Label className="text-xs">Customer Complaint / Fault Description <span className="text-destructive">*</span></Label>
                                <Textarea
                                    rows={2}
                                    placeholder="e.g. Screen flickering, battery draining fast, no display after water splash..."
                                    className="text-xs"
                                    value={formData.complaint}
                                    onChange={e => setFormData(f => ({ ...f, complaint: e.target.value }))}
                                />
                            </div>

                            <div className="grid grid-cols-4 gap-3">
                                <div>
                                    <Label className="text-xs">Assign Technician</Label>
                                    <Select
                                        value={formData.assignedTo}
                                        onValueChange={v => setFormData(f => ({ ...f, assignedTo: v }))}
                                    >
                                        <SelectTrigger className="h-8 text-xs">
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
                                    <Label className="text-xs">Commission Model</Label>
                                    <Select
                                        value={formData.commissionType}
                                        onValueChange={v => setFormData(f => ({ ...f, commissionType: v }))}
                                    >
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="percentage">% of Labour</SelectItem>
                                            <SelectItem value="fixed">Fixed ₹ Per Job</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs">{formData.commissionType === 'percentage' ? 'Commission %' : 'Commission ₹'}</Label>
                                    <Input
                                        type="number"
                                        className="h-8 text-xs"
                                        value={formData.commissionRate}
                                        onChange={e => setFormData(f => ({ ...f, commissionRate: Number(e.target.value) }))}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Estimated Cost (₹)</Label>
                                    <Input
                                        type="number"
                                        className="h-8 text-xs"
                                        value={formData.estimatedCost}
                                        onChange={e => setFormData(f => ({ ...f, estimatedCost: Number(e.target.value) }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 4: Advance Collection (Optional) */}
                        <div className="p-3 bg-muted/30 rounded-lg border space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="collectAdv"
                                    checked={formData.collectAdvance}
                                    onChange={e => setFormData(f => ({ ...f, collectAdvance: e.target.checked }))}
                                    className="rounded border-gray-300"
                                />
                                <Label htmlFor="collectAdv" className="cursor-pointer font-medium text-xs">
                                    Collect advance payment now
                                </Label>
                            </div>

                            {formData.collectAdvance && (
                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <div>
                                        <Label className="text-xs">Advance Amount (₹)</Label>
                                        <Input
                                            type="number"
                                            className="h-8 text-xs"
                                            value={formData.advanceAmount}
                                            onChange={e => setFormData(f => ({ ...f, advanceAmount: Number(e.target.value) }))}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">Payment Ledger Account</Label>
                                        <Select
                                            value={formData.cashBankAccount}
                                            onValueChange={v => setFormData(f => ({ ...f, cashBankAccount: v }))}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
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

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" size="sm">
                                Create Service Order
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ORDER DETAIL DRAWER / DIALOG */}
            {selectedDetail && (
                <Dialog open={detailDrawerOpen} onOpenChange={setDetailDrawerOpen}>
                    <DialogContent className="sm:max-w-5xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                        <DialogHeader className="border-b pb-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded bg-primary/10 text-primary">
                                        <IconDeviceMobile size={22} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <DialogTitle className="text-lg font-mono font-bold">
                                                {selectedDetail.order.order_no}
                                            </DialogTitle>
                                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_CONFIG[selectedDetail.order.status]?.badge}`}>
                                                {STATUS_CONFIG[selectedDetail.order.status]?.label || selectedDetail.order.status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Customer: <span className="font-semibold text-foreground">{selectedDetail.order.customer_name}</span> ({selectedDetail.order.customer_phone || 'No phone'})
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* WhatsApp Direct */}
                                    {selectedDetail.order.customer_phone && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                            onClick={() => sendWhatsAppAlert(selectedDetail.order)}
                                        >
                                            <IconBrandWhatsapp size={16} /> Send WhatsApp
                                        </Button>
                                    )}

                                    {/* Change Status */}
                                    {selectedDetail.order.status !== 'delivered' && selectedDetail.order.status !== 'cancelled' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1.5"
                                            onClick={() => {
                                                setStatusModalOrder(selectedDetail.order);
                                                setNewStatusValue(selectedDetail.order.status === 'received' ? 'in_progress' : selectedDetail.order.status === 'in_progress' ? 'ready' : 'in_progress');
                                                setStatusModalOpen(true);
                                            }}
                                        >
                                            <IconTools size={14} /> Update Status
                                        </Button>
                                    )}

                                    {/* Finalize Invoice */}
                                    {selectedDetail.order.status === 'ready' && !selectedDetail.order.final_invoice_id && (
                                        <Button
                                            size="sm"
                                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                            onClick={() => {
                                                setFinalizeOrder(selectedDetail.order);
                                                setFinalizeAmount(selectedDetail.order.balance_due);
                                                setFinalizeAccount(paymentAccounts[0]?.id || '');
                                                setFinalizeDialogOpen(true);
                                            }}
                                        >
                                            <IconReceipt size={14} /> Deliver & Invoice
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </DialogHeader>

                        {/* Top Device Specs Bar */}
                        <div className="grid grid-cols-4 gap-3 p-3 bg-muted/40 rounded-lg text-xs">
                            <div>
                                <span className="text-muted-foreground text-[10px] uppercase font-bold block">Device Model</span>
                                <span className="font-semibold">{selectedDetail.order.device_brand} {selectedDetail.order.device_model}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground text-[10px] uppercase font-bold block">IMEI / Serial</span>
                                <span className="font-mono">{selectedDetail.order.device_imei || 'N/A'}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground text-[10px] uppercase font-bold block">Lock PIN / Pattern</span>
                                <span className="font-mono font-semibold text-primary">{selectedDetail.order.security_pin_pattern || 'None'}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground text-[10px] uppercase font-bold block">Assigned Tech</span>
                                <span className="font-medium">{selectedDetail.order.technician_name || 'Unassigned'}</span>
                            </div>
                        </div>

                        {/* Complaint & Condition */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="p-3 border rounded-lg bg-card">
                                <span className="font-bold text-muted-foreground text-[11px] block mb-1">Customer Complaint</span>
                                <p className="text-foreground">{selectedDetail.order.complaint}</p>
                            </div>
                            <div className="p-3 border rounded-lg bg-card">
                                <span className="font-bold text-muted-foreground text-[11px] block mb-1">Condition on Arrival</span>
                                <p className="text-muted-foreground">{selectedDetail.order.device_condition || 'Not specified'}</p>
                            </div>
                        </div>

                        {/* Tabs for Parts, Labour, Status History */}
                        <Tabs defaultValue="parts" className="w-full">
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="parts">Parts Consumed ({selectedDetail.parts.length})</TabsTrigger>
                                <TabsTrigger value="labour">Labour Charges ({selectedDetail.labour.length})</TabsTrigger>
                                <TabsTrigger value="history">Status History ({selectedDetail.status_log.length})</TabsTrigger>
                            </TabsList>

                            {/* PARTS TAB */}
                            <TabsContent value="parts" className="space-y-3 pt-2 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold text-muted-foreground">Inventory Spare Parts</span>
                                    {selectedDetail.order.status !== 'delivered' && selectedDetail.order.status !== 'cancelled' && (
                                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setSelectedPartProduct(''); setPartSellingRate(0); setPartQty(1); setAddPartOpen(true); }}>
                                            <IconPlus size={12} /> Add Spare Part
                                        </Button>
                                    )}
                                </div>

                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-muted/50 border-b">
                                            <tr>
                                                <th className="p-2.5">Spare Part</th>
                                                <th className="p-2.5 text-center">Qty</th>
                                                <th className="p-2.5 text-right">Cost Price (COGS)</th>
                                                <th className="p-2.5 text-right">Selling Rate</th>
                                                <th className="p-2.5 text-right">Total Billed</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {selectedDetail.parts.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                                        No spare parts added to this order yet. Click "Add Spare Part" to consume from stock.
                                                    </td>
                                                </tr>
                                            ) : (
                                                selectedDetail.parts.map(p => (
                                                    <tr key={p.id}>
                                                        <td className="p-2.5">
                                                            <div className="font-medium">{p.product_name}</div>
                                                            <div className="text-[10px] text-muted-foreground font-mono">{p.product_code}</div>
                                                        </td>
                                                        <td className="p-2.5 text-center font-mono">{p.quantity}</td>
                                                        <td className="p-2.5 text-right font-mono text-muted-foreground">{money(p.cost_rate)}</td>
                                                        <td className="p-2.5 text-right font-mono">{money(p.selling_rate)}</td>
                                                        <td className="p-2.5 text-right font-mono font-semibold">{money(p.selling_amount)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {selectedDetail.parts.length > 0 && (
                                            <tfoot className="border-t bg-muted/20 font-semibold">
                                                <tr>
                                                    <td colSpan={4} className="p-2 text-right">Total Parts Billed:</td>
                                                    <td className="p-2 text-right font-mono text-primary">{money(selectedDetail.order.total_parts_billed)}</td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </TabsContent>

                            {/* LABOUR TAB */}
                            <TabsContent value="labour" className="space-y-3 pt-2 text-xs">
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold text-muted-foreground">Labour & Services Charges</span>
                                    {selectedDetail.order.status !== 'delivered' && selectedDetail.order.status !== 'cancelled' && (
                                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAddLabourOpen(true)}>
                                            <IconPlus size={12} /> Add Labour Charge
                                        </Button>
                                    )}
                                </div>

                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-muted/50 border-b">
                                            <tr>
                                                <th className="p-2.5">Labour / Service Description</th>
                                                <th className="p-2.5 text-center">Qty</th>
                                                <th className="p-2.5 text-right">Rate</th>
                                                <th className="p-2.5 text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {selectedDetail.labour.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                                        No labour charges added to this order yet.
                                                    </td>
                                                </tr>
                                            ) : (
                                                selectedDetail.labour.map(l => (
                                                    <tr key={l.id}>
                                                        <td className="p-2.5 font-medium">{l.description}</td>
                                                        <td className="p-2.5 text-center font-mono">{l.quantity}</td>
                                                        <td className="p-2.5 text-right font-mono">{money(l.rate)}</td>
                                                        <td className="p-2.5 text-right font-mono font-semibold">{money(l.amount)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {selectedDetail.labour.length > 0 && (
                                            <tfoot className="border-t bg-muted/20 font-semibold">
                                                <tr>
                                                    <td colSpan={3} className="p-2 text-right">Total Labour:</td>
                                                    <td className="p-2 text-right font-mono text-primary">{money(selectedDetail.order.total_labour_cost)}</td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </TabsContent>

                            {/* STATUS HISTORY TAB */}
                            <TabsContent value="history" className="space-y-2 pt-2 text-xs">
                                <div className="space-y-2">
                                    {selectedDetail.status_log.map(log => (
                                        <div key={log.id} className="flex items-start gap-3 p-2.5 rounded border bg-card text-xs">
                                            <div className="mt-0.5 p-1 rounded-full bg-primary/10 text-primary">
                                                <IconCheck size={12} />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-semibold uppercase tracking-wider text-[11px] text-foreground">
                                                        {log.new_status.replace('_', ' ')}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground">{log.changed_at}</span>
                                                </div>
                                                {log.notes && (
                                                    <p className="text-muted-foreground text-xs mt-0.5">{log.notes}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </TabsContent>
                        </Tabs>

                        {/* Totals Summary Footer */}
                        <div className="border-t pt-3 flex items-center justify-between text-xs">
                            <div className="text-muted-foreground">
                                {selectedDetail.order.technician_name && (
                                    <span>
                                        Technician Commission: <span className="font-semibold text-foreground font-mono">{money(selectedDetail.order.commission_amount)}</span>
                                        {' '}({selectedDetail.order.commission_type === 'percentage' ? `${selectedDetail.order.commission_rate}% of Labour` : 'Fixed ₹'})
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-4 text-sm font-semibold">
                                <div>Total: <span className="font-mono">{money(selectedDetail.order.total_amount)}</span></div>
                                <div>Advance: <span className="font-mono text-blue-600">{money(selectedDetail.order.advance_amount)}</span></div>
                                <div>Due: <span className="font-mono text-amber-600">{money(selectedDetail.order.balance_due)}</span></div>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            {/* ADD PART DIALOG */}
            <Dialog open={addPartOpen} onOpenChange={setAddPartOpen}>
                <DialogContent className="sm:max-w-xl max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold">Add Spare Part from Stock</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2 text-xs">
                        <div>
                            <Label className="text-xs block mb-1">Product / Spare Part <span className="text-destructive">*</span></Label>
                            <Combobox
                                headerColumns={cbHeaderCols}
                                popoverClassName={cbWidthClass}
                                options={productOptions}
                                value={selectedPartProduct}
                                onChange={id => {
                                    setSelectedPartProduct(String(id));
                                    const p = products.find(prod => prod.id === String(id));
                                    if (p) setPartSellingRate(p.sales_rate);
                                }}
                                placeholder="Search spare part by name, code, barcode..."
                                searchPlaceholder="Type name, code, barcode, part #..."
                                className="h-8 text-xs w-full"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs">Quantity</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    className="h-8 text-xs"
                                    value={partQty}
                                    onChange={e => setPartQty(Math.max(1, Number(e.target.value)))}
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Selling Rate (₹)</Label>
                                <Input
                                    type="number"
                                    className="h-8 text-xs font-mono"
                                    value={partSellingRate}
                                    onChange={e => setPartSellingRate(Number(e.target.value))}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setAddPartOpen(false)}>Cancel</Button>
                        <Button size="sm" onClick={handleAddPartToOrder} disabled={!selectedPartProduct}>Add Part</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ADD LABOUR DIALOG */}
            <Dialog open={addLabourOpen} onOpenChange={setAddLabourOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold">Add Labour / Service Charge</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-2 text-xs">
                        <div>
                            <Label className="text-xs">Preset Service (Optional)</Label>
                            <Select
                                value={selectedLabourSvc}
                                onValueChange={id => {
                                    setSelectedLabourSvc(id);
                                    const s = servicesList.find(svc => svc.id === id);
                                    if (s) {
                                        setLabourDesc(s.name);
                                        setLabourRate(s.sales_rate);
                                    }
                                }}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select preset or type custom..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {servicesList.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name} ({money(s.sales_rate)})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs">Description</Label>
                            <Input
                                placeholder="e.g. Display Replacement Labour"
                                className="h-8 text-xs"
                                value={labourDesc}
                                onChange={e => setLabourDesc(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label className="text-xs">Labour Rate (₹)</Label>
                            <Input
                                type="number"
                                className="h-8 text-xs font-mono"
                                value={labourRate}
                                onChange={e => setLabourRate(Number(e.target.value))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setAddLabourOpen(false)}>Cancel</Button>
                        <Button size="sm" onClick={handleAddLabourToOrder}>Add Labour</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* STATUS UPDATE MODAL */}
            <Dialog open={statusModalOpen} onOpenChange={setStatusModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold">
                            Update Order Status: {statusModalOrder?.order_no}
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
                                    <SelectItem value="ready">Ready (Repaired & Tested)</SelectItem>
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

            {/* FINALIZE & INVOICE MODAL */}
            <Dialog open={finalizeDialogOpen} onOpenChange={setFinalizeDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2">
                            <IconReceipt size={20} className="text-emerald-600" />
                            Deliver Device & Generate Invoice
                        </DialogTitle>
                    </DialogHeader>

                    {finalizeOrder && (
                        <div className="space-y-4 py-2 text-xs">
                            <div className="p-3 rounded-lg bg-muted/40 space-y-1.5 font-mono">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Order #:</span>
                                    <span className="font-bold">{finalizeOrder.order_no}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Device:</span>
                                    <span>{finalizeOrder.device_brand} {finalizeOrder.device_model}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Total Bill:</span>
                                    <span>{money(finalizeOrder.total_amount)}</span>
                                </div>
                                <div className="flex justify-between text-blue-600">
                                    <span>Advance Paid:</span>
                                    <span>- {money(finalizeOrder.advance_amount)}</span>
                                </div>
                                <div className="flex justify-between border-t pt-1 font-bold text-sm text-foreground">
                                    <span>Balance Due:</span>
                                    <span>{money(finalizeOrder.balance_due)}</span>
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
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleFinalizeOrder}>
                            Confirm & Generate Invoice
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Quick Add Customer Dialog */}
            <CustomerDialog
                open={showCreateCustomer}
                onOpenChange={setShowCreateCustomer}
                customerToEdit={null}
                onSave={handleCustomerCreated}
                initialName={newCustomerName}
            />
        </div>
    );
}
