import React, { useState } from 'react';
import { salesService } from '../services/sales';
import { Sale } from '../types';
import { useApp } from '../context/AppContext';
import { 
  RotateCcw, 
  Search, 
  CheckCircle, 
  AlertCircle, 
  Banknote, 
  CreditCard, 
  FileText,
  Boxes
} from 'lucide-react';

export const SalesReturnsPage: React.FC = () => {
  const { showToast, navigateTo } = useApp();
  const [billQuery, setBillQuery] = useState('INV-2026-09821');
  const [searchedSale, setSearchedSale] = useState<Sale | null>(null);
  const [returnQtys, setReturnQtys] = useState<{ [productId: string]: number }>({});
  const [reason, setReason] = useState('Customer changed mind');
  const [refundMode, setRefundMode] = useState<'CASH' | 'STORE_CREDIT'>('CASH');

  const handleSearchBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billQuery.trim()) return;
    const res = await salesService.getById(billQuery.trim());
    if (res.data) {
      setSearchedSale(res.data);
      const initialQtys: any = {};
      res.data.items.forEach(i => { initialQtys[i.product.id] = 0; });
      setReturnQtys(initialQtys);
    } else {
      showToast('Bill not found. Try INV-2026-09821 or INV-2026-09820', 'warning');
    }
  };

  const handleQtyChange = (productId: string, val: number, max: number) => {
    const safeVal = Math.max(0, Math.min(max, val));
    setReturnQtys(prev => ({ ...prev, [productId]: safeVal }));
  };

  const totalRefundAmount = searchedSale ? searchedSale.items.reduce((acc, item) => {
    const q = returnQtys[item.product.id] || 0;
    return acc + q * item.unitPrice;
  }, 0) : 0;

  const handleProcessReturn = async () => {
    if (!searchedSale) return;
    const returnItems = searchedSale.items
      .filter(item => (returnQtys[item.product.id] || 0) > 0)
      .map(item => ({
        productId: item.product.id,
        qty: returnQtys[item.product.id],
        refundAmount: returnQtys[item.product.id] * item.unitPrice,
      }));

    if (returnItems.length === 0) {
      showToast('Please select at least 1 unit to return', 'warning');
      return;
    }

    await salesService.processReturn(searchedSale.id, returnItems, reason);
    showToast(`Return processed for ₹${totalRefundAmount.toFixed(2)} (${refundMode})`, 'success');
    setSearchedSale(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Sales Returns &amp; Customer Refunds
        </h1>
        <p className="text-xs text-neutral-500">
          Process item returns against previous tax invoices with automatic stock restoration
        </p>
      </div>

      {/* Bill Lookup Card */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <form onSubmit={handleSearchBill} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={billQuery}
              onChange={e => setBillQuery(e.target.value)}
              placeholder="Enter Bill / Invoice Number (e.g. INV-2026-09821)..."
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-2 text-xs font-mono focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
          >
            Find Invoice
          </button>
        </form>
      </div>

      {/* Found Bill Items */}
      {searchedSale && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
            <div>
              <span className="font-mono text-xs font-bold text-neutral-900 dark:text-white">
                {searchedSale.billNumber}
              </span>
              <p className="text-xs text-neutral-500">
                Customer: <strong>{searchedSale.customerName}</strong> · Cashier: {searchedSale.cashierName} · {searchedSale.timestamp}
              </p>
            </div>
            <span className="rounded bg-neutral-100 px-2.5 py-1 text-xs font-bold font-tabular text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
              Original Bill Total: ₹{searchedSale.grandTotal.toFixed(2)}
            </span>
          </div>

          {/* Items Return Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
                <tr>
                  <th className="py-2.5 px-3">Item Purchased</th>
                  <th className="py-2.5 px-3 text-center">Billed Qty</th>
                  <th className="py-2.5 px-3 text-right">Unit Price</th>
                  <th className="py-2.5 px-3 text-center">Return Qty</th>
                  <th className="py-2.5 px-3 text-right">Refund Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {searchedSale.items.map(item => {
                  const qtyToReturn = returnQtys[item.product.id] || 0;
                  return (
                    <tr key={item.product.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                      <td className="py-3 px-3">
                        <p className="font-bold text-neutral-900 dark:text-white">{item.product.name}</p>
                        <p className="text-[10px] text-neutral-400 font-mono">HSN: {item.product.hsn}</p>
                      </td>
                      <td className="py-3 px-3 text-center font-tabular font-semibold">
                        {item.quantity}
                      </td>
                      <td className="py-3 px-3 text-right font-tabular">
                        ₹{item.unitPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={qtyToReturn}
                          onChange={e => handleQtyChange(item.product.id, parseInt(e.target.value) || 0, item.quantity)}
                          className="w-16 rounded border border-neutral-300 p-1 text-center font-bold font-tabular text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        />
                      </td>
                      <td className="py-3 px-3 text-right font-bold font-tabular text-neutral-900 dark:text-white">
                        ₹{(qtyToReturn * item.unitPrice).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Refund Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Return Reason
              </label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              >
                <option value="Customer changed mind">Customer changed mind / surplus</option>
                <option value="Damaged / Defective packaging">Damaged / Defective packaging</option>
                <option value="Expired item returned">Expired item returned</option>
                <option value="Wrong product billed">Wrong product billed</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Refund Method
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setRefundMode('CASH')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold ${
                    refundMode === 'CASH'
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-950'
                      : 'border-neutral-200 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
                  }`}
                >
                  <Banknote className="h-4 w-4" />
                  <span>Cash Refund</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRefundMode('STORE_CREDIT')}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold ${
                    refundMode === 'STORE_CREDIT'
                      ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-950'
                      : 'border-neutral-200 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
                  }`}
                >
                  <CreditCard className="h-4 w-4" />
                  <span>Store Credit</span>
                </button>
              </div>
            </div>
          </div>

          {/* Refund Footer */}
          <div className="flex items-center justify-between border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <div>
              <span className="text-xs text-neutral-500">Total Refund Payable:</span>
              <p className="text-xl font-black font-tabular text-red-600">
                ₹{totalRefundAmount.toFixed(2)}
              </p>
            </div>

            <button
              onClick={handleProcessReturn}
              disabled={totalRefundAmount <= 0}
              className="rounded-lg bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              Confirm Return &amp; Restock
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
