import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IconPrinter } from '@tabler/icons-react';
import { toast } from 'sonner';

interface PrintPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    voucherId: number | null;
    voucherType: string;
    templateId?: number | null;
}

export function PrintPreviewModal({
    isOpen,
    onClose,
    voucherId,
    voucherType,
    templateId,
}: PrintPreviewModalProps) {
    const [htmlContent, setHtmlContent] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        if (isOpen && voucherId) {
            loadPreview();
        } else {
            setHtmlContent('');
        }
    }, [isOpen, voucherId, voucherType, templateId]);

    const loadPreview = async () => {
        if (!voucherId) return;

        try {
            setLoading(true);
            const content = await invoke<string>('render_invoice', {
                voucherId,
                voucherType,
                templateId: templateId || null, // Use specific template or default
            });
            setHtmlContent(content);
        } catch (error) {
            console.error('Failed to render invoice:', error);
            toast.error('Failed to generate preview');
            setHtmlContent('<div style="color: red; padding: 20px;">Failed to load preview. Please try again.</div>');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        if (iframeRef.current && iframeRef.current.contentWindow) {
            const printWindow = iframeRef.current.contentWindow;
            printWindow.focus();
            printWindow.print();
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b shrink-0 flex flex-row items-center justify-between">
                    <DialogTitle>Print Preview</DialogTitle>
                    <DialogDescription className="sr-only">
                        Preview of the invoice/voucher before printing.
                    </DialogDescription>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handlePrint} disabled={loading || !htmlContent} className="gap-2">
                            <IconPrinter size={16} />
                            Print
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 bg-gray-100 overflow-hidden relative w-full h-full flex items-center justify-center p-4">
                    {loading ? (
                        <div className="text-muted-foreground flex flex-col items-center gap-2">
                            <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></span>
                            Generating Preview...
                        </div>
                    ) : htmlContent ? (
                        <iframe
                            ref={iframeRef}
                            className="w-full h-full bg-white shadow-lg rounded-sm"
                            srcDoc={htmlContent}
                            title="Invoice Preview"
                            style={{ border: 'none' }}
                        />
                    ) : (
                        <div className="text-muted-foreground">No preview available</div>
                    )}
                </div>

                <DialogFooter className="px-6 py-3 border-t shrink-0 bg-background/50 backdrop-blur-sm">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                    <Button onClick={handlePrint} disabled={loading || !htmlContent}>Print</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
