export type UserRole = 
  | 'OWNER' 
  | 'ADMIN' 
  | 'MANAGER' 
  | 'CASHIER' 
  | 'INVENTORY_MANAGER' 
  | 'ACCOUNTANT';

export interface User {
  id: string;
  name: string;
  email: string;
  pin: string;
  role: UserRole;
  avatarUrl?: string;
  branchId: string;
  branchName: string;
  phone: string;
}

export type NetworkStatus = 'ONLINE' | 'OFFLINE';
export type SyncState = 'SYNCHRONIZED' | 'SYNCING' | 'PENDING' | 'FAILED';

export interface SystemStatus {
  localServer: NetworkStatus;
  localIp: string;
  cloudServer: NetworkStatus;
  syncState: SyncState;
  pendingSyncCount: number;
  lastSyncedAt: string;
  isSimulatedOffline: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  itemCount: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  priceDelta: number;
  stock: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  hsn: string;
  gstRate: number; // e.g. 5, 12, 18, 28
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  wholesalePrice?: number;
  stock: number;
  minStock: number;
  reservedStock?: number;
  damagedStock?: number;
  image?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  variants?: ProductVariant[];
  batchTracked?: boolean;
}

export interface BatchItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  batchNumber: string;
  mfgDate: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  sellingPrice: number;
  status: 'FRESH' | 'NEAR_EXPIRY' | 'EXPIRED';
  daysToExpiry: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  gstRate: number;
  gstAmount: number;
  total: number;
  batchNumber?: string;
  variantId?: string;
  variantName?: string;
}

export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'SPLIT';

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
  referenceNo?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  gstin?: string;
  outstandingBalance: number;
  creditLimit: number;
  loyaltyPoints: number;
  totalBills: number;
  totalSpent: number;
  lastPurchaseDate?: string;
}

export interface Sale {
  id: string;
  billNumber: string;
  timestamp: string;
  cashierId: string;
  cashierName: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  items: CartItem[];
  subtotal: number;
  totalDiscount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  additionalCharges: number;
  roundOff: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  amountReceived: number;
  changeDue: number;
  status: 'COMPLETED' | 'HELD' | 'CANCELLED' | 'REFUNDED';
  syncedToCloud: boolean;
  branchId: string;
  notes?: string;
}

export interface Supplier {
  id: string;
  name: string;
  gstin: string;
  phone: string;
  email: string;
  address: string;
  creditLimit: number;
  outstandingBalance: number;
  paymentTerms: string;
  contactPerson: string;
}

export interface PurchaseItem {
  productId: string;
  productName: string;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  gstRate: number;
  total: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  expectedDate: string;
  items: PurchaseItem[];
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  notes?: string;
}

export interface StockMovement {
  id: string;
  timestamp: string;
  productId: string;
  productName: string;
  sku: string;
  type: 'PURCHASE' | 'SALE' | 'RETURN' | 'ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  quantityDelta: number;
  previousStock: number;
  newStock: number;
  referenceId: string;
  reason?: string;
  performedBy: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  location: string;
  manager: string;
  totalStockItems: number;
  capacityPercentage: number;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  city: string;
  address: string;
  phone: string;
  gstin: string;
  isMainBranch: boolean;
  activeRegisters: number;
}

export interface SyncRecord {
  id: string;
  transactionId: string;
  type: 'SALE' | 'PRODUCT_UPDATE' | 'CUSTOMER_ADD' | 'STOCK_ADJUSTMENT' | 'PURCHASE';
  createdAt: string;
  status: 'SYNCED' | 'PENDING' | 'FAILED';
  retryCount: number;
  errorMessage?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  module: 'POS' | 'INVENTORY' | 'PRICING' | 'SETTINGS' | 'CUSTOMERS' | 'RETURNS';
  action: string;
  recordIdentifier: string;
  device: string;
  beforeState?: string;
  afterState?: string;
}

export interface Shift {
  id: string;
  shiftNumber: string;
  cashierId: string;
  cashierName: string;
  startTime: string;
  endTime?: string;
  openingCash: number;
  cashSales: number;
  upiSales: number;
  cardSales: number;
  creditSales: number;
  cashExpenses: number;
  expectedCash: number;
  actualCash?: number;
  variance?: number;
  status: 'OPEN' | 'CLOSED';
  notes?: string;
}

export interface AppNotification {
  id: string;
  type: 'LOW_STOCK' | 'OUT_OF_STOCK' | 'EXPIRY' | 'PAYMENT_DUE' | 'SYNC_ERROR' | 'INFO';
  priority: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  linkRoute?: string;
}

export interface ServerTelemetry {
  ipAddress: string;
  hostname: string;
  os: string;
  cpuModel: string;
  cpuUsagePercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  storageUsedGb: number;
  storageTotalGb: number;
  cpuTemperature: number;
  uptimeSeconds: number;
  services: {
    sqlite: 'RUNNING' | 'STOPPED';
    posServer: 'RUNNING' | 'STOPPED';
    syncDaemon: 'RUNNING' | 'STOPPED';
    receiptPrinter: 'CONNECTED' | 'DISCONNECTED';
    barcodeScanner: 'CONNECTED' | 'DISCONNECTED';
  };
}

export interface OnlineOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  orderType: 'PICKUP' | 'DELIVERY';
  deliveryAddress?: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  paymentStatus: 'PAID_ONLINE' | 'CASH_ON_DELIVERY';
  orderStatus: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'CANCELLED';
  placedAt: string;
}
