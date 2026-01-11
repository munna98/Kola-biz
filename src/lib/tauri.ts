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

export interface ProductGroup {
  id: number;
  name: string;
  description?: string;
  is_active: number;
  created_at: string;
}

export interface CreateProductGroup {
  name: string;
  description?: string;
}

export interface Product {
  id: number;
  code: string;
  name: string;
  group_id?: number;
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
  group_id?: number;
  unit_id: number;
  purchase_rate: number;
  sales_rate: number;
  mrp: number;
}

export interface Customer {
  id: number;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  is_active: number;
  created_at: string;
}

export interface CreateCustomer {
  code?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  is_active: number;
  created_at: string;
}

export interface CreateSupplier {
  code?: string;
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

export interface CreateSalesInvoiceItem {
  product_id: number;
  description: string;
  count: number;
  deduction_per_unit: number;
  rate: number;
  tax_rate: number;
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
  id: number;
  customer_id: number;
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
    getNextCode: () => invoke<string>('get_next_product_code'),
  },
  productGroups: {
    list: () => invoke<ProductGroup[]>('get_product_groups'),
    create: (data: CreateProductGroup) => invoke<ProductGroup>('create_product_group', { group: data }),
    update: (id: number, data: CreateProductGroup) => invoke<void>('update_product_group', { id, group: data }),
    delete: (id: number) => invoke<void>('delete_product_group', { id }),
  },
  customers: {
    list: () => invoke<Customer[]>('get_customers'),
    listDeleted: () => invoke<Customer[]>('get_deleted_customers'),
    create: (data: CreateCustomer) => invoke<Customer>('create_customer', { customer: data }),
    update: (id: number, data: CreateCustomer) => invoke<void>('update_customer', { id, customer: data }),
    delete: (id: number) => invoke<void>('delete_customer', { id }),
    restore: (id: number) => invoke<void>('restore_customer', { id }),
    hardDelete: (id: number) => invoke<void>('hard_delete_customer', { id }),
    getNextCode: () => invoke<string>('get_next_customer_code'),
  },
  suppliers: {
    list: () => invoke<Supplier[]>('get_suppliers'),
    listDeleted: () => invoke<Supplier[]>('get_deleted_suppliers'),
    create: (data: CreateSupplier) => invoke<Supplier>('create_supplier', { supplier: data }),
    update: (id: number, data: CreateSupplier) => invoke<void>('update_supplier', { id, supplier: data }),
    delete: (id: number) => invoke<void>('delete_supplier', { id }),
    restore: (id: number) => invoke<void>('restore_supplier', { id }),
    hardDelete: (id: number) => invoke<void>('hard_delete_supplier', { id }),
    getNextCode: () => invoke<string>('get_next_supplier_code'),
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
  employees: {
    list: () => invoke<Employee[]>('get_employees'),
    create: (data: CreateEmployee) => invoke<void>('create_employee', { data }),
    update: (data: UpdateEmployee) => invoke<void>('update_employee', { data }),
    delete: (id: string) => invoke<void>('delete_employee', { id }),
  },
  users: {
    list: () => invoke<User[]>('get_users'),
    create: (data: any) => invoke<void>('create_user', data), // Flat args still
    update: (data: UpdateUser) => invoke<void>('update_user', { data }),
    delete: (id: string) => invoke<void>('delete_user', { id }),
    resetPassword: (data: ResetPassword) => invoke<void>('reset_user_password', { data }),
  },
};

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