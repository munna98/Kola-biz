import { useRef, useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IconPrinter } from '@tabler/icons-react';
import { usePrint } from '@/hooks/usePrint';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

interface PrintPreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    voucherId?: string;
    voucherType: string;
    templateId?: number;
    title?: string;
}

export function PrintPreviewDialog({
    open,
    onOpenChange,
    voucherId,
    voucherType,
    templateId,
    title = 'Print Preview',
}: PrintPreviewDialogProps) {
    const { printRaw, isPrinting } = usePrint();
    const [content, setContent] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const frameRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        if (open && voucherId) {
            loadContent();
        }
    }, [open, voucherId, voucherType, templateId]);

    const loadContent = async () => {
        try {
            setLoading(true);
            const html = await invoke<string>('render_invoice', {
                voucherId,
                voucherType,
                templateId: templateId || null,
            });
            setContent(html);
        } catch (error) {
            console.error('Failed to render preview:', error);
            toast.error('Failed to load preview');
            onOpenChange(false);
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = async () => {
        if (!content) return;
        await printRaw(content);
        // Optional: close on print? keeping open for now so they can reprint if needed
    };

    // Inject content into iframe when it loads or content changes
    useEffect(() => {
        const iframe = frameRef.current;
        if (!loading && iframe && content) {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (doc) {
                doc.open();
                doc.write(content);
                doc.close();
            }
        }
    }, [content, open, loading]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b shrink-0 flex flex-row items-center justify-between space-y-0">
                    <div>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription className="hidden">Preview of the document before printing</DialogDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                        >
                            Close
                        </Button>
                        <Button
                            size="sm"
                            onClick={handlePrint}
                            disabled={loading || isPrinting || !content}
                        >
                            <IconPrinter size={16} className="mr-2" />
                            {isPrinting ? 'Printing...' : 'Print'}
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 bg-muted/30 p-4 overflow-hidden relative">
                    {loading ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : (
                        <iframe
                            ref={frameRef}
                            className="w-full h-full bg-white shadow-sm rounded-md border"
                            title="Print Preview"
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
