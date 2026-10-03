import { Product, Category } from '../types';
import { ApiResponse, apiGet, apiPost, apiPut, apiPatch, apiDelete } from './api';

/** Row shape returned by the local API (all money in integer paise). */
interface ProductRow {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string;
  category_id: string;
  category: string;
  subcategory: string;
  unit: string;
  selling_price_paise: number;
  purchase_price_paise: number;
  mrp_paise: number;
  wholesale_price_paise: number;
  gst_rate: number;
  hsn_code: string;
  image: string | null;
  min_stock: number;
  reorder_level: number;
  batch_tracked: number;
  is_active: number;
  created_by?: string | null;
  updated_by?: string | null;
  stock: number;
  stock_status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  is_low_stock: boolean;
}

export interface ProductPage {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface ProductQuery {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  sku?: string;
  barcode?: string;
  isActive?: boolean;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

interface ProductListPayload {
  items: ProductRow[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  item_count: number;
}

const rupees = (paise: number): number => paise / 100;
const paise = (rupeeValue: number): number => Math.round(rupeeValue * 100);

function deriveStatus(row: ProductRow): Product['status'] {
  if (!row.is_active) return 'INACTIVE';
  // The server owns the stock-status rule — never re-derive it here.
  if (row.stock_status === 'OUT_OF_STOCK') return 'OUT_OF_STOCK';
  if (row.stock_status === 'LOW_STOCK') return 'LOW_STOCK';
  return 'ACTIVE';
}

export function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode || '',
    brand: row.brand || '',
    categoryId: row.category_id,
    categoryName: row.category,
    subcategory: row.subcategory || '',
    unit: row.unit,
    hsn: row.hsn_code,
    gstRate: row.gst_rate,
    purchasePrice: rupees(row.purchase_price_paise),
    sellingPrice: rupees(row.selling_price_paise),
    mrp: rupees(row.mrp_paise),
    wholesalePrice: rupees(row.wholesale_price_paise),
    stock: row.stock,
    minStock: row.min_stock,
    image: row.image || undefined,
    status: deriveStatus(row),
    batchTracked: !!row.batch_tracked,
  };
}

/** Fields the API accepts when creating a product. */
function toCreatePayload(product: Omit<Product, 'id'>) {
  return {
    sku: product.sku,
    name: product.name,
    barcode: product.barcode || null,
    brand: product.brand || '',
    category_id: product.categoryId || '',
    category: product.categoryName || '',
    subcategory: product.subcategory || '',
    unit: product.unit || 'Piece',
    selling_price_paise: paise(product.sellingPrice),
    purchase_price_paise: paise(product.purchasePrice || 0),
    mrp_paise: paise(product.mrp || product.sellingPrice),
    wholesale_price_paise: paise(product.wholesalePrice || 0),
    gst_rate: product.gstRate || 0,
    hsn_code: product.hsn || '',
    image: product.image ?? null,
    min_stock: product.minStock || 0,
    batch_tracked: product.batchTracked ? 1 : 0,
    stock: product.stock || 0,
  };
}

const UPDATABLE: (keyof Product)[] = [
  'sku', 'name', 'barcode', 'brand', 'categoryId', 'categoryName', 'subcategory',
  'unit', 'hsn', 'gstRate', 'purchasePrice', 'sellingPrice', 'mrp',
  'wholesalePrice', 'minStock', 'image', 'batchTracked',
];

const MONEY_FIELDS = new Set(['purchasePrice', 'sellingPrice', 'mrp', 'wholesalePrice']);
const FIELD_MAP: Record<string, string> = {
  sku: 'sku',
  name: 'name',
  barcode: 'barcode',
  brand: 'brand',
  categoryId: 'category_id',
  categoryName: 'category',
  subcategory: 'subcategory',
  unit: 'unit',
  hsn: 'hsn_code',
  gstRate: 'gst_rate',
  minStock: 'min_stock',
  image: 'image',
  batchTracked: 'batch_tracked',
};

function toUpdatePayload(updates: Partial<Product>) {
  const payload: Record<string, unknown> = {};
  for (const key of UPDATABLE) {
    if (!(key in updates)) continue;
    const value = (updates as Record<string, unknown>)[key];
    if (value === undefined) continue;
    const target = FIELD_MAP[key as string];
    if (!target) continue;
    if (MONEY_FIELDS.has(key)) {
      payload[target] = paise(Number(value));
    } else if (key === 'batchTracked') {
      payload[target] = value ? 1 : 0;
    } else {
      payload[target] = value;
    }
  }
  return payload;
}

/** Server-side catalogue search (single source of truth). */
async function fetchProducts(
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<Product[]> {
  const res = await apiGet<ProductListPayload>('/products', {
    page: 1,
    page_size: 500,
    ...params,
  });
  return res.data.items.map(rowToProduct);
}

function toQuery(
  query: ProductQuery,
): Record<string, string | number | boolean | undefined> {
  return {
    q: query.q,
    category: query.category && query.category !== 'cat-all' ? query.category : undefined,
    subcategory: query.subcategory,
    brand: query.brand,
    sku: query.sku,
    barcode: query.barcode,
    is_active: query.isActive,
    include_inactive: query.includeInactive ? true : undefined,
    page: query.page,
    page_size: query.pageSize,
  };
}

function pageOf(res: ApiResponse<ProductListPayload>): ApiResponse<ProductPage> {
  return {
    data: {
      items: res.data.items.map(rowToProduct),
      total: res.data.total,
      page: res.data.page,
      pageSize: res.data.page_size,
      pages: res.data.pages,
    },
    success: true,
    message: res.message,
    source: 'LOCAL_EDGE',
  };
}

export const productsService = {
  /** Server-paginated catalogue list (filters + `pages`). */
  async listPage(query: ProductQuery = {}): Promise<ApiResponse<ProductPage>> {
    return pageOf(await apiGet<ProductListPayload>('/products', toQuery(query)));
  },

  async getAll(): Promise<ApiResponse<Product[]>> {
    const items = await fetchProducts();
    return { data: items, success: true, source: 'LOCAL_EDGE' };
  },

  async getCategories(): Promise<ApiResponse<Category[]>> {
    const res = await apiGet<CategoryRow[]>('/products/categories');
    const total = res.data.reduce((acc, c) => acc + c.item_count, 0);
    const categories: Category[] = [
      { id: 'cat-all', name: 'All Products', slug: 'all', itemCount: total },
      ...res.data.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        itemCount: c.item_count,
      })),
    ];
    return { data: categories, success: true, source: 'LOCAL_EDGE' };
  },

  async getBrands(): Promise<ApiResponse<string[]>> {
    const res = await apiGet<{ name: string; item_count: number }[]>('/products/brands');
    return { data: res.data.map(b => b.name).filter(Boolean), success: true, source: 'LOCAL_EDGE' };
  },

  async getSubcategories(): Promise<ApiResponse<string[]>> {
    const res = await apiGet<{ name: string; item_count: number }[]>(
      '/products/subcategories',
    );
    return {
      data: res.data.map(s => s.name).filter(Boolean),
      success: true,
      source: 'LOCAL_EDGE',
    };
  },

  async search(query: string, categoryId?: string): Promise<ApiResponse<Product[]>> {
    const params: Record<string, string | number | boolean> = { q: query };
    if (categoryId && categoryId !== 'cat-all') params.category = categoryId;
    const items = await fetchProducts(params);
    return { data: items, success: true, source: 'LOCAL_EDGE' };
  },

  async getById(id: string): Promise<ApiResponse<Product | null>> {
    const res = await apiGet<ProductRow>(`/products/${encodeURIComponent(id)}`);
    return { data: rowToProduct(res.data), success: true, source: 'LOCAL_EDGE' };
  },

  async create(newProduct: Omit<Product, 'id'>): Promise<ApiResponse<Product>> {
    const res = await apiPost<ProductRow>('/products', toCreatePayload(newProduct));
    return {
      data: rowToProduct(res.data),
      success: true,
      message: res.message,
      source: 'LOCAL_EDGE',
    };
  },

  async update(id: string, updates: Partial<Product>): Promise<ApiResponse<Product>> {
    const res = await apiPatch<ProductRow>(
      `/products/${encodeURIComponent(id)}`,
      toUpdatePayload(updates),
    );
    return {
      data: rowToProduct(res.data),
      success: true,
      message: res.message,
      source: 'LOCAL_EDGE',
    };
  },

  /** Full replacement (`PUT`). Stock is owned by the inventory endpoints. */
  async replace(
    id: string,
    product: Omit<Product, 'id'>,
  ): Promise<ApiResponse<Product>> {
    const res = await apiPut<ProductRow>(
      `/products/${encodeURIComponent(id)}`,
      toCreatePayload(product),
    );
    return {
      data: rowToProduct(res.data),
      success: true,
      message: res.message,
      source: 'LOCAL_EDGE',
    };
  },

  async setStatus(
    id: string,
    isActive: boolean,
  ): Promise<ApiResponse<Product>> {
    const res = await apiPatch<ProductRow>(
      `/products/${encodeURIComponent(id)}/status`,
      { is_active: isActive },
    );
    return {
      data: rowToProduct(res.data),
      success: true,
      message: res.message,
      source: 'LOCAL_EDGE',
    };
  },

  async delete(id: string): Promise<ApiResponse<boolean>> {
    await apiDelete(`/products/${encodeURIComponent(id)}`);
    return { data: true, success: true, source: 'LOCAL_EDGE' };
  },

  /**
   * Audited stock delta against the local inventory table.
   * The server validates against negative stock — the client never clamps.
   */
  async updateStock(id: string, delta: number, reason?: string): Promise<void> {
    if (!delta) return;
    await apiPost(`/inventory/${encodeURIComponent(id)}/adjust`, {
      delta,
      reason: reason || (delta > 0 ? 'Stock received' : 'Stock reduced'),
      reason_code: 'ADJUSTMENT',
    });
  },
};
