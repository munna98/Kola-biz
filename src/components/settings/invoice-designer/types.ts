// ============= INVOICE DESIGNER TYPES =============

export type ElementType = 'text' | 'field' | 'image' | 'table' | 'divider' | 'totals' | 'shape';

export interface ElementStyles {
    fontFamily?: string;
    fontSize?: number;        // pt
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
    textDecoration?: 'none' | 'underline';
    color?: string;           // hex
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    border?: string;          // CSS shorthand e.g. "1px solid #000"
    borderRadius?: number;    // px
    padding?: number;         // mm
    lineHeight?: number;
    letterSpacing?: number;
    textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
    opacity?: number;
}

export interface TableColumn {
    key: string;              // data field key e.g. "product_name"
    label: string;            // column header label
    width: number;            // percentage width
    align: 'left' | 'center' | 'right';
    format?: 'text' | 'currency' | 'number' | 'date';
}

export interface TableConfig {
    columns: TableColumn[];
    showHeader: boolean;
    showSerialNo: boolean;
    headerBg?: string;
    headerColor?: string;
    headerFontSize?: number;
    bodyFontSize?: number;
    stripedRows?: boolean;
    stripedColor?: string;
    borderStyle?: 'full' | 'horizontal' | 'none';
    rowHeight?: number;       // mm
}

export interface TotalsConfig {
    rows: { label: string; field: string; format: 'currency' | 'text'; bold?: boolean }[];
    labelAlign?: 'left' | 'right';
    valueAlign?: 'right';
    showBorder?: boolean;
}

export interface DesignerElement {
    id: string;
    type: ElementType;
    x: number;                // mm from left
    y: number;                // mm from top
    width: number;            // mm
    height: number;           // mm

    // Content
    content?: string;         // static text content
    fieldBinding?: string;    // data field path e.g. "company.name"

    // Styles
    styles: ElementStyles;

    // Type-specific config
    tableConfig?: TableConfig;
    totalsConfig?: TotalsConfig;

    // Image-specific
    imageType?: 'logo' | 'custom';

    // Divider-specific
    dividerStyle?: 'solid' | 'dashed' | 'dotted' | 'double';
    dividerColor?: string;
    dividerThickness?: number;

    // Shape-specific
    shapeType?: 'rectangle' | 'rounded-rect';

    // Metadata
    label?: string;           // friendly label shown in element list
    locked?: boolean;
    visible?: boolean;
    zIndex?: number;
}

export interface PageSetup {
    width: number;             // mm (A4 = 210, Thermal 80mm = 80)
    height: number;            // mm (A4 = 297, Thermal = auto)
    margins: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
}

export interface GlobalStyles {
    fontFamily: string;
    fontSize: number;
    color: string;
    backgroundColor: string;
}

export interface TemplateDesign {
    version: 1;
    pageSize: PageSetup;
    elements: DesignerElement[];
    globalStyles: GlobalStyles;
}

// ============= DATA FIELD TYPES =============

export interface DataField {
    key: string;               // e.g. "company.name"
    label: string;             // e.g. "Company Name"
    example: string;           // e.g. "Acme Corp"
    format?: 'text' | 'currency' | 'number' | 'date';
}

export interface DataFieldCategory {
    name: string;
    icon: string;              // tabler icon name
    fields: DataField[];
}

// ============= PRESET TEMPLATES =============

export interface ElementPreset {
    name: string;
    description: string;
    elements: Omit<DesignerElement, 'id'>[];
}

// ============= DESIGNER STATE =============

export interface DesignerState {
    design: TemplateDesign;
    selectedElementIds: string[];
    zoom: number;              // 0.5 to 2.0
    isDirty: boolean;
    showGrid: boolean;
    snapToGrid: boolean;
    gridSize: number;          // mm
}

// ============= PAGE PRESETS =============

export const PAGE_PRESETS = {
    a4_portrait: { width: 210, height: 297, margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    a4_landscape: { width: 297, height: 210, margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    thermal_80mm: { width: 80, height: 200, margins: { top: 3, right: 3, bottom: 3, left: 3 } },
    thermal_58mm: { width: 58, height: 200, margins: { top: 3, right: 3, bottom: 3, left: 3 } },
} as const;

export const DEFAULT_GLOBAL_STYLES: GlobalStyles = {
    fontFamily: 'Arial, sans-serif',
    fontSize: 10,
    color: '#000000',
    backgroundColor: '#ffffff',
};

export const FONT_FAMILIES = [
    'Arial, sans-serif',
    'Helvetica, sans-serif',
    'Times New Roman, serif',
    'Georgia, serif',
    'Courier New, monospace',
    'Verdana, sans-serif',
    'Tahoma, sans-serif',
    'Trebuchet MS, sans-serif',
    'Roboto, sans-serif',
    'Inter, sans-serif',
] as const;
