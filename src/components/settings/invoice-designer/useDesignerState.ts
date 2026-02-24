import { useState, useCallback, useRef } from 'react';
import {
    DesignerElement,
    TemplateDesign,
    DesignerState,
    ElementType,
    ElementStyles,
    TableConfig,
    TotalsConfig,
    PageSetup,
    GlobalStyles,
    PAGE_PRESETS,
    DEFAULT_GLOBAL_STYLES,
} from './types';

function generateId(): string {
    return `el_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

// ============= DEFAULT ELEMENTS PER TYPE =============

function getDefaultStyles(type: ElementType): ElementStyles {
    const base: ElementStyles = {
        fontFamily: undefined,  // inherits from global
        fontSize: undefined,
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: undefined,
        backgroundColor: 'transparent',
        textAlign: 'left',
        padding: 1,
        lineHeight: 1.4,
    };

    switch (type) {
        case 'text':
            return { ...base, fontSize: 10 };
        case 'field':
            return { ...base, fontSize: 10 };
        case 'image':
            return { ...base, padding: 0 };
        case 'table':
            return { ...base, padding: 0, fontSize: 9 };
        case 'divider':
            return { ...base, padding: 0 };
        case 'totals':
            return { ...base, fontSize: 10, textAlign: 'right' };
        case 'shape':
            return { ...base, border: '1px solid #000000', padding: 2 };
        default:
            return base;
    }
}

function getDefaultSize(type: ElementType): { width: number; height: number } {
    switch (type) {
        case 'text': return { width: 80, height: 8 };
        case 'field': return { width: 60, height: 7 };
        case 'image': return { width: 30, height: 20 };
        case 'table': return { width: 190, height: 60 };
        case 'divider': return { width: 190, height: 1 };
        case 'totals': return { width: 80, height: 40 };
        case 'shape': return { width: 50, height: 30 };
        default: return { width: 60, height: 10 };
    }
}

function getDefaultTableConfig(): TableConfig {
    return {
        columns: [
            { key: 'serial_no', label: 'S.No', width: 6, align: 'center' },
            { key: 'product_name', label: 'Description', width: 34, align: 'left' },
            { key: 'hsn_code', label: 'HSN', width: 10, align: 'center' },
            { key: 'initial_quantity', label: 'Qty', width: 8, align: 'right', format: 'number' },
            { key: 'rate', label: 'Rate', width: 12, align: 'right', format: 'currency' },
            { key: 'amount', label: 'Amount', width: 14, align: 'right', format: 'currency' },
            { key: 'tax_rate', label: 'Tax %', width: 6, align: 'center', format: 'number' },
            { key: 'total', label: 'Total', width: 10, align: 'right', format: 'currency' },
        ],
        showHeader: true,
        showSerialNo: true,
        headerBg: '#f0f0f0',
        headerColor: '#000000',
        headerFontSize: 9,
        bodyFontSize: 9,
        stripedRows: false,
        borderStyle: 'full',
        rowHeight: 7,
    };
}

function getDefaultTotalsConfig(): TotalsConfig {
    return {
        rows: [
            { label: 'Subtotal', field: 'subtotal', format: 'currency' },
            { label: 'Discount', field: 'discount_amount', format: 'currency' },
            { label: 'Tax', field: 'tax_total', format: 'currency' },
            { label: 'Grand Total', field: 'grand_total', format: 'currency', bold: true },
        ],
        labelAlign: 'right',
        showBorder: true,
    };
}

// ============= BLANK DESIGN =============

export function createBlankDesign(pagePreset: keyof typeof PAGE_PRESETS = 'a4_portrait'): TemplateDesign {
    return {
        version: 1,
        pageSize: { ...PAGE_PRESETS[pagePreset] },
        elements: [],
        globalStyles: { ...DEFAULT_GLOBAL_STYLES },
    };
}

// ============= HOOK =============

export function useDesignerState(initialDesign?: TemplateDesign) {
    const [state, setState] = useState<DesignerState>({
        design: initialDesign || createBlankDesign(),
        selectedElementIds: [],
        zoom: 1,
        isDirty: false,
        showGrid: true,
        snapToGrid: true,
        gridSize: 5, // 5mm grid
    });

    // Undo/redo history
    const historyRef = useRef<TemplateDesign[]>([]);
    const historyIndexRef = useRef(-1);
    const MAX_HISTORY = 50;

    const pushHistory = useCallback((design: TemplateDesign) => {
        const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
        newHistory.push(JSON.parse(JSON.stringify(design)));
        if (newHistory.length > MAX_HISTORY) newHistory.shift();
        historyRef.current = newHistory;
        historyIndexRef.current = newHistory.length - 1;
    }, []);

    // ===== ELEMENT OPERATIONS =====

    const addElement = useCallback((type: ElementType, overrides?: Partial<DesignerElement>) => {
        const size = getDefaultSize(type);
        const margins = state.design.pageSize.margins;
        const contentWidth = state.design.pageSize.width - margins.left - margins.right;

        const newElement: DesignerElement = {
            id: generateId(),
            type,
            x: margins.left + (contentWidth - size.width) / 2, // center horizontally
            y: margins.top + 10, // offset from top
            width: Math.min(size.width, contentWidth),
            height: size.height,
            styles: getDefaultStyles(type),
            visible: true,
            zIndex: state.design.elements.length + 1,
            ...(type === 'text' && { content: 'Text Label', label: 'Text' }),
            ...(type === 'field' && { fieldBinding: 'company.name', label: 'Company Name' }),
            ...(type === 'image' && { imageType: 'logo' as const, label: 'Logo' }),
            ...(type === 'table' && { tableConfig: getDefaultTableConfig(), label: 'Items Table' }),
            ...(type === 'divider' && { dividerStyle: 'solid' as const, dividerColor: '#cccccc', dividerThickness: 1, label: 'Divider' }),
            ...(type === 'totals' && { totalsConfig: getDefaultTotalsConfig(), label: 'Totals' }),
            ...(type === 'shape' && { shapeType: 'rectangle' as const, label: 'Box' }),
            ...overrides,
        };

        setState(prev => {
            const newDesign = {
                ...prev.design,
                elements: [...prev.design.elements, newElement],
            };
            pushHistory(newDesign);
            return {
                ...prev,
                design: newDesign,
                selectedElementIds: [newElement.id],
                isDirty: true,
            };
        });

        return newElement.id;
    }, [state.design.pageSize, state.design.elements.length, pushHistory]);

    const updateElement = useCallback((id: string, changes: Partial<DesignerElement>) => {
        setState(prev => {
            const newElements = prev.design.elements.map(el =>
                el.id === id ? { ...el, ...changes } : el
            );
            return {
                ...prev,
                design: { ...prev.design, elements: newElements },
                isDirty: true,
            };
        });
    }, []);

    const updateElementStyles = useCallback((id: string, styleChanges: Partial<ElementStyles>) => {
        setState(prev => {
            const newElements = prev.design.elements.map(el =>
                el.id === id ? { ...el, styles: { ...el.styles, ...styleChanges } } : el
            );
            return {
                ...prev,
                design: { ...prev.design, elements: newElements },
                isDirty: true,
            };
        });
    }, []);

    const deleteElement = useCallback((id: string) => {
        setState(prev => {
            const newDesign = {
                ...prev.design,
                elements: prev.design.elements.filter(el => el.id !== id),
            };
            pushHistory(newDesign);
            return {
                ...prev,
                design: newDesign,
                selectedElementIds: prev.selectedElementIds.filter(eid => eid !== id),
                isDirty: true,
            };
        });
    }, [pushHistory]);

    const deleteSelectedElements = useCallback(() => {
        setState(prev => {
            const newDesign = {
                ...prev.design,
                elements: prev.design.elements.filter(el => !prev.selectedElementIds.includes(el.id)),
            };
            pushHistory(newDesign);
            return {
                ...prev,
                design: newDesign,
                selectedElementIds: [],
                isDirty: true,
            };
        });
    }, [pushHistory]);

    const duplicateElement = useCallback((id: string) => {
        setState(prev => {
            const original = prev.design.elements.find(el => el.id === id);
            if (!original) return prev;

            const dup: DesignerElement = {
                ...JSON.parse(JSON.stringify(original)),
                id: generateId(),
                x: original.x + 5,
                y: original.y + 5,
                label: original.label ? `${original.label} (copy)` : undefined,
                zIndex: prev.design.elements.length + 1,
            };

            const newDesign = {
                ...prev.design,
                elements: [...prev.design.elements, dup],
            };
            pushHistory(newDesign);
            return {
                ...prev,
                design: newDesign,
                selectedElementIds: [dup.id],
                isDirty: true,
            };
        });
    }, [pushHistory]);

    const moveElementToFront = useCallback((id: string) => {
        setState(prev => {
            const maxZ = Math.max(...prev.design.elements.map(el => el.zIndex || 0));
            const newElements = prev.design.elements.map(el =>
                el.id === id ? { ...el, zIndex: maxZ + 1 } : el
            );
            return { ...prev, design: { ...prev.design, elements: newElements }, isDirty: true };
        });
    }, []);

    const moveElementToBack = useCallback((id: string) => {
        setState(prev => {
            const newElements = prev.design.elements.map(el =>
                el.id === id ? { ...el, zIndex: 0 } : { ...el, zIndex: (el.zIndex || 0) + 1 }
            );
            return { ...prev, design: { ...prev.design, elements: newElements }, isDirty: true };
        });
    }, []);

    // ===== SELECTION =====

    const selectElement = useCallback((id: string, addToSelection = false) => {
        setState(prev => ({
            ...prev,
            selectedElementIds: addToSelection
                ? prev.selectedElementIds.includes(id)
                    ? prev.selectedElementIds.filter(eid => eid !== id)
                    : [...prev.selectedElementIds, id]
                : [id],
        }));
    }, []);

    const clearSelection = useCallback(() => {
        setState(prev => ({ ...prev, selectedElementIds: [] }));
    }, []);

    // ===== VIEW =====

    const setZoom = useCallback((zoom: number) => {
        setState(prev => ({ ...prev, zoom: Math.max(0.25, Math.min(2.0, zoom)) }));
    }, []);

    const toggleGrid = useCallback(() => {
        setState(prev => ({ ...prev, showGrid: !prev.showGrid }));
    }, []);

    const toggleSnapToGrid = useCallback(() => {
        setState(prev => ({ ...prev, snapToGrid: !prev.snapToGrid }));
    }, []);

    // ===== GLOBAL STYLES =====

    const updateGlobalStyles = useCallback((changes: Partial<GlobalStyles>) => {
        setState(prev => ({
            ...prev,
            design: { ...prev.design, globalStyles: { ...prev.design.globalStyles, ...changes } },
            isDirty: true,
        }));
    }, []);

    const updatePageSetup = useCallback((changes: Partial<PageSetup>) => {
        setState(prev => ({
            ...prev,
            design: { ...prev.design, pageSize: { ...prev.design.pageSize, ...changes } },
            isDirty: true,
        }));
    }, []);

    // ===== SERIALIZATION =====

    const loadDesign = useCallback((design: TemplateDesign) => {
        historyRef.current = [JSON.parse(JSON.stringify(design))];
        historyIndexRef.current = 0;
        setState(prev => ({
            ...prev,
            design,
            selectedElementIds: [],
            isDirty: false,
        }));
    }, []);

    const getDesign = useCallback((): TemplateDesign => {
        return JSON.parse(JSON.stringify(state.design));
    }, [state.design]);

    const markClean = useCallback(() => {
        setState(prev => ({ ...prev, isDirty: false }));
    }, []);

    // ===== UNDO/REDO =====

    const undo = useCallback(() => {
        if (historyIndexRef.current > 0) {
            historyIndexRef.current--;
            const design = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]));
            setState(prev => ({ ...prev, design, isDirty: true }));
        }
    }, []);

    const redo = useCallback(() => {
        if (historyIndexRef.current < historyRef.current.length - 1) {
            historyIndexRef.current++;
            const design = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]));
            setState(prev => ({ ...prev, design, isDirty: true }));
        }
    }, []);

    const canUndo = historyIndexRef.current > 0;
    const canRedo = historyIndexRef.current < historyRef.current.length - 1;

    // ===== COMPUTED =====

    const selectedElements = state.design.elements.filter(
        el => state.selectedElementIds.includes(el.id)
    );
    const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;

    return {
        // State
        design: state.design,
        elements: state.design.elements,
        selectedElementIds: state.selectedElementIds,
        selectedElement,
        selectedElements,
        zoom: state.zoom,
        isDirty: state.isDirty,
        showGrid: state.showGrid,
        snapToGrid: state.snapToGrid,
        gridSize: state.gridSize,

        // Element operations
        addElement,
        updateElement,
        updateElementStyles,
        deleteElement,
        deleteSelectedElements,
        duplicateElement,
        moveElementToFront,
        moveElementToBack,

        // Selection
        selectElement,
        clearSelection,

        // View
        setZoom,
        toggleGrid,
        toggleSnapToGrid,

        // Global
        updateGlobalStyles,
        updatePageSetup,

        // Serialization
        loadDesign,
        getDesign,
        markClean,

        // Undo/Redo
        undo,
        redo,
        canUndo,
        canRedo,
    };
}
