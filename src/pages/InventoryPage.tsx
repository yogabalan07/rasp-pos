import React, { useState, useEffect, useCallback } from 'react';
import { StockMovement } from '../types';
import { inventoryService, InventoryItem, InventorySummary, StockStatus, MovementType } from '../services/inventory';
import { ApiError } from '../services/api';
import { useApp } from '../context/AppContext';
import { 
  Boxes, 
  AlertTriangle, 
  History, 
  Search, 
  X,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const PAGE_SIZE = 25;
const MOVEMENT_PAGE_SIZE = 50;

const STATUS_LABEL: Record<StockStatus, string> = {
  IN_STOCK: 'In Stock',
  LOW_STOCK: 'Low Stock',
  OUT_OF_STOCK: 'Out of Stock',
};

const STATUS_BADGE: Record<StockStatus, string> = {
  IN_STOCK: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  LOW_STOCK: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  OUT_OF_STOCK: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

const rupees = (paise: number): number => paise / 100;

export const InventoryPage: React.FC = () => {
  const { showToast } = useApp();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movTotal, setMovTotal] = useState(0);
  const [movPages, setMovPages] = useState(1);
  const [movPage, setMovPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'CURRENT' | 'MOVEMENTS'>('CURRENT');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'ALL' | StockStatus>('ALL');
  const [movementFilter, setMovementFilter] = useState<'ALL' | MovementType>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Adjustment modal state
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<InventoryItem | null>(null);
  const [adjustmentDelta, setAdjustmentDelta] = useState<string>('0');
  const [adjustmentReason, setAdjustmentReason] = useState('Physical count discrepancy');
  const [isOpeningOpen, setIsOpeningOpen] = useState(false);
  const [openingQty, setOpeningQty] = useState('0');
  const [openingReason, setOpeningReason] = useState('Opening stock on first count');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, stockFilter]);

  const loadStock = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await inventoryService.listPage({
        q: debouncedSearch || undefined,
        stockStatus: stockFilter === 'ALL' ? undefined : stockFilter,
        page,
        pageSize: PAGE_SIZE,
      });
      setItems(res.data.items);
      setSummary(res.data.summary);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (err) {
      setItems([]);
      setSummary(null);
      setTotal(0);
      setLoadError(err instanceof ApiError ? err.message : 'Could not load inventory');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, stockFilter, page]);

  const loadMovements = useCallback(async () => {
    try {
      const res = await inventoryService.listMovements({
        movementType: movementFilter === 'ALL' ? undefined : movementFilter,
        page: movPage,
        pageSize: MOVEMENT_PAGE_SIZE,
      });
      setMovements(res.data.items);
      setMovTotal(res.data.total);
      setMovPages(res.data.pages);
    } catch (err) {
      setMovements([]);
      showToast(err instanceof ApiError ? err.message : 'Could not load movements', 'error');
    }
  }, [movementFilter, movPage, showToast]);

  useEffect(() => {
    loadStock();
  }, [loadStock]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  const handleOpenAdjust = (p: InventoryItem) => {
    setSelectedProduct(p);
    setAdjustmentDelta('0');
    setAdjustmentReason('Damaged in transit / handling');
    setIsAdjustOpen(true);
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    const delta = parseInt(adjustmentDelta) || 0;
    if (delta === 0) {
      showToast('Adjustment quantity cannot be 0', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      await inventoryService.recordStockAdjustment(
        selectedProduct.productId,
        selectedProduct.productName,
        selectedProduct.sku,
        delta,
        selectedProduct.quantity,
        adjustmentReason,
      );
      showToast(`Stock updated for ${selectedProduct.productName}`, 'success');
      setIsAdjustOpen(false);
      loadStock();
      loadMovements();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Adjustment failed', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenOpening = (p: InventoryItem) => {
    setSelectedProduct(p);
    setOpeningQty('0');
    setOpeningReason('Opening stock on first count');
    setIsOpeningOpen(true);
  };

  const handleSaveOpening = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    const qty = parseInt(openingQty);
    if (Number.isNaN(qty) || qty < 0) {
      showToast('Opening stock must be a non-negative number', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      await inventoryService.setOpeningStock(selectedProduct.productId, qty, openingReason);
      showToast(`Opening stock recorded for ${selectedProduct.productName}`, 'success');
      setIsOpeningOpen(false);
      loadStock();
      loadMovements();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not record opening stock', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const totalUnits = summary?.units ?? 0;
  const totalCostValuation = rupees(summary?.costValuePaise ?? 0);
  const totalRetailValuation = rupees(summary?.sellingValuePaise ?? 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Stock Inventory &amp; Ledger
          </h1>
          <p className="text-xs text-neutral-500">
            Real-time stock valuation, inventory movements, and manual adjustments
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg bg-neutral-100 p-1 text-xs font-medium dark:bg-neutral-800">
          <button
            onClick={() => setActiveTab('CURRENT')}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              activeTab === 'CURRENT'
                ? 'bg-white font-bold text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Current Stock ({total})
          </button>
          <button
            onClick={() => setActiveTab('MOVEMENTS')}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              activeTab === 'MOVEMENTS'
                ? 'bg-white font-bold text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Movement Ledger ({movTotal})
          </button>
        </div>
      </div>

      {/* Valuation & KPI Cards (server-computed over the whole filtered set) */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Total Items in Stock</span>
          <p className="mt-1 text-xl font-bold text-neutral-900 dark:text-white font-tabular">{totalUnits} units</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Across {summary?.skuCount ?? 0} catalog SKUs</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Inventory Valuation (Cost)</span>
          <p className="mt-1 text-xl font-bold text-neutral-900 dark:text-white font-tabular">₹{totalCostValuation.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Purchase price basis</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Potential Retail Value</span>
          <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-400 font-tabular">₹{totalRetailValuation.toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Projected revenue</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Potential Gross Margin</span>
          <p className="mt-1 text-xl font-bold text-neutral-900 dark:text-white font-tabular">
            ₹{(totalRetailValuation - totalCostValuation).toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-neutral-400 mt-0.5">
            {((totalRetailValuation - totalCostValuation) / (totalRetailValuation || 1) * 100).toFixed(1)}% Avg Spread
          </p>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search stock item by name, SKU, or barcode..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        <select
          value={stockFilter}
          onChange={e => setStockFilter(e.target.value as typeof stockFilter)}
          className="rounded border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          <option value="ALL">All Stock Status</option>
          <option value="IN_STOCK">In Stock</option>
          <option value="LOW_STOCK">Low Stock</option>
          <option value="OUT_OF_STOCK">Out of Stock</option>
        </select>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{loadError}</span>
          <button onClick={loadStock} className="ml-auto font-semibold underline">Retry</button>
        </div>
      )}

      {/* Tab: Current Stock */}
      {activeTab === 'CURRENT' && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
              <tr>
                <th className="py-3 px-4">Item &amp; Category</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4 text-center">Available Stock</th>
                <th className="py-3 px-4 text-center">Reorder Level</th>
                <th className="py-3 px-4 text-right">Cost Value</th>
                <th className="py-3 px-4 text-right">Retail Value</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-neutral-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    <p className="mt-2 text-xs">Loading stock…</p>
                  </td>
                </tr>
              )}

              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-neutral-400">
                    <Boxes className="mx-auto h-6 w-6" />
                    <p className="mt-2 text-xs">No stock items match the current filters.</p>
                  </td>
                </tr>
              )}

              {!isLoading && items.map(p => (
                <tr key={p.productId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="py-3 px-4">
                    <p className="font-bold text-neutral-900 dark:text-white">{p.productName}</p>
                    <p className="text-[10px] text-neutral-400">
                      {p.category}{p.subcategory ? ` · ${p.subcategory}` : ''}
                    </p>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-neutral-500">
                    {p.sku}
                  </td>
                  <td className="py-3 px-4 text-center font-bold font-tabular text-sm">
                    <span className={p.stockStatus === 'IN_STOCK' ? 'text-neutral-900 dark:text-white' : 'text-amber-600 dark:text-amber-400'}>
                      {p.quantity}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-tabular text-neutral-400">
                    {p.reorderLevel}
                  </td>
                  <td className="py-3 px-4 text-right font-tabular text-neutral-600 dark:text-neutral-300">
                    ₹{rupees(p.costValuePaise).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold font-tabular text-neutral-900 dark:text-white">
                    ₹{rupees(p.sellingValuePaise).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_BADGE[p.stockStatus]}`}>
                      {STATUS_LABEL[p.stockStatus]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap space-x-1">
                    {!p.openingRecorded && (
                      <button
                        onClick={() => handleOpenOpening(p)}
                        className="rounded border border-neutral-300 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        title="Record opening stock (once per product)"
                      >
                        Opening
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenAdjust(p)}
                      className="rounded border border-neutral-300 px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <span>{total} item{total === 1 ? '' : 's'} · Page {page} of {Math.max(pages, 1)}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="rounded border border-neutral-200 bg-white p-1 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
                title="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page >= pages || isLoading}
                className="rounded border border-neutral-200 bg-white p-1 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
                title="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Stock Movement Ledger */}
      {activeTab === 'MOVEMENTS' && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-800/50">
            <span className="text-[11px] font-semibold text-neutral-500">
              <History className="mr-1 inline h-3.5 w-3.5" />
              Every stock change, in order
            </span>
            <select
              value={movementFilter}
              onChange={e => setMovementFilter(e.target.value as typeof movementFilter)}
              className="rounded border border-neutral-200 bg-white px-2.5 py-1 text-[11px] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
            >
              <option value="ALL">All movement types</option>
              <option value="OPENING_STOCK">Opening Stock</option>
              <option value="SALE">Sale</option>
              <option value="PURCHASE">Purchase</option>
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="RETURN">Return</option>
            </select>
          </div>

          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-center">Change</th>
                <th className="py-3 px-4 text-center">Prev Stock</th>
                <th className="py-3 px-4 text-center">New Stock</th>
                <th className="py-3 px-4">Ref / Reason</th>
                <th className="py-3 px-4">Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {movements.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-neutral-400">
                    <History className="mx-auto h-6 w-6" />
                    <p className="mt-2 text-xs">
                      {movementFilter === 'ALL'
                        ? 'No stock movements recorded yet.'
                        : 'No movements of this type.'}
                    </p>
                  </td>
                </tr>
              )}

              {movements.map(m => (
                <tr key={m.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="py-3 px-4 text-neutral-500 font-mono text-[11px] whitespace-nowrap">
                    {m.timestamp}
                  </td>
                  <td className="py-3 px-4 font-bold text-neutral-900 dark:text-white">
                    {m.productName}
                  </td>
                  <td className="py-3 px-4">
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
                  <td className="py-3 px-4 text-center font-mono font-bold">
                    <span className={m.quantityDelta > 0 ? 'text-emerald-600' : 'text-red-600'}>
                      {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-tabular text-neutral-500">
                    {m.previousStock}
                  </td>
                  <td className="py-3 px-4 text-center font-tabular font-bold text-neutral-900 dark:text-white">
                    {m.newStock}
                  </td>
                  <td className="py-3 px-4 text-neutral-500">
                    <p className="font-mono text-[11px] text-neutral-800 dark:text-neutral-200">{m.referenceId}</p>
                    {m.reason && <p className="text-[10px] text-neutral-400 italic">{m.reason}</p>}
                  </td>
                  <td className="py-3 px-4 text-neutral-500 text-[11px]">
                    {m.performedBy}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <span>{movTotal} movement{movTotal === 1 ? '' : 's'} · Page {movPage} of {Math.max(movPages, 1)}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMovPage(p => Math.max(1, p - 1))}
                disabled={movPage <= 1}
                className="rounded border border-neutral-200 bg-white p-1 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
                title="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setMovPage(p => Math.min(movPages, p + 1))}
                disabled={movPage >= movPages}
                className="rounded border border-neutral-200 bg-white p-1 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
                title="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {isAdjustOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                Stock Adjustment
              </h2>
              <button onClick={() => setIsAdjustOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="p-5 space-y-4">
              <div>
                <p className="text-xs font-bold text-neutral-900 dark:text-white">{selectedProduct.productName}</p>
                <p className="text-[11px] text-neutral-500 font-mono">Current Stock: {selectedProduct.quantity} {selectedProduct.unit}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Adjustment Delta (Positive or Negative)
                </label>
                <input
                  type="number"
                  value={adjustmentDelta}
                  onChange={e => setAdjustmentDelta(e.target.value)}
                  placeholder="e.g. -2 or +10"
                  className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm font-bold font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
                <p className="text-[10px] text-neutral-400 mt-1">
                  New stock will be: <strong>{selectedProduct.quantity + (parseInt(adjustmentDelta) || 0)}</strong> units
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Adjustment Reason
                </label>
                <select
                  value={adjustmentReason}
                  onChange={e => setAdjustmentReason(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  <option value="Damaged in transit / handling">Damaged in transit / handling</option>
                  <option value="Physical count discrepancy">Physical count discrepancy</option>
                  <option value="Expired item write-off">Expired item write-off</option>
                  <option value="Customer return restock">Customer return restock</option>
                  <option value="Free promotional sample">Free promotional sample</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsAdjustOpen(false)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSaving ? 'Applying…' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Opening Stock Modal */}
      {isOpeningOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                Record Opening Stock
              </h2>
              <button onClick={() => setIsOpeningOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveOpening} className="p-5 space-y-4">
              <div>
                <p className="text-xs font-bold text-neutral-900 dark:text-white">{selectedProduct.productName}</p>
                <p className="text-[11px] text-neutral-500 font-mono">Current Stock: {selectedProduct.quantity} {selectedProduct.unit}</p>
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-neutral-500">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  Opening stock can be recorded only once per product. It writes an
                  OPENING_STOCK movement and an audit entry.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Opening Quantity
                </label>
                <input
                  type="number"
                  min={0}
                  value={openingQty}
                  onChange={e => setOpeningQty(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-sm font-bold font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Note
                </label>
                <input
                  type="text"
                  value={openingReason}
                  onChange={e => setOpeningReason(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsOpeningOpen(false)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSaving ? 'Saving…' : 'Record Opening Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
