import { invoke } from '@tauri-apps/api/core';

export interface Product {
  id: number;
  name: string;
  sku: string;
  price: number;
  stock: number;
  created_at: string;
}

export interface CreateProduct {
  name: string;
  sku: string;
  price: number;
  stock: number;
}

export const api = {
  products: {
    list: () => invoke<Product[]>('get_products'),
    create: (data: CreateProduct) => invoke<Product>('create_product', { product: data }),
    update: (id: number, data: CreateProduct) => invoke<void>('update_product', { id, product: data }),
    delete: (id: number) => invoke<void>('delete_product', { id }),
  },
};