/**
 * Supplier directory + payable ledger service — Phase 4.
 *
 * Supplier profiles and the payable ledger are real (local SQLite). Purchase
 * ORDERS are still out of scope (later phase) and keep their client-local
 * mock store below, clearly marked.
 */
import { Supplier, PurchaseOrder } from '../types';
import { INITIAL_PURCHASE_ORDERS } from '../data/mockData';
import { ApiResponse, apiGet, apiPost, apiPatch } from './api';

interface SupplierRow {
  id: string;
  code: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  payment_terms: string;
  credit_limit_paise: number;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
  outstanding_paise: number;
  total_purchases_paise: number;
  total_payments_paise: number;
  ledger_entry_count: number;
  recent_ledger?: RawLedgerEntry[];
}

interface RawLedgerEntry {
  id: string;
  entry_type: string;
  reference_type: string | null;
  reference_id: string | null;
  debit_paise: number;
  credit_paise: number;
  balance_after_paise: number;
  description: string;
  created_at: string;
}

interface RawPage {
  items: SupplierRow[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/** One payable-ledger row, in rupees (credit = we owe more, debit = we paid). */
export interface SupplierLedgerEntry {
  id: string;
  entryType: 'PURCHASE' | 'PAYMENT' | 'ADJUSTMENT' | 'REVERSAL';
  debit: number;
  credit: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface SupplierDetail extends Supplier {
  code: string;
  notes: string;
  ledgerEntryCount: number;
  totalPurchases: number;
  totalPayments: number;
  recentLedger: SupplierLedgerEntry[];
}

export interface SupplierPage {
  items: Supplier[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface SupplierInput {
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  gstin?: string;
  paymentTerms?: string;
  /** Rupees. */
  creditLimit?: number;
  notes?: string;
}

const rupees = (value: number): number => value / 100;
const paise = (rupeeValue: number): number => Math.round(rupeeValue * 100);

function rowToSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email,
    address: row.address,
    gstin: row.gstin,
    paymentTerms: row.payment_terms,
    creditLimit: rupees(row.credit_limit_paise),
    outstandingBalance: rupees(row.outstanding_paise),
    active: row.is_active,
    notes: row.notes || undefined,
  };
}

function rowToLedger(row: RawLedgerEntry): SupplierLedgerEntry {
  return {
    id: row.id,
    entryType: row.entry_type as SupplierLedgerEntry['entryType'],
    debit: rupees(row.debit_paise),
    credit: rupees(row.credit_paise),
    balanceAfter: rupees(row.balance_after_paise),
    description: row.description,
    createdAt: row.created_at,
  };
}

function rowToDetail(row: SupplierRow): SupplierDetail {
  return {
    ...rowToSupplier(row),
    code: row.code,
    notes: row.notes || '',
    ledgerEntryCount: row.ledger_entry_count,
    totalPurchases: rupees(row.total_purchases_paise),
    totalPayments: rupees(row.total_payments_paise),
    recentLedger: (row.recent_ledger || []).map(rowToLedger),
  };
}

export const suppliersService = {
  /** Paginated, server-side search (name / contact person / phone / code / GSTIN). */
  async listPage(query: {
    q?: string;
    page?: number;
    pageSize?: number;
    active?: boolean;
  } = {}): Promise<ApiResponse<SupplierPage>> {
    const res = await apiGet<RawPage>('/suppliers', {
      q: query.q,
      page: query.page,
      page_size: query.pageSize,
      active: query.active,
    });
    return {
      data: {
        items: res.data.items.map(rowToSupplier),
        total: res.data.total,
        page: res.data.page,
        pageSize: res.data.page_size,
        pages: res.data.pages,
      },
      success: true,
      source: res.source,
      meta: res.meta,
    };
  },

  async getAll(): Promise<ApiResponse<Supplier[]>> {
    const res = await apiGet<RawPage>('/suppliers', { page_size: 500 });
    return { data: res.data.items.map(rowToSupplier), success: true, source: res.source };
  },

  async getById(id: string): Promise<ApiResponse<SupplierDetail>> {
    const res = await apiGet<SupplierRow>(`/suppliers/${encodeURIComponent(id)}`);
    return { data: rowToDetail(res.data), success: true, source: res.source };
  },

  async create(input: SupplierInput): Promise<ApiResponse<Supplier>> {
    const res = await apiPost<SupplierRow>('/suppliers', {
      name: input.name,
      contact_person: input.contactPerson || '',
      phone: input.phone,
      email: input.email || '',
      address: input.address || '',
      gstin: input.gstin || '',
      payment_terms: input.paymentTerms || 'Net 30 Days',
      credit_limit_paise: paise(input.creditLimit || 0),
      notes: input.notes || '',
    });
    return { data: rowToSupplier(res.data), success: true, message: res.message, source: res.source };
  },

  async update(
    id: string,
    updates: Partial<SupplierInput> & { active?: boolean },
  ): Promise<ApiResponse<Supplier>> {
    const body: Record<string, unknown> = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.contactPerson !== undefined) body.contact_person = updates.contactPerson;
    if (updates.phone !== undefined) body.phone = updates.phone;
    if (updates.email !== undefined) body.email = updates.email;
    if (updates.address !== undefined) body.address = updates.address;
    if (updates.gstin !== undefined) body.gstin = updates.gstin;
    if (updates.paymentTerms !== undefined) body.payment_terms = updates.paymentTerms;
    if (updates.notes !== undefined) body.notes = updates.notes;
    if (updates.creditLimit !== undefined) body.credit_limit_paise = paise(updates.creditLimit);
    if (updates.active !== undefined) body.is_active = updates.active;
    const res = await apiPatch<SupplierRow>(`/suppliers/${encodeURIComponent(id)}`, body);
    return { data: rowToSupplier(res.data), success: true, message: res.message, source: res.source };
  },

  /** Payable ledger, newest first, with the server's running balance. */
  async listLedger(
    id: string,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<
    ApiResponse<{
      items: SupplierLedgerEntry[];
      total: number;
      page: number;
      pageSize: number;
      pages: number;
      outstanding: number;
    }>
  > {
    const res = await apiGet<{
      items: RawLedgerEntry[];
      total: number;
      page: number;
      page_size: number;
      pages: number;
      outstanding_paise: number;
    }>(`/suppliers/${encodeURIComponent(id)}/ledger`, {
      page: query.page,
      page_size: query.pageSize,
    });
    return {
      data: {
        items: res.data.items.map(rowToLedger),
        total: res.data.total,
        page: res.data.page,
        pageSize: res.data.page_size,
        pages: res.data.pages,
        outstanding: rupees(res.data.outstanding_paise),
      },
      success: true,
      source: res.source,
    };
  },

  /** Pay a vendor against the payable ledger (idempotency-key safe). */
  async recordPayment(
    id: string,
    input: { amount: number; reference?: string; notes?: string; idempotencyKey?: string },
  ): Promise<ApiResponse<{ id: string; amount: number; outstanding: number; idempotent: boolean }>> {
    const res = await apiPost<{
      id: string;
      amount_paise: number;
      outstanding_paise: number;
      idempotent: boolean;
    }>(`/suppliers/${encodeURIComponent(id)}/payments`, {
      amount_paise: paise(input.amount),
      reference: input.reference || '',
      notes: input.notes || '',
      idempotency_key: input.idempotencyKey,
    });
    return {
      data: {
        id: res.data.id,
        amount: rupees(res.data.amount_paise),
        outstanding: rupees(res.data.outstanding_paise),
        idempotent: res.data.idempotent,
      },
      success: true,
      message: res.message,
      source: res.source,
    };
  },

  // ---------------------------------------------------------------------
  // Purchase ORDERS — out of Phase 4 scope (later phase). These remain a
  // client-local demo store until the purchases/GRN API lands.
  // ---------------------------------------------------------------------
  async getPurchaseOrders(): Promise<ApiResponse<PurchaseOrder[]>> {
    return { data: [...INITIAL_PURCHASE_ORDERS], success: true, source: 'LOCAL_EDGE' };
  },

  async createPurchaseOrder(po: Omit<PurchaseOrder, 'id' | 'poNumber'>): Promise<ApiResponse<PurchaseOrder>> {
    const newPo: PurchaseOrder = {
      ...po,
      id: `po-${Date.now()}`,
      poNumber: `PO-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`,
    };
    INITIAL_PURCHASE_ORDERS.unshift(newPo);
    return { data: newPo, success: true, message: 'Purchase order placed', source: 'LOCAL_EDGE' };
  },

  async updatePoStatus(poId: string, status: PurchaseOrder['status']): Promise<ApiResponse<PurchaseOrder>> {
    const po = INITIAL_PURCHASE_ORDERS.find(p => p.id === poId);
    if (!po) throw new Error('PO not found');
    po.status = status;
    return { data: po, success: true, message: `PO status updated to ${status}`, source: 'LOCAL_EDGE' };
  },
};
