import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { IconDownload, IconPrinter, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
}

export default function TrialBalancePage() {
  const [data, setData] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const loadTrialBalance = async () => {
    try {
      setLoading(true);
      const result = await invoke<TrialBalanceRow[]>('get_trial_balance', {
        fromDate: fromDate || null,
        toDate,
      });
      setData(result);
    } catch (error) {
      toast.error('Failed to load trial balance');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrialBalance();
  }, []);

  const totalDebit = data.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = data.reduce((sum, row) => sum + row.credit, 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.01;

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    // TODO: Implement CSV export
    toast.info('Export functionality coming soon');
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Trial Balance</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Verify double-entry bookkeeping accuracy
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadTrialBalance}>
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
          <Button onClick={loadTrialBalance} size="sm">
            Apply Filter
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">Trial Balance Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              As of {formatDate(toDate)}
            </p>
            {fromDate && (
              <p className="text-sm text-muted-foreground">
                Period: {formatDate(fromDate)} to {formatDate(toDate)}
              </p>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading trial balance...</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-3 text-left text-sm font-semibold">Account Code</th>
                      <th className="p-3 text-left text-sm font-semibold">Account Name</th>
                      <th className="p-3 text-right text-sm font-semibold">Debit (Dr)</th>
                      <th className="p-3 text-right text-sm font-semibold">Credit (Cr)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-muted-foreground">
                          No transactions found for this period
                        </td>
                      </tr>
                    ) : (
                      data.map((row, idx) => (
                        <tr key={idx} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-mono text-sm">{row.account_code}</td>
                          <td className="p-3 text-sm">{row.account_name}</td>
                          <td className="p-3 text-right font-mono text-sm">
                            {row.debit > 0 ? `₹${row.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="p-3 text-right font-mono text-sm">
                            {row.credit > 0 ? `₹${row.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
                    <tr>
                      <td colSpan={2} className="p-3 font-bold text-sm">TOTAL</td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        ₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        ₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    {!isBalanced && (
                      <tr className="bg-muted/50">
                        <td colSpan={4} className="p-3 text-center text-xs text-destructive">
                          ⚠️ UNBALANCED: Difference of ₹{difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                    {isBalanced && data.length > 0 && (
                      <tr className="bg-muted/50">
                        <td colSpan={4} className="p-3 text-center text-xs text-green-600 dark:text-green-400">
                          ✓ BALANCED: Debits equal Credits
                        </td>
                      </tr>
                    )}
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