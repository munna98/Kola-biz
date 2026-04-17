import { invoke } from '@tauri-apps/api/core';

// ======= UNITS =======

export interface Unit {
  id: string;
  name: string;
  symbol: string;
  is_default: number;
  created_at: string;
}

export interface CreateUnit {
  name: string;
  symbol: string;
  is_default?: boolean;
}

// ======= PRODUCT GROUPS =======

export interface ProductGroup {
  id: string;
  name: string;
  description?: string;
  is_active: number;
  created_at: string;
}

export interface CreateProductGroup {
  name: string;
  description?: string;
}

// ======= GST TYPES =======

export interface GstTaxSlab {
  id: string;
  name: string;
  is_dynamic: number;
  fixed_rate: number;
  threshold: number;
  below_rate: number;
  above_rate: number;
  is_active: number;
  created_at: string;
}

export interface CreateGstTaxSlab {
  name: string;
  is_dynamic: boolean;
  fixed_rate?: number;
  threshold?: number;
  below_rate?: number;
  above_rate?: number;
}

export interface GstSettings {
  gst_enabled: boolean;
  gst_registration_type: string;
  composition_rate: number;
}

export interface GstSummaryRow {
  hsn_sac_code: string;
  gst_rate: number;
  taxable_value: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_tax: number;
  total_value: number;
}

export interface Gstr3bSummary {
  outward_taxable: number;
  outward_cgst: number;
  outward_sgst: number;
  outward_igst: number;
  inward_taxable: number;
  inward_cgst: number;
  inward_sgst: number;
  inward_igst: number;
  net_cgst: number;
  net_sgst: number;
  net_igst: number;
}

// ======= PRODUCTS =======

export interface Product {
  id: string;
  code: string;
  name: string;
  group_id?: string;
  unit_id: string;
  purchase_rate: number;
  sales_rate: number;
  mrp: number;
  is_active: number;
  created_at: string;
  has_transactions: boolean;
  hsn_sac_code?: string;
  gst_slab_id?: string;
}

export interface ProductUnitConversion {
  id: string;
  product_id: string;
  unit_id: string;
  factor_to_base: number;
  purchase_rate: number;
  sales_rate: number;
  is_default_sale: number;
  is_default_purchase: number;
  is_default_report: number;
  unit_name: string;
  unit_symbol: string;
}

export interface CreateProductUnitConversion {
  unit_id: string;
  factor_to_base: number;
  purchase_rate: number;
  sales_rate: number;
  is_default_sale: boolean;
  is_default_purchase: boolean;
  is_default_report: boolean;
}

export interface CreateProduct {
  code: string;
  name: string;
  group_id?: string;
  unit_id: string;
  purchase_rate: number;
  sales_rate: number;
  mrp: number;
  conversions?: CreateProductUnitConversion[];
  hsn_sac_code?: string;
  gst_slab_id?: string;
}

// ======= PARTIES =======

export interface Customer {
  id: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  address_line_1?: string;
  address_line_2?: string;
  address_line_3?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  gstin?: string;
  is_active: number;
  created_at: string;
}

export interface CreateCustomer {
  code?: string;
  name: string;
  email?: string;
  phone?: string;
  address_line_1?: string;
  address_line_2?: string;
  address_line_3?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  gstin?: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  address_line_1?: string;
  address_line_2?: string;
  address_line_3?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  gstin?: string;
  is_active: number;
  created_at: string;
}

export interface CreateSupplier {
  code?: string;
  name: string;
  email?: string;
  phone?: string;
  address_line_1?: string;
  address_line_2?: string;
  address_line_3?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  gstin?: string;
}

// ======= CHART OF ACCOUNTS =======

export interface ChartOfAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  account_group: string;
  description?: string;
  opening_balance: number;
  opening_balance_type: string;
  party_id?: string;
  is_active: number;
  is_system: number;
  created_at: string;
  deleted_at?: string;
  created_by_name?: string;
}

export interface CreateChartOfAccount {
  account_code: string;
  account_name: string;
  account_type: string;
  account_group: string;
  description?: string;
  opening_balance?: number;
  opening_balance_type?: string;
}

