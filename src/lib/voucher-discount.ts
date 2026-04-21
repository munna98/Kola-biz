export interface VoucherDiscountLineInput {
  initial_quantity: number;
  count: number;
  deduction_per_unit: number;
  rate: number;
  discount_amount?: number;
}

export interface VoucherDiscountLineResult {
  finalQty: number;
  grossAmount: number;
  itemDiscountAmount: number;
  netBeforeInvoiceDiscount: number;
  invoiceDiscountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  total: number;
}

export interface VoucherDiscountCalculationResult {
  subtotal: number;
  discountRate: number;
  discountAmount: number;
  tax: number;
  grandTotal: number;
  lines: VoucherDiscountLineResult[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function normalizeInvoiceDiscount(
  subtotalBeforeInvoiceDiscount: number,
  discountRate?: number,
  discountAmount?: number
) {
  let resolvedRate = discountRate ?? 0;
  let resolvedAmount = discountAmount ?? 0;

  if (resolvedAmount <= 0 && resolvedRate > 0 && subtotalBeforeInvoiceDiscount > 0) {
    resolvedAmount = round2(subtotalBeforeInvoiceDiscount * (resolvedRate / 100));
  } else if (resolvedAmount > 0 && subtotalBeforeInvoiceDiscount > 0) {
    resolvedRate = round2((resolvedAmount / subtotalBeforeInvoiceDiscount) * 100);
  }

  resolvedAmount = round2(Math.min(resolvedAmount, Math.max(subtotalBeforeInvoiceDiscount, 0)));
  return { discountRate: resolvedRate, discountAmount: resolvedAmount };
}

export function allocateInvoiceDiscount(lineBases: number[], totalInvoiceDiscount: number) {
  if (!lineBases.length || totalInvoiceDiscount <= 0) {
    return lineBases.map(() => 0);
  }

  const subtotal = lineBases.reduce((sum, base) => sum + Math.max(base, 0), 0);
  if (subtotal <= 0) {
    return lineBases.map(() => 0);
  }

  let allocated = 0;
  return lineBases.map((base, index) => {
    const normalizedBase = Math.max(base, 0);
    const allocation =
      index === lineBases.length - 1
        ? round2(Math.max(totalInvoiceDiscount - allocated, 0))
        : round2(totalInvoiceDiscount * (normalizedBase / subtotal));
    const capped = Math.min(allocation, round2(normalizedBase));
    allocated = round2(allocated + capped);
    return capped;
  });
}

export function calculateVoucherDiscounts<T extends VoucherDiscountLineInput>(
  items: T[],
  options: {
    discountRate?: number;
    discountAmount?: number;
    taxInclusive: boolean;
    resolveGstRate: (item: T) => number;
  }
): VoucherDiscountCalculationResult {
  const preparedLines = items.map((item) => {
    const finalQty = item.initial_quantity - item.count * item.deduction_per_unit;
    const grossAmount = round2(finalQty * item.rate);
    const itemDiscountAmount = round2(item.discount_amount || 0);
    const gstRate = options.resolveGstRate(item);

    if (options.taxInclusive) {
      const divisor = 1 + gstRate / 100;
      const netInclusive = round2(Math.max(grossAmount - itemDiscountAmount, 0));
      const netBeforeInvoiceDiscount = divisor > 0 ? round2(netInclusive / divisor) : netInclusive;
      return { finalQty, grossAmount, itemDiscountAmount, netBeforeInvoiceDiscount, gstRate };
    }

    return {
      finalQty,
      grossAmount,
      itemDiscountAmount,
      netBeforeInvoiceDiscount: round2(Math.max(grossAmount - itemDiscountAmount, 0)),
      gstRate,
    };
  });

  const subtotal = round2(
    preparedLines.reduce((sum, line) => sum + line.netBeforeInvoiceDiscount, 0)
  );
  const normalized = normalizeInvoiceDiscount(subtotal, options.discountRate, options.discountAmount);
  const allocations = allocateInvoiceDiscount(
    preparedLines.map((line) => line.netBeforeInvoiceDiscount),
    normalized.discountAmount
  );

  const lines = preparedLines.map((line, index) => {
    const taxableAmount = round2(
      Math.max(line.netBeforeInvoiceDiscount - allocations[index], 0)
    );
    const taxAmount = round2(taxableAmount * (line.gstRate / 100));
    return {
      finalQty: line.finalQty,
      grossAmount: line.grossAmount,
      itemDiscountAmount: line.itemDiscountAmount,
      netBeforeInvoiceDiscount: line.netBeforeInvoiceDiscount,
      invoiceDiscountAmount: allocations[index],
      taxableAmount,
      taxAmount,
      total: round2(taxableAmount + taxAmount),
    };
  });

  const totalTax = round2(lines.reduce((sum, line) => sum + line.taxAmount, 0));
  return {
    subtotal,
    discountRate: normalized.discountRate,
    discountAmount: normalized.discountAmount,
    tax: totalTax,
    grandTotal: round2(subtotal - normalized.discountAmount + totalTax),
    lines,
  };
}
