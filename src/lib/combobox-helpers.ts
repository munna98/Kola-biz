import type { Product, ProductGroup, ProductBrand } from './tauri';

export interface ProductComboboxDisplaySettings {
  show_part_number: boolean;
  show_barcode: boolean;
  show_sales_rate: boolean;
  show_purchase_rate: boolean;
  show_mrp: boolean;
  show_stock: boolean;
  show_group: boolean;
  show_brand: boolean;
}

export const DEFAULT_COMBOBOX_DISPLAY_SETTINGS: ProductComboboxDisplaySettings = {
  show_part_number: true,
  show_barcode: true,
  show_sales_rate: false,
  show_purchase_rate: false,
  show_mrp: false,
  show_stock: false,
  show_group: false,
  show_brand: false,
};

export interface ProductComboboxColumnWidths {
  code?: number;
  product_name?: number;
  part_number?: number;
  barcode?: number;
  sales_rate?: number;
  purchase_rate?: number;
  mrp?: number;
  stock?: number;
  group?: number;
  brand?: number;
}

export const DEFAULT_COMBOBOX_COLUMN_WIDTHS: Required<ProductComboboxColumnWidths> = {
  code: 70,
  product_name: 240,
  part_number: 100,
  barcode: 100,
  sales_rate: 80,
  purchase_rate: 80,
  mrp: 80,
  stock: 65,
  group: 100,
  brand: 100,
};

export interface ComboboxHeaderColumn {
  key: string;
  label: string;
  widthPx: number;
  align?: 'left' | 'right' | 'center';
}

export function getProductComboboxHeaderColumns(
  displaySettings: ProductComboboxDisplaySettings = DEFAULT_COMBOBOX_DISPLAY_SETTINGS,
  columnWidths: ProductComboboxColumnWidths = DEFAULT_COMBOBOX_COLUMN_WIDTHS
): ComboboxHeaderColumn[] {
  const widths = { ...DEFAULT_COMBOBOX_COLUMN_WIDTHS, ...columnWidths };
  const cols: ComboboxHeaderColumn[] = [
    { key: 'code', label: 'Code', widthPx: widths.code, align: 'left' },
    { key: 'product_name', label: 'Product', widthPx: widths.product_name, align: 'left' },
  ];

  if (displaySettings.show_part_number) {
    cols.push({ key: 'part_number', label: 'Part #', widthPx: widths.part_number, align: 'left' });
  }
  if (displaySettings.show_barcode) {
    cols.push({ key: 'barcode', label: 'Barcode', widthPx: widths.barcode, align: 'left' });
  }
  if (displaySettings.show_sales_rate) {
    cols.push({ key: 'sales_rate', label: 'S.Rate', widthPx: widths.sales_rate, align: 'right' });
  }
  if (displaySettings.show_purchase_rate) {
    cols.push({ key: 'purchase_rate', label: 'P.Rate', widthPx: widths.purchase_rate, align: 'right' });
  }
  if (displaySettings.show_mrp) {
    cols.push({ key: 'mrp', label: 'MRP', widthPx: widths.mrp, align: 'right' });
  }
  if (displaySettings.show_stock) {
    cols.push({ key: 'stock', label: 'Stock', widthPx: widths.stock, align: 'right' });
  }
  if (displaySettings.show_group) {
    cols.push({ key: 'group', label: 'Group', widthPx: widths.group, align: 'left' });
  }
  if (displaySettings.show_brand) {
    cols.push({ key: 'brand', label: 'Brand', widthPx: widths.brand, align: 'left' });
  }

  return cols;
}

