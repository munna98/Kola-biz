import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import * as XLSX from 'xlsx';
import { openPath } from '@tauri-apps/plugin-opener';
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
import { IconDownload, IconPrinter, IconRefresh, IconFilter, IconX, IconSortAscending, IconSortDescending } from '@tabler/icons-react';
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
  description?: string | null;
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

export default function TransactionReportPage() {
  const [showItems, setShowItems] = useState(false);
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
  const companyProfile = useSelector((state: RootState) => state.companyProfile.profile);
  const [isPrinting, setIsPrinting] = useState(false);
  const [dateSortOrder, setDateSortOrder] = useState<'desc' | 'asc'>('desc');

  const isProductType = (type: string) =>
    ['sales_invoice', 'co_invoice', 'purchase_invoice', 'sales_return', 'purchase_return'].includes(type);

  const handleVoucherTypeChange = (val: string) => {
    setVoucherType(val);
    if (val === 'all') {
      setShowItems(false);
      setSelectedProduct('');
    }
  };

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
    if (showItems) {
      loadProductRows();
    } else {
      loadTransactions();
    }
  };

  const handleClearFilters = () => {
    setVoucherType('all');
    setShowItems(false);
    setSelectedParty('');
    setSelectedProduct('');
    setDateSortOrder('desc');
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    setFromDate(d.toISOString().split('T')[0]);
    setToDate(new Date().toISOString().split('T')[0]);
  };

  // When the show-items checkbox changes, reload the appropriate data
  const handleShowItemsChange = (checked: boolean) => {
    setShowItems(checked);
    if (!checked) setSelectedProduct('');
  };

  useEffect(() => {
    if (showItems) {
      loadProductRows();
    } else {
      loadTransactions();
    }
  }, [showItems]);

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => {
      const dateA = new Date(a.voucher_date).getTime();
      const dateB = new Date(b.voucher_date).getTime();
      if (dateA !== dateB) {
        return dateSortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      }
      const timeA = new Date(a.created_at || a.voucher_date).getTime();
      const timeB = new Date(b.created_at || b.voucher_date).getTime();
      return dateSortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }, [transactions, dateSortOrder]);

  const sortedProductRows = useMemo(() => {
    return [...productRows].sort((a, b) => {
      const dateA = new Date(a.voucher_date).getTime();
      const dateB = new Date(b.voucher_date).getTime();
      if (dateA !== dateB) {
        return dateSortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      }
      return dateSortOrder === 'asc'
        ? a.voucher_no.localeCompare(b.voucher_no)
        : b.voucher_no.localeCompare(a.voucher_no);
    });
  }, [productRows, dateSortOrder]);

  const handlePrint = async () => {
    const hasData = showItems ? sortedProductRows.length > 0 : sortedTransactions.length > 0;
    if (!hasData) {
      toast.error('No transactions to print');
      return;
    }

    try {
      setIsPrinting(true);
      const timestamp = new Date().toISOString().split('T')[0];
      const modeSuffix = showItems ? '_Items' : '';
      const sortSuffix = `_${dateSortOrder}`;
      const fileName = `TransactionReport${modeSuffix}_${fromDate}_to_${toDate}${sortSuffix}_${timestamp}.pdf`;
      const downloadsPath = await invoke<string>('get_downloads_path');
      const filePath = `${downloadsPath}/${fileName}`;

      const companyName = companyProfile?.company_name || 'Company';
      const currencySymbol = companyProfile?.base_currency_symbol || companyProfile?.base_currency || 'Rs.';

      const partyObj = selectedParty ? parties.find((p) => p.id === selectedParty) : null;
      const partyLabel = partyObj ? partyObj.party_name : 'All Parties';

      const prodObj = selectedProduct ? products.find((p) => p.id === selectedProduct) : null;
      const productLabel = prodObj ? prodObj.name : 'All Products';

      const typeLabel = voucherType === 'all' ? 'All Types' : getTypeLabel(voucherType);
      const hasQtyRate = isProductType(voucherType);

      const pdfData = {
        company_name: companyName,
        period_from: formatDate(fromDate),
        period_to: formatDate(toDate),
        transaction_type_label: typeLabel,
        party_label: partyLabel,
        product_label: showItems && hasQtyRate ? productLabel : null,
        is_product_mode: showItems,
        has_qty_rate: hasQtyRate,
        currency_symbol: currencySymbol,
        total_amount: showItems ? productTotalValue : totalAmount,
        total_count: showItems ? sortedProductRows.length : sortedTransactions.length,
        entries: !showItems
          ? sortedTransactions.map((t) => ({
              voucher_date: formatDate(t.voucher_date),
              voucher_no: t.voucher_no,
              voucher_type: getTypeLabel(t.voucher_type),
              party_name: t.party_name || '-',
              narration: t.narration || '-',
              amount: t.amount,
            }))
          : [],
        product_entries: showItems
          ? sortedProductRows.map((r) => ({
              voucher_date: formatDate(r.voucher_date),
              voucher_no: r.voucher_no,
              voucher_type: getTypeLabel(r.voucher_type),
              party_name: r.party_name || '-',
              product_name: r.product_name,
              product_code: r.product_code || null,
              unit_symbol: r.unit_symbol || null,
              quantity: r.quantity,
              rate: r.rate,
              amount: r.net_amount || r.amount,
              description: r.description || null,
            }))
          : [],
      };

      await invoke('generate_transaction_report_pdf', {
        data: pdfData,
        filePath,
      });

      try {
        await openPath(filePath);
        toast.success(`PDF generated and opened: ${fileName}`);
      } catch (openErr) {
        console.warn('Could not auto-open PDF:', openErr);
        toast.success(`PDF saved to: ${filePath}`, {
          action: {
            label: 'Open',
            onClick: () => openPath(filePath).catch(console.error),
          },
        });
      }
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleExport = () => {
    const hasData = showItems ? sortedProductRows.length > 0 : sortedTransactions.length > 0;
    if (!hasData) {
      toast.error('No transactions to export');
      return;
    }

    try {
      const companyName = companyProfile?.company_name || 'Company';
      const currencyCode = companyProfile?.base_currency || 'INR';
      const partyObj = selectedParty ? parties.find((p) => p.id === selectedParty) : null;
      const partyLabel = partyObj ? partyObj.party_name : 'All Parties';
      const typeLabel = voucherType === 'all' ? 'All Types' : getTypeLabel(voucherType);

      const rows: any[][] = [];

      if (!showItems) {
        rows.push([`${companyName} - TRANSACTION REPORT`]);
        rows.push([`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`]);
        rows.push([`Filters: Type: ${typeLabel} | Party: ${partyLabel} | Date Order: ${dateSortOrder === 'asc' ? 'Oldest First' : 'Newest First'}`]);
        rows.push([]);
        rows.push([
          'Date',
          'Voucher No',
          'Type',
          'Party',
          'Narration',
          `Amount (${currencyCode})`,
        ]);

        for (const txn of sortedTransactions) {
          rows.push([
            formatDate(txn.voucher_date),
            txn.voucher_no,
            getTypeLabel(txn.voucher_type),
            txn.party_name || '-',
            txn.narration || '-',
            txn.amount,
          ]);
        }

        rows.push(['TOTAL', '', '', '', '', totalAmount]);

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
          { wch: 14 },
          { wch: 18 },
          { wch: 16 },
          { wch: 28 },
          { wch: 32 },
          { wch: 18 },
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `TransactionReport_${fromDate}_to_${toDate}_${dateSortOrder}_${timestamp}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast.success(`Exported as ${fileName}`);
      } else if (isProductType(voucherType)) {
        const prodObj = selectedProduct ? products.find((p) => p.id === selectedProduct) : null;
        const productLabel = prodObj ? prodObj.name : 'All Products';

        rows.push([`${companyName} - TRANSACTION REPORT (ITEMS)`]);
        rows.push([`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`]);
        rows.push([`Filters: Type: ${typeLabel} | Party: ${partyLabel} | Product: ${productLabel} | Date Order: ${dateSortOrder === 'asc' ? 'Oldest First' : 'Newest First'}`]);
        rows.push([]);
        rows.push([
          'Date',
          'Voucher No',
          'Type',
          'Party',
          'Product',
          'Product Code',
          'Qty',
          'Unit',
          `Rate (${currencyCode})`,
          `Amount (${currencyCode})`,
        ]);

        for (const row of sortedProductRows) {
          rows.push([
            formatDate(row.voucher_date),
            row.voucher_no,
            getTypeLabel(row.voucher_type),
            row.party_name || '-',
            row.product_name,
            row.product_code || '-',
            row.quantity,
            row.unit_symbol || '',
            row.rate,
            row.net_amount || row.amount,
          ]);
        }

        rows.push(['TOTAL', '', '', '', '', '', '', '', '', productTotalValue]);

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
          { wch: 14 },
          { wch: 18 },
          { wch: 16 },
          { wch: 24 },
          { wch: 28 },
          { wch: 16 },
          { wch: 12 },
          { wch: 10 },
          { wch: 16 },
          { wch: 18 },
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transaction Items');
        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `TransactionReport_Items_${fromDate}_to_${toDate}_${dateSortOrder}_${timestamp}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast.success(`Exported as ${fileName}`);
      } else {
        const partyColTitle = voucherType === 'payment' ? 'Paid From' : voucherType === 'receipt' ? 'Received In' : 'Party / Account';
        const itemColTitle = voucherType === 'payment' ? 'Paid To (Account)' : voucherType === 'receipt' ? 'Received From (Account)' : 'Item / Account';

        rows.push([`${companyName} - TRANSACTION REPORT (ITEMS)`]);
        rows.push([`Period: ${formatDate(fromDate)} to ${formatDate(toDate)}`]);
        rows.push([`Filters: Type: ${typeLabel} | Party: ${partyLabel} | Date Order: ${dateSortOrder === 'asc' ? 'Oldest First' : 'Newest First'}`]);
        rows.push([]);
        rows.push([
          'Date',
          'Voucher No',
          'Type',
          partyColTitle,
          itemColTitle,
          'Description',
          `Amount (${currencyCode})`,
        ]);

        for (const row of sortedProductRows) {
          rows.push([
            formatDate(row.voucher_date),
            row.voucher_no,
            getTypeLabel(row.voucher_type),
            row.party_name || '-',
            row.product_name,
            row.description || '-',
            row.net_amount || row.amount,
          ]);
        }

        rows.push(['TOTAL', '', '', '', '', '', productTotalValue]);

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
          { wch: 14 },
          { wch: 18 },
          { wch: 16 },
          { wch: 28 },
          { wch: 28 },
          { wch: 28 },
          { wch: 18 },
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transaction Items');
        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `TransactionReport_Items_${fromDate}_to_${toDate}_${dateSortOrder}_${timestamp}.xlsx`;
        XLSX.writeFile(wb, fileName);
        toast.success(`Exported as ${fileName}`);
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export to Excel');
    }
  };

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
  const totalAmount = sortedTransactions.reduce((sum, t) => sum + t.amount, 0);
  const productTotalValue = sortedProductRows.reduce((sum, r) => sum + r.net_amount, 0);

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
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={showItems ? sortedProductRows.length === 0 : sortedTransactions.length === 0}
            >
              <IconDownload size={16} />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={isPrinting || (showItems ? sortedProductRows.length === 0 : sortedTransactions.length === 0)}
            >
              {isPrinting ? (
                <IconRefresh size={16} className="animate-spin" />
              ) : (
                <IconPrinter size={16} />
              )}
              Print PDF
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 space-y-3">
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
              <Select value={voucherType} onValueChange={handleVoucherTypeChange}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sales_invoice">Sales</SelectItem>
                  {coEnabled && <SelectItem value="co_invoice">Custom Order</SelectItem>}
                  <SelectItem value="purchase_invoice">Purchase</SelectItem>
                  <SelectItem value="sales_return">Sales Return</SelectItem>
                  <SelectItem value="purchase_return">Purchase Return</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="receipt">Receipt</SelectItem>
                  <SelectItem value="journal">Journal</SelectItem>
                  <SelectItem value="opening_balance">Opening Balance</SelectItem>
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
            {showItems && isProductType(voucherType) && (
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
            {/* Show Items checkbox - displayed only when individual transaction type is selected */}
            {voucherType !== 'all' && (
              <label className="flex items-center gap-2 cursor-pointer select-none self-end pb-1.5">
                <input
                  type="checkbox"
                  checked={showItems}
                  onChange={(e) => handleShowItemsChange(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary cursor-pointer"
                />
                <span className="text-sm font-medium">Show Items</span>
              </label>
            )}
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
              {showItems ? 'Items View — ' : ''}Period: {formatDate(fromDate)} to {formatDate(toDate)}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : !showItems ? (
            /* ─── VOUCHERS TABLE ─── */
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th
                        className="p-3 text-left text-sm font-semibold cursor-pointer select-none hover:bg-muted/80 transition-colors"
                        onClick={() => setDateSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                        title={`Date order: ${dateSortOrder === 'asc' ? 'Oldest first (click for Newest first)' : 'Newest first (click for Oldest first)'}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Date</span>
                          {dateSortOrder === 'asc' ? (
                            <IconSortAscending size={15} className="text-primary" />
                          ) : (
                            <IconSortDescending size={15} className="text-primary" />
                          )}
                        </div>
                      </th>
                      <th className="p-3 text-left text-sm font-semibold">Voucher No</th>
                      <th className="p-3 text-left text-sm font-semibold">Type</th>
                      <th className="p-3 text-left text-sm font-semibold">Party</th>
                      <th className="p-3 text-left text-sm font-semibold">Narration</th>
                      <th className="p-3 text-right text-sm font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          No transactions found
                        </td>
                      </tr>
                    ) : (
                      sortedTransactions.map((txn) => (
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
                  {sortedTransactions.length > 0 && (
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
            /* ─── ITEMS TABLE ─── */
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th
                        className="p-3 text-left text-sm font-semibold cursor-pointer select-none hover:bg-muted/80 transition-colors"
                        onClick={() => setDateSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                        title={`Date order: ${dateSortOrder === 'asc' ? 'Oldest first (click for Newest first)' : 'Newest first (click for Oldest first)'}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Date</span>
                          {dateSortOrder === 'asc' ? (
                            <IconSortAscending size={15} className="text-primary" />
                          ) : (
                            <IconSortDescending size={15} className="text-primary" />
                          )}
                        </div>
                      </th>
                      <th className="p-3 text-left text-sm font-semibold">Voucher No</th>
                      <th className="p-3 text-left text-sm font-semibold">Type</th>
                      <th className="p-3 text-left text-sm font-semibold">
                        {isProductType(voucherType)
                          ? 'Party'
                          : voucherType === 'payment'
                          ? 'Paid From'
                          : voucherType === 'receipt'
                          ? 'Received In'
                          : 'Party / Account'}
                      </th>
                      <th className="p-3 text-left text-sm font-semibold">
                        {isProductType(voucherType)
                          ? 'Product'
                          : voucherType === 'payment'
                          ? 'Paid To (Account)'
                          : voucherType === 'receipt'
                          ? 'Received From (Account)'
                          : 'Item / Account'}
                      </th>
                      {isProductType(voucherType) ? (
                        <>
                          <th className="p-3 text-right text-sm font-semibold">Qty</th>
                          <th className="p-3 text-right text-sm font-semibold">Rate</th>
                        </>
                      ) : (
                        <th className="p-3 text-left text-sm font-semibold">Description</th>
                      )}
                      <th className="p-3 text-right text-sm font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProductRows.length === 0 ? (
                      <tr>
                        <td colSpan={isProductType(voucherType) ? 8 : 7} className="p-8 text-center text-muted-foreground">
                          {isProductType(voucherType) ? 'No product items found' : 'No voucher items found'}
                        </td>
                      </tr>
                    ) : (
                      sortedProductRows.map((row, idx) => (
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
                          {isProductType(voucherType) ? (
                            <>
                              <td className="p-3 text-right font-mono text-sm">
                                {row.quantity % 1 === 0 ? row.quantity.toFixed(0) : row.quantity.toFixed(2)}
                                {row.unit_symbol && (
                                  <span className="text-xs text-muted-foreground ml-1">{row.unit_symbol}</span>
                                )}
                              </td>
                              <td className="p-3 text-right font-mono text-sm">
                                {money(row.rate)}
                              </td>
                            </>
                          ) : (
                            <td className="p-3 text-sm text-muted-foreground truncate max-w-xs">
                              {row.description || '-'}
                            </td>
                          )}
                          <td className="p-3 text-right font-mono text-sm font-bold">
                            {money(row.net_amount || row.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {sortedProductRows.length > 0 && (
                    <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
                      <tr>
                        <td colSpan={isProductType(voucherType) ? 7 : 6} className="p-3 font-bold text-sm">TOTAL</td>
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
