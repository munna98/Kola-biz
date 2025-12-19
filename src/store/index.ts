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

export const { toggleSidebar, setActiveSection } = appSlice.actions;

export const store = configureStore({
  reducer: {
    app: appSlice.reducer,
    purchaseInvoice: purchaseInvoiceSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;