export function getProductComboboxWidthPx(
  displaySettings: ProductComboboxDisplaySettings = DEFAULT_COMBOBOX_DISPLAY_SETTINGS,
  columnWidths: ProductComboboxColumnWidths = DEFAULT_COMBOBOX_COLUMN_WIDTHS
): number {
  const cols = getProductComboboxHeaderColumns(displaySettings, columnWidths);
  const totalColsWidth = cols.reduce((sum, col) => sum + col.widthPx, 0);
  const gapCount = Math.max(0, cols.length - 1);
  const totalGaps = gapCount * 8; // gap-2 between columns = 8px
  const paddingAndIcons = 24 + 16 + 8 + 16; // 24px container padding + 16px check icon + 8px icon margin + 16px scrollbar space
  return Math.max(520, totalColsWidth + totalGaps + paddingAndIcons);
}

export function getProductComboboxWidthClass(
  displaySettings: ProductComboboxDisplaySettings = DEFAULT_COMBOBOX_DISPLAY_SETTINGS,
  columnWidths: ProductComboboxColumnWidths = DEFAULT_COMBOBOX_COLUMN_WIDTHS
): string {
  const widthPx = getProductComboboxWidthPx(displaySettings, columnWidths);
  return `w-[${widthPx}px] max-w-[95vw] min-w-[var(--radix-popover-trigger-width)]`;
}

export interface ProductComboboxOptionInput {
  product: Product;
  groups?: ProductGroup[];
  brands?: ProductBrand[];
  displaySettings?: ProductComboboxDisplaySettings;
  stockMap?: Record<string, number>;
  moneyFormatter?: (amount: number | null | undefined) => string;
}

export function buildProductComboboxOption({
  product: p,
  groups,
  brands,
  displaySettings = DEFAULT_COMBOBOX_DISPLAY_SETTINGS,
  stockMap,
  moneyFormatter = (amt) => (amt !== undefined && amt !== null ? `₹${amt}` : ''),
}: ProductComboboxOptionInput) {
  const columnData: Record<string, string | number | undefined | null> = {};
  const searchItems: (string | undefined | null)[] = [p.code, p.name];

  if (p.code) {
    columnData.code = p.code;
  }

  columnData.product_name = p.name;

  if (displaySettings.show_part_number && p.part_number) {
    columnData.part_number = p.part_number;
    searchItems.push(p.part_number);
  }

  if (displaySettings.show_barcode && p.barcode) {
    columnData.barcode = p.barcode;
    searchItems.push(p.barcode);
  }

  if (displaySettings.show_sales_rate && p.sales_rate !== undefined && p.sales_rate !== null) {
    const sRate = moneyFormatter(p.sales_rate);
    columnData.sales_rate = sRate;
    searchItems.push(`srate:${p.sales_rate}`, sRate);
  }

  if (displaySettings.show_purchase_rate && p.purchase_rate !== undefined && p.purchase_rate !== null) {
    const pRate = moneyFormatter(p.purchase_rate);
    columnData.purchase_rate = pRate;
    searchItems.push(`prate:${p.purchase_rate}`, pRate);
  }

  if (displaySettings.show_mrp && p.mrp !== undefined && p.mrp !== null) {
    const mrpStr = moneyFormatter(p.mrp);
    columnData.mrp = mrpStr;
    searchItems.push(`mrp:${p.mrp}`, mrpStr);
  }

  if (displaySettings.show_stock && stockMap) {
    const currentStock = stockMap[p.id] ?? 0;
    columnData.stock = currentStock;
    searchItems.push(`stock:${currentStock}`);
  }

  if (displaySettings.show_group && p.group_id && groups) {
    const grpName = groups.find((g) => g.id === p.group_id)?.name;
    columnData.group = grpName;
    if (grpName) searchItems.push(grpName);
  }

  if (displaySettings.show_brand && p.brand_id && brands) {
    const brandName = brands.find((b) => b.id === p.brand_id)?.name;
    columnData.brand = brandName;
    if (brandName) searchItems.push(brandName);
  }

  const keywords = searchItems.filter(Boolean) as string[];
  const formattedLabel = p.code ? `${p.code} ${p.name}` : p.name;

  return {
    value: p.id,
    label: formattedLabel,
    itemLabel: p.name,
    columns: columnData,
    searchString: `${formattedLabel} ${keywords.join(' ')}`,
    keywords,
  };
}
