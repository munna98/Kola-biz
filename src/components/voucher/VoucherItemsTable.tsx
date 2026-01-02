import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { IconPlus } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

interface VoucherItemsTableProps {
    header: ReactNode;
    children: ReactNode;
    onAddItem: () => void;
    addItemLabel?: string;
    disableAdd?: boolean;
    className?: string;
    height?: string | number;
    footerRightContent?: ReactNode;
}

export function VoucherItemsTable({
    header,
    children,
    onAddItem,
    addItemLabel = 'Add Item (Ctrl+N)',
    disableAdd = false,
    className,
    height,
    footerRightContent
}: VoucherItemsTableProps) {
    return (
        <div
            className={cn(
                "bg-card border rounded-lg overflow-hidden flex flex-col",
                height ? "shrink-0" : "flex-1 min-h-0",
                className
            )}
            style={height ? { height } : undefined}
        >
            {/* Table Header */}
            <div className="bg-muted/50 border-b shrink-0">
                {header}
            </div>

            {/* Items - Scrollable */}
            <div className="divide-y overflow-y-auto flex-1">
                {children}
            </div>

            {/* Add Item Button */}
            {!disableAdd && (
                <div className="bg-muted/30 border-t px-3 py-2 shrink-0 flex justify-between items-center">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onAddItem}
                        className="text-xs h-7"
                    >
                        <IconPlus size={14} />
                        {addItemLabel}
                    </Button>
                    {footerRightContent}
                </div>
            )}
            {disableAdd && footerRightContent && (
                <div className="bg-muted/30 border-t px-3 py-2 shrink-0 flex justify-end items-center">
                    {footerRightContent}
                </div>
            )}
        </div>
    );
}
