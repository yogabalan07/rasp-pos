import React, { useState, useEffect } from 'react';
import { PurchaseOrder, Supplier, Product } from '../types';
import { suppliersService } from '../services/suppliers';
import { productsService } from '../services/products';
import { useApp } from '../context/AppContext';
import { 
  Truck, 
  Plus, 
  CheckCircle, 
  Clock, 
  X, 
  Search, 
  FileText, 
  PackageCheck,
  Building2
} from 'lucide-react';

export const PurchasesPage: React.FC = () => {
  const { showToast } = useApp();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isNewPoOpen, setIsNewPoOpen] = useState(false);

  // New PO form
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [selectedProdId, setSelectedProdId] = useState('');
  const [orderQty, setOrderQty] = useState('50');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [poRes, supRes, prodRes] = await Promise.all([
      suppliersService.getPurchaseOrders(),
      suppliersService.getAll(),
      productsService.getAll(),
    ]);
    setPurchaseOrders(poRes.data);
    setSuppliers(supRes.data);
    setProducts(prodRes.data);
    if (supRes.data.length > 0) setSelectedSupplierId(supRes.data[0].id);
    if (prodRes.data.length > 0) setSelectedProdId(prodRes.data[0].id);
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    const supplier = suppliers.find(s => s.id === selectedSupplierId);
    const product = products.find(p => p.id === selectedProdId);
    if (!supplier || !product) return;

    const qty = parseInt(orderQty) || 10;
    const unitCost = product.purchasePrice;
    const subtotal = unitCost * qty;
    const taxAmount = (subtotal * product.gstRate) / 100;
    const grandTotal = subtotal + taxAmount;

    await suppliersService.createPurchaseOrder({
      supplierId: supplier.id,
      supplierName: supplier.name,
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDate: expectedDate || new Date(Date.now() + 86400000 * 4).toISOString().slice(0, 10),
      items: [
        {
          productId: product.id,
          productName: product.name,
          quantity: qty,
          receivedQuantity: 0,
          unitCost,
          gstRate: product.gstRate,
          total: grandTotal,
        }
      ],
      subtotal,
      taxAmount,
      grandTotal,
      status: 'ORDERED',
    });

    showToast('Purchase Order created successfully', 'success');
    setIsNewPoOpen(false);
    loadData();
  };

  const handleReceiveGoods = async (po: PurchaseOrder) => {
    // Mark received and restock (single audited adjustment per line)
    for (const item of po.items) {
      await productsService.updateStock(item.productId, item.quantity, `Goods received for ${po.poNumber}`);
    }
    await suppliersService.updatePoStatus(po.id, 'RECEIVED');
    showToast(`Goods received for ${po.poNumber} & inventory restocked`, 'success');
    loadData();
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Purchase Orders &amp; Goods Receiving
          </h1>
          <p className="text-xs text-neutral-500">
            Create vendor POs, monitor shipment statuses, and record inbound stock receipts
          </p>
        </div>

        <button
          onClick={() => setIsNewPoOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>New Purchase Order</span>
        </button>
      </div>

      {/* Orders Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">PO Number</th>
              <th className="py-3 px-4">Supplier Name</th>
              <th className="py-3 px-4">Order Date</th>
              <th className="py-3 px-4">Expected Date</th>
              <th className="py-3 px-4">Items / SKUs</th>
              <th className="py-3 px-4 text-right">PO Total</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {purchaseOrders.map(po => (
              <tr key={po.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="py-3 px-4 font-mono font-bold text-neutral-900 dark:text-white">
                  {po.poNumber}
                </td>
                <td className="py-3 px-4 font-semibold text-neutral-800 dark:text-neutral-200">
                  {po.supplierName}
                </td>
                <td className="py-3 px-4 text-neutral-500 font-mono text-[11px]">
                  {po.orderDate}
                </td>
                <td className="py-3 px-4 text-neutral-500 font-mono text-[11px]">
                  {po.expectedDate}
                </td>
                <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400">
                  {po.items.map(i => `${i.productName} (${i.quantity})`).join(', ')}
                </td>
                <td className="py-3 px-4 text-right font-bold font-tabular text-neutral-900 dark:text-white">
                  ₹{po.grandTotal.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    po.status === 'RECEIVED'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : po.status === 'PARTIALLY_RECEIVED'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    {po.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  {po.status !== 'RECEIVED' && (
                    <button
                      onClick={() => handleReceiveGoods(po)}
                      className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <PackageCheck className="h-3.5 w-3.5" />
                      <span>Receive Stock</span>
                    </button>
                  )}
                  {po.status === 'RECEIVED' && (
                    <span className="text-[11px] text-neutral-400">Completed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New PO Modal */}
      {isNewPoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                Create Vendor Purchase Order
              </h2>
              <button onClick={() => setIsNewPoOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePo} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Select Supplier *
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={e => setSelectedSupplierId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.paymentTerms})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Select Item to Restock *
                </label>
                <select
                  value={selectedProdId}
                  onChange={e => setSelectedProdId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Cur Stock: {p.stock}, Cost: ₹{p.purchasePrice})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Order Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={orderQty}
                    onChange={e => setOrderQty(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Expected Delivery Date
                  </label>
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={e => setExpectedDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs font-mono dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsNewPoOpen(false)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Send Purchase Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
