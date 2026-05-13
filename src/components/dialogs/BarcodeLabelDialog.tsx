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
import { Checkbox } from '@/components/ui/checkbox';
import { IconPrinter } from '@tabler/icons-react';
import { invoke } from '@tauri-apps/api/core';
import JsBarcode from 'jsbarcode';
import {
    type BarcodeDesignerSettings,
    type LabelElement,
    DEFAULT_DESIGNER_SETTINGS,
    migrateSettings,
} from '@/components/barcode/BarcodeLabelDesigner';

interface Product {
    code: string;
    name: string;
    salesRate: number;
    mrp?: number;
    quantity?: number;
}

interface BarcodeLabelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    products: Product[];
}

export default function BarcodeLabelDialog({
    open,
    onOpenChange,
    products,
}: BarcodeLabelDialogProps) {
    const [settings, setSettings] = useState<BarcodeDesignerSettings>(DEFAULT_DESIGNER_SETTINGS);
    const [productCounts, setProductCounts] = useState<Record<number, number>>({});
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [checkedProducts, setCheckedProducts] = useState<Set<number>>(new Set());
    const printRef = useRef<HTMLDivElement>(null);

    // Initialize counts and selection when products change
    useEffect(() => {
        if (open) {
            loadSettings();
            const counts: Record<number, number> = {};
            const checked = new Set<number>();
            products.forEach((p, i) => {
                counts[i] = p.quantity || 1;
                checked.add(i);
            });
            setProductCounts(counts);
            setCheckedProducts(checked);
            setSelectedIndex(0);
        }
    }, [open, products]);

    const toggleProduct = (idx: number) => {
        setCheckedProducts(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    };

    const toggleAll = (checked: boolean) => {
        if (checked) {
            setCheckedProducts(new Set(products.map((_, i) => i)));
        } else {
            setCheckedProducts(new Set());
        }
    };

    const allChecked = products.length > 0 && checkedProducts.size === products.length;
    const someChecked = checkedProducts.size > 0 && checkedProducts.size < products.length;

    const loadSettings = async () => {
        try {
            const saved = await invoke<string | null>('get_app_setting', { key: 'barcode_settings' });
            if (saved) {
                const parsed = JSON.parse(saved);
                setSettings(migrateSettings(parsed));
            }
        } catch (error) {
            console.error('Failed to load barcode settings:', error);
        }
    };

    const updateCount = (index: number, value: number) => {
        setProductCounts(prev => ({ ...prev, [index]: Math.max(1, value) }));
    };

    const totalLabels = products.reduce((s, _, idx) => s + (checkedProducts.has(idx) ? (productCounts[idx] || 1) : 0), 0);
    const selectedProduct = products[selectedIndex] || products[0];

    const handlePrint = () => {
        if (!printRef.current) return;

        const { labelWidth, labelHeight, elements, barcodeFormat, columnsPerRow, horizontalGap, verticalGap } = settings;
        const cols = columnsPerRow || 1;
        const hGap = horizontalGap || 0;
        const vGap = verticalGap || 0;

        // Page size: full row width × label height
        const pageWidth = cols * labelWidth + (cols - 1) * hGap;
        const pageHeight = labelHeight;

        // Build individual label HTML snippets
        const labelSnippets: string[] = [];
        products.forEach((product, idx) => {
            if (!checkedProducts.has(idx)) return;
            const count = productCounts[idx] || 1;
            for (let i = 0; i < count; i++) {
                let labelHtml = '';
                elements.filter(el => el.enabled).forEach(el => {
                    const text = getElementText(el, product);
                    if (el.type === 'barcode') {
                        const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        try {
                            JsBarcode(tempSvg, product.code, {
                                format: barcodeFormat === 'EAN13' ? 'EAN13' : 'CODE128',
                                width: el.barcodeLineWidth || 1.5,
                                height: el.barcodeHeight || 30,
                                displayValue: el.showBarcodeText || false,
                                margin: 0,
                                fontSize: (el.fontSize || 7) * 1.5,
                            });
                        } catch { /* ignore */ }
                        const svgStr = new XMLSerializer().serializeToString(tempSvg);
                        labelHtml += `<div style="
                            position:absolute; left:${el.x}mm; top:${el.y}mm;
                            width:${el.width}mm; height:${el.height}mm;
                            display:flex; align-items:center;
                            justify-content:${el.textAlign === 'left' ? 'flex-start' : el.textAlign === 'right' ? 'flex-end' : 'center'};
                            overflow:hidden;
                        ">${svgStr}</div>`;
                    } else {
                        labelHtml += `<div style="
                            position:absolute; left:${el.x}mm; top:${el.y}mm;
                            width:${el.width}mm; height:${el.height}mm;
                            font-family:${el.fontFamily}; font-size:${el.fontSize}pt;
                            font-weight:${el.fontWeight}; text-align:${el.textAlign};
                            display:flex; align-items:center;
                            justify-content:${el.textAlign === 'left' ? 'flex-start' : el.textAlign === 'right' ? 'flex-end' : 'center'};
                            overflow:hidden; line-height:1.1;
                        "><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%">${text}</span></div>`;
                    }
                });
                labelSnippets.push(labelHtml);
            }
        });

        // Group snippets into rows
        let bodyHtml = '';
        for (let i = 0; i < labelSnippets.length; i += cols) {
            const rowLabels = labelSnippets.slice(i, i + cols);
            bodyHtml += `<div class="label-row">`;
            rowLabels.forEach((snippet, colIdx) => {
                const marginLeft = colIdx > 0 ? `${hGap}mm` : '0';
                bodyHtml += `<div class="label" style="margin-left:${marginLeft}">${snippet}</div>`;
            });
            bodyHtml += `</div>`;
        }

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Barcode Labels</title>
                <style>
                    @page {
                        size: ${pageWidth}mm ${pageHeight}mm;
                        margin: 0;
                    }
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; }
                    .label-row {
                        display: flex;
                        width: ${pageWidth}mm;
                        height: ${pageHeight}mm;
                        page-break-after: always;
                        margin-bottom: ${vGap}mm;
                    }
                    .label-row:last-child { page-break-after: avoid; margin-bottom: 0; }
                    .label {
                        width: ${labelWidth}mm;
                        height: ${labelHeight}mm;
                        position: relative;
                        overflow: hidden;
                        flex-shrink: 0;
                    }
                    svg { max-width: 100%; max-height: 100%; }
                    @media print { body { -webkit-print-color-adjust: exact; } }
                </style>
            </head>
            <body>${bodyHtml}</body>
            </html>
        `;

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) return;

        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();

        setTimeout(() => {
            try {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
            } catch (e) {
                console.error('Barcode print failed:', e);
            }
            setTimeout(() => document.body.removeChild(iframe), 1000);
        }, 500);
    };

    const previewScale = 4;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Print Barcode Labels</DialogTitle>
                    <DialogDescription>
                        {products.length} product(s) · {totalLabels} label(s) total
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-3">
                    {/* ── Top: Label Preview ── */}
                    <div className="flex items-center justify-center bg-muted/30 rounded-md p-3 shrink-0">
                        {selectedProduct && (
                            <BarcodeLabel
                                product={selectedProduct}
                                settings={settings}
                                scale={previewScale}
                            />
                        )}
                    </div>
                    <div className="text-[10px] text-muted-foreground text-center -mt-2">
                        {selectedProduct?.name} · {settings.labelWidth}×{settings.labelHeight}mm · ×{productCounts[selectedIndex] || 1}
                    </div>

                    {/* ── Bottom: Product Table ── */}
                    <div className="flex-1 min-h-0 overflow-auto border rounded-md">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 sticky top-0">
                                <tr>
                                    <th className="px-2 py-1.5 w-8">
                                        <div className="flex items-center justify-center h-full">
                                            <Checkbox
                                                checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                                                onCheckedChange={v => toggleAll(v as boolean)}
                                                className="h-3.5 w-3.5"
                                            />
                                        </div>
                                    </th>
                                    <th className="text-left px-2 py-1.5 text-xs font-medium w-8">#</th>
                                    <th className="text-left px-2 py-1.5 text-xs font-medium">Code</th>
                                    <th className="text-left px-2 py-1.5 text-xs font-medium">Product</th>
                                    <th className="text-center px-2 py-1.5 text-xs font-medium w-20">Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product, idx) => (
                                    <tr
                                        key={idx}
                                        className={`cursor-pointer border-b transition-colors ${
                                            idx === selectedIndex
                                                ? 'bg-primary/10'
                                                : 'hover:bg-muted/30'
                                        }`}
                                        onClick={() => setSelectedIndex(idx)}
                                    >
                                        <td className="px-2 py-1.5">
                                            <div className="flex items-center justify-center h-full">
                                                <Checkbox
                                                    checked={checkedProducts.has(idx)}
                                                    onCheckedChange={() => toggleProduct(idx)}
                                                    onClick={e => e.stopPropagation()}
                                                    className="h-3.5 w-3.5"
                                                />
                                            </div>
                                        </td>
                                        <td className="px-2 py-1.5 text-xs text-muted-foreground">{idx + 1}</td>
                                        <td className="px-2 py-1.5 text-xs font-mono">{product.code}</td>
                                        <td className="px-2 py-1.5 text-xs truncate max-w-[200px]">{product.name}</td>
                                        <td className="px-2 py-1.5 text-center">
                                            <Input
                                                type="number"
                                                min={1}
                                                max={999}
                                                value={productCounts[idx] || 1}
                                                onChange={e => updateCount(idx, parseInt(e.target.value) || 1)}
                                                onClick={e => e.stopPropagation()}
                                                className="h-6 w-16 text-xs text-center mx-auto"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="flex items-center justify-between pt-3 border-t">
                    <div className="text-xs text-muted-foreground">
                        Total: {totalLabels} label(s) to print
                    </div>
                    <Button onClick={handlePrint} disabled={checkedProducts.size === 0}>
                        <IconPrinter size={16} className="mr-2" />
                        Print Labels
                    </Button>
                </div>

                {/* Hidden ref for print - not used anymore since we build HTML directly */}
                <div ref={printRef} className="hidden" />
            </DialogContent>
        </Dialog>
    );
}

// ── Helper: get display text for an element ──
function getElementText(element: LabelElement, product: Product): string {
    if (element.type === 'barcode') return '';
    switch (element.dataField) {
        case 'product.code': return product.code;
        case 'product.name': return product.name;
        case 'product.salesRate': return `₹ ${product.salesRate?.toFixed(2)}`;
        case 'product.mrp': return `MRP ₹ ${(product.mrp || product.salesRate)?.toFixed(2)}`;
        default: return element.content || '';
    }
}

// ── Single barcode label preview ──

function BarcodeLabel({ product, settings, scale }: { product: Product; settings: BarcodeDesignerSettings; scale: number }) {
    const { labelWidth, labelHeight, elements, barcodeFormat } = settings;

    return (
        <div
            className="bg-white border rounded shadow-sm relative text-black"
            style={{
                width: `${labelWidth * scale}px`,
                height: `${labelHeight * scale}px`,
                minWidth: `${labelWidth * scale}px`,
            }}
        >
            {elements.filter(el => el.enabled).map(el => (
                <LabelElementRenderer
                    key={el.id}
                    element={el}
                    product={product}
                    scale={scale}
                    barcodeFormat={barcodeFormat}
                />
            ))}
        </div>
    );
}

// ── Renders a single element at absolute position (preview) ──

function LabelElementRenderer({
    element,
    product,
    scale,
    barcodeFormat,
}: {
    element: LabelElement;
    product: Product;
    scale: number;
    barcodeFormat: string;
}) {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (element.type === 'barcode' && svgRef.current && product.code) {
            try {
                JsBarcode(svgRef.current, product.code, {
                    format: barcodeFormat === 'EAN13' ? 'EAN13' : 'CODE128',
                    width: element.barcodeLineWidth || 1.5,
                    height: element.barcodeHeight || 30,
                    displayValue: element.showBarcodeText || false,
                    margin: 0,
                    fontSize: (element.fontSize || 7) * 1.5,
                });
            } catch (error) {
                console.error('Failed to generate barcode:', error);
            }
        }
    }, [product.code, barcodeFormat, element]);

    const displayText = getElementText(element, product);

    return (
        <div
            style={{
                position: 'absolute',
                left: `${element.x * scale}px`,
                top: `${element.y * scale}px`,
                width: `${element.width * scale}px`,
                height: `${element.height * scale}px`,
                fontFamily: element.fontFamily,
                fontSize: `${element.fontSize * 1.3}px`,
                fontWeight: element.fontWeight,
                textAlign: element.textAlign,
                display: 'flex',
                alignItems: 'center',
                justifyContent: element.textAlign === 'left' ? 'flex-start' : element.textAlign === 'right' ? 'flex-end' : 'center',
                overflow: 'hidden',
                lineHeight: 1.1,
            }}
        >
            {element.type === 'barcode' ? (
                <svg ref={svgRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
            ) : (
                <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    width: '100%',
                }}>
                    {displayText}
                </span>
            )}
        </div>
    );
}
