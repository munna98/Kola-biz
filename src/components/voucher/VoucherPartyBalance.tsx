import { cn } from '@/lib/utils';

export interface VoucherPartyBalanceProps {
    balance: number | null | undefined;
    newBalance?: number | null | undefined;
    moneyFormatter: (amount: number | null | undefined, options?: any) => string;
    className?: string;
}

export function VoucherPartyBalance({
    balance,
    newBalance,
    moneyFormatter,
    className,
}: VoucherPartyBalanceProps) {
    if (balance === null || balance === undefined) return null;

    const cleanVal = (val: number) => (Math.abs(val) < 0.005 ? 0 : val);

    const formatBal = (val: number) => {
        const cleaned = cleanVal(val);
        const formatted = moneyFormatter(Math.abs(cleaned), {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        });
        const type = cleaned >= 0 ? 'Dr' : 'Cr';
        return `${formatted} ${type}`;
    };

    const cleanedBalance = cleanVal(balance);
    const currentColor = cleanedBalance >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500';

    const hasNewBalance = newBalance !== null && newBalance !== undefined;
    const cleanedNew = hasNewBalance ? cleanVal(newBalance) : 0;
    const newColor = cleanedNew >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500';

    return (
        <div className={cn("text-base font-mono font-bold flex items-center gap-1.5", className)}>
            <span className={currentColor}>
                Balance: {formatBal(cleanedBalance)}
            </span>
            {hasNewBalance && (
                <span className={newColor}>
                    ({formatBal(cleanedNew)})
                </span>
            )}
        </div>
    );
}
