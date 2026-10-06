import React, { useCallback, useEffect, useState } from 'react';
import { Customer } from '../types';
import { customersService, CustomerSummary } from '../services/customers';
import { authService } from '../services/auth';
import { ApiError } from '../services/api';
import { useApp } from '../context/AppContext';
import { CollectPaymentModal } from '../components/customers/CollectPaymentModal';
import {
  Search,
  CheckCircle,
  Banknote,
  Users,
} from 'lucide-react';

export const CreditPage: React.FC = () => {
  const { navigateTo } = useApp();
  const canPay = authService.can('customer:payment');

  const [debtors, setDebtors] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [payCustomer, setPayCustomer] = useState<{
    id: string;
    name: string;
    code?: string;
    outstandingBalance: number;
  } | null>(null);

  // Server-side dues list (has_dues=true) for the table, plus the DB-computed
  // book totals for the header. The total NEVER comes from summing this page:
  // the list is capped (page_size), the ledger is not.
  const loadDebtors = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [listRes, summaryRes] = await Promise.all([
        customersService.getAll({ hasDues: true }),
        customersService.summary(),
      ]);
      setDebtors(listRes.data);
      setSummary(summaryRes.data);
    } catch (err) {
      setDebtors([]);
      setSummary(null);
      setLoadError(err instanceof ApiError ? err.message : 'Could not load khata balances');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDebtors();
  }, [loadDebtors]);

  // Authoritative figures from GET /customers/summary (0 until it loads).
  const totalOutstanding = summary?.totalReceivables ?? 0;
  const debtorCount = summary?.debtorCount ?? 0;
  // Rows shown can be fewer than the real debtor count (capped page).
  const isTruncated = summary !== null && debtors.length < debtorCount;
  const filtered = debtors.filter(c => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      c.name.toLowerCase().includes(term) ||
      c.phone.includes(term) ||
      (c.code ?? '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Khata / Customer Credit Ledger
          </h1>
          <p className="text-xs text-neutral-500">
            Outstanding receivables, credit limits, and payment collection — every balance comes
            from the server-side khata ledger
          </p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-2 dark:border-red-900/60 dark:bg-red-950/40">
          <span className="text-[11px] font-semibold text-red-700 dark:text-red-300">
            Total Khata Receivables ({summary ? `${debtorCount} customer${debtorCount === 1 ? '' : 's'}` : '…'}):
          </span>
          <p className="text-lg font-black font-tabular text-red-900 dark:text-red-200">
            {summary
              ? `₹${totalOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
              : '—'}
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

      {loadError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {loadError}
        </p>
      )}

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
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-neutral-400">
                  Loading khata balances…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-neutral-400">
                  <CheckCircle className="mx-auto h-8 w-8 stroke-1 text-emerald-500 mb-2" />
                  <p className="font-semibold text-xs text-neutral-600 dark:text-neutral-300">
                    {search ? 'No customer with dues matches this search.' : 'No outstanding credit balances found.'}
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    {search ? 'Try a different name or phone.' : 'All customer accounts are completely settled.'}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map(c => {
                const utilPercent =
                  c.creditLimit > 0
                    ? Math.min(100, Math.round((c.outstandingBalance / c.creditLimit) * 100))
                    : 100;
                return (
                  <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-neutral-900 dark:text-white">{c.name}</span>
                        {c.code && <span className="font-mono text-[10px] text-neutral-400">{c.code}</span>}
                        {c.active === false && (
                          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                            INACTIVE
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-neutral-500 font-mono text-[11px]">{c.phone}</td>
                    <td className="py-3 px-4 text-right font-tabular text-neutral-500">
                      {c.creditLimit > 0 ? `₹${c.creditLimit.toFixed(2)}` : <span title="Credit disabled (₹0 limit)">—</span>}
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
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => navigateTo('/customers')}
                        className="mr-1.5 rounded border border-neutral-200 px-2 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                        title="Open the customer's khata ledger"
                      >
                        Ledger
                      </button>
                      {canPay ? (
                        <button
                          onClick={() =>
                            setPayCustomer({
                              id: c.id,
                              name: c.name,
                              code: c.code,
                              outstandingBalance: c.outstandingBalance,
                            })
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs"
                        >
                          <Banknote className="h-3.5 w-3.5" />
                          Collect Payment
                        </button>
                      ) : (
                        <span className="inline-block text-[11px] text-neutral-400" title="Ask an admin to record payments">
                          View only
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && !loadError && isTruncated && (
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Showing the first {debtors.length} of {debtorCount} debtors with dues — the total
          above is computed by the server across all of them. Search to narrow the list.
        </p>
      )}

      {!isLoading && !loadError && debtors.length === 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
          <Users className="mx-auto mb-2 h-6 w-6 text-neutral-300" />
          Khata receivables update in real time as credit sales and settlements are posted.
        </div>
      )}

      {/* Collect Payment Modal */}
      <CollectPaymentModal
        customer={payCustomer}
        onClose={() => setPayCustomer(null)}
        onPaid={() => loadDebtors()}
      />
    </div>
  );
};
