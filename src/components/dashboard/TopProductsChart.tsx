import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui/card';

interface TopProduct {
    product_name: string;
    total_quantity: number;
    total_revenue: number;
}

interface TopProductsChartProps {
    data: TopProduct[];
    loading?: boolean;
}

export default function TopProductsChart({ data, loading }: TopProductsChartProps) {
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

    return (
        <Card className="border-t-4 border-t-muted">
            <div className="bg-muted/50 border-b p-4">
                <h3 className="font-bold text-lg">Top Products</h3>
                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">
                    By Revenue
                </p>
            </div>
            <div className="p-4">
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                            type="number"
                            tickFormatter={formatCurrency}
                            className="text-xs"
                        />
                        <YAxis
                            type="category"
                            dataKey="product_name"
                            width={120}
                            className="text-xs"
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'hsl(var(--background))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                            }}
                            formatter={(value: number | undefined) => value !== undefined ? `₹${value.toLocaleString('en-IN')}` : ''}
                        />
                        <Bar
                            dataKey="total_revenue"
                            fill="#8b5cf6"
                            name="Revenue"
                            radius={[0, 4, 4, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
}
