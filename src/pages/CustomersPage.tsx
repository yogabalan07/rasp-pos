import React, { useCallback, useEffect, useState } from 'react';
import { Customer } from '../types';
import {
  customersService,
  CustomerDetail,
  CustomerLedgerEntry,
  CustomerSaleRow,
} from '../services/customers';
import { authService } from '../services/auth';
import { ApiError } from '../services/api';
import { useApp } from '../context/AppContext';
import { CollectPaymentModal } from '../components/customers/CollectPaymentModal';
import {
  Users,
  Plus,
  Search,
  X,
  History,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Eye,
  FileText,
} from 'lucide-react';

const PAGE_SIZE = 25;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const inr = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const CustomersPage: React.FC = () => {
  const { showToast } = useApp();
  const canWrite = authService.can('customer:write');
  const canPay = authService.can('customer:payment');

  // List (server-side search + filter + pagination)
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create / edit form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [creditLimit, setCreditLimit] = useState('5000');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);

  // Detail modal (profile + sales + ledger)
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailTab, setDetailTab] = useState<'SALES' | 'LEDGER'>('SALES');
  const [sales, setSales] = useState<CustomerSaleRow[]>([]);
  const [salesPage, setSalesPage] = useState(1);
  const [salesPages, setSalesPages] = useState(1);
  const [ledger, setLedger] = useState<CustomerLedgerEntry[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPages, setLedgerPages] = useState(1);
  const [ledgerOutstanding, setLedgerOutstanding] = useState(0);

  // Collect dues
  const [payCustomer, setPayCustomer] = useState<{
    id: string;
    name: string;
    code?: string;
    outstandingBalance: number;
  } | null>(null);

  // ------------------------------------------------------------------ list
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await customersService.listPage({
        q: debouncedSearch || undefined,
        active: statusFilter === 'ALL' ? undefined : statusFilter === 'ACTIVE',
        page,
        pageSize: PAGE_SIZE,
      });
      setCustomers(res.data.items);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (err) {
      setCustomers([]);
      setTotal(0);
      setLoadError(err instanceof ApiError ? err.message : 'Could not load customers');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, statusFilter, page]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // ------------------------------------------------------------- detail
  const loadTabData = useCallback(
    async (id: string, tab: 'SALES' | 'LEDGER', salesPg: number, ledgerPg: number) => {
      try {
        if (tab === 'SALES') {
          const res = await customersService.listSales(id, { page: salesPg, pageSize: 10 });
          setSales(res.data.items);
          setSalesPages(res.data.pages);
        } else {
          const res = await customersService.listLedger(id, { page: ledgerPg, pageSize: 10 });
          setLedger(res.data.items);
          setLedgerPages(res.data.pages);
          setLedgerOutstanding(res.data.outstanding);
        }
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Could not load history', 'error');
      }
    },
    [showToast],
  );

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetail(null);
    setDetailTab('SALES');
    setSalesPage(1);
    setLedgerPage(1);
    try {
      const res = await customersService.getById(id);
      setDetail(res.data);
      loadTabData(id, 'SALES', 1, 1);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not load customer', 'error');
      setDetailId(null);
    }
  };

  const closeDetail = () => {
    setDetailId(null);
    setDetail(null);
  };

  const switchTab = (tab: 'SALES' | 'LEDGER') => {
    setDetailTab(tab);
    if (detailId) loadTabData(detailId, tab, salesPage, ledgerPage);
  };

  // --------------------------------------------------------------- form
  const openCreate = () => {
    setEditing(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setGstin('');
    setCreditLimit('5000');
    setNotes('');
    setActive(true);
    setIsFormOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setName(c.name);
    setPhone(c.phone);
    setEmail(c.email || '');
    setAddress(c.address || '');
    setGstin(c.gstin || '');
    setCreditLimit(String(c.creditLimit));
    setNotes(c.notes || '');
    setActive(c.active !== false);
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      showToast('Name and phone are required', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      if (editing) {
        await customersService.update(editing.id, {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          gstin: gstin.trim(),
          creditLimit: parseFloat(creditLimit) || 0,
          notes: notes.trim(),
          active,
        });
        showToast(`Customer ${name.trim()} updated`, 'success');
      } else {
        await customersService.create({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          gstin: gstin.trim() || undefined,
          creditLimit: parseFloat(creditLimit) || 0,
          notes: notes.trim() || undefined,
        });
        showToast(`Customer ${name.trim()} created`, 'success');
      }
      setIsFormOpen(false);
      loadCustomers();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not save customer', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const statusBadge = (c: Customer) =>
    c.active === false ? (
      <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        INACTIVE
      </span>
    ) : (
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
        ACTIVE
      </span>
    );

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Customers &amp; Khata
          </h1>
          <p className="text-xs text-neutral-500">
            Customer directory, credit limits, sales history, and the khata ledger
          </p>
        </div>

        {canWrite && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>New Customer</span>
          </button>
        )}
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, code or GSTIN..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>
        <div className="flex overflow-hidden rounded-lg border border-neutral-200 text-[11px] font-semibold dark:border-neutral-700">
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 ${
                statusFilter === f
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950'
                  : 'bg-white text-neutral-600 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-300'
              }`}
            >
              {f === 'ALL' ? 'All' : f === 'ACTIVE' ? 'Active' : 'Inactive'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        {loadError && (
          <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {loadError}
          </p>
        )}
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Phone / Email</th>
              <th className="py-3 px-4 text-center">Bills</th>
              <th className="py-3 px-4 text-right">Total Billed</th>
              <th className="py-3 px-4 text-right">Credit Limit</th>
              <th className="py-3 px-4 text-right">Khata Due</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {isLoading && customers.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-neutral-400">
                  Loading customers…
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-neutral-400">
                  <Users className="mx-auto h-8 w-8 stroke-1 text-neutral-300 mb-2" />
                  <p className="font-semibold text-xs text-neutral-600 dark:text-neutral-300">
                    {debouncedSearch || statusFilter !== 'ALL'
                      ? 'No customers match this filter.'
                      : 'No customers yet.'}
                  </p>
                  {canWrite && !debouncedSearch && statusFilter === 'ALL' && (
                    <button
                      onClick={openCreate}
                      className="mt-2 text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Add the first customer
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              customers.map(c => (
                <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-neutral-900 dark:text-white">{c.name}</p>
                      {c.code && <span className="font-mono text-[10px] text-neutral-400">{c.code}</span>}
                    </div>
                    {c.address && (
                      <p className="text-[10px] text-neutral-400 truncate max-w-xs">{c.address}</p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400 font-mono text-[11px]">
                    <p>{c.phone || '—'}</p>
                    {c.email && <p className="text-[10px] text-neutral-400">{c.email}</p>}
                  </td>
                  <td className="py-3 px-4 text-center font-tabular">{c.totalBills}</td>
                  <td className="py-3 px-4 text-right font-bold font-tabular text-neutral-900 dark:text-white">
                    {inr(c.totalSpent)}
                  </td>
                  <td className="py-3 px-4 text-right font-tabular text-neutral-500">
                    {c.creditLimit > 0 ? inr(c.creditLimit) : (
                      <span className="text-neutral-400" title="Credit sales disabled (₹0 limit)">
                        —
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold font-tabular">
                    {c.outstandingBalance > 0 ? (
                      <span className="text-red-600">{inr(c.outstandingBalance)}</span>
                    ) : (
                      <span className="text-emerald-700">₹0.00</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">{statusBadge(c)}</td>
                  <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                    <button
                      onClick={() => openDetail(c.id)}
                      className="rounded border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      title="View profile, sales & ledger"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {canWrite && (
                      <button
                        onClick={() => openEdit(c)}
                        className="rounded border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                        title="Edit customer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canPay && c.outstandingBalance > 0 && (
                      <button
                        onClick={() =>
                          setPayCustomer({
                            id: c.id,
                            name: c.name,
                            code: c.code,
                            outstandingBalance: c.outstandingBalance,
                          })
                        }
                        className="ml-1 rounded bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
                      >
                        Collect
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Server-side pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
          <span>
            {total} customer{total === 1 ? '' : 's'} · Page {page} of {Math.max(pages, 1)}
          </span>
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

      {/* Create / Edit Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <div>
                <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                  {editing ? 'Edit Customer' : 'Add Customer'}
                </h2>
                {editing?.code && (
                  <p className="text-[11px] font-mono text-neutral-400">{editing.code}</p>
                )}
              </div>
              <button onClick={() => setIsFormOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Ramesh Babu"
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold">Phone (7–15 digits) *</label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+91 98450 11223"
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs font-mono dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Email (optional)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold">Address / Locality</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">GSTIN (optional)</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={e => setGstin(e.target.value)}
                    placeholder="29AABCS1429B1Z2"
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs font-mono dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold">Credit Limit (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={creditLimit}
                    onChange={e => setCreditLimit(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                  <p className="mt-0.5 text-[10px] text-neutral-400">0 = credit sales disabled</p>
                </div>
                <div>
                  <label className="text-xs font-semibold">Notes (optional)</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="e.g. Pays on Sundays"
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              {editing && (
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={e => setActive(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Active (customers without dues may be deactivated at any time)
                </label>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  disabled={isSaving}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-3xl rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <div>
                <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                  {detail ? detail.name : 'Loading…'}
                  {detail?.code && (
                    <span className="ml-2 font-mono text-[11px] font-normal text-neutral-400">{detail.code}</span>
                  )}
                </h2>
                {detail && (
                  <p className="text-[11px] text-neutral-500 font-mono">
                    {detail.phone} {detail.email && `· ${detail.email}`}
                  </p>
                )}
              </div>
              <button onClick={closeDetail} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Stats */}
            {detail && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-400">Khata Due</p>
                  <p className={`text-sm font-black font-tabular ${detail.outstandingBalance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    {inr(detail.outstandingBalance)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-400">Available Credit</p>
                  <p className="text-sm font-black font-tabular text-neutral-900 dark:text-white">
                    {inr(Math.max(0, detail.availableCredit ?? detail.creditLimit - detail.outstandingBalance))}
                  </p>
                  <p className="text-[10px] text-neutral-400">of {inr(detail.creditLimit)} limit</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-400">Total Billed</p>
                  <p className="text-sm font-black font-tabular text-neutral-900 dark:text-white">
                    {inr(detail.totalSpent)} ({detail.totalBills} bills)
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-400">Credit / Paid</p>
                  <p className="text-sm font-black font-tabular text-neutral-900 dark:text-white">
                    {inr(detail.totalCreditSales)} / {inr(detail.totalPayments)}
                  </p>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-neutral-100 px-4 dark:border-neutral-800">
              {(
                [
                  { id: 'SALES', label: 'Sales History', icon: FileText },
                  { id: 'LEDGER', label: 'Khata Ledger', icon: History },
                ] as const
              ).map(t => {
                const Icon = t.icon;
                const on = detailTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => switchTab(t.id)}
                    className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold ${
                      on
                        ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                        : 'border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {!detail ? (
                <p className="py-8 text-center text-xs text-neutral-400">Loading profile…</p>
              ) : detailTab === 'SALES' ? (
                sales.length === 0 ? (
                  <p className="py-8 text-center text-xs text-neutral-400">No sales for this customer yet.</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="text-[11px] font-semibold text-neutral-500">
                      <tr>
                        <th className="py-2">Bill</th>
                        <th className="py-2">Date</th>
                        <th className="py-2">Payment</th>
                        <th className="py-2 text-right">Total</th>
                        <th className="py-2 text-right">On Khata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {sales.map(s => (
                        <tr key={s.id}>
                          <td className="py-2 font-mono text-[11px] font-semibold">{s.billNo}</td>
                          <td className="py-2 text-neutral-500">{fmtDateTime(s.createdAt)}</td>
                          <td className="py-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                s.paymentMethod === 'CREDIT'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                  : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                              }`}
                            >
                              {s.paymentMethod}
                            </span>
                          </td>
                          <td className="py-2 text-right font-tabular font-bold">{inr(s.total)}</td>
                          <td className="py-2 text-right font-tabular">
                            {s.credit > 0 ? <span className="text-red-600">{inr(s.credit)}</span> : <span className="text-neutral-400">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                <>
                  <div className="mb-3 flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-xs dark:bg-neutral-800/40">
                    <span className="font-semibold text-neutral-500">Current outstanding (server):</span>
                    <span className={`font-black font-tabular ${ledgerOutstanding > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {inr(ledgerOutstanding)}
                    </span>
                  </div>
                  {ledger.length === 0 ? (
                    <p className="py-8 text-center text-xs text-neutral-400">Khata book is empty.</p>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="text-[11px] font-semibold text-neutral-500">
                        <tr>
                          <th className="py-2">Date</th>
                          <th className="py-2">Entry</th>
                          <th className="py-2 text-right">Debit (owed)</th>
                          <th className="py-2 text-right">Credit (paid)</th>
                          <th className="py-2 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {ledger.map(entry => (
                          <tr key={entry.id}>
                            <td className="py-2 text-neutral-500 whitespace-nowrap">{fmtDateTime(entry.createdAt)}</td>
                            <td className="py-2">
                              <p className="font-semibold">{entry.entryType.replace('_', ' ')}</p>
                              <p className="text-[10px] text-neutral-400">{entry.description}</p>
                            </td>
                            <td className="py-2 text-right font-tabular">
                              {entry.debit > 0 ? <span className="text-red-600 font-bold">{inr(entry.debit)}</span> : <span className="text-neutral-400">—</span>}
                            </td>
                            <td className="py-2 text-right font-tabular">
                              {entry.credit > 0 ? <span className="text-emerald-700 font-bold">{inr(entry.credit)}</span> : <span className="text-neutral-400">—</span>}
                            </td>
                            <td className="py-2 text-right font-tabular font-bold text-neutral-900 dark:text-white">
                              {inr(entry.balanceAfter)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>

            {/* Tab pagination */}
            {detail && (
              <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
                <span>
                  {detailTab === 'SALES'
                    ? `${detail.totalBills} bill${detail.totalBills === 1 ? '' : 's'} · Page ${salesPage} of ${Math.max(salesPages, 1)}`
                    : `Page ${ledgerPage} of ${Math.max(ledgerPages, 1)} · append-only book`}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (detailTab === 'SALES') {
                        const next = Math.max(1, salesPage - 1);
                        setSalesPage(next);
                        loadTabData(detailId, 'SALES', next, ledgerPage);
                      } else {
                        const next = Math.max(1, ledgerPage - 1);
                        setLedgerPage(next);
                        loadTabData(detailId, 'LEDGER', salesPage, next);
                      }
                    }}
                    disabled={detailTab === 'SALES' ? salesPage <= 1 : ledgerPage <= 1}
                    className="rounded border border-neutral-200 bg-white p-1 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (detailTab === 'SALES') {
                        const next = Math.min(salesPages, salesPage + 1);
                        setSalesPage(next);
                        loadTabData(detailId, 'SALES', next, ledgerPage);
                      } else {
                        const next = Math.min(ledgerPages, ledgerPage + 1);
                        setLedgerPage(next);
                        loadTabData(detailId, 'LEDGER', salesPage, next);
                      }
                    }}
                    disabled={detailTab === 'SALES' ? salesPage >= salesPages : ledgerPage >= ledgerPages}
                    className="rounded border border-neutral-200 bg-white p-1 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collect payment */}
      <CollectPaymentModal
        customer={payCustomer}
        onClose={() => setPayCustomer(null)}
        onPaid={() => {
          loadCustomers();
          if (detailId) openDetail(detailId);
        }}
      />
    </div>
  );
};
