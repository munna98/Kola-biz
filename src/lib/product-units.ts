import type { ProductUnitConversion } from '@/lib/tauri';

export type ProductUnitDefaultKind = 'sale' | 'purchase' | 'report';

export function buildProductUnitMap(conversions: ProductUnitConversion[]) {
  return conversions.reduce<Record<string, ProductUnitConversion[]>>((acc, conversion) => {
    if (!acc[conversion.product_id]) {
      acc[conversion.product_id] = [];
    }

    acc[conversion.product_id].push(conversion);
    return acc;
  }, {});
}

export function getDefaultProductUnitId(
  conversions: ProductUnitConversion[] | undefined,
  defaultKind: ProductUnitDefaultKind,
  fallbackUnitId?: string
) {
  if (!conversions || conversions.length === 0) {
    return fallbackUnitId;
  }

  const defaultConversion =
    conversions.find((conversion) => {
      if (defaultKind === 'sale') return conversion.is_default_sale === 1;
      if (defaultKind === 'purchase') return conversion.is_default_purchase === 1;
      return conversion.is_default_report === 1;
    }) ?? conversions[0];

  return defaultConversion?.unit_id ?? fallbackUnitId;
}

export function getProductUnitConversion(
  conversions: ProductUnitConversion[] | undefined,
  unitId?: string | null
) {
  if (!conversions || !unitId) {
    return undefined;
  }

  return conversions.find((conversion) => conversion.unit_id === unitId);
}

export function getProductUnitRate(
  conversions: ProductUnitConversion[] | undefined,
  unitId: string | null | undefined,
  defaultKind: Exclude<ProductUnitDefaultKind, 'report'>,
  fallbackRate = 0
) {
  const conversion = getProductUnitConversion(conversions, unitId);
  if (!conversion) {
    return fallbackRate;
  }

  return defaultKind === 'sale'
    ? conversion.sales_rate ?? fallbackRate
    : conversion.purchase_rate ?? fallbackRate;
}
