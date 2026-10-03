import { Product, Category } from '../types';
import { ApiResponse, apiGet, apiPost, apiPatch, apiDelete } from './api';

/** Row shape returned by the local API (all money in integer paise). */
interface ProductRow {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  brand: string;
  category_id: string;
  category: string;
  unit: string;
  selling_price_paise: number;
  purchase_price_paise: number;
  mrp_paise: number;
  wholesale_price_paise: number;
  gst_rate: number;
  hsn_code: string;
  image: string | null;
  min_stock: number;
  batch_tracked: number;
  is_active: number;
  stock: number;
}

interface ProductListPayload {
  items: ProductRow[];
  total: number;
  page: number;
  page_size: number;
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
  if (row.stock <= 0) return 'OUT_OF_STOCK';
  if (row.min_stock > 0 && row.stock <= row.min_stock) return 'LOW_STOCK';
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
  'sku', 'name', 'barcode', 'brand', 'categoryId', 'categoryName', 'unit', 'hsn',
  'gstRate', 'purchasePrice', 'sellingPrice', 'mrp', 'wholesalePrice', 'minStock',
  'image', 'batchTracked',
];

const MONEY_FIELDS = new Set(['purchasePrice', 'sellingPrice', 'mrp', 'wholesalePrice']);
const FIELD_MAP: Record<string, string> = {
  sku: 'sku',
  name: 'name',
  barcode: 'barcode',
  brand: 'brand',
  categoryId: 'category_id',
  categoryName: 'category',
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
async function fetchProducts(params: Record<string, string | number | boolean | undefined> = {}): Promise<Product[]> {
  const res = await apiGet<ProductListPayload>('/products', {
    page: 1,
    page_size: 500,
    ...params,
  });
  return res.data.items.map(rowToProduct);
}

export const productsService = {
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
