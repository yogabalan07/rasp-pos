import React, { useState, useEffect } from 'react';
import { Customer } from '../types';
import { customersService } from '../services/customers';
import { useApp } from '../context/AppContext';
import { 
  CreditCard, 
  Search, 
  CheckCircle, 
  AlertCircle, 
  Phone, 
  Banknote, 
  QrCode, 
  X,
  FileText
} from 'lucide-react';

export const CreditPage: React.FC = () => {
  const { showToast } = useApp();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [collectAmount, setCollectAmount] = useState<string>('');
  const [collectMode, setCollectMode] = useState<'CASH' | 'UPI'>('UPI');
  const [collectNotes, setCollectNotes] = useState('');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    const res = await customersService.getAll();
    setCustomers(res.data);
  };

  const handleOpenCollect = (c: Customer) => {
    setSelectedCust(c);
    setCollectAmount(c.outstandingBalance.toString());
    setCollectNotes('Settlement receipt generated');
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCust) return;
    const amt = parseFloat(collectAmount) || 0;
    if (amt <= 0) {
      showToast('Payment amount must be greater than 0', 'warning');
      return;
    }

    await customersService.collectPayment(selectedCust.id, amt, collectNotes);
    showToast(`Payment of ₹${amt} collected for ${selectedCust.name}`, 'success');
    setSelectedCust(null);
    loadCustomers();
  };

  const creditCustomers = customers.filter(c => c.outstandingBalance > 0);
  const totalOutstanding = creditCustomers.reduce((acc, c) => acc + c.outstandingBalance, 0);

  const filtered = creditCustomers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Khata / Customer Credit Ledger
          </h1>
          <p className="text-xs text-neutral-500">
            Track customer dues, credit limits, payment collections, and receipt settlements
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-2 dark:border-red-900/60 dark:bg-red-950/40">
          <span className="text-[11px] font-semibold text-red-700 dark:text-red-300">Total Khata Receivables:</span>
          <p className="text-lg font-black font-tabular text-red-900 dark:text-red-200">
            ₹{totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search customers with outstanding khata balance..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>
      </div>

      {/* Credit Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Customer Name</th>
              <th className="py-3 px-4">Phone Number</th>
              <th className="py-3 px-4 text-right">Credit Limit</th>
              <th className="py-3 px-4 text-right">Outstanding Due</th>
              <th className="py-3 px-4 text-center">Limit Utilized</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-neutral-400">
                  <CheckCircle className="mx-auto h-8 w-8 stroke-1 text-emerald-500 mb-2" />
                  <p className="font-semibold text-xs text-neutral-600 dark:text-neutral-300">
                    No outstanding credit balances found.
                  </p>
                  <p className="text-[11px] text-neutral-400">All customer accounts are completely settled.</p>
                </td>
              </tr>
            ) : (
              filtered.map(c => {
                const utilPercent = Math.min(100, Math.round((c.outstandingBalance / (c.creditLimit || 1)) * 100));
                return (
                  <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <td className="py-3 px-4 font-bold text-neutral-900 dark:text-white">
                      {c.name}
                    </td>
                    <td className="py-3 px-4 text-neutral-500 font-mono text-[11px]">
                      {c.phone}
                    </td>
                    <td className="py-3 px-4 text-right font-tabular text-neutral-500">
                      ₹{c.creditLimit.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold font-tabular text-red-600">
                      ₹{c.outstandingBalance.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-1.5 w-16 bg-neutral-100 rounded-full overflow-hidden dark:bg-neutral-800">
                          <div 
                            className={`h-full rounded-full ${utilPercent > 80 ? 'bg-red-600' : 'bg-amber-500'}`} 
                            style={{ width: `${utilPercent}%` }} 
                          />
                        </div>
                        <span className="font-mono text-[10px] text-neutral-400">{utilPercent}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenCollect(c)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs"
                      >
                        Collect Payment
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Collect Payment Modal */}
      {selectedCust && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Collect Khata Payment</h2>
              <button onClick={() => setSelectedCust(null)} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-5 space-y-4">
              <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/40">
                <p className="text-xs font-bold text-neutral-900 dark:text-white">{selectedCust.name}</p>
                <p className="text-[11px] text-neutral-500 font-mono">Current Due: ₹{selectedCust.outstandingBalance.toFixed(2)}</p>
              </div>

              <div>
                <label className="text-xs font-semibold">Payment Amount to Collect (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={collectAmount}
                  onChange={e => setCollectAmount(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2.5 text-lg font-bold font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">Payment Mode</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setCollectMode('UPI')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold ${
                      collectMode === 'UPI' ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-950' : 'border-neutral-200 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
                    }`}
                  >
                    <QrCode className="h-4 w-4" />
                    <span>UPI / QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectMode('CASH')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold ${
                      collectMode === 'CASH' ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-950' : 'border-neutral-200 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
                    }`}
                  >
                    <Banknote className="h-4 w-4" />
                    <span>Cash Currency</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold">Receipt / Reference Note</label>
                <input
                  type="text"
                  value={collectNotes}
                  onChange={e => setCollectNotes(e.target.value)}
                  placeholder="e.g. Paid via GPay / Receipt #4421"
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setSelectedCust(null)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Record Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
