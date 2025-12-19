import { useEffect, useState } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store, RootState, toggleSidebar, setActiveSection } from './store';
import { IconPackage, IconUsers, IconTruck, IconReceipt, IconCreditCard, IconMenu2, IconChevronLeft, IconBook } from '@tabler/icons-react';
import ProductsPage from './pages/ProductsPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import ChartOfAccountsPage from './pages/ChartOfAccountsPage';
import PurchaseInvoicePage from './pages/PurchaseInvoicePage';
import { Toaster } from '@/components/ui/sonner';
import './App.css';

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
    { id: 'customers', label: 'Customers', icon: IconUsers },
    { id: 'suppliers', label: 'Suppliers', icon: IconTruck },
    { id: 'coa', label: 'Chart of Accounts', icon: IconBook },
    { id: 'purchase', label: 'Purchase', icon: IconTruck },
    { id: 'sales', label: 'Sales', icon: IconReceipt },
    { id: 'payments', label: 'Payments', icon: IconCreditCard },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'products': return <ProductsPage key={productPageKey} />;
      case 'customers': return <CustomersPage />;
      case 'suppliers': return <SuppliersPage />;
      case 'coa': return <ChartOfAccountsPage />;
      case 'purchase': return <PurchaseInvoicePage />;
      case 'sales': return <div className="p-6 text-muted-foreground">Sales module coming soon...</div>;
      default: return <div className="p-6 text-muted-foreground">Coming soon...</div>;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className={`bg-card border-r transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
        <div className="flex items-center justify-between p-4 border-b h-14">
          {!sidebarCollapsed && <h1 className="font-bold text-lg">Kola ERP</h1>}
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
          <div className="ml-auto text-sm text-muted-foreground">Admin</div>
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
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}