import { TemplateDesign, DesignerElement } from './types';

/**
 * Compiles a TemplateDesign JSON into Handlebars-compatible HTML + CSS
 * that the existing Rust render_invoice engine can process.
 *
 * Supports TWO layout modes:
 * - A4 / large format: absolute positioning (precise layout)
 * - Thermal / receipt:  flow layout (top-to-bottom, like the original thermal_80mm)
 */
export function compileDesign(design: TemplateDesign): {
    headerHtml: string;
    bodyHtml: string;
    footerHtml: string;
    stylesCss: string;
} {
    const isThermal = design.pageSize.width < 120; // thermal = 80mm or 58mm

    const { elements } = design;
    const sortedElements = [...elements]
        .filter(el => el.visible !== false)
        .sort((a, b) => a.y - b.y || a.x - b.x); // top-to-bottom, left-to-right

    // Split into header, body (tables/totals), footer
    const headerElements: DesignerElement[] = [];
    const bodyElements: DesignerElement[] = [];
    const footerElements: DesignerElement[] = [];

    // Heuristic: elements before the first table = header, tables + totals = body, after totals = footer
    let seenTable = false;
    let seenTotals = false;

    for (const el of sortedElements) {
        if (el.type === 'table') {
            seenTable = true;
            bodyElements.push(el);
        } else if (el.type === 'totals') {
            seenTotals = true;
            bodyElements.push(el);
        } else if (!seenTable) {
            headerElements.push(el);
        } else if (seenTotals) {
            footerElements.push(el);
        } else {
            bodyElements.push(el);
        }
    }

    let headerHtml: string;
    let bodyHtml: string;
    let footerHtml: string;
    let stylesCss: string;

    if (isThermal) {
        headerHtml = renderThermalElements(headerElements);
        bodyHtml = renderThermalElements(bodyElements);
        footerHtml = renderThermalElements(footerElements);
        stylesCss = generateThermalCSS(design);
    } else {
        headerHtml = renderAbsoluteElements(headerElements);
        bodyHtml = renderAbsoluteElements(bodyElements);
        footerHtml = renderAbsoluteElements(footerElements);
        stylesCss = generateA4CSS(design);
    }

    return { headerHtml, bodyHtml, footerHtml, stylesCss };
}

// ============================
// THERMAL (flow layout) mode
// ============================

function renderThermalElements(elements: DesignerElement[]): string {
    // Group elements by their Y position — elements at the same Y go in a flex row
    const rows: DesignerElement[][] = [];
    let currentRow: DesignerElement[] = [];
    let currentY: number | null = null;

    for (const el of elements) {
        if (currentY !== null && Math.abs(el.y - currentY) < 0.5) {
            // Same row
            currentRow.push(el);
        } else {
            if (currentRow.length > 0) rows.push(currentRow);
            currentRow = [el];
            currentY = el.y;
        }
    }
    if (currentRow.length > 0) rows.push(currentRow);

    return rows.map(row => {
        if (row.length === 1) {
            return renderThermalElement(row[0]);
        }
        // Multiple elements on same Y — wrap in a flex row
        const inner = row.map(el => renderThermalElement(el)).join('\n');
        return `<div style="display:flex;justify-content:space-between;align-items:flex-start;">\n${inner}\n</div>`;
    }).join('\n');
}

