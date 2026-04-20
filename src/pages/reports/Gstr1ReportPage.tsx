import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IconDownload, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';
import { api, GstSummaryRow } from '@/lib/tauri';

const today = new Date().toISOString().split('T')[0];
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString()
  .split('T')[0];

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Gstr1ReportPage() {
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GstSummaryRow[]>([]);
  const [fetched, setFetched] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await api.gst.getGstr1(fromDate, toDate);
      setRows(data);
      setFetched(true);
    } catch (e: any) {
      toast.error('Failed to load GSTR-1: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const totals = {
    taxable: rows.reduce((s, r) => s + r.taxable_value, 0),
    cgst: rows.reduce((s, r) => s + r.cgst, 0),
    sgst: rows.reduce((s, r) => s + r.sgst, 0),
    igst: rows.reduce((s, r) => s + r.igst, 0),
    tax: rows.reduce((s, r) => s + r.total_tax, 0),
    total: rows.reduce((s, r) => s + r.total_value, 0),
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-5">
      <div>
        <h2 className="text-2xl font-bold">GSTR-1 Report</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Outward supplies summary grouped by HSN/SAC code and GST rate
        </p>
      </div>

      {/* Date range bar */}
      <Card>
        <CardContent className="flex items-end gap-4 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs">From Date</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To Date</Label>
            <Input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={fetchData} disabled={loading} className="mb-0.5">
            <IconRefresh size={14} className="mr-1.5" />
            {loading ? 'Loading...' : 'Fetch'}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {!fetched ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            Select a date range and click "Fetch" to load GSTR-1 data.
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            No outward supply records found for the selected period.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">HSN/SAC-wise Outward Supply Summary</CardTitle>
            <Button size="sm" variant="outline">
              <IconDownload size={14} className="mr-1" /> Export
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-t bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-2.5 font-medium w-10">Sl.</th>
                  <th className="px-4 py-2.5 font-medium">Description</th>
                  <th className="px-4 py-2.5 font-medium">HSN/SAC</th>
                  <th className="px-4 py-2.5 font-medium">UQC</th>
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
                {rows.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{row.sl}</td>
                    <td className="px-4 py-2.5">{row.description}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{row.hsn_sac_code || '—'}</td>
                    <td className="px-4 py-2.5 text-xs font-medium">{row.uqc}</td>
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
                  <td className="px-4 py-2.5" colSpan={5}>Total</td>
                  <td className="px-4 py-2.5 text-right">{fmt(totals.taxable)}</td>
                  <td className="px-4 py-2.5 text-right">{fmt(totals.cgst)}</td>
                  <td className="px-4 py-2.5 text-right">{fmt(totals.sgst)}</td>
                  <td className="px-4 py-2.5 text-right">{fmt(totals.igst)}</td>
                  <td className="px-4 py-2.5 text-right">{fmt(totals.tax)}</td>
                  <td className="px-4 py-2.5 text-right">{fmt(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
