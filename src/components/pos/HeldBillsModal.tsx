import React from 'react';
import { CartItem } from '../../types';
import { Clock, Play, Trash2, X, ShoppingBag } from 'lucide-react';

interface HeldBillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  heldBills: Array<{
    id: string;
    name: string;
    timestamp: string;
    items: CartItem[];
    customerName: string;
  }>;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
}

export const HeldBillsModal: React.FC<HeldBillsModalProps> = ({
  isOpen,
  onClose,
  heldBills,
  onResume,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex flex-col w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 max-h-[80vh]">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">Held Bills Queue</h2>
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              Local terminal only
            </span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-neutral-100 bg-amber-50/60 px-5 py-2 text-[11px] text-amber-800 dark:border-neutral-800 dark:bg-amber-950/30 dark:text-amber-200">
          Held bills are stored in this browser tab only — they are lost if the
          page is reloaded or closed.
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {heldBills.length === 0 ? (
            <div className="py-12 text-center text-neutral-400">
              <ShoppingBag className="mx-auto h-8 w-8 stroke-1 text-neutral-300 mb-2" />
              <p className="text-xs">No held bills in queue.</p>
              <p className="text-[11px] text-neutral-400">Press F4 during billing to hold an active cart.</p>
            </div>
          ) : (
            heldBills.map(bill => {
              const totalItems = bill.items.reduce((acc, i) => acc + i.quantity, 0);
              const totalAmount = bill.items.reduce((acc, i) => acc + i.total, 0);

              return (
                <div
                  key={bill.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-neutral-900 dark:text-white">{bill.name}</span>
                      <span className="text-[10px] text-neutral-400 font-mono">Held at {bill.timestamp}</span>
                    </div>
                    <p className="text-[11px] text-neutral-500">
                      {totalItems} items · Total: <strong className="text-neutral-900 dark:text-white font-tabular">₹{totalAmount.toFixed(2)}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onResume(bill.id)}
                      className="flex items-center gap-1 rounded bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
                    >
                      <Play className="h-3 w-3" />
                      <span>Resume</span>
                    </button>
                    <button
                      onClick={() => onCancel(bill.id)}
                      className="rounded p-1.5 text-neutral-400 hover:text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      title="Discard held bill"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-neutral-100 p-3 text-right bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
          <button
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
          >
            Close (ESC)
          </button>
        </div>
      </div>
    </div>
  );
};