function renderThermalElement(el: DesignerElement): string {
    const style = buildThermalInlineStyle(el);

    switch (el.type) {
        case 'text':
            return `<div style="${style}">${escapeHtml(el.content || '')}</div>`;

        case 'field': {
            const binding = el.fieldBinding || '';
            const prefix = el.content ? escapeHtml(el.content) : '';
            // Use format helpers for specific field types
            if (binding.includes('date')) {
                return `<div style="${style}">${prefix}{{format_date ${binding}}}</div>`;
            }
            return `<div style="${style}">${prefix}{{${binding}}}</div>`;
        }

        case 'image':
            if (el.imageType === 'logo') {
                return `{{#if company.has_logo}}<div style="${style}"><img src="{{company.logo}}" alt="Logo" style="max-width:100%;max-height:100%;object-fit:contain;" /></div>{{/if}}`;
            }
            return `<div style="${style}"></div>`;

        case 'divider':
            return `<div style="border-top:${el.dividerThickness || 1}px ${el.dividerStyle || 'dashed'} ${el.dividerColor || '#000'};margin:0;"></div>`;

        case 'table':
            return renderThermalTable(el);

        case 'totals':
            return renderThermalTotals(el);

        default:
            return '';
    }
}

function renderThermalTable(el: DesignerElement): string {
    const config = el.tableConfig;
    if (!config) return '';

    const fontSize = config.bodyFontSize || 9;
    const headerFontSize = config.headerFontSize || fontSize;

    let html = `<table style="width:100%;border-collapse:collapse;font-size:${fontSize}pt;color:#000;">`;

    // Header
    if (config.showHeader) {
        html += '<thead><tr>';
        for (const col of config.columns) {
            const bgStyle = config.headerBg && config.headerBg !== '#f0f0f0'
                ? `background:${config.headerBg};` : '';
            html += `<th style="text-align:${col.align};padding:4px 2px;font-size:${headerFontSize}pt;border-bottom:1px solid #000;font-weight:bold;color:#000;${bgStyle}">${escapeHtml(col.label)}</th>`;
        }
        html += '</tr></thead>';
    }

    // Body
    html += '<tbody>{{#each items}}<tr>';
    for (const col of config.columns) {
        let cellContent: string;
        if (col.key === 'serial_no') {
            cellContent = '{{increment @index}}';
        } else if (col.format === 'currency') {
            cellContent = `{{format_number ${col.key} 2}}`;
        } else if (col.format === 'number') {
            cellContent = `{{format_number ${col.key} 2}}`;
        } else if (col.format === 'date') {
            cellContent = `{{format_date ${col.key}}}`;
        } else {
            cellContent = `{{${col.key}}}`;
        }
        html += `<td style="padding:4px 2px;text-align:${col.align};font-size:${fontSize}pt;color:#000;font-weight:bold;">${cellContent}</td>`;
    }
    html += '</tr>{{/each}}</tbody>';
    html += '</table>';

    return html;
}

function renderThermalTotals(el: DesignerElement): string {
    const config = el.totalsConfig;
    if (!config) return '';

    const fontSize = el.styles.fontSize || 10;
    let html = '<div class="totals" style="color:#000;">';

    for (const row of config.rows) {
        const isBold = row.bold;
        const isGrandTotal = row.field === 'grand_total';
        const extraStyle = isGrandTotal
            ? `font-weight:bold;font-size:${fontSize + 2}pt;border-top:1px solid #000;padding-top:5px;margin-top:5px;`
            : isBold ? 'font-weight:bold;' : '';

        let valueHtml: string;
        if (row.format === 'currency') {
            // Use conditional to hide zero/empty values for optional fields
            if (row.field === 'discount_amount') {
                valueHtml = `{{#if discount_amount}}₹{{format_number discount_amount 2}}{{/if}}`;
                html += `{{#if discount_amount}}<div style="display:flex;justify-content:space-between;padding:2px 0;color:#000;${extraStyle}"><span>${escapeHtml(row.label)}:</span><span>${valueHtml}</span></div>{{/if}}`;
                continue;
            } else if (row.field === 'tax_total') {
                valueHtml = `{{#if tax_total}}₹{{format_number tax_total 2}}{{/if}}`;
                html += `{{#if tax_total}}<div style="display:flex;justify-content:space-between;padding:2px 0;color:#000;${extraStyle}"><span>${escapeHtml(row.label)}:</span><span>${valueHtml}</span></div>{{/if}}`;
                continue;
            }
            valueHtml = `₹{{format_number ${row.field} 2}}`;
        } else {
            valueHtml = `{{${row.field}}}`;
        }

        html += `<div style="display:flex;justify-content:space-between;padding:2px 0;color:#000;${extraStyle}"><span>${escapeHtml(row.label)}:</span><span>${valueHtml}</span></div>`;
    }

    html += '</div>';

    // Account Summary section (old balance, bill amount, paid amount, balance due)
    html += `
<div style="border-top:1px dashed #000;margin:10px 0;padding:5px 0;font-size:11px;color:#000;">
    <div style="display:flex;justify-content:space-between;"><span>Old Bal:</span><span>{{abs_format_number old_balance 2}}</span></div>
    <div style="display:flex;justify-content:space-between;"><span>Bill Amt:</span><span>{{format_number grand_total 2}}</span></div>
    <div style="display:flex;justify-content:space-between;"><span>Paid Amt:</span><span>{{format_number paid_amount 2}}</span></div>
    <div style="display:flex;justify-content:space-between;font-weight:bold;border-top:1px dotted #000;padding-top:2px;margin-top:2px;font-size:12px;"><span>Bal Due:</span><span>{{abs_format_number balance_due 2}}</span></div>
</div>`;

    return html;
}

