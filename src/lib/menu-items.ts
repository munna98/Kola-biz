import {
    IconLayoutDashboard,
    IconPackage,
    IconTools,
    IconUserDown,
    IconUserUp,
    IconBriefcase,
    IconTruck,
    IconTruckReturn,
    IconShoppingBag,
    IconReceiptRefund,
    IconCashBanknoteMove,
    IconCashBanknoteMoveBack,
    IconNotebook,
    IconScale,
    IconBox,
    IconExchange,
    IconReportAnalytics,
    IconHistory,
    IconCalendarStats,
    IconFileInvoice,
    IconScaleOutline,
    IconChartPie,
    IconCurrencyRupee,
    IconFileReport
} from '@tabler/icons-react';

export interface MenuItem {
    id: string;
    label: string;
    icon: React.ElementType;
    category: string;
}

export const ALL_MENU_ITEMS: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: IconLayoutDashboard, category: 'General' },
    
    // Master
    { id: 'products', label: 'Products', icon: IconPackage, category: 'Master' },
    { id: 'services', label: 'Services', icon: IconTools, category: 'Master' },
    { id: 'customers', label: 'Customers', icon: IconUserDown, category: 'Master' },
    { id: 'suppliers', label: 'Suppliers', icon: IconUserUp, category: 'Master' },
    { id: 'employees', label: 'Employees', icon: IconBriefcase, category: 'Master' },
    { id: 'coa', label: 'Chart of Accounts', icon: IconNotebook, category: 'Master' },
    
    // Vouchers
    { id: 'purchase', label: 'Purchase Invoice', icon: IconTruck, category: 'Voucher' },
    { id: 'purchase_return', label: 'Purchase Return', icon: IconTruckReturn, category: 'Voucher' },
    { id: 'sales_quotation', label: 'Sales Quotation', icon: IconShoppingBag, category: 'Voucher' },
    { id: 'sales', label: 'Sales Invoice', icon: IconShoppingBag, category: 'Voucher' },
    { id: 'sales_return', label: 'Sales Return', icon: IconReceiptRefund, category: 'Voucher' },
    { id: 'payments', label: 'Payments', icon: IconCashBanknoteMove, category: 'Voucher' },
    { id: 'receipts', label: 'Receipts', icon: IconCashBanknoteMoveBack, category: 'Voucher' },
    { id: 'journal', label: 'Journal Entry', icon: IconNotebook, category: 'Voucher' },
    { id: 'opening', label: 'Opening Balance', icon: IconScale, category: 'Voucher' },
    { id: 'opening_stock', label: 'Opening Stock', icon: IconBox, category: 'Voucher' },
    { id: 'stock_journal', label: 'Stock Journal', icon: IconExchange, category: 'Voucher' },

    // Reports
    { id: 'stock_report', label: 'Stock Report', icon: IconReportAnalytics, category: 'Report' },
    { id: 'transactions', label: 'Transaction Report', icon: IconHistory, category: 'Report' },
    { id: 'sales_return_report', label: 'Sales & Returns', icon: IconReceiptRefund, category: 'Report' },
    { id: 'day_book', label: 'Day Book', icon: IconCalendarStats, category: 'Report' },
    { id: 'outstanding', label: 'Party Outstanding', icon: IconFileInvoice, category: 'Report' },
    { id: 'ledger', label: 'Ledger Report', icon: IconNotebook, category: 'Report' },
    { id: 'trial', label: 'Trial Balance', icon: IconScaleOutline, category: 'Report' },
    { id: 'balance_sheet', label: 'Balance Sheet', icon: IconScale, category: 'Report' },
    { id: 'profit_loss', label: 'Profit & Loss', icon: IconChartPie, category: 'Report' },
    { id: 'cash_flow', label: 'Cash Flow', icon: IconCurrencyRupee, category: 'Report' },
    { id: 'gstr1', label: 'GSTR-1', icon: IconFileReport, category: 'Report' },
    { id: 'gstr3b', label: 'GSTR-3B', icon: IconFileReport, category: 'Report' },
];

export const DEFAULT_SIDEBAR_ITEMS = [
    'dashboard', 'products', 'customers', 'suppliers', 'employees',
    'purchase', 'sales', 'payments', 'receipts', 'journal',
    'stock_report', 'transactions', 'day_book', 'outstanding'
];
