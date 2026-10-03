import { Sale, CartItem } from '../types';
import { INITIAL_RECENT_BILLS } from '../data/mockData';
import { delay, createResponse, ApiResponse } from './api';
import { productsService } from './products';
import { syncService } from './sync';

let sales: Sale[] = [...INITIAL_RECENT_BILLS];
let heldBills: { id: string; name: string; timestamp: string; items: CartItem[]; customerId?: string; customerName: string }[] = [];

export const salesService = {
  async getAll(): Promise<ApiResponse<Sale[]>> {
    await delay();
    return createResponse([...sales]);
  },

  async getRecent(limit: number = 20): Promise<ApiResponse<Sale[]>> {
    await delay(30);
    return createResponse(sales.slice(0, limit));
  },

  async getById(id: string): Promise<ApiResponse<Sale | null>> {
    await delay();
    const sale = sales.find(s => s.id === id || s.billNumber === id) || null;
    return createResponse(sale);
  },

  async createSale(saleData: Omit<Sale, 'id' | 'billNumber' | 'timestamp' | 'syncedToCloud'>): Promise<ApiResponse<Sale>> {
    await delay(80);
    const saleNum = 9822 + sales.length;
    const isOnline = syncService.isCloudOnline();

    const newSale: Sale = {
      ...saleData,
      id: `sale-${saleNum}`,
      billNumber: `INV-2026-${String(saleNum).padStart(5, '0')}`,
      timestamp: new Date().toLocaleString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      syncedToCloud: isOnline,
    };

    // Deduct inventory
    for (const item of newSale.items) {
      await productsService.updateStock(item.product.id, -item.quantity);
    }

    sales.unshift(newSale);

    // Queue sync record
    syncService.addRecord({
      transactionId: newSale.billNumber,
      type: 'SALE',
      status: isOnline ? 'SYNCED' : 'PENDING',
    });

    return createResponse(newSale, 'Sale processed successfully');
  },

  async holdBill(items: CartItem[], customerName: string, customerId?: string): Promise<ApiResponse<string>> {
    await delay(40);
    const holdId = `hold-${Date.now()}`;
    heldBills.push({
      id: holdId,
      name: `Bill #${heldBills.length + 1} (${customerName})`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      items,
      customerId,
      customerName,
    });
    return createResponse(holdId, 'Bill placed on hold');
  },

  async getHeldBills(): Promise<ApiResponse<typeof heldBills>> {
    await delay(20);
    return createResponse([...heldBills]);
  },

  async recallHeldBill(holdId: string): Promise<ApiResponse<(typeof heldBills)[0] | null>> {
    await delay(20);
    const index = heldBills.findIndex(h => h.id === holdId);
    if (index === -1) return createResponse(null);
    const [bill] = heldBills.splice(index, 1);
    return createResponse(bill);
  },

  async cancelHeldBill(holdId: string): Promise<ApiResponse<boolean>> {
    await delay(20);
    heldBills = heldBills.filter(h => h.id !== holdId);
    return createResponse(true);
  },

  async processReturn(saleId: string, itemsReturned: { productId: string; qty: number; refundAmount: number }[], reason: string): Promise<ApiResponse<Sale>> {
    await delay(100);
    const sale = sales.find(s => s.id === saleId);
    if (!sale) throw new Error('Sale not found');
    
    // Restock items
    for (const item of itemsReturned) {
      await productsService.updateStock(item.productId, item.qty);
    }
    
    sale.status = 'REFUNDED';
    sale.notes = `Return processed: ${reason}`;

    syncService.addRecord({
      transactionId: `RET-${sale.billNumber}`,
      type: 'STOCK_ADJUSTMENT',
      status: syncService.isCloudOnline() ? 'SYNCED' : 'PENDING',
    });

    return createResponse(sale, 'Return processed and inventory adjusted');
  }
};
