import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconDownload, IconPrinter, IconRefresh, IconFilter, IconX } from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

interface Transaction {
  id: string; // Changed to string
  voucher_no: string;
  voucher_type: string;
  voucher_date: string;
  party_id: string | null; // Changed to string
  party_name: string | null;
  amount: number;
  narration: string;
  created_at: string;
}

interface Party {
  id: string; // Changed to string
  party_name: string;
  party_type: string;
}

export default function TransactionReportPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(false);

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [voucherType, setVoucherType] = useState<string>('all');
  const [selectedParty, setSelectedParty] = useState<string>(""); // Changed to string

  useEffect(() => {
    loadParties();
    loadTransactions();
  }, []);

  const loadParties = async () => {
    try {
      const result = await invoke<Party[]>('get_all_parties');
      setParties(result);
    } catch (error) {
      console.error('Failed to load parties:', error);
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const result = await invoke<Transaction[]>('get_transaction_report', {
        fromDate,
        toDate,
        voucherType: voucherType === 'all' ? null : voucherType,
        partyId: selectedParty || null,
      });
      setTransactions(result);
    } catch (error) {
      toast.error('Failed to load transactions');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setVoucherType('all');
    setSelectedParty("");
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    setFromDate(d.toISOString().split('T')[0]);
    setToDate(new Date().toISOString().split('T')[0]);
    // Optionally trigger reload here or rely on user to click Apply
    // loadTransactions(); // If we want auto-reload
  };

  // Trigger loadTransactions when filters are cleared if desired, but user might want 'Apply' button strictly.
  // The UI has an 'Apply' button, so explicit load is fine.

  const handlePrint = () => window.print();
  const handleExport = () => toast.info('Export functionality coming soon');

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      sales_invoice: 'Sales',
      purchase_invoice: 'Purchase',
      payment: 'Payment',
      receipt: 'Receipt',
      journal: 'Journal',
      opening_balance: 'Opening',
    };
    return labels[type] || type;
  };

  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

  const salesTotal = transactions
    .filter(t => t.voucher_type === 'sales_invoice')
    .reduce((sum, t) => sum + t.amount, 0);

  const purchaseTotal = transactions
    .filter(t => t.voucher_type === 'purchase_invoice')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Transaction Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Filter and analyze all business transactions
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadTransactions}>
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
        <div className="mt-4 space-y-3">
          <div className="flex gap-4 items-end">
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
            <div className="flex-1 max-w-xs">
              <Label className="text-xs mb-1 block">Transaction Type</Label>
              <Select value={voucherType} onValueChange={setVoucherType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sales_invoice">Sales</SelectItem>
                  <SelectItem value="purchase_invoice">Purchase</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="journal">Journal</SelectItem>
                  <SelectItem value="opening_balance">Opening Balance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 max-w-sm">
              <Label className="text-xs mb-1 block">Party</Label>
              <Combobox
                options={[
                  { value: "", label: 'All Parties' }, // Changed to empty string
                  ...parties.map(p => ({
                    value: p.id,
                    label: `${p.party_name} (${p.party_type})`,
                  }))
                ]}
                value={selectedParty}
                onChange={(val) => setSelectedParty(val as string)} // Changed cast to string
                placeholder="Select party..."
                searchPlaceholder="Search parties..."
              />
            </div>
            <Button onClick={loadTransactions} size="sm">
              <IconFilter size={16} />
              Apply
            </Button>
            <Button onClick={handleClearFilters} variant="outline" size="sm">
              <IconX size={16} />
              Clear
            </Button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">Transaction Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Period: {formatDate(fromDate)} to {formatDate(toDate)}
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Transactions</p>
                <p className="text-2xl font-bold mt-1">{transactions.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Sales</p>
                <p className="text-2xl font-bold font-mono mt-1 text-green-600">
                  ₹{salesTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Purchases</p>
                <p className="text-2xl font-bold font-mono mt-1 text-blue-600">
                  ₹{purchaseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading transactions...</p>
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
                      <th className="p-3 text-left text-sm font-semibold">Narration</th>
                      <th className="p-3 text-right text-sm font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          No transactions found
                        </td>
                      </tr>
                    ) : (
                      transactions.map((txn) => (
                        <tr key={txn.id} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-sm">{formatDate(txn.voucher_date)}</td>
                          <td className="p-3 font-mono text-sm">{txn.voucher_no}</td>
                          <td className="p-3 text-sm">
                            <span className="px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider bg-muted/50 text-muted-foreground">
                              {getTypeLabel(txn.voucher_type)}
                            </span>
                          </td>
                          <td className="p-3 text-sm">{txn.party_name || '-'}</td>
                          <td className="p-3 text-sm text-muted-foreground truncate max-w-xs">
                            {txn.narration || '-'}
                          </td>
                          <td className="p-3 text-right font-mono text-sm font-bold">
                            ₹{txn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {transactions.length > 0 && (
                    <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
                      <tr>
                        <td colSpan={5} className="p-3 font-bold text-sm">TOTAL</td>
                        <td className="p-3 text-right font-mono font-bold text-sm">
                          ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
