import { BatchItem, StockMovement, Warehouse } from '../types';
import { INITIAL_BATCHES, INITIAL_WAREHOUSES } from '../data/mockData';
import { ApiResponse, apiGet, apiPost } from './api';

/**
 * TODO(phase-2): batch/expiry tracking and warehouse master data have no API
 * on the Pi in Phase 1, so these two lists still come from local mock data.
 * Everything else in this file reads/writes the real SQLite database.
 */
let batches: BatchItem[] = [...INITIAL_BATCHES];
let warehouses: Warehouse[] = [...INITIAL_WAREHOUSES];

interface MovementRow {
  id: string;
  product_id: string;
  movement_type: 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'RETURN';
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
  unit: string;
  min_stock: number;
  is_active: number;
  stock: number;
  is_low_stock: boolean;
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

export const inventoryService = {
  /** TODO(phase-2): expiry/batch tracking is not modelled in the Phase 1 schema. */
  async getBatches(): Promise<ApiResponse<BatchItem[]>> {
    await new Promise(resolve => setTimeout(resolve, 30));
    return { data: [...batches], success: true, source: 'CACHE' };
  },

  /** TODO(phase-2): see getBatches(). */
  async getNearExpiryBatches(): Promise<ApiResponse<BatchItem[]>> {
    await new Promise(resolve => setTimeout(resolve, 30));
    return {
      data: batches.filter(b => b.status === 'NEAR_EXPIRY' || b.status === 'EXPIRED'),
      success: true,
      source: 'CACHE',
    };
  },

  async getMovements(productId?: string): Promise<ApiResponse<StockMovement[]>> {
    const res = await apiGet<MovementRow[]>('/inventory/movements', {
      limit: 500,
      product_id: productId,
    });
    return { data: res.data.map(rowToMovement), success: true, source: 'LOCAL_EDGE' };
  },

  /** TODO(phase-2): warehouse master data has no Phase 1 API. */
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
    const res = await apiPost<InventoryRow>(
      `/inventory/${encodeURIComponent(productId)}/adjust`,
      { delta, reason, reason_code: 'ADJUSTMENT' },
    );
    const movements = await this.getMovements(productId);
    const latest = movements.data[0];
    const movement: StockMovement = latest || {
      id: `mov-${Date.now()}`,
      timestamp: new Date().toISOString(),
      productId,
      productName,
      sku,
      type: 'ADJUSTMENT',
      quantityDelta: delta,
      previousStock,
      newStock: res.data.quantity,
      referenceId: 'ADJUSTMENT',
      reason,
      performedBy: 'Current User',
    };
    return { data: movement, success: true, message: res.message, source: 'LOCAL_EDGE' };
  },
};
