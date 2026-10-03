import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Coins, 
  Plus, 
  Minus, 
  ArrowDownRight, 
  ArrowUpRight, 
  AlertCircle, 
  CheckCircle2, 
  X,
  Banknote
} from 'lucide-react';

export const CashPage: React.FC = () => {
  const { showToast } = useApp();
  const [openingCash, setOpeningCash] = useState(2000.00);
  const [cashSales] = useState(1420.00);
  const [expenses, setExpenses] = useState<Array<{ id: string; time: string; amount: number; reason: string; staff: string }>>([
    { id: 'exp-1', time: '08:45 AM', amount: 150.00, reason: 'Staff Tea & Coffee refreshments', staff: 'Rohan Sharma' },
    { id: 'exp-2', time: '09:10 AM', amount: 80.00, reason: 'Courier delivery tip & parcel fee', staff: 'Rohan Sharma' },
  ]);

  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseReason, setExpenseReason] = useState('');

  const [actualCashInput, setActualCashInput] = useState('3190');

  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
  const expectedCash = openingCash + cashSales - totalExpenses;
  const actualCash = parseFloat(actualCashInput) || 0;
  const variance = actualCash - expectedCash;

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(expenseAmount) || 0;
    if (amt <= 0 || !expenseReason.trim()) return;

    setExpenses(prev => [
      {
        id: `exp-${Date.now()}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        amount: amt,
        reason: expenseReason.trim(),
        staff: 'Active Cashier',
      },
      ...prev,
    ]);

    showToast(`Petty cash expense of ₹${amt} recorded`, 'info');
    setIsExpenseOpen(false);
    setExpenseAmount('');
    setExpenseReason('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Cash Drawer &amp; Float Management
          </h1>
          <p className="text-xs text-neutral-500">
            Reconcile physical cash in till, petty expenses, withdrawals, and shift variance
          </p>
        </div>

        <button
          onClick={() => setIsExpenseOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 transition-colors"
        >
          <Minus className="h-4 w-4 text-amber-400" />
          <span>Record Petty Cash Expense</span>
        </button>
      </div>

      {/* Cash Flow Balance Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Opening Till Float</span>
          <p className="mt-1 text-xl font-extrabold text-neutral-900 dark:text-white font-tabular">
            ₹{openingCash.toFixed(2)}
          </p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Shift opening cash</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Cash Sales Today</span>
          <p className="mt-1 text-xl font-extrabold text-emerald-600 font-tabular">
            +₹{cashSales.toFixed(2)}
          </p>
          <p className="text-[10px] text-neutral-400 mt-0.5">From completed cash bills</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Petty Cash Outflows</span>
          <p className="mt-1 text-xl font-extrabold text-red-600 font-tabular">
            -₹{totalExpenses.toFixed(2)}
          </p>
          <p className="text-[10px] text-neutral-400 mt-0.5">{expenses.length} expense vouchers</p>
        </div>

        <div className="rounded-xl border border-neutral-900 bg-neutral-950 p-3.5 text-white dark:border-neutral-700">
          <span className="text-xs text-neutral-400">Expected in Drawer</span>
          <p className="mt-1 text-xl font-black font-tabular text-emerald-400">
            ₹{expectedCash.toFixed(2)}
          </p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Opening + Cash Sales - Expenses</p>
        </div>
      </div>

      {/* Drawer Cash Reconciliation Panel */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-3 flex items-center gap-2">
          <Banknote className="h-4 w-4" />
          <span>Physical Cash Till Reconciliation</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Actual Counted Cash in Till (₹)
            </label>
            <input
              type="number"
              value={actualCashInput}
              onChange={e => setActualCashInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 p-2.5 text-xl font-black font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <div>
            <span className="text-xs font-semibold text-neutral-500">Calculated Expected Cash</span>
            <p className="text-xl font-bold font-tabular text-neutral-900 dark:text-white mt-1">
              ₹{expectedCash.toFixed(2)}
            </p>
          </div>

          <div className="rounded-xl border p-3 flex items-center justify-between bg-neutral-50 dark:bg-neutral-800/50">
            <div>
              <span className="text-xs font-semibold text-neutral-500">Till Variance</span>
              <p className={`text-xl font-black font-tabular ${
                variance === 0 ? 'text-emerald-600' : variance > 0 ? 'text-blue-600' : 'text-red-600'
              }`}>
                {variance > 0 ? `+₹${variance.toFixed(2)}` : variance < 0 ? `-₹${Math.abs(variance).toFixed(2)}` : '₹0.00 (Balanced)'}
              </p>
            </div>
            {variance === 0 ? (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded">MATCHED</span>
            ) : (
              <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-1 rounded">
                {variance > 0 ? 'OVER' : 'SHORT'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Petty Cash Expenses Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-800/40">
          <h3 className="text-xs font-bold text-neutral-900 dark:text-white">Petty Cash Vouchers Today</h3>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-2.5 px-4">Time</th>
              <th className="py-2.5 px-4">Expense Purpose</th>
              <th className="py-2.5 px-4">Authorized By</th>
              <th className="py-2.5 px-4 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {expenses.map(exp => (
              <tr key={exp.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="py-3 px-4 font-mono text-[11px] text-neutral-500">{exp.time}</td>
                <td className="py-3 px-4 font-semibold text-neutral-800 dark:text-neutral-200">{exp.reason}</td>
                <td className="py-3 px-4 text-neutral-500">{exp.staff}</td>
                <td className="py-3 px-4 text-right font-bold font-tabular text-red-600">-₹{exp.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Expense Modal */}
      {isExpenseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex flex-col w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3.5 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">Record Cash Expense Voucher</h2>
              <button onClick={() => setIsExpenseOpen(false)} className="text-neutral-400 hover:text-neutral-700 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddExpense} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold">Expense Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={expenseAmount}
                  onChange={e => setExpenseAmount(e.target.value)}
                  placeholder="e.g. 150"
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-sm font-bold font-tabular dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold">Expense Purpose / Reason *</label>
                <input
                  type="text"
                  required
                  value={expenseReason}
                  onChange={e => setExpenseReason(e.target.value)}
                  placeholder="e.g. Courier charges, Tea snacks for staff"
                  className="mt-1 w-full rounded border border-neutral-300 p-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsExpenseOpen(false)}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-neutral-900 px-5 py-2 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
                >
                  Record Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
