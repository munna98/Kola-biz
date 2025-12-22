import { useEffect, useState } from 'react';
import { Provider, useSelector } from 'react-redux';
import { store, RootState } from './store';
import ProductsPage from './pages/ProductsPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import ChartOfAccountsPage from './pages/ChartOfAccountsPage';
import PurchaseInvoicePage from './pages/PurchaseInvoicePage';
import PaymentPage from './pages/PaymentPage';
import ReceiptPage from './pages/ReceiptPage';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from './components/theme-provider';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import './App.css';
import JournalEntryPage from './pages/JournalEntryPage';
import OpeningBalancePage from './pages/OpeningBalancePage';
import SalesInvoicePage from './pages/SalesInvoicePage';
import TrialBalancePage from './pages/reports/TrialBalancePage';
import LedgerReportPage from './pages/reports/LedgerReportPage';
import SettingsPage from './pages/SettingsPage';

function AppContent() {
  const { activeSection } = useSelector((state: RootState) => state.app);

  // Reload data when switching to products page
  const [productPageKey, setProductPageKey] = useState(0);

  useEffect(() => {
    if (activeSection === 'products') {
      setProductPageKey(prev => prev + 1);
    }
  }, [activeSection]);

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
      case 'trial': return <TrialBalancePage />;
      case 'ledger': return <LedgerReportPage />;
      case 'settings': return <SettingsPage />;
      default: return <div className="p-6 text-muted-foreground">Coming soon...</div>;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />

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