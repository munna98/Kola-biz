import { useEffect, useState } from 'react';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { store, RootState } from './store';
import { setAuthLoading, setNeedsInitialSetup, setNeedsCompanySetup, loginSuccess } from './store';
import { invoke } from '@tauri-apps/api/core';
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
import BalanceSheetPage from './pages/reports/BalanceSheetPage';
import ProfitLossPage from './pages/reports/ProfitLossPage';
import CashFlowPage from './pages/reports/CashFlowPage';
import DayBookPage from './pages/reports/DayBookPage';
import PartyOutstandingPage from './pages/reports/PartyOutstandingPage';
import StockReportPage from './pages/reports/StockReportPage';
import LoginPage from './pages/LoginPage';
import InitialSetupPage from './pages/InitialSetupPage';
import CompanySetupPage from './pages/CompanySetupPage';

import CompanyProfilePage from './pages/settings/CompanyProfilePage';
import InvoiceSettingsPage from './pages/InvoiceSettingsPage';
import DashboardPage from './pages/DashboardPage';



function AppContent() {
  const dispatch = useDispatch();
  const { activeSection } = useSelector((state: RootState) => state.app);
  const { isAuthenticated, isLoading, needsInitialSetup, needsCompanySetup, token } = useSelector((state: RootState) => state.auth);

  // Reload data when switching to products page
  const [productPageKey, setProductPageKey] = useState(0);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // First, check if any users exist
        const usersExist: boolean = await invoke('check_if_users_exist');

        if (!usersExist) {
          // No users exist, show initial setup
          dispatch(setNeedsInitialSetup(true));
          dispatch(setAuthLoading(false));
          return;
        }

        // Users exist, check if we have a valid session
        const storedToken = token || localStorage.getItem('auth_token');

        if (storedToken) {
          const sessionResponse: any = await invoke('check_session', {
            token: storedToken,
          });

          if (sessionResponse.valid && sessionResponse.user) {
            dispatch(loginSuccess({
              user: sessionResponse.user,
              token: storedToken,
            }));
            localStorage.setItem('auth_token', storedToken);

            // Check if company is set up (not default 'My Company')
            try {
              const companyProfile: any = await invoke('get_company_profile');
              console.log('Company Profile:', companyProfile); // Debug log
              if (companyProfile && companyProfile.company_name === 'My Company') {
                dispatch(setNeedsCompanySetup(true));
              }
            } catch (e) {
              console.error('Failed to check company profile:', e);
            }
          } else {
            localStorage.removeItem('auth_token');
            dispatch(setAuthLoading(false));
          }
        } else {
          dispatch(setAuthLoading(false));
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        dispatch(setAuthLoading(false));
      }
    };

    checkAuth();
  }, [dispatch, token]);

  // Save token to localStorage when it changes
  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token);
    }
  }, [token]);

  useEffect(() => {
    if (activeSection === 'products') {
      setProductPageKey(prev => prev + 1);
    }
  }, [activeSection]);

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show initial setup if needed
  if (needsInitialSetup) {
    return <InitialSetupPage />;
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Show company setup if needed (after login)
  if (needsCompanySetup) {
    return <CompanySetupPage />;
  }

  // Main app content (authenticated)
  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard': return <DashboardPage />;
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
      case 'balance_sheet': return <BalanceSheetPage />;
      case 'profit_loss': return <ProfitLossPage />;
      case 'cash_flow': return <CashFlowPage />;
      case 'day_book': return <DayBookPage />;
      case 'outstanding': return <PartyOutstandingPage />;
      case 'stock_report': return <StockReportPage />;
      case 'company_profile': return <CompanyProfilePage />;
      case 'invoice_settings': return <InvoiceSettingsPage />;

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