import React, { useState, useEffect } from 'react';
import { BatchItem } from '../types';
import { inventoryService } from '../services/inventory';
import { 
  CalendarClock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Search, 
  Filter, 
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const BatchesPage: React.FC = () => {
  const { navigateTo } = useApp();
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'NEAR_EXPIRY' | 'EXPIRED'>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    const res = await inventoryService.getBatches();
    setBatches(res.data);
  };

  const filtered = batches.filter(b => {
    const matchesFilter = 
      filter === 'ALL' ||
      (filter === 'NEAR_EXPIRY' && b.status === 'NEAR_EXPIRY') ||
      (filter === 'EXPIRED' && b.status === 'EXPIRED');
    const matchesSearch = 
      b.productName.toLowerCase().includes(search.toLowerCase()) ||
      b.batchNumber.toLowerCase().includes(search.toLowerCase()) ||
      b.sku.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const nearExpiryCount = batches.filter(b => b.status === 'NEAR_EXPIRY').length;
  const expiredCount = batches.filter(b => b.status === 'EXPIRED').length;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Batch &amp; Expiry Tracking (FEFO)
          </h1>
          <p className="text-xs text-neutral-500">
            First Expiry, First Out inventory governance with proactive shelf-life alerts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span>{nearExpiryCount} Near Expiry</span>
          </span>
          {expiredCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-800 border border-red-200 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300">
              <XCircle className="h-3.5 w-3.5 text-red-600" />
              <span>{expiredCount} Expired</span>
            </span>
          )}
        </div>
      </div>

      {/* FEFO Banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/60 dark:bg-blue-950/30 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-950 dark:text-blue-200">
          <h4 className="font-bold text-sm text-blue-900 dark:text-blue-100">
            Automated FEFO (First Expiry → First Out) Protocol Active
          </h4>
          <p className="mt-0.5 text-blue-800 dark:text-blue-300 leading-relaxed">
            When cashier scans an item in POS, batches with closest expiration dates are automatically prioritized for billing first to prevent retail stock write-offs.
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by Product Name, Batch Number, or SKU..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="h-3.5 w-3.5 text-neutral-400" />
          {[
            { id: 'ALL', label: 'All Batches' },
            { id: 'NEAR_EXPIRY', label: 'Near Expiry (<30 Days)' },
            { id: 'EXPIRED', label: 'Expired' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Batches Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Product Name</th>
              <th className="py-3 px-4">Batch Number</th>
              <th className="py-3 px-4">Mfg Date</th>
              <th className="py-3 px-4">Expiry Date</th>
              <th className="py-3 px-4 text-center">Batch Quantity</th>
              <th className="py-3 px-4 text-right">Selling Price</th>
              <th className="py-3 px-4 text-center">Shelf Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.map(b => (
              <tr key={b.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="py-3 px-4">
                  <p className="font-bold text-neutral-900 dark:text-white">{b.productName}</p>
                  <p className="text-[10px] text-neutral-400 font-mono">{b.sku}</p>
                </td>
                <td className="py-3 px-4 font-mono font-bold text-neutral-800 dark:text-neutral-200">
                  {b.batchNumber}
                </td>
                <td className="py-3 px-4 text-neutral-500 font-mono text-[11px]">
                  {b.mfgDate}
                </td>
                <td className="py-3 px-4 font-mono text-[11px] font-bold text-neutral-900 dark:text-white">
                  {b.expiryDate}
                </td>
                <td className="py-3 px-4 text-center font-bold font-tabular text-sm">
                  {b.quantity}
                </td>
                <td className="py-3 px-4 text-right font-bold font-tabular text-neutral-900 dark:text-white">
                  ₹{b.sellingPrice.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={`inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-[10px] font-bold ${
                    b.status === 'FRESH'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : b.status === 'NEAR_EXPIRY'
                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                      : 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200'
                  }`}>
                    {b.status === 'FRESH' && <CheckCircle className="h-3 w-3 text-emerald-600" />}
                    {b.status === 'NEAR_EXPIRY' && <AlertTriangle className="h-3 w-3 text-amber-600" />}
                    {b.status === 'EXPIRED' && <XCircle className="h-3 w-3 text-red-600" />}
                    <span>
                      {b.status === 'FRESH'
                        ? `${b.daysToExpiry} days left`
                        : b.status === 'NEAR_EXPIRY'
                        ? `Expires in ${b.daysToExpiry} days`
                        : `Expired (${Math.abs(b.daysToExpiry)} days ago)`}
                    </span>
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => navigateTo('/offers')}
                    className="rounded border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200"
                    title="Create flash discount to clear stock"
                  >
                    Clearance Deal
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
