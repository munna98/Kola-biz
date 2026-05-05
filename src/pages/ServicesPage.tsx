import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { invoke } from '@tauri-apps/api/core';
import { api } from '@/lib/tauri';
import { toast } from 'sonner';
import { useDialog } from '@/hooks/use-dialog';

interface Service {
  id: string;
  code: string;
  name: string;
  description?: string;
  unit_id?: string;
  unit_symbol?: string;
  hsn_sac_code?: string;
  gst_slab_id?: string;
  sales_rate: number;
  purchase_rate: number;
  is_active: number;
  created_at: string;
  has_transactions: boolean;
}

interface Unit { id: string; name: string; symbol: string; }
interface GstTaxSlab { id: string; name: string; fixed_rate: number; is_dynamic: number; }

const EMPTY_FORM = {
  code: '',
  name: '',
  unit_id: '',
  hsn_sac_code: '',
  gst_slab_id: '',
  sales_rate: 0,
  purchase_rate: 0,
};

// Field order for Enter-key navigation (mirrors ProductDialog pattern)
const ORDERED_FIELDS = ['code', 'name', 'hsn_sac_code', 'unit', 'gst_slab', 'purchase_rate', 'sales_rate'];

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [gstSlabs, setGstSlabs] = useState<GstTaxSlab[]>([]);
  const [gstEnabled, setGstEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Enter-key navigation — same hook as ProductDialog
  const { register, handleKeyDown, handleSelectKeyDown, parseNumber, formatNumber } = useDialog(
    dialogOpen,
    setDialogOpen,
    ORDERED_FIELDS
  );

  const load = async () => {
    try {
      setLoading(true);
      const [svcs, us, slabs, gstSettings] = await Promise.all([
        invoke<Service[]>('get_services'),
        api.units.list(),
        api.gst.getSlabs(),
        api.gst.getSettings(),
      ]);
      setServices(svcs);
      setUnits(us);
      setGstSlabs(slabs);
      setGstEnabled(gstSettings.gst_enabled);
    } catch (e) {
      toast.error('Failed to load services');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = async () => {
    setEditingService(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
    // Share the same code sequence as products (get_next_product_code)
    try {
      const nextCode = await invoke<string>('get_next_product_code');
      setForm(f => ({ ...f, code: nextCode }));
    } catch (e) {
      console.error('Failed to fetch next code', e);
    }
  };

  const openEdit = (s: Service) => {
    setEditingService(s);
    setForm({
      code: s.code,
      name: s.name,
      unit_id: s.unit_id ?? '',
      hsn_sac_code: s.hsn_sac_code ?? '',
      gst_slab_id: s.gst_slab_id ?? '',
      sales_rate: s.sales_rate,
      purchase_rate: s.purchase_rate,
    });
    setDialogOpen(true);
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim()) { toast.error('Service name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: null,
        unit_id: form.unit_id || null,
        hsn_sac_code: form.hsn_sac_code.trim() || null,
        gst_slab_id: form.gst_slab_id || null,
        sales_rate: parseFloat(String(form.sales_rate)) || 0,
        purchase_rate: parseFloat(String(form.purchase_rate)) || 0,
      };
      if (editingService) {
        await invoke('update_service', { id: editingService.id, service: payload });
        toast.success('Service updated');
      } else {
        await invoke('create_service', { service: payload });
        toast.success('Service created');
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.toString() ?? 'Failed to save service');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: Service) => {
    if (s.has_transactions) {
      toast.error('Cannot delete — service has existing transactions.');
      return;
    }
    if (!confirm(`Delete service "${s.name}"?`)) return;
    try {
      await invoke('delete_service', { id: s.id });
      toast.success('Service deleted');
      load();
    } catch (e: any) {
      toast.error(e?.toString() ?? 'Failed to delete service');
    }
  };

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Services</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage service offerings (labour, consulting, etc.)</p>
        </div>
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Search services..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
          <Button onClick={openCreate}>
            <IconPlus size={16} /> Add Service
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr className="text-left text-sm">
                <th className="p-3 w-12">S.No</th>
                <th className="p-3">Code</th>
                <th className="p-3">Name</th>
                <th className="p-3">SAC Code</th>
                <th className="p-3">Unit</th>
                <th className="p-3">Purchase Rate</th>
                <th className="p-3">Sales Rate</th>
                {gstEnabled && <th className="p-3">GST Slab</th>}
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-muted-foreground">
                    {searchTerm ? 'No services match your search.' : 'No services yet. Click "Add Service" to get started.'}
                  </td>
                </tr>
              ) : filtered.map((s, i) => (
                <tr key={s.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 text-sm text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-mono text-sm">{s.code}</td>
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-sm">{s.hsn_sac_code || '-'}</td>
                  <td className="p-3 text-sm">{s.unit_symbol || '-'}</td>
                  <td className="p-3 text-sm">₹{s.purchase_rate.toFixed(2)}</td>
                  <td className="p-3 text-sm">₹{s.sales_rate.toFixed(2)}</td>
                  {gstEnabled && (
                    <td className="p-3 text-sm">
                      {gstSlabs.find(sl => sl.id === s.gst_slab_id)?.name || '-'}
                    </td>
                  )}
                  <td className="p-3 flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                      <IconEdit size={16} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(s)}
                    >
                      <IconTrash size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingService ? 'Edit Service' : 'Add Service'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="grid gap-3 py-2">
            {/* Row 1: Code (full width) */}
            <div className="space-y-1">
              <Label>Code</Label>
              <Input
                ref={register('code') as any}
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                onKeyDown={e => handleKeyDown(e, 'code')}
                placeholder="e.g. 1001"
              />
            </div>

            {/* Row 2: Name | SAC Code */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input
                  ref={register('name') as any}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => handleKeyDown(e, 'name')}
                  placeholder="e.g. Photography Services"
                />
              </div>
              <div className="space-y-1">
                <Label>SAC Code</Label>
                <Input
                  ref={register('hsn_sac_code') as any}
                  value={form.hsn_sac_code}
                  onChange={e => setForm(f => ({ ...f, hsn_sac_code: e.target.value }))}
                  onKeyDown={e => handleKeyDown(e, 'hsn_sac_code')}
                  placeholder="e.g. 998311"
                />
              </div>
            </div>

            {/* Row 3: Unit + GST Slab */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Unit <span className="text-muted-foreground text-xs">(e.g. Hours)</span></Label>
                <Select
                  value={form.unit_id || 'none'}
                  onValueChange={v => setForm(f => ({ ...f, unit_id: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger
                    ref={register('unit') as any}
                    onKeyDown={e => handleSelectKeyDown(e, 'unit')}
                  >
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.symbol})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>GST Slab</Label>
                <Select
                  value={form.gst_slab_id || 'none'}
                  onValueChange={v => setForm(f => ({ ...f, gst_slab_id: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger
                    ref={register('gst_slab') as any}
                    onKeyDown={e => handleSelectKeyDown(e, 'gst_slab')}
                  >
                    <SelectValue placeholder="Select GST slab" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {gstSlabs.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 4: Rates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Purchase Rate (₹)</Label>
                <Input
                  ref={register('purchase_rate') as any}
                  type="number"
                  min="0"
                  step="0.01"
                  value={formatNumber(form.purchase_rate)}
                  onChange={e => setForm(f => ({ ...f, purchase_rate: parseNumber(e.target.value) }))}
                  onKeyDown={e => handleKeyDown(e, 'purchase_rate')}
                  className="text-right font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label>Sales Rate (₹)</Label>
                <Input
                  ref={register('sales_rate') as any}
                  type="number"
                  min="0"
                  step="0.01"
                  value={formatNumber(form.sales_rate)}
                  onChange={e => setForm(f => ({ ...f, sales_rate: parseNumber(e.target.value) }))}
                  onKeyDown={e => handleKeyDown(e, 'sales_rate')}
                  className="text-right font-mono"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
