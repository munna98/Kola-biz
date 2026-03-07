import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { useConfirm } from '@/hooks/useConfirm';
import ConfirmPasswordDialog from '@/components/dialogs/ConfirmPasswordDialog';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

type ResetMode = 'partial' | 'full';

interface QueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rows_affected: number;
  is_select: boolean;
}

const VOUCHER_TYPES = [
  { id: 'sales_invoice', label: 'Sales Invoice' },
  { id: 'sales_return', label: 'Sales Return' },
  { id: 'purchase_invoice', label: 'Purchase Invoice' },
  { id: 'purchase_return', label: 'Purchase Return' },
  { id: 'payment', label: 'Payment' },
  { id: 'receipt', label: 'Receipt' },
  { id: 'journal', label: 'Journal Entry' },
  { id: 'opening_balance', label: 'Opening Balance' },
  { id: 'opening_stock', label: 'Opening Stock' },
];

const MASTER_TABLES = [
  { id: 'products', label: 'Products' },
  { id: 'product_groups', label: 'Product Groups' },
  { id: 'chart_of_accounts', label: 'Chart of Accounts' },
  { id: 'customers', label: 'Customers (legacy)' },
  { id: 'suppliers', label: 'Suppliers (legacy)' },
  { id: 'opening_balances', label: 'Opening Balances' },
  { id: 'employees', label: 'Employees' },
];

