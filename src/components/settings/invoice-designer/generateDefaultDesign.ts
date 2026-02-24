import {
    TemplateDesign,
    DesignerElement,
    TableColumn,
    PAGE_PRESETS,
    DEFAULT_GLOBAL_STYLES,
} from './types';

/**
 * Template feature flags returned from the backend.
 */
export interface TemplateFeatures {
    template_format: string;
    show_logo: boolean;
    show_company_address: boolean;
    show_party_address: boolean;
    show_gstin: boolean;
    show_item_hsn: boolean;
    show_bank_details: boolean;
    show_signature: boolean;
    show_terms: boolean;
    show_less_column: boolean;
}

let idCounter = 0;
function genId(): string {
    idCounter++;
    return `el_default_${Date.now()}_${idCounter}`;
}

/**
 * Generates a sensible default TemplateDesign from the template's feature flags.
 * Dispatches to thermal or A4 specific generators.
 */
export function generateDefaultDesign(features: TemplateFeatures): TemplateDesign {
    const presetKey = features.template_format as keyof typeof PAGE_PRESETS;
    const pageSize = PAGE_PRESETS[presetKey] || PAGE_PRESETS.a4_portrait;
    const isThermal = pageSize.width < 120;

    if (isThermal) {
        return generateThermalDesign(features, pageSize);
    } else {
        return generateA4Design(features, pageSize);
    }
}

// ============================================================
// THERMAL DESIGN — exact replica of thermal_80mm.html seed
// ============================================================