function buildThermalInlineStyle(el: DesignerElement): string {
    const parts: string[] = [];
    const s = el.styles;

    // No absolute positioning for thermal — only typography and spacing
    if (s.fontFamily) parts.push(`font-family:${s.fontFamily}`);
    if (s.fontSize) parts.push(`font-size:${s.fontSize}pt`);
    if (s.fontWeight && s.fontWeight !== 'normal') parts.push(`font-weight:${s.fontWeight}`);
    if (s.fontStyle && s.fontStyle !== 'normal') parts.push(`font-style:${s.fontStyle}`);
    if (s.textDecoration && s.textDecoration !== 'none') parts.push(`text-decoration:${s.textDecoration}`);
    if (s.color) parts.push(`color:${s.color}`);
    if (s.backgroundColor && s.backgroundColor !== 'transparent') parts.push(`background-color:${s.backgroundColor}`);
    if (s.textAlign) parts.push(`text-align:${s.textAlign}`);
    if (s.lineHeight) parts.push(`line-height:${s.lineHeight}`);
    if (s.textTransform && s.textTransform !== 'none') parts.push(`text-transform:${s.textTransform}`);
    if (s.border) parts.push(`border:${s.border}`);
    if (s.borderRadius) parts.push(`border-radius:${s.borderRadius}px`);
    if (s.padding) parts.push(`padding:${s.padding}mm`);

    // Margin for spacing between elements
    parts.push('margin:2px 0');

    return parts.join(';');
}

function generateThermalCSS(design: TemplateDesign): string {
    const { pageSize, globalStyles } = design;
    const bodyWidth = pageSize.width - pageSize.margins.left - pageSize.margins.right;

    return `
@page {
    margin: 0;
    size: ${pageSize.width}mm auto;
}
* {
    color: #000000 !important;
    border-color: #000000 !important;
}
body, p, span, div, td, th, h1, h2, h3, h4, h5, h6 {
    font-weight: bold !important;
}
body {
    font-family: ${globalStyles.fontFamily || "'Courier New', 'Courier', monospace"};
    font-size: ${globalStyles.fontSize || 11}pt;
    width: ${bodyWidth}mm;
    margin: 0;
    padding: ${pageSize.margins.top}mm ${pageSize.margins.right}mm ${pageSize.margins.bottom}mm ${pageSize.margins.left}mm;
    line-height: 1.3;
    color: #000000;
}
.totals {
    margin-top: 8px;
    font-size: 9pt;
    color: #000000;
}
@media print {
    body {
        width: ${bodyWidth}mm;
        color: #000000;
    }
}
`.trim();
}

