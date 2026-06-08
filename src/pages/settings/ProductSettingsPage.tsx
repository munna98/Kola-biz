import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { IconDeviceFloppy, IconTable, IconListDetails, IconLock, IconAdjustments, IconCloud, IconEye, IconEyeOff } from '@tabler/icons-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProductTableColumns {
  code: boolean;
  hsn_sac_code: boolean;
  group: boolean;
  brand: boolean;
  unit: boolean;
  purchase_rate: boolean;
  sales_rate: boolean;
  mrp: boolean;
  cost: boolean;
  tax_slab: boolean;
  vehicle_manufacturer: boolean;
  vehicle_model: boolean;
  vehicle_year: boolean;
  vehicle_odometer: boolean;
  vehicle_fuel_type: boolean;
  vehicle_transmission: boolean;
  vehicle_owner: boolean;
  vehicle_color: boolean;
}

export interface ProductDialogFields {
  code: boolean;
  group: boolean;
  brand: boolean;
  hsn_sac_code: boolean;
  gst_slab: boolean;
  purchase_rate: boolean;
  sales_rate: boolean;
  mrp: boolean;
  cost: boolean;
  barcode: boolean;
  vehicle_manufacturer: boolean;
  vehicle_model: boolean;
  vehicle_year: boolean;
  vehicle_odometer: boolean;
  vehicle_fuel_type: boolean;
  vehicle_transmission: boolean;
  vehicle_owner: boolean;
  vehicle_color: boolean;
}

export const DEFAULT_TABLE_COLUMNS: ProductTableColumns = {
  code: true,
  hsn_sac_code: true,
  group: true,
  brand: true,
  unit: true,
  purchase_rate: true,
  sales_rate: true,
  mrp: true,
  cost: true,
  tax_slab: true,
  vehicle_manufacturer: false,
  vehicle_model: false,
  vehicle_year: false,
  vehicle_odometer: false,
  vehicle_fuel_type: false,
  vehicle_transmission: false,
  vehicle_owner: false,
  vehicle_color: false,
};

