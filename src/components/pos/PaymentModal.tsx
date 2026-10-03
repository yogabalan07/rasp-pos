import React, { useState, useEffect } from 'react';
import { PaymentMethod, Customer } from '../../types';
import { 
  Banknote, 
  QrCode, 
  CreditCard, 
  FileText, 
  Layers, 
  Check, 
  X, 
  ArrowRight,
  AlertCircle 
} from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  totalAmount: number;
  customer: Customer;
  onClose: () => void;
  onComplete: (details: {
    method: PaymentMethod;
    amountReceived: number;
    changeDue: number;
    notes?: string;
  }) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  totalAmount,
  customer,
  onClose,
  onComplete,
}) => {
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [tenderedInput, setTenderedInput] = useState<string>(Math.round(totalAmount).toString());
  const [splitCash, setSplitCash] = useState<string>('0');
  const [splitUpi, setSplitUpi] = useState<string>('0');
  const [cardRef, setCardRef] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setTenderedInput(Math.round(totalAmount).toString());
      setSplitCash(Math.floor(totalAmount / 2).toString());
      setSplitUpi((totalAmount - Math.floor(totalAmount / 2)).toString());
    }
  }, [isOpen, totalAmount]);

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

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (method === 'CASH' && tendered < totalAmount) {
      return; // Cannot pay less than total for cash
    }

    onComplete({
      method,
      amountReceived: method === 'CASH' ? tendered : totalAmount,
      changeDue: method === 'CASH' ? changeDue : 0,
      notes,
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
          <div className="grid grid-cols-5 gap-2">
            {[
              { id: 'CASH', label: 'Cash', icon: Banknote },
              { id: 'UPI', label: 'UPI / QR', icon: QrCode },
              { id: 'CARD', label: 'Card', icon: CreditCard },
              { id: 'CREDIT', label: 'Khata', icon: FileText },
              { id: 'SPLIT', label: 'Split', icon: Layers },
            ].map(m => {
              const Icon = m.icon;
              const isSelected = method === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id as PaymentMethod)}
                  className={`flex flex-col items-center justify-center rounded-lg p-2.5 text-xs font-semibold transition-all border ${
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
                <div className="flex justify-between border-t border-amber-200/80 pt-1 text-amber-950 dark:text-amber-100 font-bold">
                  <span>New Outstanding:</span>
                  <span className="font-tabular">₹{(customer.outstandingBalance + totalAmount).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* SPLIT Panel */}
          {method === 'SPLIT' && (
            <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold">Cash Portion (₹)</label>
                  <input
                    type="number"
                    value={splitCash}
                    onChange={e => setSplitCash(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-300 bg-white p-2 text-sm font-bold font-tabular dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold">UPI / Online (₹)</label>
                  <input
                    type="number"
                    value={splitUpi}
                    onChange={e => setSplitUpi(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-300 bg-white p-2 text-sm font-bold font-tabular dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex justify-between text-xs text-neutral-500">
                <span>Sum: ₹{(parseFloat(splitCash || '0') + parseFloat(splitUpi || '0')).toFixed(2)}</span>
                <span>Required: ₹{totalAmount.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel (ESC)
          </button>

          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={method === 'CASH' && tendered < totalAmount}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <span>Complete Payment ₹{totalAmount.toFixed(2)}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
