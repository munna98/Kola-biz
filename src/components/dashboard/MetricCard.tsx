import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface MetricCardProps {
    title: string;
    value: string;
    change?: number;
    icon: LucideIcon;
    subtitle?: string;
}

export default function MetricCard({ title, value, change, subtitle }: MetricCardProps) {
    return (
        <Card className="border-t-4 border-t-muted">
            <CardContent className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <p className="text-sm text-muted-foreground">{title}</p>
                        {subtitle && (
                            <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
                        )}
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-bold font-mono">
                            {value}
                        </p>
                        {change !== undefined && (
                            <p className="text-xs text-muted-foreground mt-1">
                                {change >= 0 ? (
                                    <span className="text-green-600 dark:text-green-400">
                                        ↑ {change.toFixed(1)}%
                                    </span>
                                ) : (
                                    <span className="text-red-600 dark:text-red-400">
                                        ↓ {Math.abs(change).toFixed(1)}%
                                    </span>
                                )}
                                {' vs last period'}
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
