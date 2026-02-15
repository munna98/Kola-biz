import { useRef, useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { IconPrinter } from '@tabler/icons-react';
import { invoke } from '@tauri-apps/api/core';
import JsBarcode from 'jsbarcode';
import { BarcodeSettings } from '@/pages/settings/BarcodeSettingsPage';

interface Product {
    code: string;
    name: string;
    salesRate: number;
    quantity?: number;
}

interface BarcodeLabelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    products: Product[];
}

const DEFAULT_SETTINGS: BarcodeSettings = {
    companyName: '',
    showProductName: true,
    showSalesRate: true,
    customText: '',
    barcodeFormat: 'CODE128',
    labelSize: '50x25',
};

const LABEL_DIMENSIONS: Record<string, { width: number; height: number }> = {
    '50x25': { width: 50, height: 25 },
    '40x25': { width: 40, height: 25 },
    '40x20': { width: 40, height: 20 },
    '30x15': { width: 30, height: 15 },
};

export default function BarcodeLabelDialog({
    open,
    onOpenChange,
    products,
}: BarcodeLabelDialogProps) {
    const [settings, setSettings] = useState<BarcodeSettings>(DEFAULT_SETTINGS);
    const [copies, setCopies] = useState(1);
    const [loading] = useState(false);
    const printRef = useRef<HTMLDivElement>(null);
    const dims = LABEL_DIMENSIONS[settings.labelSize] || LABEL_DIMENSIONS['50x25'];

    useEffect(() => {
        if (open) {
            loadSettings();
        }
    }, [open]);

    const loadSettings = async () => {
        try {
            const saved = await invoke<string | null>('get_app_setting', { key: 'barcode_settings' });
            if (saved) {
                const parsed = JSON.parse(saved);
                setSettings({ ...DEFAULT_SETTINGS, ...parsed });
            }
        } catch (error) {
            console.error('Failed to load barcode settings:', error);
        }
    };

    const handlePrint = () => {
        if (!printRef.current) return;

        const printContent = printRef.current.innerHTML;
        const dims = LABEL_DIMENSIONS[settings.labelSize] || LABEL_DIMENSIONS['50x25'];

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Barcode Labels</title>
                <style>
                    @page {
                        size: ${dims.width}mm ${dims.height}mm;
                        margin: 0;
                    }
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    body {
                        font-family: Arial, sans-serif;
                    }
                    .label {
                        width: ${dims.width}mm;
                        height: ${dims.height}mm;
                        padding: 1mm;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        page-break-after: always;
                        text-align: center;
                    }
                    .label:last-child {
                        page-break-after: avoid;
                    }
                    .company-name {
                        font-size: 6pt;
                        font-weight: bold;
                        margin-bottom: 1mm;
                    }
                    .barcode-svg {
                        max-width: 90%;
                        height: auto;
                    }
                    .product-code {
                        font-size: 7pt;
                        font-weight: bold;
                        margin-top: 1mm;
                    }
                    .product-name {
                        font-size: 5pt;
                        margin-top: 0.5mm;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        max-width: 95%;
                    }
                    .sales-rate {
                        font-size: 6pt;
                        font-weight: bold;
                        margin-top: 0.5mm;
                    }
                    .custom-text {
                        font-size: 5pt;
                        margin-top: 0.5mm;
                    }
                    @media print {
                        body { -webkit-print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                ${printContent}
            </body>
            </html>
        `);

        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    };

    // Generate labels for preview
    const generateLabels = (): React.ReactNode[] => {
        const labels: React.ReactElement[] = [];

        products.forEach((product, productIndex) => {
            const qty = product.quantity || copies;
            for (let i = 0; i < qty; i++) {
                labels.push(
                    <BarcodeLabel
                        key={`${productIndex}-${i}`}
                        product={product}
                        settings={settings}
                    />
                );
            }
        });

        return labels;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Print Barcode Labels</DialogTitle>
                    <DialogDescription>
                        Preview and print barcode labels for {products.length} product(s)
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-4 py-2 border-b">
                    <div className="flex items-center gap-2">
                        <Label htmlFor="copies">Copies per product:</Label>
                        <Input
                            id="copies"
                            type="number"
                            min={1}
                            max={100}
                            value={copies}
                            onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-20"
                        />
                    </div>
                    <div className="flex-1" />
                    <Button onClick={handlePrint} disabled={loading || products.length === 0}>
                        <IconPrinter size={16} className="mr-2" />
                        Print Labels
                    </Button>
                </div>

                <div className="flex-1 overflow-auto bg-muted/30 p-4 rounded-md">
                    <div
                        ref={printRef}
                        className="grid gap-2 justify-center"
                        style={{ gridTemplateColumns: `repeat(auto-fit, ${dims.width * 3}px)` }}
                    >
                        {generateLabels()}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// Individual barcode label component
function BarcodeLabel({ product, settings }: { product: Product; settings: BarcodeSettings }) {
    const svgRef = useRef<SVGSVGElement>(null);
    const dims = LABEL_DIMENSIONS[settings.labelSize] || LABEL_DIMENSIONS['50x25'];

    useEffect(() => {
        if (svgRef.current && product.code) {
            try {
                JsBarcode(svgRef.current, product.code, {
                    format: settings.barcodeFormat === 'EAN13' ? 'EAN13' : 'CODE128',
                    width: 1.5,
                    height: 30,
                    displayValue: false,
                    margin: 0,
                });
            } catch (error) {
                console.error('Failed to generate barcode:', error);
            }
        }
    }, [product.code, settings.barcodeFormat]);

    return (
        <div
            className="label bg-white border rounded shadow-sm flex flex-col items-center justify-center p-2"
            style={{
                width: `${dims.width * 3}px`,
                height: `${dims.height * 3}px`,
                minWidth: `${dims.width * 3}px`,
            }}
        >
            {settings.companyName && (
                <div className="company-name text-[8px] font-bold truncate max-w-full">
                    {settings.companyName}
                </div>
            )}
            <svg ref={svgRef} className="barcode-svg max-w-full" />
            <div className="product-code text-[9px] font-bold">{product.code}</div>
            {settings.showProductName && (
                <div className="product-name text-[7px] truncate max-w-full">
                    {product.name}
                </div>
            )}
            {settings.showSalesRate && (
                <div className="sales-rate text-[8px] font-bold">
                    ₹ {product.salesRate?.toFixed(2)}
                </div>
            )}
            {settings.customText && (
                <div className="custom-text text-[6px] truncate max-w-full">
                    {settings.customText}
                </div>
            )}
        </div>
    );
}
