import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';

interface CashFlow {
    date: string;
    inflows: number;
    outflows: number;
}

interface CashFlowChartProps {
    data: CashFlow[];
    loading?: boolean;
}

export default function CashFlowChart({ data, loading }: CashFlowChartProps) {
    if (loading) {
        return (
            <Card className="border-t-4 border-t-muted">
                <div className="p-4 h-80 flex items-center justify-center">
                    <div className="text-muted-foreground">Loading chart...</div>
                </div>
            </Card>
        );
    }

    const formatCurrency = (value: number) => {
        return `₹${(value / 1000).toFixed(0)}k`;
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    };

    return (
        <Card className="border-t-4 border-t-muted">
            <div className="bg-muted/50 border-b p-4">
                <h3 className="font-bold text-lg">Cash Flow</h3>
                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">
                    Inflows vs Outflows
                </p>
            </div>
            <div className="p-4">
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                            dataKey="date"
                            tickFormatter={formatDate}
                            className="text-xs"
                        />
                        <YAxis
                            tickFormatter={formatCurrency}
                            className="text-xs"
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'hsl(var(--background))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                            }}
                            formatter={(value: number | undefined) => value !== undefined ? `₹${value.toLocaleString('en-IN')}` : ''}
                            labelFormatter={formatDate}
                        />
                        <Legend />
                        <Bar dataKey="inflows" fill="#10b981" name="Inflows" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="outflows" fill="#ef4444" name="Outflows" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
}
