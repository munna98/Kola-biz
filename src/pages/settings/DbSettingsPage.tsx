import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  FolderOpen,
  HardDrive,
  RefreshCw,
  Download,
  Database,
  Save,
  Clock,
  ShieldCheck,
  AlertCircle,
  Folder,
  Play,
  RotateCcw,
  CheckCircle2,
  FileCheck,
} from 'lucide-react';

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

interface BackupConfig {
  enabled: boolean;
  custom_path: string | null;
  interval_hours: number;
  retention_days: number;
  backup_on_exit: boolean;
  effective_path: string;
  is_using_fallback: boolean;
}

interface BackupFileInfo {
  name: string;
  path: string;
  size_bytes: number;
  size_formatted: string;
  created_at: string;
}

interface BackupResult {
  success: boolean;
  message: string;
  path: string | null;
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
  { id: 'stock_journal', label: 'Stock Journal' },
];

const MASTER_TABLES = [
  { id: 'products', label: 'Products' },
  { id: 'product_groups', label: 'Product Groups' },
  { id: 'chart_of_accounts', label: 'Ledgers' },
  { id: 'customers', label: 'Customers (legacy)' },
  { id: 'suppliers', label: 'Suppliers (legacy)' },
  { id: 'opening_balances', label: 'Opening Balances' },
  { id: 'employees', label: 'Employees' },
];

