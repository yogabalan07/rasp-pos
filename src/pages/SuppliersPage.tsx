import React, { useCallback, useEffect, useState } from 'react';
import { Supplier } from '../types';
import {
  suppliersService,
  SupplierDetail,
  SupplierLedgerEntry,
  SupplierInput,
} from '../services/suppliers';
import { authService } from '../services/auth';
import { ApiError } from '../services/api';
import { useApp } from '../context/AppContext';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  Plus,
  Search,
  X,
  FileText,
  History,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Eye,
  Banknote,
} from 'lucide-react';

const PAGE_SIZE = 12;

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const inr = (value: number) =>
  `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const SuppliersPage: React.FC = () => {
  const { showToast, navigateTo } = useApp();
  const canWrite = authService.can('supplier:write');

  // List (server-side search + filter + pagination)
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
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
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30 Days');
  const [creditLimit, setCreditLimit] = useState('100000');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);

  // Detail modal (profile + ledger)
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupplierDetail | null>(null);
  const [ledger, setLedger] = useState<SupplierLedgerEntry[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPages, setLedgerPages] = useState(1);
  const [ledgerOutstanding, setLedgerOutstanding] = useState(0);

  // Payment
  const [paySupplier, setPaySupplier] = useState<{
    id: string;
    name: string;
    code?: string;
    outstandingBalance: number;
  } | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paySaving, setPaySaving] = useState(false);
  const [payKey, setPayKey] = useState('');

  // ------------------------------------------------------------------ list
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const loadSuppliers = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await suppliersService.listPage({
        q: debouncedSearch || undefined,
        active: statusFilter === 'ALL' ? undefined : statusFilter === 'ACTIVE',
        page,
        pageSize: PAGE_SIZE,
      });
      setSuppliers(res.data.items);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (err) {
      setSuppliers([]);
      setTotal(0);
      setLoadError(err instanceof ApiError ? err.message : 'Could not load suppliers');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, statusFilter, page]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  // --------------------------------------------------------------- detail
  const loadLedger = useCallback(async (id: string, pg: number) => {
    try {
      const res = await suppliersService.listLedger(id, { page: pg, pageSize: 12 });
      setLedger(res.data.items);
      setLedgerPages(res.data.pages);
      setLedgerOutstanding(res.data.outstanding);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not load ledger', 'error');
    }
  }, [showToast]);

  const openDetail = async (id: string) => {
    setDetailId(id);
    setDetail(null);
    setLedgerPage(1);
    try {
      const res = await suppliersService.getById(id);
      setDetail(res.data);
      loadLedger(id, 1);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not load supplier', 'error');
      setDetailId(null);
    }
  };

  // ----------------------------------------------------------------- form
  const openCreate = () => {
    setEditing(null);
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setGstin('');
    setPaymentTerms('Net 30 Days');
    setCreditLimit('100000');
    setNotes('');
    setActive(true);
    setIsFormOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setName(s.name);
    setContactPerson(s.contactPerson || '');
    setPhone(s.phone || '');
    setEmail(s.email || '');
    setAddress(s.address || '');
    setGstin(s.gstin || '');
    setPaymentTerms(s.paymentTerms || 'Net 30 Days');
    setCreditLimit(String(s.creditLimit || 0));
    setNotes(s.notes || '');
    setActive(s.active !== false);
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Supplier name is required', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const payload: SupplierInput = {
        name: name.trim(),
        contactPerson: contactPerson.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        gstin: gstin.trim() || undefined,
        paymentTerms,
        creditLimit: parseFloat(creditLimit) || 0,
        notes: notes.trim() || undefined,
      };
      if (editing) {
        await suppliersService.update(editing.id, { ...payload, active });
        showToast(`Supplier ${payload.name} updated`, 'success');
      } else {
        await suppliersService.create(payload);
        showToast(`Supplier ${payload.name} created`, 'success');
      }
      setIsFormOpen(false);
      loadSuppliers();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not save supplier', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // -------------------------------------------------------------- payment
  const openPay = (s: Supplier) => {
    setPaySupplier({
      id: s.id,
      name: s.name,
      code: s.code,
      outstandingBalance: s.outstandingBalance,
    });
    setPayAmount(String(s.outstandingBalance));
    setPayReference('');
    setPayNotes('');
    setPayKey(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `sup-${Date.now()}`);
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paySupplier) return;
    const amt = parseFloat(payAmount) || 0;
    if (amt <= 0) {
      showToast('Payment amount must be greater than 0', 'warning');
      return;
    }
    if (amt > paySupplier.outstandingBalance) {
      showToast('Payment cannot exceed the outstanding payable', 'warning');
      return;
    }
    setPaySaving(true);
    try {
      const res = await suppliersService.recordPayment(paySupplier.id, {
        amount: amt,
        reference: payReference.trim() || undefined,
        notes: payNotes.trim() || undefined,
        idempotencyKey: payKey || undefined,
      });
      showToast(
        res.data.idempotent
          ? 'This payment was already recorded — nothing changed.'
          : `₹${res.data.amount.toFixed(2)} paid to ${paySupplier.name}`,
        'success',
      );
      setPaySupplier(null);
      loadSuppliers();
      if (detailId) openDetail(detailId);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not record payment', 'error');
    } finally {
      setPaySaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Suppliers &amp; Vendors
          </h1>
          <p className="text-xs text-neutral-500">
            Vendor accounts, payment terms, and the payable ledger
          </p>
        </div>

        {canWrite && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Add Supplier</span>
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
            placeholder="Search suppliers by name, contact, phone or GSTIN..."
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

      {loadError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {loadError}
        </p>
      )}

      {/* Supplier cards */}
      {isLoading && suppliers.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-xs text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900">
          Loading suppliers…
        </div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <Building2 className="mx-auto h-8 w-8 stroke-1 text-neutral-300 mb-2" />
          <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            {debouncedSearch || statusFilter !== 'ALL'
              ? 'No suppliers match this filter.'
              : 'No suppliers yet.'}
          </p>
          {canWrite && !debouncedSearch && statusFilter === 'ALL' && (
            <button
              onClick={openCreate}
              className="mt-2 text-xs font-semibold text-emerald-700 hover:underline"
            >
              Add the first supplier
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {suppliers.map(sup => (
            <div
              key={sup.id}
              className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                        {sup.name}
                      </h3>
                      {sup.code && (
                        <span className="font-mono text-[10px] text-neutral-400">{sup.code}</span>
                      )}
                      {sup.active === false && (
                        <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                          INACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500">{sup.contactPerson || '—'}</p>
                  </div>
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    {sup.paymentTerms}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="font-mono text-[11px]">{sup.phone || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="truncate">{sup.email || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="truncate">{sup.address || '—'}</span>
                  </div>
                  {sup.gstin && (
                    <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-500 pt-1">
                      <span>GSTIN: {sup.gstin}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-neutral-400">Outstanding Payable</span>
                    <p
                      className={`text-sm font-bold font-tabular ${
                        sup.outstandingBalance > 0 ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {inr(sup.outstandingBalance)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openDetail(sup.id)}
                      className="rounded border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                      title="View ledger"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {canWrite && (
                      <button
                        onClick={() => openEdit(sup)}
                        className="rounded border border-neutral-200 p-1.5 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                        title="Edit supplier"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canWrite && sup.outstandingBalance > 0 && (
                      <button
                        onClick={() => openPay(sup)}
                        className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
                      >
                        Pay
                      </button>
                    )}
                    <button
                      onClick={() => navigateTo('/purchases')}
                      className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
                      title="Purchase orders open in Purchases"
                    >
                      PO
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Server-side pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
        <span>
          {total} supplier{total === 1 ? '' : 's'} · Page {page} of {Math.max(pages, 1)}
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

      {/* Create / Edit Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <div>
                <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                  {editing ? 'Edit Supplier' : 'Add New Supplier'}
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
                <label className="text-xs font-semibold">Vendor Company Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Parle Agro Logistics"
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={e => setContactPerson(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">GSTIN</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={e => setGstin(e.target.value)}
                    placeholder="29AAAAA0000A1Z5"
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs font-mono dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold">Phone (7–15 digits)</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs font-mono dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Email</label>
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
                  <label className="text-xs font-semibold">Credit Limit (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={creditLimit}
                    onChange={e => setCreditLimit(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">Payment Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value)}
                    className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    <option value="Net 15 Days">Net 15 Days</option>
                    <option value="Net 30 Days">Net 30 Days</option>
                    <option value="Net 21 Days">Net 21 Days</option>
                    <option value="Weekly Settlement">Weekly Settlement</option>
                    <option value="Cash on Delivery">Cash on Delivery</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold">Warehouse / Office Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">Notes (optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              {editing && (
                <label className="flex items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={e => setActive(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Active
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
                  {isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal: profile + payable ledger */}
      {detailId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-3xl rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <div>
                <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                  {detail ? detail.name : 'Loading…'}
                  {detail?.code && (
                    <span className="ml-2 font-mono text-[11px] font-normal text-neutral-400">
                      {detail.code}
                    </span>
                  )}
                </h2>
                {detail && (
                  <p className="text-[11px] text-neutral-500">
                    {detail.contactPerson} · {detail.paymentTerms}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canWrite && detail && detail.outstandingBalance > 0 && (
                  <button
                    onClick={() => {
                      setDetailId(null);
                      setDetail(null);
                      openPay(detail);
                    }}
                    className="flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
                  >
                    <Banknote className="h-3.5 w-3.5" />
                    Record Payment
                  </button>
                )}
                <button
                  onClick={() => {
                    setDetailId(null);
                    setDetail(null);
                  }}
                  className="text-neutral-400 hover:text-neutral-700 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Stats */}
            {detail && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-400">
                    Outstanding Payable
                  </p>
                  <p
                    className={`text-sm font-black font-tabular ${
                      detail.outstandingBalance > 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {inr(detail.outstandingBalance)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-400">
                    Total Purchases
                  </p>
                  <p className="text-sm font-black font-tabular text-neutral-900 dark:text-white">
                    {inr(detail.totalPurchases)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-400">Total Paid</p>
                  <p className="text-sm font-black font-tabular text-neutral-900 dark:text-white">
                    {inr(detail.totalPayments)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-400">
                    Ledger Entries
                  </p>
                  <p className="text-sm font-black font-tabular text-neutral-900 dark:text-white">
                    {detail.ledgerEntryCount}
                  </p>
                </div>
              </div>
            )}

            {/* Ledger */}
            <div className="flex items-center gap-1.5 border-b border-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 dark:border-neutral-800 dark:text-white">
              <History className="h-3.5 w-3.5" />
              Payable Ledger
              <span className="font-normal text-neutral-400">(append-only)</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!detail ? (
                <p className="py-8 text-center text-xs text-neutral-400">Loading supplier…</p>
              ) : ledger.length === 0 ? (
                <p className="py-8 text-center text-xs text-neutral-400">
                  No ledger entries yet — purchases (later phase) will post the first entry.
                </p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] font-semibold text-neutral-500">
                    <tr>
                      <th className="py-2">Date</th>
                      <th className="py-2">Entry</th>
                      <th className="py-2 text-right">Credit (owed)</th>
                      <th className="py-2 text-right">Debit (paid)</th>
                      <th className="py-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {ledger.map(entry => (
                      <tr key={entry.id}>
                        <td className="py-2 text-neutral-500 whitespace-nowrap">
                          {fmtDateTime(entry.createdAt)}
                        </td>
                        <td className="py-2">
                          <p className="font-semibold">{entry.entryType.replace('_', ' ')}</p>
                          <p className="text-[10px] text-neutral-400">{entry.description}</p>
                        </td>
                        <td className="py-2 text-right font-tabular">
                          {entry.credit > 0 ? (
                            <span className="text-red-600 font-bold">{inr(entry.credit)}</span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right font-tabular">
                          {entry.debit > 0 ? (
                            <span className="text-emerald-700 font-bold">{inr(entry.debit)}</span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right font-tabular font-bold text-neutral-900 dark:text-white">
                          {inr(entry.balanceAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
              <span>
                {detail &&
                  `Outstanding (server): ${inr(ledgerOutstanding)} · Page ${ledgerPage} of ${Math.max(ledgerPages, 1)}`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const next = Math.max(1, ledgerPage - 1);
                    setLedgerPage(next);
                    loadLedger(detailId, next);
                  }}
                  disabled={ledgerPage <= 1}
                  className="rounded border border-neutral-200 bg-white p-1 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    const next = Math.min(ledgerPages, ledgerPage + 1);
                    setLedgerPage(next);
                    loadLedger(detailId, next);
                  }}
                  disabled={ledgerPage >= ledgerPages}
                  className="rounded border border-neutral-200 bg-white p-1 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supplier payment modal */}
      {paySupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Record Supplier Payment</h2>
              <button
                onClick={() => setPaySupplier(null)}
                className="text-neutral-400 hover:text-neutral-700 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handlePay} className="p-5 space-y-4">
              <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/40">
                <p className="text-xs font-bold text-neutral-900 dark:text-white">
                  {paySupplier.name}
                  {paySupplier.code && (
                    <span className="ml-2 font-mono text-[10px] font-normal text-neutral-400">
                      {paySupplier.code}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-neutral-500 font-mono">
                  Outstanding payable: ₹{paySupplier.outstandingBalance.toFixed(2)}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold">Amount to Pay (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2.5 text-lg font-bold font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
                {(parseFloat(payAmount) || 0) > paySupplier.outstandingBalance && (
                  <p className="mt-1 text-[11px] font-semibold text-red-600">
                    Cannot pay more than ₹{paySupplier.outstandingBalance.toFixed(2)} outstanding.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold">Reference (UTR / cheque no.)</label>
                <input
                  type="text"
                  value={payReference}
                  onChange={e => setPayReference(e.target.value)}
                  placeholder="e.g. NEFT-998124"
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs font-mono dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">Notes (optional)</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setPaySupplier(null)}
                  disabled={paySaving}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paySaving || (parseFloat(payAmount) || 0) > paySupplier.outstandingBalance}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {paySaving ? 'Recording…' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
