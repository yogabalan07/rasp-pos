import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Settings, 
  Store, 
  Printer, 
  Database, 
  Shield, 
  Save, 
  Check 
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { currentBranch, showToast } = useApp();

  const [storeName, setStoreName] = useState('YB INVENTORY & POS');
  const [gstin, setGstin] = useState(currentBranch.gstin);
  const [address, setAddress] = useState(currentBranch.address);
  const [phone, setPhone] = useState(currentBranch.phone);
  const [currency, setCurrency] = useState('INR (₹)');
  const [syncInterval, setSyncInterval] = useState('30s');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    showToast('System and store settings saved successfully', 'success');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Store &amp; POS System Settings
        </h1>
        <p className="text-xs text-neutral-500">
          Global retail configurations, tax identifiers, hardware ports, and edge sync preferences
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Store Profile Card */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Store className="h-4 w-4" />
            <span>Store Profile &amp; Legal Tax Identity</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="font-semibold text-neutral-700 dark:text-neutral-300">Store Name</label>
              <input
                type="text"
                value={storeName}
                onChange={e => setStoreName(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 p-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            <div>
              <label className="font-semibold text-neutral-700 dark:text-neutral-300">GSTIN / Tax ID</label>
              <input
                type="text"
                value={gstin}
                onChange={e => setGstin(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 p-2 font-mono dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            <div>
              <label className="font-semibold text-neutral-700 dark:text-neutral-300">Store Contact Number</label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 p-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            <div>
              <label className="font-semibold text-neutral-700 dark:text-neutral-300">Default Currency</label>
              <input
                type="text"
                disabled
                value={currency}
                className="mt-1 w-full rounded border border-neutral-200 bg-neutral-100 p-2 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="font-semibold text-neutral-700 dark:text-neutral-300">Physical Store Address</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 p-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Edge & Sync Preferences */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span>Edge Server &amp; Sync Engine Parameters</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="font-semibold text-neutral-700 dark:text-neutral-300">Background Sync Interval</label>
              <select
                value={syncInterval}
                onChange={e => setSyncInterval(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 p-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              >
                <option value="10s">10 Seconds (Fast)</option>
                <option value="30s">30 Seconds (Default)</option>
                <option value="60s">60 Seconds</option>
                <option value="Manual">Manual Only</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-neutral-700 dark:text-neutral-300">Local Database Engine</label>
              <input
                type="text"
                disabled
                value="SQLite 3 (WAL mode) @ Raspberry Pi 3B+"
                className="mt-1 w-full rounded border border-neutral-200 bg-neutral-100 p-2 font-mono text-[11px] text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors"
          >
            <Save className="h-4 w-4" />
            <span>Save All Configurations</span>
          </button>
        </div>
      </form>
    </div>
  );
};
