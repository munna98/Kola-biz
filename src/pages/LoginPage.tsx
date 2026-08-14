import { useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loginSuccess, loginFailure } from '@/store';
import { toast } from 'sonner';
import {
    IconLock,
    IconUser,
    IconBuilding,
    IconCheck,
    IconPlus,
    IconRefresh,
    IconStar,
    IconStarFilled,
    IconBookmark,
    IconBookmarkFilled,
    IconUpload,
    IconAlertCircle,
    IconAlertTriangle,
} from '@tabler/icons-react';

interface Company {
    id: string;
    name: string;
    db_path: string;
    is_active: boolean;
    is_primary: boolean;
    is_secondary: boolean;
}

export default function LoginPage() {
    const dispatch = useDispatch();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const passwordRef = useRef<HTMLInputElement>(null);

    // Caps lock & Login Error State
    const [loginError, setLoginError] = useState<string | null>(null);
    const [capsLockOn, setCapsLockOn] = useState(false);

    // Company state
    const [companies, setCompanies] = useState<Company[]>([]);
    const [companiesLoading, setCompaniesLoading] = useState(true);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
    const [showCompanyPicker, setShowCompanyPicker] = useState(false);
    const [, setSwitching] = useState(false);

    // New company mini-form
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);

    // Plain refresh — just updates the list, no auto-switching
    const refreshCompanies = async () => {
        try {
            const list = await invoke<Company[]>('list_companies');
            setCompanies(list);
        } catch {
            // ignore
        }
    };

    // Initial load — auto-selects primary → secondary → first
    // but skips switching if a company is already active in the registry
    const loadCompanies = async () => {
        setCompaniesLoading(true);
        try {
            // Check what the registry already has active
            const alreadyActive = await invoke<any>('get_active_company').catch(() => null);
            const list = await invoke<Company[]>('list_companies');
            setCompanies(list);

            if (alreadyActive?.id) {
                // Registry already has an active company (e.g. after a modal switch)
                setSelectedCompanyId(alreadyActive.id);
            } else {
                // Nothing active yet — auto-select: primary → secondary → first
                const preferred =
                    list.find((c) => c.is_primary) ||
                    list.find((c) => c.is_secondary) ||
                    list[0];
                if (preferred) {
                    setSwitching(true);
                    try {
                        await invoke('switch_company', { companyId: preferred.id });
                        const updated = await invoke<Company[]>('list_companies');
                        setCompanies(updated);
                        setSelectedCompanyId(preferred.id);
                    } catch {
                        setSelectedCompanyId(preferred.id);
                    } finally {
                        setSwitching(false);
                    }
                }
            }
        } catch {
            // no companies yet
        } finally {
            setCompaniesLoading(false);
        }
    };

    useEffect(() => { loadCompanies(); }, []);

    const activeCompany = companies.find((c) => c.id === selectedCompanyId);

    const handleSelectCompany = async (company: Company) => {
        setSwitching(true);
        try {
            await invoke('switch_company', { companyId: company.id });
            setSelectedCompanyId(company.id);
            await refreshCompanies();
        } catch (e: any) {
            toast.error(`Failed to switch: ${e}`);
        } finally {
            setSwitching(false);
            setShowCompanyPicker(false);
        }
    };

    const handleSetPrimary = async (e: React.MouseEvent, company: Company) => {
        e.stopPropagation();
        try {
            await invoke('set_primary_company', { companyId: company.id });
            await loadCompanies();
        } catch (e: any) {
            toast.error(`${e}`);
        }
    };

    const handleSetSecondary = async (e: React.MouseEvent, company: Company) => {
        e.stopPropagation();
        try {
            await invoke('set_secondary_company', { companyId: company.id });
            await loadCompanies();
        } catch (e: any) {
            toast.error(`${e}`);
        }
    };

    const [importing, setImporting] = useState(false);

    const handleCreateCompany = async () => {
        if (!newName.trim()) { toast.error('Name required'); return; }
        setCreating(true);
        try {
            await invoke('create_company', { input: { name: newName.trim(), customPath: null } });
            toast.success(`"${newName}" created!`);
            setNewName('');
            setShowCreate(false);
            await refreshCompanies();
        } catch (e: any) {
            toast.error(`${e}`);
        } finally {
            setCreating(false);
        }
    };

    const handlePickImportFile = async () => {
        try {
            const file = await invoke<string | null>('pick_database_file');
            if (file) {
                const filename = file.split('\\').pop()?.split('/').pop()?.replace(/\.db$/i, '') || '';
                const companyName = filename.replace(/_\d{8}_\d{6}$/, '').replace(/_/g, ' ');
                setImporting(true);
                try {
                    const newCompanyId = await invoke<string>('import_company_database', {
                        sourceDbPath: file,
                        customName: companyName || null,
                    });
                    toast.success('Backup database imported successfully!');
                    await loadCompanies();
                    if (newCompanyId) {
                        await invoke('switch_company', { companyId: newCompanyId });
                        setSelectedCompanyId(newCompanyId);
                        await refreshCompanies();
                    }
                } catch (err: any) {
                    toast.error(`Import failed: ${err}`);
                } finally {
                    setImporting(false);
                }
            }
        } catch (e: any) {
            toast.error(`Failed to pick file: ${e}`);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); passwordRef.current?.focus(); }
    };

    const checkCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
        setCapsLockOn(e.getModifierState('CapsLock'));
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError(null);
        if (!username.trim() || !password.trim()) {
            const msg = 'Please enter both username and password';
            setLoginError(msg);
            toast.error(msg);
            return;
        }
        setIsLoading(true);
        try {
            const response: any = await invoke('login', {
                username: username.trim(),
                password,
            });
            if (response.success && response.token && response.user) {
                dispatch(loginSuccess({ user: response.user, token: response.token }));
                toast.success('Login successful!');
            } else {
                const msg = response.message || 'Invalid username or password';
                setLoginError(msg);
                dispatch(loginFailure(msg));
                toast.error(msg);
            }
        } catch (error: any) {
            const msg = error?.message || 'Invalid username or password';
            setLoginError(msg);
            dispatch(loginFailure(msg));
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20 p-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="space-y-2 text-center">
                    <CardTitle className="text-3xl font-bold">Kol<span onDoubleClick={() => setShowCompanyPicker(!showCompanyPicker)} className="select-none">a</span>Biz</CardTitle>
                    <CardDescription className="text-base">
                        {activeCompany
                            ? <span className="font-medium text-foreground/70">{activeCompany.name}</span>
                            : 'Sign in to your account to continue'
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Hidden Company List — revealed by double-clicking 'a' in "KolaBiz" */}
                    {showCompanyPicker && (
                        <div className="mb-5">
                            {companiesLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                    <IconRefresh size={14} className="animate-spin" /> Loading companies...
                                </div>
                            ) : (
                                <div className="border rounded-lg bg-popover shadow-md overflow-hidden">
                                    <div className="max-h-56 overflow-y-auto py-1">
                                        {companies.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-3">
                                                No companies found
                                            </p>
                                        ) : (
                                            companies.map((c) => (
                                                <div
                                                    key={c.id}
                                                    className="flex items-center gap-1 px-2 py-1.5 hover:bg-accent transition-colors"
                                                >
                                                    {/* Company name — click to select/switch */}
                                                    <button
                                                        type="button"
                                                        className="flex items-center gap-2 flex-1 min-w-0 text-sm text-left"
                                                        onClick={() => handleSelectCompany(c)}
                                                    >
                                                        <IconBuilding size={13} className="shrink-0 text-muted-foreground" />
                                                        <span className="truncate">{c.name}</span>
                                                        {c.is_active && <IconCheck size={13} className="text-primary shrink-0" />}
                                                    </button>

                                                    {/* ⭐ Set Primary */}
                                                    <button
                                                        type="button"
                                                        className={`p-1 rounded transition-colors shrink-0 ${
                                                            c.is_primary
                                                                ? 'text-amber-400'
                                                                : 'text-muted-foreground/40 hover:text-amber-400'
                                                        }`}
                                                        title={c.is_primary ? 'Primary company' : 'Set as primary'}
                                                        onClick={(e) => !c.is_primary && handleSetPrimary(e, c)}
                                                    >
                                                        {c.is_primary ? <IconStarFilled size={13} /> : <IconStar size={13} />}
                                                    </button>

                                                    {/* 🔖 Set Secondary */}
                                                    <button
                                                        type="button"
                                                        className={`p-1 rounded transition-colors shrink-0 ${
                                                            c.is_secondary
                                                                ? 'text-blue-400'
                                                                : 'text-muted-foreground/40 hover:text-blue-400'
                                                        }`}
                                                        title={c.is_secondary ? 'Secondary company' : 'Set as secondary'}
                                                        onClick={(e) => !c.is_secondary && handleSetSecondary(e, c)}
                                                    >
                                                        {c.is_secondary ? <IconBookmarkFilled size={13} /> : <IconBookmark size={13} />}
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Add new company */}
                                    {showCreate ? (
                                        <div className="border-t px-3 py-2 space-y-2">
                                            <Input
                                                placeholder="New company name"
                                                value={newName}
                                                onChange={(e) => setNewName(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleCreateCompany()}
                                                autoFocus
                                                className="h-8 text-sm"
                                            />
                                            <div className="flex gap-1.5">
                                                <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleCreateCompany} disabled={creating}>
                                                    {creating ? 'Creating...' : 'Create'}
                                                </Button>
                                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreate(false)}>
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="border-t flex divide-x bg-muted/20">
                                            <button
                                                type="button"
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs hover:bg-accent transition-colors text-muted-foreground font-medium"
                                                onClick={handlePickImportFile}
                                                disabled={importing}
                                            >
                                                <IconUpload size={14} className={importing ? 'animate-spin' : ''} />
                                                {importing ? 'Importing...' : 'Import Backup'}
                                            </button>
                                            <button
                                                type="button"
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs hover:bg-accent transition-colors text-muted-foreground font-medium"
                                                onClick={() => setShowCreate(true)}
                                            >
                                                <IconPlus size={14} />
                                                New Company
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Login Form */}
                    <form onSubmit={handleLogin} className="space-y-4">
                        {loginError && (
                            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2">
                                <IconAlertCircle className="w-4 h-4 shrink-0 text-destructive" />
                                <span>{loginError}</span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <div className="relative">
                                <IconUser className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="username"
                                    type="text"
                                    placeholder="Enter your username"
                                    value={username}
                                    onChange={(e) => {
                                        setUsername(e.target.value);
                                        if (loginError) setLoginError(null);
                                    }}
                                    className="pl-10"
                                    autoFocus={!showCompanyPicker}
                                    disabled={isLoading}
                                    onKeyDown={handleKeyDown}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <div className="relative">
                                <IconLock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (loginError) setLoginError(null);
                                    }}
                                    className="pl-10"
                                    disabled={isLoading}
                                    ref={passwordRef}
                                    onKeyDown={checkCapsLock}
                                    onKeyUp={checkCapsLock}
                                />
                            </div>
                            {capsLockOn && (
                                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">
                                    <IconAlertTriangle size={14} className="shrink-0" />
                                    <span>Caps Lock is ON</span>
                                </div>
                            )}
                        </div>

                        <Button type="submit" className="w-full" disabled={isLoading || !activeCompany}>
                            {isLoading ? 'Signing in...' : 'Sign In'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