// ============================
// A4 (absolute positioning) mode
// ============================

function renderAbsoluteElements(elements: DesignerElement[]): string {
    return elements.map(el => renderAbsoluteElement(el)).join('\n');
}

function renderAbsoluteElement(el: DesignerElement): string {
    const style = buildAbsoluteInlineStyle(el);

    switch (el.type) {
        case 'text':
            return `<div class="de de-text" style="${style}">${escapeHtml(el.content || '')}</div>`;

        case 'field': {
            const prefix = el.content ? escapeHtml(el.content) : '';
            return `<div class="de de-field" style="${style}">${prefix}{{${el.fieldBinding || ''}}}</div>`;
        }

        case 'image':
            if (el.imageType === 'logo') {
                return `{{#if company.has_logo}}<div class="de de-image" style="${style}"><img src="{{company.logo}}" alt="{{company.name}}" style="max-width:100%;max-height:100%;object-fit:contain;" /></div>{{/if}}`;
            }
            return `<div class="de de-image" style="${style}"></div>`;

        case 'table':
            return renderA4TableElement(el);

        case 'divider':
            return `<div class="de de-divider" style="${style}"><hr style="width:100%;border:none;border-top:${el.dividerThickness || 1}px ${el.dividerStyle || 'solid'} ${el.dividerColor || '#ccc'};margin:0;" /></div>`;

        case 'totals':
            return renderA4TotalsElement(el);

        case 'shape':
            return `<div class="de de-shape" style="${style}"></div>`;

        default:
            return '';
    }
}

function renderA4TableElement(el: DesignerElement): string {
    const style = buildAbsoluteInlineStyle(el);
    const config = el.tableConfig;
    if (!config) return '';

    const borderStyle = config.borderStyle === 'full'
        ? 'border:1px solid #ddd;'
        : config.borderStyle === 'horizontal'
            ? 'border-bottom:1px solid #eee;'
            : '';

    let html = `<div class="de de-table" style="${style}">`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:${config.bodyFontSize || 9}pt;">`;

    if (config.showHeader) {
        html += '<thead><tr>';
        for (const col of config.columns) {
            html += `<th style="background:${config.headerBg || '#f0f0f0'};color:${config.headerColor || '#000'};padding:4px 6px;${borderStyle}text-align:${col.align};width:${col.width}%;font-size:${config.headerFontSize || 9}pt;">${escapeHtml(col.label)}</th>`;
        }
        html += '</tr></thead>';
    }

    html += '<tbody>{{#each items}}<tr>';
    for (const col of config.columns) {
        let cellContent: string;
        if (col.key === 'serial_no') {
            cellContent = '{{increment @index}}';
        } else if (col.format === 'currency') {
            cellContent = `{{format_currency ${col.key}}}`;
        } else if (col.format === 'number') {
            cellContent = `{{format_number ${col.key} 2}}`;
        } else if (col.format === 'date') {
            cellContent = `{{format_date ${col.key}}}`;
        } else {
            cellContent = `{{${col.key}}}`;
        }
        html += `<td style="padding:4px 6px;${borderStyle}text-align:${col.align};">${cellContent}</td>`;
    }
    html += '</tr>{{/each}}</tbody>';
    html += '</table></div>';

    return html;
}

function renderA4TotalsElement(el: DesignerElement): string {
    const style = buildAbsoluteInlineStyle(el);
    const config = el.totalsConfig;
    if (!config) return '';

    let html = `<div class="de de-totals" style="${style}"><table style="width:100%;">`;
    html += '<tbody>';
    for (const row of config.rows) {
        const borderTop = row.bold && config.showBorder ? 'border-top:1px solid #333;' : '';
        const fontWeight = row.bold ? 'font-weight:bold;' : '';

        let valueHtml: string;
        if (row.format === 'currency') {
            valueHtml = `{{format_currency ${row.field}}}`;
        } else {
            valueHtml = `{{${row.field}}}`;
        }

        html += `<tr>`;
        html += `<td style="text-align:${config.labelAlign || 'right'};padding:2px 6px;${borderTop}${fontWeight}">${escapeHtml(row.label)}:</td>`;
        html += `<td style="text-align:right;padding:2px 6px;width:40%;${borderTop}${fontWeight}">${valueHtml}</td>`;
        html += '</tr>';
    }
    html += '</tbody></table></div>';

    return html;
}

