import { useEffect, useState } from 'react';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { store, RootState } from './store';
import { setAuthLoading, setNeedsCompanySetup, loginSuccess, setIsFirstRun, setCompanyProfile, goBack, setPermissions } from './store';
import { invoke } from '@tauri-apps/api/core';
import { api, mergePermissions, can } from './lib/tauri';
import ProductsPage from './pages/ProductsPage';
import ServicesPage from './pages/ServicesPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import EmployeesPage from './pages/EmployeesPage';
import ChartOfAccountsPage from './pages/ChartOfAccountsPage';
import PurchaseInvoicePage from './pages/PurchaseInvoicePage';
import PurchaseReturnPage from './pages/PurchaseReturnPage';
import SalesQuotationPage from './pages/SalesQuotationPage';
import DeliveryNotePage from './pages/DeliveryNotePage';
import PaymentPage from './pages/PaymentPage';
import ReceiptPage from './pages/ReceiptPage';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from './components/theme-provider';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import './App.css';
import JournalEntryPage from './pages/JournalEntryPage';
import OpeningBalancePage from './pages/OpeningBalancePage';
import OpeningStockPage from './pages/OpeningStockPage';
import StockJournalPage from './pages/StockJournalPage';
import SalesInvoicePage from './pages/SalesInvoicePage';
import SalesReturnPage from './pages/SalesReturnPage';
import TrialBalancePage from './pages/reports/TrialBalancePage';
import LedgerReportPage from './pages/reports/LedgerReportPage';
import BalanceSheetPage from './pages/reports/BalanceSheetPage';
import ProfitLossPage from './pages/reports/ProfitLossPage';
import CashFlowPage from './pages/reports/CashFlowPage';
import DayBookPage from './pages/reports/DayBookPage';
import PartyOutstandingPage from './pages/reports/PartyOutstandingPage';
import StockReportPage from './pages/reports/StockReportPage';
import ProductProfitPage from './pages/reports/ProductProfitPage';
import TransactionReportPage from './pages/reports/TransactionReportPage';
import SalesReturnReportPage from './pages/reports/SalesReturnReportPage';
import ExpenseReportPage from './pages/reports/ExpenseReportPage';
import LoginPage from './pages/LoginPage';
import CompanySetupPage from './pages/CompanySetupPage';
import FirstRunSetupPage from './pages/FirstRunSetupPage';
import VoucherSettingsPage from './pages/VoucherSettingsPage';
import VoucherSequencesPage from './pages/settings/VoucherSequencesPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import CompanyProfilePage from './pages/settings/CompanyProfilePage';
import { InvoiceTemplatesPage } from './pages/settings/InvoiceTemplatesPage';
import BarcodeSettingsPage from './pages/settings/BarcodeSettingsPage';
import DbSettingsPage from './pages/settings/DbSettingsPage';
import TaxSettingsPage from './pages/settings/TaxSettingsPage';
import SidebarSettingsPage from './pages/settings/SidebarSettingsPage';
import ProductSettingsPage from './pages/settings/ProductSettingsPage';
import Gstr1ReportPage from './pages/reports/Gstr1ReportPage';
import Gstr3bReportPage from './pages/reports/Gstr3bReportPage';
import DashboardPage from './pages/DashboardPage';
import InvoiceDesigner from './components/settings/invoice-designer/InvoiceDesigner';
import { LicenseProvider } from './components/providers/LicenseProvider';
import { LicenseGuard } from './components/LicenseGuard';
import LicensePage from './pages/LicensePage';
import CustomOrdersPage from './pages/CustomOrdersPage';
import FeaturesSettingsPage from './pages/settings/FeaturesSettingsPage';
import ExitConfirmDialog from './components/dialogs/ExitConfirmDialog';
import { IconLock } from '@tabler/icons-react';

function AccessDenied({ section }: { section: string }) {
    return (
        <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-3">
                <IconLock size={48} className="mx-auto text-muted-foreground/50" />
                <h3 className="text-lg font-semibold">Access Denied</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                    You don't have permission to view <span className="font-medium capitalize">{section.replace(/_/g, ' ')}</span>.
                    Contact your administrator to request access.
                </p>
            </div>
        </div>
    );
}

const ALWAYS_ALLOWED_SECTIONS = new Set([
    'company_profile', 'invoice_settings', 'voucher_settings', 'voucher_sequences',
    'license', 'barcode_settings', 'db_settings', 'sidebar_settings', 'feature_settings',
    'product_settings', 'tax_settings', 'invoice_designer',
]);

