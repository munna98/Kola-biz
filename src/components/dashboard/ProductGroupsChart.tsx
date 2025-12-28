import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card } from '@/components/ui/card';

interface ProductGroupData {
    group_name: string;
    product_count: number;
    total_stock_value: number;
    [key: string]: any; // Index signature for Recharts compatibility
}

interface ProductGroupsChartProps {
    data: ProductGroupData[];
    loading?: boolean;
}

const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

export default function ProductGroupsChart({ data, loading }: ProductGroupsChartProps) {
    if (loading) {
        return (
            <Card className="border-t-4 border-t-muted">
                <div className="p-4 h-80 flex items-center justify-center">
                    <div className="text-muted-foreground">Loading chart...</div>
                </div>
            </Card>
        );
    }

    if (data.length === 0) {
        return (
            <Card className="border-t-4 border-t-muted">
                <div className="bg-muted/50 border-b p-4">
                    <h3 className="font-bold text-lg">Product Groups</h3>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">
                        By Stock Value
                    </p>
                </div>
                <div className="p-4 text-center text-muted-foreground">
                    No product groups found
                </div>
            </Card>
        );
    }

    const formatCurrency = (value: number | undefined) => {
        if (value === undefined) return '';
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
        }).format(value);
    };

    const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
        const RADIAN = Math.PI / 180;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);

        if (percent < 0.05) return null; // Hide labels for slices < 5%

        return (
            <text
                x={x}
                y={y}
                fill="white"
                textAnchor={x > cx ? 'start' : 'end'}
                dominantBaseline="central"
                className="text-xs font-bold"
            >
                {`${(percent * 100).toFixed(0)}%`}
            </text>
        );
    };

    return (
        <Card className="border-t-4 border-t-muted">
            <div className="bg-muted/50 border-b p-4">
                <h3 className="font-bold text-lg">Product Groups</h3>
                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">
                    Distribution by Stock Value
                </p>
            </div>
            <div className="p-4">
                <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={CustomLabel}
                            outerRadius={100}
                            innerRadius={60}
                            fill="#8884d8"
                            dataKey="total_stock_value"
                            nameKey="group_name"
                        >
                            {data.map((_entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip
                            formatter={formatCurrency}
                            contentStyle={{
                                backgroundColor: 'hsl(var(--background))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                            }}
                        />
                        <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value) => {
                                const item = data.find(d => d.group_name === value);
                                return `${value} (${item?.product_count || 0} items)`;
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
}
