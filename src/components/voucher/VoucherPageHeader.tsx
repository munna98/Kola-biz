import { Button } from '@/components/ui/button';
import {
    IconKeyboard,
    IconChevronLeft,
    IconChevronRight,
    IconPrinter,
    IconSend,
    IconTrash,
    IconEdit,
    IconPlus,
    IconList,
    IconDeviceFloppy,
    IconX,
    IconAlertTriangle,
    IconCash,
    IconEye
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';

interface VoucherPageHeaderProps {
    title: string;
    description: string;
    mode?: 'new' | 'viewing' | 'editing';
    voucherNo?: string;
    nextVoucherNo?: string;        // Preview number shown in new mode
    voucherDate?: string;
    createdBy?: string;
    isUnsaved?: boolean;
    hasPrevious?: boolean;
    hasNext?: boolean;
    onToggleShortcuts: () => void;
    onNavigatePrevious?: () => void;
    onNavigateNext?: () => void;
    onNavigateToLast?: () => void; // Navigate to last saved voucher when in new mode
    onEdit?: () => void;
    onSave?: () => void;
    onCancel?: () => void;
    onDelete?: () => void;
    onPrint?: () => void;
    onSend?: () => void;
    onNew?: () => void;
    onListView?: () => void;
    onManagePayments?: () => void;
    onViewCustomOrder?: () => void;
    customOrderNo?: string;
    loading?: boolean;
    editDisabled?: boolean;
    deleteDisabled?: boolean;
    customActionsPrefix?: React.ReactNode;
}

export function VoucherPageHeader({
    title,
    description,
    mode = 'new',
    voucherNo,
    nextVoucherNo,
    isUnsaved,
    hasPrevious,
    hasNext,
    onToggleShortcuts,
    onNavigatePrevious,
    onNavigateNext,
    onNavigateToLast,
    onEdit,
    onSave,
    onCancel,
    onDelete,
    onPrint,
    onSend,
    onNew,
    onListView,
    onManagePayments,
    onViewCustomOrder,
    customOrderNo,
    loading,
    editDisabled,
    deleteDisabled,
    customActionsPrefix
}: VoucherPageHeaderProps) {
    const displayVoucherNo = mode === 'new' ? nextVoucherNo : voucherNo;

    return (
        <div className="border-b bg-card/50 px-5 py-3 backdrop-blur-sm shrink-0 h-[65px] flex items-center z-0">
            <div className="flex items-center justify-between w-full">
                {/* Left Section */}
                <div className="flex items-center gap-3">
                    {/* Navigation Arrows with Voucher Number between */}
                    <div className="flex items-center gap-1.5 mr-2">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            disabled={mode === 'new' ? !hasPrevious : !hasPrevious}
                            onClick={mode === 'new' ? onNavigateToLast : onNavigatePrevious}
                            title={mode === 'new' ? 'Go to last voucher (Alt+Left)' : 'Previous (Alt+Left)'}
                        >
                            <IconChevronLeft size={16} />
                        </Button>

                        {displayVoucherNo && (
                            <span className={`h-8 flex items-center justify-center px-3 text-xs font-mono font-bold rounded-md border shrink-0 ${
                                mode === 'new'
                                    ? 'text-muted-foreground/70 border-dashed border-muted-foreground/30 bg-muted/20'
                                    : 'text-primary border-primary/20 bg-primary/10'
                            }`}>
                                {displayVoucherNo}
                            </span>
                        )}

                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            disabled={mode === 'new' ? true : !hasNext}
                            onClick={mode === 'new' ? undefined : onNavigateNext}
                            title={mode === 'new' ? 'No next voucher in new mode' : 'Next (Alt+Right)'}
                        >
                            <IconChevronRight size={16} />
                        </Button>
                    </div>

                    {/* Voucher Info / Title */}
                    <div>
                        {mode === 'new' ? (
                            <div>
                                <h1 className="text-base font-semibold">{title}</h1>
                                <p className="text-xs text-muted-foreground">{description}</p>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <h1 className="text-base font-semibold">{title}</h1>
                                {mode === 'editing' && (
                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                        Editing
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
                    {customActionsPrefix}

                    {mode === 'viewing' && (
                        <>
                            <div className="flex items-center gap-1 border-r pr-2 mr-2">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={onEdit}
                                    disabled={editDisabled}
                                    title={editDisabled ? "Cannot edit system generated voucher" : "Edit (Ctrl+E)"}
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
                                {onViewCustomOrder && (
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                        onClick={onViewCustomOrder}
                                        title={customOrderNo ? `See in Custom Orders (${customOrderNo})` : "See in Custom Orders"}
                                    >
                                        <IconEye size={16} />
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={onDelete}
                                    disabled={deleteDisabled}
                                    title={deleteDisabled ? "Cannot delete system generated voucher" : "Delete (Ctrl+Delete)"}
                                >
                                    <IconTrash size={16} />
                                </Button>
                            </div>
                            {onManagePayments && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onManagePayments}
                                    className="h-8 text-xs gap-2"
                                    title="View Payments"
                                >
                                    <IconCash size={14} />
                                    Payments
                                </Button>
                            )}
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
                            {onManagePayments && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onManagePayments}
                                    className="h-8 text-xs gap-2"
                                    title="Manage Payments"
                                >
                                    <IconCash size={14} />
                                    Payments
                                </Button>
                            )}
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
