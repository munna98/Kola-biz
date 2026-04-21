import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AppState {
  sidebarCollapsed: boolean;
  activeSection: string;
  activeSectionParams?: Record<string, any>;
  currentUser: string;
}

export interface VoucherNavigationState {
  mode: 'new' | 'viewing' | 'editing';
  currentVoucherId: string | null;
  hasUnsavedChanges: boolean;
  navigationData: {
    hasPrevious: boolean;
    hasNext: boolean;
    previousId: string | null;
    nextId: string | null;
  };
}

const initialNavigationState: VoucherNavigationState = {
  mode: 'new',
  currentVoucherId: null,
  hasUnsavedChanges: false,
  navigationData: {
    hasPrevious: false,
    hasNext: false,
    previousId: null,
    nextId: null, // Fixed: removed invalid character
  },
};

const initialState: AppState = {
  sidebarCollapsed: false,
  activeSection: 'dashboard',
  activeSectionParams: undefined,
  currentUser: 'Admin',
};

// ========== AUTH SLICE ==========
export interface User {
  id: number;
  username: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
  error: string | null;

  needsCompanySetup: boolean;
}

const authInitialState: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  token: null,
  error: null,

  needsCompanySetup: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState: authInitialState,
  reducers: {
    setAuthLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    setNeedsCompanySetup: (state, action: PayloadAction<boolean>) => {
      state.needsCompanySetup = action.payload;
    },
    loginSuccess: (state, action: PayloadAction<{ user: User; token: string }>) => {
      state.isAuthenticated = true;
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.error = null;
      state.isLoading = false;
    },
    loginFailure: (state, action: PayloadAction<string>) => {
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.error = action.payload;
      state.isLoading = false;
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.token = null;
      state.error = null;
    },
    clearAuthError: (state) => {
      state.error = null;
    },
  },
});

export const {
  setAuthLoading,

  setNeedsCompanySetup,
  loginSuccess,
  loginFailure,
  logout,
  clearAuthError,
} = authSlice.actions;


const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setActiveSection: (state, action: PayloadAction<string>) => {
      state.activeSection = action.payload;
      state.activeSectionParams = undefined;
    },
    setActiveSectionWithParams: (state, action: PayloadAction<{ section: string; params?: Record<string, any> }>) => {
      state.activeSection = action.payload.section;
      state.activeSectionParams = action.payload.params;
    },
  },
});

// ========== PURCHASE INVOICE SLICE ==========
export interface PurchaseInvoiceItem {
  id?: string;
  product_id: number;
  product_name?: string;
  unit_id?: string;
  base_quantity?: number;
  original_amount?: number;
  invoice_discount_amount?: number;
  hsn_sac_code?: string;
  gst_slab_id?: string;
  resolved_gst_rate?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  description: string;
  initial_quantity: number;
  count: number;
  deduction_per_unit: number;
  rate: number;
  tax_rate: number;
  discount_percent: number;
  discount_amount: number;
}

export interface PurchaseInvoiceState extends VoucherNavigationState {
  currentVoucherNo?: string;
  created_by_name?: string;
  form: {
    supplier_id: number;
    supplier_name: string;
    party_type: string;
    voucher_date: string;
    reference: string;
    narration: string;
    discount_rate: number;
    discount_amount: number;
  };
  items: PurchaseInvoiceItem[];
  loading: boolean;
  savedInvoices: any[];
  totals: {
    subtotal: number;
    discount: number;
    tax: number;
    grandTotal: number;
  };
}

const purchaseInitialState: PurchaseInvoiceState = {
  ...initialNavigationState,
  currentVoucherNo: undefined,
  created_by_name: undefined,
  form: {
    supplier_id: 0,
    supplier_name: '',
    party_type: 'supplier',
    voucher_date: new Date().toISOString().split('T')[0],
    reference: '',
    narration: '',
    discount_rate: 0,
    discount_amount: 0,
  },
  items: [],
  loading: false,
  savedInvoices: [],
  totals: {
    subtotal: 0,
    discount: 0,
    tax: 0,
    grandTotal: 0,
  },
};

