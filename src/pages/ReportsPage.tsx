import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  BarChart3, 
  Download, 
  Printer, 
  Calendar, 
  Filter, 
  TrendingUp, 
  Boxes, 
  Users, 
  Receipt,
  FileSpreadsheet
} from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { showToast } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<'SALES' | 'INVENTORY' | 'PROFIT' | 'DEAD_STOCK'>('SALES');
  const [dateRange, setDateRange] = useState('TODAY');

  const handleExport = (type: string) => {
    showToast(`${type} Report for ${dateRange} exported as CSV`, 'success');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Reports Center &amp; Data Exports
          </h1>
          <p className="text-xs text-neutral-500">
            Generate operational sales reports, stock valuation, dead stock detection, and profit audits
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <option value="TODAY">Today (03 Oct 2026)</option>
            <option value="THIS_WEEK">This Week (Past 7 Days)</option>
            <option value="THIS_MONTH">This Month (October 2026)</option>
            <option value="LAST_MONTH">Last Month (September 2026)</option>
          </select>

          <button
            onClick={() => handleExport(selectedCategory)}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Report Categories Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { id: 'SALES', label: 'Sales & Turnovers', icon: Receipt },
          { id: 'PROFIT', label: 'Gross Profit & Margins', icon: TrendingUp },
          { id: 'INVENTORY', label: 'Fast / Slow Moving Stock', icon: Boxes },
          { id: 'DEAD_STOCK', label: 'Dead Stock & Non-Moving', icon: FileSpreadsheet },
        ].map(cat => {
          const Icon = cat.icon;
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id as any)}
              className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                isSelected
                  ? 'border-neutral-900 bg-neutral-900 text-white shadow-xs dark:border-white dark:bg-white dark:text-neutral-950'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-xs font-bold truncate">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Selected Report Content */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
        {selectedCategory === 'SALES' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Daily Sales Ledger Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/40">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-center">Bills</th>
                    <th className="py-2.5 px-3 text-right">Taxable Amount</th>
                    <th className="py-2.5 px-3 text-right">GST (₹)</th>
                    <th className="py-2.5 px-3 text-right">Total Net Revenue (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {[
                    { date: '03 Oct 2026 (Today)', bills: 42, taxable: 30850, gst: 4000, total: 34850 },
                    { date: '02 Oct 2026', bills: 58, taxable: 42100, gst: 5400, total: 47500 },
                    { date: '01 Oct 2026', bills: 39, taxable: 28400, gst: 3600, total: 32000 },
                    { date: '30 Sep 2026', bills: 45, taxable: 33200, gst: 4100, total: 37300 },
                  ].map((row, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                      <td className="py-2.5 px-3 font-semibold text-neutral-900 dark:text-white">{row.date}</td>
                      <td className="py-2.5 px-3 text-center font-tabular">{row.bills}</td>
                      <td className="py-2.5 px-3 text-right font-tabular">₹{row.taxable.toLocaleString('en-IN')}</td>
                      <td className="py-2.5 px-3 text-right font-tabular text-neutral-500">₹{row.gst.toLocaleString('en-IN')}</td>
                      <td className="py-2.5 px-3 text-right font-bold font-tabular text-emerald-700 dark:text-emerald-400">
                        ₹{row.total.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedCategory === 'PROFIT' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Gross Margin &amp; Profit Report</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3 bg-neutral-50 dark:bg-neutral-800/40">
                <span className="text-xs text-neutral-500">Total Billed Revenue</span>
                <p className="text-lg font-bold font-tabular mt-1">₹34,850.00</p>
              </div>
              <div className="rounded-lg border p-3 bg-neutral-50 dark:bg-neutral-800/40">
                <span className="text-xs text-neutral-500">Cost of Goods Sold (COGS)</span>
                <p className="text-lg font-bold font-tabular mt-1 text-neutral-700 dark:text-neutral-300">₹26,430.00</p>
              </div>
              <div className="rounded-lg border p-3 bg-emerald-50 dark:bg-emerald-950/40">
                <span className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">Net Gross Profit</span>
                <p className="text-lg font-black font-tabular mt-1 text-emerald-700 dark:text-emerald-400">₹8,420.00 (24.1%)</p>
              </div>
            </div>
          </div>
        )}

        {selectedCategory === 'INVENTORY' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Fast vs Slow Moving Velocity Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                <h4 className="font-bold text-emerald-800 dark:text-emerald-300 mb-2">Fast Moving Items (Top 80% Velocity)</h4>
                <ul className="space-y-1.5">
                  <li className="flex justify-between"><span>Coca Cola 750ml</span><strong>24 units / day</strong></li>
                  <li className="flex justify-between"><span>Britannia Good Day 200g</span><strong>18 units / day</strong></li>
                  <li className="flex justify-between"><span>Tata Salt 1kg</span><strong>15 units / day</strong></li>
                  <li className="flex justify-between"><span>Aashirvaad Atta 5kg</span><strong>12 units / day</strong></li>
                </ul>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                <h4 className="font-bold text-amber-800 dark:text-amber-300 mb-2">Slow Moving Items (&lt;2 units / week)</h4>
                <ul className="space-y-1.5">
                  <li className="flex justify-between"><span>Reynolds 045 Ball Pen (Boxes)</span><span>0.8 units / week</span></li>
                  <li className="flex justify-between"><span>Classmate Pulse Notebook</span><span>1.2 units / week</span></li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {selectedCategory === 'DEAD_STOCK' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Dead Stock &amp; Capital Stagnation</h3>
            <p className="text-xs text-neutral-500">Products with zero sales velocity over the past 45+ days</p>
            <div className="rounded-lg border border-neutral-200 p-4 text-center text-xs text-neutral-500">
              No critical dead stock detected. Inventory turnover ratio is healthy at 4.2x.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
