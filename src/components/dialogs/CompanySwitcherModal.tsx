import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import {
    IconBuilding,
    IconTrash,
    IconCheck,
    IconFolder,
    IconAlertTriangle,
    IconRefresh,
    IconPencil,
    IconX,
    IconArrowsTransferUp,
} from '@tabler/icons-react';

interface Company {
    id: string;
    name: string;
    db_path: string;
    is_active: boolean;
    is_primary: boolean;
    is_secondary: boolean;
    created_at: string;
}

interface CompanySwitcherModalProps {
    open: boolean;
    onClose: () => void;
    onSwitched?: () => void;
}

type DeleteLevel = 'soft' | 'hard';

export function CompanySwitcherModal({ open, onClose, onSwitched }: CompanySwitcherModalProps) {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(false);
    const [switching, setSwitching] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<{ company: Company; level: DeleteLevel } | null>(null);
    const [deleteConfirmName, setDeleteConfirmName] = useState('');

    const [renameTarget, setRenameTarget] = useState<string | null>(null);
    const [renameName, setRenameName] = useState('');

    const loadCompanies = useCallback(async () => {
        setLoading(true);
        try {
            const list = await invoke<Company[]>('list_companies');
            setCompanies(list);
        } catch (e: any) {
            toast.error(`Failed to load companies: ${e}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) loadCompanies();
    }, [open, loadCompanies]);

    const handleSwitch = async (company: Company) => {
        if (company.is_active || renameTarget) return;
        setSwitching(company.id);
        try {
            await invoke('switch_company', { companyId: company.id });
            toast.success(`Switched to "${company.name}". Please re-login.`);
            onSwitched?.();
            onClose();
        } catch (e: any) {
            toast.error(`Switch failed: ${e}`);
        } finally {
            setSwitching(null);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const result: any = await invoke('sync_secondary_to_primary');
            toast.success(
                `Sync complete — ` +
                `${result.units} units, ` +
                `${result.groups} groups, ` +
                `${result.customers} customers, ` +
                `${result.suppliers} suppliers, ` +
                `${result.employees} employees, ` +
                `${result.ledgers} ledgers, ` +
                `${result.products} products copied to primary.`
            );
        } catch (e: any) {
            toast.error(`Sync failed: ${e}`);
        } finally {
            setSyncing(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            const cmd = deleteTarget.level === 'hard' ? 'hard_delete_company' : 'soft_delete_company';
            await invoke(cmd, { companyId: deleteTarget.company.id });
            toast.success(`"${deleteTarget.company.name}" ${deleteTarget.level === 'hard' ? 'permanently deleted' : 'removed from list'}`);
            setDeleteTarget(null);
            setDeleteConfirmName('');
            loadCompanies();
        } catch (e: any) {
            toast.error(`Delete failed: ${e}`);
        }
    };

    const handleRename = async (id: string) => {
        if (!renameName.trim()) return;
        try {
            await invoke('rename_company', { companyId: id, name: renameName.trim() });
            toast.success('Company renamed');
            setRenameTarget(null);
            loadCompanies();
        } catch (e: any) {
            toast.error(`Rename failed: ${e}`);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
                <DialogContent className="max-w-lg" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <IconBuilding size={22} className="text-primary" />
                            Company Manager
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-2 mt-1">
                        {loading ? (
                            <div className="flex justify-center py-8 text-muted-foreground text-sm gap-2">
                                <IconRefresh size={18} className="animate-spin" /> Loading companies...
                            </div>
                        ) : companies.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No companies found
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                {companies.map((company) => (
                                    <div
                                        key={company.id}
                                        className={`rounded-lg border transition-all
                                            ${company.is_active
                                                ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                                                : 'border-border'
                                            }
                                            ${switching === company.id ? 'opacity-60' : ''}
                                        `}
                                    >
                                        {/* Main row */}
                                        <div
                                            className={`flex items-center gap-3 p-3 ${!company.is_active && renameTarget !== company.id ? 'cursor-pointer hover:bg-accent/40 rounded-lg' : ''}`}
                                            onClick={() => !company.is_active && renameTarget !== company.id && handleSwitch(company)}
                                        >
                                            <div className={`p-1.5 rounded-md shrink-0 ${company.is_active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                                <IconBuilding size={16} />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-medium text-sm truncate">{company.name}</span>
                                                    {company.is_active && (
                                                        <Badge variant="default" className="text-[10px] py-0 px-1.5 h-4">
                                                            <IconCheck size={10} className="mr-0.5" /> Active
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                                                    <IconFolder size={11} />
                                                    <span className="truncate max-w-[260px]">{company.db_path}</span>
                                                </div>
                                            </div>

                                            {/* Action buttons */}
                                            <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                {/* Sync button — secondary only */}
                                                {company.is_secondary && (
                                                    <button
                                                        className={`p-1.5 rounded transition-colors ${
                                                            syncing
                                                                ? 'text-primary opacity-60 cursor-not-allowed'
                                                                : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                                                        }`}
                                                        title="Sync to primary"
                                                        disabled={syncing}
                                                        onClick={handleSync}
                                                    >
                                                        <IconArrowsTransferUp size={14} className={syncing ? 'animate-pulse' : ''} />
                                                    </button>
                                                )}
                                                <button
                                                    className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                                    title="Rename"
                                                    onClick={() => { setRenameTarget(company.id); setRenameName(company.name); }}
                                                >
                                                    <IconPencil size={14} />
                                                </button>
                                                {!company.is_active && (
                                                    <>
                                                        <button
                                                            className="p-1.5 rounded hover:bg-amber-100 text-muted-foreground hover:text-amber-600 dark:hover:bg-amber-900/30 transition-colors"
                                                            title="Remove from list"
                                                            onClick={() => setDeleteTarget({ company, level: 'soft' })}
                                                        >
                                                            <IconX size={14} />
                                                        </button>
                                                        <button
                                                            className="p-1.5 rounded hover:bg-red-100 text-muted-foreground hover:text-destructive dark:hover:bg-red-900/30 transition-colors"
                                                            title="Delete permanently"
                                                            onClick={() => setDeleteTarget({ company, level: 'hard' })}
                                                        >
                                                            <IconTrash size={14} />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Inline rename form */}
                                        {renameTarget === company.id && (
                                            <div className="px-3 pb-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                                                <Input
                                                    className="h-8 text-sm flex-1"
                                                    value={renameName}
                                                    onChange={(e) => setRenameName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRename(company.id);
                                                        if (e.key === 'Escape') setRenameTarget(null);
                                                    }}
                                                    autoFocus
                                                />
                                                <Button size="sm" className="h-8 px-3" onClick={() => handleRename(company.id)}>Save</Button>
                                                <Button size="sm" variant="ghost" className="h-8 px-3" onClick={() => setRenameTarget(null)}>Cancel</Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteTarget} onOpenChange={(v) => {
                if (!v) { setDeleteTarget(null); setDeleteConfirmName(''); }
            }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <IconAlertTriangle className={deleteTarget?.level === 'hard' ? 'text-destructive' : 'text-amber-500'} size={20} />
                            {deleteTarget?.level === 'hard' ? 'Permanently Delete Company?' : 'Remove Company from List?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget?.level === 'hard'
                                ? `This will permanently delete "${deleteTarget?.company.name}" and its database file. This action CANNOT be undone.`
                                : `"${deleteTarget?.company.name}" will be removed from the list. The database file stays on disk and can be re-added later.`
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteTarget?.level === 'hard' && (
                        <div className="my-2">
                            <Label className="text-xs mb-2 block">
                                Please type <strong className="text-foreground">{deleteTarget.company.name}</strong> to confirm.
                            </Label>
                            <Input
                                value={deleteConfirmName}
                                onChange={(e) => setDeleteConfirmName(e.target.value)}
                                placeholder="Type company name here"
                                autoFocus
                            />
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className={deleteTarget?.level === 'hard' ? 'bg-destructive hover:bg-destructive/90' : ''}
                            onClick={handleDelete}
                            disabled={deleteTarget?.level === 'hard' && deleteConfirmName !== deleteTarget?.company.name}
                        >
                            {deleteTarget?.level === 'hard' ? 'Delete Forever' : 'Remove from List'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
