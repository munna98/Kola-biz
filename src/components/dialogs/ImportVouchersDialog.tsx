import { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  IconFileUpload,
  IconDownload,
  IconTrash,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconLoader2,
  IconCircleCheck,
  IconFileSpreadsheet,
  IconChevronRight,
} from '@tabler/icons-react';

// ─── Types ─────────────────────────────────────────────────────────────────

export type VoucherTypeKey =
  | 'sales_invoice'
  | 'purchase_invoice'
  | 'sales_quotation'
  | 'delivery_note'
  | 'sales_return'
  | 'purchase_return';

interface ImportVouchersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucherType: VoucherTypeKey;
}

interface ExcelRow {
  rowIndex: number;
  voucherNo: string;
  voucherDate: string;
  partyCode: string;
  productCode: string;
  quantity: number;
  unitRate: number;
  taxMode: string; // 'exclusive' | 'inclusive' | 'no_tax' | 'margin_scheme'
  taxRate: number | null;
  discountPercent: number | null;
  isMarginScheme: boolean;
  purchaseCost: number | null;
  reference: string;
  narration: string;
}

interface VoucherGroup {
  voucherNo: string;
  voucherDate: string;
  partyCode: string;
  reference: string;
  narration: string;
  taxInclusive: boolean;
  gstDisabled: boolean;
  isMarginScheme: boolean;
  rows: ExcelRow[];
  errors: string[];
  partyId: string | null;
  partyName: string | null;
  partyType: string | null;
}

interface PartyRecord {
  id: string;
  account_code: string;
  account_name: string;
  account_group: string;
}

interface ProductRecord {
  id: string;
  code: string;
  name: string;
  purchase_rate: number;
  gst_slab_id?: string;
}

type Step = 1 | 2 | 3 | 4;

// ─── Config ────────────────────────────────────────────────────────────────

const VOUCHER_LABELS: Record<VoucherTypeKey, string> = {
  sales_invoice: 'Sales Invoice',
  purchase_invoice: 'Purchase Invoice',
  sales_quotation: 'Sales Quotation',
  delivery_note: 'Delivery Note',
  sales_return: 'Sales Return',
  purchase_return: 'Purchase Return',
};

const VOUCHER_COMMANDS: Record<VoucherTypeKey, string> = {
  sales_invoice: 'create_sales_invoice',
  purchase_invoice: 'create_purchase_invoice',
  sales_quotation: 'create_sales_quotation',
  delivery_note: 'create_delivery_note',
  sales_return: 'create_sales_return',
  purchase_return: 'create_purchase_return',
};

const PARTY_FIELD: Record<VoucherTypeKey, string> = {
  sales_invoice: 'customer_id',
  purchase_invoice: 'supplier_id',
  sales_quotation: 'customer_id',
  delivery_note: 'customer_id',
  sales_return: 'customer_id',
  purchase_return: 'supplier_id',
};

const PARTY_TYPE: Record<VoucherTypeKey, string> = {
  sales_invoice: 'customer',
  purchase_invoice: 'supplier',
  sales_quotation: 'customer',
  delivery_note: 'customer',
  sales_return: 'customer',
  purchase_return: 'supplier',
};

// Expected groups to load parties from (customer = AR, supplier = AP)
const PARTY_GROUPS: Record<VoucherTypeKey, string[]> = {
  sales_invoice: ['Accounts Receivable', 'Cash', 'Bank Account'],
  purchase_invoice: ['Accounts Payable', 'Cash', 'Bank Account'],
  sales_quotation: ['Accounts Receivable', 'Cash', 'Bank Account'],
  delivery_note: ['Accounts Receivable', 'Cash', 'Bank Account'],
  sales_return: ['Accounts Receivable', 'Cash', 'Bank Account'],
  purchase_return: ['Accounts Payable', 'Cash', 'Bank Account'],
};