const purchaseInvoiceSlice = createSlice({
  name: 'purchaseInvoice',
  initialState: purchaseInitialState,
  reducers: {
    setPurchaseMode: (state, action: PayloadAction<'new' | 'viewing' | 'editing'>) => {
      state.mode = action.payload;
    },
    setPurchaseCurrentVoucherId: (state, action: PayloadAction<string | null>) => {
      state.currentVoucherId = action.payload;
    },
    setPurchaseCurrentVoucherNo: (state, action: PayloadAction<string | undefined>) => {
      state.currentVoucherNo = action.payload;
    },
    setPurchaseCreatedByName: (state, action: PayloadAction<string | undefined>) => {
      state.created_by_name = action.payload;
    },
    setPurchaseHasUnsavedChanges: (state, action: PayloadAction<boolean>) => {
      state.hasUnsavedChanges = action.payload;
    },
    setPurchaseNavigationData: (state, action: PayloadAction<{ hasPrevious: boolean; hasNext: boolean; previousId: string | null; nextId: string | null }>) => {
      state.navigationData = action.payload;
    },
    setSupplier: (state, action: PayloadAction<{ id: number; name: string; type?: string }>) => {
      state.form.supplier_id = action.payload.id;
      state.form.supplier_name = action.payload.name;
      state.form.party_type = action.payload.type || 'supplier';
      state.hasUnsavedChanges = true;
    },
    setVoucherDate: (state, action: PayloadAction<string>) => {
      state.form.voucher_date = action.payload;
    },
    setReference: (state, action: PayloadAction<string>) => {
      state.form.reference = action.payload;
    },
    setNarration: (state, action: PayloadAction<string>) => {
      state.form.narration = action.payload;
    },
    setDiscountRate: (state, action: PayloadAction<number>) => {
      state.form.discount_rate = action.payload;
    },
    setDiscountAmount: (state, action: PayloadAction<number>) => {
      state.form.discount_amount = action.payload;
    },
    addItem: (state, action: PayloadAction<PurchaseInvoiceItem & { insertAt?: number }>) => {
      const { insertAt, ...itemData } = action.payload as any;
      if (insertAt !== undefined) {
        state.items.splice(insertAt, 0, { ...itemData, id: `temp-${Date.now()}` } as any);
      } else {
        state.items.push({ ...itemData, id: `temp-${Date.now()}` } as any);
      }
    },
    updateItem: (state, action: PayloadAction<{ index: number; data: Partial<PurchaseInvoiceItem> }>) => {
      state.items[action.payload.index] = { ...state.items[action.payload.index], ...action.payload.data };
    },
    removeItem: (state, action: PayloadAction<number>) => {
      state.items.splice(action.payload, 1);
    },
    setTotals: (state, action: PayloadAction<{ subtotal: number; discount: number; tax: number; grandTotal: number }>) => {
      state.totals = action.payload;
    },
    resetForm: (state) => {
      state.form = {
        supplier_id: 0,
        supplier_name: '',
        party_type: 'supplier',
        voucher_date: new Date().toISOString().split('T')[0],
        reference: '',
        narration: '',
        discount_rate: 0,
        discount_amount: 0,
      };
      state.items = [];
      state.totals = { subtotal: 0, discount: 0, tax: 0, grandTotal: 0 };
    },
    setSavedInvoices: (state, action: PayloadAction<any[]>) => {
      state.savedInvoices = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const {
  setPurchaseMode,
  setPurchaseCurrentVoucherId,
  setPurchaseCurrentVoucherNo,
  setPurchaseCreatedByName,
  setPurchaseHasUnsavedChanges,
  setPurchaseNavigationData,
  setSupplier,
  setVoucherDate,
  setReference,
  setNarration,
  setDiscountRate,
  setDiscountAmount,
  addItem,
  updateItem,
  removeItem,
  setTotals,
  resetForm,
  setSavedInvoices,
  setLoading,
} = purchaseInvoiceSlice.actions;

export interface AllocationData {
  invoice_id: string;
  amount: number;
}

export interface PaymentItem {
  id?: string;
  description: string;
  account_id?: number;
  amount: number;
  tax_rate: number;
  remarks?: string;
  allocations?: AllocationData[];
}

export interface PaymentState extends VoucherNavigationState {
  currentVoucherNo?: string;
  created_by_name?: string;
  form: {
    account_id: number;
    account_name: string;
    voucher_date: string;
    payment_method: 'cash' | 'bank'; // Cash or Bank
    reference_number: string;
    narration: string;
    created_from_invoice_id: string | null;
  };
  items: PaymentItem[];
  loading: boolean;
  savedPayments: any[];
  totals: {
    subtotal: number;
    tax: number;
    grandTotal: number;
  };
}

const paymentInitialState: PaymentState = {
  ...initialNavigationState,
  currentVoucherNo: undefined,
  created_by_name: undefined,
  form: {
    account_id: 0,
    account_name: '',
    voucher_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank',
    reference_number: '',
    narration: '',
    created_from_invoice_id: null,
  },
  items: [],
  loading: false,
  savedPayments: [],
  totals: {
    subtotal: 0,
    tax: 0,
    grandTotal: 0,
  },
};

const paymentSlice = createSlice({
  name: 'payment',
  initialState: paymentInitialState,
  reducers: {
    setPaymentMode: (state, action: PayloadAction<'new' | 'viewing' | 'editing'>) => {
      state.mode = action.payload;
    },
    setPaymentCurrentVoucherId: (state, action: PayloadAction<string | null>) => {
      state.currentVoucherId = action.payload;
    },
    setPaymentCurrentVoucherNo: (state, action: PayloadAction<string | undefined>) => {
      state.currentVoucherNo = action.payload;
    },
    setPaymentCreatedByName: (state, action: PayloadAction<string | undefined>) => {
      state.created_by_name = action.payload;
    },
    setPaymentHasUnsavedChanges: (state, action: PayloadAction<boolean>) => {
      state.hasUnsavedChanges = action.payload;
    },
    setPaymentNavigationData: (state, action: PayloadAction<{ hasPrevious: boolean; hasNext: boolean; previousId: string | null; nextId: string | null }>) => {
      state.navigationData = action.payload;
    },
    setPaymentAccount: (state, action: PayloadAction<{ id: number; name: string }>) => {
      state.form.account_id = action.payload.id;
      state.form.account_name = action.payload.name;
    },
    setPaymentDate: (state, action: PayloadAction<string>) => {
      state.form.voucher_date = action.payload;
    },
    setPaymentMethod: (state, action: PayloadAction<'cash' | 'bank'>) => {
      state.form.payment_method = action.payload;
    },
    setPaymentReference: (state, action: PayloadAction<string>) => {
      state.form.reference_number = action.payload;
    },
    setPaymentNarration: (state, action: PayloadAction<string>) => {
      state.form.narration = action.payload;
    },
    setPaymentCreatedFromInvoiceId: (state, action: PayloadAction<string | null>) => {
      state.form.created_from_invoice_id = action.payload;
    },
    addPaymentItem: (state, action: PayloadAction<PaymentItem & { insertAt?: number }>) => {
      const { insertAt, ...itemData } = action.payload as any;
      if (insertAt !== undefined) {
        state.items.splice(insertAt, 0, { ...itemData, id: `temp-${Date.now()}` } as any);
      } else {
        state.items.push({ ...itemData, id: `temp-${Date.now()}` } as any);
      }
    },
    updatePaymentItem: (state, action: PayloadAction<{ index: number; data: Partial<PaymentItem> }>) => {
      state.items[action.payload.index] = { ...state.items[action.payload.index], ...action.payload.data };
    },
    removePaymentItem: (state, action: PayloadAction<number>) => {
      state.items.splice(action.payload, 1);
    },
    setPaymentTotals: (state, action: PayloadAction<{ subtotal: number; tax: number; grandTotal: number }>) => {
      state.totals = action.payload;
    },
    resetPaymentForm: (state) => {
      state.form = {
        account_id: 0,
        account_name: '',
        voucher_date: new Date().toISOString().split('T')[0],
        payment_method: 'bank',
        reference_number: '',
        narration: '',
        created_from_invoice_id: null,
      };
      state.items = [];
      state.totals = { subtotal: 0, tax: 0, grandTotal: 0 };
    },
    setSavedPayments: (state, action: PayloadAction<any[]>) => {
      state.savedPayments = action.payload;
    },
    setPaymentLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

// ========== RECEIPT SLICE ==========
export interface ReceiptItem {
  id?: string;
  description: string;
  account_id?: number;
  amount: number;
  tax_rate: number;
  remarks?: string;
  allocations?: AllocationData[];
}

export interface ReceiptState extends VoucherNavigationState {
  currentVoucherNo?: string;
  created_by_name?: string;
  form: {
    account_id: number;
    account_name: string;
    voucher_date: string;
    receipt_method: 'cash' | 'bank'; // Cash or Bank
    reference_number: string;
    narration: string;
    created_from_invoice_id: string | null;
  };
  items: ReceiptItem[];
  loading: boolean;
  savedReceipts: any[];
  totals: {
    subtotal: number;
    tax: number;
    grandTotal: number;
  };
}

const receiptInitialState: ReceiptState = {
  ...initialNavigationState,
  currentVoucherNo: undefined,
  created_by_name: undefined,
  form: {
    account_id: 0,
    account_name: '',
    voucher_date: new Date().toISOString().split('T')[0],
    receipt_method: 'bank',
    reference_number: '',
    narration: '',
    created_from_invoice_id: null,
  },
  items: [],
  loading: false,
  savedReceipts: [],
  totals: {
    subtotal: 0,
    tax: 0,
    grandTotal: 0,
  },
};

const receiptSlice = createSlice({
  name: 'receipt',
  initialState: receiptInitialState,
  reducers: {
    setReceiptMode: (state, action: PayloadAction<'new' | 'viewing' | 'editing'>) => {
      state.mode = action.payload;
    },
    setReceiptCurrentVoucherId: (state, action: PayloadAction<string | null>) => {
      state.currentVoucherId = action.payload;
    },
    setReceiptCurrentVoucherNo: (state, action: PayloadAction<string | undefined>) => {
      state.currentVoucherNo = action.payload;
    },
    setReceiptCreatedByName: (state, action: PayloadAction<string | undefined>) => {
      state.created_by_name = action.payload;
    },
    setReceiptHasUnsavedChanges: (state, action: PayloadAction<boolean>) => {
      state.hasUnsavedChanges = action.payload;
    },
    setReceiptNavigationData: (state, action: PayloadAction<{ hasPrevious: boolean; hasNext: boolean; previousId: string | null; nextId: string | null }>) => {
      state.navigationData = action.payload;
    },
    setReceiptAccount: (state, action: PayloadAction<{ id: number; name: string }>) => {
      state.form.account_id = action.payload.id;
      state.form.account_name = action.payload.name;
    },
    setReceiptDate: (state, action: PayloadAction<string>) => {
      state.form.voucher_date = action.payload;
    },
    setReceiptMethod: (state, action: PayloadAction<'cash' | 'bank'>) => {
      state.form.receipt_method = action.payload;
    },
    setReceiptReference: (state, action: PayloadAction<string>) => {
      state.form.reference_number = action.payload;
    },
    setReceiptNarration: (state, action: PayloadAction<string>) => {
      state.form.narration = action.payload;
    },
    setReceiptCreatedFromInvoiceId: (state, action: PayloadAction<string | null>) => {
      state.form.created_from_invoice_id = action.payload;
    },
    addReceiptItem: (state, action: PayloadAction<ReceiptItem & { insertAt?: number }>) => {
      const { insertAt, ...itemData } = action.payload as any;
      if (insertAt !== undefined) {
        state.items.splice(insertAt, 0, { ...itemData, id: `temp-${Date.now()}` } as any);
      } else {
        state.items.push({ ...itemData, id: `temp-${Date.now()}` } as any);
      }
    },
    updateReceiptItem: (state, action: PayloadAction<{ index: number; data: Partial<ReceiptItem> }>) => {
      state.items[action.payload.index] = { ...state.items[action.payload.index], ...action.payload.data };
    },
    removeReceiptItem: (state, action: PayloadAction<number>) => {
      state.items.splice(action.payload, 1);
    },
    setReceiptTotals: (state, action: PayloadAction<{ subtotal: number; tax: number; grandTotal: number }>) => {
      state.totals = action.payload;
    },
    resetReceiptForm: (state) => {
      state.form = {
        account_id: 0,
        account_name: '',
        voucher_date: new Date().toISOString().split('T')[0],
        receipt_method: 'bank',
        reference_number: '',
        narration: '',
        created_from_invoice_id: null,
      };
      state.items = [];
      state.totals = { subtotal: 0, tax: 0, grandTotal: 0 };
    },
    setSavedReceipts: (state, action: PayloadAction<any[]>) => {
      state.savedReceipts = action.payload;
    },
    setReceiptLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const {
  setPaymentMode,
  setPaymentCurrentVoucherId,
  setPaymentCurrentVoucherNo,
  setPaymentCreatedByName,
  setPaymentHasUnsavedChanges,
  setPaymentNavigationData,
  setPaymentAccount,
  setPaymentDate,
  setPaymentMethod,
  setPaymentReference,
  setPaymentNarration,
  setPaymentCreatedFromInvoiceId,
  addPaymentItem,
  updatePaymentItem,
  removePaymentItem,
  setPaymentTotals,
  resetPaymentForm,
  setSavedPayments,
  setPaymentLoading,
} = paymentSlice.actions;

export const {
  setReceiptMode,
  setReceiptCurrentVoucherId,
  setReceiptCurrentVoucherNo,
  setReceiptCreatedByName,
  setReceiptHasUnsavedChanges,
  setReceiptNavigationData,
  setReceiptAccount,
  setReceiptDate,
  setReceiptMethod,
  setReceiptReference,
  setReceiptNarration,
  setReceiptCreatedFromInvoiceId,
  addReceiptItem,
  updateReceiptItem,
  removeReceiptItem,
  setReceiptTotals,
  resetReceiptForm,
  setSavedReceipts,
  setReceiptLoading,
} = receiptSlice.actions;

export const { toggleSidebar, setActiveSection, setActiveSectionWithParams } = appSlice.actions;

// ========== JOURNAL ENTRY SLICE ==========
export interface JournalEntryLine {
  id?: string;
  account_id: number;
  account_name: string;
  debit: number;
  credit: number;
  narration: string;
}

export interface JournalEntryState extends VoucherNavigationState {
  currentVoucherNo?: string;
  created_by_name?: string;
  form: {
    voucher_date: string;
    reference: string;
    narration: string;
  };
  lines: JournalEntryLine[];
  loading: boolean;
  savedEntries: any[];
  totals: {
    totalDebit: number;
    totalCredit: number;
    difference: number;
  };
}

const journalInitialState: JournalEntryState = {
  ...initialNavigationState,
  currentVoucherNo: undefined,
  created_by_name: undefined,
  form: {
    voucher_date: new Date().toISOString().split('T')[0],
    reference: '',
    narration: '',
  },
  lines: [],
  loading: false,
  savedEntries: [],
  totals: {
    totalDebit: 0,
    totalCredit: 0,
    difference: 0,
  },
};

const journalEntrySlice = createSlice({
  name: 'journalEntry',
  initialState: journalInitialState,
  reducers: {
    setJournalMode: (state, action: PayloadAction<'new' | 'viewing' | 'editing'>) => {
      state.mode = action.payload;
    },
    setJournalCurrentVoucherId: (state, action: PayloadAction<string | null>) => {
      state.currentVoucherId = action.payload;
    },
    setJournalCurrentVoucherNo: (state, action: PayloadAction<string | undefined>) => {
      state.currentVoucherNo = action.payload;
    },
    setJournalCreatedByName: (state, action: PayloadAction<string | undefined>) => {
      state.created_by_name = action.payload;
    },
    setJournalHasUnsavedChanges: (state, action: PayloadAction<boolean>) => {
      state.hasUnsavedChanges = action.payload;
    },
    setJournalNavigationData: (state, action: PayloadAction<{ hasPrevious: boolean; hasNext: boolean; previousId: string | null; nextId: string | null }>) => {
      state.navigationData = action.payload;
    },
    setJournalDate: (state, action: PayloadAction<string>) => {
      state.form.voucher_date = action.payload;
    },
    setJournalReference: (state, action: PayloadAction<string>) => {
      state.form.reference = action.payload;
    },
    setJournalNarration: (state, action: PayloadAction<string>) => {
      state.form.narration = action.payload;
    },
    setJournalLines: (state, action: PayloadAction<JournalEntryLine[]>) => {
      state.lines = action.payload.map(line => ({ ...line, id: line.id || `temp-${Date.now()}-${Math.random()}` }));
    },
    addJournalLine: (state, action: PayloadAction<JournalEntryLine & { insertAt?: number }>) => {
      const { insertAt, ...itemData } = action.payload as any;
      if (insertAt !== undefined) {
        state.lines.splice(insertAt, 0, { ...itemData, id: `temp-${Date.now()}` } as any);
      } else {
        state.lines.push({ ...itemData, id: `temp-${Date.now()}` } as any);
      }
    },
    updateJournalLine: (state, action: PayloadAction<{ index: number; data: Partial<JournalEntryLine> }>) => {
      state.lines[action.payload.index] = { ...state.lines[action.payload.index], ...action.payload.data };
    },
    removeJournalLine: (state, action: PayloadAction<number>) => {
      state.lines.splice(action.payload, 1);
    },
    setJournalTotals: (state, action: PayloadAction<{ totalDebit: number; totalCredit: number; difference: number }>) => {
      state.totals = action.payload;
    },
    resetJournalForm: (state) => {
      state.form = {
        voucher_date: new Date().toISOString().split('T')[0],
        reference: '',
        narration: '',
      };
      state.lines = [];
      state.totals = { totalDebit: 0, totalCredit: 0, difference: 0 };
    },
    setSavedJournalEntries: (state, action: PayloadAction<any[]>) => {
      state.savedEntries = action.payload;
    },
    setJournalLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const {
  setJournalMode,
  setJournalCurrentVoucherId,
  setJournalCurrentVoucherNo,
  setJournalCreatedByName,
  setJournalHasUnsavedChanges,
  setJournalNavigationData,
  setJournalDate,
  setJournalReference,
  setJournalNarration,
  setJournalLines,
  addJournalLine,
  updateJournalLine,
  removeJournalLine,
  setJournalTotals,
  resetJournalForm,
  setSavedJournalEntries,
  setJournalLoading,
} = journalEntrySlice.actions;

// ========== OPENING BALANCE SLICE ==========
export interface OpeningBalanceLine {
  id?: string;
  account_id: number;
  account_name: string;
  debit: number;
  credit: number;
  narration: string;
}

export interface OpeningBalanceState extends VoucherNavigationState {
  currentVoucherNo?: string;
  form: {
    voucher_date: string;
    reference: string;
    narration: string;
  };
  lines: OpeningBalanceLine[];
  loading: boolean;
  savedEntries: any[];
  totals: {
    totalDebit: number;
    totalCredit: number;
    difference: number;
  };
}

const openingBalanceInitialState: OpeningBalanceState = {
  ...initialNavigationState,
  currentVoucherNo: undefined,
  form: {
    voucher_date: new Date().toISOString().split('T')[0],
    reference: '',
    narration: '',
  },
  lines: [],
  loading: false,
  savedEntries: [],
  totals: {
    totalDebit: 0,
    totalCredit: 0,
    difference: 0,
  },
};

const openingBalanceSlice = createSlice({
  name: 'openingBalance',
  initialState: openingBalanceInitialState,
  reducers: {
    setOpeningBalanceMode: (state, action: PayloadAction<'new' | 'viewing' | 'editing'>) => {
      state.mode = action.payload;
    },
    setOpeningBalanceCurrentVoucherId: (state, action: PayloadAction<string | null>) => {
      state.currentVoucherId = action.payload;
    },
    setOpeningBalanceCurrentVoucherNo: (state, action: PayloadAction<string | undefined>) => {
      state.currentVoucherNo = action.payload;
    },
    setOpeningBalanceHasUnsavedChanges: (state, action: PayloadAction<boolean>) => {
      state.hasUnsavedChanges = action.payload;
    },
    setOpeningBalanceNavigationData: (state, action: PayloadAction<{ hasPrevious: boolean; hasNext: boolean; previousId: string | null; nextId: string | null }>) => {
      state.navigationData = action.payload;
    },
    setOpeningBalanceDate: (state, action: PayloadAction<string>) => {
      state.form.voucher_date = action.payload;
    },
    setOpeningBalanceReference: (state, action: PayloadAction<string>) => {
      state.form.reference = action.payload;
    },
    setOpeningBalanceNarration: (state, action: PayloadAction<string>) => {
      state.form.narration = action.payload;
    },
    addOpeningBalanceLine: (state, action: PayloadAction<OpeningBalanceLine & { insertAt?: number }>) => {
      const { insertAt, ...itemData } = action.payload as any;
      if (insertAt !== undefined) {
        state.lines.splice(insertAt, 0, { ...itemData, id: `temp-${Date.now()}` } as any);
      } else {
        state.lines.push({ ...itemData, id: `temp-${Date.now()}` } as any);
      }
    },
    updateOpeningBalanceLine: (state, action: PayloadAction<{ index: number; data: Partial<OpeningBalanceLine> }>) => {
      state.lines[action.payload.index] = { ...state.lines[action.payload.index], ...action.payload.data };
    },
    removeOpeningBalanceLine: (state, action: PayloadAction<number>) => {
      state.lines.splice(action.payload, 1);
    },
    setOpeningBalanceTotals: (state, action: PayloadAction<{ totalDebit: number; totalCredit: number; difference: number }>) => {
      state.totals = action.payload;
    },
    resetOpeningBalanceForm: (state) => {
      state.form = {
        voucher_date: new Date().toISOString().split('T')[0],
        reference: '',
        narration: '',
      };
      state.lines = [];
      state.totals = { totalDebit: 0, totalCredit: 0, difference: 0 };
    },
    setSavedOpeningBalances: (state, action: PayloadAction<any[]>) => {
      state.savedEntries = action.payload;
    },
    setOpeningBalanceLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const {
  setOpeningBalanceMode,
  setOpeningBalanceCurrentVoucherId,
  setOpeningBalanceCurrentVoucherNo,
  setOpeningBalanceHasUnsavedChanges,
  setOpeningBalanceNavigationData,
  setOpeningBalanceDate,
  setOpeningBalanceReference,
  setOpeningBalanceNarration,
  addOpeningBalanceLine,
  updateOpeningBalanceLine,
  removeOpeningBalanceLine,
  setOpeningBalanceTotals,
  resetOpeningBalanceForm,
  setSavedOpeningBalances,
  setOpeningBalanceLoading,
} = openingBalanceSlice.actions;

// ========== SALES INVOICE SLICE ==========
export interface SalesInvoiceItem {
  id?: string;
  product_id: number;
  product_name?: string;
  unit_id?: string;
  base_quantity?: number;
  original_amount?: number;
  invoice_discount_amount?: number;
  hsn_sac_code?: string;
  gst_slab_id?: string;
  resolved_gst_rate?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  description: string;
  initial_quantity: number;
  count: number;
  deduction_per_unit: number;
  rate: number;
  tax_rate: number;
  discount_percent: number;
  discount_amount: number;
}

export interface SalesInvoiceState extends VoucherNavigationState {
  currentVoucherNo?: string;
  created_by_name?: string;
  form: {
    customer_id: number;
    customer_name: string;
    salesperson_id: string | undefined;
    party_type: string;
    voucher_date: string;
    reference: string;
    narration: string;
    discount_rate: number;
    discount_amount: number;
  };
  items: SalesInvoiceItem[];
  loading: boolean;
  savedInvoices: any[];
  totals: {
    subtotal: number;
    discount: number;
    tax: number;
    grandTotal: number;
  };
  activeTabId: string;
  inactiveTabs: {
    id: string;
    title: string;
    state: Omit<SalesInvoiceState, 'activeTabId' | 'inactiveTabs'>;
  }[];
}

const salesInitialState: SalesInvoiceState = {
  ...initialNavigationState,
  currentVoucherNo: undefined,
  created_by_name: undefined,
  form: {
    customer_id: 0,
    customer_name: '',
    salesperson_id: undefined,
    party_type: 'customer',
    voucher_date: new Date().toISOString().split('T')[0],
    reference: '',
    narration: '',
    discount_rate: 0,
    discount_amount: 0,
  },
  items: [],
  loading: false,
  savedInvoices: [],
  totals: {
    subtotal: 0,
    discount: 0,
    tax: 0,
    grandTotal: 0,
  },
  activeTabId: `tab-1`,
  inactiveTabs: [],
};

const salesInvoiceSlice = createSlice({
  name: 'salesInvoice',
  initialState: salesInitialState,
  reducers: {
    setSalesMode: (state, action: PayloadAction<'new' | 'viewing' | 'editing'>) => {
      state.mode = action.payload;
    },
    setSalesCurrentVoucherId: (state, action: PayloadAction<string | null>) => {
      state.currentVoucherId = action.payload;
    },
    setSalesCurrentVoucherNo: (state, action: PayloadAction<string | undefined>) => {
      state.currentVoucherNo = action.payload;
    },
    setSalesCreatedByName: (state, action: PayloadAction<string | undefined>) => {
      state.created_by_name = action.payload;
    },
    setSalesHasUnsavedChanges: (state, action: PayloadAction<boolean>) => {
      state.hasUnsavedChanges = action.payload;
    },
    setSalesNavigationData: (state, action: PayloadAction<{ hasPrevious: boolean; hasNext: boolean; previousId: string | null; nextId: string | null }>) => {
      state.navigationData = action.payload;
    },
    setSalesCustomer: (state, action: PayloadAction<{ id: number; name: string; type?: string }>) => {
      state.form.customer_id = action.payload.id;
      state.form.customer_name = action.payload.name;
      state.form.party_type = action.payload.type || 'customer';
      state.hasUnsavedChanges = true;
    },
    setSalesSalespersonId: (state, action: PayloadAction<string | undefined>) => {
      state.form.salesperson_id = action.payload;
    },
    setSalesVoucherDate: (state, action: PayloadAction<string>) => {
      state.form.voucher_date = action.payload;
    },
    setSalesReference: (state, action: PayloadAction<string>) => {
      state.form.reference = action.payload;
    },
    setSalesNarration: (state, action: PayloadAction<string>) => {
      state.form.narration = action.payload;
    },
    setSalesDiscountRate: (state, action: PayloadAction<number>) => {
      state.form.discount_rate = action.payload;
    },
    setSalesDiscountAmount: (state, action: PayloadAction<number>) => {
      state.form.discount_amount = action.payload;
    },
    addSalesItem: (state, action: PayloadAction<SalesInvoiceItem & { insertAt?: number }>) => {
      const { insertAt, ...itemData } = action.payload as any;
      if (insertAt !== undefined) {
        state.items.splice(insertAt, 0, { ...itemData, id: `temp-${Date.now()}` } as any);
      } else {
        state.items.push({ ...itemData, id: `temp-${Date.now()}` } as any);
      }
    },
    updateSalesItem: (state, action: PayloadAction<{ index: number; data: Partial<SalesInvoiceItem> }>) => {
      state.items[action.payload.index] = { ...state.items[action.payload.index], ...action.payload.data };
    },
    removeSalesItem: (state, action: PayloadAction<number>) => {
      state.items.splice(action.payload, 1);
    },
    setSalesTotals: (state, action: PayloadAction<{ subtotal: number; discount: number; tax: number; grandTotal: number }>) => {
      state.totals = action.payload;
    },
    resetSalesForm: (state) => {
      state.form = {
        customer_id: 0,
        customer_name: '',
        salesperson_id: undefined,
        party_type: 'customer',
        voucher_date: new Date().toISOString().split('T')[0],
        reference: '',
        narration: '',
        discount_rate: 0,
        discount_amount: 0,
      };
      state.items = [];
      state.totals = { subtotal: 0, discount: 0, tax: 0, grandTotal: 0 };
    },
    setSavedSalesInvoices: (state, action: PayloadAction<any[]>) => {
      state.savedInvoices = action.payload;
    },
    setSalesLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    createNewSalesTab: (state) => {
      const currentTabState = {
         mode: state.mode,
         currentVoucherId: state.currentVoucherId,
         hasUnsavedChanges: state.hasUnsavedChanges,
         navigationData: state.navigationData,
         currentVoucherNo: state.currentVoucherNo,
         created_by_name: state.created_by_name,
         form: state.form,
         items: state.items,
         loading: state.loading,
         savedInvoices: state.savedInvoices,
         totals: state.totals,
      };
      
      let title = "New Invoice";
      if (state.form.customer_name) {
        title = state.form.customer_name;
      }
      if (state.currentVoucherNo) {
        title = state.currentVoucherNo;
      }
      
      state.inactiveTabs.push({
        id: state.activeTabId,
        title,
        state: currentTabState as any
      });
      
      const newActiveId = `tab-${Date.now()}`;
      Object.assign(state, {
        ...salesInitialState,
        activeTabId: newActiveId,
        inactiveTabs: state.inactiveTabs
      });
    },
    switchSalesTab: (state, action: PayloadAction<string>) => {
      const targetTabId = action.payload;
      if (targetTabId === state.activeTabId) return;
      
      const targetIndex = state.inactiveTabs.findIndex(t => t.id === targetTabId);
      if (targetIndex === -1) return;
      
      const currentTabState = {
         mode: state.mode,
         currentVoucherId: state.currentVoucherId,
         hasUnsavedChanges: state.hasUnsavedChanges,
         navigationData: state.navigationData,
         currentVoucherNo: state.currentVoucherNo,
         created_by_name: state.created_by_name,
         form: state.form,
         items: state.items,
         loading: state.loading,
         savedInvoices: state.savedInvoices,
         totals: state.totals,
      };
      
      let title = "New Invoice";
      if (state.form.customer_name) {
        title = state.form.customer_name;
      }
      if (state.currentVoucherNo) {
        title = state.currentVoucherNo;
      }
      
      const targetTab = state.inactiveTabs[targetIndex];
      state.inactiveTabs.splice(targetIndex, 1);
      
      state.inactiveTabs.push({
        id: state.activeTabId,
        title,
        state: currentTabState as any
      });
      
      // We apply the target tab state without altering activeTabId and inactiveTabs directly yet
      Object.assign(state, targetTab.state);
      state.activeTabId = targetTab.id;
    },
    closeSalesTab: (state, action: PayloadAction<string>) => {
      const tabId = action.payload;
      if (tabId === state.activeTabId) {
        if (state.inactiveTabs.length > 0) {
          const prevTab = state.inactiveTabs.pop()!;
          Object.assign(state, prevTab.state);
          state.activeTabId = prevTab.id;
        } else {
          const newActiveId = `tab-${Date.now()}`;
          Object.assign(state, salesInitialState);
          state.activeTabId = newActiveId;
          state.inactiveTabs = [];
        }
      } else {
        state.inactiveTabs = state.inactiveTabs.filter(t => t.id !== tabId);
      }
    },
  },
});

export const {
  setSalesMode,
  setSalesCurrentVoucherId,
  setSalesCurrentVoucherNo,
  setSalesCreatedByName,
  setSalesHasUnsavedChanges,
  setSalesNavigationData,
  setSalesCustomer,
  setSalesSalespersonId,
  setSalesVoucherDate,
  setSalesReference,
  setSalesNarration,
  setSalesDiscountRate,
  setSalesDiscountAmount,
  addSalesItem,
  updateSalesItem,
  removeSalesItem,
  setSalesTotals,
  resetSalesForm,
  setSavedSalesInvoices,
  setSalesLoading,
  createNewSalesTab,
  switchSalesTab,
  closeSalesTab,
} = salesInvoiceSlice.actions;

// ========== COMPANY PROFILE SLICE ==========
export interface CompanyProfileState {
  profile: {
    id: number;
    company_name: string;
    business_type: string;
    address_line1: string;
    address_line2: string;
    address_line3: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    phone: string;
    email: string;
    website: string;
    gstin: string;
    pan: string;
    cin: string;
    logo_data: string;
    bank_name: string;
    bank_account_no: string;
    bank_ifsc: string;
    bank_branch: string;
    terms_and_conditions: string;
  };
  loading: boolean;
}

const companyProfileInitialState: CompanyProfileState = {
  profile: {
    id: 1,
    company_name: '',
    business_type: '',
    address_line1: '',
    address_line2: '',
    address_line3: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    phone: '',
    email: '',
    website: '',
    gstin: '',
    pan: '',
    cin: '',
    logo_data: '',
    bank_name: '',
    bank_account_no: '',
    bank_ifsc: '',
    bank_branch: '',
    terms_and_conditions: '',
  },
  loading: false,
};

const companyProfileSlice = createSlice({
  name: 'companyProfile',
  initialState: companyProfileInitialState,
  reducers: {
    setCompanyProfile: (state, action: PayloadAction<Partial<CompanyProfileState['profile']>>) => {
      state.profile = { ...state.profile, ...action.payload };
    },
    updateCompanyField: (state, action: PayloadAction<{ field: keyof CompanyProfileState['profile']; value: string }>) => {
      state.profile[action.payload.field] = action.payload.value as never;
    },
    setCompanyLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const {
  setCompanyProfile,
  updateCompanyField,
  setCompanyLoading,
} = companyProfileSlice.actions;

// ========== PURCHASE RETURN SLICE ==========
export interface PurchaseReturnItem {
  id?: string;
  product_id: number;
  product_name?: string;
  unit_id?: string;
  base_quantity?: number;
  original_amount?: number;
  invoice_discount_amount?: number;
  hsn_sac_code?: string;
  gst_slab_id?: string;
  resolved_gst_rate?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  description: string;
  initial_quantity: number;
  count: number;
  deduction_per_unit: number;
  rate: number;
  tax_rate: number;
  discount_percent: number;
  discount_amount: number;
}

export interface PurchaseReturnState extends VoucherNavigationState {
  currentVoucherNo?: string;
  form: {
    supplier_id: number;
    supplier_name: string;
    party_type: string;
    voucher_date: string;
    reference: string;
    narration: string;
    discount_rate: number;
    discount_amount: number;
  };
  items: PurchaseReturnItem[];
  loading: boolean;
  savedReturns: any[];
  totals: {
    subtotal: number;
    discount: number;
    tax: number;
    grandTotal: number;
  };
}

const purchaseReturnInitialState: PurchaseReturnState = {
  ...initialNavigationState,
  currentVoucherNo: undefined,
  form: {
    supplier_id: 0,
    supplier_name: '',
    party_type: 'supplier',
    voucher_date: new Date().toISOString().split('T')[0],
    reference: '',
    narration: '',
    discount_rate: 0,
    discount_amount: 0,
  },
  items: [],
  loading: false,
  savedReturns: [],
  totals: {
    subtotal: 0,
    discount: 0,
    tax: 0,
    grandTotal: 0,
  },
};

const purchaseReturnSlice = createSlice({
  name: 'purchaseReturn',
  initialState: purchaseReturnInitialState,
  reducers: {
    setPurchaseReturnMode: (state, action: PayloadAction<'new' | 'viewing' | 'editing'>) => {
      state.mode = action.payload;
    },
    setPurchaseReturnCurrentVoucherId: (state, action: PayloadAction<string | null>) => {
      state.currentVoucherId = action.payload;
    },
    setPurchaseReturnCurrentVoucherNo: (state, action: PayloadAction<string | undefined>) => {
      state.currentVoucherNo = action.payload;
    },
    setPurchaseReturnHasUnsavedChanges: (state, action: PayloadAction<boolean>) => {
      state.hasUnsavedChanges = action.payload;
    },
    setPurchaseReturnNavigationData: (state, action: PayloadAction<{ hasPrevious: boolean; hasNext: boolean; previousId: string | null; nextId: string | null }>) => {
      state.navigationData = action.payload;
    },
    setPurchaseReturnSupplier: (state, action: PayloadAction<{ id: number; name: string; type?: string }>) => {
      state.form.supplier_id = action.payload.id;
      state.form.supplier_name = action.payload.name;
      state.form.party_type = action.payload.type || 'supplier';
      state.hasUnsavedChanges = true;
    },
    setPurchaseReturnVoucherDate: (state, action: PayloadAction<string>) => {
      state.form.voucher_date = action.payload;
    },
    setPurchaseReturnReference: (state, action: PayloadAction<string>) => {
      state.form.reference = action.payload;
    },
    setPurchaseReturnNarration: (state, action: PayloadAction<string>) => {
      state.form.narration = action.payload;
    },
    setPurchaseReturnDiscountRate: (state, action: PayloadAction<number>) => {
      state.form.discount_rate = action.payload;
    },
    setPurchaseReturnDiscountAmount: (state, action: PayloadAction<number>) => {
      state.form.discount_amount = action.payload;
    },
    addPurchaseReturnItem: (state, action: PayloadAction<PurchaseReturnItem & { insertAt?: number }>) => {
      const { insertAt, ...itemData } = action.payload as any;
      if (insertAt !== undefined) {
        state.items.splice(insertAt, 0, { ...itemData, id: `temp-${Date.now()}` } as any);
      } else {
        state.items.push({ ...itemData, id: `temp-${Date.now()}` } as any);
      }
    },
    updatePurchaseReturnItem: (state, action: PayloadAction<{ index: number; data: Partial<PurchaseReturnItem> }>) => {
      state.items[action.payload.index] = { ...state.items[action.payload.index], ...action.payload.data };
    },
    removePurchaseReturnItem: (state, action: PayloadAction<number>) => {
      state.items.splice(action.payload, 1);
    },
    setPurchaseReturnTotals: (state, action: PayloadAction<{ subtotal: number; discount: number; tax: number; grandTotal: number }>) => {
      state.totals = action.payload;
    },
    resetPurchaseReturnForm: (state) => {
      state.form = {
        supplier_id: 0,
        supplier_name: '',
        party_type: 'supplier',
        voucher_date: new Date().toISOString().split('T')[0],
        reference: '',
        narration: '',
        discount_rate: 0,
        discount_amount: 0,
      };
      state.items = [];
      state.totals = { subtotal: 0, discount: 0, tax: 0, grandTotal: 0 };
    },
    setSavedPurchaseReturns: (state, action: PayloadAction<any[]>) => {
      state.savedReturns = action.payload;
    },
    setPurchaseReturnLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const {
  setPurchaseReturnMode,
  setPurchaseReturnCurrentVoucherId,
  setPurchaseReturnCurrentVoucherNo,
  setPurchaseReturnHasUnsavedChanges,
  setPurchaseReturnNavigationData,
  setPurchaseReturnSupplier,
  setPurchaseReturnVoucherDate,
  setPurchaseReturnReference,
  setPurchaseReturnNarration,
  setPurchaseReturnDiscountRate,
  setPurchaseReturnDiscountAmount,
  addPurchaseReturnItem,
  updatePurchaseReturnItem,
  removePurchaseReturnItem,
  setPurchaseReturnTotals,
  resetPurchaseReturnForm,
  setSavedPurchaseReturns,
  setPurchaseReturnLoading,
} = purchaseReturnSlice.actions;

// ========== SALES RETURN SLICE ==========
export interface SalesReturnItem {
  id?: string;
  product_id: number;
  product_name?: string;
  unit_id?: string;
  base_quantity?: number;
  original_amount?: number;
  invoice_discount_amount?: number;
  hsn_sac_code?: string;
  gst_slab_id?: string;
  resolved_gst_rate?: number;
  cgst_rate?: number;
  sgst_rate?: number;
  igst_rate?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  description: string;
  initial_quantity: number;
  count: number;
  deduction_per_unit: number;
  rate: number;
  tax_rate: number;
  discount_percent: number;
  discount_amount: number;
}

export interface SalesReturnState extends VoucherNavigationState {
  currentVoucherNo?: string;
  form: {
    customer_id: number;
    customer_name: string;
    party_type: string;
    voucher_date: string;
    reference: string;
    narration: string;
    discount_rate: number;
    discount_amount: number;
  };
  items: SalesReturnItem[];
  loading: boolean;
  savedReturns: any[];
  totals: {
    subtotal: number;
    discount: number;
    tax: number;
    grandTotal: number;
  };
}

const salesReturnInitialState: SalesReturnState = {
  ...initialNavigationState,
  currentVoucherNo: undefined,
  form: {
    customer_id: 0,
    customer_name: '',
    party_type: 'customer',
    voucher_date: new Date().toISOString().split('T')[0],
    reference: '',
    narration: '',
    discount_rate: 0,
    discount_amount: 0,
  },
  items: [],
  loading: false,
  savedReturns: [],
  totals: {
    subtotal: 0,
    discount: 0,
    tax: 0,
    grandTotal: 0,
  },
};

const salesReturnSlice = createSlice({
  name: 'salesReturn',
  initialState: salesReturnInitialState,
  reducers: {
    setSalesReturnMode: (state, action: PayloadAction<'new' | 'viewing' | 'editing'>) => {
      state.mode = action.payload;
    },
    setSalesReturnCurrentVoucherId: (state, action: PayloadAction<string | null>) => {
      state.currentVoucherId = action.payload;
    },
    setSalesReturnCurrentVoucherNo: (state, action: PayloadAction<string | undefined>) => {
      state.currentVoucherNo = action.payload;
    },
    setSalesReturnHasUnsavedChanges: (state, action: PayloadAction<boolean>) => {
      state.hasUnsavedChanges = action.payload;
    },
    setSalesReturnNavigationData: (state, action: PayloadAction<{ hasPrevious: boolean; hasNext: boolean; previousId: string | null; nextId: string | null }>) => {
      state.navigationData = action.payload;
    },
    setSalesReturnCustomer: (state, action: PayloadAction<{ id: number; name: string; type?: string }>) => {
      state.form.customer_id = action.payload.id;
      state.form.customer_name = action.payload.name;
      state.form.party_type = action.payload.type || 'customer';
      state.hasUnsavedChanges = true;
    },
    setSalesReturnVoucherDate: (state, action: PayloadAction<string>) => {
      state.form.voucher_date = action.payload;
    },
    setSalesReturnReference: (state, action: PayloadAction<string>) => {
      state.form.reference = action.payload;
    },
    setSalesReturnNarration: (state, action: PayloadAction<string>) => {
      state.form.narration = action.payload;
    },
    setSalesReturnDiscountRate: (state, action: PayloadAction<number>) => {
      state.form.discount_rate = action.payload;
    },
    setSalesReturnDiscountAmount: (state, action: PayloadAction<number>) => {
      state.form.discount_amount = action.payload;
    },
    addSalesReturnItem: (state, action: PayloadAction<SalesReturnItem & { insertAt?: number }>) => {
      const { insertAt, ...itemData } = action.payload as any;
      if (insertAt !== undefined) {
        state.items.splice(insertAt, 0, { ...itemData, id: `temp-${Date.now()}` } as any);
      } else {
        state.items.push({ ...itemData, id: `temp-${Date.now()}` } as any);
      }
    },
    updateSalesReturnItem: (state, action: PayloadAction<{ index: number; data: Partial<SalesReturnItem> }>) => {
      state.items[action.payload.index] = { ...state.items[action.payload.index], ...action.payload.data };
    },
    removeSalesReturnItem: (state, action: PayloadAction<number>) => {
      state.items.splice(action.payload, 1);
    },
    setSalesReturnTotals: (state, action: PayloadAction<{ subtotal: number; discount: number; tax: number; grandTotal: number }>) => {
      state.totals = action.payload;
    },
    resetSalesReturnForm: (state) => {
      state.form = {
        customer_id: 0,
        customer_name: '',
        party_type: 'customer',
        voucher_date: new Date().toISOString().split('T')[0],
        reference: '',
        narration: '',
        discount_rate: 0,
        discount_amount: 0,
      };
      state.items = [];
      state.totals = { subtotal: 0, discount: 0, tax: 0, grandTotal: 0 };
    },
    setSavedSalesReturns: (state, action: PayloadAction<any[]>) => {
      state.savedReturns = action.payload;
    },
    setSalesReturnLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const {
  setSalesReturnMode,
  setSalesReturnCurrentVoucherId,
  setSalesReturnCurrentVoucherNo,
  setSalesReturnHasUnsavedChanges,
  setSalesReturnNavigationData,
  setSalesReturnCustomer,
  setSalesReturnVoucherDate,
  setSalesReturnReference,
  setSalesReturnNarration,
  setSalesReturnDiscountRate,
  setSalesReturnDiscountAmount,
  addSalesReturnItem,
  updateSalesReturnItem,
  removeSalesReturnItem,
  setSalesReturnTotals,
  resetSalesReturnForm,
  setSavedSalesReturns,
  setSalesReturnLoading,
} = salesReturnSlice.actions;

// ========== OPENING STOCK SLICE ==========
export interface OpeningStockItem {
  id?: string;
  product_id: string;
  product_name?: string;
  unit_id?: string;
  base_quantity?: number;
  description: string;
  initial_quantity: number;  // Quantity shown in form
  quantity: number;           // Quantity for calculations
  rate: number;
  amount: number;
}

export interface OpeningStockState extends VoucherNavigationState {
  currentVoucherNo?: string;
  created_by_name?: string;
  form: {
    voucher_date: string;
    narration: string;
  };
  items: OpeningStockItem[];
  loading: boolean;
  savedStocks: any[];
  totalAmount: number;
}

const openingStockInitialState: OpeningStockState = {
  ...initialNavigationState,
  currentVoucherNo: undefined,
  created_by_name: undefined,
  form: {
    voucher_date: new Date().toISOString().split('T')[0],
    narration: '',
  },
  items: [],
  loading: false,
  savedStocks: [],
  totalAmount: 0,
};

const openingStockSlice = createSlice({
  name: 'openingStock',
  initialState: openingStockInitialState,
  reducers: {
    setOpeningStockMode: (state, action: PayloadAction<'new' | 'viewing' | 'editing'>) => {
      state.mode = action.payload;
    },
    setOpeningStockCurrentVoucherId: (state, action: PayloadAction<string | null>) => {
      state.currentVoucherId = action.payload;
    },
    setOpeningStockCurrentVoucherNo: (state, action: PayloadAction<string | undefined>) => {
      state.currentVoucherNo = action.payload;
    },
    setOpeningStockCreatedByName: (state, action: PayloadAction<string | undefined>) => {
      state.created_by_name = action.payload;
    },
    setOpeningStockHasUnsavedChanges: (state, action: PayloadAction<boolean>) => {
      state.hasUnsavedChanges = action.payload;
    },
    setOpeningStockNavigationData: (state, action: PayloadAction<{ hasPrevious: boolean; hasNext: boolean; previousId: string | null; nextId: string | null }>) => {
      state.navigationData = action.payload;
    },
    setOpeningStockDate: (state, action: PayloadAction<string>) => {
      state.form.voucher_date = action.payload;
    },
    setOpeningStockNarration: (state, action: PayloadAction<string>) => {
      state.form.narration = action.payload;
    },
    addOpeningStockItem: (state, action: PayloadAction<OpeningStockItem & { insertAt?: number }>) => {
      const { insertAt, ...itemData } = action.payload as any;
      if (insertAt !== undefined) {
        state.items.splice(insertAt, 0, { ...itemData, id: `temp-${Date.now()}` } as any);
      } else {
        state.items.push({ ...itemData, id: `temp-${Date.now()}` } as any);
      }
    },
    updateOpeningStockItem: (state, action: PayloadAction<{ index: number; data: Partial<OpeningStockItem> }>) => {
      state.items[action.payload.index] = { ...state.items[action.payload.index], ...action.payload.data };
    },
    removeOpeningStockItem: (state, action: PayloadAction<number>) => {
      state.items.splice(action.payload, 1);
    },
    setOpeningStockTotal: (state, action: PayloadAction<number>) => {
      state.totalAmount = action.payload;
    },
    resetOpeningStockForm: (state) => {
      state.form = {
        voucher_date: new Date().toISOString().split('T')[0],
        narration: '',
      };
      state.items = [];
      state.totalAmount = 0;
    },
    setSavedOpeningStocks: (state, action: PayloadAction<any[]>) => {
      state.savedStocks = action.payload;
    },
    setOpeningStockLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const {
  setOpeningStockMode,
  setOpeningStockCurrentVoucherId,
  setOpeningStockCurrentVoucherNo,
  setOpeningStockCreatedByName,
  setOpeningStockHasUnsavedChanges,
  setOpeningStockNavigationData,
  setOpeningStockDate,
  setOpeningStockNarration,
  addOpeningStockItem,
  updateOpeningStockItem,
  removeOpeningStockItem,
  setOpeningStockTotal,
  resetOpeningStockForm,
  setSavedOpeningStocks,
  setOpeningStockLoading,
} = openingStockSlice.actions;

// ========== STOCK JOURNAL SLICE ==========
export interface StockJournalItem {
  id?: string;
  product_id: string;
  product_name?: string;
  unit_id?: string;
  base_quantity?: number;
  description: string;
  initial_quantity: number;
  quantity: number;
  rate: number;
  amount: number;
}

export interface StockJournalState extends VoucherNavigationState {
  currentVoucherNo?: string;
  created_by_name?: string;
  form: {
    voucher_date: string;
    narration: string;
  };
  sourceItems: StockJournalItem[];
  destinationItems: StockJournalItem[];
  loading: boolean;
  totals: {
    sourceAmount: number;
    destinationAmount: number;
    difference: number;
  };
}

const stockJournalInitialState: StockJournalState = {
  ...initialNavigationState,
  currentVoucherNo: undefined,
  created_by_name: undefined,
  form: {
    voucher_date: new Date().toISOString().split('T')[0],
    narration: '',
  },
  sourceItems: [],
  destinationItems: [],
  loading: false,
  totals: {
    sourceAmount: 0,
    destinationAmount: 0,
    difference: 0,
  },
};

const stockJournalSlice = createSlice({
  name: 'stockJournal',
  initialState: stockJournalInitialState,
  reducers: {
    setStockJournalMode: (state, action: PayloadAction<'new' | 'viewing' | 'editing'>) => {
      state.mode = action.payload;
    },
    setStockJournalCurrentVoucherId: (state, action: PayloadAction<string | null>) => {
      state.currentVoucherId = action.payload;
    },
    setStockJournalCurrentVoucherNo: (state, action: PayloadAction<string | undefined>) => {
      state.currentVoucherNo = action.payload;
    },
    setStockJournalCreatedByName: (state, action: PayloadAction<string | undefined>) => {
      state.created_by_name = action.payload;
    },
    setStockJournalHasUnsavedChanges: (state, action: PayloadAction<boolean>) => {
      state.hasUnsavedChanges = action.payload;
    },
    setStockJournalNavigationData: (state, action: PayloadAction<{ hasPrevious: boolean; hasNext: boolean; previousId: string | null; nextId: string | null }>) => {
      state.navigationData = action.payload;
    },
    setStockJournalDate: (state, action: PayloadAction<string>) => {
      state.form.voucher_date = action.payload;
    },
    setStockJournalNarration: (state, action: PayloadAction<string>) => {
      state.form.narration = action.payload;
    },
    addStockJournalSourceItem: (state, action: PayloadAction<StockJournalItem & { insertAt?: number }>) => {
      const { insertAt, ...itemData } = action.payload as any;
      if (insertAt !== undefined) {
        state.sourceItems.splice(insertAt, 0, { ...itemData, id: `temp-${Date.now()}` } as any);
      } else {
        state.sourceItems.push({ ...itemData, id: `temp-${Date.now()}` } as any);
      }
    },
    updateStockJournalSourceItem: (state, action: PayloadAction<{ index: number; data: Partial<StockJournalItem> }>) => {
      state.sourceItems[action.payload.index] = { ...state.sourceItems[action.payload.index], ...action.payload.data };
    },
    removeStockJournalSourceItem: (state, action: PayloadAction<number>) => {
      state.sourceItems.splice(action.payload, 1);
    },
    setStockJournalSourceItems: (state, action: PayloadAction<StockJournalItem[]>) => {
      state.sourceItems = action.payload.map(item => ({ ...item, id: item.id || `temp-${Date.now()}-${Math.random()}` }));
    },
    addStockJournalDestinationItem: (state, action: PayloadAction<StockJournalItem & { insertAt?: number }>) => {
      const { insertAt, ...itemData } = action.payload as any;
      if (insertAt !== undefined) {
        state.destinationItems.splice(insertAt, 0, { ...itemData, id: `temp-${Date.now()}` } as any);
      } else {
        state.destinationItems.push({ ...itemData, id: `temp-${Date.now()}` } as any);
      }
    },
    updateStockJournalDestinationItem: (state, action: PayloadAction<{ index: number; data: Partial<StockJournalItem> }>) => {
      state.destinationItems[action.payload.index] = { ...state.destinationItems[action.payload.index], ...action.payload.data };
    },
    removeStockJournalDestinationItem: (state, action: PayloadAction<number>) => {
      state.destinationItems.splice(action.payload, 1);
    },
    setStockJournalDestinationItems: (state, action: PayloadAction<StockJournalItem[]>) => {
      state.destinationItems = action.payload.map(item => ({ ...item, id: item.id || `temp-${Date.now()}-${Math.random()}` }));
    },
    setStockJournalTotals: (state, action: PayloadAction<{ sourceAmount: number; destinationAmount: number; difference: number }>) => {
      state.totals = action.payload;
    },
    resetStockJournalForm: (state) => {
      state.form = {
        voucher_date: new Date().toISOString().split('T')[0],
        narration: '',
      };
      state.sourceItems = [];
      state.destinationItems = [];
      state.totals = {
        sourceAmount: 0,
        destinationAmount: 0,
        difference: 0,
      };
    },
    setStockJournalLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
  },
});

export const {
  setStockJournalMode,
  setStockJournalCurrentVoucherId,
  setStockJournalCurrentVoucherNo,
  setStockJournalCreatedByName,
  setStockJournalHasUnsavedChanges,
  setStockJournalNavigationData,
  setStockJournalDate,
  setStockJournalNarration,
  addStockJournalSourceItem,
  updateStockJournalSourceItem,
  removeStockJournalSourceItem,
  setStockJournalSourceItems,
  addStockJournalDestinationItem,
  updateStockJournalDestinationItem,
  removeStockJournalDestinationItem,
  setStockJournalDestinationItems,
  setStockJournalTotals,
  resetStockJournalForm,
  setStockJournalLoading,
} = stockJournalSlice.actions;


export const store = configureStore({
  reducer: {
    app: appSlice.reducer,
    auth: authSlice.reducer,
    purchaseInvoice: purchaseInvoiceSlice.reducer,
    purchaseReturn: purchaseReturnSlice.reducer,
    salesInvoice: salesInvoiceSlice.reducer,
    salesReturn: salesReturnSlice.reducer,
    payment: paymentSlice.reducer,
    receipt: receiptSlice.reducer,
    journalEntry: journalEntrySlice.reducer,
    openingBalance: openingBalanceSlice.reducer,
    openingStock: openingStockSlice.reducer,
    stockJournal: stockJournalSlice.reducer,
    companyProfile: companyProfileSlice.reducer,
  },
});



export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
