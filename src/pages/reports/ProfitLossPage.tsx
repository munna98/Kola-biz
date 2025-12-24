import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { IconDownload, IconPrinter, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

interface PLAccount {
  account_name: string;
  account_code: string;
  amount: number;
}

interface ProfitLossData {
  income: PLAccount[];
  expenses: PLAccount[];
  total_income: number;
  total_expenses: number;
  net_profit: number;
}

export default function ProfitLossPage() {
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setMonth(0);
    date.setDate(1);
    return date.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const result = await invoke<ProfitLossData>('get_profit_loss', {
        fromDate,
        toDate,
      });
      setData(result);
    } catch (error) {
      toast.error('Failed to load profit & loss statement');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    toast.info('Export functionality coming soon');
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Profit & Loss Statement</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Income and expenses summary for the period
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
          <Button onClick={loadReport} size="sm">
            Generate Report
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">Profit & Loss Statement</h1>
            <p className="text-sm text-muted-foreground mt-1">
              For the period: {formatDate(fromDate)} to {formatDate(toDate)}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading statement...</p>
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">No data available</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Income Section */}
              <Card>
                <CardContent className="p-0">
                  <div className="bg-muted/30 border-b p-4">
                    <h2 className="font-bold text-lg">Income</h2>
                  </div>
                  <table className="w-full">
                    <thead className="bg-muted/30 border-b">
                      <tr>
                        <th className="p-3 text-left text-sm font-semibold">Account</th>
                        <th className="p-3 text-right text-sm font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.income.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                            No income recorded
                          </td>
                        </tr>
                      ) : (
                        data.income.map((acc, idx) => (
                          <tr key={idx} className="border-b hover:bg-muted/30">
                            <td className="p-3 text-sm">
                              <div className="font-medium">{acc.account_name}</div>
                              <div className="text-xs text-muted-foreground">{acc.account_code}</div>
                            </td>
                            <td className="p-3 text-right font-mono text-sm">
                              ₹{acc.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-muted/20 border-t-2">
                      <tr>
                        <td className="p-3 font-bold text-sm">Total Income</td>
                        <td className="p-3 text-right font-mono font-bold text-sm">
                          ₹{data.total_income.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Expenses Section */}
              <Card>
                <CardContent className="p-0">
                  <div className="bg-muted/30 border-b p-4">
                    <h2 className="font-bold text-lg">Expenses</h2>
                  </div>
                  <table className="w-full">
                    <thead className="bg-muted/30 border-b">
                      <tr>
                        <th className="p-3 text-left text-sm font-semibold">Account</th>
                        <th className="p-3 text-right text-sm font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.expenses.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                            No expenses recorded
                          </td>
                        </tr>
                      ) : (
                        data.expenses.map((acc, idx) => (
                          <tr key={idx} className="border-b hover:bg-muted/30">
                            <td className="p-3 text-sm">
                              <div className="font-medium">{acc.account_name}</div>
                              <div className="text-xs text-muted-foreground">{acc.account_code}</div>
                            </td>
                            <td className="p-3 text-right font-mono text-sm">
                              ₹{acc.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-muted/20 border-t-2">
                      <tr>
                        <td className="p-3 font-bold text-sm">Total Expenses</td>
                        <td className="p-3 text-right font-mono font-bold text-sm">
                          ₹{data.total_expenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Net Profit/Loss */}
              <Card className="md:col-span-2">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">
                      {data.net_profit >= 0 ? 'Net Profit' : 'Net Loss'}
                    </h2>
                    <div className={`text-3xl font-bold font-mono`}>
                      ₹{Math.abs(data.net_profit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-muted-foreground">
                    Calculation: Total Income (₹{data.total_income.toLocaleString('en-IN', { minimumFractionDigits: 2 })}) - Total Expenses (₹{data.total_expenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })})
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}