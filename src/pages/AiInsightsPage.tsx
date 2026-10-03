import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  Sparkles, 
  TrendingUp, 
  AlertTriangle, 
  Boxes, 
  ArrowRight, 
  Info,
  Calendar,
  PackagePlus
} from 'lucide-react';

export const AiInsightsPage: React.FC = () => {
  const { navigateTo } = useApp();

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Smart Inventory &amp; Demand Insights
            </h1>
            <span className="rounded bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] font-bold">
              HEURISTIC PREVIEW / DEMO
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            Automated reorder triggers, demand prediction heuristics, and stockout risk models
          </p>
        </div>
      </div>

      {/* Transparency Banner */}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 flex items-start gap-3">
        <Info className="h-4 w-4 text-neutral-500 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Notice:</strong> These demand projections and reorder calculations currently run on local statistical heuristics (moving 7-day sales velocities). When Cloud AI sync is enabled, these will connect to server-side predictive models for weather, festival seasonality, and customer basket affinities.
        </p>
      </div>

      {/* Prediction Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Smart Reorder Recommendation */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                Smart Reorder
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">Velocity: 6 units/day</span>
            </div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Colgate MaxFresh 150g</h3>
            <p className="text-xs text-neutral-500 mt-1">Current Stock: <strong>0 units</strong> (Safety threshold: 10 units)</p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 bg-neutral-50 dark:bg-neutral-800/40 p-2.5 rounded-lg">
              Heuristic Recommendation: Order <strong>40 units</strong> from Hindustan Unilever Hub before Friday to avoid estimated ₹4,600 weekend lost sales.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <button
              onClick={() => navigateTo('/purchases')}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
            >
              <PackagePlus className="h-3.5 w-3.5" />
              <span>Draft PO for 40 units</span>
            </button>
          </div>
        </div>

        {/* Stockout Risk Model */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">
                Imminent Stockout Risk
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">Runout in 18 hrs</span>
            </div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Maggi 2-Minute Masala 280g</h3>
            <p className="text-xs text-neutral-500 mt-1">Current Stock: <strong>4 units</strong></p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 bg-neutral-50 dark:bg-neutral-800/40 p-2.5 rounded-lg">
              Estimated stockout by tonight at current run rate of 5.2 packs/day. Inter-warehouse transfer recommended from Main Central Hub.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <button
              onClick={() => navigateTo('/warehouses')}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-neutral-300 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
            >
              <span>Transfer from Warehouse Hub</span>
            </button>
          </div>
        </div>

        {/* Overstock / Clearance Opportunity */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                Shelf Clearance Alert
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">Expires in 7 days</span>
            </div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Haldiram Bhujia Sev 200g</h3>
            <p className="text-xs text-neutral-500 mt-1">Batch HL-BHU-88: <strong>5 units remaining</strong></p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2 bg-neutral-50 dark:bg-neutral-800/40 p-2.5 rounded-lg">
              FEFO velocity warning: Recommend temporary counter flash discount of 15% or bundle with Coca Cola to clear before expiry date (10 Oct 2026).
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <button
              onClick={() => navigateTo('/offers')}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <span>Setup Clearance Deal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
