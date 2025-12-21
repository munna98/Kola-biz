import { useEffect, useState } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store, RootState, toggleSidebar, setActiveSection } from './store';
import { IconPackage, IconUserMinus, IconTruck, IconUserPlus, IconShoppingBag, IconCashBanknoteMoveBack, IconCashBanknoteMove, IconMenu2, IconChevronLeft, IconBook, IconMoon, IconSun } from '@tabler/icons-react';
import ProductsPage from './pages/ProductsPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import ChartOfAccountsPage from './pages/ChartOfAccountsPage';
import PurchaseInvoicePage from './pages/PurchaseInvoicePage';
import PaymentPage from './pages/PaymentPage';
import ReceiptPage from './pages/ReceiptPage';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider, useTheme } from './components/theme-provider';
import './App.css';
import JournalEntryPage from './pages/JournalEntryPage';
import OpeningBalancePage from './pages/OpeningBalancePage';
import SalesInvoicePage from './pages/SalesInvoicePage';

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

function AppContent() {
  const dispatch = useDispatch();
  const { sidebarCollapsed, activeSection } = useSelector((state: RootState) => state.app);

  // Reload data when switching to products page
  const [productPageKey, setProductPageKey] = useState(0);

  useEffect(() => {
    if (activeSection === 'products') {
      setProductPageKey(prev => prev + 1);
    }
  }, [activeSection]);

  const menuItems = [
    { id: 'products', label: 'Products', icon: IconPackage },
    { id: 'customers', label: 'Customers', icon: IconUserMinus },
    { id: 'suppliers', label: 'Suppliers', icon: IconUserPlus },
    { id: 'coa', label: 'Chart of Accounts', icon: IconBook },
    { id: 'purchase', label: 'Purchase', icon: IconTruck },
    { id: 'sales', label: 'Sales', icon: IconShoppingBag },
    { id: 'payments', label: 'Payments', icon: IconCashBanknoteMove },
    { id: 'receipts', label: 'Receipts', icon: IconCashBanknoteMoveBack },
    { id: 'journal', label: 'Journal Entries', icon: IconBook },
    { id: 'opening', label: 'Opening Balance', icon: IconBook },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'products': return <ProductsPage key={productPageKey} />;
      case 'customers': return <CustomersPage />;
      case 'suppliers': return <SuppliersPage />;
      case 'coa': return <ChartOfAccountsPage />;
      case 'purchase': return <PurchaseInvoicePage />;
      case 'sales': return <SalesInvoicePage />;
      case 'payments': return <PaymentPage />;
      case 'receipts': return <ReceiptPage />;
      case 'journal': return <JournalEntryPage />;
      case 'opening': return <OpeningBalancePage />;
      default: return <div className="p-6 text-muted-foreground">Coming soon...</div>;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className={`bg-card border-r transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
        <div className="flex items-center justify-between p-4 border-b h-14">
          {!sidebarCollapsed && <h1 className="font-bold text-lg">KolaBiz ERP</h1>}
          <button onClick={() => dispatch(toggleSidebar())} className="p-1 hover:bg-accent rounded">
            {sidebarCollapsed ? <IconMenu2 size={20} /> : <IconChevronLeft size={20} />}
          </button>
        </div>
        <nav className="p-2">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => dispatch(setActiveSection(item.id))}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md mb-1 transition-colors ${activeSection === item.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                }`}
            >
              <item.icon size={20} />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-card border-b h-14 flex items-center px-6 gap-4">
          <button className="px-4 py-1.5 text-sm font-medium hover:bg-accent rounded">Inventory</button>
          <button className="px-4 py-1.5 text-sm font-medium hover:bg-accent rounded">Accounts</button>
          <button className="px-4 py-1.5 text-sm font-medium hover:bg-accent rounded">Reports</button>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <div className="text-sm text-muted-foreground">Admin</div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto">
          {renderContent()}
        </main>
      </div>

      {/* Toast Notifications */}
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="erp-theme">
      <Provider store={store}>
        <AppContent />
      </Provider>
    </ThemeProvider>
  );
}