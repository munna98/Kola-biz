import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';

interface RevenueTrend {
    date: string;
    revenue: number;
    expenses: number;
}

interface RevenueChartProps {
    data: RevenueTrend[];
    loading?: boolean;
}

export default function RevenueChart({ data, loading }: RevenueChartProps) {
    if (loading) {
        return (
            <Card className="p-6">
                <div className="h-80 flex items-center justify-center">
                    <div className="text-muted-foreground">Loading chart...</div>
                </div>
            </Card>
        );
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
        }).format(value);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    };

    return (
        <Card className="border-t-4 border-t-muted">
            <div className="bg-muted/50 border-b p-4">
                <h3 className="font-bold text-lg">Revenue Trend</h3>
                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">
                    Daily Revenue vs Expenses
                </p>
            </div>
            <div className="p-4">
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            className="text-xs"
                        />
                        <YAxis
                            tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
                            className="text-xs"
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'hsl(var(--background))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                            }}
                            formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''}
                            labelFormatter={formatDate}
                        />
                        <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#10b981"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#revenueGradient)"
                            name="Revenue"
                        />
                        <Area
                            type="monotone"
                            dataKey="expenses"
                            stroke="#ef4444"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#expensesGradient)"
                            name="Expenses"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
}
