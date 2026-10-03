import React, { useState, useEffect } from 'react';
import { Warehouse, Product } from '../types';
import { inventoryService } from '../services/inventory';
import { productsService } from '../services/products';
import { useApp } from '../context/AppContext';
import { 
  Warehouse as WarehouseIcon, 
  ArrowRightLeft, 
  Boxes, 
  MapPin, 
  User, 
  Check, 
  Plus, 
  X,
  Truck
} from 'lucide-react';

export const WarehousesPage: React.FC = () => {
  const { showToast } = useApp();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isTransferOpen, setIsTransferOpen] = useState(false);

  // Transfer form
  const [sourceWh, setSourceWh] = useState('');
  const [destWh, setDestWh] = useState('');
  const [selectedProd, setSelectedProd] = useState('');
  const [transferQty, setTransferQty] = useState('20');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [wRes, pRes] = await Promise.all([
      inventoryService.getWarehouses(),
      productsService.getAll(),
    ]);
    setWarehouses(wRes.data);
    setProducts(pRes.data);
    if (wRes.data.length >= 2) {
      setSourceWh(wRes.data[0].id);
      setDestWh(wRes.data[1].id);
    }
    if (pRes.data.length > 0) setSelectedProd(pRes.data[0].id);
  };

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceWh === destWh) {
      showToast('Source and destination cannot be identical', 'warning');
      return;
    }
    const prod = products.find(p => p.id === selectedProd);
    showToast(`Stock transfer initiated: ${transferQty} units of ${prod?.name}`, 'success');
    setIsTransferOpen(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Warehouses &amp; Stock Transfers
          </h1>
          <p className="text-xs text-neutral-500">
            Multi-location inventory tracking, storage capacities, and inter-hub transfers
          </p>
        </div>

        <button
          onClick={() => setIsTransferOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 transition-colors"
        >
          <ArrowRightLeft className="h-4 w-4" />
          <span>Inter-Warehouse Transfer</span>
        </button>
      </div>

      {/* Warehouse Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {warehouses.map(wh => (
          <div
            key={wh.id}
            className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold text-neutral-400">{wh.code}</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded">
                  Operational
                </span>
              </div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white mt-1">{wh.name}</h3>

              <div className="mt-3 space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                  <span className="truncate">{wh.location}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                  <span>Manager: {wh.manager}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Boxes className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                  <span>Total Stock: <strong className="text-neutral-900 dark:text-white">{wh.totalStockItems} items</strong></span>
                </div>
              </div>

              {/* Capacity meter */}
              <div className="mt-4">
                <div className="flex justify-between text-[11px] text-neutral-500 mb-1">
                  <span>Capacity Utilization</span>
                  <span className="font-bold font-mono">{wh.capacityPercentage}%</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden dark:bg-neutral-800">
                  <div
                    className={`h-full rounded-full ${wh.capacityPercentage > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${wh.capacityPercentage}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
              <button
                onClick={() => setIsTransferOpen(true)}
                className="text-xs text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 font-semibold"
              >
                Transfer In / Out →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Transfer Modal */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Inter-Warehouse Transfer</h2>
              <button onClick={() => setIsTransferOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleTransfer} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold">From Source Warehouse *</label>
                <select
                  value={sourceWh}
                  onChange={e => setSourceWh(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold">To Destination Warehouse *</label>
                <select
                  value={destWh}
                  onChange={e => setDestWh(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold">Select Product *</label>
                <select
                  value={selectedProd}
                  onChange={e => setSelectedProd(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold">Quantity to Dispatch</label>
                <input
                  type="number"
                  min="1"
                  value={transferQty}
                  onChange={e => setTransferQty(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsTransferOpen(false)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-neutral-900 px-5 py-2 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
                >
                  Dispatch Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
