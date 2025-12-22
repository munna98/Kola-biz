import { Button } from '@/components/ui/button';
import { IconKeyboard } from '@tabler/icons-react';

interface VoucherPageHeaderProps {
    title: string;
    description: string;
    onToggleShortcuts: () => void;
}

export function VoucherPageHeader({ title, description, onToggleShortcuts }: VoucherPageHeaderProps) {
    return (
        <div className="border-b bg-card/50 px-5 py-3 backdrop-blur-sm shrink-0">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-base font-semibold">{title}</h1>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onToggleShortcuts}
                    className="h-7 text-xs"
                >
                    <IconKeyboard size={14} className="mr-2" />
                    Shortcuts (Ctrl+/)
                </Button>
            </div>
        </div>
    );
}
