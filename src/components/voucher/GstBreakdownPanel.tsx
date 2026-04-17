/**
 * GstBreakdownPanel
 * 
 * Renders a live CGST / SGST / IGST breakdown from invoice line items.
 * 
 * Props:
 *  - items: the current voucher line items (from Redux state)
 *  - products: full product list (to map gst_slab_id + hsn_sac_code)
 *  - gstSlabs: all available GstTaxSlab records
 *  - isInterState: whether the sale crosses state lines (true → IGST, false → CGST+SGST)
 *  - className: optional extra classes
 */

import { useMemo } from 'react';
import { GstTaxSlab, Product } from '@/lib/tauri';
import { Badge } from '@/components/ui/badge';

interface LineItem {
  product_id: string | number;
  initial_quantity: number;
  count: number;
  deduction_per_unit: number;
  rate: number;
  discount_amount?: number;
  tax_rate?: number; // legacy tax_rate (may be 0 / overridden by slab)
}

interface GstBreakdownPanelProps {
  items: LineItem[];
  products: Product[];
  gstSlabs: GstTaxSlab[];
  isInterState?: boolean;
  className?: string;
}

interface TaxLine {
  hsnSacCode: string;
  slabName: string;
  gstRate: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
}

/** Resolve the effective GST rate for a product given its slab and per-unit rate. */
function resolveGstRate(slab: GstTaxSlab | undefined, ratePerUnit: number): number {
  if (!slab) return 0;
  if (slab.is_dynamic === 1) {
    return ratePerUnit < slab.threshold ? slab.below_rate : slab.above_rate;
  }
  return slab.fixed_rate;
}

export function GstBreakdownPanel({
  items,
  products,
  gstSlabs,
  isInterState = false,
  className = '',
}: GstBreakdownPanelProps) {
  // Build product lookup map
  const productMap = useMemo(() => {
    const m: Record<string, Product> = {};
    products.forEach(p => { m[String(p.id)] = p; });
    return m;
  }, [products]);

  // Build slab lookup map
  const slabMap = useMemo(() => {
    const m: Record<string, GstTaxSlab> = {};
    gstSlabs.forEach(s => { m[s.id] = s; });
    return m;
  }, [gstSlabs]);

  // Compute tax lines grouped by HSN/SAC + rate
  const taxLines = useMemo<TaxLine[]>(() => {
    const buckets = new Map<string, TaxLine>();

    items.forEach(item => {
      const product = productMap[String(item.product_id)];
      if (!product) return;

      const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
      if (finalQty <= 0) return;

      const grossAmount = finalQty * item.rate;
      const discount = item.discount_amount || 0;
      const taxableValue = Math.max(0, grossAmount - discount);

      if (taxableValue === 0) return;

      const slab = product.gst_slab_id ? slabMap[product.gst_slab_id] : undefined;
      const gstRate = resolveGstRate(slab, item.rate);
      const hsnKey = product.hsn_sac_code || '';
      const slabName = slab?.name || 'NIL';
      const bucketKey = `${hsnKey}|${gstRate}|${slabName}`;

      const totalTax = taxableValue * (gstRate / 100);
      const halfTax = totalTax / 2;

      const existing = buckets.get(bucketKey);
      if (existing) {
        existing.taxableValue += taxableValue;
        if (isInterState) {
          existing.igst += totalTax;
        } else {
          existing.cgst += halfTax;
          existing.sgst += halfTax;
        }
        existing.totalTax += totalTax;
      } else {
        buckets.set(bucketKey, {
          hsnSacCode: hsnKey,
          slabName,
          gstRate,
          taxableValue,
          cgst: isInterState ? 0 : halfTax,
          sgst: isInterState ? 0 : halfTax,
          igst: isInterState ? totalTax : 0,
          totalTax,
        });
      }
    });

    return Array.from(buckets.values()).filter(l => l.gstRate > 0);
  }, [items, productMap, slabMap, isInterState]);

  const totals = useMemo(() => ({
    taxable: taxLines.reduce((s, l) => s + l.taxableValue, 0),
    cgst: taxLines.reduce((s, l) => s + l.cgst, 0),
    sgst: taxLines.reduce((s, l) => s + l.sgst, 0),
    igst: taxLines.reduce((s, l) => s + l.igst, 0),
    total: taxLines.reduce((s, l) => s + l.totalTax, 0),
  }), [taxLines]);

  const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (taxLines.length === 0) return null;

  return (
    <div className={`rounded-lg border bg-card overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">GST Breakdown</span>
        <Badge variant={isInterState ? 'secondary' : 'outline'} className="text-[10px]">
          {isInterState ? 'IGST (Inter-State)' : 'CGST + SGST (Intra-State)'}
        </Badge>
      </div>

      {/* Table */}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/20 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-medium">HSN/SAC</th>
            <th className="px-3 py-1.5 font-medium">Category</th>
            <th className="px-3 py-1.5 font-medium text-right">Rate</th>
            <th className="px-3 py-1.5 font-medium text-right">Taxable Value</th>
            {!isInterState && (
              <>
                <th className="px-3 py-1.5 font-medium text-right">CGST</th>
                <th className="px-3 py-1.5 font-medium text-right">SGST</th>
              </>
            )}
            {isInterState && (
              <th className="px-3 py-1.5 font-medium text-right">IGST</th>
            )}
            <th className="px-3 py-1.5 font-medium text-right">Total Tax</th>
          </tr>
        </thead>
        <tbody>
          {taxLines.map((line, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/10">
              <td className="px-3 py-1.5 font-mono">{line.hsnSacCode || '—'}</td>
              <td className="px-3 py-1.5">{line.slabName}</td>
              <td className="px-3 py-1.5 text-right font-medium">{line.gstRate}%</td>
              <td className="px-3 py-1.5 text-right font-mono">₹{fmt(line.taxableValue)}</td>
              {!isInterState && (
                <>
                  <td className="px-3 py-1.5 text-right font-mono text-blue-600 dark:text-blue-400">₹{fmt(line.cgst)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-purple-600 dark:text-purple-400">₹{fmt(line.sgst)}</td>
                </>
              )}
              {isInterState && (
                <td className="px-3 py-1.5 text-right font-mono text-amber-600 dark:text-amber-400">₹{fmt(line.igst)}</td>
              )}
              <td className="px-3 py-1.5 text-right font-mono font-semibold">₹{fmt(line.totalTax)}</td>
            </tr>
          ))}
        </tbody>
        {/* Totals row */}
        <tfoot>
          <tr className="bg-muted/30 font-semibold border-t-2">
            <td className="px-3 py-1.5" colSpan={3}>Total</td>
            <td className="px-3 py-1.5 text-right font-mono">₹{fmt(totals.taxable)}</td>
            {!isInterState && (
              <>
                <td className="px-3 py-1.5 text-right font-mono text-blue-600 dark:text-blue-400">₹{fmt(totals.cgst)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-purple-600 dark:text-purple-400">₹{fmt(totals.sgst)}</td>
              </>
            )}
            {isInterState && (
              <td className="px-3 py-1.5 text-right font-mono text-amber-600 dark:text-amber-400">₹{fmt(totals.igst)}</td>
            )}
            <td className="px-3 py-1.5 text-right font-mono text-green-600 dark:text-green-400">₹{fmt(totals.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
