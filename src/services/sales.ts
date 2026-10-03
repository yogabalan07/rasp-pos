import { Sale, CartItem, Product, PaymentMethod } from '../types';
import { ApiResponse, apiGet, apiPost, getDeviceId, ApiError } from './api';

/** Receipt payload returned by the local API (money in integer paise). */
interface ReceiptLine {
  id: string;
  sale_id: string;
  product_id: string;
  product_name_snapshot: string;
  sku_snapshot: string;
  hsn_snapshot: string;
  unit_snapshot: string;
  quantity: number;
  unit_price_paise: number;
  discount_paise: number;
  gst_rate: number;
  tax_paise: number;
  line_total_paise: number;
}

interface Receipt {
  sale: {
    id: string;
    bill_no: string;
    client_sale_id: string;
    device_id: string;
    customer_id: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    subtotal_paise: number;
    discount_paise: number;
    tax_paise: number;
    additional_charges_paise: number;
    round_off_paise: number;
    total_paise: number;
    status: 'COMPLETED' | 'VOID';
    created_at: string;
    created_by: string;
  };
  lines: ReceiptLine[];
  payment: {
    payment_method: PaymentMethod;
    amount_paise: number;
  } | null;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  change_due_paise: number;
  cashier_name: string | null;
  idempotent?: boolean;
}

interface SaleListPayload {
  items: Receipt[];
  total: number;
  page: number;
  page_size: number;
}

const rupees = (paise: number): number => paise / 100;
const toPaise = (amount: number): number => Math.round(amount * 100);

/**
 * Product records are snapshotted into `sale_lines`, so we rebuild a minimal
 * `Product` for the UI from that snapshot. Editing the catalogue later can
 * never rewrite printed receipts.
 */
function productFromLine(line: ReceiptLine): Product {
  const unitPrice = rupees(line.unit_price_paise);
  return {
    id: line.product_id,
    name: line.product_name_snapshot,
    sku: line.sku_snapshot,
    barcode: '',
    brand: '',
    categoryId: '',
    categoryName: '',
    unit: line.unit_snapshot,
    hsn: line.hsn_snapshot,
    gstRate: line.gst_rate,
    purchasePrice: 0,
    sellingPrice: unitPrice,
    mrp: unitPrice,
    wholesalePrice: 0,
    stock: 0,
    minStock: 0,
    status: 'ACTIVE',
  };
}