function generateThermalDesign(
    features: TemplateFeatures,
    pageSize: { width: number; height: number; margins: { top: number; right: number; bottom: number; left: number } }
): TemplateDesign {
    const contentWidth = pageSize.width - pageSize.margins.left - pageSize.margins.right;
    const ml = pageSize.margins.left; // marginLeft shorthand
    const elements: DesignerElement[] = [];
    let y = pageSize.margins.top;

    // ── Logo (centered) ──
    if (features.show_logo) {
        elements.push({
            id: genId(),
            type: 'image',
            x: ml + (contentWidth - 40) / 2, // centered
            y,
            width: 40,
            height: 15,
            styles: { padding: 0, lineHeight: 1.4 },
            imageType: 'logo',
            label: 'Company Logo',
            visible: true,
            zIndex: elements.length + 1,
        });
        y += 16;
    }

    // ── Company Name (centered, 14pt, bold) ──
    elements.push({
        id: genId(),
        type: 'field',
        x: ml,
        y,
        width: contentWidth,
        height: 8,
        fieldBinding: 'company.name',
        label: 'Company Name',
        styles: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', padding: 1, lineHeight: 1.3 },
        visible: true,
        zIndex: elements.length + 1,
    });
    y += 8;

    // ── Company Address (centered, 9pt) ──
    if (features.show_company_address) {
        elements.push({
            id: genId(),
            type: 'field',
            x: ml,
            y,
            width: contentWidth,
            height: 5,
            fieldBinding: 'company.address',
            label: 'Company Address',
            styles: { fontSize: 9, textAlign: 'center', padding: 0, lineHeight: 1.3 },
            visible: true,
            zIndex: elements.length + 1,
        });
        y += 5;
    }

    // ── Phone (centered, 9pt) — "Ph: {{company.phone}}" ──
    elements.push({
        id: genId(),
        type: 'field',
        x: ml,
        y,
        width: contentWidth,
        height: 5,
        fieldBinding: 'company.phone',
        content: 'Ph: ',
        label: 'Phone',
        styles: { fontSize: 9, textAlign: 'center', padding: 0, lineHeight: 1.3 },
        visible: true,
        zIndex: elements.length + 1,
    });
    y += 5;

    // ── GSTIN (centered, 9pt) ──
    if (features.show_gstin) {
        elements.push({
            id: genId(),
            type: 'field',
            x: ml,
            y,
            width: contentWidth,
            height: 5,
            fieldBinding: 'company.gstin',
            content: 'GSTIN: ',
            label: 'GSTIN',
            styles: { fontSize: 9, textAlign: 'center', padding: 0, lineHeight: 1.3 },
            visible: true,
            zIndex: elements.length + 1,
        });
        y += 5;
    }

    // ── Separator (dashed) ──
    elements.push(makeDivider(ml, y, contentWidth, 'dashed', elements.length));
    y += 3;

    // ── Invoice Info: Invoice & Date on same line ──
    elements.push({
        id: genId(),
        type: 'field',
        x: ml,
        y,
        width: contentWidth / 2,
        height: 5,
        fieldBinding: 'voucher_no',
        content: 'Invoice: ',
        label: 'Invoice Number',
        styles: { fontSize: 9, fontWeight: 'bold', padding: 0, lineHeight: 1.3 },
        visible: true,
        zIndex: elements.length + 1,
    });
    elements.push({
        id: genId(),
        type: 'field',
        x: ml + contentWidth / 2,
        y,
        width: contentWidth / 2,
        height: 5,
        fieldBinding: 'voucher_date',
        content: 'Date: ',
        label: 'Invoice Date',
        styles: { fontSize: 9, textAlign: 'right', padding: 0, lineHeight: 1.3 },
        visible: true,
        zIndex: elements.length + 1,
    });
    y += 5;

    // Customer: {{party.name}}
    if (features.show_party_address) {
        elements.push({
            id: genId(),
            type: 'field',
            x: ml,
            y,
            width: contentWidth,
            height: 5,
            fieldBinding: 'party.name',
            content: 'Customer: ',
            label: 'Customer Name',
            styles: { fontSize: 9, padding: 0, lineHeight: 1.3 },
            visible: true,
            zIndex: elements.length + 1,
        });
        y += 5;
    }

    // ── Separator (dashed) ──
    elements.push(makeDivider(ml, y, contentWidth, 'dashed', elements.length));
    y += 3;

    // ── Items Table: Item | Qty | [Less] | Rate | Amt ──
    const tableColumns: TableColumn[] = [
        { key: 'product_name', label: 'Item', width: features.show_less_column ? 35 : 40, align: 'left' },
        { key: 'initial_quantity', label: 'Qty', width: 15, align: 'right' },
    ];
    if (features.show_less_column) {
        tableColumns.push({ key: 'less_quantity', label: 'Less', width: 10, align: 'right' });
    }
    tableColumns.push(
        { key: 'rate', label: 'Rate', width: 20, align: 'right' },
        { key: 'total', label: 'Amt', width: features.show_less_column ? 20 : 25, align: 'right' },
    );

    elements.push({
        id: genId(),
        type: 'table',
        x: ml,
        y,
        width: contentWidth,
        height: 40,
        styles: { fontSize: 9, padding: 0, lineHeight: 1.3 },
        label: 'Items Table',
        tableConfig: {
            columns: tableColumns,
            showHeader: true,
            headerBg: 'transparent',
            headerColor: '#000000',
            headerFontSize: 9,
            bodyFontSize: 9,
            borderStyle: 'none',
            showSerialNo: false,
        },
        visible: true,
        zIndex: elements.length + 1,
    });
    y += 42;

    // ── Separator (dashed) ──
    elements.push(makeDivider(ml, y, contentWidth, 'dashed', elements.length));
    y += 3;

    // ── Totals (Subtotal, Discount, Tax, TOTAL) ──
    elements.push({
        id: genId(),
        type: 'totals',
        x: ml,
        y,
        width: contentWidth,
        height: 30,
        styles: { fontSize: 9, padding: 0, lineHeight: 1.3 },
        label: 'Totals',
        totalsConfig: {
            rows: [
                { label: 'Subtotal', field: 'subtotal', format: 'currency', bold: false },
                { label: 'Discount', field: 'discount_amount', format: 'currency', bold: false },
                { label: 'Tax', field: 'tax_total', format: 'currency', bold: false },
                { label: 'TOTAL', field: 'grand_total', format: 'currency', bold: true },
            ],
            labelAlign: 'left',
            showBorder: true,
        },
        visible: true,
        zIndex: elements.length + 1,
    });
    y += 32;

    // ── Separator (dashed) ──
    elements.push(makeDivider(ml, y, contentWidth, 'dashed', elements.length));
    y += 3;

    // ── Thank You (centered, bold) ──
    elements.push({
        id: genId(),
        type: 'text',
        x: ml,
        y,
        width: contentWidth,
        height: 6,
        content: 'Thank You for Your Business!',
        label: 'Thank You',
        styles: { fontSize: 10, fontWeight: 'bold', textAlign: 'center', padding: 0, lineHeight: 1.3 },
        visible: true,
        zIndex: elements.length + 1,
    });
    y += 7;

    // ── Visit Again (centered, 8pt) ──
    elements.push({
        id: genId(),
        type: 'text',
        x: ml,
        y,
        width: contentWidth,
        height: 5,
        content: 'Visit Again!',
        label: 'Visit Again',
        styles: { fontSize: 8, textAlign: 'center', padding: 0, lineHeight: 1.3 },
        visible: true,
        zIndex: elements.length + 1,
    });

    return {
        version: 1,
        pageSize: { ...pageSize },
        elements,
        globalStyles: {
            ...DEFAULT_GLOBAL_STYLES,
            fontFamily: "'Courier New', 'Courier', monospace",
            fontSize: 11,
        },
    };
}

