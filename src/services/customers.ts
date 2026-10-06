/**
 * Customer directory + khata (credit) service — Phase 4.
 *
 * The server owns every money value: rows arrive in INTEGER paise and are
 * converted to rupees here purely for display. Outstanding balances are
 * never calculated in the browser — they always come from the customer
 * ledger on the Pi.
 */
import { Customer } from '../types';
import { ApiResponse, apiGet, apiPost, apiPatch } from './api';

/** Raw customer row from the API (INTEGER paise, snake_case). */
export interface CustomerRow {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  credit_limit_paise: number;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
  outstanding_paise: number;
  available_credit_paise: number;
  total_credit_sales_paise: number;
  total_payments_paise: number;
  total_billed_paise: number;
  sale_count: number;
  last_sale_at: string | null;
  recent_sales?: RawSale[];
  recent_ledger?: RawLedgerEntry[];
}

interface RawSale {
  id: string;
  bill_no: string;
  created_at: string;
  status: string;
  payment_method: string;
  subtotal_paise: number;
  discount_paise: number;
  total_paise: number;
  credit_paise: number;
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
  items: CustomerRow[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/** Khata ledger entry, converted to rupees for display. */
export interface CustomerLedgerEntry {
  id: string;
  entryType: 'CREDIT_SALE' | 'PAYMENT' | 'ADJUSTMENT' | 'REVERSAL';
  /** Rupees added to what the customer owes (credit sale). */
  debit: number;
  /** Rupees removed from the balance (payment collected). */
  credit: number;
  /** True running outstanding after this entry, in rupees. */
  balanceAfter: number;
  referenceType?: string;
  referenceId?: string;
  description: string;
  createdAt: string;
}

/** One bill on a customer's history, in rupees. */
export interface CustomerSaleRow {
  id: string;
  billNo: string;
  createdAt: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  /** Receivable this bill added (0 for cash/UPI/CARD). */
  credit: number;
}

export interface CustomerDetail extends Customer {
  code: string;
  notes: string;
  createdAt: string;
  totalCreditSales: number;
  totalPayments: number;
  recentSales: CustomerSaleRow[];
  recentLedger: CustomerLedgerEntry[];
}

export interface CustomerPage {
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/** Raw book totals from GET /api/customers/summary (INTEGER paise). */
export interface CustomerSummaryRow {
  total_receivables_paise: number;
  debtor_count: number;
}

/** Book-wide receivables totals in rupees (server-computed, display only). */
export interface CustomerSummary {
  /** Authoritative total across EVERY debtor, not just the loaded page. */
  totalReceivables: number;
  debtorCount: number;
}

export interface CustomerQuery {
  q?: string;
  page?: number;
  pageSize?: number;
  active?: boolean;
  hasDues?: boolean;
}

/** Fields accepted by POST /api/customers. */
export interface CustomerInput {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  gstin?: string;
  /** Rupees (converted to paise for the API). */
  creditLimit?: number;
  notes?: string;
}

export interface CustomerPaymentInput {
  /** Rupees to collect (converted to paise for the API). */
  amount: number;
  method?: 'CASH' | 'UPI' | 'CARD';
  reference?: string;
  notes?: string;
  /** Stable key so a double-tap can never record the payment twice. */
  idempotencyKey?: string;
}

export interface CustomerPaymentResult {
  id: string;
  customerId: string;
  amount: number;
  method: string;
  reference: string;
  /** Outstanding AFTER the payment, from the server. */
  outstanding: number;
  idempotent: boolean;
}

const rupees = (paise: number): number => paise / 100;
const paise = (rupeeValue: number): number => Math.round(rupeeValue * 100);

export function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phone: row.phone,
    email: row.email || undefined,
    address: row.address || undefined,
    gstin: row.gstin || undefined,
    outstandingBalance: rupees(row.outstanding_paise),
    creditLimit: rupees(row.credit_limit_paise),
    availableCredit: rupees(row.available_credit_paise),
    active: row.is_active,
    totalBills: row.sale_count,
    totalSpent: rupees(row.total_billed_paise),
    lastPurchaseDate: row.last_sale_at ?? undefined,
    notes: row.notes || undefined,
  };
}

function rowToDetail(row: CustomerRow): CustomerDetail {
  return {
    ...rowToCustomer(row),
    code: row.code,
    notes: row.notes || '',
    createdAt: row.created_at,
    totalCreditSales: rupees(row.total_credit_sales_paise),
    totalPayments: rupees(row.total_payments_paise),
    recentSales: (row.recent_sales || []).map(rowToSale),
    recentLedger: (row.recent_ledger || []).map(rowToLedger),
  };
}

function rowToSale(row: RawSale): CustomerSaleRow {
  return {
    id: row.id,
    billNo: row.bill_no,
    createdAt: row.created_at,
    status: row.status,
    subtotal: rupees(row.subtotal_paise),
    discount: rupees(row.discount_paise),
    total: rupees(row.total_paise),
    paymentMethod: row.payment_method,
    credit: rupees(row.credit_paise),
  };
}

function rowToLedger(row: RawLedgerEntry): CustomerLedgerEntry {
  return {
    id: row.id,
    entryType: row.entry_type as CustomerLedgerEntry['entryType'],
    debit: rupees(row.debit_paise),
    credit: rupees(row.credit_paise),
    balanceAfter: rupees(row.balance_after_paise),
    referenceType: row.reference_type ?? undefined,
    referenceId: row.reference_id ?? undefined,
    description: row.description,
    createdAt: row.created_at,
  };
}

function pageOf(res: ApiResponse<RawPage>): ApiResponse<CustomerPage> {
  return {
    data: {
      items: res.data.items.map(rowToCustomer),
      total: res.data.total,
      page: res.data.page,
      pageSize: res.data.page_size,
      pages: res.data.pages,
    },
    success: true,
    message: res.message,
    source: res.source,
    meta: res.meta,
  };
}

export const customersService = {
  /** Paginated, server-side search (name / phone / code / GSTIN / email). */
  async listPage(query: CustomerQuery = {}): Promise<ApiResponse<CustomerPage>> {
    const res = await apiGet<RawPage>('/customers', {
      q: query.q,
      page: query.page,
      page_size: query.pageSize,
      active: query.active,
      has_dues: query.hasDues,
    });
    return pageOf(res);
  },

  /**
   * Directory for the POS customer selector + list screens. Pass
   * `{ active: true }` so the till only offers customers that may take sales.
   */
  async getAll(
    options: { active?: boolean; q?: string; hasDues?: boolean } = {},
  ): Promise<ApiResponse<Customer[]>> {
    const res = await apiGet<RawPage>('/customers', {
      page_size: 500,
      active: options.active,
      q: options.q,
      has_dues: options.hasDues,
    });
    return { data: res.data.items.map(rowToCustomer), success: true, source: res.source };
  },

  /**
   * Authoritative receivables totals — the database sums the whole ledger.
   * Never compute this by adding up a capped page of debtors.
   */
  async summary(): Promise<ApiResponse<CustomerSummary>> {
    const res = await apiGet<CustomerSummaryRow>('/customers/summary');
    return {
      data: {
        totalReceivables: rupees(res.data.total_receivables_paise),
        debtorCount: res.data.debtor_count,
      },
      success: true,
      message: res.message,
      source: res.source,
    };
  },

  /** Full profile: aggregates + recent sales + recent ledger. */
  async getById(id: string): Promise<ApiResponse<CustomerDetail>> {
    const res = await apiGet<CustomerRow>(`/customers/${encodeURIComponent(id)}`);
    return { data: rowToDetail(res.data), success: true, source: res.source };
  },

  async create(input: CustomerInput): Promise<ApiResponse<Customer>> {
    const res = await apiPost<CustomerRow>('/customers', {
      name: input.name,
      phone: input.phone,
      email: input.email || '',
      address: input.address || '',
      gstin: input.gstin || '',
      credit_limit_paise: paise(input.creditLimit || 0),
      notes: input.notes || '',
    });
    return { data: rowToCustomer(res.data), success: true, message: res.message, source: res.source };
  },

  async update(
    id: string,
    updates: Partial<CustomerInput> & { active?: boolean },
  ): Promise<ApiResponse<Customer>> {
    const body: Record<string, unknown> = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.phone !== undefined) body.phone = updates.phone;
    if (updates.email !== undefined) body.email = updates.email;
    if (updates.address !== undefined) body.address = updates.address;
    if (updates.gstin !== undefined) body.gstin = updates.gstin;
    if (updates.notes !== undefined) body.notes = updates.notes;
    if (updates.creditLimit !== undefined) body.credit_limit_paise = paise(updates.creditLimit);
    if (updates.active !== undefined) body.is_active = updates.active;
    const res = await apiPatch<CustomerRow>(`/customers/${encodeURIComponent(id)}`, body);
    return { data: rowToCustomer(res.data), success: true, message: res.message, source: res.source };
  },

