import { IconMoon, IconSun, IconSettings } from '@tabler/icons-react';
import { useTheme } from '../theme-provider';
import { useDispatch, useSelector } from 'react-redux';
import { setActiveSection, RootState } from '../../store';
import {
    Menubar,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarSeparator,
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
                        <MenubarItem onClick={() => handleNavigation('gst_report')}>GST Report</MenubarItem>
                    </MenubarContent>
                </MenubarMenu>

                {/* Settings */}
                <MenubarMenu>
                    <MenubarTrigger>
                        <IconSettings size={16} className="mr-2" />
                        Settings
                    </MenubarTrigger>
                    <MenubarContent>
                        <MenubarItem onClick={() => handleNavigation('company_profile')}>Company Profile</MenubarItem>
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
                <ThemeToggle />
                <div className="text-sm font-medium text-muted-foreground" title={user?.username}>
                    {displayName}
                </div>
            </div>
        </header>
    );
}
