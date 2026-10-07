import React, { useState, useEffect } from 'react';
import { PaymentMethod, Customer } from '../../types';
import { 
  Banknote, 
  QrCode, 
  CreditCard, 
  FileText, 
  Check, 
  X, 
  ArrowRight,
  AlertCircle 
} from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  totalAmount: number;
  customer: Customer;
  /** True while the checkout request is in flight — blocks resubmits. */
  isProcessing?: boolean;
  onClose: () => void;
  onComplete: (details: {
    method: PaymentMethod;
    amountReceived: number;
    changeDue: number;
    notes?: string;
    /** CARD terminal approval code (optional). */
    reference?: string;
  }) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  totalAmount,
  customer,
  isProcessing = false,
  onClose,
  onComplete,
}) => {
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [tenderedInput, setTenderedInput] = useState<string>(Math.round(totalAmount).toString());
  const [cardRef, setCardRef] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setTenderedInput(Math.round(totalAmount).toString());
    }
  }, [isOpen, totalAmount]);

  // Walk-in customers have no khata — never leave CREDIT stuck on them.
  useEffect(() => {
    if (customer.id === 'cust-walkin' && method === 'CREDIT') {
      setMethod('CASH');
    }
  }, [customer.id, method]);

  if (!isOpen) return null;

  const tendered = parseFloat(tenderedInput) || 0;
  const changeDue = Math.max(0, tendered - totalAmount);

  const cashPresets = [
    Math.round(totalAmount),
    Math.ceil(totalAmount / 50) * 50,
    Math.ceil(totalAmount / 100) * 100,
    500,
    1000,
    2000,
  ].filter((v, i, a) => v >= totalAmount && a.indexOf(v) === i).slice(0, 4);

  const isWalkIn = customer.id === 'cust-walkin';
  const availableCredit = Math.max(0, customer.creditLimit - customer.outstandingBalance);
  const creditExceedsLimit =
    method === 'CREDIT' && customer.creditLimit > 0 && customer.outstandingBalance + totalAmount > customer.creditLimit;
  const creditDisabled =
    method === 'CREDIT' && (customer.creditLimit <= 0 || creditExceedsLimit);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isProcessing) return;
    if (method === 'CASH' && tendered < totalAmount) {
      return; // Cannot pay less than total for cash
    }
    if (creditDisabled) {
      return; // UX guard only — the server enforces the credit limit.
    }

    onComplete({
      method,
      amountReceived: method === 'CASH' ? tendered : totalAmount,
      changeDue: method === 'CASH' ? changeDue : 0,
      notes,
      reference: method === 'CARD' && cardRef.trim() ? cardRef.trim() : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex flex-col w-full max-w-xl rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">Payment Checkout</h2>
            <p className="text-xs text-neutral-500">Bill Total: <strong className="font-tabular font-bold text-neutral-900 dark:text-white text-sm">₹{totalAmount.toFixed(2)}</strong> · Customer: {customer.name}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Method Selector Tabs */}
          {/* No split payments — the API accepts one payment method per bill
              (CASH / UPI / CARD / CREDIT). */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'CASH', label: 'Cash', icon: Banknote },
              { id: 'UPI', label: 'UPI / QR', icon: QrCode },
              { id: 'CARD', label: 'Card', icon: CreditCard },
              { id: 'CREDIT', label: 'Khata', icon: FileText },
            ].map(m => {
              const Icon = m.icon;
              const isSelected = method === m.id;
              const creditBlocked = m.id === 'CREDIT' && isWalkIn;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id as PaymentMethod)}
                  disabled={isProcessing || creditBlocked}
                  title={
                    creditBlocked
                      ? 'Credit sales need a selected customer (F3) — walk-in has no khata'
                      : undefined
                  }
                  className={`flex flex-col items-center justify-center rounded-lg p-2.5 text-xs font-semibold transition-all border disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs dark:border-white dark:bg-white dark:text-neutral-950'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
                  }`}
                >
                  <Icon className="h-5 w-5 mb-1" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Walk-in has no khata — spell out what the cashier must do. */}
          {isWalkIn && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
              Select a customer for credit sale. (F3)
            </p>
          )}

          {/* CASH Panel */}
          {method === 'CASH' && (
            <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Cash Received (₹)
                </label>
                <div className="flex gap-1.5">
                  {cashPresets.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTenderedInput(preset.toString())}
                      className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs font-medium font-tabular text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                    >
                      ₹{preset}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="number"
                value={tenderedInput}
                onChange={e => setTenderedInput(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-xl font-bold font-tabular text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                placeholder="Enter amount given by customer"
              />

              {/* Change calculation */}
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-100">
                <span className="text-xs font-semibold uppercase tracking-wider">Change to Return:</span>
                <span className="text-xl font-black font-tabular">
                  ₹{changeDue.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* UPI Panel */}
          {method === 'UPI' && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 text-center space-y-3 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900">
                {/* Clean QR Representation */}
                <div className="flex flex-col items-center justify-center text-neutral-800 dark:text-neutral-200">
                  <QrCode className="h-24 w-24 text-neutral-900 dark:text-white" />
                  <span className="text-[10px] font-mono mt-1">UPI: 9845012345@ybpos</span>
                </div>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                Customer scans with Google Pay, PhonePe, Paytm, or BHIM. Amount: <strong>₹{totalAmount.toFixed(2)}</strong>
              </p>
            </div>
          )}

          {/* CARD Panel */}
          {method === 'CARD' && (
            <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
              <p className="text-xs text-neutral-600 dark:text-neutral-400">Swipe or tap card on PineLabs / POS terminal.</p>
              <div>
                <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Transaction / Approval Code (Optional)
                </label>
                <input
                  type="text"
                  value={cardRef}
                  onChange={e => setCardRef(e.target.value)}
                  placeholder="e.g. TXN-998124"
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-mono dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* CREDIT / KHATA Panel */}
          {method === 'CREDIT' && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 text-xs font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>Credit Sale will be recorded in customer Khata</span>
              </div>
              <div className="text-xs space-y-1 text-neutral-700 dark:text-neutral-300">
                <div className="flex justify-between">
                  <span>Current Outstanding:</span>
                  <span className="font-bold font-tabular">₹{customer.outstandingBalance.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Credit Limit:</span>
                  <span className="font-bold font-tabular">₹{customer.creditLimit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Available Credit:</span>
                  <span className="font-bold font-tabular">₹{availableCredit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-amber-200/80 pt-1 text-amber-950 dark:text-amber-100 font-bold">
                  <span>New Outstanding:</span>
                  <span className="font-tabular">₹{(customer.outstandingBalance + totalAmount).toFixed(2)}</span>
                </div>
              </div>

              {customer.creditLimit <= 0 ? (
                <p className="rounded border border-red-300 bg-red-50 p-2 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  This customer has no credit limit (₹0) — credit sales are disabled. Collect another
                  tender or raise the limit in Customers.
                </p>
              ) : creditExceedsLimit ? (
                <p className="rounded border border-red-300 bg-red-50 p-2 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  ₹{(customer.outstandingBalance + totalAmount).toFixed(2)} exceeds this customer's
                  credit limit of ₹{customer.creditLimit.toFixed(2)} by{' '}
                  ₹{(customer.outstandingBalance + totalAmount - customer.creditLimit).toFixed(2)}.
                  Take part payment or reduce the bill — the server will reject this sale.
                </p>
              ) : (
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  ₹{availableCredit.toFixed(2)} of headroom remains after this sale.
                </p>
              )}
            </div>
          )}

          {/* SPLIT payments removed — one tender per bill. */}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel (ESC)
          </button>

          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isProcessing || (method === 'CASH' && tendered < totalAmount) || creditDisabled}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <span>
              {isProcessing
                ? 'Processing…'
                : `Complete Payment ₹${totalAmount.toFixed(2)}`}
            </span>
            {!isProcessing && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
