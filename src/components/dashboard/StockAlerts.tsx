import { Card } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface StockAlert {
    product_id: number;
    product_name: string;
    current_stock: number;
    unit_symbol: string;
}

interface StockAlertsProps {
    data: StockAlert[];
    loading?: boolean;
}

export default function StockAlerts({ data, loading }: StockAlertsProps) {
    if (loading) {
        return (
            <Card className="border-t-4 border-t-muted">
                <div className="bg-muted/50 border-b p-4">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <AlertTriangle size={20} />
                        Stock Alerts
                    </h3>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">
                        Low Stock Items
                    </p>
                </div>
                <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            </Card>
        );
    }

    if (data.length === 0) {
        return (
            <Card className="border-t-4 border-t-muted">
                <div className="bg-muted/50 border-b p-4">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <AlertTriangle className="text-green-600" size={20} />
                        Stock Alerts
                    </h3>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">
                        All Stock Levels Healthy
                    </p>
                </div>
                <div className="p-4 text-sm text-muted-foreground text-center">
                    No low stock items 🎉
                </div>
            </Card>
        );
    }

    return (
        <Card className="border-t-4 border-t-orange-500/30">
            <div className="bg-muted/50 border-b p-4">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <AlertTriangle className="text-orange-500" size={20} />
                    Stock Alerts
                </h3>
                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">
                    {data.length} Item{data.length !== 1 ? 's' : ''} Below Threshold
                </p>
            </div>
            <div className="overflow-auto max-h-80">
                <table className="w-full">
                    <thead className="bg-muted/30 border-b sticky top-0">
                        <tr>
                            <th className="p-2 text-left text-xs font-semibold">Product</th>
                            <th className="p-2 text-right text-xs font-semibold">Stock</th>
                            <th className="p-2 text-center text-xs font-semibold">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item) => (
                            <tr
                                key={item.product_id}
                                className="border-b hover:bg-muted/20 cursor-pointer"
                            >
                                <td className="p-2 text-sm">{item.product_name}</td>
                                <td className="p-2 text-right font-mono text-sm">
                                    {item.current_stock} {item.unit_symbol}
                                </td>
                                <td className="p-2 text-center">
                                    <span className="px-2 py-1 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-medium">
                                        Low
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
