import React from 'react';
import { 
  TrendingUp, 
  ShoppingBag, 
  Users, 
  AlertTriangle, 
  Coins, 
  Server, 
  Cloud, 
  RefreshCw, 
  ArrowUpRight, 
  Clock, 
  Receipt, 
  Boxes,
  Plus
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const DashboardPage: React.FC = () => {
  const { systemStatus, navigateTo, currentBranch } = useApp();

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Branch Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>Store Operations</span>
            <span>/</span>
            <span className="font-semibold text-neutral-900 dark:text-white">{currentBranch.name}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950 dark:text-white mt-1">
            Dashboard Overview
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateTo('/pos')}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Open POS Terminal (F1)</span>
          </button>
        </div>
      </div>

      {/* Edge System Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Local Server */}
        <div 
          onClick={() => navigateTo('/server')}
          className="cursor-pointer rounded-xl border border-neutral-200 bg-white p-4 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">EDGE LOCAL SERVER</span>
            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-400 px-2 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              ONLINE
            </span>
          </div>
          <p className="mt-2 text-base font-bold text-neutral-900 dark:text-white font-mono">10.205.100.50</p>
          <p className="text-[11px] text-neutral-400 mt-0.5">Raspberry Pi 3B+ · SQLite Edge Engine</p>
        </div>

        {/* Cloud Firebase */}
        <div 
          onClick={() => navigateTo('/cloud')}
          className="cursor-pointer rounded-xl border border-neutral-200 bg-white p-4 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">FIREBASE CLOUD</span>
            <span className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
              systemStatus.cloudServer === 'ONLINE'
                ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-400'
                : 'text-amber-800 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300'
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${systemStatus.cloudServer === 'ONLINE' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {systemStatus.cloudServer === 'ONLINE' ? 'CONNECTED' : 'OFFLINE'}
            </span>
          </div>
          <p className="mt-2 text-base font-bold text-neutral-900 dark:text-white font-mono">Firestore DB</p>
          <p className="text-[11px] text-neutral-400 mt-0.5">asia-south1 (Mumbai) Region</p>
        </div>

        {/* Sync Status */}
        <div 
          onClick={() => navigateTo('/sync')}
          className="cursor-pointer rounded-xl border border-neutral-200 bg-white p-4 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">DATA SYNCHRONIZATION</span>
            <span className="text-[11px] font-bold text-neutral-600 dark:text-neutral-400 font-mono">
              Last: {systemStatus.lastSyncedAt}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-base font-bold text-neutral-900 dark:text-white">
              {systemStatus.pendingSyncCount === 0 ? 'All Data Synchronized' : `${systemStatus.pendingSyncCount} Records Pending`}
            </span>
          </div>
          <p className="text-[11px] text-neutral-400 mt-0.5">Two-way differential SQLite ↔ Firestore sync</p>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Today's Sales</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-neutral-950 dark:text-white font-tabular">₹34,850</p>
          <p className="text-[10px] text-emerald-600 font-semibold mt-1">↑ +14.2% vs yesterday</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Gross Profit</span>
            <Coins className="h-4 w-4 text-neutral-600" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-neutral-950 dark:text-white font-tabular">₹8,420</p>
          <p className="text-[10px] text-neutral-400 mt-1 font-mono">Margin: 24.1%</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Total Bills</span>
            <Receipt className="h-4 w-4 text-neutral-600" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-neutral-950 dark:text-white font-tabular">42 Bills</p>
          <p className="text-[10px] text-neutral-400 mt-1">Avg Bill: ₹830</p>
        </div>

        <div 
          onClick={() => navigateTo('/inventory')}
          className="cursor-pointer rounded-xl border border-neutral-200 bg-white p-3.5 hover:border-amber-400 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Low Stock</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-amber-600 dark:text-amber-400 font-tabular">3 Items</p>
          <p className="text-[10px] text-neutral-400 mt-1">1 Out of Stock</p>
        </div>

        <div 
          onClick={() => navigateTo('/cash')}
          className="cursor-pointer rounded-xl border border-neutral-200 bg-white p-3.5 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex items-center justify-between text-neutral-500 text-xs">
            <span>Cash in Hand</span>
            <Coins className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-neutral-950 dark:text-white font-tabular">₹3,270</p>
          <p className="text-[10px] text-neutral-400 mt-1 font-mono">Expected float</p>
        </div>
      </div>

      {/* Lightweight SVG Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales Trend (2 cols) */}
        <div className="lg:col-span-2 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Hourly Sales Volume Today</h3>
              <p className="text-xs text-neutral-400">Peak customer footfall between 07:00 PM - 09:00 PM</p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
              Today: ₹34,850
            </span>
          </div>

          {/* Clean High-Performance SVG Bar Chart */}
          <div className="h-44 w-full flex items-end gap-2 pt-4 pb-2 px-2 border-b border-neutral-100 dark:border-neutral-800">
            {[
              { time: '8 AM', val: 1200, height: 18 },
              { time: '9 AM', val: 3400, height: 42 },
              { time: '10 AM', val: 2800, height: 35 },
              { time: '11 AM', val: 4200, height: 55 },
              { time: '12 PM', val: 5600, height: 70 },
              { time: '1 PM', val: 3100, height: 38 },
              { time: '2 PM', val: 2400, height: 30 },
              { time: '3 PM', val: 3800, height: 48 },
              { time: '4 PM', val: 4600, height: 58 },
              { time: '5 PM', val: 6800, height: 85 },
              { time: '6 PM', val: 8200, height: 100 },
              { time: '7 PM', val: 7400, height: 92 },
            ].map(col => (
              <div key={col.time} className="flex-1 flex flex-col items-center gap-1 group">
                <div 
                  className="w-full bg-neutral-900 dark:bg-neutral-200 rounded-t group-hover:bg-emerald-600 transition-colors"
                  style={{ height: `${col.height}%` }}
                  title={`${col.time}: ₹${col.val}`}
                />
                <span className="text-[9px] text-neutral-400 font-mono truncate">{col.time}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
            <span>Fast moving peak: Snacks &amp; Beverages</span>
            <button onClick={() => navigateTo('/analytics')} className="font-semibold text-neutral-900 dark:text-white underline">
              Detailed Analytics →
            </button>
          </div>
        </div>

        {/* Payment Methods Breakdown */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Payment Method Share</h3>
            <p className="text-xs text-neutral-400">Total settled ₹34,850</p>

            <div className="mt-4 space-y-3">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>UPI / QR Scan</span>
                  <span className="font-tabular">58% (₹20,213)</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden dark:bg-neutral-800">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '58%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Cash Currency</span>
                  <span className="font-tabular">26% (₹9,061)</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden dark:bg-neutral-800">
                  <div className="h-full bg-neutral-900 dark:bg-white rounded-full" style={{ width: '26%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Debit / Credit Card</span>
                  <span className="font-tabular">12% (₹4,182)</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden dark:bg-neutral-800">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: '12%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span>Khata Store Credit</span>
                  <span className="font-tabular">4% (₹1,394)</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden dark:bg-neutral-800">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: '4%' }} />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-400">
            UPI settlement routed directly to store bank account.
          </div>
        </div>
      </div>

      {/* Quick Tables: Top Selling Products & Critical Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Sellers */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Top Moving Products Today</h3>
            <button onClick={() => navigateTo('/products')} className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
              View All
            </button>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
            {[
              { name: 'Coca Cola 750ml Bottle', qty: 24, revenue: 960, stock: 48 },
              { name: 'Britannia Good Day Butter 200g', qty: 18, revenue: 630, stock: 64 },
              { name: 'Tata Salt Vacuum Evaporated 1kg', qty: 15, revenue: 420, stock: 95 },
              { name: 'Aashirvaad Atta 5kg', qty: 12, revenue: 3180, stock: 30 },
              { name: 'Parle-G Gold Biscuits 1kg', qty: 9, revenue: 1170, stock: 18 },
            ].map((p, idx) => (
              <div key={idx} className="py-2 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-neutral-900 dark:text-white">{p.name}</p>
                  <p className="text-[10px] text-neutral-400">Available Stock: {p.stock}</p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-neutral-900 dark:text-white font-tabular">₹{p.revenue}</span>
                  <p className="text-[10px] text-neutral-400 font-tabular">{p.qty} sold</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Attention Items: Low Stock & Expiry */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Immediate Attention Items</h3>
            <span className="text-[11px] text-amber-700 font-semibold">Priority FEFO</span>
          </div>

          <div className="space-y-2 text-xs">
            <div 
              onClick={() => navigateTo('/inventory')}
              className="cursor-pointer p-2.5 rounded-lg border border-red-200 bg-red-50/50 hover:bg-red-50 dark:border-red-900/60 dark:bg-red-950/30 flex items-center justify-between"
            >
              <div>
                <p className="font-bold text-red-900 dark:text-red-200">Colgate MaxFresh Peppermint 150g</p>
                <p className="text-[10px] text-red-700 dark:text-red-300">Stock: 0 units · Out of Stock</p>
              </div>
              <button className="text-[11px] bg-red-600 text-white font-semibold px-2 py-1 rounded">
                Reorder
              </button>
            </div>

            <div 
              onClick={() => navigateTo('/batches')}
              className="cursor-pointer p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 hover:bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30 flex items-center justify-between"
            >
              <div>
                <p className="font-bold text-amber-900 dark:text-amber-200">Haldiram Bhujia Sev 200g (Batch HL-BHU-88)</p>
                <p className="text-[10px] text-amber-700 dark:text-amber-300">Expires in 7 days (10 Oct 2026) · 5 units left</p>
              </div>
              <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                FEFO Push
              </span>
            </div>

            <div 
              onClick={() => navigateTo('/credit')}
              className="cursor-pointer p-2.5 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800/40 flex items-center justify-between"
            >
              <div>
                <p className="font-bold text-neutral-900 dark:text-white">Sunil Kumar (Kalyani Caterers)</p>
                <p className="text-[10px] text-neutral-500">Khata balance ₹14,800 due on 04 Oct 2026</p>
              </div>
              <span className="text-xs font-bold text-neutral-900 dark:text-white font-tabular">
                ₹14,800
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
