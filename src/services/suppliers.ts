import { Supplier, PurchaseOrder } from '../types';
import { INITIAL_SUPPLIERS, INITIAL_PURCHASE_ORDERS } from '../data/mockData';
import { delay, createResponse, ApiResponse } from './api';

let suppliers: Supplier[] = [...INITIAL_SUPPLIERS];
let purchaseOrders: PurchaseOrder[] = [...INITIAL_PURCHASE_ORDERS];

export const suppliersService = {
  async getAll(): Promise<ApiResponse<Supplier[]>> {
    await delay();
    return createResponse([...suppliers]);
  },

  async getPurchaseOrders(): Promise<ApiResponse<PurchaseOrder[]>> {
    await delay();
    return createResponse([...purchaseOrders]);
  },

  async createPurchaseOrder(po: Omit<PurchaseOrder, 'id' | 'poNumber'>): Promise<ApiResponse<PurchaseOrder>> {
    await delay();
    const newPo: PurchaseOrder = {
      ...po,
      id: `po-${Date.now()}`,
      poNumber: `PO-2026-${String(purchaseOrders.length + 44).padStart(4, '0')}`,
    };
    purchaseOrders.unshift(newPo);
    return createResponse(newPo, 'Purchase order placed');
  },

  async updatePoStatus(poId: string, status: PurchaseOrder['status']): Promise<ApiResponse<PurchaseOrder>> {
    await delay();
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po) throw new Error('PO not found');
    po.status = status;
    return createResponse(po, `PO status updated to ${status}`);
  }
};
