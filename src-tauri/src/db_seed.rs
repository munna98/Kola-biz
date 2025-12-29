use sqlx::SqlitePool;

// ============= A4 PORTRAIT - PROFESSIONAL TEMPLATE =============

const A4_HEADER: &str = r#"
<div class="header">
    {{#if company.has_logo}}
    <div class="logo-section">
        <img src="{{company.logo}}" alt="{{company.name}}" class="company-logo" />
    </div>
    {{/if}}
    <div class="company-info">
        <h1>{{company.name}}</h1>
        {{#if company.address_line1}}
        <p>{{company.address_line1}}</p>
        {{/if}}
        {{#if company.address_line2}}
        <p>{{company.address_line2}}</p>
        {{/if}}
        <p>{{company.city}}, {{company.state}} - {{company.pincode}}</p>
        <div class="contact-line">
            {{#if company.phone}}<span>Phone: {{company.phone}}</span>{{/if}}
            {{#if company.email}}<span>Email: {{company.email}}</span>{{/if}}
        </div>
        {{#if company.gstin}}
        <p class="gstin">GSTIN: {{company.gstin}}</p>
        {{/if}}
    </div>
</div>

<div class="invoice-header">
    <h2>TAX INVOICE</h2>
</div>

<div class="invoice-meta">
    <div class="left">
        <p><strong>Bill To:</strong></p>
        <p class="party-name">{{party.name}}</p>
        {{#if party.address}}
        <p>{{party.address}}</p>
        {{/if}}
        {{#if party.phone}}
        <p>Phone: {{party.phone}}</p>
        {{/if}}
        {{#if party.gstin}}
        <p>GSTIN: {{party.gstin}}</p>
        {{/if}}
    </div>
    <div class="right">
        <table class="meta-table">
            <tr>
                <td><strong>Invoice No:</strong></td>
                <td>{{voucher_no}}</td>
            </tr>
            <tr>
                <td><strong>Date:</strong></td>
                <td>{{format_date voucher_date}}</td>
            </tr>
            {{#if reference}}
            <tr>
                <td><strong>Reference:</strong></td>
                <td>{{reference}}</td>
            </tr>
            {{/if}}
        </table>
    </div>
</div>
"#;

pub const A4_BODY: &str = r#"
<table class="items-table">
    <thead>
        <tr>
            <th style="width: 5%;">S.No</th>
            <th style="width: 30%;">Description</th>
            <th style="width: 8%;">HSN/SAC</th>
            <th style="width: 8%;">Qty</th>
            <th style="width: 8%;">Less</th>
            <th style="width: 8%;">Rate</th>
            <th style="width: 10%;">Amount</th>
            <th style="width: 7%;">Tax %</th>
            <th style="width: 8%;">Total</th>
        </tr>
    </thead>
    <tbody>
        {{#each items}}
        <tr>
            <td class="center">{{@index}}</td>
            <td>
                <strong>{{product_name}}</strong>
                {{#if description}}
                <br/><small class="text-muted">{{description}}</small>
                {{/if}}
            </td>
            <td class="center">{{hsn_code}}</td>
            <td class="right">{{format_number initial_quantity 2}}</td>
            <td class="right">{{format_number less_quantity 2}}</td>
            <td class="right">{{format_currency rate}}</td>
            <td class="right">{{format_currency amount}}</td>
            <td class="center">{{tax_rate}}%</td>
            <td class="right"><strong>{{format_currency total}}</strong></td>
        </tr>
        {{/each}}
    </tbody>
</table>

<div class="totals-section">
    <div class="totals-box">
        <div class="totals-row">
            <span>Subtotal:</span>
            <span>{{format_currency subtotal}}</span>
        </div>
        {{#if discount_amount}}
        <div class="totals-row">
            <span>Discount {{#if discount_rate}}({{discount_rate}}%){{/if}}:</span>
            <span class="discount">{{format_currency discount_amount}}</span>
        </div>
        {{/if}}
        {{#if tax_total}}
        <div class="totals-row">
            <span>Total Tax:</span>
            <span>{{format_currency tax_total}}</span>
        </div>
        {{/if}}
        <div class="totals-row grand-total">
            <span>Grand Total:</span>
            <span>{{format_currency grand_total}}</span>
        </div>
    </div>
    
    <div class="amount-words">
        <strong>Amount in Words:</strong><br/>
        <span class="words-text">{{grand_total_words}}</span>
    </div>
    
    {{#if narration}}
    <div class="narration">
        <strong>Notes:</strong><br/>
        {{narration}}
    </div>
    {{/if}}
</div>
"#;

const A4_FOOTER: &str = r#"
<div class="footer">
    <div class="footer-section">
        {{#if bank.has_details}}
        <div class="bank-details">
            <h4>Bank Details</h4>
            <table class="bank-table">
                <tr>
                    <td>Bank Name:</td>
                    <td><strong>{{bank.name}}</strong></td>
                </tr>
                <tr>
                    <td>Account No:</td>
                    <td><strong>{{bank.account_no}}</strong></td>
                </tr>
                <tr>
                    <td>IFSC Code:</td>
                    <td><strong>{{bank.ifsc}}</strong></td>
                </tr>
                {{#if bank.branch}}
                <tr>
                    <td>Branch:</td>
                    <td>{{bank.branch}}</td>
                </tr>
                {{/if}}
            </table>
        </div>
        {{/if}}
        
        {{#if has_terms}}
        <div class="terms">
            <h4>Terms & Conditions</h4>
            <p>{{terms_and_conditions}}</p>
        </div>
        {{/if}}
    </div>
    
    <div class="signature-section">
        <p class="signature-label">For {{company.name}}</p>
        <div class="signature-line"></div>
        <p class="signature-text">Authorized Signatory</p>
    </div>
</div>

<div class="page-footer">
    <p>This is a computer-generated invoice and does not require a signature</p>
    {{#if company.website}}
    <p>{{company.website}}</p>
    {{/if}}
</div>
"#;

const A4_CSS: &str = r#"
body {
    font-size: 11pt;
    line-height: 1.4;
    color: #1a1a1a;
    max-width: 210mm;
    margin: 0 auto;
    padding: 10mm;
}
.header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 15px;
    border-bottom: 3px solid #2563eb;
    margin-bottom: 20px;
}
.logo-section {
    flex: 0 0 auto;
    margin-right: 20px;
}
.company-logo {
    max-width: 120px;
    max-height: 80px;
    object-fit: contain;
}
.company-info {
    flex: 1;
}
.company-info h1 {
    font-size: 22pt;
    color: #2563eb;
    margin-bottom: 8px;
    font-weight: bold;
}
.company-info p {
    font-size: 9pt;
    color: #4b5563;
    margin: 2px 0;
}
.contact-line {
    display: flex;
    gap: 20px;
    margin-top: 5px;
}
.contact-line span {
    font-size: 9pt;
}
.gstin {
    font-weight: 600;
    color: #2563eb;
    margin-top: 5px;
}
.invoice-header {
    text-align: center;
    margin: 20px 0;
}
.invoice-header h2 {
    font-size: 16pt;
    color: #2563eb;
    font-weight: bold;
    padding: 10px;
    background: #eff6ff;
    border-radius: 4px;
}
.invoice-meta {
    display: flex;
    justify-content: space-between;
    padding: 15px;
    background: #f9fafb;
    border-radius: 4px;
    margin-bottom: 25px;
}
.invoice-meta .left, .invoice-meta .right {
    flex: 1;
}
.invoice-meta p {
    margin: 4px 0;
    font-size: 10pt;
}
.party-name {
    font-size: 12pt;
    font-weight: bold;
    color: #1a1a1a;
}
.meta-table {
    border-collapse: collapse;
}
.meta-table td {
    padding: 4px 8px;
    font-size: 10pt;
}
.meta-table td:first-child {
    color: #6b7280;
}
.items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 25px;
}
.items-table th {
    background: #2563eb;
    color: white;
    padding: 10px 8px;
    text-align: left;
    font-size: 9pt;
    font-weight: 600;
}
.items-table td {
    padding: 10px 8px;
    border-bottom: 1px solid #e5e7eb;
    font-size: 9pt;
}
.items-table tbody tr:hover {
    background: #f9fafb;
}
.center { text-align: center; }
.right { text-align: right; }
.text-muted { color: #6b7280; }
.totals-section {
    margin-bottom: 30px;
}
.totals-box {
    margin-left: auto;
    width: 350px;
    padding: 15px;
    background: #f9fafb;
    border-radius: 4px;
    margin-bottom: 20px;
}
.totals-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 10pt;
}
.totals-row span:last-child {
    font-weight: 500;
    font-family: 'Courier New', monospace;
}
.totals-row.grand-total {
    border-top: 2px solid #2563eb;
    font-weight: bold;
    font-size: 13pt;
    color: #2563eb;
    margin-top: 8px;
    padding-top: 10px;
}
.discount {
    color: #dc2626;
}
.amount-words {
    padding: 15px;
    background: #dbeafe;
    border-left: 4px solid #2563eb;
    border-radius: 4px;
    margin-bottom: 15px;
}
.amount-words strong {
    font-size: 9pt;
    color: #1e40af;
}
.words-text {
    font-size: 10pt;
    color: #1e3a8a;
    font-weight: 500;
}
.narration {
    padding: 12px;
    background: #fef3c7;
    border-left: 4px solid #f59e0b;
    border-radius: 4px;
    font-size: 9pt;
}
.footer {
    border-top: 2px solid #e5e7eb;
    padding-top: 20px;
    margin-top: 30px;
}
.footer-section {
    display: flex;
    gap: 30px;
    margin-bottom: 30px;
}
.bank-details, .terms {
    flex: 1;
}
.footer h4 {
    font-size: 10pt;
    color: #2563eb;
    margin-bottom: 10px;
    font-weight: 600;
}
.bank-table {
    font-size: 9pt;
    width: 100%;
}
.bank-table td {
    padding: 3px 0;
}
.bank-table td:first-child {
    color: #6b7280;
    width: 100px;
}
.terms p {
    font-size: 8pt;
    color: #4b5563;
    line-height: 1.5;
}
.signature-section {
    text-align: right;
    margin-top: 40px;
}
.signature-label {
    font-size: 9pt;
    color: #6b7280;
}
.signature-line {
    width: 200px;
    border-bottom: 1px solid #1a1a1a;
    margin: 50px 0 10px auto;
}
.signature-text {
    font-size: 9pt;
    color: #1a1a1a;
}
.page-footer {
    text-align: center;
    margin-top: 30px;
    padding-top: 15px;
    border-top: 1px solid #e5e7eb;
}
.page-footer p {
    font-size: 8pt;
    color: #9ca3af;
    margin: 3px 0;
}
@media print {
    body { margin: 0; padding: 10mm; }
    .header { page-break-after: avoid; }
    .items-table { page-break-inside: avoid; }
    .totals-section { page-break-before: avoid; }
}
"#;

// ============= THERMAL 80MM - COMPACT RECEIPT =============

const THERMAL_80MM_HEADER: &str = r#"
<div class="thermal-header">
    {{#if company.has_logo}}
    <div class="logo-wrap">
        <img src="{{company.logo}}" alt="Logo" class="logo" />
    </div>
    {{/if}}
    <h1>{{company.name}}</h1>
    <p>{{company.address}}</p>
    <p>Ph: {{company.phone}}</p>
    {{#if company.gstin}}
    <p>GSTIN: {{company.gstin}}</p>
    {{/if}}
</div>
<div class="separator"></div>
<div class="invoice-info">
    <div class="row">
        <span>Invoice:</span>
        <span><strong>{{voucher_no}}</strong></span>
    </div>
    <div class="row">
        <span>Date:</span>
        <span>{{format_date voucher_date}}</span>
    </div>
    {{#if party.name}}
    <div class="row">
        <span>Customer:</span>
        <span>{{party.name}}</span>
    </div>
    {{/if}}
</div>
<div class="separator"></div>
"#;

pub const THERMAL_80MM_BODY: &str = r#"
<table class="items">
    <thead>
        <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Less</th>
            <th>Rate</th>
            <th>Amt</th>
        </tr>
    </thead>
    <tbody>
        {{#each items}}
        <tr>
            <td>{{product_name}}</td>
            <td>{{format_number initial_quantity 0}}</td>
            <td>{{format_number less_quantity 0}}</td>
            <td>{{format_number rate 2}}</td>
            <td>{{format_number total 2}}</td>
        </tr>
        {{/each}}
    </tbody>
</table>
<div class="separator"></div>
<div class="totals">
    <div class="row">
        <span>Subtotal:</span>
        <span>₹{{format_number subtotal 2}}</span>
    </div>
    {{#if discount_amount}}
    <div class="row">
        <span>Discount:</span>
        <span>₹{{format_number discount_amount 2}}</span>
    </div>
    {{/if}}
    {{#if tax_total}}
    <div class="row">
        <span>Tax:</span>
        <span>₹{{format_number tax_total 2}}</span>
    </div>
    {{/if}}
    <div class="row total">
        <span>TOTAL:</span>
        <span>₹{{format_number grand_total 2}}</span>
    </div>
</div>

<!-- Account Summary -->
<div style="border-top: 1px dashed #000; margin: 10px 0; padding: 5px 0; font-size: 11px;">
    <div style="display: flex; justify-content: space-between;">
        <span>Old Bal:</span>
        <span>{{format_number old_balance 2}}</span>
    </div>
    <div style="display: flex; justify-content: space-between;">
        <span>Bill Amt:</span>
        <span>{{format_number grand_total 2}}</span>
    </div>
    <div style="display: flex; justify-content: space-between;">
        <span>Paid Amt:</span>
        <span>{{format_number paid_amount 2}}</span>
    </div>
    <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px dotted #000; padding-top: 2px; margin-top: 2px;">
        <span>Bal Due:</span>
        <span>{{format_number balance_due 2}}</span>
    </div>
</div>
"#;

const THERMAL_80MM_FOOTER: &str = r#"
<div class="separator"></div>
<div class="footer">
    <p class="center"><strong>Thank You for Your Business!</strong></p>
    {{#if narration}}
    <p class="center small">{{narration}}</p>
    {{/if}}
    {{#if company.website}}
    <p class="center small">{{company.website}}</p>
    {{/if}}
    <p class="center small">Visit Again!</p>
</div>
"#;

const THERMAL_80MM_CSS: &str = r#"
@page { margin: 0; size: 80mm auto; }
body {
    font-family: 'Courier New', 'Courier', monospace;
    font-size: 11pt;
    width: 72mm;
    margin: 0;
    padding: 3mm;
    line-height: 1.3;
    color: #000000;
}
.thermal-header {
    text-align: center;
    margin-bottom: 8px;
}
.logo-wrap {
    margin-bottom: 5px;
}
.logo {
    max-width: 60mm;
    max-height: 25mm;
    object-fit: contain;
}
.thermal-header h1 {
    font-size: 14pt;
    font-weight: bold;
    margin: 5px 0;
    color: #000000;
}
.thermal-header p {
    font-size: 9pt;
    margin: 2px 0;
    color: #000000;
}
.separator {
    border-top: 1px dashed #000000;
    margin: 8px 0;
}
.invoice-info {
    font-size: 9pt;
    color: #000000;
}
.invoice-info .row {
    display: flex;
    justify-content: space-between;
    margin: 3px 0;
    color: #000000;
}
.items {
    width: 100%;
    font-size: 9pt;
    border-collapse: collapse;
    color: #000000;
}
.items th {
    text-align: left;
    border-bottom: 1px solid #000000;
    padding: 4px 2px;
    font-weight: bold;
    color: #000000;
}
.items td {
    padding: 4px 2px;
    color: #000000;
}
.items td:nth-child(2),
.items td:nth-child(3),
.items td:nth-child(4),
.items td:nth-child(5) {
    text-align: right;
}
.totals {
    margin-top: 8px;
    font-size: 9pt;
    color: #000000;
}
.totals .row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
    color: #000000;
}
.totals .row.total {
    font-weight: bold;
    font-size: 12pt;
    border-top: 1px solid #000000;
    padding-top: 5px;
    margin-top: 5px;
    color: #000000;
}
.footer {
    margin-top: 10px;
}
.footer p {
    font-size: 9pt;
    margin: 4px 0;
    color: #000000;
}
.center {
    text-align: center;
}
.small {
    font-size: 8pt;
    color: #000000;
}
@media print {
    body {
        width: 72mm;
        color: #000000;
    }
}
"#;

// ============= MINIMAL CLEAN INVOICE TEMPLATE =============

const MINIMAL_HEADER: &str = r#"
<div class="invoice-header">
    <div class="invoice-title">
        <h1>INVOICE</h1>
    </div>
    <div class="logo-placeholder">
        {{#if company.has_logo}}
        <img src="{{company.logo}}" alt="{{company.name}}" class="company-logo" />
        {{else}}
        <div class="logo-box">
            <p>YOUR COMPANY'S<br/>LOGO GOES HERE</p>
        </div>
        {{/if}}
    </div>
</div>

<div class="invoice-details">
    <div class="detail-row">
        <span class="label">INVOICE NR:</span>
        <span class="value">{{voucher_no}}</span>
    </div>
    <div class="detail-row">
        <span class="label">DATE:</span>
        <span class="value">{{format_date voucher_date}}</span>
    </div>
    {{#if due_date}}
    <div class="detail-row">
        <span class="label">DUE DATE:</span>
        <span class="value">{{format_date due_date}}</span>
    </div>
    {{/if}}
</div>

<div class="parties-section">
    <div class="bill-to">
        <h3>BILL TO:</h3>
        <div class="party-details">
            <p class="party-name">{{party.name}}</p>
            {{#if party.business_title}}
            <p>{{party.business_title}}</p>
            {{/if}}
            {{#if party.address}}
            <p>{{party.address}}</p>
            {{/if}}
            {{#if party.email}}
            <p>{{party.email}}</p>
            {{/if}}
        </div>
    </div>
    
    <div class="payable-to">
        <h3>PAYABLE TO:</h3>
        <div class="party-details">
            <p class="party-name">{{company.name}}</p>
            <p>{{company.address}}</p>
            {{#if company.phone}}
            <p>+ {{company.phone}}</p>
            {{/if}}
            {{#if company.email}}
            <p>{{company.email}}</p>
            {{/if}}
        </div>
    </div>
</div>
"#;

const MINIMAL_BODY: &str = r#"
<table class="items-table">
    <thead>
        <tr>
            <th class="col-no">NO.</th>
            <th class="col-description">DESCRIPTION</th>
            <th class="col-qty">QTY</th>
            <th class="col-price">PRICE</th>
            <th class="col-total">TOTAL</th>
        </tr>
    </thead>
    <tbody>
        {{#each items}}
        <tr>
            <td class="col-no">{{increment @index}}.</td>
            <td class="col-description">{{product_name}}</td>
            <td class="col-qty">{{format_number final_quantity 0}}</td>
            <td class="col-price">₹{{format_number rate 0}}</td>
            <td class="col-total">₹{{format_number total 0}}</td>
        </tr>
        {{/each}}
    </tbody>
</table>

<div class="totals-section">
    <div class="totals-rows">
        <div class="total-row">
            <span class="total-label">subtotal:</span>
            <span class="total-value">₹{{format_number subtotal 0}}</span>
        </div>
        
        {{#if discount_amount}}
        <div class="total-row">
            <span class="total-label">discount:</span>
            <span class="total-value">₹{{format_number discount_amount 0}}</span>
        </div>
        {{/if}}
        
        {{#if tax_total}}
        <div class="total-row">
            <span class="total-label">taxes:</span>
            <span class="total-value">₹{{format_number tax_total 0}}</span>
        </div>
        {{/if}}
        
        <div class="total-row grand-total">
            <span class="total-label">Grand Total</span>
            <span class="total-value">₹{{format_number grand_total 2}}</span>
        </div>
    </div>
</div>

<!-- Account Summary -->
<div class="account-summary" style="margin-top: 20px; border-top: 1px dashed #ccc; padding-top: 10px;">
    <h4 style="margin: 0 0 10px 0; font-size: 10pt; text-transform: uppercase;">Account Summary</h4>
    <div style="display: flex; justify-content: space-between; font-size: 9pt;">
        <div>
            <span style="display: block; color: #666; font-size: 8pt;">Old Balance</span>
            <span style="font-weight: bold;">₹{{format_number old_balance 2}}</span>
        </div>
        <div>
            <span style="display: block; color: #666; font-size: 8pt;">Bill Amount</span>
            <span style="font-weight: bold;">₹{{format_number grand_total 2}}</span>
        </div>
        <div>
            <span style="display: block; color: #666; font-size: 8pt;">Paid Amount</span>
            <span style="font-weight: bold;">₹{{format_number paid_amount 2}}</span>
        </div>
        <div>
            <span style="display: block; color: #666; font-size: 8pt;">Balance Due</span>
            <span style="font-weight: bold;">₹{{format_number balance_due 2}}</span>
        </div>
    </div>
</div>
"#;

const MINIMAL_FOOTER: &str = r#"
<div class="footer-section">
    <div class="bank-details">
        {{#if bank.has_details}}
        <div class="bank-row">
            <span class="bank-label">BANK NAME:</span>
            <span class="bank-value">{{bank.name}}</span>
        </div>
        <div class="bank-row">
            <span class="bank-label">ACCOUNT:</span>
            <span class="bank-value">{{bank.account_no}}</span>
        </div>
        {{/if}}
    </div>
    
    <div class="signature-area">
        <div class="signature-line"></div>
        <p class="thank-you">THANK YOU FOR YOUR PURCHASE</p>
    </div>
</div>
"#;

const MINIMAL_CSS: &str = r#"
@page {
    size: A4;
    margin: 0;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica', 'Arial', sans-serif;
    font-size: 10pt;
    line-height: 1.4;
    color: #000000;
    background: #ffffff;
    padding: 50px 60px;
}

/* Header Section */
.invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 40px;
    padding-bottom: 20px;
    border-bottom: 2px solid #000000;
}

.invoice-title h1 {
    font-size: 42pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #000000;
}

.logo-placeholder {
    width: 300px;
    height: 90px;
}

.company-logo {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
}

.logo-box {
    width: 100%;
    height: 100%;
    border: 2px solid #d1d5db;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    background: #f9fafb;
}

.logo-box p {
    font-size: 9pt;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    line-height: 1.6;
}

/* Invoice Details */
.invoice-details {
    margin-bottom: 40px;
    max-width: 400px;
}

.detail-row {
    display: flex;
    padding: 8px 0;
    border-bottom: 1px solid #e5e7eb;
}

.detail-row .label {
    font-weight: 700;
    text-transform: uppercase;
    font-size: 9pt;
    letter-spacing: 0.05em;
    width: 120px;
}

.detail-row .value {
    font-size: 10pt;
}

/* Parties Section */
.parties-section {
    display: flex;
    justify-content: space-between;
    margin-bottom: 50px;
}

.bill-to,
.payable-to {
    flex: 0 0 45%;
}

.parties-section h3 {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 15px;
}

.party-details p {
    font-size: 10pt;
    margin: 4px 0;
    color: #000000;
}

.party-name {
    font-weight: 600;
    font-size: 11pt;
}

/* Items Table */
.items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 30px;
}

.items-table thead {
    background: #ffffff;
    border-top: 2px solid #000000;
    border-bottom: 2px solid #000000;
}

.items-table th {
    text-align: left;
    padding: 12px 10px;
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.items-table tbody tr {
    border-bottom: 1px solid #e5e7eb;
}

.items-table td {
    padding: 12px 10px;
    font-size: 10pt;
}

.col-no {
    width: 8%;
}

.col-description {
    width: 42%;
}

.col-qty {
    width: 12%;
    text-align: center;
}

.col-price {
    width: 18%;
    text-align: right;
}

.col-total {
    width: 20%;
    text-align: right;
}

/* Totals Section */
.totals-section {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 60px;
}

.totals-rows {
    min-width: 350px;
}

.total-row {
    display: flex;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid #e5e7eb;
}

.total-label {
    font-size: 10pt;
    text-transform: lowercase;
}

.total-value {
    font-size: 11pt;
    font-weight: 500;
    font-family: 'Courier New', monospace;
}

.total-row.grand-total {
    border-top: 2px solid #000000;
    border-bottom: 2px solid #000000;
    margin-top: 8px;
    padding: 15px 0;
}

.grand-total .total-label {
    font-weight: 700;
    text-transform: uppercase;
    font-size: 11pt;
    letter-spacing: 0.05em;
}

.grand-total .total-value {
    font-weight: 700;
    font-size: 14pt;
}

/* Footer Section */
.footer-section {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-top: 2px solid #000000;
    padding-top: 30px;
}

.bank-details {
    flex: 0 0 45%;
}

.bank-row {
    display: flex;
    margin-bottom: 8px;
}

.bank-label {
    font-weight: 700;
    text-transform: uppercase;
    font-size: 9pt;
    letter-spacing: 0.05em;
    width: 120px;
}

.bank-value {
    font-size: 10pt;
}

.signature-area {
    flex: 0 0 45%;
    text-align: right;
}

.signature-line {
    border-bottom: 1px solid #000000;
    margin-bottom: 10px;
    height: 40px;
}

.thank-you {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-top: 5px;
}

/* Print Styles */
@media print {
    body {
        padding: 40px 50px;
    }
    
    .invoice-header {
        page-break-after: avoid;
    }
    
    .items-table {
        page-break-inside: avoid;
    }
    
    .totals-section {
        page-break-before: avoid;
    }
}
"#;

// ============= SEED FUNCTION WITH HANDLEBARS TEMPLATES =============

pub async fn seed_handlebars_templates(
    pool: &SqlitePool,
) -> Result<(), Box<dyn std::error::Error>> {
    // A4 Professional Template
    // Use INSERT OR IGNORE with template_number as unique identifier
    sqlx::query(
        "INSERT OR IGNORE INTO invoice_templates (
            template_number, name, description, voucher_type, template_format, design_mode,
            header_html, body_html, footer_html, styles_css, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("TPL-SI-001") // Unique template number
    .bind("Professional A4 Invoice")
    .bind("Modern professional invoice with complete company branding and detailed line items")
    .bind("sales_invoice")
    .bind("a4_portrait")
    .bind("standard")
    .bind(A4_HEADER)
    .bind(A4_BODY)
    .bind(A4_FOOTER)
    .bind(A4_CSS)
    .bind(1)
    .execute(pool)
    .await?;

    // Thermal 80mm Template
    sqlx::query(
        "INSERT OR IGNORE INTO invoice_templates (
            template_number, name, description, voucher_type, template_format, design_mode,
            header_html, body_html, footer_html, styles_css, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("TPL-SI-002") // Unique template number
    .bind("Thermal 80mm Receipt")
    .bind("Compact receipt for 80mm thermal printers (POS systems)")
    .bind("sales_invoice")
    .bind("thermal_80mm")
    .bind("compact")
    .bind(THERMAL_80MM_HEADER)
    .bind(THERMAL_80MM_BODY)
    .bind(THERMAL_80MM_FOOTER)
    .bind(THERMAL_80MM_CSS)
    .bind(0)
    .execute(pool)
    .await?;

    // Minimal Clean Invoice Template
    sqlx::query(
        "INSERT OR IGNORE INTO invoice_templates (
            template_number, name, description, voucher_type, template_format, design_mode,
            header_html, body_html, footer_html, styles_css, 
            show_logo, show_company_address, show_party_address, 
            show_bank_details, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("TPL-SI-003") // Unique template number
    .bind("Minimal Clean Invoice")
    .bind("Clean, minimalist invoice design with clear typography and professional spacing")
    .bind("sales_invoice")
    .bind("a4_portrait")
    .bind("minimal")
    .bind(MINIMAL_HEADER)
    .bind(MINIMAL_BODY)
    .bind(MINIMAL_FOOTER)
    .bind(MINIMAL_CSS)
    .bind(1) // show_logo
    .bind(1) // show_company_address
    .bind(1) // show_party_address
    .bind(1) // show_bank_details
    .bind(0) // not default
    .execute(pool)
    .await?;

    Ok(())
}
