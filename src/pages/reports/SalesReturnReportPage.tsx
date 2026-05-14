import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { IconDownload, IconPrinter, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

interface SalesReturnReportRow {
  id: string;
  voucher_no: string;
  voucher_type: 'sales_invoice' | 'sales_return';
  voucher_date: string;
  party_name: string | null;
  reference: string | null;
  amount: number;
}

const today = () => new Date().toISOString().split('T')[0];

const formatCurrency = (amount: number) =>
  `\u20b9${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const getTypeLabel = (type: SalesReturnReportRow['voucher_type']) =>
  type === 'sales_invoice' ? 'Sale' : 'Return';

export default function SalesReturnReportPage() {
  const [rows, setRows] = useState<SalesReturnReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);

  const loadReport = async () => {
    try {
      setLoading(true);
      const result = await invoke<SalesReturnReportRow[]>('get_sales_return_report', {
        fromDate,
        toDate,
      });
      setRows(result);
    } catch (error) {
      toast.error('Failed to load sales & returns report');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [fromDate, toDate]);

  const totals = useMemo(() => {
    const salesTotal = rows
      .filter((row) => row.voucher_type === 'sales_invoice')
      .reduce((sum, row) => sum + row.amount, 0);
    const returnTotal = rows
      .filter((row) => row.voucher_type === 'sales_return')
      .reduce((sum, row) => sum + row.amount, 0);

    return {
      salesTotal,
      returnTotal,
      difference: salesTotal - returnTotal,
    };
  }, [rows]);

  const handlePrint = () => window.print();
  const handleExport = () => toast.info('Export functionality coming soon');

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Sales & Returns Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View sales, returns, and net difference for a selected date range
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadReport}>
              <IconRefresh size={16} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <IconDownload size={16} />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <IconPrinter size={16} />
              Print
            </Button>
          </div>
        </div>

        <div className="mt-4 flex gap-4 items-end">
          <div className="flex-1 max-w-xs">
            <Label className="text-xs mb-1 block">From Date</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex-1 max-w-xs">
            <Label className="text-xs mb-1 block">To Date</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="h-9"
            />
          </div>
          <Button onClick={loadReport} size="sm">
            Generate Report
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">Sales & Returns Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Period: {formatDate(fromDate)} to {formatDate(toDate)}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Sales Total</p>
                <p className="text-2xl font-bold font-mono mt-1 text-green-600">
                  {formatCurrency(totals.salesTotal)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Return Total</p>
                <p className="text-2xl font-bold font-mono mt-1 text-red-600">
                  {formatCurrency(totals.returnTotal)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Difference</p>
                <p className={`text-2xl font-bold font-mono mt-1 ${totals.difference >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {formatCurrency(totals.difference)}
                </p>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading sales & returns...</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-3 text-left text-sm font-semibold">Date</th>
                      <th className="p-3 text-left text-sm font-semibold">Voucher No</th>
                      <th className="p-3 text-left text-sm font-semibold">Type</th>
                      <th className="p-3 text-left text-sm font-semibold">Party</th>
                      <th className="p-3 text-left text-sm font-semibold">Reference</th>
                      <th className="p-3 text-right text-sm font-semibold">Sales</th>
                      <th className="p-3 text-right text-sm font-semibold">Returns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                          No sales or returns found for this period
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-sm">{formatDate(row.voucher_date)}</td>
                          <td className="p-3 font-mono text-sm">{row.voucher_no}</td>
                          <td className="p-3 text-sm">
                            <span className="px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider bg-muted/50 text-muted-foreground">
                              {getTypeLabel(row.voucher_type)}
                            </span>
                          </td>
                          <td className="p-3 text-sm">{row.party_name || '-'}</td>
                          <td className="p-3 text-sm">{row.reference || '-'}</td>
                          <td className="p-3 text-right font-mono text-sm">
                            {row.voucher_type === 'sales_invoice' ? formatCurrency(row.amount) : '-'}
                          </td>
                          <td className="p-3 text-right font-mono text-sm">
                            {row.voucher_type === 'sales_return' ? formatCurrency(row.amount) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
                    <tr>
                      <td colSpan={5} className="p-3 font-bold text-sm">TOTAL</td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        {formatCurrency(totals.salesTotal)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        {formatCurrency(totals.returnTotal)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={6} className="p-3 font-bold text-sm">DIFFERENCE</td>
                      <td className={`p-3 text-right font-mono font-bold text-sm ${totals.difference >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {formatCurrency(totals.difference)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
