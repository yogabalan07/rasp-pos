import { Product, Category } from '../types';
import { INITIAL_PRODUCTS, INITIAL_CATEGORIES } from '../data/mockData';
import { delay, createResponse, ApiResponse } from './api';

let products: Product[] = [...INITIAL_PRODUCTS];
const categories: Category[] = [...INITIAL_CATEGORIES];

export const productsService = {
  async getAll(): Promise<ApiResponse<Product[]>> {
    await delay();
    return createResponse([...products]);
  },

  async getCategories(): Promise<ApiResponse<Category[]>> {
    await delay();
    return createResponse([...categories]);
  },

  async search(query: string, categoryId?: string): Promise<ApiResponse<Product[]>> {
    await delay(30);
    const q = query.trim().toLowerCase();
    const filtered = products.filter(p => {
      const matchesCategory = !categoryId || categoryId === 'cat-all' || p.categoryId === categoryId;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q)
      );
    });
    return createResponse(filtered);
  },

  async getById(id: string): Promise<ApiResponse<Product | null>> {
    await delay();
    const product = products.find(p => p.id === id) || null;
    return createResponse(product);
  },

  async create(newProduct: Omit<Product, 'id'>): Promise<ApiResponse<Product>> {
    await delay();
    const product: Product = {
      ...newProduct,
      id: `prod-${Date.now()}`,
    };
    products.unshift(product);
    return createResponse(product, 'Product created successfully');
  },

  async update(id: string, updates: Partial<Product>): Promise<ApiResponse<Product>> {
    await delay();
    const index = products.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error(`Product ${id} not found`);
    }
    products[index] = { ...products[index], ...updates };
    return createResponse(products[index], 'Product updated successfully');
  },

  async delete(id: string): Promise<ApiResponse<boolean>> {
    await delay();
    products = products.filter(p => p.id !== id);
    return createResponse(true, 'Product deleted successfully');
  },

  async updateStock(id: string, delta: number): Promise<void> {
    const product = products.find(p => p.id === id);
    if (product) {
      product.stock = Math.max(0, product.stock + delta);
      if (product.stock === 0) product.status = 'OUT_OF_STOCK';
      else if (product.stock <= product.minStock) product.status = 'LOW_STOCK';
      else product.status = 'ACTIVE';
    }
  }
};
