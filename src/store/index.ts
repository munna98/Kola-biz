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
  };
  items: PurchaseInvoiceItem[];
  loading: boolean;
  savedInvoices: any[];
  totals: {
    subtotal: number;
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
  },
  items: [],
  loading: false,
  savedInvoices: [],
  totals: {
    subtotal: 0,
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
    addItem: (state, action: PayloadAction<PurchaseInvoiceItem>) => {
      state.items.push({ ...action.payload, id: `temp-${Date.now()}` });
    },
    updateItem: (state, action: PayloadAction<{ index: number; data: Partial<PurchaseInvoiceItem> }>) => {
      state.items[action.payload.index] = { ...state.items[action.payload.index], ...action.payload.data };
    },
    removeItem: (state, action: PayloadAction<number>) => {
      state.items.splice(action.payload, 1);
    },
    setTotals: (state, action: PayloadAction<{ subtotal: number; tax: number; grandTotal: number }>) => {
      state.totals = action.payload;
    },
    resetForm: (state) => {
      state.form = {
        supplier_id: 0,
        supplier_name: '',
        voucher_date: new Date().toISOString().split('T')[0],
        reference: '',
        narration: '',
      };
      state.items = [];
      state.totals = { subtotal: 0, tax: 0, grandTotal: 0 };
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

export const store = configureStore({
  reducer: {
    app: appSlice.reducer,
    purchaseInvoice: purchaseInvoiceSlice.reducer,
    payment: paymentSlice.reducer,
    receipt: receiptSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;