// Helper to create a dashed/solid divider
function makeDivider(
    x: number, y: number, width: number,
    style: string, zIndex: number
): DesignerElement {
    return {
        id: genId(),
        type: 'divider',
        x, y, width,
        height: 1,
        styles: { padding: 0, lineHeight: 1.4 },
        dividerStyle: style as 'dashed' | 'solid' | 'dotted' | 'double',
        dividerColor: '#000000',
        dividerThickness: 1,
        label: 'Divider',
        visible: true,
        zIndex: zIndex + 1,
    };
}

// ============================================================
// A4 DESIGN — professional invoice layout
// ============================================================

function generateA4Design(
    features: TemplateFeatures,
    pageSize: { width: number; height: number; margins: { top: number; right: number; bottom: number; left: number } }
): TemplateDesign {
    const contentWidth = pageSize.width - pageSize.margins.left - pageSize.margins.right;
    const ml = pageSize.margins.left;
    const elements: DesignerElement[] = [];
    let y = pageSize.margins.top;

    // ── Logo ──
    if (features.show_logo) {
        elements.push({
            id: genId(),
            type: 'image',
            x: ml,
            y,
            width: 30,
            height: 20,
            styles: { padding: 0, lineHeight: 1.4 },
            imageType: 'logo',
            label: 'Company Logo',
            visible: true,
            zIndex: elements.length + 1,
        });
    }

    // ── Company Name ──
    elements.push({
        id: genId(),
        type: 'field',
        x: features.show_logo ? ml + 35 : ml,
        y,
        width: features.show_logo ? contentWidth - 35 : contentWidth,
        height: 12,
        fieldBinding: 'company.name',
        label: 'Company Name',
        styles: { fontSize: 18, fontWeight: 'bold', textAlign: features.show_logo ? 'left' : 'center', padding: 1, lineHeight: 1.4 },
        visible: true,
        zIndex: elements.length + 1,
    });
    y += 13;

    // ── Company Address ──
    if (features.show_company_address) {
        elements.push({
            id: genId(),
            type: 'field',
            x: features.show_logo ? ml + 35 : ml,
            y,
            width: features.show_logo ? contentWidth - 35 : contentWidth,
            height: 8,
            fieldBinding: 'company.address',
            label: 'Company Address',
            styles: { fontSize: 9, textAlign: features.show_logo ? 'left' : 'center', padding: 1, lineHeight: 1.3 },
            visible: true,
            zIndex: elements.length + 1,
        });
        y += 9;
    }

    // ── Phone ──
    elements.push({
        id: genId(),
        type: 'field',
        x: features.show_logo ? ml + 35 : ml,
        y,
        width: features.show_logo ? contentWidth - 35 : contentWidth,
        height: 6,
        fieldBinding: 'company.phone',
        label: 'Company Phone',
        styles: { fontSize: 9, textAlign: features.show_logo ? 'left' : 'center', padding: 1, lineHeight: 1.3 },
        visible: true,
        zIndex: elements.length + 1,
    });
    y += 7;

    // ── GSTIN ──
    if (features.show_gstin) {
        elements.push({
            id: genId(),
            type: 'field',
            x: ml,
            y,
            width: contentWidth,
            height: 6,
            fieldBinding: 'company.gstin',
            label: 'GSTIN',
            styles: { fontSize: 9, textAlign: 'center', padding: 1, lineHeight: 1.3 },
            visible: true,
            zIndex: elements.length + 1,
        });
        y += 7;
    }

    // ── Divider ──
    elements.push(makeDivider(ml, y, contentWidth, 'solid', elements.length));
    y += 3;

    // ── Invoice Number & Date side by side ──
    elements.push({
        id: genId(),
        type: 'field',
        x: ml,
        y,
        width: contentWidth / 2,
        height: 7,
        fieldBinding: 'voucher_no',
        label: 'Invoice Number',
        styles: { fontSize: 10, fontWeight: 'bold', padding: 1, lineHeight: 1.4 },
        visible: true,
        zIndex: elements.length + 1,
    });
    elements.push({
        id: genId(),
        type: 'field',
        x: ml + contentWidth / 2,
        y,
        width: contentWidth / 2,
        height: 7,
        fieldBinding: 'voucher_date',
        label: 'Invoice Date',
        styles: { fontSize: 10, textAlign: 'right', padding: 1, lineHeight: 1.4 },
        visible: true,
        zIndex: elements.length + 1,
    });
    y += 8;

    // ── Party Section ──
    if (features.show_party_address) {
        elements.push({
            id: genId(),
            type: 'text',
            x: ml,
            y,
            width: 20,
            height: 6,
            content: 'Bill To:',
            label: 'Bill To Label',
            styles: { fontSize: 9, fontWeight: 'bold', padding: 1, lineHeight: 1.4 },
            visible: true,
            zIndex: elements.length + 1,
        });
        y += 6;

        elements.push({
            id: genId(),
            type: 'field',
            x: ml,
            y,
            width: contentWidth * 0.5,
            height: 7,
            fieldBinding: 'party.name',
            label: 'Customer Name',
            styles: { fontSize: 10, fontWeight: 'bold', padding: 1, lineHeight: 1.4 },
            visible: true,
            zIndex: elements.length + 1,
        });
        y += 8;

        elements.push({
            id: genId(),
            type: 'field',
            x: ml,
            y,
            width: contentWidth * 0.5,
            height: 12,
            fieldBinding: 'party.address',
            label: 'Customer Address',
            styles: { fontSize: 9, padding: 1, lineHeight: 1.4 },
            visible: true,
            zIndex: elements.length + 1,
        });
        y += 13;
    }

    // ── Divider ──
    elements.push(makeDivider(ml, y, contentWidth, 'solid', elements.length));
    y += 3;

    // ── Items Table ──
    const tableCols: TableColumn[] = [
        { key: 'serial_no', label: 'S.No', width: 6, align: 'center' },
        { key: 'product_name', label: 'Description', width: features.show_item_hsn ? 28 : 34, align: 'left' },
    ];
    if (features.show_item_hsn) {
        tableCols.push({ key: 'hsn_code', label: 'HSN', width: 10, align: 'center' });
    }
    tableCols.push(
        { key: 'initial_quantity', label: 'Qty', width: 8, align: 'right' },
    );
    if (features.show_less_column) {
        tableCols.push({ key: 'less_quantity', label: 'Less', width: 7, align: 'right' });
    }
    tableCols.push(
        { key: 'rate', label: 'Rate', width: 12, align: 'right' },
        { key: 'amount', label: 'Amount', width: 14, align: 'right' },
        { key: 'tax_rate', label: 'Tax %', width: 6, align: 'center' },
        { key: 'total', label: 'Total', width: 10, align: 'right' },
    );

    elements.push({
        id: genId(),
        type: 'table',
        x: ml,
        y,
        width: contentWidth,
        height: 80,
        styles: { fontSize: 9, padding: 0, lineHeight: 1.4 },
        label: 'Items Table',
        tableConfig: {
            columns: tableCols,
            showHeader: true,
            headerBg: '#f0f0f0',
            headerColor: '#000000',
            headerFontSize: 9,
            bodyFontSize: 9,
            borderStyle: 'horizontal',
            showSerialNo: true,
        },
        visible: true,
        zIndex: elements.length + 1,
    });
    y += 85;

    // ── Totals ──
    elements.push({
        id: genId(),
        type: 'totals',
        x: ml + contentWidth * 0.5,
        y,
        width: contentWidth * 0.5,
        height: 40,
        styles: { fontSize: 10, padding: 0, lineHeight: 1.4 },
        label: 'Totals',
        totalsConfig: {
            rows: [
                { label: 'Subtotal', field: 'subtotal', format: 'currency', bold: false },
                { label: 'Discount', field: 'discount_amount', format: 'currency', bold: false },
                { label: 'Tax', field: 'tax_total', format: 'currency', bold: false },
                { label: 'Grand Total', field: 'grand_total', format: 'currency', bold: true },
            ],
            labelAlign: 'right',
            showBorder: true,
        },
        visible: true,
        zIndex: elements.length + 1,
    });
    y += 45;

    // ── Bank Details ──
    if (features.show_bank_details) {
        elements.push({
            id: genId(),
            type: 'text',
            x: ml,
            y,
            width: contentWidth * 0.5,
            height: 17,
            content: 'Bank Details:\nBank: {{company.bank_name}}\nA/C: {{company.bank_account}}\nIFSC: {{company.bank_ifsc}}',
            label: 'Bank Details',
            styles: { fontSize: 8, padding: 2, lineHeight: 1.5, border: '1px solid #ddd', borderRadius: 4 },
            visible: true,
            zIndex: elements.length + 1,
        });
        y += 17;
    }

    // ── Terms ──
    if (features.show_terms) {
        elements.push({
            id: genId(),
            type: 'text',
            x: ml,
            y,
            width: contentWidth * 0.55,
            height: 15,
            content: 'Terms & Conditions:\n1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.',
            label: 'Terms & Conditions',
            styles: { fontSize: 7, padding: 2, lineHeight: 1.5 },
            visible: true,
            zIndex: elements.length + 1,
        });
    }

    // ── Signature ──
    if (features.show_signature) {
        elements.push({
            id: genId(),
            type: 'text',
            x: ml + contentWidth * 0.6,
            y: y - 17,
            width: contentWidth * 0.35,
            height: 25,
            content: '\n\n\nAuthorized Signatory',
            label: 'Signature',
            styles: { fontSize: 9, textAlign: 'center', padding: 2, lineHeight: 1.4, border: '1px solid #ddd' },
            visible: true,
            zIndex: elements.length + 1,
        });
    }

    return {
        version: 1,
        pageSize: { ...pageSize },
        elements,
        globalStyles: { ...DEFAULT_GLOBAL_STYLES },
    };
}
