import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AppState {
  sidebarCollapsed: boolean;
  activeSection: string;
  currentUser: string;
}

const initialState: AppState = {
  sidebarCollapsed: false,
  activeSection: 'products',
  currentUser: 'Admin',
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setActiveSection: (state, action: PayloadAction<string>) => {
      state.activeSection = action.payload;
    },
  },
});

// ========== PURCHASE INVOICE SLICE ==========
export interface PurchaseInvoiceItem {
  id?: string;
  product_id: number;
  product_name?: string;
  description: string;
  initial_quantity: number; 
  count: number;
  deduction_per_unit: number;
  rate: number;
  tax_rate: number;
}

export interface PurchaseInvoiceState {
  form: {
    supplier_id: number;
    supplier_name: string;
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
  form: {
    supplier_id: 0,
    supplier_name: '',
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
    setSupplier: (state, action: PayloadAction<{ id: number; name: string }>) => {
      state.form.supplier_id = action.payload.id;
      state.form.supplier_name = action.payload.name;
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
    addItem: (state, action: PayloadAction<PurchaseInvoiceItem>) => {
      state.items.push({ ...action.payload, id: `temp-${Date.now()}` });
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

// ========== PAYMENT SLICE ==========
export interface PaymentItem {
  id?: string;
  description: string;
  amount: number;
  tax_rate: number;
}

export interface PaymentState {
  form: {
    account_id: number;
    account_name: string;
    voucher_date: string;
    payment_method: 'cash' | 'bank'; // Cash or Bank
    reference_number: string;
    narration: string;
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
  form: {
    account_id: 0,
    account_name: '',
    voucher_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank',
    reference_number: '',
    narration: '',
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
    addPaymentItem: (state, action: PayloadAction<PaymentItem>) => {
      state.items.push({ ...action.payload, id: `temp-${Date.now()}` });
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
  amount: number;
  tax_rate: number;
}

export interface ReceiptState {
  form: {
    account_id: number;
    account_name: string;
    voucher_date: string;
    receipt_method: 'cash' | 'bank'; // Cash or Bank
    reference_number: string;
    narration: string;
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
  form: {
    account_id: 0,
    account_name: '',
    voucher_date: new Date().toISOString().split('T')[0],
    receipt_method: 'bank',
    reference_number: '',
    narration: '',
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
    addReceiptItem: (state, action: PayloadAction<ReceiptItem>) => {
      state.items.push({ ...action.payload, id: `temp-${Date.now()}` });
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
  setPaymentAccount,
  setPaymentDate,
  setPaymentMethod,
  setPaymentReference,
  setPaymentNarration,
  addPaymentItem,
  updatePaymentItem,
  removePaymentItem,
  setPaymentTotals,
  resetPaymentForm,
  setSavedPayments,
  setPaymentLoading,
} = paymentSlice.actions;

export const {
  setReceiptAccount,
  setReceiptDate,
  setReceiptMethod,
  setReceiptReference,
  setReceiptNarration,
  addReceiptItem,
  updateReceiptItem,
  removeReceiptItem,
  setReceiptTotals,
  resetReceiptForm,
  setSavedReceipts,
  setReceiptLoading,
} = receiptSlice.actions;

export const { toggleSidebar, setActiveSection } = appSlice.actions;

// ========== JOURNAL ENTRY SLICE ==========
export interface JournalEntryLine {
  id?: string;
  account_id: number;
  account_name: string;
  debit: number;
  credit: number;
  narration: string;
}

export interface JournalEntryState {
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
    setJournalDate: (state, action: PayloadAction<string>) => {
      state.form.voucher_date = action.payload;
    },
    setJournalReference: (state, action: PayloadAction<string>) => {
      state.form.reference = action.payload;
    },
    setJournalNarration: (state, action: PayloadAction<string>) => {
      state.form.narration = action.payload;
    },
    addJournalLine: (state, action: PayloadAction<JournalEntryLine>) => {
      state.lines.push({ ...action.payload, id: `temp-${Date.now()}` });
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
  setJournalDate,
  setJournalReference,
  setJournalNarration,
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

export interface OpeningBalanceState {
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
    setOpeningBalanceDate: (state, action: PayloadAction<string>) => {
      state.form.voucher_date = action.payload;
    },
    setOpeningBalanceReference: (state, action: PayloadAction<string>) => {
      state.form.reference = action.payload;
    },
    setOpeningBalanceNarration: (state, action: PayloadAction<string>) => {
      state.form.narration = action.payload;
    },
    addOpeningBalanceLine: (state, action: PayloadAction<OpeningBalanceLine>) => {
      state.lines.push({ ...action.payload, id: `temp-${Date.now()}` });
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

export const store = configureStore({
  reducer: {
    app: appSlice.reducer,
    purchaseInvoice: purchaseInvoiceSlice.reducer,
    payment: paymentSlice.reducer,
    receipt: receiptSlice.reducer,
    journalEntry: journalEntrySlice.reducer,
    openingBalance: openingBalanceSlice.reducer,
  },
});



export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;