  /** This customer's bills, newest first (server-paginated). */
  async listSales(
    id: string,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<ApiResponse<{ items: CustomerSaleRow[]; total: number; page: number; pageSize: number; pages: number }>> {
    const res = await apiGet<{ items: RawSale[]; total: number; page: number; page_size: number; pages: number }>(
      `/customers/${encodeURIComponent(id)}/sales`,
      { page: query.page, page_size: query.pageSize },
    );
    return {
      data: {
        items: res.data.items.map(rowToSale),
        total: res.data.total,
        page: res.data.page,
        pageSize: res.data.page_size,
        pages: res.data.pages,
      },
      success: true,
      source: res.source,
    };
  },

  /** Append-only khata book with the server's running balance. */
  async listLedger(
    id: string,
    query: { page?: number; pageSize?: number } = {},
  ): Promise<
    ApiResponse<{
      items: CustomerLedgerEntry[];
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
    }>(`/customers/${encodeURIComponent(id)}/ledger`, {
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

  /** Collect dues. Replays of the same `idempotencyKey` are no-ops. */
  async collectPayment(
    id: string,
    input: CustomerPaymentInput,
  ): Promise<ApiResponse<CustomerPaymentResult>> {
    const res = await apiPost<{
      id: string;
      customer_id: string;
      amount_paise: number;
      payment_method: string;
      reference: string;
      outstanding_paise: number;
      idempotent: boolean;
    }>(`/customers/${encodeURIComponent(id)}/payments`, {
      amount_paise: paise(input.amount),
      payment_method: input.method || 'CASH',
      reference: input.reference || '',
      notes: input.notes || '',
      idempotency_key: input.idempotencyKey,
    });
    return {
      data: {
        id: res.data.id,
        customerId: res.data.customer_id,
        amount: rupees(res.data.amount_paise),
        method: res.data.payment_method,
        reference: res.data.reference,
        outstanding: rupees(res.data.outstanding_paise),
        idempotent: res.data.idempotent,
      },
      success: true,
      message: res.message,
      source: res.source,
    };
  },
};
