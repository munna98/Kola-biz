import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IconDownload, IconPrinter, IconRefresh, IconUserDown, IconUserUp } from '@tabler/icons-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

interface PartyOutstanding {
  party_id: number;
  party_name: string;
  total_invoices: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  oldest_invoice_date: string | null;
  days_outstanding: number | null;
}

interface InvoiceDetail {
  voucher_no: string;
  voucher_date: string;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  days_outstanding: number;
}

export default function PartyOutstandingPage() {
  const [customers, setCustomers] = useState<PartyOutstanding[]>([]);
  const [suppliers, setSuppliers] = useState<PartyOutstanding[]>([]);
  const [loading, setLoading] = useState(false);
  const [asOnDate, setAsOnDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedParty, setSelectedParty] = useState<{ id: number; name: string; type: 'customer' | 'supplier' } | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const loadReport = async () => {
    try {
      setLoading(true);
      const [customersData, suppliersData] = await Promise.all([
        invoke<PartyOutstanding[]>('get_party_outstanding', {
          partyType: 'customer',
          asOnDate,
        }),
        invoke<PartyOutstanding[]>('get_party_outstanding', {
          partyType: 'supplier',
          asOnDate,
        }),
      ]);
      setCustomers(customersData);
      setSuppliers(suppliersData);
    } catch (error) {
      toast.error('Failed to load outstanding report');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadInvoiceDetails = async (partyId: number, partyType: 'customer' | 'supplier') => {
    try {
      setDetailsLoading(true);
      const details = await invoke<InvoiceDetail[]>('get_party_invoice_details', {
        partyId,
        partyType,
        asOnDate,
      });
      setInvoiceDetails(details);
    } catch (error) {
      toast.error('Failed to load invoice details');
      console.error(error);
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  const handlePartyClick = (party: PartyOutstanding, type: 'customer' | 'supplier') => {
    setSelectedParty({ id: party.party_id, name: party.party_name, type });
    loadInvoiceDetails(party.party_id, type);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    toast.info('Export functionality coming soon');
  };

  const totalReceivables = customers.reduce((sum, c) => sum + c.outstanding_amount, 0);
  const totalPayables = suppliers.reduce((sum, s) => sum + s.outstanding_amount, 0);

  const PartyTable = ({ data, type }: { data: PartyOutstanding[]; type: 'customer' | 'supplier' }) => (
    <table className="w-full">
      <thead className="bg-muted/50 border-b">
        <tr>
          <th className="p-3 text-left text-sm font-semibold">Party Name</th>
          <th className="p-3 text-center text-sm font-semibold">Invoices</th>
          <th className="p-3 text-right text-sm font-semibold">Total Amount</th>
          <th className="p-3 text-right text-sm font-semibold">Paid</th>
          <th className="p-3 text-right text-sm font-semibold">Outstanding</th>
          <th className="p-3 text-center text-sm font-semibold">Days</th>
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={6} className="p-8 text-center text-muted-foreground">
              No outstanding {type === 'customer' ? 'receivables' : 'payables'}
            </td>
          </tr>
        ) : (
          data.map((party) => (
            <tr
              key={party.party_id}
              className="border-b hover:bg-muted/30 cursor-pointer"
              onClick={() => handlePartyClick(party, type)}
            >
              <td className="p-3 text-sm font-medium">{party.party_name}</td>
              <td className="p-3 text-center text-sm">
                <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                  {party.total_invoices}
                </span>
              </td>
              <td className="p-3 text-right font-mono text-sm">
                ₹{party.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="p-3 text-right font-mono text-sm">
                ₹{party.paid_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="p-3 text-right font-mono text-sm font-bold">
                <span className={party.outstanding_amount < 0 ? 'text-blue-600' : ''}>
                  ₹{Math.abs(party.outstanding_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  {party.outstanding_amount < 0 ? (type === 'customer' ? ' Cr' : ' Dr') : ''}
                </span>
              </td>
              <td className="p-3 text-center text-sm">
                {party.days_outstanding ? (
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded border bg-muted/30 text-[10px] font-bold uppercase tracking-wider text-muted-foreground outline-none">
                    <div className={`w-1.5 h-1.5 rounded-full ${party.days_outstanding > 90 ? 'bg-red-500' :
                      party.days_outstanding > 60 ? 'bg-orange-500' :
                        party.days_outstanding > 30 ? 'bg-yellow-500' :
                          'bg-green-500'
                      }`} />
                    {party.days_outstanding}d
                  </span>
                ) : '-'}
              </td>
            </tr>
          ))
        )}
      </tbody>
      <tfoot className="bg-muted/30 border-t-2 border-foreground/20">
        <tr>
          <td colSpan={4} className="p-3 font-bold text-sm">TOTAL</td>
          <td className="p-3 text-right font-mono font-bold text-sm">
            ₹{data.reduce((sum, p) => sum + p.outstanding_amount, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  );

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 px-6 py-4 backdrop-blur-sm print:hidden">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Party Outstanding Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track receivables from customers and payables to suppliers
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
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center">
            <h1 className="text-2xl font-bold">Party Outstanding Report</h1>
            <p className="text-sm text-muted-foreground mt-1">
              As on {formatDate(asOnDate)}
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="border-t-4 border-t-muted">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Receivables</p>
                    <p className="text-sm text-muted-foreground mt-1">(From Customers)</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold font-mono">
                      ₹{totalReceivables.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{customers.length} parties</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-t-4 border-t-muted">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Payables</p>
                    <p className="text-sm text-muted-foreground mt-1">(To Suppliers)</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold font-mono">
                      ₹{totalPayables.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{suppliers.length} parties</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Loading report...</p>
            </div>
          ) : (
            <Tabs defaultValue="customers" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="customers" className="gap-2">
                  <IconUserDown size={16} />
                  Customers ({customers.length})
                </TabsTrigger>
                <TabsTrigger value="suppliers" className="gap-2">
                  <IconUserUp size={16} />
                  Suppliers ({suppliers.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="customers">
                <Card>
                  <CardContent className="p-0">
                    <PartyTable data={customers} type="customer" />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="suppliers">
                <Card>
                  <CardContent className="p-0">
                    <PartyTable data={suppliers} type="supplier" />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}

          {/* Invoice Details Modal/Section */}
          {selectedParty && (
            <Card className="border-primary">
              <CardContent className="p-0">
                <div className="bg-muted/50 border-b p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg">{selectedParty.name}</h3>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mt-0.5">Invoice Details</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedParty(null)}
                  >
                    Close
                  </Button>
                </div>
                <div className="p-4">
                  {detailsLoading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading details...</div>
                  ) : invoiceDetails.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">No invoice details found</div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-muted/30 border-b">
                        <tr>
                          <th className="p-2 text-left text-xs font-semibold">Invoice No</th>
                          <th className="p-2 text-left text-xs font-semibold">Date</th>
                          <th className="p-2 text-right text-xs font-semibold">Amount</th>
                          <th className="p-2 text-right text-xs font-semibold">Paid</th>
                          <th className="p-2 text-right text-xs font-semibold">Outstanding</th>
                          <th className="p-2 text-center text-xs font-semibold">Age</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceDetails.map((inv, idx) => (
                          <tr key={idx} className="border-b hover:bg-muted/20">
                            <td className="p-2 text-xs font-mono">{inv.voucher_no}</td>
                            <td className="p-2 text-xs">{formatDate(inv.voucher_date)}</td>
                            <td className="p-2 text-right text-xs font-mono">
                              ₹{inv.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-2 text-right text-xs font-mono">
                              ₹{inv.paid_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-2 text-right text-xs font-mono font-bold">
                              ₹{inv.outstanding_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-2 text-center text-xs font-bold text-muted-foreground">{inv.days_outstanding}d</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}