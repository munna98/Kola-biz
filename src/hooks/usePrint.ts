import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

interface PrintOptions {
    voucherId: string;
    voucherType: string;
    templateId?: number | null;
    /** Optional filename (voucher number) used as the default PDF filename in the print dialog. */
    filename?: string;
}

interface PrintSettings {
    silent_print: boolean;
    default_printer: string | null;
}

/**
 * Hook for printing invoices/vouchers.
 * Supports both silent printing (if configured) and system dialog via iframe.
 */
export function usePrint() {
    const [isPrinting, setIsPrinting] = useState(false);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);

    /**
     * Prints the provided HTML content.
     * Handles both silent printing and system dialog via iframe.
     */
    const printRaw = useCallback(async (content: string, settings?: PrintSettings, filename?: string) => {
        try {
            setIsPrinting(true);

            // Fetch settings if not provided
            if (!settings) {
                try {
                    settings = await invoke<PrintSettings>('get_print_settings');
                } catch (e) {
                    console.warn('Failed to fetch print settings, defaulting to dialog', e);
                    settings = { silent_print: false, default_printer: null };
                }
            }

            // Handle Silent Printing
            if (settings.silent_print) {
                try {
                    toast.info('Printing silently...');
                    await invoke('print_silently', {
                        htmlContent: content,
                        printerName: settings.default_printer
                    });
                    toast.success('Sent to printer');
                    return;
                } catch (e) {
                    console.error('Silent print failed, falling back to dialog:', e);
                    toast.error('Silent print failed. Opening print dialog...');
                }
            }

            // Fallback/Standard: Iframe Print (System Dialog)
            if (!iframeRef.current) {
                const iframe = document.createElement('iframe');
                iframe.style.position = 'fixed';
                iframe.style.left = '-9999px';
                iframe.style.top = '-9999px';
                iframe.style.width = '210mm';
                iframe.style.height = '297mm';
                iframe.style.border = 'none';
                document.body.appendChild(iframe);
                iframeRef.current = iframe;
            }

            const iframe = iframeRef.current;
            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

            if (!iframeDoc) {
                toast.error('Failed to initialize print');
                return;
            }

            iframeDoc.open();
            iframeDoc.write(content);
            iframeDoc.close();

            setTimeout(() => {
                try {
                    // Temporarily set document.title so browsers use it as the PDF filename
                    const prevTitle = document.title;
                    if (filename) document.title = filename;
                    iframe.contentWindow?.focus();
                    iframe.contentWindow?.print();
                    // Restore after a short delay to allow the dialog to capture the title
                    setTimeout(() => { document.title = prevTitle; }, 1000);
                } catch (e) {
                    console.error('Print failed:', e);
                    toast.error('Failed to print');
                }
            }, 500);

        } catch (error) {
            console.error('Failed to process print:', error);
            toast.error('Failed to print');
        } finally {
            setIsPrinting(false);
        }
    }, []);

    const print = useCallback(async ({ voucherId, voucherType, templateId, filename }: PrintOptions) => {
        if (!voucherId) {
            toast.error('Please save the invoice before printing');
            return;
        }

        try {
            setIsPrinting(true);
            const content = await invoke<string>('render_invoice', {
                voucherId,
                voucherType,
                templateId: templateId || null,
            });

            await printRaw(content, undefined, filename);

        } catch (error) {
            console.error('Failed to fetch/render print content:', error);
            toast.error('Failed to generate print content');
            setIsPrinting(false);
        }
    }, [printRaw]);

    return { print, printRaw, isPrinting };
}
