import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, QrCode, CreditCard, X, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  customersService,
  CustomerPaymentInput,
  CustomerPaymentResult,
} from '../../services/customers';
import { ApiError } from '../../services/api';

interface CollectPaymentModalProps {
  /** Null = closed. */
  customer: { id: string; name: string; code?: string; outstandingBalance: number } | null;
  onClose: () => void;
  /** Called after the server records the payment (also on idempotent replay). */
  onPaid: (result: CustomerPaymentResult) => void;
}

/** One key per open modal — double-taps replay instead of double-charging. */
function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const CollectPaymentModal: React.FC<CollectPaymentModalProps> = ({
  customer,
  onClose,
  onPaid,
}) => {
  const { showToast } = useApp();
  const outstanding = customer?.outstandingBalance ?? 0;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<NonNullable<CustomerPaymentInput['method']>>('CASH');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const idempotencyKey = useMemo(() => (customer ? newIdempotencyKey() : null), [customer?.id]);

  // Fresh state every time a different customer is opened.
  useEffect(() => {
    if (customer) {
      setAmount(String(customer.outstandingBalance));
      setReference('');
      setNotes('');
      setMethod('CASH');
    }
  }, [customer?.id]);

  if (!customer) return null;

  const parsedAmount = parseFloat(amount) || 0;
  const exceedsOutstanding = parsedAmount > outstanding;
  const canSubmit = parsedAmount > 0 && !exceedsOutstanding && !isSaving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      if (parsedAmount <= 0) {
        showToast('Payment amount must be greater than 0', 'warning');
      } else if (exceedsOutstanding) {
        showToast('Payment cannot exceed the outstanding balance', 'warning');
      }
      return;
    }
    setIsSaving(true);
    try {
      const res = await customersService.collectPayment(customer.id, {
        amount: parsedAmount,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        idempotencyKey: idempotencyKey ?? undefined,
      });
      showToast(
        res.data.idempotent
          ? 'This payment was already recorded — nothing changed.'
          : `₹${res.data.amount.toFixed(2)} collected from ${customer.name}`,
        'success',
      );
      onPaid(res.data);
      onClose();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not record payment', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex flex-col w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
          <h2 className="text-base font-bold text-neutral-900 dark:text-white">Collect Khata Payment</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/40">
            <p className="text-xs font-bold text-neutral-900 dark:text-white">
              {customer.name}
              {customer.code && (
                <span className="ml-2 font-mono text-[10px] font-normal text-neutral-400">{customer.code}</span>
              )}
            </p>
            <p className="text-[11px] text-neutral-500 font-mono">
              Current Due: ₹{outstanding.toFixed(2)}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold">Payment Amount to Collect (₹) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 p-2.5 text-lg font-bold font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
            {exceedsOutstanding && (
              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                Cannot collect more than ₹{outstanding.toFixed(2)} outstanding.
              </p>
            )}
            {parsedAmount > 0 && !exceedsOutstanding && (
              <p className="mt-1 text-[11px] text-neutral-500">
                Balance after payment: ₹{(outstanding - parsedAmount).toFixed(2)}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold">Payment Mode</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([
                { id: 'CASH', label: 'Cash', icon: Banknote },
                { id: 'UPI', label: 'UPI / QR', icon: QrCode },
                { id: 'CARD', label: 'Card', icon: CreditCard },
              ] as const).map(opt => {
                const Icon = opt.icon;
                const active = method === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMethod(opt.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold ${
                      active
                        ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-950'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold">Receipt / Reference</label>
            <input
              type="text"
              value={reference}
              onChange={e => setReference(e.target.value)}
              placeholder="e.g. GPay UTR 4421..."
              className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Part settlement"
              className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSaving ? 'Recording…' : 'Record Settlement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
