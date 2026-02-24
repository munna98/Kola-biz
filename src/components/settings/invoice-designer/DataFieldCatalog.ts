import { DataFieldCategory } from './types';

/**
 * Catalog of all data fields available for binding in the invoice designer.
 * These map to the data passed by the Rust `render_invoice` command.
 */
export const DATA_FIELD_CATALOG: DataFieldCategory[] = [
    {
        name: 'Company',
        icon: 'IconBuilding',
        fields: [
            { key: 'company.name', label: 'Company Name', example: 'Acme Trading Co.' },
            { key: 'company.address', label: 'Full Address', example: '123 Main St, City' },
            { key: 'company.address_line1', label: 'Address Line 1', example: '123 Main Street' },
            { key: 'company.address_line2', label: 'Address Line 2', example: 'Near Market Road' },
            { key: 'company.city', label: 'City', example: 'Mumbai' },
            { key: 'company.state', label: 'State', example: 'Maharashtra' },
            { key: 'company.pincode', label: 'Pincode', example: '400001' },
            { key: 'company.phone', label: 'Phone', example: '+91 98765 43210' },
            { key: 'company.email', label: 'Email', example: 'info@acme.com' },
            { key: 'company.website', label: 'Website', example: 'www.acme.com' },
            { key: 'company.gstin', label: 'GSTIN', example: '27AABCU9603R1ZM' },
            { key: 'company.pan', label: 'PAN', example: 'AABCU9603R' },
        ],
    },
    {
        name: 'Party',
        icon: 'IconUser',
        fields: [
            { key: 'party.name', label: 'Party Name', example: 'John Electronics' },
            { key: 'party.address', label: 'Party Address', example: '456 Market Road' },
            { key: 'party.phone', label: 'Party Phone', example: '+91 99887 76655' },
            { key: 'party.email', label: 'Party Email', example: 'john@example.com' },
            { key: 'party.gstin', label: 'Party GSTIN', example: '29AADCB2230M1ZP' },
        ],
    },
    {
        name: 'Invoice',
        icon: 'IconFileInvoice',
        fields: [
            { key: 'voucher_no', label: 'Invoice Number', example: 'INV-2024-001' },
            { key: 'voucher_date', label: 'Invoice Date', example: '2024-01-15', format: 'date' },
            { key: 'reference', label: 'Reference', example: 'PO-12345' },
            { key: 'narration', label: 'Notes/Narration', example: 'Payment due in 30 days' },
        ],
    },
    {
        name: 'Totals',
        icon: 'IconCalculator',
        fields: [
            { key: 'subtotal', label: 'Subtotal', example: '10,000.00', format: 'currency' },
            { key: 'discount_amount', label: 'Discount', example: '500.00', format: 'currency' },
            { key: 'discount_rate', label: 'Discount %', example: '5', format: 'number' },
            { key: 'tax_total', label: 'Total Tax', example: '1,710.00', format: 'currency' },
            { key: 'grand_total', label: 'Grand Total', example: '11,210.00', format: 'currency' },
            { key: 'grand_total_words', label: 'Amount in Words', example: 'Eleven Thousand Two Hundred Ten Rupees' },
        ],
    },
    {
        name: 'Balance',
        icon: 'IconScale',
        fields: [
            { key: 'old_balance', label: 'Old Balance', example: '5,000.00', format: 'currency' },
            { key: 'total_balance', label: 'Total Balance', example: '16,210.00', format: 'currency' },
            { key: 'paid_amount', label: 'Paid Amount', example: '3,000.00', format: 'currency' },
            { key: 'balance_due', label: 'Balance Due', example: '13,210.00', format: 'currency' },
        ],
    },
    {
        name: 'Bank',
        icon: 'IconBuildingBank',
        fields: [
            { key: 'bank.name', label: 'Bank Name', example: 'State Bank of India' },
            { key: 'bank.account_no', label: 'Account Number', example: '1234567890' },
            { key: 'bank.ifsc', label: 'IFSC Code', example: 'SBIN0001234' },
            { key: 'bank.branch', label: 'Branch', example: 'Main Branch' },
        ],
    },
    {
        name: 'Other',
        icon: 'IconFileText',
        fields: [
            { key: 'terms_and_conditions', label: 'Terms & Conditions', example: 'Goods once sold will not be returned' },
        ],
    },
];

/**
 * Item table columns available for the items table element.
 */
export const ITEM_TABLE_COLUMNS = [
    { key: 'serial_no', label: 'S.No', defaultWidth: 5, align: 'center' as const, format: 'text' as const },
    { key: 'product_name', label: 'Product Name', defaultWidth: 25, align: 'left' as const, format: 'text' as const },
    { key: 'description', label: 'Description', defaultWidth: 15, align: 'left' as const, format: 'text' as const },
    { key: 'hsn_code', label: 'HSN/SAC', defaultWidth: 8, align: 'center' as const, format: 'text' as const },
    { key: 'initial_quantity', label: 'Qty', defaultWidth: 7, align: 'right' as const, format: 'number' as const },
    { key: 'count', label: 'Count', defaultWidth: 7, align: 'right' as const, format: 'number' as const },
    { key: 'less_quantity', label: 'Deduction', defaultWidth: 8, align: 'right' as const, format: 'number' as const },
    { key: 'final_quantity', label: 'Final Qty', defaultWidth: 8, align: 'right' as const, format: 'number' as const },
    { key: 'rate', label: 'Rate', defaultWidth: 10, align: 'right' as const, format: 'currency' as const },
    { key: 'amount', label: 'Amount', defaultWidth: 10, align: 'right' as const, format: 'currency' as const },
    { key: 'tax_rate', label: 'Tax %', defaultWidth: 6, align: 'center' as const, format: 'number' as const },
    { key: 'tax_amount', label: 'Tax Amt', defaultWidth: 8, align: 'right' as const, format: 'currency' as const },
    { key: 'total', label: 'Total', defaultWidth: 10, align: 'right' as const, format: 'currency' as const },
];

/**
 * Get all fields as a flat list.
 */
export function getAllFields() {
    return DATA_FIELD_CATALOG.flatMap(cat => cat.fields);
}

/**
 * Find a field by its key.
 */
export function getFieldByKey(key: string) {
    return getAllFields().find(f => f.key === key);
}
