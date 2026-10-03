import { BatchItem, StockMovement, Warehouse } from '../types';
import { INITIAL_BATCHES, INITIAL_WAREHOUSES } from '../data/mockData';
import { ApiResponse, apiGet, apiPost } from './api';

/**
 * TODO(phase-3): batch/expiry tracking and warehouse master data still have no
 * API on the Pi, so these two lists come from local mock data. Everything else
 * in this file reads/writes the real SQLite database.
 */
let batches: BatchItem[] = [...INITIAL_BATCHES];
let warehouses: Warehouse[] = [...INITIAL_WAREHOUSES];

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export type MovementType =
  | 'OPENING_STOCK'
  | 'SALE'
  | 'PURCHASE'
  | 'ADJUSTMENT'
  | 'RETURN';

export interface InventoryItem {
  productId: string;
  productName: string;
  sku: string;
  barcode: string | null;
  unit: string;
  category: string;
  subcategory: string;
  quantity: number;
  reorderLevel: number;
  stockStatus: StockStatus;
  isLowStock: boolean;
  isActive: boolean;
  sellingPricePaise: number;
  purchasePricePaise: number;
  costValuePaise: number;
  sellingValuePaise: number;
  openingRecorded: boolean;
  updatedAt: string;
}

export interface InventorySummary {
  skuCount: number;
  units: number;
  costValuePaise: number;
  sellingValuePaise: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  belowThreshold: number;
}

export interface InventoryPage {
  items: InventoryItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  summary: InventorySummary;
}

