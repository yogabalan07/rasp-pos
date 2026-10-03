import { BatchItem, StockMovement, Warehouse, PurchaseOrder } from '../types';
import { INITIAL_BATCHES, INITIAL_WAREHOUSES, INITIAL_PURCHASE_ORDERS } from '../data/mockData';
import { delay, createResponse, ApiResponse } from './api';

let batches: BatchItem[] = [...INITIAL_BATCHES];
let warehouses: Warehouse[] = [...INITIAL_WAREHOUSES];
let movements: StockMovement[] = [
  {
    id: 'mov-1',
    timestamp: '2026-10-03 09:24 AM',
    productId: 'prod-1',
    productName: 'Coca Cola 750ml Bottle',
    sku: 'BEV-COC-750',
    type: 'SALE',
    quantityDelta: -2,
    previousStock: 50,
    newStock: 48,
    referenceId: 'INV-2026-09821',
    performedBy: 'Rohan Sharma (Cashier)',
  },
  {
    id: 'mov-2',
    timestamp: '2026-10-03 09:12 AM',
    productId: 'prod-9',
    productName: 'Tata Salt Vacuum Evaporated 1kg',
    sku: 'GRO-TAT-SLT1K',
    type: 'SALE',
    quantityDelta: -2,
    previousStock: 97,
    newStock: 95,
    referenceId: 'INV-2026-09820',
    performedBy: 'Rohan Sharma (Cashier)',
  },
  {
    id: 'mov-3',
    timestamp: '2026-10-02 04:30 PM',
    productId: 'prod-12',
    productName: 'Surf Excel Quick Wash 1kg',
    sku: 'PER-SRF-DET1K',
    type: 'PURCHASE',
    quantityDelta: 50,
    previousStock: 19,
    newStock: 69,
    referenceId: 'PO-2026-0042',
    performedBy: 'Karthik Rao (Inventory Mgr)',
  },
  {
    id: 'mov-4',
    timestamp: '2026-10-02 11:15 AM',
    productId: 'prod-11',
    productName: 'Maggi 2-Minute Masala Noodles 280g',
    sku: 'GRO-MAG-MAS280',
    type: 'ADJUSTMENT',
    quantityDelta: -2,
    previousStock: 6,
    newStock: 4,
    referenceId: 'ADJ-EXP-088',
    reason: 'Damaged packaging / moisture leakage',
    performedBy: 'Karthik Rao (Inventory Mgr)',
  }
];

export const inventoryService = {
  async getBatches(): Promise<ApiResponse<BatchItem[]>> {
    await delay();
    return createResponse([...batches]);
  },

  async getNearExpiryBatches(): Promise<ApiResponse<BatchItem[]>> {
    await delay(30);
    return createResponse(batches.filter(b => b.status === 'NEAR_EXPIRY' || b.status === 'EXPIRED'));
  },

  async getMovements(): Promise<ApiResponse<StockMovement[]>> {
    await delay();
    return createResponse([...movements]);
  },

  async getWarehouses(): Promise<ApiResponse<Warehouse[]>> {
    await delay();
    return createResponse([...warehouses]);
  },

  async recordStockAdjustment(productId: string, productName: string, sku: string, delta: number, previousStock: number, reason: string): Promise<ApiResponse<StockMovement>> {
    await delay();
    const movement: StockMovement = {
      id: `mov-${Date.now()}`,
      timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
      productId,
      productName,
      sku,
      type: 'ADJUSTMENT',
      quantityDelta: delta,
      previousStock,
      newStock: previousStock + delta,
      referenceId: `ADJ-${Date.now().toString().slice(-5)}`,
      reason,
      performedBy: 'Current Store Staff',
    };
    movements.unshift(movement);
    return createResponse(movement, 'Stock adjustment recorded successfully');
  }
};