function buildAbsoluteInlineStyle(el: DesignerElement): string {
    const parts: string[] = [
        `position:absolute`,
        `left:${el.x}mm`,
        `top:${el.y}mm`,
        `width:${el.width}mm`,
        `height:${el.height}mm`,
        `box-sizing:border-box`,
        `overflow:hidden`,
    ];

    const s = el.styles;
    if (s.fontFamily) parts.push(`font-family:${s.fontFamily}`);
    if (s.fontSize) parts.push(`font-size:${s.fontSize}pt`);
    if (s.fontWeight && s.fontWeight !== 'normal') parts.push(`font-weight:${s.fontWeight}`);
    if (s.fontStyle && s.fontStyle !== 'normal') parts.push(`font-style:${s.fontStyle}`);
    if (s.textDecoration && s.textDecoration !== 'none') parts.push(`text-decoration:${s.textDecoration}`);
    if (s.color) parts.push(`color:${s.color}`);
    if (s.backgroundColor && s.backgroundColor !== 'transparent') parts.push(`background-color:${s.backgroundColor}`);
    if (s.textAlign) parts.push(`text-align:${s.textAlign}`);
    if (s.lineHeight) parts.push(`line-height:${s.lineHeight}`);
    if (s.letterSpacing) parts.push(`letter-spacing:${s.letterSpacing}px`);
    if (s.textTransform && s.textTransform !== 'none') parts.push(`text-transform:${s.textTransform}`);
    if (s.border) parts.push(`border:${s.border}`);
    if (s.borderRadius) parts.push(`border-radius:${s.borderRadius}px`);
    if (s.padding) parts.push(`padding:${s.padding}mm`);
    if (el.zIndex) parts.push(`z-index:${el.zIndex}`);

    return parts.join(';');
}

function generateA4CSS(design: TemplateDesign): string {
    const { pageSize, globalStyles } = design;
    return `
    .invoice-page {
      position: relative;
      width: ${pageSize.width}mm;
      min-height: ${pageSize.height}mm;
      margin: 0 auto;
      padding: ${pageSize.margins.top}mm ${pageSize.margins.right}mm ${pageSize.margins.bottom}mm ${pageSize.margins.left}mm;
      font-family: ${globalStyles.fontFamily};
      font-size: ${globalStyles.fontSize}pt;
      color: ${globalStyles.color};
      background: ${globalStyles.backgroundColor};
      box-sizing: border-box;
    }
    .de { position: absolute; box-sizing: border-box; }
    .de-text { white-space: pre-wrap; }
    .de-image { display: flex; align-items: center; justify-content: center; }
    .de-image img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .de-divider { display: flex; align-items: center; }
    @media print {
      @page {
        size: ${pageSize.width}mm ${pageSize.height}mm;
        margin: 0;
      }
      body { margin: 0; }
      .invoice-page { margin: 0; }
    }
  `.trim();
}

// ============================
// Shared utilities
// ============================

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Export a TemplateDesign as a JSON string for file download.
 */
export function exportDesign(design: TemplateDesign): string {
    return JSON.stringify(design, null, 2);
}

/**
 * Import a TemplateDesign from a JSON string.
 */
export function importDesign(jsonString: string): TemplateDesign {
    const parsed = JSON.parse(jsonString);
    if (!parsed.version || !parsed.elements || !parsed.pageSize) {
        throw new Error('Invalid template design format');
    }
    return parsed as TemplateDesign;
}
