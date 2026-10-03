import React, { useState, useEffect } from 'react';
import { Product, StockMovement } from '../types';
import { productsService } from '../services/products';
import { inventoryService } from '../services/inventory';
import { useApp } from '../context/AppContext';
import { 
  Boxes, 
  ArrowUpDown, 
  Plus, 
  AlertTriangle, 
  CheckCircle, 
  History, 
  Search, 
  X,
  FileSpreadsheet
} from 'lucide-react';

export const InventoryPage: React.FC = () => {
  const { showToast } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [activeTab, setActiveTab] = useState<'CURRENT' | 'MOVEMENTS'>('CURRENT');
  const [search, setSearch] = useState('');
  
  // Adjustment modal state
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustmentDelta, setAdjustmentDelta] = useState<string>('0');
  const [adjustmentReason, setAdjustmentReason] = useState('Physical count discrepancy');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [pRes, mRes] = await Promise.all([
      productsService.getAll(),
      inventoryService.getMovements(),
    ]);
    setProducts(pRes.data);
    setMovements(mRes.data);
  };

  const handleOpenAdjust = (p: Product) => {
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

    await inventoryService.recordStockAdjustment(
      selectedProduct.id,
      selectedProduct.name,
      selectedProduct.sku,
      delta,
      selectedProduct.stock,
      adjustmentReason
    );

    await productsService.updateStock(selectedProduct.id, delta);
    showToast(`Stock updated for ${selectedProduct.name}`, 'success');
    setIsAdjustOpen(false);
    loadData();
  };

  const totalCostValuation = products.reduce((acc, p) => acc + p.purchasePrice * p.stock, 0);
  const totalRetailValuation = products.reduce((acc, p) => acc + p.sellingPrice * p.stock, 0);
  const totalUnits = products.reduce((acc, p) => acc + p.stock, 0);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

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
            Current Stock ({products.length})
          </button>
          <button
            onClick={() => setActiveTab('MOVEMENTS')}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              activeTab === 'MOVEMENTS'
                ? 'bg-white font-bold text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            Movement Ledger ({movements.length})
          </button>
        </div>
      </div>

      {/* Valuation & KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Total Items in Stock</span>
          <p className="mt-1 text-xl font-bold text-neutral-900 dark:text-white font-tabular">{totalUnits} units</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Across {products.length} catalog SKUs</p>
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

      {/* Search Input */}
      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search stock item by name or SKU..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>
      </div>

      {/* Tab: Current Stock */}
      {activeTab === 'CURRENT' && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
              <tr>
                <th className="py-3 px-4">Item &amp; Category</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4 text-center">Available Stock</th>
                <th className="py-3 px-4 text-center">Min Threshold</th>
                <th className="py-3 px-4 text-right">Cost Value</th>
                <th className="py-3 px-4 text-right">Retail Value</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredProducts.map(p => (
                <tr key={p.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="py-3 px-4">
                    <p className="font-bold text-neutral-900 dark:text-white">{p.name}</p>
                    <p className="text-[10px] text-neutral-400">{p.categoryName}</p>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-neutral-500">
                    {p.sku}
                  </td>
                  <td className="py-3 px-4 text-center font-bold font-tabular text-sm">
                    <span className={p.stock <= p.minStock ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-900 dark:text-white'}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center font-tabular text-neutral-400">
                    {p.minStock}
                  </td>
                  <td className="py-3 px-4 text-right font-tabular text-neutral-600 dark:text-neutral-300">
                    ₹{(p.purchasePrice * p.stock).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold font-tabular text-neutral-900 dark:text-white">
                    ₹{(p.sellingPrice * p.stock).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      p.stock === 0 
                        ? 'bg-red-50 text-red-700' 
                        : p.stock <= p.minStock 
                        ? 'bg-amber-50 text-amber-700' 
                        : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {p.stock === 0 ? 'Out of Stock' : p.stock <= p.minStock ? 'Low Stock' : 'Optimal'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
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
        </div>
      )}

      {/* Tab: Stock Movement Ledger */}
      {activeTab === 'MOVEMENTS' && (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
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
                        : m.type === 'PURCHASE'
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
                <p className="text-xs font-bold text-neutral-900 dark:text-white">{selectedProduct.name}</p>
                <p className="text-[11px] text-neutral-500 font-mono">Current Stock: {selectedProduct.stock} {selectedProduct.unit}</p>
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
                  New stock will be: <strong>{selectedProduct.stock + (parseInt(adjustmentDelta) || 0)}</strong> units
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
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Apply Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
