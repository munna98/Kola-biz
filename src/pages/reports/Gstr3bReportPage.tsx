import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';
import { api, Gstr3bSummary } from '@/lib/tauri';

const today = new Date().toISOString().split('T')[0];
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString()
  .split('T')[0];

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    <div
      className={`p-4 rounded-lg border-2 text-center ${
        isPositive
          ? 'border-red-200 bg-red-50 dark:bg-red-950/20'
          : 'border-green-200 bg-green-50 dark:bg-green-950/20'
      }`}
    >
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${isPositive ? 'text-red-600' : 'text-green-600'}`}>
        ₹{Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </p>
      {!isPositive && value !== 0 && (
        <p className="text-xs text-green-600 mt-1">Credit Balance</p>
      )}
    </div>
  );
}

export default function Gstr3bReportPage() {
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Gstr3bSummary | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const result = await api.gst.getGstr3b(fromDate, toDate);
      setData(result);
      setFetched(true);
    } catch (e: any) {
      toast.error('Failed to load GSTR-3B: ' + e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-5">
      <div>
        <h2 className="text-2xl font-bold">GSTR-3B Report</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Net GST liability summary — output tax vs eligible input tax credit
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
            Select a date range and click "Fetch" to load GSTR-3B data.
          </CardContent>
        </Card>
      ) : !data ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground text-sm">
            No GST data found for the selected period.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Outward */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-green-600 dark:text-green-400">
                3.1 — Outward Tax Liability (Sales)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Row label="Taxable Value" value={fmt(data.outward_taxable)} />
              <Separator />
              <Row label="CGST" value={fmt(data.outward_cgst)} />
              <Row label="SGST" value={fmt(data.outward_sgst)} />
              <Row label="IGST" value={fmt(data.outward_igst)} />
              <Separator />
              <Row
                label="Total Output Tax"
                value={fmt(data.outward_cgst + data.outward_sgst + data.outward_igst)}
                bold
              />
            </CardContent>
          </Card>

          {/* Inward / ITC */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-blue-600 dark:text-blue-400">
                4 — Eligible Input Tax Credit (Purchases)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Row label="Taxable Value" value={fmt(data.inward_taxable)} />
              <Separator />
              <Row label="CGST Input Credit" value={fmt(data.inward_cgst)} />
              <Row label="SGST Input Credit" value={fmt(data.inward_sgst)} />
              <Row label="IGST Input Credit" value={fmt(data.inward_igst)} />
              <Separator />
              <Row
                label="Total ITC Available"
                value={fmt(data.inward_cgst + data.inward_sgst + data.inward_igst)}
                bold
              />
            </CardContent>
          </Card>

          {/* Net liability */}
          <Card className="col-span-2 border-primary/30">
            <CardHeader>
              <CardTitle className="text-sm">Net Tax Payable (Output Tax – ITC)</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <NetCard label="CGST Payable" value={data.net_cgst} />
              <NetCard label="SGST Payable" value={data.net_sgst} />
              <NetCard label="IGST Payable" value={data.net_igst} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
