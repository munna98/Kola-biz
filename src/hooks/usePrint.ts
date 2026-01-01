import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

interface PrintOptions {
    voucherId: string;
    voucherType: string;
    templateId?: number | null;
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
    const printRaw = useCallback(async (content: string, settings?: PrintSettings) => {
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
                iframe.style.right = '0';
                iframe.style.bottom = '0';
                iframe.style.width = '0';
                iframe.style.height = '0';
                iframe.style.border = 'none';
                iframe.style.visibility = 'hidden';
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
                    iframe.contentWindow?.focus();
                    iframe.contentWindow?.print();
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

    const print = useCallback(async ({ voucherId, voucherType, templateId }: PrintOptions) => {
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

            await printRaw(content);

        } catch (error) {
            console.error('Failed to fetch/render print content:', error);
            toast.error('Failed to generate print content');
            setIsPrinting(false);
        }
    }, [printRaw]);

    return { print, printRaw, isPrinting };
}
