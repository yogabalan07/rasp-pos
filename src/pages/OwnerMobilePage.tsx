import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  TrendingUp, 
  Coins, 
  Boxes, 
  Users, 
  CreditCard, 
  Server, 
  Cloud, 
  RefreshCw, 
  Building2, 
  Smartphone,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';

export const OwnerMobilePage: React.FC = () => {
  const { systemStatus, currentBranch, navigateTo } = useApp();

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-5 max-w-lg mx-auto space-y-4">
      {/* Mobile Top Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <div>
          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Executive Overview</span>
          <h1 className="text-lg font-bold text-neutral-900 dark:text-white leading-tight">
            Store Owner Mobile
          </h1>
          <p className="text-[11px] text-neutral-500 font-medium">{currentBranch.name}</p>
        </div>

        {/* Status Pill */}
        <div className="flex flex-col items-end gap-1">
          <span className="flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Edge 10.205 Online
          </span>
          <span className="text-[10px] font-mono text-neutral-400">
            {systemStatus.cloudServer === 'ONLINE' ? 'Cloud Synced' : 'Edge Local'}
          </span>
        </div>
      </div>

      {/* Primary KPI Hero Card */}
      <div className="rounded-2xl bg-neutral-950 p-5 text-white shadow-md">
        <span className="text-xs text-neutral-400 font-medium">Today's Sales Revenue</span>
        <div className="mt-1 flex items-baseline justify-between">
          <p className="text-3xl font-black font-tabular tracking-tight">₹34,850</p>
          <span className="text-xs font-bold text-emerald-400">↑ +14.2%</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-neutral-800 pt-3 text-xs">
          <div>
            <span className="text-neutral-400 text-[11px]">Gross Profit</span>
            <p className="font-bold font-tabular text-emerald-400">₹8,420 (24.1%)</p>
          </div>
          <div>
            <span className="text-neutral-400 text-[11px]">Total Bills Completed</span>
            <p className="font-bold font-tabular">42 Transactions</p>
          </div>
        </div>
      </div>

      {/* Critical Attention Badges */}
      <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900 space-y-2">
        <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Operational Highlights</span>
        
        <div 
          onClick={() => navigateTo('/credit')}
          className="cursor-pointer flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 text-xs"
        >
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-red-500" />
            <span>Customer Khata Dues:</span>
          </div>
          <span className="font-bold font-tabular text-red-600">₹17,670</span>
        </div>

        <div 
          onClick={() => navigateTo('/inventory')}
          className="cursor-pointer flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 text-xs"
        >
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-amber-500" />
            <span>Low Stock Products:</span>
          </div>
          <span className="font-bold text-amber-600">3 SKUs</span>
        </div>

        <div 
          onClick={() => navigateTo('/batches')}
          className="cursor-pointer flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 text-xs"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            <span>Near Expiry Batches:</span>
          </div>
          <span className="font-bold text-amber-600">1 Item (7 Days)</span>
        </div>
      </div>

      {/* Quick Navigation Buttons */}
      <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
        <button
          onClick={() => navigateTo('/pos')}
          className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3.5 hover:border-neutral-900 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
        >
          <span>Open POS Terminal</span>
          <ChevronRight className="h-4 w-4 text-neutral-400" />
        </button>

        <button
          onClick={() => navigateTo('/reports')}
          className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3.5 hover:border-neutral-900 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
        >
          <span>Daily Reports</span>
          <ChevronRight className="h-4 w-4 text-neutral-400" />
        </button>

        <button
          onClick={() => navigateTo('/server')}
          className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3.5 hover:border-neutral-900 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
        >
          <span>Pi Server Health</span>
          <ChevronRight className="h-4 w-4 text-neutral-400" />
        </button>

        <button
          onClick={() => navigateTo('/sync')}
          className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-3.5 hover:border-neutral-900 text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
        >
          <span>Sync Status</span>
          <ChevronRight className="h-4 w-4 text-neutral-400" />
        </button>
      </div>
    </div>
  );
};
