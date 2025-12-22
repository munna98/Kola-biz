import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { IconDownload, IconPrinter, IconRefresh } from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

interface LedgerAccount {
  id: number;
  account_code: string;
  account_name: string;
}

interface LedgerEntry {
  date: string;
  voucher_no: string;
  voucher_type: string;
  narration: string;
  debit: number;
  credit: number;
  balance: number;
}

export default function LedgerReportPage() {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<number>(0);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    date.setDate(1);
    return date.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const result = await invoke<LedgerAccount[]>('get_chart_of_accounts');
      setAccounts(result);
    } catch (error) {
      toast.error('Failed to load accounts');
      console.error(error);
    }
  };

  const loadLedger = async () => {
    if (!selectedAccount) {
      toast.error('Please select an account');
      return;
    }

    try {
      setLoading(true);
      const result = await invoke<{
        entries: LedgerEntry[];
        opening_balance: number;
        closing_balance: number;
      }>('get_ledger_report', {
        accountId: selectedAccount,
        fromDate: fromDate || null,
        toDate,
      });

      setEntries(result.entries);
      setOpeningBalance(result.opening_balance);
      setClosingBalance(result.closing_balance);
    } catch (error) {
      toast.error('Failed to load ledger');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const selectedAccountData = accounts.find(a => a.id === selectedAccount);

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
            <h1 className="text-xl font-bold">Ledger Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Account-wise transaction history with running balance
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadLedger} disabled={!selectedAccount}>
              <IconRefresh size={16} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={entries.length === 0}>
              <IconDownload size={16} />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={entries.length === 0}>
              <IconPrinter size={16} />
              Print
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex gap-4 items-end">
          <div className="flex-1 max-w-sm">
            <Label className="text-xs mb-1 block">Select Account *</Label>
            <Combobox
              options={accounts.map(a => ({
                value: a.id,
                label: `${a.account_code} - ${a.account_name}`,
              }))}
              value={selectedAccount}
              onChange={(val) => setSelectedAccount(val as number)}
              placeholder="Choose account..."
              searchPlaceholder="Search accounts..."
            />
          </div>
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
          <Button onClick={loadLedger} size="sm" disabled={!selectedAccount}>
            Generate Report
          </Button>
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Print Header */}
          {selectedAccountData && entries.length > 0 && (
            <div className="hidden print:block mb-6">
              <div className="text-center">
                <h1 className="text-2xl font-bold">Ledger Report</h1>
                <p className="text-lg font-semibold mt-2">
                  {selectedAccountData.account_code} - {selectedAccountData.account_name}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Period: {fromDate ? formatDate(fromDate) : 'Beginning'} to {formatDate(toDate)}
                </p>
              </div>
            </div>
          )}

          {!selectedAccount ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Select an account to view ledger</p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading ledger...</p>
            </div>
          ) : entries.length === 0 && selectedAccount ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">No transactions found for this account</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                {/* Account Header */}
                <div className="bg-muted/50 border-b p-4 print:hidden">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-lg">
                        {selectedAccountData?.account_code} - {selectedAccountData?.account_name}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Period: {fromDate ? formatDate(fromDate) : 'Beginning'} to {formatDate(toDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Opening Balance</div>
                      <div className="text-lg font-bold font-mono">
                        ₹{Math.abs(openingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {openingBalance >= 0 ? 'Dr' : 'Cr'}
                      </div>
                    </div>
                  </div>
                </div>

                <table className="w-full">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="p-3 text-left text-sm font-semibold">Date</th>
                      <th className="p-3 text-left text-sm font-semibold">Voucher No</th>
                      <th className="p-3 text-left text-sm font-semibold">Type</th>
                      <th className="p-3 text-left text-sm font-semibold">Narration</th>
                      <th className="p-3 text-right text-sm font-semibold">Debit</th>
                      <th className="p-3 text-right text-sm font-semibold">Credit</th>
                      <th className="p-3 text-right text-sm font-semibold">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening Balance Row */}
                    {openingBalance !== 0 && (
                      <tr className="bg-muted/20 border-b font-semibold">
                        <td className="p-3 text-sm" colSpan={4}>Opening Balance</td>
                        <td className="p-3 text-right font-mono text-sm">
                          {openingBalance > 0 ? `₹${openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="p-3 text-right font-mono text-sm">
                          {openingBalance < 0 ? `₹${Math.abs(openingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="p-3 text-right font-mono text-sm font-bold">
                          ₹{Math.abs(openingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {openingBalance >= 0 ? 'Dr' : 'Cr'}
                        </td>
                      </tr>
                    )}

                    {entries.map((entry, idx) => (
                      <tr key={idx} className="border-b hover:bg-muted/30">
                        <td className="p-3 text-sm">{formatDate(entry.date)}</td>
                        <td className="p-3 font-mono text-sm">{entry.voucher_no}</td>
                        <td className="p-3 text-sm">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                            {entry.voucher_type}
                          </span>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">{entry.narration || '-'}</td>
                        <td className="p-3 text-right font-mono text-sm">
                          {entry.debit > 0 ? `₹${entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="p-3 text-right font-mono text-sm">
                          {entry.credit > 0 ? `₹${entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="p-3 text-right font-mono text-sm font-semibold">
                          ₹{Math.abs(entry.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {entry.balance >= 0 ? 'Dr' : 'Cr'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
                    <tr>
                      <td colSpan={4} className="p-3 font-bold text-sm">Closing Balance</td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        {closingBalance > 0 ? `₹${closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        {closingBalance < 0 ? `₹${Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        ₹{Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {closingBalance >= 0 ? 'Dr' : 'Cr'}
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