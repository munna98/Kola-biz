import { useDispatch, useSelector } from 'react-redux';
import { RootState, toggleSidebar, setActiveSection } from '../../store';
import {
    IconPackage,
    IconUserDown,
    IconTruck,
    IconUserUp,
    IconShoppingBag,
    IconCashBanknoteMoveBack,
    IconCashBanknoteMove,
    IconLayoutSidebar,
    IconLayoutSidebarLeftCollapse,
    IconNotebook,
    IconReportAnalytics,
    IconCalendarStats,
    IconReceiptRefund,
    IconLayoutDashboard
} from '@tabler/icons-react';

interface MenuItem {
    id: string;
    label: string;
    icon: React.ElementType;
}

const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
    { id: 'products', label: 'Products', icon: IconPackage },
    { id: 'customers', label: 'Customers', icon: IconUserDown },
    { id: 'suppliers', label: 'Suppliers', icon: IconUserUp },
    { id: 'purchase', label: 'Purchase', icon: IconTruck },
    { id: 'sales', label: 'Sales', icon: IconShoppingBag },
    { id: 'payments', label: 'Payments', icon: IconCashBanknoteMove },
    { id: 'receipts', label: 'Receipts', icon: IconCashBanknoteMoveBack },
    { id: 'journal', label: 'Journal Entry', icon: IconNotebook },
    { id: 'stock_report', label: 'Stock Report', icon: IconReportAnalytics },
    { id: 'day_book', label: 'Day Book', icon: IconCalendarStats },
    { id: 'outstanding', label: 'Party Outstanding', icon: IconReceiptRefund },
];

export default function Sidebar() {
    const dispatch = useDispatch();
    const { sidebarCollapsed, activeSection } = useSelector((state: RootState) => state.app);

    return (
        <aside className={`bg-card border-r transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
            <div className="flex items-center justify-between p-4 border-b h-14">
                {!sidebarCollapsed && (
                    <h1 className="font-bold text-lg font-hammersmith">
                        <span className="text-yellow-500">KolaB</span>
                        <span className="text-green-600">i</span>
                        <span className="text-yellow-500">z ERP</span>
                    </h1>
                )}
                <button
                    onClick={() => dispatch(toggleSidebar())}
                    className="p-1 hover:bg-accent rounded"
                >
                    {sidebarCollapsed ? <IconLayoutSidebar size={20} /> : <IconLayoutSidebarLeftCollapse size={20} />}
                </button>
            </div>
            <nav className="p-2">
                {menuItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => dispatch(setActiveSection(item.id))}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md mb-1 transition-colors ${activeSection === item.id
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-accent'
                            }`}
                    >
                        <item.icon size={20} />
                        {!sidebarCollapsed && <span>{item.label}</span>}
                    </button>
                ))}
            </nav>
        </aside>
    );
}
