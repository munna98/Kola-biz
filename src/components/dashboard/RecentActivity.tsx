import { Card } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';

interface RecentActivityItem {
    voucher_id: number;
    voucher_no: string;
    voucher_type: string;
    voucher_date: string;
    created_at: string;
    party_name: string | null;
    amount: number;
}

interface RecentActivityProps {
    data: RecentActivityItem[];
    loading?: boolean;
}

const voucherTypeLabels: Record<string, string> = {
    sales_invoice: 'Sale',
    purchase_invoice: 'Purchase',
    sales_return: 'Sales Return',
    purchase_return: 'Purchase Return',
    payment: 'Payment',
    receipt: 'Receipt',
    journal: 'Journal',
    stock_journal: 'Stock Journal',
    opening_stock: 'Opening Stock',
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
            if (!dateStr) return '';
            // SQLite DATETIME values are stored as "YYYY-MM-DD HH:MM:SS" (in UTC by default).
            // To ensure JavaScript correctly parses it as a UTC timestamp instead of local time,
            // we replace the space with 'T' and append 'Z' if not already present.
            let formattedStr = dateStr;
            if (!formattedStr.includes('T')) {
                formattedStr = formattedStr.replace(' ', 'T');
            }
            if (!formattedStr.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(formattedStr)) {
                formattedStr += 'Z';
            }
            return formatDistanceToNow(new Date(formattedStr), { addSuffix: true });
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
                            const label = voucherTypeLabels[item.voucher_type] || item.voucher_type;

                            return (
                                <tr
                                    key={item.voucher_id}
                                    className="border-b hover:bg-muted/20 cursor-pointer"
                                >
                                    <td className="p-2">
                                        <span className="text-xs font-medium">
                                            {label}
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
                                        {getTimeAgo(item.created_at)}
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
