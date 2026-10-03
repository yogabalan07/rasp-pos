import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { authService } from '../services/auth';
import { Shift } from '../types';
import { 
  Clock, 
  Printer, 
  Lock, 
  Coins, 
  CheckCircle, 
  FileText, 
  X,
  CreditCard,
  QrCode,
  Banknote
} from 'lucide-react';

export const ShiftsPage: React.FC = () => {
  const { currentUser, showToast } = useApp();
  const [shift, setShift] = useState<Shift>(() => authService.getCurrentShift());
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [actualCashCount, setActualCashCount] = useState('3270');
  const [closingNotes, setClosingNotes] = useState('');
  const [printReportType, setPrintReportType] = useState<'X_REPORT' | 'Z_REPORT' | null>(null);

  const handleCloseShift = (e: React.FormEvent) => {
    e.preventDefault();
    const actual = parseFloat(actualCashCount) || 0;
    const closed = authService.closeShift(actual, closingNotes);
    setShift({ ...closed });
    setIsCloseModalOpen(false);
    showToast('Shift closed successfully. Z-Report generated.', 'success');
    setPrintReportType('Z_REPORT');
  };

  const handleStartNewShift = () => {
    const newS = authService.openNewShift(2000);
    setShift({ ...newS });
    showToast('New cashier shift opened with ₹2,000 opening float', 'success');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Shift Management, X-Report &amp; Z-Report
          </h1>
          <p className="text-xs text-neutral-500">
            Cashier shift reconciliation, mid-day readings (X-Report), and end-of-day drawer closing (Z-Report)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPrintReportType('X_REPORT')}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <Printer className="h-4 w-4" />
            <span>Generate X-Report</span>
          </button>

          {shift.status === 'OPEN' ? (
            <button
              onClick={() => setIsCloseModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors"
            >
              <Lock className="h-4 w-4" />
              <span>Close Shift &amp; Print Z-Report</span>
            </button>
          ) : (
            <button
              onClick={handleStartNewShift}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors"
            >
              <Clock className="h-4 w-4" />
              <span>Open New Shift</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Shift Details Banner */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3 dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-neutral-900 dark:text-white">{shift.shiftNumber}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                shift.status === 'OPEN' ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'
              }`}>
                {shift.status}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Cashier: <strong>{shift.cashierName}</strong> · Started at {shift.startTime}
              {shift.endTime && ` · Ended at ${shift.endTime}`}
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-neutral-400">Total Shift Sales Turnover:</span>
            <p className="text-lg font-black font-tabular text-neutral-950 dark:text-white">
              ₹{(shift.cashSales + shift.upiSales + shift.cardSales + shift.creditSales).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Payment Breakdown Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/40">
            <div className="flex items-center gap-1.5 text-neutral-500 mb-1">
              <Banknote className="h-3.5 w-3.5" />
              <span>Cash Sales</span>
            </div>
            <p className="text-base font-bold font-tabular text-neutral-900 dark:text-white">
              ₹{shift.cashSales.toFixed(2)}
            </p>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/40">
            <div className="flex items-center gap-1.5 text-neutral-500 mb-1">
              <QrCode className="h-3.5 w-3.5" />
              <span>UPI / QR Sales</span>
            </div>
            <p className="text-base font-bold font-tabular text-emerald-600">
              ₹{shift.upiSales.toFixed(2)}
            </p>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/40">
            <div className="flex items-center gap-1.5 text-neutral-500 mb-1">
              <CreditCard className="h-3.5 w-3.5" />
              <span>Card Transactions</span>
            </div>
            <p className="text-base font-bold font-tabular text-blue-600">
              ₹{shift.cardSales.toFixed(2)}
            </p>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/40">
            <div className="flex items-center gap-1.5 text-neutral-500 mb-1">
              <Coins className="h-3.5 w-3.5" />
              <span>Opening Float</span>
            </div>
            <p className="text-base font-bold font-tabular text-neutral-900 dark:text-white">
              ₹{shift.openingCash.toFixed(2)}
            </p>
          </div>
        </div>

        {shift.status === 'CLOSED' && shift.variance !== undefined && (
          <div className="rounded-lg bg-neutral-100 p-3 dark:bg-neutral-800 flex items-center justify-between text-xs">
            <span>Shift Reconciled Variance:</span>
            <span className={`font-mono font-bold ${shift.variance === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {shift.variance === 0 ? '₹0.00 (Balanced)' : `₹${shift.variance.toFixed(2)}`}
            </span>
          </div>
        )}
      </div>

      {/* Close Shift Modal */}
      {isCloseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Close Cashier Shift &amp; Lock Till</h2>
              <button onClick={() => setIsCloseModalOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCloseShift} className="p-5 space-y-3">
              <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/40 text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Opening Cash Float:</span>
                  <span className="font-tabular font-bold">₹{shift.openingCash.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Cash Collected:</span>
                  <span className="font-tabular font-bold text-emerald-600">+₹{shift.cashSales.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Petty Cash Expenses:</span>
                  <span className="font-tabular font-bold text-red-600">-₹{shift.cashExpenses.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-neutral-200 pt-1 font-bold dark:border-neutral-700">
                  <span>Expected Physical Till Cash:</span>
                  <span className="font-tabular text-sm">₹{shift.expectedCash.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold">Physical Cash Count in Drawer (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={actualCashCount}
                  onChange={e => setActualCashCount(e.target.value)}
                  className="mt-1 w-full rounded border border-neutral-300 p-2.5 text-lg font-black font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">Handover Notes</label>
                <input
                  type="text"
                  value={closingNotes}
                  onChange={e => setClosingNotes(e.target.value)}
                  placeholder="e.g. Handed over to evening cashier Sneha"
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-red-600 px-5 py-2 text-xs font-bold text-white hover:bg-red-700"
                >
                  Confirm &amp; Generate Z-Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* X / Z Report Preview Modal */}
      {printReportType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-sm rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
              <h2 className="text-xs font-bold font-mono">
                {printReportType === 'X_REPORT' ? 'X-REPORT (MID-SHIFT READING)' : 'Z-REPORT (DAILY CLOSING READING)'}
              </h2>
              <button onClick={() => setPrintReportType(null)} className="p-1 text-neutral-400 hover:text-neutral-700">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-neutral-100 dark:bg-neutral-950 flex justify-center">
              <div className="w-[300px] bg-white p-4 font-mono text-[11px] text-neutral-900 shadow-sm border border-neutral-200 space-y-2">
                <div className="text-center pb-2 border-b border-dashed border-neutral-300">
                  <h3 className="font-bold font-sans text-sm">YB RETAIL STORE</h3>
                  <p className="font-bold text-xs uppercase">{printReportType.replace('_', ' ')}</p>
                  <p className="text-[10px] text-neutral-500">Node: Pi-3B+ | SQLite-Local</p>
                  <p className="text-[10px] text-neutral-500">Date: {new Date().toLocaleDateString('en-IN')}</p>
                </div>

                <div className="space-y-1 py-1 border-b border-dashed border-neutral-300">
                  <div className="flex justify-between"><span>Shift ID:</span><span>{shift.shiftNumber}</span></div>
                  <div className="flex justify-between"><span>Cashier:</span><span>{shift.cashierName}</span></div>
                  <div className="flex justify-between"><span>Start Time:</span><span>{shift.startTime}</span></div>
                </div>

                <div className="space-y-1 py-1 border-b border-dashed border-neutral-300">
                  <div className="flex justify-between font-bold"><span>Total Turnover:</span><span>₹{(shift.cashSales + shift.upiSales + shift.cardSales).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Cash Sales:</span><span>₹{shift.cashSales.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>UPI Sales:</span><span>₹{shift.upiSales.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Card Sales:</span><span>₹{shift.cardSales.toFixed(2)}</span></div>
                </div>

                <div className="space-y-1 py-1 border-b border-dashed border-neutral-300">
                  <div className="flex justify-between"><span>Opening Float:</span><span>₹{shift.openingCash.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Expenses:</span><span>-₹{shift.cashExpenses.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold"><span>Expected Till:</span><span>₹{shift.expectedCash.toFixed(2)}</span></div>
                </div>

                <div className="pt-2 text-center text-[9px] text-neutral-500">
                  <p>*** END OF {printReportType.replace('_', ' ')} ***</p>
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-between bg-neutral-50 dark:bg-neutral-900">
              <button
                onClick={() => setPrintReportType(null)}
                className="rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
              >
                Close
              </button>
              <button
                onClick={() => { window.print(); setPrintReportType(null); }}
                className="flex items-center gap-1.5 rounded bg-neutral-900 px-4 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print Report</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
