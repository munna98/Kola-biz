import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { IconDownload, IconPrinter, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

interface DayBookEntry {
  voucher_no: string;
  voucher_type: string;
  voucher_date: string;
  party_name: string | null;
  account_name: string;
  debit: number;
  credit: number;
  narration: string;
}

export default function DayBookPage() {
  const [entries, setEntries] = useState<DayBookEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const loadDayBook = async () => {
    try {
      setLoading(true);
      const result = await invoke<DayBookEntry[]>('get_day_book', {
        fromDate,
        toDate,
      });
      setEntries(result);
    } catch (error) {
      toast.error('Failed to load day book');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDayBook();
  }, [fromDate, toDate]);

  const totalDebit = entries.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = entries.reduce((sum, row) => sum + row.credit, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    toast.info('Export functionality coming soon');
  };

  const getVoucherTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'sales_invoice': 'Sales',
      'purchase_invoice': 'Purchase',
      'payment': 'Payment',
      'receipt': 'Receipt',
      'journal': 'Journal',
      'opening_balance': 'Opening',
    };
    return labels[type] || type;
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Day Book</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Chronological record of all daily transactions
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadDayBook}>
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

        {/* Filters */}
        <div className="mt-4 flex gap-4 items-end">
          <div className="flex-1 max-w-xs">
            <Label className="text-xs mb-1 block">From Date</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex-1 max-w-xs">
            <Label className="text-xs mb-1 block">To Date</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9"
            />
          </div>
          <Button onClick={loadDayBook} size="sm">
            Generate Report
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">Day Book</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Period: {formatDate(fromDate)} to {formatDate(toDate)}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading day book...</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-3 text-left text-sm font-semibold">Date</th>
                      <th className="p-3 text-left text-sm font-semibold">Voucher</th>
                      <th className="p-3 text-left text-sm font-semibold">Type</th>
                      <th className="p-3 text-left text-sm font-semibold">Party</th>
                      <th className="p-3 text-left text-sm font-semibold">Account</th>
                      <th className="p-3 text-left text-sm font-semibold">Narration</th>
                      <th className="p-3 text-right text-sm font-semibold">Debit</th>
                      <th className="p-3 text-right text-sm font-semibold">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                          No transactions found for this period
                        </td>
                      </tr>
                    ) : (
                      entries.map((entry, idx) => (
                        <tr key={idx} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-sm">{formatDate(entry.voucher_date)}</td>
                          <td className="p-3 font-mono text-sm">{entry.voucher_no}</td>
                          <td className="p-3 text-sm">
                            <span className="px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider bg-muted/50 text-muted-foreground">
                              {getVoucherTypeLabel(entry.voucher_type)}
                            </span>
                          </td>
                          <td className="p-3 text-sm">{entry.party_name || '-'}</td>
                          <td className="p-3 text-sm">{entry.account_name}</td>
                          <td className="p-3 text-sm text-muted-foreground">{entry.narration || '-'}</td>
                          <td className="p-3 text-right font-mono text-sm">
                            {entry.debit > 0 ? `₹${entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="p-3 text-right font-mono text-sm">
                            {entry.credit > 0 ? `₹${entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
                    <tr>
                      <td colSpan={6} className="p-3 font-bold text-sm">TOTAL</td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        ₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        ₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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