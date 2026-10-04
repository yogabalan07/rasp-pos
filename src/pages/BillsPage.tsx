import React, { useState, useEffect } from 'react';
import { Sale } from '../types';
import { salesService } from '../services/sales';
import { ApiError } from '../services/api';
import { ReceiptModal } from '../components/pos/ReceiptModal';
import { 
  Search, 
  Printer, 
  RotateCcw, 
  Receipt, 
  CheckCircle2, 
  Clock, 
  CreditCard, 
  Calendar,
  Filter
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const BillsPage: React.FC = () => {
  const { navigateTo, showToast } = useApp();
  const [bills, setBills] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('ALL');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [reprintId, setReprintId] = useState<string | null>(null);

  // Debounce the bill search box (server does the matching).
  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setDebouncedSearch('');
      return;
    }
    const timer = setTimeout(() => setDebouncedSearch(term), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, dateFrom, dateTo]);

  const loadBills = async () => {
    setIsLoading(true);
    try {
      const res = await salesService.getAll({
        q: debouncedSearch,
        dateFrom,
        dateTo,
        pageSize: 100,
      });
      setBills(res.data);
      setTotal(res.meta?.total ?? res.data.length);
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : 'Unable to load sales history',
        'error',
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Tender filter is client-side on top of the server's page of results.
  const filteredBills = bills.filter(
    b => filterMethod === 'ALL' || b.paymentMethod === filterMethod,
  );

  /** Reprint re-reads the immutable receipt from the server (never a stale copy). */
  const handleReprint = async (bill: Sale) => {
    setReprintId(bill.id);
    try {
      const res = await salesService.getById(bill.id);
      if (res.data) setSelectedSale(res.data);
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : 'Unable to load receipt',
        'error',
      );
    } finally {
      setReprintId(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Sales Invoices &amp; Bills (F7)
          </h1>
          <p className="text-xs text-neutral-500">
            View completed transactions, reprint receipts, and process customer returns
          </p>
        </div>

        <button
          onClick={() => navigateTo('/pos')}
          className="rounded-lg bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
        >
          New Bill (F1)
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by Bill #, Customer Name, or Phone..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Calendar className="h-3.5 w-3.5 text-neutral-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            title="From date"
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs text-neutral-700 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          />
          <span className="text-neutral-400">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            title="To date"
            className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs text-neutral-700 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-neutral-500">Tender:</span>
          {['ALL', 'CASH', 'UPI', 'CARD', 'CREDIT'].map(m => (
            <button
              key={m}
              onClick={() => setFilterMethod(m)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filterMethod === m
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-semibold'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Bills Data Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Invoice / Bill #</th>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Items</th>
              <th className="py-3 px-4">Payment</th>
              <th className="py-3 px-4 text-right">Grand Total</th>
              <th className="py-3 px-4 text-center">Cloud Sync</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {isLoading && bills.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-neutral-400">
                  <Receipt className="mx-auto h-8 w-8 stroke-1 text-neutral-300 mb-2 animate-pulse" />
                  <p>Loading sales history from local server…</p>
                </td>
              </tr>
            ) : filteredBills.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-neutral-400">
                  <Receipt className="mx-auto h-8 w-8 stroke-1 text-neutral-300 mb-2" />
                  <p>No invoices found matching your search.</p>
                  {total > 0 && (
                    <p className="mt-1 text-[11px] text-neutral-400">
                      {total} sales exist — clear the filters to see them.
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              filteredBills.map(bill => (
                <tr key={bill.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="py-3 px-4 font-mono font-bold text-neutral-900 dark:text-white">
                    {bill.billNumber}
                  </td>
                  <td className="py-3 px-4 text-neutral-500 whitespace-nowrap">
                    {bill.timestamp}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-neutral-900 dark:text-white">{bill.customerName}</p>
                    {bill.customerPhone && (
                      <p className="text-[10px] text-neutral-400 font-mono">{bill.customerPhone}</p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-neutral-600 dark:text-neutral-300">
                    {bill.items.reduce((acc, i) => acc + i.quantity, 0)} items ({bill.items.length} lines)
                  </td>
                  <td className="py-3 px-4">
                    <span className="rounded bg-neutral-100 px-2 py-0.5 font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                      {bill.paymentMethod}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-bold font-tabular text-neutral-900 dark:text-white">
                    ₹{bill.grandTotal.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {bill.syncedToCloud ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Synced
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        Edge Cached
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                    <button
                      onClick={() => handleReprint(bill)}
                      disabled={reprintId === bill.id}
                      className="rounded p-1 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-800"
                      title="Reprint Receipt"
                    >
                      <Printer className={`h-4 w-4 ${reprintId === bill.id ? 'animate-pulse' : ''}`} />
                    </button>
                    <button
                      onClick={() => navigateTo('/sales-returns')}
                      className="rounded p-1 text-neutral-600 hover:text-amber-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                      title="Process Return"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-neutral-400">
        Showing {filteredBills.length} of {total} sales on this page (server-side search &amp; date filters).
      </p>

      {/* Reprint Receipt Modal */}
      {selectedSale && (
        <ReceiptModal
          isOpen={!!selectedSale}
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onNewSale={() => {
            setSelectedSale(null);
            navigateTo('/pos');
          }}
        />
      )}
    </div>
  );
};
