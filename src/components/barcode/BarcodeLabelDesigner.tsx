import { useRef, useEffect, useState, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import JsBarcode from 'jsbarcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconGripVertical, IconRefresh } from '@tabler/icons-react';

// ── Types ──

export interface LabelElement {
    id: string;
    label: string;
    type: 'text' | 'barcode';
    enabled: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    fontFamily: string;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    textAlign: 'left' | 'center' | 'right';
    barcodeLineWidth?: number;
    barcodeHeight?: number;
    showBarcodeText?: boolean;
    content?: string;
    dataField?: string;
}

export interface BarcodeDesignerSettings {
    labelWidth: number;
    labelHeight: number;
    labelPadding: number;
    barcodeFormat: 'CODE128' | 'EAN13' | 'QR';
    barcodePrinter?: string;
    elements: LabelElement[];
    // ── Multi-column roll layout ──
    columnsPerRow: number;      // how many labels fit across the roll (1 = single column)
    horizontalGap: number;      // mm gap between labels in the same row
    verticalGap: number;        // mm gap between rows
}

// ── Defaults ──

const FONTS = ['Arial', 'Helvetica', 'Courier New', 'Times New Roman', 'Verdana', 'Georgia'];

export function buildDefaultElements(companyName?: string, customText?: string): LabelElement[] {
    return [
        {
            id: 'companyName', label: 'Company Name', type: 'text', enabled: true,
            x: 2, y: 1, width: 46, height: 4,
            fontFamily: 'Arial', fontSize: 7, fontWeight: 'bold', textAlign: 'center',
            content: companyName || '', dataField: undefined,
        },
        {
            id: 'barcode', label: 'Barcode', type: 'barcode', enabled: true,
            x: 5, y: 5, width: 40, height: 10,
            fontFamily: 'Arial', fontSize: 7, fontWeight: 'normal', textAlign: 'center',
            barcodeLineWidth: 1.5, barcodeHeight: 30, showBarcodeText: false,
        },
        {
            id: 'productCode', label: 'Product Code', type: 'text', enabled: true,
            x: 2, y: 15.5, width: 46, height: 3,
            fontFamily: 'Arial', fontSize: 8, fontWeight: 'bold', textAlign: 'center',
            dataField: 'product.code',
        },
        {
            id: 'productName', label: 'Product Name', type: 'text', enabled: true,
            x: 2, y: 18.5, width: 46, height: 3,
            fontFamily: 'Arial', fontSize: 6, fontWeight: 'normal', textAlign: 'center',
            dataField: 'product.name',
        },
        {
            id: 'salesRate', label: 'Sales Rate', type: 'text', enabled: true,
            x: 2, y: 21, width: 46, height: 3,
            fontFamily: 'Arial', fontSize: 7, fontWeight: 'bold', textAlign: 'center',
            dataField: 'product.salesRate',
        },
        {
            id: 'mrp', label: 'MRP', type: 'text', enabled: false,
            x: 2, y: 21, width: 46, height: 3,
            fontFamily: 'Arial', fontSize: 7, fontWeight: 'bold', textAlign: 'center',
            dataField: 'product.mrp',
        },
        {
            id: 'customText1', label: 'Custom Text 1', type: 'text', enabled: false,
            x: 2, y: 23, width: 46, height: 2.5,
            fontFamily: 'Arial', fontSize: 5, fontWeight: 'normal', textAlign: 'center',
            content: customText || '',
        },
        {
            id: 'customText2', label: 'Custom Text 2', type: 'text', enabled: false,
            x: 2, y: 23, width: 46, height: 2.5,
            fontFamily: 'Arial', fontSize: 5, fontWeight: 'normal', textAlign: 'center',
            content: '',
        },
    ];
}

export const DEFAULT_DESIGNER_SETTINGS: BarcodeDesignerSettings = {
    labelWidth: 50,
    labelHeight: 25,
    labelPadding: 1,
    barcodeFormat: 'CODE128',
    elements: buildDefaultElements(),
    columnsPerRow: 1,
    horizontalGap: 0,
    verticalGap: 0,
};

// ── Migrate old settings ──

interface OldBarcodeSettings {
    companyName?: string;
    showProductName?: boolean;
    showSalesRate?: boolean;
    customText?: string;
    barcodeFormat?: string;
    labelSize?: string;
    barcodePrinter?: string;
    // New format detection
    elements?: LabelElement[];
    labelWidth?: number;
}

const OLD_LABEL_DIMS: Record<string, { width: number; height: number }> = {
    '50x25': { width: 50, height: 25 },
    '40x25': { width: 40, height: 25 },
    '40x20': { width: 40, height: 20 },
    '30x15': { width: 30, height: 15 },
};

export function migrateSettings(old: OldBarcodeSettings): BarcodeDesignerSettings {
    // Already new format
    if (old.elements && old.labelWidth) {
        return old as BarcodeDesignerSettings;
    }

    const dims = OLD_LABEL_DIMS[old.labelSize || '50x25'] || { width: 50, height: 25 };
    const elements = buildDefaultElements(old.companyName, old.customText);

    // Apply old toggles
    const nameEl = elements.find(e => e.id === 'productName');
    if (nameEl) nameEl.enabled = old.showProductName !== false;
    const rateEl = elements.find(e => e.id === 'salesRate');
    if (rateEl) rateEl.enabled = old.showSalesRate !== false;
    const compEl = elements.find(e => e.id === 'companyName');
    if (compEl) compEl.enabled = !!old.companyName;

    return {
        labelWidth: dims.width,
        labelHeight: dims.height,
        labelPadding: 1,
        barcodeFormat: (old.barcodeFormat as BarcodeDesignerSettings['barcodeFormat']) || 'CODE128',
        barcodePrinter: old.barcodePrinter,
        elements,
        columnsPerRow: (old as any).columnsPerRow || 1,
        horizontalGap: (old as any).horizontalGap || 0,
        verticalGap: (old as any).verticalGap || 0,
    };
}

// ── Scale factor: mm → px for the canvas ──
const SCALE = 4; // 1mm = 4px on canvas

// ── Sample data for preview ──
const SAMPLE_PRODUCT = {
    code: '100001',
    name: 'Sample Product',
    salesRate: 999.00,
    mrp: 1099.00,
};

// ── Component ──

interface BarcodeLabelDesignerProps {
    settings: BarcodeDesignerSettings;
    onChange: (settings: BarcodeDesignerSettings) => void;
}

export default function BarcodeLabelDesigner({ settings, onChange }: BarcodeLabelDesignerProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    const selectedElement = settings.elements.find(e => e.id === selectedId) || null;

    const updateElement = useCallback((id: string, updates: Partial<LabelElement>) => {
        onChange({
            ...settings,
            elements: settings.elements.map(el =>
                el.id === id ? { ...el, ...updates } : el
            ),
        });
    }, [settings, onChange]);

    // ── Arrow key handler for fine positioning ──
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!selectedId) return;
            const el = settings.elements.find(el => el.id === selectedId);
            if (!el) return;

            const step = e.shiftKey ? 0.1 : 0.5; // Shift = fine 0.1mm, normal = 0.5mm
            let updates: Partial<LabelElement> | null = null;

            switch (e.key) {
                case 'ArrowLeft':
                    updates = { x: Math.max(0, Math.round((el.x - step) * 10) / 10) };
                    break;
                case 'ArrowRight':
                    updates = { x: Math.round((el.x + step) * 10) / 10 };
                    break;
                case 'ArrowUp':
                    updates = { y: Math.max(0, Math.round((el.y - step) * 10) / 10) };
                    break;
                case 'ArrowDown':
                    updates = { y: Math.round((el.y + step) * 10) / 10 };
                    break;
            }

            if (updates) {
                e.preventDefault();
                updateElement(selectedId, updates);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId, settings.elements, updateElement]);

    const handleReset = () => {
        onChange({
            ...DEFAULT_DESIGNER_SETTINGS,
            barcodePrinter: settings.barcodePrinter,
        });
        setSelectedId(null);
    };

    const canvasW = settings.labelWidth * SCALE;
    const canvasH = settings.labelHeight * SCALE;

    return (
        <div className="flex gap-4 h-full min-h-0">
            {/* ── Left: Canvas ── */}
            <div className="flex-1 flex flex-col items-center gap-3 min-w-0">
                <div className="text-xs text-muted-foreground">
                    Canvas ({settings.labelWidth}mm × {settings.labelHeight}mm) — click an element to select, drag to reposition
                </div>
                <div
                    ref={canvasRef}
                    className="relative bg-white border-2 border-dashed border-gray-300 shadow-md rounded"
                    style={{ width: canvasW, height: canvasH, minWidth: canvasW, minHeight: canvasH }}
                    onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
                >
                    {settings.elements.filter(el => el.enabled).map(el => (
                        <DesignerElement
                            key={el.id}
                            element={el}
                            selected={el.id === selectedId}
                            scale={SCALE}
                            barcodeFormat={settings.barcodeFormat}
                            onSelect={() => setSelectedId(el.id)}
                            onUpdate={(updates) => updateElement(el.id, updates)}
                        />
                    ))}
                </div>

                {/* Label dimensions */}
                <div className="flex items-center gap-3 text-sm">
                    <Label className="text-xs">W:</Label>
                    <Input
                        type="number" min={20} max={120} step={1}
                        value={settings.labelWidth}
                        onChange={e => onChange({ ...settings, labelWidth: Number(e.target.value) || 50 })}
                        className="w-16 h-7 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">mm</span>
                    <Label className="text-xs">H:</Label>
                    <Input
                        type="number" min={10} max={80} step={1}
                        value={settings.labelHeight}
                        onChange={e => onChange({ ...settings, labelHeight: Number(e.target.value) || 25 })}
                        className="w-16 h-7 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">mm</span>
                    <Label className="text-xs">Pad:</Label>
                    <Input
                        type="number" min={0} max={5} step={0.5}
                        value={settings.labelPadding}
                        onChange={e => onChange({ ...settings, labelPadding: Number(e.target.value) || 0 })}
                        className="w-14 h-7 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">mm</span>
                </div>
            </div>

            {/* ── Right: Properties + Element List ── */}
            <div className="w-64 shrink-0 flex flex-col gap-3 overflow-y-auto">
                {/* Properties panel */}
                {selectedElement ? (
                    <div className="bg-card border rounded-lg p-3 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold">{selectedElement.label}</h4>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleReset} title="Reset all">
                                <IconRefresh size={14} />
                            </Button>
                        </div>

                        {/* Content (for static text) */}
                        {selectedElement.type === 'text' && !selectedElement.dataField && (
                            <div className="space-y-1">
                                <Label className="text-xs">Content</Label>
                                <Input
                                    value={selectedElement.content || ''}
                                    onChange={e => updateElement(selectedElement.id, { content: e.target.value })}
                                    className="h-7 text-xs"
                                    placeholder="Enter text..."
                                />
                            </div>
                        )}

                        {/* Font family */}
                        <div className="space-y-1">
                            <Label className="text-xs">Font</Label>
                            <Select value={selectedElement.fontFamily} onValueChange={v => updateElement(selectedElement.id, { fontFamily: v })}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {FONTS.map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Font size + weight */}
                        <div className="flex gap-2">
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs">Size (pt)</Label>
                                <Input type="number" min={4} max={24} step={0.5}
                                    value={selectedElement.fontSize}
                                    onChange={e => updateElement(selectedElement.id, { fontSize: Number(e.target.value) || 7 })}
                                    className="h-7 text-xs"
                                />
                            </div>
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs">Weight</Label>
                                <Select value={selectedElement.fontWeight} onValueChange={v => updateElement(selectedElement.id, { fontWeight: v as 'normal' | 'bold' })}>
                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="normal" className="text-xs">Normal</SelectItem>
                                        <SelectItem value="bold" className="text-xs">Bold</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Text align */}
                        <div className="space-y-1">
                            <Label className="text-xs">Align</Label>
                            <div className="flex gap-1">
                                {(['left', 'center', 'right'] as const).map(a => (
                                    <Button key={a} variant={selectedElement.textAlign === a ? 'default' : 'outline'}
                                        size="sm" className="h-7 flex-1 text-xs px-0"
                                        onClick={() => updateElement(selectedElement.id, { textAlign: a })}
                                    >
                                        {a === 'left' ? 'L' : a === 'center' ? 'C' : 'R'}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Position X/Y */}
                        <div className="flex gap-2">
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs">X (mm)</Label>
                                <Input type="number" min={0} step={0.5}
                                    value={selectedElement.x}
                                    onChange={e => updateElement(selectedElement.id, { x: Number(e.target.value) || 0 })}
                                    className="h-7 text-xs"
                                />
                            </div>
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs">Y (mm)</Label>
                                <Input type="number" min={0} step={0.5}
                                    value={selectedElement.y}
                                    onChange={e => updateElement(selectedElement.id, { y: Number(e.target.value) || 0 })}
                                    className="h-7 text-xs"
                                />
                            </div>
                        </div>

                        {/* Size W/H */}
                        <div className="flex gap-2">
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs">W (mm)</Label>
                                <Input type="number" min={3} step={0.5}
                                    value={selectedElement.width}
                                    onChange={e => updateElement(selectedElement.id, { width: Number(e.target.value) || 10 })}
                                    className="h-7 text-xs"
                                />
                            </div>
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs">H (mm)</Label>
                                <Input type="number" min={2} step={0.5}
                                    value={selectedElement.height}
                                    onChange={e => updateElement(selectedElement.id, { height: Number(e.target.value) || 4 })}
                                    className="h-7 text-xs"
                                />
                            </div>
                        </div>

                        {/* Barcode-specific */}
                        {selectedElement.type === 'barcode' && (
                            <>
                                <div className="flex gap-2">
                                    <div className="flex-1 space-y-1">
                                        <Label className="text-xs">Line Width</Label>
                                        <Input type="number" min={0.5} max={4} step={0.25}
                                            value={selectedElement.barcodeLineWidth || 1.5}
                                            onChange={e => updateElement(selectedElement.id, { barcodeLineWidth: Number(e.target.value) || 1.5 })}
                                            className="h-7 text-xs"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <Label className="text-xs">Bar Height</Label>
                                        <Input type="number" min={10} max={80} step={5}
                                            value={selectedElement.barcodeHeight || 30}
                                            onChange={e => updateElement(selectedElement.id, { barcodeHeight: Number(e.target.value) || 30 })}
                                            className="h-7 text-xs"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="showBarcodeText"
                                        checked={selectedElement.showBarcodeText || false}
                                        onCheckedChange={v => updateElement(selectedElement.id, { showBarcodeText: v as boolean })}
                                    />
                                    <label htmlFor="showBarcodeText" className="text-xs">Show text under barcode</label>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="bg-card border rounded-lg p-3 text-xs text-muted-foreground text-center">
                        Click an element on the canvas to edit its properties
                    </div>
                )}

                {/* Element list */}
                <div className="bg-card border rounded-lg p-3 space-y-1.5">
                    <h4 className="text-sm font-semibold mb-2">Elements</h4>
                    {settings.elements.map(el => (
                        <div
                            key={el.id}
                            className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
                                el.id === selectedId
                                    ? 'bg-primary/10 border border-primary/30'
                                    : 'hover:bg-muted/50'
                            }`}
                            onClick={() => setSelectedId(el.id)}
                        >
                            <Checkbox
                                checked={el.enabled}
                                onCheckedChange={v => updateElement(el.id, { enabled: v as boolean })}
                                onClick={e => e.stopPropagation()}
                                className="h-3.5 w-3.5"
                            />
                            <IconGripVertical size={12} className="text-muted-foreground/50" />
                            <span className={el.enabled ? '' : 'text-muted-foreground line-through'}>{el.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ── Individual canvas element (Rnd wrapper) ──

interface DesignerElementProps {
    element: LabelElement;
    selected: boolean;
    scale: number;
    barcodeFormat: string;
    onSelect: () => void;
    onUpdate: (updates: Partial<LabelElement>) => void;
}

function DesignerElement({ element, selected, scale, barcodeFormat, onSelect, onUpdate }: DesignerElementProps) {
    const svgRef = useRef<SVGSVGElement>(null);

    // Render barcode
    useEffect(() => {
        if (element.type === 'barcode' && svgRef.current) {
            try {
                JsBarcode(svgRef.current, SAMPLE_PRODUCT.code, {
                    format: barcodeFormat === 'EAN13' ? 'EAN13' : 'CODE128',
                    width: element.barcodeLineWidth || 1.5,
                    height: element.barcodeHeight || 30,
                    displayValue: element.showBarcodeText || false,
                    margin: 0,
                    fontSize: (element.fontSize || 7) * 1.5,
                });
            } catch {
                // ignore barcode errors in preview
            }
        }
    }, [element, barcodeFormat]);

    const getDisplayText = () => {
        if (element.type === 'barcode') return null;
        switch (element.dataField) {
            case 'product.code': return SAMPLE_PRODUCT.code;
            case 'product.name': return SAMPLE_PRODUCT.name;
            case 'product.salesRate': return `₹ ${SAMPLE_PRODUCT.salesRate.toFixed(2)}`;
            case 'product.mrp': return `MRP ₹ ${SAMPLE_PRODUCT.mrp.toFixed(2)}`;
            default: return element.content || null; // null = show placeholder
        }
    };

    const displayText = getDisplayText();
    const isEmpty = displayText === null && element.type === 'text' && !element.dataField;

    return (
        <Rnd
            size={{ width: element.width * scale, height: element.height * scale }}
            position={{ x: element.x * scale, y: element.y * scale }}
            onDragStop={(_e, d) => {
                onUpdate({
                    x: Math.round((d.x / scale) * 2) / 2,
                    y: Math.round((d.y / scale) * 2) / 2,
                });
            }}
            onResizeStop={(_e, _dir, ref, _delta, position) => {
                onUpdate({
                    width: Math.round((parseInt(ref.style.width) / scale) * 2) / 2,
                    height: Math.round((parseInt(ref.style.height) / scale) * 2) / 2,
                    x: Math.round((position.x / scale) * 2) / 2,
                    y: Math.round((position.y / scale) * 2) / 2,
                });
            }}
            bounds="parent"
            minWidth={3 * scale}
            minHeight={2 * scale}
            onMouseDown={onSelect}
            enableResizing={selected}
            className={`${selected ? 'ring-2 ring-blue-500 ring-offset-1' : 'border border-transparent hover:border-blue-300'}`}
            style={{ zIndex: selected ? 10 : 1 }}
        >
            <div
                className="w-full h-full flex items-center overflow-hidden cursor-move"
                style={{
                    justifyContent: element.textAlign === 'left' ? 'flex-start' : element.textAlign === 'right' ? 'flex-end' : 'center',
                    fontFamily: element.fontFamily,
                    fontSize: `${element.fontSize * 1.3}px`,
                    fontWeight: element.fontWeight,
                    textAlign: element.textAlign,
                    color: '#000',
                    lineHeight: 1.1,
                }}
            >
                {element.type === 'barcode' ? (
                    <svg ref={svgRef} className="max-w-full max-h-full" />
                ) : isEmpty ? (
                    <span className="truncate w-full px-0.5 italic opacity-40">{element.label}</span>
                ) : (
                    <span className="truncate w-full px-0.5">{displayText}</span>
                )}
            </div>
        </Rnd>
    );
}