export interface AccountGroup {
  id: string;
  name: string;
  account_type: string;
  is_active: number;
  created_at: string;
}

export interface CreateAccountGroup {
  name: string;
  account_type: string;
}

// ======= INVOICES =======

export interface CreateSalesInvoiceItem {
  product_id: string;
  description: string;
  count: number;
  deduction_per_unit: number;
  rate: number;
  tax_rate: number;
}

export interface SalesInvoiceItem {
  product_id: string;
  product_name?: string;
  description: string;
  initial_quantity: number;
  count: number;
  deduction_per_unit: number;
  rate: number;
  tax_rate: number;
}

export interface CreateSalesInvoice {
  customer_id: string;
  salesperson_id?: string;
  voucher_date: string;
  reference?: string;
  narration?: string;
  discount_rate?: number;
  discount_amount?: number;
  items: CreateSalesInvoiceItem[];
  user_id?: string;
  created_by?: string;
}

export interface SalesInvoice {
  id: string;
  customer_id: string;
  salesperson_id?: string;
  voucher_number: string;
  voucher_date: string;
  reference?: string;
  narration?: string;
  discount_rate?: number;
  discount_amount?: number;
  subtotal: number;
  tax: number;
  grand_total: number;
  created_at: string;
  created_by_name?: string;
}

// ======= EMPLOYEES / USERS =======

export interface Employee {
  id: string;
  user_id?: string;
  account_id?: string;
  code?: string;
  name: string;
  designation?: string;
  phone?: string;
  email?: string;
  address?: string;
  joining_date?: string;
  status: string;
  created_at: string;
}

export interface CreateEmployee {
  code?: string;
  name: string;
  designation?: string;
  phone?: string;
  email?: string;
  address?: string;
  joining_date?: string;
  create_user: boolean;
  username?: string;
  password?: string;
  role?: string;
}

export interface UpdateEmployee {
  id: string;
  code?: string;
  name: string;
  designation?: string;
  phone?: string;
  email?: string;
  address?: string;
  joining_date?: string;
  status: string;
  create_user: boolean;
  username?: string;
  password?: string;
  role?: string;
}

export interface User {
  id: string;
  username: string;
  fullName?: string;
  role: string;
  isActive: boolean;
}

export interface UpdateUser {
  id: string;
  fullName: string;
  role: string;
  isActive: boolean;
}

export interface ResetPassword {
  id: string;
  password: string;
}

// ======= API =======

