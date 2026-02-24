import { useRef, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import { DesignerElement as DesignerElementType } from './types';
import { getFieldByKey } from './DataFieldCatalog';

interface DesignerCanvasProps {
    elements: DesignerElementType[];
    selectedElementIds: string[];
    zoom: number;
    pageWidth: number;     // mm
    pageHeight: number;    // mm
    margins: { top: number; right: number; bottom: number; left: number };
    showGrid: boolean;
    snapToGrid: boolean;
    gridSize: number;
    globalStyles: { fontFamily: string; fontSize: number; color: string; backgroundColor: string };
    onSelectElement: (id: string, addToSelection?: boolean) => void;
    onClearSelection: () => void;
    onUpdateElement: (id: string, changes: Partial<DesignerElementType>) => void;
    onDeleteSelected: () => void;
}

// Conversion: mm to px at 96dpi (1mm ≈ 3.7795px)
const MM_TO_PX = 3.7795;

function mmToPx(mm: number): number {
    return mm * MM_TO_PX;
}

function pxToMm(px: number): number {
    return px / MM_TO_PX;
}

// ============= ELEMENT CONTENT RENDERER =============

function renderElementContent(element: DesignerElementType, globalStyles: DesignerCanvasProps['globalStyles']) {
    const effectiveStyles: React.CSSProperties = {
        fontFamily: element.styles.fontFamily || globalStyles.fontFamily,
        fontSize: `${element.styles.fontSize || globalStyles.fontSize}pt`,
        fontWeight: element.styles.fontWeight || 'normal',
        fontStyle: element.styles.fontStyle || 'normal',
        color: element.styles.color || globalStyles.color,
        backgroundColor: element.styles.backgroundColor || 'transparent',
        textAlign: element.styles.textAlign || 'left',
        lineHeight: element.styles.lineHeight || 1.4,
        letterSpacing: element.styles.letterSpacing ? `${element.styles.letterSpacing}px` : undefined,
        textTransform: element.styles.textTransform || 'none',
        textDecoration: element.styles.textDecoration || 'none',
        padding: element.styles.padding ? `${mmToPx(element.styles.padding)}px` : '0',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
        border: element.styles.border || 'none',
        borderRadius: element.styles.borderRadius ? `${element.styles.borderRadius}px` : undefined,
    };

    switch (element.type) {
        case 'text':
            return (
                <div style={effectiveStyles} className="whitespace-pre-wrap">
                    {element.content || 'Text'}
                </div>
            );

        case 'field': {
            const field = element.fieldBinding ? getFieldByKey(element.fieldBinding) : null;
            return (
                <div style={effectiveStyles}>
                    <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 border border-blue-300 font-medium"
                        style={{ fontSize: '10px' }}
                    >
                        {field ? field.label : element.fieldBinding || 'Select Field'}
                    </span>
                </div>
            );
        }

        case 'image':
            return (
                <div
                    style={{ ...effectiveStyles, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f8f8', border: '1px dashed #ccc' }}
                >
                    <div className="text-center text-gray-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-1">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="m21 15-5-5L5 21" />
                        </svg>
                        <span className="text-[8px] block">{element.imageType === 'logo' ? 'Logo' : 'Image'}</span>
                    </div>
                </div>
            );

        case 'table': {
            const config = element.tableConfig;
            if (!config) return <div style={effectiveStyles}>Table</div>;
            return (
                <div style={{ ...effectiveStyles, padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: `${config.headerFontSize || 8}pt` }}>
                        {config.showHeader && (
                            <thead>
                                <tr>
                                    {config.columns.map((col, i) => (
                                        <th
                                            key={i}
                                            style={{
                                                backgroundColor: config.headerBg || '#f0f0f0',
                                                color: config.headerColor || '#000',
                                                padding: '2px 3px',
                                                border: config.borderStyle !== 'none' ? '1px solid #ddd' : 'none',
                                                textAlign: col.align,
                                                width: `${col.width}%`,
                                                fontSize: `${config.headerFontSize || 8}pt`,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {col.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {[1, 2, 3].map(row => (
                                <tr key={row} style={{ backgroundColor: config.stripedRows && row % 2 === 0 ? (config.stripedColor || '#f9f9f9') : 'transparent' }}>
                                    {config.columns.map((col, i) => (
                                        <td
                                            key={i}
                                            style={{
                                                padding: '2px 3px',
                                                border: config.borderStyle === 'full' ? '1px solid #ddd' : config.borderStyle === 'horizontal' ? '1px solid #eee' : 'none',
                                                borderLeft: config.borderStyle === 'horizontal' ? 'none' : undefined,
                                                borderRight: config.borderStyle === 'horizontal' ? 'none' : undefined,
                                                textAlign: col.align,
                                                fontSize: `${config.bodyFontSize || 8}pt`,
                                                color: '#999',
                                            }}
                                        >
                                            {col.key === 'serial_no' ? row : `{{${col.key}}}`}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        case 'divider':
            return (
                <div style={{ ...effectiveStyles, display: 'flex', alignItems: 'center', padding: 0 }}>
                    <hr
                        style={{
                            width: '100%',
                            border: 'none',
                            borderTop: `${element.dividerThickness || 1}px ${element.dividerStyle || 'solid'} ${element.dividerColor || '#cccccc'}`,
                            margin: 0,
                        }}
                    />
                </div>
            );

        case 'totals': {
            const config = element.totalsConfig;
            if (!config) return <div style={effectiveStyles}>Totals</div>;
            return (
                <div style={{ ...effectiveStyles, padding: element.styles.padding ? `${mmToPx(element.styles.padding)}px` : '2px' }}>
                    <table style={{ width: '100%', fontSize: `${element.styles.fontSize || 10}pt` }}>
                        <tbody>
                            {config.rows.map((row, i) => (
                                <tr key={i}>
                                    <td style={{
                                        textAlign: config.labelAlign || 'right',
                                        padding: '1px 4px',
                                        fontWeight: row.bold ? 'bold' : 'normal',
                                        borderTop: row.bold && config.showBorder ? '1px solid #333' : 'none',
                                    }}>
                                        {row.label}:
                                    </td>
                                    <td style={{
                                        textAlign: 'right',
                                        padding: '1px 4px',
                                        fontWeight: row.bold ? 'bold' : 'normal',
                                        borderTop: row.bold && config.showBorder ? '1px solid #333' : 'none',
                                        width: '40%',
                                    }}>
                                        <span className="text-gray-400">{`{{${row.field}}}`}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        }

        case 'shape':
            return (
                <div
                    style={{
                        ...effectiveStyles,
                        borderRadius: element.shapeType === 'rounded-rect' ? '8px' : (element.styles.borderRadius || 0),
                    }}
                />
            );

        default:
            return <div style={effectiveStyles}>{element.type}</div>;
    }
}

// ============= MAIN CANVAS COMPONENT =============

export default function DesignerCanvas({
    elements,
    selectedElementIds,
    zoom,
    pageWidth,
    pageHeight,
    margins,
    showGrid,
    snapToGrid,
    gridSize,
    globalStyles,
    onSelectElement,
    onClearSelection,
    onUpdateElement,
    onDeleteSelected,
}: DesignerCanvasProps) {
    const canvasRef = useRef<HTMLDivElement>(null);

    const widthPx = mmToPx(pageWidth);
    const heightPx = mmToPx(pageHeight);
    const gridPx = mmToPx(gridSize);

    const snapValue = useCallback(
        (value: number): number => {
            if (!snapToGrid) return value;
            const mmValue = pxToMm(value);
            const snapped = Math.round(mmValue / gridSize) * gridSize;
            return mmToPx(snapped);
        },
        [snapToGrid, gridSize]
    );

    const handleCanvasClick = (e: React.MouseEvent) => {
        if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-grid')) {
            onClearSelection();
        }
    };

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                onDeleteSelected();
            }
            // Arrow key nudging
            const nudgeAmount = e.shiftKey ? 2 : 0.5; // mm
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedElementIds.length > 0) {
                e.preventDefault();
                for (const id of selectedElementIds) {
                    const el = elements.find(el => el.id === id);
                    if (!el || el.locked) continue;
                    switch (e.key) {
                        case 'ArrowUp':
                            onUpdateElement(id, { y: Math.max(0, el.y - nudgeAmount) });
                            break;
                        case 'ArrowDown':
                            onUpdateElement(id, { y: el.y + nudgeAmount });
                            break;
                        case 'ArrowLeft':
                            onUpdateElement(id, { x: Math.max(0, el.x - nudgeAmount) });
                            break;
                        case 'ArrowRight':
                            onUpdateElement(id, { x: el.x + nudgeAmount });
                            break;
                    }
                }
            }
        },
        [onDeleteSelected, selectedElementIds, elements, onUpdateElement]
    );

    return (
        <div
            className="flex-1 overflow-auto bg-[#e8e8e8] flex items-start justify-center p-8"
            onKeyDown={handleKeyDown}
            tabIndex={0}
        >
            <div
                style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.15s ease',
                }}
            >
                {/* A4 Paper */}
                <div
                    ref={canvasRef}
                    className="relative shadow-xl"
                    style={{
                        width: `${widthPx}px`,
                        height: `${heightPx}px`,
                        backgroundColor: globalStyles.backgroundColor || '#fff',
                        backgroundImage: showGrid
                            ? `
                  linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)
                `
                            : 'none',
                        backgroundSize: showGrid ? `${gridPx}px ${gridPx}px` : undefined,
                    }}
                    onClick={handleCanvasClick}
                >
                    {/* Margin guides */}
                    <div
                        className="absolute pointer-events-none"
                        style={{
                            top: `${mmToPx(margins.top)}px`,
                            left: `${mmToPx(margins.left)}px`,
                            right: `${mmToPx(margins.right)}px`,
                            bottom: `${mmToPx(margins.bottom)}px`,
                            border: '1px dashed rgba(59, 130, 246, 0.25)',
                        }}
                    />

                    {/* Elements */}
                    {elements
                        .filter(el => el.visible !== false)
                        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
                        .map(element => {
                            const isSelected = selectedElementIds.includes(element.id);
                            return (
                                <Rnd
                                    key={element.id}
                                    size={{
                                        width: mmToPx(element.width),
                                        height: mmToPx(element.height),
                                    }}
                                    position={{
                                        x: mmToPx(element.x),
                                        y: mmToPx(element.y),
                                    }}
                                    onDragStop={(_e, d) => {
                                        const x = pxToMm(snapToGrid ? snapValue(d.x) : d.x);
                                        const y = pxToMm(snapToGrid ? snapValue(d.y) : d.y);
                                        onUpdateElement(element.id, { x, y });
                                    }}
                                    onResizeStop={(_e, _direction, ref, _delta, position) => {
                                        const width = pxToMm(parseFloat(ref.style.width));
                                        const height = pxToMm(parseFloat(ref.style.height));
                                        const x = pxToMm(position.x);
                                        const y = pxToMm(position.y);
                                        onUpdateElement(element.id, { width, height, x, y });
                                    }}
                                    onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        onSelectElement(element.id, e.shiftKey);
                                    }}
                                    bounds="parent"
                                    minWidth={mmToPx(5)}
                                    minHeight={mmToPx(3)}
                                    dragGrid={snapToGrid ? [gridPx, gridPx] : undefined}
                                    resizeGrid={snapToGrid ? [gridPx, gridPx] : undefined}
                                    disableDragging={element.locked || false}
                                    enableResizing={!element.locked}
                                    style={{
                                        zIndex: element.zIndex || 1,
                                        outline: isSelected ? '2px solid #3b82f6' : 'none',
                                        outlineOffset: '1px',
                                        cursor: element.locked ? 'default' : 'move',
                                    }}
                                    className={`${isSelected ? 'ring-1 ring-blue-400/30' : 'hover:outline hover:outline-1 hover:outline-gray-300'}`}
                                >
                                    {renderElementContent(element, globalStyles)}
                                </Rnd>
                            );
                        })}
                </div>
            </div>
        </div>
    );
}
