import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { IconDownload, IconPrinter, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

interface BSAccount {
  account_name: string;
  account_code: string;
  amount: number;
}

interface BalanceSheetData {
  assets: BSAccount[];
  liabilities: BSAccount[];
  equity: BSAccount[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
}

export default function BalanceSheetPage() {
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [asOnDate, setAsOnDate] = useState(new Date().toISOString().split('T')[0]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const result = await invoke<BalanceSheetData>('get_balance_sheet', {
        asOnDate,
      });
      setData(result);
    } catch (error) {
      toast.error('Failed to load balance sheet');
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

  const totalLiabilitiesAndEquity = data ? data.total_liabilities + data.total_equity : 0;
  const isBalanced = data ? Math.abs(data.total_assets - totalLiabilitiesAndEquity) < 0.01 : false;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Balance Sheet</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Financial position snapshot at a specific date
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
            <Label className="text-xs mb-1 block">As On Date</Label>
            <Input
              type="date"
              value={asOnDate}
              onChange={(e) => setAsOnDate(e.target.value)}
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
        <div className="max-w-6xl mx-auto">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">Balance Sheet</h1>
            <p className="text-sm text-muted-foreground mt-1">
              As on {formatDate(asOnDate)}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading balance sheet...</p>
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">No data available</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Assets Section */}
                <Card>
                  <CardContent className="p-0">
                    <div className="bg-muted/30 border-b p-4">
                      <h2 className="font-bold text-lg">Assets</h2>
                    </div>
                    <table className="w-full">
                      <thead className="bg-muted/30 border-b">
                        <tr>
                          <th className="p-3 text-left text-sm font-semibold">Account</th>
                          <th className="p-3 text-right text-sm font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.assets.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                              No assets recorded
                            </td>
                          </tr>
                        ) : (
                          data.assets.map((acc, idx) => (
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
                          <td className="p-3 font-bold text-sm">Total Assets</td>
                          <td className="p-3 text-right font-mono font-bold text-sm">
                            ₹{data.total_assets.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>

                {/* Liabilities & Equity Section */}
                <div className="space-y-6">
                  {/* Liabilities */}
                  <Card>
                    <CardContent className="p-0">
                      <div className="bg-muted/30 border-b p-4">
                        <h2 className="font-bold text-lg">Liabilities</h2>
                      </div>
                      <table className="w-full">
                        <thead className="bg-muted/30 border-b">
                          <tr>
                            <th className="p-3 text-left text-sm font-semibold">Account</th>
                            <th className="p-3 text-right text-sm font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.liabilities.length === 0 ? (
                            <tr>
                              <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                                No liabilities recorded
                              </td>
                            </tr>
                          ) : (
                            data.liabilities.map((acc, idx) => (
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
                            <td className="p-3 font-bold text-sm">Total Liabilities</td>
                            <td className="p-3 text-right font-mono font-bold text-sm">
                              ₹{data.total_liabilities.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </CardContent>
                  </Card>

                  {/* Equity */}
                  <Card>
                    <CardContent className="p-0">
                      <div className="bg-muted/30 border-b p-4">
                        <h2 className="font-bold text-lg">Equity</h2>
                      </div>
                      <table className="w-full">
                        <thead className="bg-muted/30 border-b">
                          <tr>
                            <th className="p-3 text-left text-sm font-semibold">Account</th>
                            <th className="p-3 text-right text-sm font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.equity.length === 0 ? (
                            <tr>
                              <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                                No equity recorded
                              </td>
                            </tr>
                          ) : (
                            data.equity.map((acc, idx) => (
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
                            <td className="p-3 font-bold text-sm">Total Equity</td>
                            <td className="p-3 text-right font-mono font-bold text-sm">
                              ₹{data.total_equity.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Balance Check */}
              <Card className="bg-muted/10 border-dashed">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold">Total Liabilities + Equity</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Must equal Total Assets for a balanced sheet
                      </p>
                    </div>
                    <div className="text-3xl font-bold font-mono">
                      ₹{totalLiabilitiesAndEquity.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3 p-3 rounded-lg border bg-background">
                    {isBalanced ? (
                      <div className="flex items-center gap-2 text-foreground/80">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="font-semibold text-sm">Balance Sheet is Balanced</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-foreground/80">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="font-semibold text-sm">Balance Sheet is NOT Balanced</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          (Difference: ₹{Math.abs(data.total_assets - totalLiabilitiesAndEquity).toLocaleString('en-IN', { minimumFractionDigits: 2 })})
                        </span>
                      </div>
                    )}
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