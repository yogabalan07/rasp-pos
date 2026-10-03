import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Percent, 
  Download, 
  FileText, 
  Check, 
  Calculator, 
  FileSpreadsheet,
  Building2 
} from 'lucide-react';

export const GstPage: React.FC = () => {
  const { currentBranch, showToast } = useApp();
  const [selectedMonth, setSelectedMonth] = useState('October 2026');

  const gstSlabs = [
    { slab: '0%', description: 'Exempt items (Fresh grains, unpackaged salt)', itemsCount: 4, monthlyTaxable: 18400, cgst: 0, sgst: 0 },
    { slab: '5%', description: 'Staples & Basic Groceries (Atta, Edible oil, Milk)', itemsCount: 28, monthlyTaxable: 142500, cgst: 3562.50, sgst: 3562.50 },
    { slab: '12%', description: 'Confectionery, Notebooks, Savory snacks', itemsCount: 16, monthlyTaxable: 68200, cgst: 4092.00, sgst: 4092.00 },
    { slab: '18%', description: 'Standard FMCG, Biscuits, Soaps, Detergents', itemsCount: 45, monthlyTaxable: 210400, cgst: 18936.00, sgst: 18936.00 },
    { slab: '28%', description: 'Aerated soft drinks & Chilled beverages', itemsCount: 12, monthlyTaxable: 54600, cgst: 7644.00, sgst: 7644.00 },
  ];

  const totalTaxable = gstSlabs.reduce((acc, s) => acc + s.monthlyTaxable, 0);
  const totalCgst = gstSlabs.reduce((acc, s) => acc + s.cgst, 0);
  const totalSgst = gstSlabs.reduce((acc, s) => acc + s.sgst, 0);
  const totalTax = totalCgst + totalSgst;

  const handleExport = () => {
    showToast(`GSTR-1 Tax Summary for ${selectedMonth} exported as CSV`, 'success');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            GST &amp; Taxation Center (GSTR-1 / GSTR-3B)
          </h1>
          <p className="text-xs text-neutral-500">
            Indian Goods &amp; Services Tax compliance, slab breakdown, and HSN/SAC summary
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <option value="October 2026">October 2026 (Current)</option>
            <option value="September 2026">September 2026</option>
            <option value="August 2026">August 2026</option>
          </select>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export GSTR-1 CSV</span>
          </button>
        </div>
      </div>

      {/* Tax Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Total Taxable Turnover</span>
          <p className="mt-1 text-xl font-bold text-neutral-900 dark:text-white font-tabular">
            ₹{totalTaxable.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Net sales before tax</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">CGST (Central Tax)</span>
          <p className="mt-1 text-xl font-bold text-neutral-900 dark:text-white font-tabular">
            ₹{totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-neutral-400 mt-0.5">50% Intra-state share</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">SGST (State Tax)</span>
          <p className="mt-1 text-xl font-bold text-neutral-900 dark:text-white font-tabular">
            ₹{totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-neutral-400 mt-0.5">50% Karnataka share</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Total GST Collected</span>
          <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-400 font-tabular">
            ₹{totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Payable to GSTN</p>
        </div>
      </div>

      {/* Tax Slabs Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-800/40">
          <h3 className="text-xs font-bold text-neutral-900 dark:text-white">Tax Slab Breakdown ({selectedMonth})</h3>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Rate Slab</th>
              <th className="py-3 px-4">Item Scope</th>
              <th className="py-3 px-4 text-center">SKUs</th>
              <th className="py-3 px-4 text-right">Taxable Turnover</th>
              <th className="py-3 px-4 text-right">CGST (₹)</th>
              <th className="py-3 px-4 text-right">SGST (₹)</th>
              <th className="py-3 px-4 text-right">Total Tax (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {gstSlabs.map(s => (
              <tr key={s.slab} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="py-3 px-4 font-bold font-mono text-sm text-neutral-900 dark:text-white">
                  {s.slab}
                </td>
                <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400">
                  {s.description}
                </td>
                <td className="py-3 px-4 text-center font-tabular text-neutral-500">
                  {s.itemsCount}
                </td>
                <td className="py-3 px-4 text-right font-tabular text-neutral-800 dark:text-neutral-200">
                  ₹{s.monthlyTaxable.toLocaleString('en-IN')}
                </td>
                <td className="py-3 px-4 text-right font-tabular text-neutral-600 dark:text-neutral-400">
                  ₹{s.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-right font-tabular text-neutral-600 dark:text-neutral-400">
                  ₹{s.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-right font-bold font-tabular text-neutral-900 dark:text-white">
                  ₹{(s.cgst + s.sgst).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