export const api = {
  units: {
    list: () => invoke<Unit[]>('get_units'),
    create: (data: CreateUnit) => invoke<Unit>('create_unit', { unit: data }),
    update: (id: string, data: CreateUnit) => invoke<void>('update_unit', { id, unit: data }),
    delete: (id: string) => invoke<void>('delete_unit', { id }),
  },
  products: {
    list: () => invoke<Product[]>('get_products'),
    listUnitConversions: (productId: string) => invoke<ProductUnitConversion[]>('get_product_unit_conversions', { productId }),
    listAllUnitConversions: () => invoke<ProductUnitConversion[]>('get_all_product_unit_conversions'),
    listDeleted: () => invoke<Product[]>('get_deleted_products'),
    create: (data: CreateProduct) => invoke<Product>('create_product', { product: data }),
    update: (id: string, data: CreateProduct) => invoke<void>('update_product', { id, product: data }),
    delete: (id: string, deletedBy: string) => invoke<void>('delete_product', { id, deletedBy }),
    restore: (id: string) => invoke<void>('restore_product', { id }),
    hardDelete: (id: string) => invoke<void>('hard_delete_product', { id }),
    getNextCode: () => invoke<string>('get_next_product_code'),
  },
  productGroups: {
    list: () => invoke<ProductGroup[]>('get_product_groups'),
    create: (data: CreateProductGroup) => invoke<ProductGroup>('create_product_group', { group: data }),
    update: (id: string, data: CreateProductGroup) => invoke<void>('update_product_group', { id, group: data }),
    delete: (id: string) => invoke<void>('delete_product_group', { id }),
  },
  customers: {
    list: () => invoke<Customer[]>('get_customers'),
    listDeleted: () => invoke<Customer[]>('get_deleted_customers'),
    create: (data: CreateCustomer) => invoke<Customer>('create_customer', { customer: data }),
    update: (id: string, data: CreateCustomer) => invoke<void>('update_customer', { id, customer: data }),
    delete: (id: string) => invoke<void>('delete_customer', { id }),
    restore: (id: string) => invoke<void>('restore_customer', { id }),
    hardDelete: (id: string) => invoke<void>('hard_delete_customer', { id }),
    getNextCode: () => invoke<string>('get_next_customer_code'),
  },
  suppliers: {
    list: () => invoke<Supplier[]>('get_suppliers'),
    listDeleted: () => invoke<Supplier[]>('get_deleted_suppliers'),
    create: (data: CreateSupplier) => invoke<Supplier>('create_supplier', { supplier: data }),
    update: (id: string, data: CreateSupplier) => invoke<void>('update_supplier', { id, supplier: data }),
    delete: (id: string) => invoke<void>('delete_supplier', { id }),
    restore: (id: string) => invoke<void>('restore_supplier', { id }),
    hardDelete: (id: string) => invoke<void>('hard_delete_supplier', { id }),
    getNextCode: () => invoke<string>('get_next_supplier_code'),
  },
  chartOfAccounts: {
    list: () => invoke<ChartOfAccount[]>('get_chart_of_accounts'),
    listDeleted: () => invoke<ChartOfAccount[]>('get_deleted_chart_of_accounts'),
    create: (data: CreateChartOfAccount) => invoke<ChartOfAccount>('create_chart_of_account', { account: data }),
    update: (id: string, data: CreateChartOfAccount) => invoke<void>('update_chart_of_account', { id, account: data }),
    delete: (id: string) => invoke<void>('delete_chart_of_account', { id }),
    restore: (id: string) => invoke<void>('restore_chart_of_account', { id }),
    hardDelete: (id: string) => invoke<void>('hard_delete_chart_of_account', { id }),
    getTypes: () => invoke<string[]>('get_account_types'),
    getGroups: () => invoke<string[]>('get_account_groups'),
  },
  accountGroups: {
    list: () => invoke<AccountGroup[]>('get_all_account_groups'),
    create: (data: CreateAccountGroup) => invoke<AccountGroup>('create_account_group', { group: data }),
    delete: (id: string) => invoke<void>('delete_account_group', { id }),
  },
  employees: {
    list: () => invoke<Employee[]>('get_employees'),
    create: (data: CreateEmployee) => invoke<void>('create_employee', { data }),
    update: (data: UpdateEmployee) => invoke<void>('update_employee', { data }),
    delete: (id: string) => invoke<void>('delete_employee', { id }),
  },
  users: {
    list: () => invoke<User[]>('get_users'),
    create: (data: any) => invoke<void>('create_user', data),
    update: (data: UpdateUser) => invoke<void>('update_user', { data }),
    delete: (id: string) => invoke<void>('delete_user', { id }),
    resetPassword: (data: ResetPassword) => invoke<void>('reset_user_password', { data }),
  },
  gst: {
    getSlabs: () => invoke<GstTaxSlab[]>('get_gst_tax_slabs'),
    createSlab: (slab: CreateGstTaxSlab) => invoke<GstTaxSlab>('create_gst_tax_slab', { slab }),
    updateSlab: (id: string, slab: CreateGstTaxSlab) => invoke<void>('update_gst_tax_slab', { id, slab }),
    deleteSlab: (id: string) => invoke<void>('delete_gst_tax_slab', { id }),
    getSettings: () => invoke<GstSettings>('get_gst_settings'),
    saveSettings: (settings: GstSettings) => invoke<void>('save_gst_settings', { settings }),
    getGstr1: (fromDate: string, toDate: string) => invoke<GstSummaryRow[]>('get_gstr1_summary', { fromDate, toDate }),
    getGstr3b: (fromDate: string, toDate: string) => invoke<Gstr3bSummary>('get_gstr3b_summary', { fromDate, toDate }),
  },
};
