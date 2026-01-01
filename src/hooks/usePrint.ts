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

    const print = useCallback(async ({ voucherId, voucherType, templateId }: PrintOptions) => {
        if (!voucherId) {
            toast.error('Please save the invoice before printing');
            return;
        }

        try {
            setIsPrinting(true);

            // 1. Fetch Print Settings
            let settings: PrintSettings = { silent_print: false, default_printer: null };
            try {
                settings = await invoke<PrintSettings>('get_print_settings');
            } catch (e) {
                console.warn('Failed to fetch print settings, defaulting to dialog', e);
            }

            // 2. Fetch Rendered Content
            const content = await invoke<string>('render_invoice', {
                voucherId,
                voucherType,
                templateId: templateId || null,
            });

            // 3. Handle Silent Printing
            if (settings.silent_print) {
                try {
                    toast.info('Printing silently...');
                    await invoke('print_silently', {
                        htmlContent: content,
                        printerName: settings.default_printer
                    });
                    toast.success('Sent to printer');
                    return; // Success, exit
                } catch (e) {
                    console.error('Silent print failed, falling back to dialog:', e);
                    toast.error('Silent print failed. Opening print dialog...');
                    // Fallthrough to iframe method
                }
            }

            // 4. Fallback/Standard: Iframe Print (System Dialog)
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
            console.error('Failed to print:', error);
            toast.error('Failed to generate print content');
        } finally {
            setIsPrinting(false);
        }
    }, []);

    return { print, isPrinting };
}
