import { Button } from '@/components/ui/button';
import {
    IconKeyboard,
    IconArrowLeft,
    IconArrowRight,
    IconPrinter,
    IconSend,
    IconTrash,
    IconEdit,
    IconPlus,
    IconList,
    IconDeviceFloppy,
    IconX,
    IconAlertTriangle
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
// import { cn } from '@/lib/utils';

interface VoucherPageHeaderProps {
    title: string;
    description: string;
    mode?: 'new' | 'viewing' | 'editing';
    voucherNo?: string;
    voucherDate?: string;
    status?: string;
    isUnsaved?: boolean;
    hasPrevious?: boolean;
    hasNext?: boolean;
    onToggleShortcuts: () => void;
    onNavigatePrevious?: () => void;
    onNavigateNext?: () => void;
    onEdit?: () => void;
    onSave?: () => void;
    onCancel?: () => void;
    onDelete?: () => void;
    onPrint?: () => void;
    onSend?: () => void;
    onNew?: () => void;
    onListView?: () => void;
    loading?: boolean;
}

export function VoucherPageHeader({
    title,
    description,
    mode = 'new',
    voucherNo,
    voucherDate,
    status,
    isUnsaved,
    hasPrevious,
    hasNext,
    onToggleShortcuts,
    onNavigatePrevious,
    onNavigateNext,
    onEdit,
    onSave,
    onCancel,
    onDelete,
    onPrint,
    onSend,
    onNew,
    onListView,
    loading
}: VoucherPageHeaderProps) {
    return (
        <div className="border-b bg-card/50 px-5 py-3 backdrop-blur-sm shrink-0 h-[65px] flex items-center">
            <div className="flex items-center justify-between w-full">
                {/* Left Section */}
                <div className="flex items-center gap-3">
                    {/* Navigation Arrows (Viewing/Editing only) */}
                    {mode !== 'new' && (
                        <div className="flex items-center gap-1 mr-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={!hasPrevious}
                                onClick={onNavigatePrevious}
                                title="Previous (Alt+Left)"
                            >
                                <IconArrowLeft size={16} />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                disabled={!hasNext}
                                onClick={onNavigateNext}
                                title="Next (Alt+Right)"
                            >
                                <IconArrowRight size={16} />
                            </Button>
                        </div>
                    )}

                    {/* Voucher Info / Title */}
                    <div>
                        {mode === 'new' ? (
                            <>
                                <h1 className="text-base font-semibold">{title}</h1>
                                <p className="text-xs text-muted-foreground">{description}</p>
                            </>
                        ) : (
                            <div className="flex items-center gap-3">
                                {mode === 'editing' && (
                                    <span className="text-sm font-medium text-muted-foreground">Editing:</span>
                                )}
                                <h1 className="text-lg font-bold font-mono text-primary">
                                    {voucherNo || '---'}
                                </h1>
                                {mode === 'viewing' && voucherDate && (
                                    <>
                                        <span className="text-muted-foreground">•</span>
                                        <span className="text-sm text-muted-foreground">{voucherDate}</span>
                                    </>
                                )}
                                {status && (
                                    <Badge variant={status === 'posted' ? 'default' : 'secondary'} className="text-xs capitalize">
                                        {status}
                                    </Badge>
                                )}
                                {isUnsaved && (
                                    <Badge variant="destructive" className="text-xs gap-1">
                                        <IconAlertTriangle size={12} />
                                        Unsaved
                                    </Badge>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Section - Actions */}
                <div className="flex items-center gap-2">
                    {mode === 'new' && (
                        <>
                            {onListView && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onListView}
                                    className="h-8 text-xs gap-2"
                                >
                                    <IconList size={14} />
                                    List View
                                </Button>
                            )}
                        </>
                    )}

                    {mode === 'viewing' && (
                        <>
                            <div className="flex items-center gap-1 border-r pr-2 mr-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={onEdit}
                                    title="Edit (Ctrl+E)"
                                >
                                    <IconEdit size={16} />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={onPrint}
                                    title="Print (Ctrl+P)"
                                >
                                    <IconPrinter size={16} />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={onSend}
                                    title="Send"
                                >
                                    <IconSend size={16} />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={onDelete}
                                    title="Delete (Ctrl+Delete)"
                                >
                                    <IconTrash size={16} />
                                </Button>
                            </div>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={onNew}
                                className="h-8 text-xs gap-2"
                            >
                                <IconPlus size={14} />
                                New
                            </Button>
                        </>
                    )}

                    {mode === 'editing' && (
                        <>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onCancel}
                                className="h-8 text-xs gap-2"
                            >
                                <IconX size={14} />
                                Cancel
                            </Button>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={onSave}
                                disabled={loading}
                                className="h-8 text-xs gap-2"
                            >
                                {loading ? (
                                    <span className="animate-spin">⌛</span>
                                ) : (
                                    <IconDeviceFloppy size={14} />
                                )}
                                Save Changes
                            </Button>
                        </>
                    )}

                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={onToggleShortcuts}
                        className="h-8 w-8 ml-2"
                        title="Shortcuts (Ctrl+/)"
                    >
                        <IconKeyboard size={14} />
                    </Button>
                </div>
            </div>
        </div>
    );
}