const SAMPLE_ROWS = [
  {
    'Voucher No': 'INV-2024-001',
    'Voucher Date': '2024-04-15',
    'Party Code': 'CUST-001',
    'Product Code': 'PRD-001',
    'Quantity': 10,
    'Unit Rate': 500,
    'Tax Mode': 'Exclusive',
    'Tax Rate %': 18,
    'Discount %': 0,
    'Is Margin Scheme': 'No',
    'Purchase Cost': '',
    'Reference': 'PO-001',
    'Narration': 'Historical import',
  },
  {
    'Voucher No': 'INV-2024-001',
    'Voucher Date': '2024-04-15',
    'Party Code': 'CUST-001',
    'Product Code': 'PRD-002',
    'Quantity': 5,
    'Unit Rate': 200,
    'Tax Mode': 'Exclusive',
    'Tax Rate %': 12,
    'Discount %': 5,
    'Is Margin Scheme': 'No',
    'Purchase Cost': '',
    'Reference': 'PO-001',
    'Narration': 'Historical import',
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseExcelDate(val: unknown): string {
  if (val == null || val === '') return '';
  if (typeof val === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, '0');
      const d = String(date.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const str = String(val).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }
  // DD-MM-YYYY
  const dmyDash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) {
    const d = dmyDash[1].padStart(2, '0');
    const m = dmyDash[2].padStart(2, '0');
    const y = dmyDash[3];
    return `${y}-${m}-${d}`;
  }
  return str;
}

function normalizeTaxMode(val: unknown): string {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'inclusive' || s === 'yes') return 'inclusive';
  if (s === 'no tax' || s === 'exempt' || s === 'none') return 'no_tax';
  if (s === 'margin scheme' || s === 'margin') return 'margin_scheme';
  return 'exclusive'; // default
}

function parseYesNo(val: unknown): boolean {
  const s = String(val || '').trim().toLowerCase();
  return s === 'yes' || s === '1' || s === 'true';
}