export const DEFAULT_DIALOG_FIELDS: ProductDialogFields = {
  code: true,
  group: true,
  brand: true,
  hsn_sac_code: true,
  gst_slab: true,
  purchase_rate: true,
  sales_rate: true,
  mrp: true,
  cost: true,
  barcode: true,
  vehicle_manufacturer: false,
  vehicle_model: false,
  vehicle_year: false,
  vehicle_odometer: false,
  vehicle_fuel_type: false,
  vehicle_transmission: false,
  vehicle_owner: false,
  vehicle_color: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadSetting<T>(key: string, defaults: T): Promise<T> {
  try {
    const raw = await invoke<string | null>('get_app_setting', { key });
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    // ignore — use defaults
  }
  return defaults;
}

async function saveSetting(key: string, value: unknown) {
  await invoke('set_app_setting', { key, value: JSON.stringify(value) });
}

// ── Column definitions ────────────────────────────────────────────────────────

const TABLE_COLUMN_DEFS: { key: keyof ProductTableColumns; label: string; description: string }[] = [
  { key: 'code', label: 'Code', description: 'Product / SKU code column' },
  { key: 'hsn_sac_code', label: 'HSN Code', description: 'HSN / SAC code for GST purposes' },
  { key: 'group', label: 'Group', description: 'Product group / category' },
  { key: 'brand', label: 'Brand', description: 'Product brand name' },
  { key: 'unit', label: 'Unit', description: 'Base unit of measurement' },
  { key: 'purchase_rate', label: 'Purchase Rate', description: 'Default purchase price' },
  { key: 'sales_rate', label: 'Sales Rate', description: 'Default selling price' },
  { key: 'mrp', label: 'MRP', description: 'Maximum retail price' },
  { key: 'cost', label: 'Cost', description: 'Product cost price column' },
  { key: 'tax_slab', label: 'Tax Slab', description: 'GST tax slab (shown only if GST is enabled)' },
  { key: 'vehicle_manufacturer', label: 'Vehicle Manufacturer', description: 'Vehicle manufacturer column' },
  { key: 'vehicle_model', label: 'Vehicle Model', description: 'Vehicle model column' },
  { key: 'vehicle_year', label: 'Vehicle Year', description: 'Vehicle manufacture year column' },
  { key: 'vehicle_odometer', label: 'Vehicle Odometer', description: 'Vehicle mileage column' },
  { key: 'vehicle_fuel_type', label: 'Vehicle Fuel Type', description: 'Fuel type (Petrol, Diesel, etc.) column' },
  { key: 'vehicle_transmission', label: 'Vehicle Transmission', description: 'Transmission type column' },
  { key: 'vehicle_owner', label: 'Vehicle Owner', description: 'Previous owners column' },
  { key: 'vehicle_color', label: 'Vehicle Color', description: 'Vehicle color column' },
];

const DIALOG_FIELD_DEFS: { key: keyof ProductDialogFields; label: string; description: string }[] = [
  { key: 'code', label: 'Code', description: 'Auto-generated product / SKU code' },
  { key: 'group', label: 'Product Group', description: 'Category / group selector' },
  { key: 'brand', label: 'Brand', description: 'Brand selector' },
  { key: 'hsn_sac_code', label: 'HSN / SAC Code', description: 'Commodity code for GST' },
  { key: 'gst_slab', label: 'GST Category', description: 'Tax slab selector' },
  { key: 'purchase_rate', label: 'Purchase Rate', description: 'Default purchase price field' },
  { key: 'sales_rate', label: 'Sales Rate', description: 'Default selling price field' },
  { key: 'mrp', label: 'MRP', description: 'Maximum retail price field' },
  { key: 'cost', label: 'Cost', description: 'Product cost price field' },
  { key: 'barcode', label: 'Barcode', description: 'Barcode / scan field' },
  { key: 'vehicle_manufacturer', label: 'Vehicle Manufacturer', description: 'Vehicle manufacturer selection field' },
  { key: 'vehicle_model', label: 'Vehicle Model', description: 'Vehicle model input field' },
  { key: 'vehicle_year', label: 'Vehicle Year', description: 'Vehicle manufacture year input field' },
  { key: 'vehicle_odometer', label: 'Vehicle Odometer', description: 'Vehicle mileage input field' },
  { key: 'vehicle_fuel_type', label: 'Vehicle Fuel Type', description: 'Fuel type selection field' },
  { key: 'vehicle_transmission', label: 'Vehicle Transmission', description: 'Transmission selection field' },
  { key: 'vehicle_owner', label: 'Vehicle Owner', description: 'Owner number selection field' },
  { key: 'vehicle_color', label: 'Vehicle Color', description: 'Vehicle color text field' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductSettingsPage() {
  const [tableColumns, setTableColumns] = useState<ProductTableColumns>(DEFAULT_TABLE_COLUMNS);
  const [dialogFields, setDialogFields] = useState<ProductDialogFields>(DEFAULT_DIALOG_FIELDS);
  const [preventDuplicates, setPreventDuplicates] = useState(false);
  const [updatePaymentToProductCost, setUpdatePaymentToProductCost] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);

  // R2 / Public pages settings
  const [r2Enabled, setR2Enabled] = useState(false);
  const [r2EndpointUrl, setR2EndpointUrl] = useState('');
  const [r2BucketName, setR2BucketName] = useState('');
  const [r2AccessKeyId, setR2AccessKeyId] = useState('');
  const [r2SecretAccessKey, setR2SecretAccessKey] = useState('');
  const [r2PublicUrl, setR2PublicUrl] = useState('');
  const [r2WebsiteUrl, setR2WebsiteUrl] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [cols, fields, preventDupes, updateCost,
        r2En, r2Ep, r2Bn, r2Ak, r2Sk, r2Pu, r2Wu] = await Promise.all([
        loadSetting('product_table_columns', DEFAULT_TABLE_COLUMNS),
        loadSetting('product_dialog_fields', DEFAULT_DIALOG_FIELDS),
        invoke<string | null>('get_app_setting', { key: 'prevent_duplicate_product_names' }),
        invoke<string | null>('get_app_setting', { key: 'update_payment_to_product_cost' }),
        invoke<string | null>('get_app_setting', { key: 'r2_sync_enabled' }),
        invoke<string | null>('get_app_setting', { key: 'r2_endpoint_url' }),
        invoke<string | null>('get_app_setting', { key: 'r2_bucket_name' }),
        invoke<string | null>('get_app_setting', { key: 'r2_access_key_id' }),
        invoke<string | null>('get_app_setting', { key: 'r2_secret_access_key' }),
        invoke<string | null>('get_app_setting', { key: 'r2_public_url' }),
        invoke<string | null>('get_app_setting', { key: 'r2_website_url' }),
      ]);
      setTableColumns(cols);
      setDialogFields(fields);
      setPreventDuplicates(preventDupes === 'true' || preventDupes === '"true"');
      setUpdatePaymentToProductCost(updateCost === 'true' || updateCost === '"true"');
      setR2Enabled(r2En === 'true');
      setR2EndpointUrl(r2Ep || '');
      setR2BucketName(r2Bn || '');
      setR2AccessKeyId(r2Ak || '');
      setR2SecretAccessKey(r2Sk || '');
      setR2PublicUrl(r2Pu || '');
      setR2WebsiteUrl(r2Wu || '');
      setLoading(false);
    })();
  }, []);

  const toggleColumn = (key: keyof ProductTableColumns) => {
    setTableColumns(prev => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  const toggleField = (key: keyof ProductDialogFields) => {
    setDialogFields(prev => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        saveSetting('product_table_columns', tableColumns),
        saveSetting('product_dialog_fields', dialogFields),
        invoke('set_app_setting', { key: 'prevent_duplicate_product_names', value: preventDuplicates ? 'true' : 'false' }),
        invoke('set_app_setting', { key: 'update_payment_to_product_cost', value: updatePaymentToProductCost ? 'true' : 'false' }),
        invoke('set_app_setting', { key: 'r2_sync_enabled', value: r2Enabled ? 'true' : 'false' }),
        invoke('set_app_setting', { key: 'r2_endpoint_url', value: r2EndpointUrl }),
        invoke('set_app_setting', { key: 'r2_bucket_name', value: r2BucketName }),
        invoke('set_app_setting', { key: 'r2_access_key_id', value: r2AccessKeyId }),
        invoke('set_app_setting', { key: 'r2_secret_access_key', value: r2SecretAccessKey }),
        invoke('set_app_setting', { key: 'r2_public_url', value: r2PublicUrl }),
        invoke('set_app_setting', { key: 'r2_website_url', value: r2WebsiteUrl }),
      ]);
      toast.success('Product settings saved');
      setDirty(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setTableColumns(DEFAULT_TABLE_COLUMNS);
    setDialogFields(DEFAULT_DIALOG_FIELDS);
    setPreventDuplicates(false);
    setUpdatePaymentToProductCost(false);
    setR2Enabled(false);
    setR2EndpointUrl('');
    setR2BucketName('');
    setR2AccessKeyId('');
    setR2SecretAccessKey('');
    setR2PublicUrl('');
    setR2WebsiteUrl('');
    setDirty(true);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* ── Header ── */}
      <div className="flex justify-between items-center p-6 border-b shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Product Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customise columns in the products table and fields in the product form
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} disabled={saving}>
            Reset to Defaults
          </Button>
          <Button onClick={handleSave} disabled={saving || !dirty}>
            <IconDeviceFloppy className="mr-2 h-4 w-4" />
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ── General Settings ── */}
          <section className="bg-card border rounded-lg overflow-hidden lg:col-span-2">
            <div className="flex items-center gap-3 px-6 py-4 border-b bg-muted/30">
              <IconAdjustments size={18} className="text-primary" />
              <div>
                <h2 className="text-base font-semibold">General Product Settings</h2>
                <p className="text-xs text-muted-foreground">
                  Global rules and validations for product management.
                </p>
              </div>
            </div>

            <div className="divide-y">
              <div className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/20 transition-colors">
                <div className="space-y-0.5">
                  <Label htmlFor="prevent-duplicates" className="text-sm font-medium cursor-pointer">
                    Unique Product Names Only
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Prevent creating or renaming products to a name that already exists (case-insensitive).
                  </p>
                </div>
                <Switch
                  id="prevent-duplicates"
                  checked={preventDuplicates}
                  onCheckedChange={(checked) => {
                    setPreventDuplicates(checked);
                    setDirty(true);
                  }}
                />
              </div>

              <div className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/20 transition-colors">
                <div className="space-y-0.5">
                  <Label htmlFor="update-payment-cost" className="text-sm font-medium cursor-pointer">
                    Update Payment to Product Cost
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Add product selection in payment vouchers to update their costs.
                  </p>
                </div>
                <Switch
                  id="update-payment-cost"
                  checked={updatePaymentToProductCost}
                  onCheckedChange={(checked) => {
                    setUpdatePaymentToProductCost(checked);
                    setDirty(true);
                  }}
                />
              </div>
            </div>
          </section>

          {/* ── Cloudflare R2 Sync Settings ── */}
          <section className="bg-card border rounded-lg overflow-hidden lg:col-span-2">
            <div className="flex items-center gap-3 px-6 py-4 border-b bg-muted/30">
              <IconCloud size={18} className="text-primary" />
              <div>
                <h2 className="text-base font-semibold">Public Product Pages</h2>
                <p className="text-xs text-muted-foreground">
                  Sync your vehicle catalog to Cloudflare R2 so your public website can display it without a live backend.
                </p>
              </div>
            </div>

            <div className="divide-y">
              {/* Toggle */}
              <div className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/20 transition-colors">
                <div className="space-y-0.5">
                  <Label htmlFor="r2-enabled" className="text-sm font-medium cursor-pointer">
                    Enable public product pages
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Shows Sync Catalog button and Copy Link action on product rows.
                  </p>
                </div>
                <Switch
                  id="r2-enabled"
                  checked={r2Enabled}
                  onCheckedChange={(checked) => { setR2Enabled(checked); setDirty(true); }}
                />
              </div>

              {/* Credential fields — always shown so user can fill them ahead of enabling */}
              <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">R2 Endpoint URL</Label>
                  <Input
                    placeholder="https://<account-id>.r2.cloudflarestorage.com"
                    value={r2EndpointUrl}
                    onChange={e => { setR2EndpointUrl(e.target.value); setDirty(true); }}
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Bucket Name</Label>
                  <Input
                    placeholder="my-showroom-bucket"
                    value={r2BucketName}
                    onChange={e => { setR2BucketName(e.target.value); setDirty(true); }}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Access Key ID</Label>
                  <Input
                    placeholder="Access Key ID"
                    value={r2AccessKeyId}
                    onChange={e => { setR2AccessKeyId(e.target.value); setDirty(true); }}
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Secret Access Key</Label>
                  <div className="relative">
                    <Input
                      type={showSecret ? 'text' : 'password'}
                      placeholder="Secret Access Key"
                      value={r2SecretAccessKey}
                      onChange={e => { setR2SecretAccessKey(e.target.value); setDirty(true); }}
                      className="h-8 text-sm font-mono pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(p => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showSecret ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">R2 Public URL</Label>
                  <Input
                    placeholder="https://pub-xxxx.r2.dev"
                    value={r2PublicUrl}
                    onChange={e => { setR2PublicUrl(e.target.value); setDirty(true); }}
                    className="h-8 text-sm font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">Used to construct public image URLs (R2 custom domain or dev URL).</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Website URL</Label>
                  <Input
                    placeholder="https://myshowroom.com/vehicles"
                    value={r2WebsiteUrl}
                    onChange={e => { setR2WebsiteUrl(e.target.value); setDirty(true); }}
                    className="h-8 text-sm font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">Base URL for shareable product page links (e.g. website/&#123;product_id&#125;).</p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Product Table Columns ── */}
          <section className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b bg-muted/30">
              <IconTable size={18} className="text-primary" />
              <div>
                <h2 className="text-base font-semibold">Product Table Columns</h2>
                <p className="text-xs text-muted-foreground">
                  Choose which columns are visible in the Products list.
                  <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground/70">
                    <IconLock size={11} /> Name and Actions are always shown.
                  </span>
                </p>
              </div>
            </div>

            <div className="divide-y">
              {/* Always-on row */}
              <LockedRow label="Name" description="Product name — always visible" />

              {TABLE_COLUMN_DEFS.map(({ key, label, description }) => (
                <ToggleRow
                  key={key}
                  id={`col-${key}`}
                  label={label}
                  description={description}
                  checked={tableColumns[key]}
                  onCheckedChange={() => toggleColumn(key)}
                />
              ))}

              {/* Always-on row */}
              <LockedRow label="Actions" description="Edit / Delete buttons — always visible" />
            </div>
          </section>

          {/* ── Product Dialog Fields ── */}
          <section className="bg-card border rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b bg-muted/30">
              <IconListDetails size={18} className="text-primary" />
              <div>
                <h2 className="text-base font-semibold">Product Dialog Fields</h2>
                <p className="text-xs text-muted-foreground">
                  Choose which fields appear when adding or editing a product.
                  <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground/70">
                    <IconLock size={11} /> Name and Base Unit are always required.
                  </span>
                </p>
              </div>
            </div>

            <div className="divide-y">
              {/* Always-on rows */}
              <LockedRow label="Name" description="Product name — required field" />

              {DIALOG_FIELD_DEFS.map(({ key, label, description }) => (
                <ToggleRow
                  key={key}
                  id={`field-${key}`}
                  label={label}
                  description={description}
                  checked={dialogFields[key]}
                  onCheckedChange={() => toggleField(key)}
                />
              ))}

              <LockedRow label="Base Unit" description="Unit of measurement — required field" />
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/20 transition-colors">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function LockedRow({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-3.5 bg-muted/10 opacity-60">
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{label}</span>
          <IconLock size={11} className="text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked disabled />
    </div>
  );
}
