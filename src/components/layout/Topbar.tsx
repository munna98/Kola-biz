import { IconMoon, IconSun, IconSettings, IconBuilding, IconArrowLeft, IconArrowRight, IconDownload, IconPower } from '@tabler/icons-react';
import { useTheme } from '../theme-provider';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, logout } from '../../store';
import { useAppNavigation } from '../../hooks/useAppNavigation';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { CompanySwitcherModal } from '../dialogs/CompanySwitcherModal';
import {
    Menubar,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarSeparator,
    MenubarSub,
    MenubarSubContent,
    MenubarSubTrigger,
    MenubarTrigger,
} from '@/components/ui/menubar';

function ThemeToggle() {
    const { theme, setTheme } = useTheme();

    return (
        <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
            {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
        </button>
    );
}

export default function Topbar() {
    const dispatch = useDispatch();
    const { user } = useSelector((state: RootState) => state.auth);
    const { navigateTo, goBack, goForward, canGoBack, canGoForward } = useAppNavigation();
    const handleNavigation = (section: string) => navigateTo(section);

    // Display user's full name if available, otherwise username
    const displayName = user?.full_name || user?.username || 'User';

    // Active company display
    const [companyName, setCompanyName] = useState<string>('');
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [isBackingUp, setIsBackingUp] = useState(false);

    const handleQuickBackup = async () => {
        setIsBackingUp(true);
        try {
            const res: any = await invoke('create_manual_backup', {
                companyId: null,
                destPath: null,
            });
            if (res.success) {
                toast.success(res.message || 'Backup snapshot created successfully!');
            } else {
                toast.error(res.message || 'Backup failed');
            }
        } catch (err: any) {
            toast.error(typeof err === 'string' ? err : 'Failed to create backup');
        } finally {
            setIsBackingUp(false);
        }
    };

    const fetchCompanyName = () => {
        invoke<any>('get_active_company')
            .then((c) => {
                if (c?.name) {
                    setCompanyName(c.name);
                } else {
                    // Fallback to company profile name
                    invoke<any>('get_company_profile')
                        .then((p) => setCompanyName(p?.company_name || ''))
                        .catch(() => setCompanyName(''));
                }
            })
            .catch(() => setCompanyName(''));
    };

    useEffect(() => { fetchCompanyName(); }, []);

    const handleSwitched = () => {
        // Force re-login after company switch
        localStorage.removeItem('auth_token');
        dispatch(logout());
    };

    return (
        <header className="bg-card border-b h-14 flex items-center px-4 gap-2 relative z-50">
            {/* Back / Forward navigation buttons */}
            <div className="flex items-center gap-0.5 mr-1">
                <button
                    id="nav-go-back"
                    onClick={goBack}
                    disabled={!canGoBack}
                    title="Go back (Ctrl+Left)"
                    className={`p-1.5 rounded-md transition-colors ${
                        canGoBack
                            ? 'hover:bg-accent text-foreground cursor-pointer'
                            : 'text-muted-foreground/40 cursor-not-allowed'
                    }`}
                >
                    <IconArrowLeft size={18} />
                </button>
                <button
                    id="nav-go-forward"
                    onClick={goForward}
                    disabled={!canGoForward}
                    title="Go forward (Ctrl+Right)"
                    className={`p-1.5 rounded-md transition-colors ${
                        canGoForward
                            ? 'hover:bg-accent text-foreground cursor-pointer'
                            : 'text-muted-foreground/40 cursor-not-allowed'
                    }`}
                >
                    <IconArrowRight size={18} />
                </button>
            </div>
            <div className="w-px h-5 bg-border mr-1" />
            <Menubar className="border-none bg-transparent shadow-none">
                {/* Inventory */}
                <MenubarMenu>
                    <MenubarTrigger>Inventory</MenubarTrigger>
                    <MenubarContent>
                        <MenubarItem onClick={() => handleNavigation('products')}>
                            Products
                        </MenubarItem>
                        <MenubarSeparator />
                        <MenubarItem onClick={() => handleNavigation('purchase')}>
                            Purchase Invoice
                        </MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('purchase_return')}>
                            Purchase Return
                        </MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('sales_quotation')}>
                            Sales Quotation
                        </MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('delivery_note')}>
                            Delivery Note
                        </MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('custom_orders')}>
                            Custom Orders
                        </MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('sales')}>
                            Sales Invoice
                        </MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('sales_return')}>
                            Sales Return
                        </MenubarItem>
                        <MenubarSeparator />
                        <MenubarItem onClick={() => handleNavigation('opening_stock')}>
                            Opening Stock
                        </MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('stock_journal')}>
                            Stock Journal
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* Accounts */}
                <MenubarMenu>
                    <MenubarTrigger>Accounts</MenubarTrigger>
                    <MenubarContent>
                        <MenubarItem onClick={() => handleNavigation('coa')}>Ledgers</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('customers')}>Customers</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('suppliers')}>Suppliers</MenubarItem>
                        <MenubarSeparator />
                        <MenubarItem onClick={() => handleNavigation('payments')}>Payment</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('receipts')}>Receipt</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('journal')}>Journal Entry</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('opening')}>Opening Balance</MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* Reports */}
                <MenubarMenu>
                    <MenubarTrigger>Reports</MenubarTrigger>
                    <MenubarContent>
                        <MenubarItem onClick={() => handleNavigation('stock_report')}>Stock Report</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('product_profit')}>Product Profit</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('sales_return_report')}>Sales & Returns</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('expense_report')}>Expense Report</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('day_book')}>Day Book</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('outstanding')}>Party Outstanding</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('ledger')}>Ledger Report</MenubarItem>
                        <MenubarSeparator />
                        <MenubarItem onClick={() => handleNavigation('trial')}>Trial Balance</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('balance_sheet')}>Balance Sheet</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('profit_loss')}>Profit & Loss</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('cash_flow')}>Cash Flow</MenubarItem>
                        <MenubarSeparator />
                        <MenubarSub>
                            <MenubarSubTrigger>GST Reports</MenubarSubTrigger>
                            <MenubarSubContent>
                                <MenubarItem onClick={() => handleNavigation('gstr1')}>
                                    GSTR-1 (Outward Supplies)
                                </MenubarItem>
                                <MenubarItem onClick={() => handleNavigation('gstr3b')}>
                                    GSTR-3B (Net Liability)
                                </MenubarItem>
                            </MenubarSubContent>
                        </MenubarSub>
                    </MenubarContent>
                </MenubarMenu>

                {/* Settings */}
                <MenubarMenu>
                    <MenubarTrigger>
                        <IconSettings size={16} className="mr-2" />
                        Settings
                    </MenubarTrigger>
                    <MenubarContent>
                        <MenubarSub>
                            <MenubarSubTrigger>Company Settings</MenubarSubTrigger>
                            <MenubarSubContent>
                                <MenubarItem onClick={() => setSwitcherOpen(true)}>Manage Companies</MenubarItem>
                                <MenubarItem onClick={() => handleNavigation('company_profile')}>Company Profile</MenubarItem>
                            </MenubarSubContent>
                        </MenubarSub>
                        <MenubarSeparator />
                        <MenubarItem onClick={() => handleNavigation('invoice_settings')}>Invoice Settings</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('voucher_settings')}>Voucher Settings</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('voucher_sequences')}>Voucher Numbering</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('barcode_settings')}>Barcode Settings</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('tax_settings')}>Tax Settings</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('sidebar_settings')}>Sidebar Settings</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('feature_settings')}>Feature Settings</MenubarItem>
                        <MenubarSeparator />
                        <MenubarItem onClick={() => handleNavigation('users')}>Users</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('license')}>About KolaBiz</MenubarItem>
                        <MenubarSeparator />
                        <MenubarItem onClick={() => handleNavigation('db_settings')}>DB Settings</MenubarItem>
                        <MenubarSeparator />
                        <MenubarItem
                            onClick={() => window.dispatchEvent(new CustomEvent('open-exit-confirm'))}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer font-medium"
                        >
                            <IconPower size={16} className="mr-2" />
                            Exit Application
                        </MenubarItem>
                    </MenubarContent>
                </MenubarMenu>
            </Menubar>

            <div className="ml-auto flex items-center gap-2.5">
                {/* Instant Backup Now button */}
                <button
                    onClick={handleQuickBackup}
                    disabled={isBackingUp}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    title="Take Instant Database Backup"
                >
                    <IconDownload size={14} className={isBackingUp ? 'animate-spin' : ''} />
                    <span>{isBackingUp ? 'Backing Up...' : 'Backup Now'}</span>
                </button>

                {/* Company display */}
                {companyName && (
                    <div
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium
                                   bg-primary/8 border border-primary/20 text-foreground max-w-[200px]"
                        title={companyName}
                    >
                        <IconBuilding size={14} className="text-primary shrink-0" />
                        <span className="truncate">{companyName}</span>
                    </div>
                )}
                <ThemeToggle />
                <div className="text-sm font-medium text-muted-foreground" title={user?.username}>
                    {displayName}
                </div>
            </div>

            <CompanySwitcherModal
                open={switcherOpen}
                onClose={() => setSwitcherOpen(false)}
                onSwitched={handleSwitched}
            />
        </header>
    );
}
