import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package, Wallet, Users, AlertCircle } from 'lucide-react';
import MetricCard from '@/components/dashboard/MetricCard';
import RevenueChart from '@/components/dashboard/RevenueChart';
import CashFlowChart from '@/components/dashboard/CashFlowChart';
import TopProductsChart from '@/components/dashboard/TopProductsChart';
import StockAlerts from '@/components/dashboard/StockAlerts';
import RecentActivity from '@/components/dashboard/RecentActivity';
import ProductGroupsChart from '@/components/dashboard/ProductGroupsChart';

interface DashboardMetrics {
    total_revenue: number;
    total_expenses: number;
    net_profit: number;
    order_count: number;
    stock_value: number;
    cash_balance: number;
    receivables: number;
    payables: number;
    revenue_growth: number;
    profit_growth: number;
}

interface RevenueTrend {
    date: string;
    revenue: number;
    expenses: number;
}

interface CashFlow {
    date: string;
    inflows: number;
    outflows: number;
}

interface TopProduct {
    product_name: string;
    total_quantity: number;
    total_revenue: number;
}

interface StockAlert {
    product_id: number;
    product_name: string;
    current_stock: number;
    unit_symbol: string;
}

interface RecentActivityItem {
    voucher_id: number;
    voucher_no: string;
    voucher_type: string;
    voucher_date: string;
    party_name: string | null;
    amount: number;
}

interface ProductGroupData {
    group_name: string;
    product_count: number;
    total_stock_value: number;
}

type Period = 'today' | 'week' | 'month' | 'quarter' | 'year';

const periodDays: Record<Period, number> = {
    today: 0,
    week: 7,
    month: 30,
    quarter: 90,
    year: 365,
};

export default function DashboardPage() {
    const [period, setPeriod] = useState<Period>('month');
    const [loading, setLoading] = useState(true);

    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [revenueTrend, setRevenueTrend] = useState<RevenueTrend[]>([]);
    const [cashFlow, setCashFlow] = useState<CashFlow[]>([]);
    const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
    const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
    const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
    const [productGroups, setProductGroups] = useState<ProductGroupData[]>([]);

    const getDateRange = (selectedPeriod: Period) => {
        const today = new Date();
        const toDate = today.toISOString().split('T')[0];

        if (selectedPeriod === 'today') {
            return { fromDate: toDate, toDate };
        }

        const fromDate = new Date(today);
        fromDate.setDate(today.getDate() - periodDays[selectedPeriod]);
        return { fromDate: fromDate.toISOString().split('T')[0], toDate };
    };

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            const { fromDate, toDate } = getDateRange(period);

            // Load all data in parallel
            const [metricsData, trendData, flowData, productsData, alertsData, activityData, groupsData] = await Promise.all([
                invoke<DashboardMetrics>('get_dashboard_metrics', { fromDate, toDate }),
                invoke<RevenueTrend[]>('get_revenue_trend', { days: period === 'today' ? 7 : periodDays[period] }),
                invoke<CashFlow[]>('get_cash_flow_summary', { days: period === 'today' ? 7 : periodDays[period] }),
                invoke<TopProduct[]>('get_top_products', { limit: 5, fromDate, toDate }),
                invoke<StockAlert[]>('get_stock_alerts', { threshold: 10.0 }),
                invoke<RecentActivityItem[]>('get_recent_activity', { limit: 10 }),
                invoke<ProductGroupData[]>('get_product_groups_distribution'),
            ]);

            setMetrics(metricsData);
            setRevenueTrend(trendData);
            setCashFlow(flowData);
            setTopProducts(productsData);
            setStockAlerts(alertsData);
            setRecentActivity(activityData);
            setProductGroups(groupsData);
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            toast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDashboardData();
    }, [period]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground mt-1">Welcome to your business overview</p>
                </div>
                <Tabs value={period} onValueChange={(value) => setPeriod(value as Period)}>
                    <TabsList>
                        <TabsTrigger value="today">Today</TabsTrigger>
                        <TabsTrigger value="week">Week</TabsTrigger>
                        <TabsTrigger value="month">Month</TabsTrigger>
                        <TabsTrigger value="quarter">Quarter</TabsTrigger>
                        <TabsTrigger value="year">Year</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    title="Total Revenue"
                    value={formatCurrency(metrics?.total_revenue || 0)}
                    change={metrics?.revenue_growth}
                    icon={TrendingUp}
                />
                <MetricCard
                    title="Net Profit"
                    value={formatCurrency(metrics?.net_profit || 0)}
                    change={metrics?.profit_growth}
                    icon={DollarSign}
                />
                <MetricCard
                    title="Total Orders"
                    value={`${metrics?.order_count || 0}`}
                    icon={ShoppingCart}
                />
                <MetricCard
                    title="Stock Value"
                    value={formatCurrency(metrics?.stock_value || 0)}
                    icon={Package}
                />
            </div>

            {/* Second Row Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    title="Cash Balance"
                    subtitle="(Cash + Bank)"
                    value={formatCurrency(metrics?.cash_balance || 0)}
                    icon={Wallet}
                />
                <MetricCard
                    title="Receivables"
                    subtitle="(From Customers)"
                    value={formatCurrency(metrics?.receivables || 0)}
                    icon={Users}
                />
                <MetricCard
                    title="Payables"
                    subtitle="(To Suppliers)"
                    value={formatCurrency(metrics?.payables || 0)}
                    icon={AlertCircle}
                />
                <MetricCard
                    title="Total Expenses"
                    value={formatCurrency(metrics?.total_expenses || 0)}
                    icon={TrendingDown}
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RevenueChart data={revenueTrend} loading={loading} />
                <CashFlowChart data={cashFlow} loading={loading} />
            </div>

            {/* Products & Widgets Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TopProductsChart data={topProducts} loading={loading} />
                <div className="grid grid-cols-1 gap-6">
                    <StockAlerts data={stockAlerts} loading={loading} />
                </div>
            </div>

            {/* Activity & Product Groups Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <RecentActivity data={recentActivity} loading={loading} />
                </div>
                <ProductGroupsChart data={productGroups} loading={loading} />
            </div>
        </div>
    );
}