function lineToCartItem(line: ReceiptLine): CartItem {
  const quantity = line.quantity;
  const unitPrice = rupees(line.unit_price_paise);
  const discountAmount = rupees(line.discount_paise);
  const gross = unitPrice * quantity;
  return {
    product: productFromLine(line),
    quantity,
    unitPrice,
    discountPercent: gross > 0 ? (discountAmount / gross) * 100 : 0,
    discountAmount,
    gstRate: line.gst_rate,
    gstAmount: rupees(line.tax_paise),
    total: rupees(line.line_total_paise),
  };
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function receiptToSale(receipt: Receipt): Sale {
  const { sale } = receipt;
  const method = receipt.payment?.payment_method || 'CASH';
  return {
    id: sale.id,
    billNumber: sale.bill_no,
    timestamp: formatTimestamp(sale.created_at),
    cashierId: sale.created_by,
    cashierName: receipt.cashier_name || '',
    customerId: sale.customer_id || undefined,
    customerName: sale.customer_name || 'Walk-in Customer',
    customerPhone: sale.customer_phone || undefined,
    items: receipt.lines.map(lineToCartItem),
    subtotal: rupees(sale.subtotal_paise),
    totalDiscount: rupees(sale.discount_paise),
    cgst: rupees(receipt.cgst_paise),
    sgst: rupees(receipt.sgst_paise),
    igst: rupees(receipt.igst_paise),
    totalTax: rupees(sale.tax_paise),
    additionalCharges: rupees(sale.additional_charges_paise),
    roundOff: rupees(sale.round_off_paise),
    grandTotal: rupees(sale.total_paise),
    paymentMethod: method,
    amountReceived: rupees(receipt.payment?.amount_paise ?? sale.total_paise),
    changeDue: rupees(receipt.change_due_paise),
    status: sale.status === 'VOID' ? 'CANCELLED' : 'COMPLETED',
    // Phase 1 queues the sale in the local outbox; cloud sync is a later phase.
    syncedToCloud: false,
    branchId: 'br-1',
  };
}

// ------------------------------------------------------------ held bills

interface HeldBill {
  id: string;
  name: string;
  timestamp: string;
  items: CartItem[];
  customerId?: string;
  customerName: string;
}

/**
 * Held bills are held in browser memory only.
 * TODO(phase-2): persist holds server-side so they survive a tab reload.
 */
let heldBills: HeldBill[] = [];

// --------------------------------------------------------- idempotency

let pendingSale: { signature: string; clientSaleId: string } | null = null;

function newClientSaleId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `cs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

type NewSaleInput = Omit<Sale, 'id' | 'billNumber' | 'timestamp' | 'syncedToCloud'>;

function toRequestPayload(saleData: NewSaleInput, clientSaleId: string) {
  const itemsDiscount = saleData.items.reduce((acc, item) => acc + item.discountAmount, 0);
  const billDiscount = Math.max(0, saleData.totalDiscount - itemsDiscount);

  // Cash needs an explicit tender so the server can compute change. For every
  // other tender the amount is implied by the bill, and omitting it lets the
  // server fill in its own total instead of us guessing at rounding.
  const received =
    saleData.paymentMethod === 'CASH' ? toPaise(saleData.amountReceived) : undefined;

  return {
    client_sale_id: clientSaleId,
    device_id: getDeviceId(),
    items: saleData.items.map(item => ({
      product_id: item.product.id,
      quantity: item.quantity,
      discount_paise: toPaise(item.discountAmount),
    })),
    payment_method: saleData.paymentMethod,
    bill_discount_paise: toPaise(billDiscount),
    additional_charges_paise: toPaise(saleData.additionalCharges),
    amount_received_paise: received,
    customer_id: saleData.customerId && saleData.customerId !== 'cust-walkin'
      ? saleData.customerId
      : null,
    customer_name: saleData.customerName || null,
    customer_phone: saleData.customerPhone || null,
  };
}

export const salesService = {
  async getAll(): Promise<ApiResponse<Sale[]>> {
    const res = await apiGet<SaleListPayload>('/sales', { page: 1, page_size: 200 });
    return { data: res.data.items.map(receiptToSale), success: true, source: 'LOCAL_EDGE' };
  },

  async getRecent(limit: number = 20): Promise<ApiResponse<Sale[]>> {
    const res = await apiGet<SaleListPayload>('/sales', { page: 1, page_size: limit });
    return { data: res.data.items.map(receiptToSale), success: true, source: 'LOCAL_EDGE' };
  },

  async getById(id: string): Promise<ApiResponse<Sale | null>> {
    const res = await apiGet<Receipt>(`/sales/${encodeURIComponent(id.trim())}`);
    return { data: receiptToSale(res.data), success: true, source: 'LOCAL_EDGE' };
  },

  /**
   * Post a completed POS sale. The `client_sale_id` is reused while an
   * identical payload is being retried, so a network hiccup can never create
   * a second bill for the same cart.
   */
  async createSale(saleData: NewSaleInput): Promise<ApiResponse<Sale>> {
    if (saleData.paymentMethod === 'SPLIT') {
      throw new ApiError('Split payments are not available in Phase 1 (TODO)', 400);
    }

    const payload = toRequestPayload(saleData, 'pending');
    const signature = JSON.stringify(payload);
    const clientSaleId =
      pendingSale && pendingSale.signature === signature
        ? pendingSale.clientSaleId
        : newClientSaleId();

    // Remember the key until the server confirms, so a retry of the same cart
    // reuses the same client_sale_id (server-side idempotency).
    pendingSale = { signature, clientSaleId };

    const body = { ...payload, client_sale_id: clientSaleId };
    const res = await apiPost<Receipt>('/sales', body);

    pendingSale = null;
    return {
      data: receiptToSale(res.data),
      success: true,
      message: res.data.idempotent ? 'This bill was already recorded' : res.message,
      source: 'LOCAL_EDGE',
    };
  },

  // ---- Held bills are browser-local (TODO phase-2 server persistence) ----
  async holdBill(items: CartItem[], customerName: string, customerId?: string): Promise<ApiResponse<string>> {
    const holdId = `hold-${Date.now()}`;
    heldBills.push({
      id: holdId,
      name: `Bill #${heldBills.length + 1} (${customerName})`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      items,
      customerId,
      customerName,
    });
    return { data: holdId, success: true, message: 'Bill placed on hold (this terminal only)', source: 'CACHE' };
  },

  async getHeldBills(): Promise<ApiResponse<HeldBill[]>> {
    return { data: [...heldBills], success: true, source: 'CACHE' };
  },

  async recallHeldBill(holdId: string): Promise<ApiResponse<HeldBill | null>> {
    const index = heldBills.findIndex(h => h.id === holdId);
    if (index === -1) return { data: null, success: true, source: 'CACHE' };
    const [bill] = heldBills.splice(index, 1);
    return { data: bill, success: true, source: 'CACHE' };
  },

  async cancelHeldBill(holdId: string): Promise<ApiResponse<boolean>> {
    heldBills = heldBills.filter(h => h.id !== holdId);
    return { data: true, success: true, source: 'CACHE' };
  },

  /**
   * TODO(phase-2): sales returns.
   * Completed sales are immutable in Phase 1 (RULE 5) and there is no return
   * endpoint yet, so this refuses rather than silently faking a restock.
   */
  async processReturn(
    _saleId: string,
    _itemsReturned: { productId: string; qty: number; refundAmount: number }[],
    _reason: string,
  ): Promise<ApiResponse<Sale>> {
    throw new ApiError('Sales returns are not available in Phase 1 (TODO)', 501);
  },
};