export interface MovementPage {
  items: StockMovement[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface InventoryQuery {
  q?: string;
  category?: string;
  stockStatus?: StockStatus;
  lowStockOnly?: boolean;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface MovementQuery {
  productId?: string;
  movementType?: MovementType;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

interface MovementRow {
  id: string;
  product_id: string;
  movement_type: MovementType;
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  balance_after: number;
  reason: string | null;
  created_at: string;
  product_name: string;
  sku: string;
  created_by_name: string | null;
}

interface InventoryRow {
  product_id: string;
  quantity: number;
  reserved_quantity: number;
  reorder_level: number;
  updated_at: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: string;
  subcategory: string;
  unit: string;
  min_stock: number;
  is_active: number;
  selling_price_paise: number;
  purchase_price_paise: number;
  stock: number;
  stock_status: StockStatus;
  is_low_stock: boolean;
  cost_value_paise: number;
  selling_value_paise: number;
  opening_recorded: number;
}

interface InventoryListMeta {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  summary: {
    sku_count: number;
    units: number;
    cost_value_paise: number;
    selling_value_paise: number;
    in_stock: number;
    low_stock: number;
    out_of_stock: number;
    below_threshold: number;
  };
}

interface MovementListMeta {
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/** Body returned by `/adjust` and `/opening-stock`. */
interface AdjustResult {
  product: InventoryRow;
  previous_quantity: number;
  adjustment: number;
  new_quantity: number;
  movement_id: string;
  quantity: number;
}

function rowToMovement(row: MovementRow): StockMovement {
  return {
    id: row.id,
    timestamp: row.created_at,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    type: row.movement_type,
    quantityDelta: row.quantity,
    previousStock: row.balance_after - row.quantity,
    newStock: row.balance_after,
    referenceId: row.reference_id || row.reference_type || row.movement_type,
    reason: row.reason || undefined,
    performedBy: row.created_by_name || 'System',
  };
}

function rowToInventory(row: InventoryRow): InventoryItem {
  return {
    productId: row.product_id,
    productName: row.name,
    sku: row.sku,
    barcode: row.barcode ?? null,
    unit: row.unit,
    category: row.category,
    subcategory: row.subcategory || '',
    quantity: row.quantity,
    reorderLevel: row.reorder_level,
    stockStatus: row.stock_status,
    isLowStock: row.is_low_stock,
    isActive: !!row.is_active,
    sellingPricePaise: row.selling_price_paise,
    purchasePricePaise: row.purchase_price_paise,
    costValuePaise: row.cost_value_paise,
    sellingValuePaise: row.selling_value_paise,
    openingRecorded: !!row.opening_recorded,
    updatedAt: row.updated_at,
  };
}

export const inventoryService = {
  /** TODO(phase-3): expiry/batch tracking is not modelled in any schema yet. */
  async getBatches(): Promise<ApiResponse<BatchItem[]>> {
    await new Promise(resolve => setTimeout(resolve, 30));
    return { data: [...batches], success: true, source: 'CACHE' };
  },

  /** TODO(phase-3): see getBatches(). */
  async getNearExpiryBatches(): Promise<ApiResponse<BatchItem[]>> {
    await new Promise(resolve => setTimeout(resolve, 30));
    return {
      data: batches.filter(b => b.status === 'NEAR_EXPIRY' || b.status === 'EXPIRED'),
      success: true,
      source: 'CACHE',
    };
  },

  /** Server-paginated stock list with per-row valuation + stock status. */
  async listPage(query: InventoryQuery = {}): Promise<ApiResponse<InventoryPage>> {
    const res = await apiGet<InventoryRow[]>('/inventory', {
      q: query.q,
      category: query.category && query.category !== 'cat-all' ? query.category : undefined,
      stock_status: query.stockStatus,
      low_stock_only: query.lowStockOnly ? true : undefined,
      is_active: query.isActive,
      page: query.page,
      page_size: query.pageSize,
    });
    const meta = (res.meta || {}) as unknown as InventoryListMeta;
    const summary = meta.summary;
    return {
      data: {
        items: (res.data || []).map(rowToInventory),
        total: meta.total ?? (res.data || []).length,
        page: meta.page ?? query.page ?? 1,
        pageSize: meta.page_size ?? query.pageSize ?? 100,
        pages: meta.pages ?? 1,
        summary: {
          skuCount: summary?.sku_count ?? 0,
          units: summary?.units ?? 0,
          costValuePaise: summary?.cost_value_paise ?? 0,
          sellingValuePaise: summary?.selling_value_paise ?? 0,
          inStock: summary?.in_stock ?? 0,
          lowStock: summary?.low_stock ?? 0,
          outOfStock: summary?.out_of_stock ?? 0,
          belowThreshold: summary?.below_threshold ?? 0,
        },
      },
      success: true,
      message: res.message,
      source: 'LOCAL_EDGE',
      meta: res.meta,
    };
  },

  async get(productId: string): Promise<ApiResponse<InventoryItem>> {
    const res = await apiGet<InventoryRow>(
      `/inventory/${encodeURIComponent(productId)}`,
    );
    return { data: rowToInventory(res.data), success: true, source: 'LOCAL_EDGE' };
  },

  /** Paged + filtered stock movement ledger. */
  async listMovements(query: MovementQuery = {}): Promise<ApiResponse<MovementPage>> {
    const res = await apiGet<MovementRow[]>('/inventory/movements', {
      product_id: query.productId,
      movement_type: query.movementType,
      date_from: query.dateFrom,
      date_to: query.dateTo,
      page: query.page,
      page_size: query.pageSize,
    });
    const meta = (res.meta || {}) as unknown as MovementListMeta;
    return {
      data: {
        items: (res.data || []).map(rowToMovement),
        total: meta.total ?? (res.data || []).length,
        page: meta.page ?? query.page ?? 1,
        pageSize: meta.page_size ?? query.pageSize ?? 200,
        pages: meta.pages ?? 1,
      },
      success: true,
      message: res.message,
      source: 'LOCAL_EDGE',
      meta: res.meta,
    };
  },

  async getMovements(productId?: string): Promise<ApiResponse<StockMovement[]>> {
    const page = await this.listMovements({ productId, pageSize: 500 });
    return { data: page.data.items, success: true, source: 'LOCAL_EDGE' };
  },

  /**
   * Absolute opening stock for a product. Records one OPENING_STOCK movement
   * atomically on the server — can only be done once per product.
   */
  async setOpeningStock(
    productId: string,
    quantity: number,
    reason?: string,
  ): Promise<ApiResponse<InventoryItem>> {
    const res = await apiPost<AdjustResult>(
      `/inventory/${encodeURIComponent(productId)}/opening-stock`,
      { quantity, reason: reason || undefined },
    );
    return {
      data: rowToInventory(res.data.product),
      success: true,
      message: res.message,
      source: 'LOCAL_EDGE',
    };
  },

  async getWarehouses(): Promise<ApiResponse<Warehouse[]>> {
    await new Promise(resolve => setTimeout(resolve, 30));
    return { data: [...warehouses], success: true, source: 'CACHE' };
  },

  /**
   * Write an audited stock adjustment. The server recomputes stock atomically;
   * `previousStock` is only used to build the returned view-model.
   */
  async recordStockAdjustment(
    productId: string,
    productName: string,
    sku: string,
    delta: number,
    previousStock: number,
    reason: string,
  ): Promise<ApiResponse<StockMovement>> {
    const res = await apiPost<AdjustResult>(
      `/inventory/${encodeURIComponent(productId)}/adjust`,
      { delta, reason, reason_code: 'ADJUSTMENT' },
    );
    const movements = await this.getMovements(productId);
    const latest = movements.data[0];
    const movement: StockMovement = latest || {
      id: res.data.movement_id || `mov-${Date.now()}`,
      timestamp: new Date().toISOString(),
      productId,
      productName,
      sku,
      type: 'ADJUSTMENT',
      quantityDelta: delta,
      previousStock,
      newStock: res.data.new_quantity,
      referenceId: 'ADJUSTMENT',
      reason,
      performedBy: 'Current User',
    };
    return { data: movement, success: true, message: res.message, source: 'LOCAL_EDGE' };
  },
};
