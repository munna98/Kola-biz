import { Card } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';

interface RecentActivityItem {
    voucher_id: number;
    voucher_no: string;
    voucher_type: string;
    voucher_date: string;
    party_name: string | null;
    amount: number;
}

interface RecentActivityProps {
    data: RecentActivityItem[];
    loading?: boolean;
}

const voucherTypeLabels: Record<string, { label: string; color: string }> = {
    sales_invoice: { label: 'Sale', color: 'text-green-600 dark:text-green-400' },
    purchase_invoice: { label: 'Purchase', color: 'text-blue-600 dark:text-blue-400' },
    payment: { label: 'Payment', color: 'text-red-600 dark:text-red-400' },
    receipt: { label: 'Receipt', color: 'text-purple-600 dark:text-purple-400' },
    journal: { label: 'Journal', color: 'text-gray-600 dark:text-gray-400' },
};

export default function RecentActivity({ data, loading }: RecentActivityProps) {
    if (loading) {
        return (
            <Card className="border-t-4 border-t-muted">
                <div className="bg-muted/50 border-b p-4">
                    <h3 className="font-bold text-lg">Recent Activity</h3>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">
                        Latest Transactions
                    </p>
                </div>
                <div className="p-4 text-sm text-muted-foreground">Loading...</div>
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

    const getTimeAgo = (dateStr: string) => {
        try {
            return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
        } catch {
            return dateStr;
        }
    };

    return (
        <Card className="border-t-4 border-t-muted">
            <div className="bg-muted/50 border-b p-4">
                <h3 className="font-bold text-lg">Recent Activity</h3>
                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">
                    Last {data.length} Transactions
                </p>
            </div>
            <div className="overflow-auto max-h-80">
                <table className="w-full">
                    <thead className="bg-muted/30 border-b sticky top-0">
                        <tr>
                            <th className="p-2 text-left text-xs font-semibold">Type</th>
                            <th className="p-2 text-left text-xs font-semibold">Voucher No</th>
                            <th className="p-2 text-left text-xs font-semibold">Party</th>
                            <th className="p-2 text-right text-xs font-semibold">Amount</th>
                            <th className="p-2 text-left text-xs font-semibold">Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item) => {
                            const config = voucherTypeLabels[item.voucher_type] || { label: item.voucher_type, color: '' };

                            return (
                                <tr
                                    key={item.voucher_id}
                                    className="border-b hover:bg-muted/20 cursor-pointer"
                                >
                                    <td className="p-2">
                                        <span className={`text-xs font-medium ${config.color}`}>
                                            {config.label}
                                        </span>
                                    </td>
                                    <td className="p-2 text-xs font-mono">{item.voucher_no}</td>
                                    <td className="p-2 text-xs truncate max-w-[150px]">
                                        {item.party_name || '-'}
                                    </td>
                                    <td className="p-2 text-right font-mono text-xs font-semibold">
                                        {formatCurrency(item.amount)}
                                    </td>
                                    <td className="p-2 text-xs text-muted-foreground">
                                        {getTimeAgo(item.voucher_date)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
