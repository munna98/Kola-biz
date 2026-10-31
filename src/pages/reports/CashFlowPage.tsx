import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { IconBuildingBank, IconDownload, IconPrinter, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useMoney } from '@/hooks/useMoney';

interface CashFlowItem {
  description: string;
  amount: number;
}

interface CashAccountBreakdown {
  account_id: string;
  account_name: string;
  account_code: string;
  account_group: string;
  opening_balance: number;
  net_change: number;
  closing_balance: number;
}

interface CashFlowData {
  operating_activities: CashFlowItem[];
  investing_activities: CashFlowItem[];
  financing_activities: CashFlowItem[];
  net_operating: number;
  net_investing: number;
  net_financing: number;
  net_change: number;
  opening_cash: number;
  closing_cash: number;
  breakdown?: CashAccountBreakdown[];
}

export default function CashFlowPage() {
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setMonth(0);
    date.setDate(1);
    return date.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const money = useMoney();

  const cashAccounts =
    data?.breakdown?.filter(
      (a) =>
        a.account_group.toLowerCase().includes('cash') ||
        a.account_name.toLowerCase().includes('cash')
    ) || [];
  const bankAccounts =
    data?.breakdown?.filter(
      (a) =>
        !a.account_group.toLowerCase().includes('cash') &&
        !a.account_name.toLowerCase().includes('cash')
    ) || [];

  const totalCashOpening = cashAccounts.reduce((sum, a) => sum + a.opening_balance, 0);
  const totalCashClosing = cashAccounts.reduce((sum, a) => sum + a.closing_balance, 0);
  const totalBankOpening = bankAccounts.reduce((sum, a) => sum + a.opening_balance, 0);
  const totalBankClosing = bankAccounts.reduce((sum, a) => sum + a.closing_balance, 0);

  const loadReport = async () => {
    try {
      setLoading(true);
      const result = await invoke<CashFlowData>('get_cash_flow', {
        fromDate,
        toDate,
      });
      setData(result);
    } catch (error) {
      toast.error('Failed to load cash flow statement');
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
            <h1 className="text-xl font-bold">Cash Flow Statement</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Analysis of cash inflows and outflows by activity type
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
        <div className="max-w-4xl mx-auto">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">Cash Flow Statement</h1>
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
            <div className="space-y-6">
              {/* Operating Activities */}
              <Card>
                <CardContent className="p-0">
                  <div className="bg-muted/30 border-b p-4">
                    <h2 className="font-bold text-lg">
                      Cash Flow from Operating Activities
                    </h2>
                  </div>
                  <table className="w-full">
                    <tbody>
                      {data.operating_activities.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                            No operating activities recorded
                          </td>
                        </tr>
                      ) : (
                        data.operating_activities.map((item, idx) => (
                          <tr key={idx} className="border-b hover:bg-muted/30">
                            <td className="p-3 text-sm">{item.description}</td>
                            <td className={`p-3 text-right font-mono text-sm ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {item.amount >= 0 ? '+' : ''}{money(item.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-muted/20 border-t-2">
                      <tr>
                        <td className="p-3 font-bold text-sm">Net Cash from Operating Activities</td>
                        <td className={`p-3 text-right font-mono font-bold text-sm ${data.net_operating >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {data.net_operating >= 0 ? '+' : ''}{money(data.net_operating)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Investing Activities */}
              <Card>
                <CardContent className="p-0">
                  <div className="bg-muted/30 border-b p-4">
                    <h2 className="font-bold text-lg">
                      Cash Flow from Investing Activities
                    </h2>
                  </div>
                  <table className="w-full">
                    <tbody>
                      {data.investing_activities.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                            No investing activities recorded
                          </td>
                        </tr>
                      ) : (
                        data.investing_activities.map((item, idx) => (
                          <tr key={idx} className="border-b hover:bg-muted/30">
                            <td className="p-3 text-sm">{item.description}</td>
                            <td className={`p-3 text-right font-mono text-sm ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {item.amount >= 0 ? '+' : ''}{money(item.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-muted/20 border-t-2">
                      <tr>
                        <td className="p-3 font-bold text-sm">Net Cash from Investing Activities</td>
                        <td className={`p-3 text-right font-mono font-bold text-sm ${data.net_investing >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {data.net_investing >= 0 ? '+' : ''}{money(data.net_investing)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Financing Activities */}
              <Card>
                <CardContent className="p-0">
                  <div className="bg-muted/30 border-b p-4">
                    <h2 className="font-bold text-lg">
                      Cash Flow from Financing Activities
                    </h2>
                  </div>
                  <table className="w-full">
                    <tbody>
                      {data.financing_activities.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-6 text-center text-muted-foreground text-sm">
                            No financing activities recorded
                          </td>
                        </tr>
                      ) : (
                        data.financing_activities.map((item, idx) => (
                          <tr key={idx} className="border-b hover:bg-muted/30">
                            <td className="p-3 text-sm">{item.description}</td>
                            <td className={`p-3 text-right font-mono text-sm ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {item.amount >= 0 ? '+' : ''}{money(item.amount)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-muted/20 border-t-2">
                      <tr>
                        <td className="p-3 font-bold text-sm">Net Cash from Financing Activities</td>
                        <td className={`p-3 text-right font-mono font-bold text-sm ${data.net_financing >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {data.net_financing >= 0 ? '+' : ''}{money(data.net_financing)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-sm font-semibold">Opening Cash & Cash Equivalents</span>
                      {data.breakdown && data.breakdown.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>Cash in Hand: <strong className="font-mono text-foreground">{money(totalCashOpening)}</strong></span>
                          <span>•</span>
                          <span>Bank Accounts: <strong className="font-mono text-foreground">{money(totalBankOpening)}</strong></span>
                        </div>
                      )}
                    </div>
                    <span className="font-mono font-bold text-base">
                      {money(data.opening_cash)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-4">
                    <span className="text-sm font-semibold">Net Change in Cash</span>
                    <span className={`font-mono font-bold ${data.net_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {data.net_change >= 0 ? '+' : ''}{money(data.net_change)}
                    </span>
                  </div>
                  <div className="flex justify-between items-start border-t pt-4">
                    <div>
                      <span className="text-lg font-bold">Closing Cash & Cash Equivalents</span>
                      {data.breakdown && data.breakdown.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>Cash in Hand: <strong className="font-mono text-foreground">{money(totalCashClosing)}</strong></span>
                          <span>•</span>
                          <span>Bank Accounts: <strong className="font-mono text-foreground">{money(totalBankClosing)}</strong></span>
                        </div>
                      )}
                    </div>
                    <span className="text-2xl font-mono font-bold text-primary">
                      {money(data.closing_cash)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Cash & Bank Account Breakdown Card */}
              {data.breakdown && data.breakdown.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <div className="bg-muted/30 border-b p-4">
                      <h2 className="font-bold text-base flex items-center gap-2">
                        <IconBuildingBank size={18} className="text-primary" />
                        Cash & Bank Balances Breakdown (Cash Equivalents)
                      </h2>
                      <p className="text-xs text-muted-foreground mt-1">
                        Reconciliation of Cash in Hand and Bank accounts included in the Cash Flow Statement
                      </p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b bg-muted/10 text-xs text-muted-foreground font-semibold">
                            <th className="p-3 text-left">Account</th>
                            <th className="p-3 text-left">Group</th>
                            <th className="p-3 text-right">Opening Balance</th>
                            <th className="p-3 text-right">Net Change</th>
                            <th className="p-3 text-right">Closing Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.breakdown.map((acc) => (
                            <tr key={acc.account_id} className="border-b hover:bg-muted/30 text-sm">
                              <td className="p-3">
                                <span className="font-medium">{acc.account_name}</span>
                                <span className="text-xs text-muted-foreground ml-2 font-mono">({acc.account_code})</span>
                              </td>
                              <td className="p-3 text-xs">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  acc.account_group.toLowerCase().includes('cash')
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                }`}>
                                  {acc.account_group}
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono text-sm">
                                {money(acc.opening_balance)}
                              </td>
                              <td className={`p-3 text-right font-mono text-sm ${acc.net_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {acc.net_change >= 0 ? '+' : ''}{money(acc.net_change)}
                              </td>
                              <td className="p-3 text-right font-mono text-sm font-semibold">
                                {money(acc.closing_balance)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-muted/20 border-t-2 font-bold text-sm">
                          <tr>
                            <td colSpan={2} className="p-3">Total Cash & Cash Equivalents</td>
                            <td className="p-3 text-right font-mono">{money(data.opening_cash)}</td>
                            <td className={`p-3 text-right font-mono ${data.net_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {data.net_change >= 0 ? '+' : ''}{money(data.net_change)}
                            </td>
                            <td className="p-3 text-right font-mono text-primary font-bold">{money(data.closing_cash)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
