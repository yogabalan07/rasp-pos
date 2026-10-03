import React, { useState, useEffect, useCallback } from 'react';
import { Product, StockMovement } from '../types';
import { productsService } from '../services/products';
import { inventoryService } from '../services/inventory';
import { ApiError } from '../services/api';
import { useApp } from '../context/AppContext';
import { 
  ClipboardCheck, 
  Barcode, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw,
  History,
  Loader2
} from 'lucide-react';

interface AuditItem {
  product: Product;
  expectedQty: number;
  countedQty: number;
  variance: number;
}

export const StockAuditPage: React.FC = () => {
  const { showToast } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ [productId: string]: number }>({});
  const [barcodeScanInput, setBarcodeScanInput] = useState('');

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await productsService.getAll();
      setProducts(res.data);
      const initialCounts: { [productId: string]: number } = {};
      res.data.forEach(p => { initialCounts[p.id] = p.stock; });
      setCounts(initialCounts);
    } catch (err) {
      setProducts([]);
      setLoadError(err instanceof ApiError ? err.message : 'Could not load the audit sheet');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMovements = useCallback(async () => {
    try {
      const res = await inventoryService.listMovements({ pageSize: 50 });
      setMovements(res.data.items);
    } catch {
      setMovements([]);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadMovements();
  }, [loadProducts, loadMovements]);

  const handleScanBarcode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeScanInput.trim()) return;
    const prod = products.find(p => p.barcode === barcodeScanInput.trim() || p.sku.toLowerCase() === barcodeScanInput.trim().toLowerCase());
    if (prod) {
      setCounts(prev => ({
        ...prev,
        [prod.id]: (prev[prod.id] || 0) + 1,
      }));
      showToast(`Scanned count +1: ${prod.name}`, 'info');
      setBarcodeScanInput('');
    } else {
      showToast('Barcode not recognized', 'warning');
    }
  };

  const handleReconcile = async () => {
    let adjustmentsMade = 0;
    try {
      for (const p of products) {
        const counted = counts[p.id];
        const variance = counted - p.stock;
        if (variance !== 0) {
          await inventoryService.recordStockAdjustment(
            p.id,
            p.name,
            p.sku,
            variance,
            p.stock,
            'Physical audit reconciliation'
          );
          adjustmentsMade++;
        }
      }
      showToast(`Audit reconciled: ${adjustmentsMade} stock adjustments committed`, 'success');
      loadProducts();
      loadMovements();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Reconciliation failed', 'error');
    }
  };

  const totalDiscrepancies = products.filter(p => (counts[p.id] ?? p.stock) !== p.stock).length;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Physical Stock Audit &amp; Verification
          </h1>
          <p className="text-xs text-neutral-500">
            Compare physical shelf counts against SQLite system records with barcode scanning
          </p>
        </div>

        <button
          onClick={handleReconcile}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-colors"
        >
          <CheckCircle className="h-4 w-4" />
          <span>Post &amp; Reconcile Audit ({totalDiscrepancies} Discrepancies)</span>
        </button>
      </div>

      {/* Barcode Fast Counting Input */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <form onSubmit={handleScanBarcode} className="flex gap-2">
          <div className="relative flex-1">
            <Barcode className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={barcodeScanInput}
              onChange={e => setBarcodeScanInput(e.target.value)}
              placeholder="Fast Count Mode: Scan product barcode to increment count by 1..."
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-2 text-xs font-mono focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
          >
            Count Item
          </button>
        </form>
      </div>

      {/* Audit Comparison Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Product Name</th>
              <th className="py-3 px-4">SKU / Barcode</th>
              <th className="py-3 px-4 text-center">System Expected Qty</th>
              <th className="py-3 px-4 text-center">Physical Count</th>
              <th className="py-3 px-4 text-center">Variance Delta</th>
              <th className="py-3 px-4 text-center">Audit Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-neutral-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  <p className="mt-2 text-xs">Loading audit sheet…</p>
                </td>
              </tr>
            )}

            {!isLoading && loadError && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-red-600">
                  <AlertTriangle className="mx-auto h-5 w-5" />
                  <p className="mt-2 text-xs">{loadError}</p>
                  <button onClick={loadProducts} className="mt-1 text-xs font-semibold underline">
                    Retry
                  </button>
                </td>
              </tr>
            )}

            {!isLoading && !loadError && products.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-neutral-400">
                  <ClipboardCheck className="mx-auto h-6 w-6" />
                  <p className="mt-2 text-xs">No products to audit yet.</p>
                </td>
              </tr>
            )}

            {!isLoading && !loadError && products.map(p => {
              const counted = counts[p.id] !== undefined ? counts[p.id] : p.stock;
              const variance = counted - p.stock;

              return (
                <tr key={p.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="py-3 px-4 font-bold text-neutral-900 dark:text-white">
                    {p.name}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-neutral-500">
                    <p>{p.sku}</p>
                    <p className="text-[10px] text-neutral-400">{p.barcode}</p>
                  </td>
                  <td className="py-3 px-4 text-center font-bold font-tabular text-neutral-700 dark:text-neutral-300">
                    {p.stock}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <input
                      type="number"
                      value={counted}
                      onChange={e => setCounts({ ...counts, [p.id]: parseInt(e.target.value) || 0 })}
                      className="w-16 rounded border border-neutral-300 p-1 text-center font-bold font-tabular text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold">
                    <span className={variance === 0 ? 'text-neutral-400' : variance > 0 ? 'text-blue-600' : 'text-red-600'}>
                      {variance > 0 ? `+${variance}` : variance}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      variance === 0
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                    }`}>
                      {variance === 0 ? 'VERIFIED' : 'VARIANCE'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Real movement history (server ledger — no mock rows) */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-800/50">
          <div>
            <h2 className="text-xs font-bold text-neutral-900 dark:text-white">
              <History className="mr-1 inline h-3.5 w-3.5" />
              Recent Stock Movements
            </h2>
            <p className="text-[10px] text-neutral-400">
              Every quantity change is written atomically with an audit entry
            </p>
          </div>
          <button
            onClick={() => { loadMovements(); }}
            className="rounded border border-neutral-300 p-1.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            title="Refresh movements"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Product</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4 text-center">Change</th>
              <th className="py-3 px-4 text-center">Balance</th>
              <th className="py-3 px-4">Reason</th>
              <th className="py-3 px-4">Staff</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {movements.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-neutral-400">
                  <p className="text-xs">
                    No stock movements recorded yet. Opening stock, sales and
                    adjustments all appear here.
                  </p>
                </td>
              </tr>
            )}

            {movements.map(m => (
              <tr key={m.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="py-2.5 px-4 font-mono text-[11px] text-neutral-500 whitespace-nowrap">
                  {m.timestamp}
                </td>
                <td className="py-2.5 px-4 font-bold text-neutral-900 dark:text-white">
                  {m.productName}
                  <span className="block text-[10px] font-normal font-mono text-neutral-400">{m.sku}</span>
                </td>
                <td className="py-2.5 px-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    m.type === 'SALE'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : m.type === 'PURCHASE' || m.type === 'OPENING_STOCK'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    {m.type}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-center font-mono font-bold">
                  <span className={m.quantityDelta > 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-center font-tabular text-neutral-500">
                  {m.previousStock} → <strong className="text-neutral-900 dark:text-white">{m.newStock}</strong>
                </td>
                <td className="py-2.5 px-4 text-[11px] text-neutral-500">
                  {m.reason || m.referenceId}
                </td>
                <td className="py-2.5 px-4 text-[11px] text-neutral-500">
                  {m.performedBy}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
