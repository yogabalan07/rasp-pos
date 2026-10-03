import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  TrendingUp, 
  BarChart2, 
  PieChart, 
  Activity, 
  ArrowUpRight, 
  DollarSign, 
  Percent, 
  ShoppingBag 
} from 'lucide-react';

export const AnalyticsPage: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Retail Analytics &amp; KPIs
        </h1>
        <p className="text-xs text-neutral-500">
          Lightweight high-performance visual metrics optimized for Raspberry Pi Edge displays
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Average Basket Size</span>
          <p className="mt-1 text-xl font-bold text-neutral-900 dark:text-white font-tabular">₹830.00</p>
          <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">↑ +8.4% this month</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Inventory Turnover Ratio</span>
          <p className="mt-1 text-xl font-bold text-neutral-900 dark:text-white font-tabular">4.2x</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Annualized cycle</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Average Gross Margin</span>
          <p className="mt-1 text-xl font-bold text-neutral-900 dark:text-white font-tabular">24.1%</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Target: 22.0%</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Return Rate</span>
          <p className="mt-1 text-xl font-bold text-emerald-600 font-tabular">0.8%</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Very low customer refunds</p>
        </div>
      </div>

      {/* Visual Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly Revenue & Profit Trend Chart */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">7-Day Revenue Trend</h3>
              <p className="text-xs text-neutral-400">Past week sales performance</p>
            </div>
            <span className="text-xs font-mono font-bold text-neutral-700 bg-neutral-100 px-2 py-1 rounded dark:bg-neutral-800 dark:text-neutral-300">
              Avg: ₹36,200/day
            </span>
          </div>

          <div className="h-44 w-full flex items-end gap-3 pt-6 pb-2 px-2 border-b border-neutral-100 dark:border-neutral-800">
            {[
              { day: 'Sun', sales: 48200, h: 95 },
              { day: 'Mon', sales: 29400, h: 58 },
              { day: 'Tue', sales: 31200, h: 62 },
              { day: 'Wed', sales: 34850, h: 69 },
              { day: 'Thu', sales: 38100, h: 76 },
              { day: 'Fri', sales: 41500, h: 82 },
              { day: 'Sat', sales: 50400, h: 100 },
            ].map(col => (
              <div key={col.day} className="flex-1 flex flex-col items-center gap-1 group">
                <div 
                  className="w-full bg-neutral-900 rounded-t group-hover:bg-emerald-600 transition-colors dark:bg-neutral-300"
                  style={{ height: `${col.h}%` }}
                  title={`${col.day}: ₹${col.sales}`}
                />
                <span className="text-[10px] text-neutral-500 font-mono">{col.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ABC Inventory Analysis */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">ABC Inventory Analysis</h3>
              <p className="text-xs text-neutral-400">Revenue contribution by catalog volume</p>
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              Pareto 80/20 Optimal
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-emerald-700 dark:text-emerald-400">Category A (High Value)</span>
                <span className="font-tabular">72% of Sales (18% of SKUs)</span>
              </div>
              <div className="h-3 w-full bg-neutral-100 rounded-full overflow-hidden dark:bg-neutral-800">
                <div className="h-full bg-emerald-600 rounded-full" style={{ width: '72%' }} />
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">Atta, Dairy milk, Chilled beverages, Sunflower oil</p>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-blue-700 dark:text-blue-400">Category B (Moderate Value)</span>
                <span className="font-tabular">21% of Sales (32% of SKUs)</span>
              </div>
              <div className="h-3 w-full bg-neutral-100 rounded-full overflow-hidden dark:bg-neutral-800">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: '21%' }} />
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">Biscuits, Confectionery, Bathing soaps</p>
            </div>

            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-amber-700 dark:text-amber-400">Category C (Low Value / Filler)</span>
                <span className="font-tabular">7% of Sales (50% of SKUs)</span>
              </div>
              <div className="h-3 w-full bg-neutral-100 rounded-full overflow-hidden dark:bg-neutral-800">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: '7%' }} />
              </div>
              <p className="text-[10px] text-neutral-400 mt-0.5">Pens, Matches, Notebooks, Specialty snacks</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
