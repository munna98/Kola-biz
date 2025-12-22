import { invoke } from '@tauri-apps/api/core';

export interface Unit {
  id: number;
  name: string;
  symbol: string;
  created_at: string;
}

export interface CreateUnit {
  name: string;
  symbol: string;
}

export interface Product {
  id: number;
  code: string;
  name: string;
  unit_id: number;
  purchase_rate: number;
  sales_rate: number;
  mrp: number;
  is_active: number;
  created_at: string;
}

export interface CreateProduct {
  code: string;
  name: string;
  unit_id: number;
  purchase_rate: number;
  sales_rate: number;
  mrp: number;
}

export interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  is_active: number;
  created_at: string;
}

export interface CreateCustomer {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface Supplier {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  is_active: number;
  created_at: string;
}

export interface CreateSupplier {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface ChartOfAccount {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  account_group: string;
  description?: string;
  opening_balance: number;
  opening_balance_type: string;
  is_active: number;
  created_at: string;
  updated_at: string;
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
  id: number;
  name: string;
  account_type: string;
  is_active: number;
  created_at: string;
}

export interface CreateAccountGroup {
  name: string;
  account_type: string;
}

export interface SalesInvoiceItem {
  product_id: number;
  product_name?: string;
  description: string;
  initial_quantity: number;
  count: number;
  deduction_per_unit: number;
  rate: number;
  tax_rate: number;
}

export interface CreateSalesInvoice {
  customer_id: number;
  voucher_date: string;
  reference?: string;
  narration?: string;
  discount_rate?: number;
  discount_amount?: number;
  items: SalesInvoiceItem[];
}

export interface SalesInvoice {
  id: number;
  customer_id: number;
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
}

export const api = {
  units: {
    list: () => invoke<Unit[]>('get_units'),
    create: (data: CreateUnit) => invoke<Unit>('create_unit', { unit: data }),
    update: (id: number, data: CreateUnit) => invoke<void>('update_unit', { id, unit: data }),
    delete: (id: number) => invoke<void>('delete_unit', { id }),
  },
  products: {
    list: () => invoke<Product[]>('get_products'),
    listDeleted: () => invoke<Product[]>('get_deleted_products'),
    create: (data: CreateProduct) => invoke<Product>('create_product', { product: data }),
    update: (id: number, data: CreateProduct) => invoke<void>('update_product', { id, product: data }),
    delete: (id: number, deletedBy: string) => invoke<void>('delete_product', { id, deletedBy }),
    restore: (id: number) => invoke<void>('restore_product', { id }),
    hardDelete: (id: number) => invoke<void>('hard_delete_product', { id }),
  },
  customers: {
    list: () => invoke<Customer[]>('get_customers'),
    listDeleted: () => invoke<Customer[]>('get_deleted_customers'),
    create: (data: CreateCustomer) => invoke<Customer>('create_customer', { customer: data }),
    update: (id: number, data: CreateCustomer) => invoke<void>('update_customer', { id, customer: data }),
    delete: (id: number) => invoke<void>('delete_customer', { id }),
    restore: (id: number) => invoke<void>('restore_customer', { id }),
    hardDelete: (id: number) => invoke<void>('hard_delete_customer', { id }),
  },
  suppliers: {
    list: () => invoke<Supplier[]>('get_suppliers'),
    listDeleted: () => invoke<Supplier[]>('get_deleted_suppliers'),
    create: (data: CreateSupplier) => invoke<Supplier>('create_supplier', { supplier: data }),
    update: (id: number, data: CreateSupplier) => invoke<void>('update_supplier', { id, supplier: data }),
    delete: (id: number) => invoke<void>('delete_supplier', { id }),
    restore: (id: number) => invoke<void>('restore_supplier', { id }),
    hardDelete: (id: number) => invoke<void>('hard_delete_supplier', { id }),
  },
  chartOfAccounts: {
    list: () => invoke<ChartOfAccount[]>('get_chart_of_accounts'),
    listDeleted: () => invoke<ChartOfAccount[]>('get_deleted_chart_of_accounts'),
    create: (data: CreateChartOfAccount) => invoke<ChartOfAccount>('create_chart_of_account', { account: data }),
    update: (id: number, data: CreateChartOfAccount) => invoke<void>('update_chart_of_account', { id, account: data }),
    delete: (id: number) => invoke<void>('delete_chart_of_account', { id }),
    restore: (id: number) => invoke<void>('restore_chart_of_account', { id }),
    hardDelete: (id: number) => invoke<void>('hard_delete_chart_of_account', { id }),
    getTypes: () => invoke<string[]>('get_account_types'),
    getGroups: () => invoke<string[]>('get_account_groups'),
  },
  accountGroups: {
    list: () => invoke<AccountGroup[]>('get_all_account_groups'),
    create: (data: CreateAccountGroup) => invoke<AccountGroup>('create_account_group', { group: data }),
    delete: (id: number) => invoke<void>('delete_account_group', { id }),
  },
};