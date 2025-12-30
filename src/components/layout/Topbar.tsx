import { IconMoon, IconSun, IconSettings } from '@tabler/icons-react';
import { useTheme } from '../theme-provider';
import { useDispatch, useSelector } from 'react-redux';
import { setActiveSection, RootState } from '../../store';
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';

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

    const itemStyle = "block select-none rounded-md px-3 py-2 text-sm font-medium no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer";

    // Display user's full name if available, otherwise username
    const displayName = user?.full_name || user?.username || 'User';

    return (
        <header className="bg-card border-b h-14 flex items-center px-6 gap-4 relative z-50">
            {/* FIX: Add viewport={false} here */}
            <NavigationMenu viewport={false}>
                <NavigationMenuList>

                    {/* Inventory */}
                    <NavigationMenuItem>
                        <NavigationMenuTrigger className="h-9">Inventory</NavigationMenuTrigger>
                        <NavigationMenuContent>
                            <ul className="flex flex-col w-48">
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('products')}>
                                    Products
                                </NavigationMenuLink>
                                <div className="border-t my-1"></div>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('purchase')}>
                                    Purchase Invoice
                                </NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('purchase_return')}>
                                    Purchase Return
                                </NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('sales')}>
                                    Sales Invoice
                                </NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('sales_return')}>
                                    Sales Return
                                </NavigationMenuLink>
                            </ul>
                        </NavigationMenuContent>
                    </NavigationMenuItem>

                    {/* Accounts */}
                    <NavigationMenuItem>
                        <NavigationMenuTrigger className="h-9">Accounts</NavigationMenuTrigger>
                        <NavigationMenuContent>
                            <ul className="flex flex-col w-48">
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('coa')}>Chart of Accounts</NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('customers')}>Customers</NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('suppliers')}>Suppliers</NavigationMenuLink>
                                <div className="border-t my-1"></div>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('payments')}>Payment</NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('receipts')}>Receipt</NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('journal')}>Journal Entry</NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('opening')}>Opening Balance</NavigationMenuLink>
                            </ul>
                        </NavigationMenuContent>
                    </NavigationMenuItem>

                    {/* Reports */}
                    <NavigationMenuItem>
                        <NavigationMenuTrigger className="h-9">Reports</NavigationMenuTrigger>
                        <NavigationMenuContent>
                            <ul className="flex flex-col w-48">
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('stock_report')}>Stock Report</NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('day_book')}>Day Book</NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('outstanding')}>Party Outstanding</NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('ledger')}>Ledger Report</NavigationMenuLink>
                                <div className="border-t my-1"></div>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('trial')}>Trial Balance</NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('balance_sheet')}>Balance Sheet</NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('profit_loss')}>Profit & Loss</NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('cash_flow')}>Cash Flow</NavigationMenuLink>
                            </ul>
                        </NavigationMenuContent>
                    </NavigationMenuItem>

                    {/* Settings */}
                    <NavigationMenuItem>
                        <NavigationMenuTrigger className="h-9">
                            <IconSettings size={16} className="mr-2" />
                            Settings
                        </NavigationMenuTrigger>
                        <NavigationMenuContent>
                            <ul className="flex flex-col w-48">
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('company_profile')}>Company Profile</NavigationMenuLink>
                                <NavigationMenuLink className={itemStyle} onClick={() => handleNavigation('invoice_settings')}>Invoice Settings</NavigationMenuLink>
                            </ul>
                        </NavigationMenuContent>
                    </NavigationMenuItem>

                </NavigationMenuList>
            </NavigationMenu>

            <div className="ml-auto flex items-center gap-3">
                <ThemeToggle />
                <div className="text-sm font-medium text-muted-foreground" title={user?.username}>
                    {displayName}
                </div>
            </div>
        </header>
    );
}