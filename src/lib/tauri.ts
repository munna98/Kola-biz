import { invoke } from '@tauri-apps/api/core';

export interface Unit {
  id: number;
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
}

export interface CreateSupplier {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

export const api = {
  units: {
    list: () => invoke<Unit[]>('get_units'),
  },
  products: {
    list: () => invoke<Product[]>('get_products'),
    create: (data: CreateProduct) => invoke<Product>('create_product', { product: data }),
    update: (id: number, data: CreateProduct) => invoke<void>('update_product', { id, product: data }),
    delete: (id: number, deletedBy: string) => invoke<void>('delete_product', { id, deletedBy }),
  },
  customers: {
    list: () => invoke<Customer[]>('get_customers'),
    create: (data: CreateCustomer) => invoke<Customer>('create_customer', { customer: data }),
    update: (id: number, data: CreateCustomer) => invoke<void>('update_customer', { id, customer: data }),
    delete: (id: number) => invoke<void>('delete_customer', { id }),
  },
  suppliers: {
    list: () => invoke<Supplier[]>('get_suppliers'),
    create: (data: CreateSupplier) => invoke<Supplier>('create_supplier', { supplier: data }),
    update: (id: number, data: CreateSupplier) => invoke<void>('update_supplier', { id, supplier: data }),
    delete: (id: number) => invoke<void>('delete_supplier', { id }),
  },
};