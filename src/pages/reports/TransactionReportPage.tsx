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
import { IconDownload, IconPrinter, IconRefresh, IconFilter, IconX, IconPackage, IconReceipt } from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { useMoney } from '@/hooks/useMoney';

interface Transaction {
  id: string;
  voucher_no: string;
  voucher_type: string;
  voucher_date: string;
  party_id: string | null;
  party_name: string | null;
  amount: number;
  narration: string;
  created_at: string;
}

interface ProductTransactionRow {
  voucher_id: string;
  voucher_no: string;
  voucher_type: string;
  voucher_date: string;
  party_name: string | null;
  product_id: string;
  product_name: string;
  product_code: string;
  unit_symbol: string;
  quantity: number;
  rate: number;
  amount: number;
  net_amount: number;
}

interface Party {
  id: string;
  party_name: string;
  party_type: string;
}

interface SimpleProduct {
  id: string;
  name: string;
  code: string;
}

type ViewMode = 'vouchers' | 'products';

export default function TransactionReportPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('vouchers');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [productRows, setProductRows] = useState<ProductTransactionRow[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [products, setProducts] = useState<SimpleProduct[]>([]);
  const [loading, setLoading] = useState(false);

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  const [voucherType, setVoucherType] = useState<string>('all');
  const [selectedParty, setSelectedParty] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [coEnabled, setCoEnabled] = useState(false);
  const money = useMoney();

  useEffect(() => {
    loadParties();
    loadProducts();
    loadTransactions();
    invoke<string | null>('get_app_setting', { key: 'custom_orders_enabled' })
      .then((val) => setCoEnabled(val === 'true'))
      .catch(() => setCoEnabled(false));
  }, []);

  const loadParties = async () => {
    try {
      const result = await invoke<Party[]>('get_all_parties');
      setParties(result);
    } catch (error) {
      console.error('Failed to load parties:', error);
    }
  };

  const loadProducts = async () => {
    try {
      const result = await invoke<{ id: string; name: string; code: string }[]>('get_products');
      setProducts(result.map(p => ({ id: p.id, name: p.name, code: p.code })));
    } catch (error) {
      console.error('Failed to load products:', error);
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

  const loadProductRows = async () => {
    try {
      setLoading(true);
      const result = await invoke<ProductTransactionRow[]>('get_product_transaction_report', {
        fromDate,
        toDate,
        voucherType: voucherType === 'all' ? null : voucherType,
        partyId: selectedParty || null,
        productId: selectedProduct || null,
      });
      setProductRows(result);
    } catch (error) {
      toast.error('Failed to load product transactions');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (viewMode === 'vouchers') {
      loadTransactions();
    } else {
      loadProductRows();
    }
  };

  const handleClearFilters = () => {
    setVoucherType('all');
    setSelectedParty('');
    setSelectedProduct('');
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    setFromDate(d.toISOString().split('T')[0]);
    setToDate(new Date().toISOString().split('T')[0]);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    // Reset product filter when switching away from products mode
    if (mode === 'vouchers') {
      setSelectedProduct('');
    }
  };

  // Reload data when view mode changes
  useEffect(() => {
    if (viewMode === 'vouchers') {
      loadTransactions();
    } else {
      loadProductRows();
    }
  }, [viewMode]);

  const handlePrint = () => window.print();
  const handleExport = () => toast.info('Export functionality coming soon');

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      sales_invoice: 'Sales',
      co_invoice: 'Custom Order',
      purchase_invoice: 'Purchase',
      sales_return: 'Sales Return',
      purchase_return: 'Purchase Return',
      payment: 'Payment',
      receipt: 'Receipt',
      journal: 'Journal',
      opening_balance: 'Opening',
    };
    return labels[type] || type;
  };

  const getTypeBadgeClass = (type: string) => {
    const classes: Record<string, string> = {
      sales_invoice: 'bg-green-100 text-green-700 border-green-200',
      co_invoice: 'bg-purple-100 text-purple-700 border-purple-200',
      purchase_invoice: 'bg-blue-100 text-blue-700 border-blue-200',
      sales_return: 'bg-orange-100 text-orange-700 border-orange-200',
      purchase_return: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      payment: 'bg-red-100 text-red-700 border-red-200',
      receipt: 'bg-teal-100 text-teal-700 border-teal-200',
      journal: 'bg-gray-100 text-gray-700 border-gray-200',
      opening_balance: 'bg-gray-100 text-gray-600 border-gray-200',
    };
    return classes[type] || 'bg-muted/50 text-muted-foreground border';
  };

  // Table footer totals
  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
  const productTotalValue = productRows.reduce((sum, r) => sum + r.net_amount, 0);


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
            <Button variant="outline" size="sm" onClick={handleApply}>
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

        {/* View Mode Toggle */}
        <div className="mt-4 flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => handleViewModeChange('vouchers')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              viewMode === 'vouchers'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <IconReceipt size={14} />
            Vouchers
          </button>
          <button
            onClick={() => handleViewModeChange('products')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              viewMode === 'products'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <IconPackage size={14} />
            Products
          </button>
        </div>

        {/* Filters */}
        <div className="mt-3 space-y-3">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[140px] max-w-[180px]">
              <Label className="text-xs mb-1 block">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex-1 min-w-[140px] max-w-[180px]">
              <Label className="text-xs mb-1 block">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex-1 min-w-[140px] max-w-[180px]">
              <Label className="text-xs mb-1 block">Transaction Type</Label>
              <Select value={voucherType} onValueChange={setVoucherType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sales_invoice">Sales</SelectItem>
                  {coEnabled && <SelectItem value="co_invoice">Custom Order</SelectItem>}
                  <SelectItem value="purchase_invoice">Purchase</SelectItem>
                  {viewMode === 'vouchers' && (
                    <>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="receipt">Receipt</SelectItem>
                      <SelectItem value="journal">Journal</SelectItem>
                      <SelectItem value="opening_balance">Opening Balance</SelectItem>
                    </>
                  )}
                  {viewMode === 'products' && (
                    <>
                      <SelectItem value="sales_return">Sales Return</SelectItem>
                      <SelectItem value="purchase_return">Purchase Return</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px] max-w-[220px]">
              <Label className="text-xs mb-1 block">Party</Label>
              <Combobox
                options={[
                  { value: '', label: 'All Parties' },
                  ...parties.map(p => ({
                    value: p.id,
                    label: `${p.party_name} (${p.party_type})`,
                  }))
                ]}
                value={selectedParty}
                onChange={(val) => setSelectedParty(val as string)}
                placeholder="Select party..."
                searchPlaceholder="Search parties..."
              />
            </div>
            {viewMode === 'products' && (
              <div className="flex-1 min-w-[160px] max-w-[220px]">
                <Label className="text-xs mb-1 block">Product</Label>
                <Combobox
                  options={[
                    { value: '', label: 'All Products' },
                    ...products.map(p => ({
                      value: p.id,
                      label: p.name + (p.code ? ` (${p.code})` : ''),
                    }))
                  ]}
                  value={selectedProduct}
                  onChange={(val) => setSelectedProduct(val as string)}
                  placeholder="Select product..."
                  searchPlaceholder="Search products..."
                />
              </div>
            )}
            <Button onClick={handleApply} size="sm">
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
              {viewMode === 'products' ? 'Products View — ' : ''}Period: {formatDate(fromDate)} to {formatDate(toDate)}
            </p>
          </div>



          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : viewMode === 'vouchers' ? (
            /* ─── VOUCHERS TABLE ─── */
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
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${getTypeBadgeClass(txn.voucher_type)}`}>
                              {getTypeLabel(txn.voucher_type)}
                            </span>
                          </td>
                          <td className="p-3 text-sm">{txn.party_name || '-'}</td>
                          <td className="p-3 text-sm text-muted-foreground truncate max-w-xs">
                            {txn.narration || '-'}
                          </td>
                          <td className="p-3 text-right font-mono text-sm font-bold">
                            {money(txn.amount)}
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
                          {money(totalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </CardContent>
            </Card>
          ) : (
            /* ─── PRODUCTS TABLE ─── */
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-3 text-left text-sm font-semibold">Date</th>
                      <th className="p-3 text-left text-sm font-semibold">Voucher No</th>
                      <th className="p-3 text-left text-sm font-semibold">Type</th>
                      <th className="p-3 text-left text-sm font-semibold">Party</th>
                      <th className="p-3 text-left text-sm font-semibold">Product</th>
                      <th className="p-3 text-right text-sm font-semibold">Qty</th>
                      <th className="p-3 text-right text-sm font-semibold">Rate</th>
                      <th className="p-3 text-right text-sm font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted-foreground">
                          No product transactions found
                        </td>
                      </tr>
                    ) : (
                      productRows.map((row, idx) => (
                        <tr key={`${row.voucher_id}-${row.product_id}-${idx}`} className="border-b hover:bg-muted/30">
                          <td className="p-3 text-sm">{formatDate(row.voucher_date)}</td>
                          <td className="p-3 font-mono text-sm">{row.voucher_no}</td>
                          <td className="p-3 text-sm">
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${getTypeBadgeClass(row.voucher_type)}`}>
                              {getTypeLabel(row.voucher_type)}
                            </span>
                          </td>
                          <td className="p-3 text-sm">{row.party_name || '-'}</td>
                          <td className="p-3 text-sm">
                            <div className="flex flex-col">
                              <span className="font-medium">{row.product_name}</span>
                              {row.product_code && (
                                <span className="text-xs text-muted-foreground font-mono">{row.product_code}</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-right font-mono text-sm">
                            {row.quantity % 1 === 0 ? row.quantity.toFixed(0) : row.quantity.toFixed(2)}
                            {row.unit_symbol && (
                              <span className="text-xs text-muted-foreground ml-1">{row.unit_symbol}</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono text-sm">
                            {money(row.rate)}
                          </td>
                          <td className="p-3 text-right font-mono text-sm font-bold">
                            {money(row.net_amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {productRows.length > 0 && (
                    <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
                      <tr>
                        <td colSpan={7} className="p-3 font-bold text-sm">TOTAL</td>
                        <td className="p-3 text-right font-mono font-bold text-sm">
                          {money(productTotalValue)}
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