function parseOptionalNumber(val: unknown): number | null {
  if (val == null || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function parseRow(raw: Record<string, unknown>, rowIndex: number): ExcelRow {
  const voucherNo = String(
    raw['Voucher No'] ?? raw['Invoice No'] ?? raw['Voucher Number'] ?? raw['Invoice Number'] ?? ''
  ).trim();
  const voucherDate = parseExcelDate(raw['Voucher Date'] ?? raw['Invoice Date'] ?? raw['Date']);
  const partyCode = String(raw['Party Code'] ?? raw['Customer Code'] ?? raw['Supplier Code'] ?? '').trim();
  const productCode = String(raw['Product Code'] ?? raw['Item Code'] ?? '').trim();
  const quantity = Number(raw['Quantity'] ?? raw['Qty'] ?? 0);
  const unitRate = Number(raw['Unit Rate'] ?? raw['Rate'] ?? raw['Price'] ?? 0);
  const taxMode = normalizeTaxMode(raw['Tax Mode'] ?? raw['Tax']);
  const taxRate = parseOptionalNumber(raw['Tax Rate %'] ?? raw['Tax Rate'] ?? raw['GST %'] ?? raw['GST Rate']);
  const discountPercent = parseOptionalNumber(raw['Discount %'] ?? raw['Discount']);
  const isMarginScheme = parseYesNo(raw['Is Margin Scheme'] ?? raw['Margin Scheme']);
  const purchaseCost = parseOptionalNumber(raw['Purchase Cost'] ?? raw['Cost']);
  const reference = String(raw['Reference'] ?? raw['Ref'] ?? '').trim();
  const narration = String(raw['Narration'] ?? raw['Remarks'] ?? raw['Notes'] ?? '').trim();

  return {
    rowIndex,
    voucherNo,
    voucherDate,
    partyCode,
    productCode,
    quantity,
    unitRate,
    taxMode,
    taxRate,
    discountPercent,
    isMarginScheme,
    purchaseCost,
    reference,
    narration,
  };
}

function groupRowsByVoucher(rows: ExcelRow[]): Map<string, ExcelRow[]> {
  const map = new Map<string, ExcelRow[]>();
  let autoKey = 0;
  rows.forEach(row => {
    const key = row.voucherNo || `__auto_${++autoKey}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  });
  return map;
}

function resolveTaxFlags(rows: ExcelRow[]): { taxInclusive: boolean; gstDisabled: boolean; isMarginScheme: boolean } {
  const anyInclusive = rows.some(r => r.taxMode === 'inclusive');
  const anyNoTax = rows.some(r => r.taxMode === 'no_tax');
  const anyMargin = rows.some(r => r.taxMode === 'margin_scheme' || r.isMarginScheme);
  return {
    taxInclusive: anyInclusive && !anyMargin,
    gstDisabled: anyNoTax && !anyInclusive && !anyMargin,
    isMarginScheme: anyMargin,
  };
}

function buildPayload(
  group: VoucherGroup,
  products: ProductRecord[],
  voucherType: VoucherTypeKey
): Record<string, unknown> {
  const partyField = PARTY_FIELD[voucherType];
  const partyType = PARTY_TYPE[voucherType];

  const items = group.rows.map(row => {
    const product = products.find(p => p.code.toLowerCase() === row.productCode.toLowerCase());
    const productId = product?.id ?? '';
    const taxRate = row.taxRate ?? 0;

    return {
      item_type: 'product',
      product_id: productId,
      service_id: null,
      unit_id: null,
      description: null,
      initial_quantity: row.quantity,
      count: 1,
      deduction_per_unit: 0,
      rate: row.unitRate,
      tax_rate: taxRate,
      discount_percent: row.discountPercent ?? null,
      discount_amount: null,
      remarks: null,
      purchase_cost: group.isMarginScheme
        ? (row.purchaseCost ?? product?.purchase_rate ?? 0)
        : 0,
    };
  });

  const base = {
    voucher_no: group.voucherNo || null,
    [partyField]: group.partyId ?? '',
    party_type: partyType,
    voucher_date: group.voucherDate,
    reference: group.reference || null,
    narration: group.narration || null,
    discount_rate: null,
    discount_amount: null,
    items,
    tax_inclusive: group.taxInclusive,
    gst_disabled: group.gstDisabled,
  };

  // Sales invoice specific
  if (voucherType === 'sales_invoice') {
    return {
      ...base,
      salesperson_id: null,
      is_margin_scheme_invoice: group.isMarginScheme,
      return_items: null,
    };
  }

  // Sales return specific
  if (voucherType === 'sales_return') {
    return {
      ...base,
      is_margin_scheme_invoice: group.isMarginScheme,
    };
  }

  // Quotation specific
  if (voucherType === 'sales_quotation') {
    return {
      ...base,
      salesperson_id: null,
      valid_until: null,
    };
  }

  // Delivery note specific
  if (voucherType === 'delivery_note') {
    return {
      ...base,
      salesperson_id: null,
    };
  }

  return base;
}

// ─── Component ─────────────────────────────────────────────────────────────

// Maps each voucher type to the existing backend list command that returns rows with voucher_no
const VOUCHER_LIST_COMMANDS: Record<VoucherTypeKey, string> = {
  sales_invoice: 'get_sales_invoices',
  purchase_invoice: 'get_purchase_invoices',
  sales_quotation: 'get_sales_quotations',
  delivery_note: 'get_delivery_notes',
  sales_return: 'get_sales_returns',
  purchase_return: 'get_purchase_returns',
};

export default function ImportVouchersDialog({ open, onOpenChange, voucherType }: ImportVouchersDialogProps) {
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [voucherGroups, setVoucherGroups] = useState<VoucherGroup[]>([]);
  const [parties, setParties] = useState<PartyRecord[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [existingVoucherNos, setExistingVoucherNos] = useState<Set<string>>(new Set());
  const [dataLoading, setDataLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importResults, setImportResults] = useState<{ success: number; failed: number; errors: string[] }>({ success: 0, failed: 0, errors: [] });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const label = VOUCHER_LABELS[voucherType];

  // Load parties + products + existing voucher numbers on open
  useEffect(() => {
    if (!open) return;
    setDataLoading(true);
    Promise.all([
      invoke<PartyRecord[]>('get_accounts_by_groups', { groups: PARTY_GROUPS[voucherType] }),
      invoke<ProductRecord[]>('get_products'),
      invoke<{ voucher_no: string }[]>(VOUCHER_LIST_COMMANDS[voucherType]).catch(() => [] as { voucher_no: string }[]),
    ])
      .then(([partyData, productData, existingVouchers]) => {
        setParties(partyData);
        setProducts(productData);
        const nos = new Set(existingVouchers.map(v => v.voucher_no));
        setExistingVoucherNos(nos);
      })
      .catch(err => {
        console.error('ImportVouchersDialog load error:', err);
      })
      .finally(() => setDataLoading(false));
  }, [open, voucherType]);


  const handleClose = useCallback(() => {
    if (importing) return; // prevent close while importing
    setStep(1);
    setFile(null);
    setVoucherGroups([]);
    setImportProgress(0);
    setImportTotal(0);
    setImportResults({ success: 0, failed: 0, errors: [] });
    if (fileInputRef.current) fileInputRef.current.value = '';
    onOpenChange(false);
  }, [importing, onOpenChange]);

  // ── Template Download ──────────────────────────────────────────────────
  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS);
    // Set column widths
    ws['!cols'] = [14, 14, 12, 14, 10, 10, 12, 10, 10, 16, 14, 14, 22].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Template');
    XLSX.writeFile(wb, `${label.replace(/ /g, '_')}_Import_Template.xlsx`);
    toast.success('Template downloaded!');
  };

  // ── File Parsing & Validation ──────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    parseAndValidate(selectedFile);
  };

  const parseAndValidate = (f: File) => {
    setParsing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rawRows.length === 0) {
          toast.error('File has no data rows.');
          setParsing(false);
          return;
        }

        // Build a lookup map for party codes (case-insensitive)
        const partyCodeMap = new Map<string, PartyRecord>();
        parties.forEach(p => partyCodeMap.set(p.account_code.toLowerCase(), p));

        // Build a lookup map for product codes (case-insensitive)
        const productCodeMap = new Map<string, ProductRecord>();
        products.forEach(p => productCodeMap.set(p.code.toLowerCase(), p));

        // Parse rows
        const parsedRows = rawRows.map((raw, idx) => parseRow(raw as Record<string, unknown>, idx + 2));

        // Group by voucher number
        const grouped = groupRowsByVoucher(parsedRows);

        const groups: VoucherGroup[] = [];
        for (const [voucherNo, rows] of grouped) {
          const firstRow = rows[0];
          const errors: string[] = [];

          // Date required
          if (!firstRow.voucherDate) {
            errors.push(`Row ${firstRow.rowIndex}: Voucher Date is missing or invalid.`);
          }

          // Party code required
          if (!firstRow.partyCode) {
            errors.push(`Row ${firstRow.rowIndex}: Party Code is missing.`);
          } else {
            const party = partyCodeMap.get(firstRow.partyCode.toLowerCase());
            if (!party) {
              errors.push(`Party Code "${firstRow.partyCode}" not found in database. Please check and clean.`);
            }
          }

          // Product codes — validate each row
          rows.forEach(row => {
            if (!row.productCode) {
              errors.push(`Row ${row.rowIndex}: Product Code is missing.`);
            } else {
              const product = productCodeMap.get(row.productCode.toLowerCase());
              if (!product) {
                errors.push(`Row ${row.rowIndex}: Product Code "${row.productCode}" not found in database. Please check and clean.`);
              }
            }
            if (!row.quantity || row.quantity <= 0) {
              errors.push(`Row ${row.rowIndex}: Quantity must be greater than 0.`);
            }
            if (row.unitRate == null || row.unitRate <= 0) {
              errors.push(`Row ${row.rowIndex}: Unit Rate must be greater than 0.`);
            }
          });

          // Duplicate voucher no check
          const displayNo = voucherNo.startsWith('__auto_') ? '(blank)' : voucherNo;
          if (!voucherNo.startsWith('__auto_') && existingVoucherNos.has(voucherNo)) {
            errors.push(`Voucher No "${displayNo}" already exists in the database. Please remove or rename this entry in your file.`);
          }

          const partyRecord = partyCodeMap.get(firstRow.partyCode.toLowerCase());
          const { taxInclusive, gstDisabled, isMarginScheme } = resolveTaxFlags(rows);

          groups.push({
            voucherNo: voucherNo.startsWith('__auto_') ? '' : voucherNo,
            voucherDate: firstRow.voucherDate,
            partyCode: firstRow.partyCode,
            reference: firstRow.reference,
            narration: firstRow.narration,
            taxInclusive,
            gstDisabled,
            isMarginScheme,
            rows,
            errors,
            partyId: partyRecord?.id ?? null,
            partyName: partyRecord?.account_name ?? null,
            partyType: partyRecord?.account_group ?? null,
          });
        }

        setVoucherGroups(groups);
        setStep(2);
      } catch (err) {
        toast.error('Failed to parse file. Please check the format.');
        console.error(err);
      } finally {
        setParsing(false);
      }
    };
    reader.readAsArrayBuffer(f);
  };

  // ── Import ────────────────────────────────────────────────────────────
  const hasErrors = voucherGroups.some(g => g.errors.length > 0);

  const handleImport = async () => {
    if (hasErrors) return;
    setImporting(true);
    setStep(3);
    setImportTotal(voucherGroups.length);
    setImportProgress(0);

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < voucherGroups.length; i++) {
      const group = voucherGroups[i];
      try {
        const payload = buildPayload(group, products, voucherType);
        const commandName = VOUCHER_COMMANDS[voucherType];

        // Sales invoice uses 'invoice' key, purchase invoice uses 'invoice' key,
        // quotation uses 'quotation' key, delivery note uses 'note' key,
        // sales_return uses 'invoice' key, purchase_return uses 'invoice' key
        let argKey = 'invoice';
        if (voucherType === 'sales_quotation') argKey = 'quotation';
        if (voucherType === 'delivery_note') argKey = 'note';

        await invoke(commandName, { [argKey]: payload });
        successCount++;
      } catch (err: unknown) {
        failedCount++;
        const displayNo = group.voucherNo || `(auto #${i + 1})`;
        errors.push(`Voucher "${displayNo}": ${String(err)}`);
      }
      setImportProgress(i + 1);
    }

    setImportResults({ success: successCount, failed: failedCount, errors });
    setImporting(false);
    setStep(4);
  };

  const validCount = voucherGroups.filter(g => g.errors.length === 0).length;
  const invalidCount = voucherGroups.filter(g => g.errors.length > 0).length;
  const totalItems = voucherGroups.reduce((sum, g) => sum + g.rows.length, 0);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <IconFileSpreadsheet size={20} className="text-primary" />
            Import {label}s
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Import historical data from an Excel or CSV file. Rows are matched by Party Code and Product Code.
          </DialogDescription>
          {/* Step indicator */}
          <div className="flex items-center gap-1 mt-3">
            {(['Upload', 'Validate', 'Import', 'Done'] as const).map((stepLabel, idx) => {
              const stepNum = (idx + 1) as Step;
              const active = step === stepNum;
              const done = step > stepNum;
              return (
                <div key={stepLabel} className="flex items-center gap-1">
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors
                    ${active ? 'bg-primary text-primary-foreground' : done ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {done ? <IconCheck size={12} /> : <span>{stepNum}</span>}
                    {stepLabel}
                  </div>
                  {idx < 3 && <IconChevronRight size={14} className="text-muted-foreground" />}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">

          {/* ── STEP 1: Upload ── */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              {dataLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-4 py-2 rounded-lg">
                  <IconLoader2 size={15} className="animate-spin" /> Loading party and product data…
                </div>
              )}

              {/* Drop zone */}
              <div
                className={`relative flex flex-col items-center justify-center gap-4 w-full border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all
                  ${parsing ? 'opacity-60 pointer-events-none' : 'hover:border-primary/60 hover:bg-primary/5 border-muted-foreground/30 bg-muted/10'}`}
                onClick={() => !parsing && fileInputRef.current?.click()}
              >
                {parsing ? (
                  <IconLoader2 size={44} className="text-primary animate-spin" />
                ) : (
                  <IconFileUpload size={44} className="text-muted-foreground" />
                )}
                <div>
                  <p className="text-base font-semibold">{parsing ? 'Parsing file…' : 'Click to Upload'}</p>
                  <p className="text-sm text-muted-foreground mt-1">Supports .xlsx, .xls, .csv</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {/* Template download */}
              <div className="flex items-center justify-between bg-muted/20 border rounded-xl px-5 py-4">
                <div>
                  <p className="font-medium text-sm">Need a template?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Download a pre-formatted sample Excel file for <strong>{label}</strong> imports.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <IconDownload size={14} className="mr-1.5" /> Download Template
                </Button>
              </div>

              {/* Schema cheatsheet */}
              <div className="bg-muted/10 border rounded-xl p-4">
                <p className="text-xs font-semibold text-foreground mb-2">Required Columns</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {[
                    ['Voucher No', 'Recommended — groups rows into one voucher'],
                    ['Voucher Date', 'Required — YYYY-MM-DD or DD/MM/YYYY'],
                    ['Party Code', 'Required — matches account_code in database'],
                    ['Product Code', 'Required — matches product code in database'],
                    ['Quantity', 'Required — item quantity (> 0)'],
                    ['Unit Rate', 'Required — price per unit (> 0)'],
                    ['Tax Mode', 'Optional — Exclusive (default) / Inclusive / No Tax'],
                    ['Tax Rate %', 'Optional — defaults to product GST rate'],
                    ['Discount %', 'Optional — item-level discount'],
                    ['Is Margin Scheme', 'Optional — Yes / No'],
                  ].map(([col, desc]) => (
                    <div key={col} className="flex gap-2 text-xs py-0.5">
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground shrink-0">{col}</span>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Validate ── */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              {/* Summary bar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm bg-muted/40 border rounded-lg px-3 py-1.5">
                  <IconFileSpreadsheet size={15} className="text-muted-foreground" />
                  <span className="font-medium">{file?.name}</span>
                </div>
                <div className="flex gap-2 ml-auto flex-wrap">
                  <span className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 rounded-full px-3 py-1 font-medium">
                    {validCount} valid
                  </span>
                  {invalidCount > 0 && (
                    <span className="text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-full px-3 py-1 font-medium">
                      {invalidCount} with errors
                    </span>
                  )}
                  <span className="text-xs bg-muted text-muted-foreground rounded-full px-3 py-1">
                    {totalItems} line items
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setFile(null); setVoucherGroups([]); setStep(1); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                  <IconTrash size={14} className="mr-1 text-destructive" /> Remove
                </Button>
              </div>

              {/* Error banner if any */}
              {hasErrors && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 flex items-start gap-3">
                  <IconAlertTriangle size={18} className="text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm text-destructive">Fix all errors before importing</p>
                    <p className="text-xs text-destructive/80 mt-0.5">
                      The entire file must be clean before you can proceed. Correct the errors in your Excel file and re-upload.
                    </p>
                  </div>
                </div>
              )}

              {/* Voucher groups table */}
              <div className="border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_1fr_auto_auto] bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground border-b">
                  <div>Voucher No</div>
                  <div>Date</div>
                  <div>Party</div>
                  <div className="text-center">Items</div>
                  <div className="text-center">Status</div>
                </div>
                <div className="max-h-64 overflow-auto divide-y">
                  {voucherGroups.map((group, idx) => (
                    <div key={idx}>
                      <div className={`grid grid-cols-[1fr_1fr_1fr_auto_auto] px-4 py-3 text-sm items-center gap-2
                        ${group.errors.length > 0 ? 'bg-destructive/5' : 'hover:bg-muted/30'}`}>
                        <div className="font-mono text-xs">{group.voucherNo || <span className="text-muted-foreground italic">auto</span>}</div>
                        <div className="text-muted-foreground text-xs">{group.voucherDate || '—'}</div>
                        <div className="text-xs truncate" title={group.partyName || group.partyCode}>
                          {group.partyName
                            ? <><span className="text-foreground">{group.partyName}</span> <span className="text-muted-foreground">({group.partyCode})</span></>
                            : <span className="text-destructive">{group.partyCode}</span>
                          }
                        </div>
                        <div className="text-center text-xs text-muted-foreground">{group.rows.length}</div>
                        <div className="flex justify-center">
                          {group.errors.length === 0
                            ? <IconCheck size={16} className="text-emerald-500" />
                            : <IconX size={16} className="text-destructive" />
                          }
                        </div>
                      </div>
                      {group.errors.length > 0 && (
                        <div className="px-4 pb-3 space-y-1">
                          {group.errors.map((err, ei) => (
                            <p key={ei} className="text-xs text-destructive flex items-start gap-1.5">
                              <IconAlertTriangle size={12} className="mt-0.5 shrink-0" />{err}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: Importing ── */}
          {step === 3 && (
            <div className="flex flex-col items-center gap-6 py-8">
              <IconLoader2 size={52} className="text-primary animate-spin" />
              <div className="text-center">
                <p className="font-semibold text-base">Importing {label}s…</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {importProgress} of {importTotal} vouchers processed
                </p>
              </div>
              {/* Progress bar */}
              <div className="w-full max-w-sm bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-300"
                  style={{ width: importTotal > 0 ? `${(importProgress / importTotal) * 100}%` : '0%' }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Do not close this window</p>
            </div>
          )}

          {/* ── STEP 4: Summary ── */}
          {step === 4 && (
            <div className="flex flex-col gap-5">
              <div className={`flex items-center gap-3 p-4 rounded-xl border
                ${importResults.failed === 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                {importResults.failed === 0
                  ? <IconCircleCheck size={32} className="text-emerald-500 shrink-0" />
                  : <IconAlertTriangle size={32} className="text-amber-500 shrink-0" />
                }
                <div>
                  <p className="font-semibold">
                    {importResults.failed === 0 ? 'Import Complete!' : 'Import Finished with Some Errors'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">{importResults.success} voucher{importResults.success !== 1 ? 's' : ''} imported</span>
                    {importResults.failed > 0 && (
                      <> · <span className="text-destructive font-medium">{importResults.failed} failed</span></>
                    )}
                  </p>
                </div>
              </div>

              {importResults.errors.length > 0 && (
                <div className="border rounded-xl overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
                    Failed Vouchers
                  </div>
                  <div className="max-h-56 overflow-auto divide-y">
                    {importResults.errors.map((err, i) => (
                      <div key={i} className="px-4 py-3 text-xs text-destructive flex items-start gap-2">
                        <IconX size={13} className="mt-0.5 shrink-0" />{err}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importResults.success > 0 && (
                <p className="text-xs text-muted-foreground">
                  Vouchers have been posted. Journal entries, stock movements, and GST ledgers have been updated accordingly.
                  Vouchers are saved with <strong>Unpaid</strong> status — record payment entries separately if needed.
                </p>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex justify-between items-center bg-card">
          <Button variant="ghost" onClick={handleClose} disabled={importing}>
            {step === 4 ? 'Close' : 'Cancel'}
          </Button>
          <div className="flex gap-2">
            {step === 2 && (
              <>
                <Button variant="outline" onClick={() => { setStep(1); setFile(null); setVoucherGroups([]); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                  ← Back
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={hasErrors || voucherGroups.length === 0}
                  className="min-w-[180px]"
                >
                  Import {validCount} Voucher{validCount !== 1 ? 's' : ''} →
                </Button>
              </>
            )}
            {step === 4 && (
              <Button onClick={handleClose} className="min-w-[100px]">
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