export default function DbSettingsPage() {
  const confirm = useConfirm();

  // Reset DB State
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

  // Backup State
  const [backupConfig, setBackupConfig] = useState<BackupConfig | null>(null);
  const [recentBackups, setRecentBackups] = useState<BackupFileInfo[]>([]);
  const [activeCompany, setActiveCompany] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Manual Backup options
  const [manualTarget, setManualTarget] = useState<'active' | 'full'>('active');
  const [manualCustomPath, setManualCustomPath] = useState('');
  const [showAllBackups, setShowAllBackups] = useState(false);
  const [filterActiveCompanyOnly, setFilterActiveCompanyOnly] = useState(true);

  // Auto Backup form state
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [autoCustomPath, setAutoCustomPath] = useState('');
  const [autoIntervalHours, setAutoIntervalHours] = useState(6);
  const [autoRetentionDays, setAutoRetentionDays] = useState(14);
  const [autoBackupOnExit, setAutoBackupOnExit] = useState(true);

  // Get current user from Redux store
  const { user } = useSelector((state: RootState) => state.auth);

  const loadBackupConfig = async () => {
    setLoadingConfig(true);
    try {
      const config = await invoke<BackupConfig>('get_backup_config');
      setBackupConfig(config);
      setAutoEnabled(config.enabled);
      setAutoCustomPath(config.custom_path || '');
      setAutoIntervalHours(config.interval_hours);
      setAutoRetentionDays(config.retention_days);
      setAutoBackupOnExit(config.backup_on_exit);

      const company = await invoke<{ id: string; name: string; slug: string } | null>('get_active_company').catch(() => null);
      setActiveCompany(company);
    } catch (err) {
      console.error('Failed to load backup config:', err);
      toast.error('Failed to load backup settings');
    } finally {
      setLoadingConfig(false);
    }
  };

  const loadRecentBackups = async () => {
    setLoadingBackups(true);
    try {
      const files = await invoke<BackupFileInfo[]>('list_recent_backups');
      setRecentBackups(files);
    } catch (err) {
      console.error('Failed to list backups:', err);
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    loadBackupConfig();
    loadRecentBackups();
  }, []);

  const handlePickAutoFolder = async () => {
    try {
      const path = await invoke<string | null>('pick_backup_folder');
      if (path) {
        setAutoCustomPath(path);
      }
    } catch (err) {
      toast.error('Failed to select folder');
    }
  };

  const handlePickManualFolder = async () => {
    try {
      const path = await invoke<string | null>('pick_backup_folder');
      if (path) {
        setManualCustomPath(path);
      }
    } catch (err) {
      toast.error('Failed to select folder');
    }
  };

  const handleSaveBackupConfig = async () => {
    setSavingConfig(true);
    try {
      await invoke('save_backup_config', {
        enabled: autoEnabled,
        customPath: autoCustomPath.trim() || null,
        intervalHours: Number(autoIntervalHours),
        retentionDays: Number(autoRetentionDays),
        backupOnExit: autoBackupOnExit,
      });
      toast.success('Automated backup settings saved');
      await loadBackupConfig();
      await loadRecentBackups();
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to save settings');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTakeManualBackup = async () => {
    setBackingUp(true);
    try {
      let res: BackupResult;
      if (manualTarget === 'full') {
        res = await invoke<BackupResult>('create_full_manual_backup', {
          destDir: manualCustomPath.trim() || null,
        });
      } else {
        res = await invoke<BackupResult>('create_manual_backup', {
          companyId: null,
          destPath: manualCustomPath.trim() || null,
        });
      }

      if (res.success) {
        toast.success(res.message);
        loadRecentBackups();
      }
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestoreActiveBackup = async () => {
    try {
      const file = await invoke<string | null>('pick_database_file');
      if (!file) return;

      const confirmed = await confirm({
        title: 'Restore Active Company Database?',
        description: `This will overwrite active company "${activeCompany?.name || ''}" database with the selected backup snapshot file. This action cannot be undone.`,
        confirmText: 'Yes, Restore Backup',
        cancelText: 'Cancel',
        variant: 'destructive',
      });

      if (!confirmed) return;

      setRestoring(true);
      await invoke('restore_active_company_from_backup', { backupFilePath: file });
      toast.success('Database restored successfully! Reloading application...');
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err) {
      toast.error(typeof err === 'string' ? err : 'Failed to restore database');
    } finally {
      setRestoring(false);
    }
  };

  const handleOpenFolder = async (path?: string) => {
    try {
      await invoke('open_backup_folder', { path: path || null });
    } catch (err) {
      toast.error('Failed to open backup folder');
    }
  };

  const filteredBackups = useMemo(() => {
    if (!filterActiveCompanyOnly || !activeCompany?.slug) {
      return recentBackups;
    }
    return recentBackups.filter(
      (f) => f.name.startsWith(activeCompany.slug + '_') || f.name.startsWith(activeCompany.slug)
    );
  }, [recentBackups, activeCompany, filterActiveCompanyOnly]);

  const canReset = useMemo(() => {
    if (selectedVoucherTypes.length > 0) {
      return true;
    }
    return mode === 'full' && selectedMasterTables.length > 0;
  }, [mode, selectedMasterTables, selectedVoucherTypes]);

  const toggleVoucher = (id: string, checked: boolean) => {
    setSelectedVoucherTypes((prev) => (checked ? [...prev, id] : prev.filter((item) => item !== id)));
  };

  const toggleMasterTable = (id: string, checked: boolean) => {
    setSelectedMasterTables((prev) => (checked ? [...prev, id] : prev.filter((item) => item !== id)));
  };

  const toggleAllVouchers = (checked: boolean) => {
    if (checked) {
      setSelectedVoucherTypes(VOUCHER_TYPES.map((v) => v.id));
    } else {
      setSelectedVoucherTypes([]);
    }
  };

  const toggleAllMasterTables = (checked: boolean) => {
    if (checked) {
      setSelectedMasterTables(MASTER_TABLES.map((t) => t.id));
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
      description:
        mode === 'full'
          ? 'This will permanently delete selected voucher data and selected master tables. This action cannot be undone.'
          : 'This will permanently delete selected voucher data. This action cannot be undone.',
      confirmText: 'Yes, reset now',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) {
      return;
    }

    setPasswordDialogOpen(true);
  };

  const handlePasswordConfirm = async (password: string) => {
    if (!user?.username) {
      toast.error('User information not found');
      return;
    }

    setVerifyingPassword(true);
    try {
      const loginResponse: any = await invoke('login', {
        username: user.username,
        password: password,
      });

      if (!loginResponse.success) {
        toast.error('Invalid password');
        setVerifyingPassword(false);
        return;
      }

      setPasswordDialogOpen(false);
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
    <div className="h-full flex flex-col bg-background">
      <div className="flex justify-between items-center p-6 border-b shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Database className="w-6 h-6 text-primary" />
            Database Settings & Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure automated backups, perform manual snapshots, manage backup locations, or execute database reset tasks.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <Tabs defaultValue="backups" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="backups" className="flex items-center gap-2">
                <HardDrive className="w-4 h-4" />
                Database Backups
              </TabsTrigger>
              <TabsTrigger value="reset" className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                Data Reset & Cleanup
              </TabsTrigger>
              <TabsTrigger value="query" className="flex items-center gap-2">
                <Play className="w-4 h-4" />
                SQL Query Console
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: DATABASE BACKUPS */}
            <TabsContent value="backups" className="space-y-6">
              {/* Card 1: Take Manual Backup */}
              <Card className="border-primary/20 shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Download className="w-5 h-5 text-primary" />
                        Take Manual Backup
                      </CardTitle>
                      <CardDescription>
                        Create an instant, safely-isolated snapshot of your databases right now.
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleOpenFolder()}>
                      <FolderOpen className="w-4 h-4 mr-2" />
                      Open Backup Directory
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Backup Scope</Label>
                    <RadioGroup
                      value={manualTarget}
                      onValueChange={(val) => setManualTarget(val as 'active' | 'full')}
                      className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2"
                    >
                      <div
                        className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          manualTarget === 'active' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setManualTarget('active')}
                      >
                        <RadioGroupItem value="active" id="target-active" />
                        <div>
                          <Label htmlFor="target-active" className="cursor-pointer font-medium">
                            Active Company Only
                          </Label>
                          <p className="text-xs text-muted-foreground">Creates a snapshot of currently opened company DB.</p>
                        </div>
                      </div>
                      <div
                        className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          manualTarget === 'full' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setManualTarget('full')}
                      >
                        <RadioGroupItem value="full" id="target-full" />
                        <div>
                          <Label htmlFor="target-full" className="cursor-pointer font-medium">
                            Full System Backup
                          </Label>
                          <p className="text-xs text-muted-foreground">Creates snapshots for Master DB + All Active Companies.</p>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>

                  <div>
                    <Label htmlFor="manual-folder" className="text-sm font-medium">
                      Destination Folder (Optional)
                    </Label>
                    <div className="flex gap-2 mt-1.5">
                      <Input
                        id="manual-folder"
                        value={manualCustomPath}
                        onChange={(e) => setManualCustomPath(e.target.value)}
                        placeholder={backupConfig?.effective_path || 'Default Backup Folder'}
                        className="font-mono text-xs flex-1"
                      />
                      <Button variant="outline" onClick={handlePickManualFolder} type="button">
                        <Folder className="w-4 h-4 mr-2" />
                        Browse...
                      </Button>
                      {manualCustomPath && (
                        <Button variant="ghost" onClick={() => setManualCustomPath('')} type="button" size="sm">
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 flex-wrap">
                    <Button
                      variant="outline"
                      onClick={handleRestoreActiveBackup}
                      disabled={backingUp || restoring}
                      className="w-full sm:w-auto"
                    >
                      {restoring ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Restoring Database...
                        </>
                      ) : (
                        <>
                          <FolderOpen className="w-4 h-4 mr-2 text-amber-500" />
                          Restore Backup File
                        </>
                      )}
                    </Button>

                    <Button onClick={handleTakeManualBackup} disabled={backingUp || restoring} className="w-full sm:w-auto">
                      {backingUp ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Creating Backup Snapshot...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Take Backup Now
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Card 2: Automated Backup Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    Automated Backup Setup
                    {loadingConfig && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground ml-2" />}
                  </CardTitle>
                  <CardDescription>
                    Configure background automated backups and specify your preferred storage path.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/20">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto-enabled" className="text-base font-semibold cursor-pointer">
                        Enable Automated Backups
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically runs background snapshots of all databases on set interval.
                      </p>
                    </div>
                    <Switch id="auto-enabled" checked={autoEnabled} onCheckedChange={setAutoEnabled} />
                  </div>

                  {/* Backup Folder Path */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="auto-path" className="text-sm font-medium">
                        Custom Auto-Backup Folder Location
                      </Label>
                      {backupConfig?.is_using_fallback ? (
                        <Badge variant="destructive" className="flex items-center gap-1 text-[11px]">
                          <AlertCircle className="w-3 h-3" />
                          Custom Path Inaccessible — Falling Back to Standard Path
                        </Badge>
                      ) : autoCustomPath ? (
                        <Badge variant="secondary" className="flex items-center gap-1 text-[11px] bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          Custom Path Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px]">
                          Standard App Path Active
                        </Badge>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Input
                        id="auto-path"
                        value={autoCustomPath}
                        onChange={(e) => setAutoCustomPath(e.target.value)}
                        placeholder="Leave empty for default AppData path"
                        className="font-mono text-xs flex-1"
                      />
                      <Button variant="outline" onClick={handlePickAutoFolder} type="button">
                        <Folder className="w-4 h-4 mr-2" />
                        Browse...
                      </Button>
                      {autoCustomPath && (
                        <Button variant="ghost" onClick={() => setAutoCustomPath('')} type="button" size="sm">
                          Reset to Default
                        </Button>
                      )}
                    </div>

                    <div className="p-3 rounded border bg-muted/30 text-xs space-y-1">
                      <p className="font-medium text-foreground">Active Backup Path:</p>
                      <p className="font-mono text-muted-foreground break-all">
                        {backupConfig?.effective_path || 'Resolving path...'}
                      </p>
                    </div>
                  </div>

                  {/* Interval & Retention Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="auto-interval" className="text-sm font-medium flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        Backup Frequency
                      </Label>
                      <Select
                        value={String(autoIntervalHours)}
                        onValueChange={(val) => setAutoIntervalHours(Number(val))}
                      >
                        <SelectTrigger id="auto-interval">
                          <SelectValue placeholder="Select Frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Every 1 Hour</SelectItem>
                          <SelectItem value="6">Every 6 Hours (Recommended)</SelectItem>
                          <SelectItem value="12">Every 12 Hours</SelectItem>
                          <SelectItem value="24">Every 24 Hours (Daily)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="auto-retention" className="text-sm font-medium flex items-center gap-1.5">
                        <RotateCcw className="w-4 h-4 text-muted-foreground" />
                        Retention Period (Days to Keep)
                      </Label>
                      <Select
                        value={String(autoRetentionDays)}
                        onValueChange={(val) => setAutoRetentionDays(Number(val))}
                      >
                        <SelectTrigger id="auto-retention">
                          <SelectValue placeholder="Select Retention" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">7 Days</SelectItem>
                          <SelectItem value="14">14 Days (Default)</SelectItem>
                          <SelectItem value="30">30 Days</SelectItem>
                          <SelectItem value="60">60 Days</SelectItem>
                          <SelectItem value="90">90 Days</SelectItem>
                          <SelectItem value="0">Keep Forever (No Auto-Deletion)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Backup on Exit */}
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto-exit" className="text-sm font-medium cursor-pointer">
                        Backup on Application Exit
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically trigger a backup snapshot right before KolaBiz shuts down.
                      </p>
                    </div>
                    <Switch id="auto-exit" checked={autoBackupOnExit} onCheckedChange={setAutoBackupOnExit} />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button onClick={handleSaveBackupConfig} disabled={savingConfig}>
                      {savingConfig ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save Backup Settings
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Card 3: Last Recent Backup File */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileCheck className="w-5 h-5 text-primary" />
                          Last Recent Backup File
                        </CardTitle>
                        {activeCompany && (
                          <Badge variant="outline" className="text-xs font-normal">
                            Active Company: {activeCompany.name}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1">
                        The most recent database snapshot saved for your active company.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFilterActiveCompanyOnly(!filterActiveCompanyOnly)}
                        className="text-xs text-muted-foreground"
                      >
                        {filterActiveCompanyOnly ? 'Show All Company Backups' : 'Active Company Only'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={loadRecentBackups} disabled={loadingBackups}>
                        <RefreshCw className={`w-4 h-4 mr-1 ${loadingBackups ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredBackups.length > 0 ? (
                    <div className="space-y-3">
                      <div className="rounded-md border overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium border-b">File Name</th>
                              <th className="text-left px-3 py-2 font-medium border-b">Size</th>
                              <th className="text-left px-3 py-2 font-medium border-b">Date Modified</th>
                              <th className="text-right px-3 py-2 font-medium border-b">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(showAllBackups ? filteredBackups : filteredBackups.slice(0, 1)).map((file, idx) => (
                              <tr key={idx} className="border-b last:border-b-0 hover:bg-muted/30">
                                <td className="px-3 py-2 font-mono text-xs font-medium text-foreground">
                                  {file.name}
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                                  {file.size_formatted}
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                                  {file.created_at}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenFolder(file.path)}
                                    title="Open file location in Explorer"
                                  >
                                    <FolderOpen className="w-3.5 h-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {filteredBackups.length > 1 && (
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowAllBackups(!showAllBackups)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            {showAllBackups
                              ? 'Show Only Last Backup'
                              : `View Older Backups (${filteredBackups.length - 1} more)`}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 border rounded-md bg-muted/10">
                      <Database className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                      <p className="text-sm font-medium text-muted-foreground">
                        {filterActiveCompanyOnly && activeCompany
                          ? `No backup files found yet for ${activeCompany.name}`
                          : 'No backup files found yet'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Click "Take Backup Now" above to create your first manual backup snapshot.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: DATA RESET & CLEANUP */}
            <TabsContent value="reset" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Reset Mode</CardTitle>
                  <CardDescription>
                    Choose whether to reset only transaction vouchers or both vouchers and selected master tables.
                  </CardDescription>
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
                      <Label htmlFor="select-all-vouchers" className="text-sm font-medium">
                        Select All
                      </Label>
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
                      <Label
                        htmlFor="select-all-masters"
                        className={mode !== 'full' ? 'text-muted-foreground text-sm font-medium' : 'text-sm font-medium'}
                      >
                        Select All
                      </Label>
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
                      <Label htmlFor={`table-${table.id}`} className={mode !== 'full' ? 'text-muted-foreground' : ''}>
                        {table.label}
                      </Label>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sequence Handling</CardTitle>
                  <CardDescription>
                    Reset voucher numbering sequence to start from 1 for selected voucher types.
                  </CardDescription>
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
            </TabsContent>

            {/* TAB 3: SQL QUERY CONSOLE */}
            <TabsContent value="query" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Query Executor</CardTitle>
                  <CardDescription>
                    Run raw SQL queries directly against the database. Use with caution.
                  </CardDescription>
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
                    <Button onClick={handleExecuteQueryClick} disabled={!sqlQuery.trim() || queryLoading}>
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
                            {queryResult.columns.length > 0 &&
                              ` · ${queryResult.columns.length} column${queryResult.columns.length !== 1 ? 's' : ''}`}
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
                                        <td
                                          key={ci}
                                          className={`px-3 py-1.5 whitespace-nowrap ${
                                            cell === null ? 'text-muted-foreground italic' : ''
                                          }`}
                                        >
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
                            Query executed successfully. <strong>{queryResult.rows_affected}</strong> row
                            {queryResult.rows_affected !== 1 ? 's' : ''} affected.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

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
      </div>
    </div>
  );
}