export default function DbSettingsPage() {
  const confirm = useConfirm();

  const [mode, setMode] = useState<ResetMode>('partial');
  const [selectedVoucherTypes, setSelectedVoucherTypes] = useState<string[]>([]);
  const [selectedMasterTables, setSelectedMasterTables] = useState<string[]>([]);
  const [resetSequences, setResetSequences] = useState(true);
  const [loading, setLoading] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  // Query Executor state
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryPasswordDialogOpen, setQueryPasswordDialogOpen] = useState(false);
  const [queryVerifyingPassword, setQueryVerifyingPassword] = useState(false);

  // Get current user from Redux store
  const { user } = useSelector((state: RootState) => state.auth);

  const canReset = useMemo(() => {
    if (selectedVoucherTypes.length > 0) {
      return true;
    }

    return mode === 'full' && selectedMasterTables.length > 0;
  }, [mode, selectedMasterTables, selectedVoucherTypes]);

  const toggleVoucher = (id: string, checked: boolean) => {
    setSelectedVoucherTypes((prev) => checked ? [...prev, id] : prev.filter((item) => item !== id));
  };

  const toggleMasterTable = (id: string, checked: boolean) => {
    setSelectedMasterTables((prev) => checked ? [...prev, id] : prev.filter((item) => item !== id));
  };

  const toggleAllVouchers = (checked: boolean) => {
    if (checked) {
      setSelectedVoucherTypes(VOUCHER_TYPES.map(v => v.id));
    } else {
      setSelectedVoucherTypes([]);
    }
  };

  const toggleAllMasterTables = (checked: boolean) => {
    if (checked) {
      setSelectedMasterTables(MASTER_TABLES.map(t => t.id));
    } else {
      setSelectedMasterTables([]);
    }
  };

  const handleResetClick = async () => {
    if (!canReset || loading) {
      return;
    }

    const confirmed = await confirm({
      title: 'Reset database data?',
      description: mode === 'full'
        ? 'This will permanently delete selected voucher data and selected master tables. This action cannot be undone.'
        : 'This will permanently delete selected voucher data. This action cannot be undone.',
      confirmText: 'Yes, reset now',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }

    // Open password confirmation dialog
    setPasswordDialogOpen(true);
  };

  const handlePasswordConfirm = async (password: string) => {
    if (!user?.username) {
      toast.error('User information not found');
      return;
    }

    setVerifyingPassword(true);
    try {
      // 1. Verify password
      const loginResponse: any = await invoke('login', {
        username: user.username,
        password: password,
      });

      if (!loginResponse.success) {
        toast.error('Invalid password');
        setVerifyingPassword(false);
        return; // Stop here if password is wrong
      }

      // 2. If password is correct, proceed with reset
      setPasswordDialogOpen(false); // Close dialog
      performReset();

    } catch (error) {
      console.error('Password verification error:', error);
      toast.error('Failed to verify password');
    } finally {
      setVerifyingPassword(false);
    }
  };


  const performReset = async () => {

    setLoading(true);
    try {
      const result = await invoke<string>('reset_database_data', {
        mode,
        voucherTypes: selectedVoucherTypes,
        masterTables: mode === 'full' ? selectedMasterTables : [],
        resetSequences,
      });

      toast.success(result || 'Database reset completed');
      setSelectedVoucherTypes([]);
      setSelectedMasterTables([]);
    } catch (error) {
      console.error(error);
      toast.error(typeof error === 'string' ? error : 'Failed to reset database data');
    } finally {
      setLoading(false);
    }
  };

  // ── Query Executor handlers ──────────────────────────────────

  const handleExecuteQueryClick = () => {
    if (!sqlQuery.trim() || queryLoading) return;
    setQueryPasswordDialogOpen(true);
  };

  const handleQueryPasswordConfirm = async (password: string) => {
    if (!user?.username) {
      toast.error('User information not found');
      return;
    }

    setQueryVerifyingPassword(true);
    try {
      const loginResponse: any = await invoke('login', {
        username: user.username,
        password: password,
      });

      if (!loginResponse.success) {
        toast.error('Invalid password');
        setQueryVerifyingPassword(false);
        return;
      }

      setQueryPasswordDialogOpen(false);
      executeQuery();
    } catch (error) {
      console.error('Password verification error:', error);
      toast.error('Failed to verify password');
    } finally {
      setQueryVerifyingPassword(false);
    }
  };

  const executeQuery = async () => {
    setQueryLoading(true);
    setQueryResult(null);
    setQueryError(null);

    try {
      const result = await invoke<QueryResult>('execute_raw_query', {
        query: sqlQuery,
      });
      setQueryResult(result);
    } catch (error) {
      console.error('Query execution error:', error);
      setQueryError(typeof error === 'string' ? error : 'Failed to execute query');
    } finally {
      setQueryLoading(false);
    }
  };

  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">DB Settings</h1>
        <p className="text-muted-foreground mt-1">Manage destructive database cleanup actions with selective reset options.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reset Mode</CardTitle>
          <CardDescription>Choose whether to reset only transaction vouchers or both vouchers and selected master tables.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={mode} onValueChange={(value) => setMode(value as ResetMode)} className="space-y-3">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="partial" id="partial" />
              <Label htmlFor="partial">Partial reset (vouchers only)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="full" id="full" />
              <Label htmlFor="full">Full reset (vouchers + selected master tables)</Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle>Voucher Types</CardTitle>
              <CardDescription>Select voucher categories to wipe from transactions.</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="select-all-vouchers"
                checked={selectedVoucherTypes.length === VOUCHER_TYPES.length && VOUCHER_TYPES.length > 0}
                onCheckedChange={(checked) => toggleAllVouchers(checked === true)}
              />
              <Label htmlFor="select-all-vouchers" className="text-sm font-medium">Select All</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {VOUCHER_TYPES.map((voucher) => (
            <div key={voucher.id} className="flex items-center space-x-2">
              <Checkbox
                id={`voucher-${voucher.id}`}
                checked={selectedVoucherTypes.includes(voucher.id)}
                onCheckedChange={(checked) => toggleVoucher(voucher.id, checked === true)}
              />
              <Label htmlFor={`voucher-${voucher.id}`}>{voucher.label}</Label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between">
            <div className="space-y-1.5">
              <CardTitle>Master Tables (full reset only)</CardTitle>
              <CardDescription>Optional: choose extra master data tables to clear during full reset.</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="select-all-masters"
                checked={selectedMasterTables.length === MASTER_TABLES.length && MASTER_TABLES.length > 0}
                onCheckedChange={(checked) => toggleAllMasterTables(checked === true)}
                disabled={mode !== 'full'}
              />
              <Label htmlFor="select-all-masters" className={mode !== 'full' ? 'text-muted-foreground text-sm font-medium' : 'text-sm font-medium'}>Select All</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MASTER_TABLES.map((table) => (
            <div key={table.id} className="flex items-center space-x-2">
              <Checkbox
                id={`table-${table.id}`}
                checked={selectedMasterTables.includes(table.id)}
                onCheckedChange={(checked) => toggleMasterTable(table.id, checked === true)}
                disabled={mode !== 'full'}
              />
              <Label htmlFor={`table-${table.id}`} className={mode !== 'full' ? 'text-muted-foreground' : ''}>{table.label}</Label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sequence Handling</CardTitle>
          <CardDescription>Reset voucher numbering sequence to start from 1 for selected voucher types.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Label htmlFor="reset-sequences">Reset voucher sequences</Label>
          <Switch id="reset-sequences" checked={resetSequences} onCheckedChange={setResetSequences} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="destructive" onClick={handleResetClick} disabled={!canReset || loading}>
          {loading ? 'Resetting…' : 'Run DB Reset'}
        </Button>
      </div>

      {/* ── Query Executor ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Query Executor</CardTitle>
          <CardDescription>Run raw SQL queries against the database. Use with caution — queries are executed directly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            id="sql-query-input"
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            placeholder="SELECT * FROM app_settings LIMIT 10;"
            rows={6}
            className="font-mono text-sm"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleExecuteQueryClick}
              disabled={!sqlQuery.trim() || queryLoading}
            >
              {queryLoading ? 'Executing…' : 'Execute Query'}
            </Button>
          </div>

          {/* Error display */}
          {queryError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4">
              <p className="text-sm font-medium text-destructive">Error</p>
              <p className="text-sm text-destructive/90 mt-1 font-mono whitespace-pre-wrap">{queryError}</p>
            </div>
          )}

          {/* Results display */}
          {queryResult && (
            <div className="space-y-2">
              {queryResult.is_select ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {queryResult.rows.length} row{queryResult.rows.length !== 1 ? 's' : ''} returned
                    {queryResult.columns.length > 0 && ` · ${queryResult.columns.length} column${queryResult.columns.length !== 1 ? 's' : ''}`}
                  </p>
                  {queryResult.columns.length > 0 ? (
                    <div className="rounded-md border overflow-auto max-h-[400px]">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            {queryResult.columns.map((col, i) => (
                              <th key={i} className="text-left px-3 py-2 font-medium border-b whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          {queryResult.rows.map((row, ri) => (
                            <tr key={ri} className="border-b last:border-b-0 hover:bg-muted/30">
                              {row.map((cell, ci) => (
                                <td key={ci} className={`px-3 py-1.5 whitespace-nowrap ${cell === null ? 'text-muted-foreground italic' : ''}`}>
                                  {formatCellValue(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No rows returned.</p>
                  )}
                </>
              ) : (
                <div className="rounded-md border bg-muted/30 p-4">
                  <p className="text-sm">
                    Query executed successfully. <strong>{queryResult.rows_affected}</strong> row{queryResult.rows_affected !== 1 ? 's' : ''} affected.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmPasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        onConfirm={handlePasswordConfirm}
        loading={verifyingPassword}
        title="Admin Authorization Required"
        description="This is a destructive action. Please enter your password to confirm."
      />
      <ConfirmPasswordDialog
        open={queryPasswordDialogOpen}
        onOpenChange={setQueryPasswordDialogOpen}
        onConfirm={handleQueryPasswordConfirm}
        loading={queryVerifyingPassword}
        title="Admin Authorization Required"
        description="You are about to execute a raw SQL query. Please enter your password to confirm."
      />
    </div>
  );
}
