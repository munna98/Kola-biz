import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { IconDownload, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';
import { api, GstSummaryRow, Gstr3bSummary } from '@/lib/tauri';

const today = new Date().toISOString().split('T')[0];
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function GSTReportPage() {
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [gstr1, setGstr1] = useState<GstSummaryRow[]>([]);
  const [gstr3b, setGstr3b] = useState<Gstr3bSummary | null>(null);
  const [activeTab, setActiveTab] = useState('gstr1');

  const fetchGstr1 = async () => {
    try {
      setLoading(true);
      const rows = await api.gst.getGstr1(fromDate, toDate);
      setGstr1(rows);
    } catch (e: any) {
      toast.error('Failed to load GSTR-1: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const fetchGstr3b = async () => {
    try {
      setLoading(true);
      const data = await api.gst.getGstr3b(fromDate, toDate);
      setGstr3b(data);
    } catch (e: any) {
      toast.error('Failed to load GSTR-3B: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleFetch = () => {
    if (activeTab === 'gstr1') fetchGstr1();
    else fetchGstr3b();
  };

  // GSTR-1 totals
  const g1Totals = {
    taxable: gstr1.reduce((s, r) => s + r.taxable_value, 0),
    cgst: gstr1.reduce((s, r) => s + r.cgst, 0),
    sgst: gstr1.reduce((s, r) => s + r.sgst, 0),
    igst: gstr1.reduce((s, r) => s + r.igst, 0),
    tax: gstr1.reduce((s, r) => s + r.total_tax, 0),
    total: gstr1.reduce((s, r) => s + r.total_value, 0),
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-5">
      <div>
        <h2 className="text-2xl font-bold">GST Report</h2>
        <p className="text-sm text-muted-foreground mt-1">GSTR-1 outward supplies and GSTR-3B net liability summary</p>
      </div>

      {/* Date range bar */}
      <Card>
        <CardContent className="flex items-end gap-4 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs">From Date</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To Date</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" />
          </div>
          <Button onClick={handleFetch} disabled={loading} className="mb-0.5">
            <IconRefresh size={14} className="mr-1.5" />
            {loading ? 'Loading...' : 'Fetch'}
          </Button>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="gstr1">GSTR-1 (Outward Supplies)</TabsTrigger>
          <TabsTrigger value="gstr3b">GSTR-3B (Net Liability)</TabsTrigger>
        </TabsList>

        {/* ── GSTR-1 ── */}
        <TabsContent value="gstr1" className="mt-4">
          {gstr1.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground text-sm">
                {loading ? 'Loading...' : 'Click "Fetch" to load GSTR-1 data for the selected period.'}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">HSN/SAC-wise Summary</CardTitle>
                <Button size="sm" variant="outline">
                  <IconDownload size={14} className="mr-1" /> Export
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-t bg-muted/40">
                    <tr className="text-left">
                      <th className="px-4 py-2.5 font-medium">HSN/SAC</th>
                      <th className="px-4 py-2.5 font-medium text-right">GST Rate</th>
                      <th className="px-4 py-2.5 font-medium text-right">Taxable Value</th>
                      <th className="px-4 py-2.5 font-medium text-right">CGST</th>
                      <th className="px-4 py-2.5 font-medium text-right">SGST</th>
                      <th className="px-4 py-2.5 font-medium text-right">IGST</th>
                      <th className="px-4 py-2.5 font-medium text-right">Total Tax</th>
                      <th className="px-4 py-2.5 font-medium text-right">Invoice Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gstr1.map((row, i) => (
                      <tr key={i} className="border-b hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-mono text-xs">{row.hsn_sac_code || '—'}</td>
                        <td className="px-4 py-2.5 text-right">{row.gst_rate}%</td>
                        <td className="px-4 py-2.5 text-right">{fmt(row.taxable_value)}</td>
                        <td className="px-4 py-2.5 text-right">{fmt(row.cgst)}</td>
                        <td className="px-4 py-2.5 text-right">{fmt(row.sgst)}</td>
                        <td className="px-4 py-2.5 text-right">{fmt(row.igst)}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{fmt(row.total_tax)}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{fmt(row.total_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 bg-muted/40 font-semibold">
                    <tr>
                      <td className="px-4 py-2.5" colSpan={2}>Total</td>
                      <td className="px-4 py-2.5 text-right">{fmt(g1Totals.taxable)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(g1Totals.cgst)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(g1Totals.sgst)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(g1Totals.igst)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(g1Totals.tax)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(g1Totals.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── GSTR-3B ── */}
        <TabsContent value="gstr3b" className="mt-4">
          {!gstr3b ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground text-sm">
                {loading ? 'Loading...' : 'Click "Fetch" to load GSTR-3B data for the selected period.'}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {/* Outward */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-green-600 dark:text-green-400">3.1 — Outward Tax Liability</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Row label="Taxable Value" value={fmt(gstr3b.outward_taxable)} />
                  <Separator />
                  <Row label="CGST" value={fmt(gstr3b.outward_cgst)} />
                  <Row label="SGST" value={fmt(gstr3b.outward_sgst)} />
                  <Row label="IGST" value={fmt(gstr3b.outward_igst)} />
                  <Separator />
                  <Row label="Total Output Tax" value={fmt(gstr3b.outward_cgst + gstr3b.outward_sgst + gstr3b.outward_igst)} bold />
                </CardContent>
              </Card>

              {/* Inward / ITC */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-blue-600 dark:text-blue-400">4 — Eligible Input Tax Credit (ITC)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Row label="Taxable Value" value={fmt(gstr3b.inward_taxable)} />
                  <Separator />
                  <Row label="CGST Input Credit" value={fmt(gstr3b.inward_cgst)} />
                  <Row label="SGST Input Credit" value={fmt(gstr3b.inward_sgst)} />
                  <Row label="IGST Input Credit" value={fmt(gstr3b.inward_igst)} />
                  <Separator />
                  <Row label="Total ITC Available" value={fmt(gstr3b.inward_cgst + gstr3b.inward_sgst + gstr3b.inward_igst)} bold />
                </CardContent>
              </Card>

              {/* Net liability */}
              <Card className="col-span-2 border-primary/30">
                <CardHeader>
                  <CardTitle className="text-sm">Net Tax Payable (Output – ITC)</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  <NetCard label="CGST Payable" value={gstr3b.net_cgst} />
                  <NetCard label="SGST Payable" value={gstr3b.net_sgst} />
                  <NetCard label="IGST Payable" value={gstr3b.net_igst} />
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-semibold' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function NetCard({ label, value }: { label: string; value: number }) {
  const isPositive = value > 0;
  return (
    <div className={`p-4 rounded-lg border-2 text-center ${isPositive ? 'border-red-200 bg-red-50 dark:bg-red-950/20' : 'border-green-200 bg-green-50 dark:bg-green-950/20'}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${isPositive ? 'text-red-600' : 'text-green-600'}`}>
        ₹{Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </p>
      {!isPositive && value !== 0 && <p className="text-xs text-green-600 mt-1">Credit Balance</p>}
    </div>
  );
}
