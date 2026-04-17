import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { IconPlus, IconEdit, IconTrash, IconPercentage, IconSettings, IconListDetails } from '@tabler/icons-react';
import { toast } from 'sonner';
import { api, GstTaxSlab, GstSettings, ChartOfAccount } from '@/lib/tauri';

const DEFAULT_GST_SETTINGS: GstSettings = {
  gst_enabled: false,
  gst_registration_type: 'Regular',
  composition_rate: 1,
};

interface SlabForm {
  name: string;
  is_dynamic: boolean;
  fixed_rate: string;
  threshold: string;
  below_rate: string;
  above_rate: string;
}

const EMPTY_FORM: SlabForm = {
  name: '',
  is_dynamic: false,
  fixed_rate: '18',
  threshold: '1000',
  below_rate: '5',
  above_rate: '12',
};

export default function TaxSettingsPage() {
  const [settings, setSettings] = useState<GstSettings>(DEFAULT_GST_SETTINGS);
  const [slabs, setSlabs] = useState<GstTaxSlab[]>([]);
  const [gstAccounts, setGstAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slabDialogOpen, setSlabDialogOpen] = useState(false);
  const [editingSlab, setEditingSlab] = useState<GstTaxSlab | null>(null);
  const [slabForm, setSlabForm] = useState<SlabForm>(EMPTY_FORM);

  const load = async () => {
    try {
      setLoading(true);
      const [s, sl, coa] = await Promise.all([
        api.gst.getSettings(),
        api.gst.getSlabs(),
        api.chartOfAccounts.list(),
      ]);
      setSettings(s);
      setSlabs(sl);
      setGstAccounts(coa.filter(a => a.account_group === 'Duties & Taxes'));
    } catch (e: any) {
      // Settings may not exist yet — use defaults
      const [sl, coa] = await Promise.all([
        api.gst.getSlabs(),
        api.chartOfAccounts.list(),
      ]);
      setSlabs(sl);
      setGstAccounts(coa.filter(a => a.account_group === 'Duties & Taxes'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveSettings = async () => {
    try {
      setSaving(true);
      await api.gst.saveSettings(settings);
      toast.success('GST settings saved');
    } catch (e: any) {
      toast.error('Failed to save: ' + e);
    } finally {
      setSaving(false);
    }
  };

  const openCreateSlab = () => {
    setEditingSlab(null);
    setSlabForm(EMPTY_FORM);
    setSlabDialogOpen(true);
  };

  const openEditSlab = (slab: GstTaxSlab) => {
    setEditingSlab(slab);
    setSlabForm({
      name: slab.name,
      is_dynamic: slab.is_dynamic === 1,
      fixed_rate: String(slab.fixed_rate),
      threshold: String(slab.threshold),
      below_rate: String(slab.below_rate),
      above_rate: String(slab.above_rate),
    });
    setSlabDialogOpen(true);
  };

  const saveSlab = async () => {
    try {
      const payload = {
        name: slabForm.name,
        is_dynamic: slabForm.is_dynamic,
        fixed_rate: slabForm.is_dynamic ? 0 : parseFloat(slabForm.fixed_rate) || 0,
        threshold: slabForm.is_dynamic ? parseFloat(slabForm.threshold) || 0 : 0,
        below_rate: slabForm.is_dynamic ? parseFloat(slabForm.below_rate) || 0 : 0,
        above_rate: slabForm.is_dynamic ? parseFloat(slabForm.above_rate) || 0 : 0,
      };
      if (editingSlab) {
        await api.gst.updateSlab(editingSlab.id, payload);
        toast.success('GST category updated');
      } else {
        await api.gst.createSlab(payload);
        toast.success('GST category created');
      }
      setSlabDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error('Failed to save: ' + e);
    }
  };

  const deleteSlab = async (id: string) => {
    if (!confirm('Delete this GST category?')) return;
    try {
      await api.gst.deleteSlab(id);
      toast.success('Deleted');
      load();
    } catch (e: any) {
      toast.error(e.toString());
    }
  };

  const isSystemSlab = (id: string) =>
    ['gst_0', 'gst_5', 'gst_18', 'gst_28', 'gst_apparel'].includes(id);

  const slabRateLabel = (slab: GstTaxSlab) =>
    slab.is_dynamic === 1
      ? `${slab.below_rate}% / ${slab.above_rate}% @₹${slab.threshold}`
      : `${slab.fixed_rate}%`;

  if (loading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="h-full overflow-auto p-6 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Tax Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure GST and tax categories for your business</p>
      </div>

      {/* ── Section 1: GST Configuration ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconSettings size={16} /> GST Configuration
          </CardTitle>
          <CardDescription>Global GST settings applied to all transactions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Enable GST */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable GST</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Apply GST to all applicable transactions</p>
            </div>
            <Switch
              checked={settings.gst_enabled}
              onCheckedChange={v => setSettings(s => ({ ...s, gst_enabled: v }))}
            />
          </div>

          <Separator />

          {/* Registration type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Registration Type</Label>
              <Select
                value={settings.gst_registration_type}
                onValueChange={v => setSettings(s => ({ ...s, gst_registration_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Regular">Regular</SelectItem>
                  <SelectItem value="Composition">Composition Scheme</SelectItem>
                  <SelectItem value="Unregistered">Unregistered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {settings.gst_registration_type === 'Composition' && (
              <div className="space-y-1.5">
                <Label>Composition Rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  value={settings.composition_rate}
                  onChange={e => setSettings(s => ({ ...s, composition_rate: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: GST Categories / Slabs ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <IconPercentage size={16} /> GST Categories
            </CardTitle>
            <CardDescription>Named tax slabs assigned to products. Fixed or price-threshold based.</CardDescription>
          </div>
          <Button size="sm" onClick={openCreateSlab}>
            <IconPlus size={14} className="mr-1" /> Add Category
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr className="text-left">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Rate / Rule</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {slabs.map(slab => (
                <tr key={slab.id} className="border-b hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium">{slab.name}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={slab.is_dynamic === 1 ? 'secondary' : 'outline'} className="text-xs">
                      {slab.is_dynamic === 1 ? 'Price-Based' : 'Fixed'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{slabRateLabel(slab)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      {isSystemSlab(slab.id) && <Badge variant="outline" className="text-xs">System</Badge>}
                      <Badge variant={slab.is_active === 1 ? 'default' : 'secondary'} className="text-xs">
                        {slab.is_active === 1 ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEditSlab(slab)}>
                        <IconEdit size={14} />
                      </Button>
                      {!isSystemSlab(slab.id) && (
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteSlab(slab.id)}>
                          <IconTrash size={14} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Section 3: GST Accounts Overview ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IconListDetails size={16} /> GST Accounts
          </CardTitle>
          <CardDescription>
            Auto-generated accounts in "Duties &amp; Taxes" group. Dynamic slabs post to rate-based ledgers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gstAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No GST accounts found. Restart the app to seed default accounts.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {gstAccounts.map(acct => (
                <div key={acct.id} className="flex items-center justify-between p-2.5 rounded-md border bg-muted/20">
                  <span className="text-sm font-medium">{acct.account_name}</span>
                  <Badge variant="outline" className="text-xs">{acct.account_type}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Slab Dialog ── */}
      <Dialog open={slabDialogOpen} onOpenChange={setSlabDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSlab ? 'Edit GST Category' : 'New GST Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Category Name</Label>
              <Input
                placeholder="e.g. GST 18%"
                value={slabForm.name}
                onChange={e => setSlabForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Price-Based (Threshold)</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Rate changes based on unit price</p>
              </div>
              <Switch
                checked={slabForm.is_dynamic}
                onCheckedChange={v => setSlabForm(f => ({ ...f, is_dynamic: v }))}
              />
            </div>

            {!slabForm.is_dynamic ? (
              <div className="space-y-1.5">
                <Label>GST Rate (%)</Label>
                <Input
                  type="number" min={0} max={100} step={0.5}
                  value={slabForm.fixed_rate}
                  onChange={e => setSlabForm(f => ({ ...f, fixed_rate: e.target.value }))}
                />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Price Threshold (₹)</Label>
                  <Input
                    type="number" min={0} step={1}
                    value={slabForm.threshold}
                    onChange={e => setSlabForm(f => ({ ...f, threshold: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Rate Below Threshold (%)</Label>
                    <Input
                      type="number" min={0} max={100} step={0.5}
                      value={slabForm.below_rate}
                      onChange={e => setSlabForm(f => ({ ...f, below_rate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Rate At/Above Threshold (%)</Label>
                    <Input
                      type="number" min={0} max={100} step={0.5}
                      value={slabForm.above_rate}
                      onChange={e => setSlabForm(f => ({ ...f, above_rate: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded">
                  Example: below ₹{slabForm.threshold} → {slabForm.below_rate}%, at/above ₹{slabForm.threshold} → {slabForm.above_rate}%
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSlabDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveSlab} disabled={!slabForm.name.trim()}>
              {editingSlab ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
