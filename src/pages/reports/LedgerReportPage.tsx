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
import { useSelector, useDispatch } from 'react-redux';
import {
  RootState,
  setLedgerReportSelectedAccount,
  setLedgerReportFromDate,
  setLedgerReportToDate,
  setLedgerReportData,
  setActiveSectionWithParams,
} from '@/store';
import { useMoney } from '@/hooks/useMoney';
import { useMultiCurrencyEnabled } from '@/hooks/useMultiCurrency';

interface LedgerAccount {
  id: string;
  account_code: string;
  account_name: string;
}

interface LedgerEntry {
  id: string;
  date: string;
  voucher_no: string;
  voucher_type: string;
  narration: string;
  debit: number;
  credit: number;
  balance: number;
  foreign_debit?: number;
  foreign_credit?: number;
  foreign_balance?: number;
  currency_code?: string;
  currency_symbol?: string;
}

export default function LedgerReportPage() {
  const dispatch = useDispatch();
  const {
    selectedAccount,
    entries,
    fromDate,
    toDate,
    openingBalance,
    closingBalance,
    foreignOpeningBalance,
    foreignClosingBalance,
    foreignCurrencyCode,
    foreignCurrencySymbol,
    hasGenerated,
  } = useSelector((state: RootState) => state.ledgerReport);
  const companyProfile = useSelector((state: RootState) => state.companyProfile.profile);
  const isExportBusiness = useMultiCurrencyEnabled();
  const money = useMoney();

  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(false);
  // 'base' = INR view, anything else (e.g. 'USD') = foreign currency view
  const [viewCurrency, setViewCurrency] = useState<'base' | string>('base');

  useEffect(() => {
    loadAccounts();
  }, []);

  // Auto-generate report when an account is selected via drill-down navigation
  useEffect(() => {
    if (selectedAccount) {
      loadLedger();
    }
  }, [selectedAccount]);

  // Reset to base currency view when account changes or new report is generated
  useEffect(() => {
    setViewCurrency('base');
  }, [selectedAccount, hasGenerated]);

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
        foreign_opening_balance: number;
        foreign_closing_balance: number;
        foreign_currency_code: string;
        foreign_currency_symbol: string;
      }>('get_ledger_report', {
        accountId: selectedAccount,
        fromDate: fromDate || null,
        toDate,
      });

      dispatch(setLedgerReportData({
        entries: result.entries,
        openingBalance: result.opening_balance,
        closingBalance: result.closing_balance,
        foreignOpeningBalance: result.foreign_opening_balance,
        foreignClosingBalance: result.foreign_closing_balance,
        foreignCurrencyCode: result.foreign_currency_code,
        foreignCurrencySymbol: result.foreign_currency_symbol,
      }));
    } catch (error) {
      toast.error('Failed to load ledger');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Foreign currency view helpers
  const hasForeignCurrency = isExportBusiness && 
    !!foreignCurrencyCode && 
    foreignCurrencyCode !== (companyProfile.base_currency || 'INR');
  const isViewingForeign = viewCurrency !== 'base';

  // Filter out Forex Gain/Loss Adjustments in foreign currency view
  const displayedEntries = isViewingForeign
    ? entries.filter(e => e.narration !== 'Forex Gain Adjustment' && e.narration !== 'Forex Loss Adjustment')
    : entries;

  const selectedAccountData = accounts.find(a => a.id === selectedAccount);

  const handlePrint = async () => {
    if (!selectedAccountData || displayedEntries.length === 0) {
      toast.error('No data to print');
      return;
    }

    try {
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `Ledger-${selectedAccountData.account_code}-${timestamp}.pdf`;
      
      const downloadsPath = await invoke<string>('get_downloads_path');
      const filePath = `${downloadsPath}/${fileName}`;

      const pdfData = {
        account_code: selectedAccountData.account_code,
        account_name: selectedAccountData.account_name,
        period_from: fromDate || 'Beginning',
        period_to: toDate,
        opening_balance: isViewingForeign ? foreignOpeningBalance : openingBalance,
        closing_balance: isViewingForeign ? foreignClosingBalance : closingBalance,
        currency_code: isViewingForeign ? foreignCurrencyCode : (companyProfile.base_currency || 'INR'),
        currency_symbol: isViewingForeign ? foreignCurrencySymbol : (companyProfile.base_currency_symbol || ''),
        currency_display: companyProfile.currency_display || 'symbol',
        entries: displayedEntries.map(e => ({
          date: e.date,
          voucher_no: e.voucher_no,
          voucher_type: e.voucher_type,
          narration: e.narration || '-',
          debit: isViewingForeign ? (e.foreign_debit ?? 0) : e.debit,
          credit: isViewingForeign ? (e.foreign_credit ?? 0) : e.credit,
          balance: isViewingForeign ? (e.foreign_balance ?? 0) : e.balance,
        })),
      };

      await invoke('generate_ledger_pdf', {
        data: pdfData,
        filePath,
      });

      toast.success(`PDF generated at: ${filePath}`);
    } catch (error) {
      toast.error('Failed to generate PDF');
      console.error(error);
    }
  };

  const handleExport = () => {
    // TODO: Implement CSV export
    toast.info('Export functionality coming soon');
  };

  const handleVoucherClick = (id: string, type: string) => {
    let section = '';
    switch (type) {
      case 'sales_invoice':
        section = 'sales';
        break;
      case 'sales_return':
        section = 'sales_return';
        break;
      case 'purchase_invoice':
        section = 'purchase';
        break;
      case 'purchase_return':
        section = 'purchase_return';
        break;
      case 'payment':
        section = 'payments';
        break;
      case 'receipt':
        section = 'receipts';
        break;
      case 'journal':
        section = 'journal';
        break;
      case 'opening_balance':
        section = 'opening';
        break;
      case 'opening_stock':
        section = 'opening_stock';
        break;
      case 'stock_journal':
        section = 'stock_journal';
        break;
      case 'delivery_note':
        section = 'delivery_note';
        break;
      case 'sales_quotation':
      case 'quotation':
        section = 'sales_quotation';
        break;
      default:
        toast.error(`Unknown voucher type: ${type}`);
        return;
    }

    dispatch(
      setActiveSectionWithParams({
        section,
        params: { voucherId: id },
      })
    );
  };

  // Opening/closing balance values based on view mode
  const displayOpeningBalance = isViewingForeign ? foreignOpeningBalance : openingBalance;
  const displayClosingBalance = isViewingForeign ? foreignClosingBalance : closingBalance;

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
        <div className="mt-4 flex gap-4 items-end flex-wrap">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <Label className="text-xs mb-1 block">Select Account *</Label>
            <Combobox
              options={accounts.map(a => ({
                value: a.id,
                label: `${a.account_code} - ${a.account_name}`,
              }))}
              value={selectedAccount ?? undefined}
              onChange={(val) => dispatch(setLedgerReportSelectedAccount(val as string))}
              placeholder="Choose account..."
              searchPlaceholder="Search accounts..."
            />
          </div>
          <div className="flex-1 max-w-xs">
            <Label className="text-xs mb-1 block">From Date</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => dispatch(setLedgerReportFromDate(e.target.value))}
              className="h-9"
            />
          </div>
          <div className="flex-1 max-w-xs">
            <Label className="text-xs mb-1 block">To Date</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => dispatch(setLedgerReportToDate(e.target.value))}
              className="h-9"
            />
          </div>
          <Button onClick={loadLedger} size="sm" disabled={!selectedAccount}>
            Generate Report
          </Button>

          {/* Currency Toggle â€” visible only for export businesses that have foreign currency data */}
          {hasForeignCurrency && hasGenerated && (
            <div>
              <Label className="text-xs mb-1 block">View In</Label>
              <div className="flex rounded-md border overflow-hidden h-9">
                <button
                  type="button"
                  onClick={() => setViewCurrency('base')}
                  className={`px-3 text-xs font-medium transition-colors ${
                    !isViewingForeign
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {companyProfile.base_currency || 'INR'}
                </button>
                <button
                  type="button"
                  onClick={() => setViewCurrency(foreignCurrencyCode)}
                  className={`px-3 text-xs font-medium border-l transition-colors ${
                    isViewingForeign
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {foreignCurrencyCode}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {/* Print Header */}
          {selectedAccountData && displayedEntries.length > 0 && (
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
          ) : !hasGenerated ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Click 'Generate Report' to view ledger</p>
            </div>
          ) : (displayedEntries.length === 0 && openingBalance === 0 && closingBalance === 0) ? (
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
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-lg">
                          {selectedAccountData?.account_code} - {selectedAccountData?.account_name}
                        </h2>
                        {isViewingForeign && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">
                            {foreignCurrencyCode} View
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Period: {fromDate ? formatDate(fromDate) : 'Beginning'} to {formatDate(toDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Opening Balance</div>
                      {isViewingForeign ? (
                        <>
                          <div className="text-lg font-bold font-mono">
                            {foreignCurrencySymbol}{Math.abs(displayOpeningBalance).toFixed(2)} {displayOpeningBalance >= 0 ? 'Dr' : 'Cr'}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {money(Math.abs(openingBalance))} {openingBalance >= 0 ? 'Dr' : 'Cr'}
                          </div>
                        </>
                      ) : (
                        <div className="text-lg font-bold font-mono">
                          {money(Math.abs(openingBalance))} {openingBalance >= 0 ? 'Dr' : 'Cr'}
                        </div>
                      )}
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
                      <th className="p-3 text-right text-sm font-semibold">
                        {isViewingForeign ? `Debit (${foreignCurrencyCode})` : 'Debit'}
                      </th>
                      <th className="p-3 text-right text-sm font-semibold">
                        {isViewingForeign ? `Credit (${foreignCurrencyCode})` : 'Credit'}
                      </th>
                      <th className="p-3 text-right text-sm font-semibold">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening Balance Row */}
                    {displayOpeningBalance !== 0 && (
                      <tr className="bg-muted/20 border-b font-semibold">
                        <td className="p-3 text-sm" colSpan={4}>Opening Balance</td>
                        <td className="p-3 text-right font-mono text-sm">
                          {isViewingForeign
                            ? (displayOpeningBalance > 0 ? `${foreignCurrencySymbol}${displayOpeningBalance.toFixed(2)}` : '-')
                            : (openingBalance > 0 ? money(openingBalance) : '-')}
                        </td>
                        <td className="p-3 text-right font-mono text-sm">
                          {isViewingForeign
                            ? (displayOpeningBalance < 0 ? `${foreignCurrencySymbol}${Math.abs(displayOpeningBalance).toFixed(2)}` : '-')
                            : (openingBalance < 0 ? money(Math.abs(openingBalance)) : '-')}
                        </td>
                        <td className="p-3 text-right font-mono text-sm font-bold">
                          {isViewingForeign
                            ? `${foreignCurrencySymbol}${Math.abs(displayOpeningBalance).toFixed(2)} ${displayOpeningBalance >= 0 ? 'Dr' : 'Cr'}`
                            : `${money(Math.abs(openingBalance))} ${openingBalance >= 0 ? 'Dr' : 'Cr'}`}
                        </td>
                      </tr>
                    )}

                    {displayedEntries.map((entry, idx) => {
                      const entryMatchesForeignCurrency = !!entry.currency_code && entry.currency_code === foreignCurrencyCode;
                      return (
                        <tr key={idx} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-sm">{formatDate(entry.date)}</td>
                          <td className="p-3 text-sm">
                            <button
                              type="button"
                              onClick={() => handleVoucherClick(entry.id, entry.voucher_type)}
                              className="text-primary hover:underline font-mono font-medium text-left cursor-pointer focus:outline-none"
                            >
                              {entry.voucher_no}
                            </button>
                          </td>
                          <td className="p-3 text-sm">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                              {entry.voucher_type ? entry.voucher_type.replace(/_/g, ' ').toUpperCase() : '-'}
                            </span>
                          </td>
                          <td className="p-3 text-sm text-muted-foreground">{entry.narration || '-'}</td>

                          {/* Debit column */}
                          <td className="p-3 text-right font-mono text-sm">
                            {isViewingForeign
                              ? (entryMatchesForeignCurrency && (entry.foreign_debit ?? 0) > 0
                                  ? `${foreignCurrencySymbol}${(entry.foreign_debit ?? 0).toFixed(2)}`
                                  : '-')
                              : (entry.debit > 0 ? money(entry.debit) : '-')}
                          </td>

                          {/* Credit column */}
                          <td className="p-3 text-right font-mono text-sm">
                            {isViewingForeign
                              ? (entryMatchesForeignCurrency && (entry.foreign_credit ?? 0) > 0
                                  ? `${foreignCurrencySymbol}${(entry.foreign_credit ?? 0).toFixed(2)}`
                                  : '-')
                              : (entry.credit > 0 ? money(entry.credit) : '-')}
                          </td>

                          {/* Balance column â€” in foreign view, show both */}
                          <td className="p-3 text-right font-mono text-sm font-semibold">
                            {isViewingForeign ? (
                              <div>
                                <div>
                                  {foreignCurrencySymbol}{Math.abs(entry.foreign_balance ?? 0).toFixed(2)} {(entry.foreign_balance ?? 0) >= 0 ? 'Dr' : 'Cr'}
                                </div>
                                <div className="text-xs text-muted-foreground font-normal">
                                  {money(Math.abs(entry.balance))} {entry.balance >= 0 ? 'Dr' : 'Cr'}
                                </div>
                              </div>
                            ) : (
                              `${money(Math.abs(entry.balance))} ${entry.balance >= 0 ? 'Dr' : 'Cr'}`
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
                    <tr>
                      <td colSpan={4} className="p-3 font-bold text-sm">Closing Balance</td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        {isViewingForeign
                          ? (displayClosingBalance > 0 ? `${foreignCurrencySymbol}${displayClosingBalance.toFixed(2)}` : '-')
                          : (closingBalance > 0 ? money(closingBalance) : '-')}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        {isViewingForeign
                          ? (displayClosingBalance < 0 ? `${foreignCurrencySymbol}${Math.abs(displayClosingBalance).toFixed(2)}` : '-')
                          : (closingBalance < 0 ? money(Math.abs(closingBalance)) : '-')}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-sm">
                        {isViewingForeign ? (
                          <div>
                            <div>
                              {foreignCurrencySymbol}{Math.abs(displayClosingBalance).toFixed(2)} {displayClosingBalance >= 0 ? 'Dr' : 'Cr'}
                            </div>
                            <div className="text-xs text-muted-foreground font-normal">
                              {money(Math.abs(closingBalance))} {closingBalance >= 0 ? 'Dr' : 'Cr'}
                            </div>
                          </div>
                        ) : (
                          `${money(Math.abs(closingBalance))} ${closingBalance >= 0 ? 'Dr' : 'Cr'}`
                        )}
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