function AppContent() {
    const dispatch = useDispatch();
    const { activeSection, activeSectionParams } = useSelector((state: RootState) => state.app);
    const { isAuthenticated, isLoading, needsCompanySetup, token, isFirstRun, user, permissions } = useSelector((state: RootState) => state.auth);

    const [productPageKey, setProductPageKey] = useState(0);

    const loadPermissions = async (userId: string) => {
        try {
            const result = await api.permissions.getForUser(userId);
            const merged = mergePermissions(result.permissions, result.overrides);
            dispatch(setPermissions({ permissions: merged, roleId: result.roleId, roleName: result.roleName }));
        } catch (e) {
            console.error('Failed to load permissions:', e);
        }
    };

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const isFirstRunResult: boolean = await invoke('check_first_run');
                if (isFirstRunResult) {
                    dispatch(setIsFirstRun(true));
                    dispatch(setAuthLoading(false));
                    return;
                }

                const storedToken = token || localStorage.getItem('auth_token');

                if (storedToken) {
                    const sessionResponse: any = await invoke('check_session', { token: storedToken });

                    if (sessionResponse.valid && sessionResponse.user) {
                        dispatch(loginSuccess({ user: sessionResponse.user, token: storedToken }));
                        localStorage.setItem('auth_token', storedToken);
                        await loadPermissions(sessionResponse.user.id);

                        try {
                            const companyProfile: any = await invoke('get_company_profile');
                            if (companyProfile) {
                                dispatch(setCompanyProfile(companyProfile));
                                if (companyProfile.company_name === 'My Company') {
                                    dispatch(setNeedsCompanySetup(true));
                                }
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

    useEffect(() => {
        if (user?.id && isAuthenticated && !permissions) {
            loadPermissions(user.id);
        }
    }, [user?.id, isAuthenticated]);

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

    if (isFirstRun) return <FirstRunSetupPage />;
    if (!isAuthenticated) return <LoginPage />;
    if (needsCompanySetup) return <CompanySetupPage />;

    const isAdmin = user?.role === 'admin';

    const canView = (section: string): boolean => {
        if (isAdmin) return true;
        if (ALWAYS_ALLOWED_SECTIONS.has(section)) return true;
        if (!permissions) return true;
        return can(permissions, section, 'view');
    };

    const renderContent = () => {
        // Settings (always allowed)
        switch (activeSection) {
            case 'company_profile': return <CompanyProfilePage />;
            case 'invoice_settings': return <InvoiceTemplatesPage />;
            case 'voucher_settings': return <VoucherSettingsPage />;
            case 'voucher_sequences': return <VoucherSequencesPage />;
            case 'license': return <LicensePage />;
            case 'barcode_settings': return <BarcodeSettingsPage />;
            case 'db_settings': return <DbSettingsPage />;
            case 'sidebar_settings': return <SidebarSettingsPage />;
            case 'feature_settings': return <FeaturesSettingsPage />;
            case 'product_settings': return <ProductSettingsPage />;
            case 'tax_settings': return <TaxSettingsPage />;
            case 'invoice_designer': return <InvoiceDesigner templateId={activeSectionParams?.templateId} voucherType={activeSectionParams?.voucherType} onBack={() => dispatch(goBack())} />;
        }

        // Permission-guarded pages
        if (!canView(activeSection)) {
            return <AccessDenied section={activeSection} />;
        }

        switch (activeSection) {
            case 'dashboard': return <DashboardPage />;
            case 'products': return <ProductsPage key={productPageKey} />;
            case 'services': return <ServicesPage />;
            case 'customers': return <CustomersPage />;
            case 'suppliers': return <SuppliersPage />;
            case 'employees': return <EmployeesPage />;
            case 'coa': return <ChartOfAccountsPage />;
            case 'purchase': return <PurchaseInvoicePage />;
            case 'purchase_return': return <PurchaseReturnPage />;
            case 'sales_quotation': return <SalesQuotationPage />;
            case 'delivery_note': return <DeliveryNotePage />;
            case 'custom_orders': return <CustomOrdersPage />;
            case 'sales': return <SalesInvoicePage />;
            case 'sales_return': return <SalesReturnPage />;
            case 'payments': return <PaymentPage />;
            case 'receipts': return <ReceiptPage />;
            case 'journal': return <JournalEntryPage />;
            case 'opening': return <OpeningBalancePage />;
            case 'opening_stock': return <OpeningStockPage />;
            case 'stock_journal': return <StockJournalPage />;
            case 'trial': return <TrialBalancePage />;
            case 'ledger': return <LedgerReportPage />;
            case 'balance_sheet': return <BalanceSheetPage />;
            case 'profit_loss': return <ProfitLossPage />;
            case 'cash_flow': return <CashFlowPage />;
            case 'day_book': return <DayBookPage />;
            case 'outstanding': return <PartyOutstandingPage />;
            case 'stock_report': return <StockReportPage />;
            case 'product_profit': return <ProductProfitPage />;
            case 'transactions': return <TransactionReportPage />;
            case 'sales_return_report': return <SalesReturnReportPage />;
            case 'expense_report': return <ExpenseReportPage />;
            case 'gstr1': return <Gstr1ReportPage />;
            case 'gstr3b': return <Gstr3bReportPage />;
            case 'users': return <UsersPage />;
            case 'roles': return <RolesPage />;
            default: return <div className="p-6 text-muted-foreground">Coming soon...</div>;
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Topbar />
                <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    {renderContent()}
                </main>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <ThemeProvider defaultTheme="system" storageKey="erp-theme">
            <Provider store={store}>
                <LicenseProvider>
                    <LicenseGuard>
                        <AppContent />
                        <ExitConfirmDialog />
                        <Toaster />
                    </LicenseGuard>
                </LicenseProvider>
            </Provider>
        </ThemeProvider>
    );
}

