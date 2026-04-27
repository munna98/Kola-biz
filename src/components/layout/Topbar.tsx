import { IconMoon, IconSun, IconSettings, IconBuilding, IconChevronDown } from '@tabler/icons-react';
import { useTheme } from '../theme-provider';
import { useDispatch, useSelector } from 'react-redux';
import { setActiveSection, RootState, logout } from '../../store';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
    const handleNavigation = (section: string) => dispatch(setActiveSection(section));

    // Display user's full name if available, otherwise username
    const displayName = user?.full_name || user?.username || 'User';

    // Active company display
    const [companyName, setCompanyName] = useState<string>('');
    const [switcherOpen, setSwitcherOpen] = useState(false);

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
        <header className="bg-card border-b h-14 flex items-center px-6 gap-4 relative z-50">
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
                        <MenubarItem onClick={() => handleNavigation('coa')}>Chart of Accounts</MenubarItem>
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
                        <MenubarSeparator />
                        <MenubarItem onClick={() => handleNavigation('users')}>Users</MenubarItem>
                        <MenubarItem onClick={() => handleNavigation('license')}>License</MenubarItem>
                        <MenubarSeparator />
                        <MenubarItem onClick={() => handleNavigation('db_settings')}>DB Settings</MenubarItem>
                    </MenubarContent>
                </MenubarMenu>
            </Menubar>

            <div className="ml-auto flex items-center gap-3">
                {/* Company switcher */}
                {companyName && (
                    <button
                        id="company-switcher-btn"
                        onClick={() => setSwitcherOpen(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium
                                   bg-primary/8 border border-primary/20 hover:bg-primary/15 transition-colors
                                   text-foreground max-w-[200px]"
                        title="Switch company"
                    >
                        <IconBuilding size={14} className="text-primary shrink-0" />
                        <span className="truncate">{companyName}</span>
                        <IconChevronDown size={12} className="text-muted-foreground shrink-0" />
                    </button>
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
