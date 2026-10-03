import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  Cloud, 
  Database, 
  ShieldCheck, 
  Lock, 
  RefreshCw, 
  CheckCircle, 
  Layers, 
  KeyRound,
  ExternalLink 
} from 'lucide-react';

export const CloudServerPage: React.FC = () => {
  const { systemStatus, toggleSimulateOffline } = useApp();

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Firebase Cloud Integration Status
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
              systemStatus.cloudServer === 'ONLINE'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-amber-100 text-amber-900 border border-amber-300'
            }`}>
              {systemStatus.cloudServer === 'ONLINE' ? 'CONNECTED' : 'OFFLINE MODE'}
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            Real-time synchronization with Cloud Firestore, Storage, and Identity Platform
          </p>
        </div>

        <button
          onClick={toggleSimulateOffline}
          className="rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          {systemStatus.isSimulatedOffline ? 'Restore Cloud Connectivity' : 'Simulate Cloud Disconnect'}
        </button>
      </div>

      {/* Cloud Components Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Firestore */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Cloud Firestore</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <p className="mt-1 text-base font-bold text-neutral-900 dark:text-white">asia-south1</p>
          <p className="text-[11px] text-neutral-400 mt-0.5">Differential collections replication</p>
        </div>

        {/* Cloud Auth */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Firebase Auth</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <p className="mt-1 text-base font-bold text-neutral-900 dark:text-white">Role-Based JWT</p>
          <p className="text-[11px] text-neutral-400 mt-0.5">Cashier PIN + Owner OAuth</p>
        </div>

        {/* Cloud Storage */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Cloud Storage</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <p className="mt-1 text-base font-bold text-neutral-900 dark:text-white">Product Images &amp; PDF</p>
          <p className="text-[11px] text-neutral-400 mt-0.5">Fast CDN edge delivery</p>
        </div>

        {/* Cloud Backups */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-500">Automated Exports</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <p className="mt-1 text-base font-bold text-neutral-900 dark:text-white">Daily Snapshots</p>
          <p className="text-[11px] text-neutral-400 mt-0.5">Encrypted at rest (AES-256)</p>
        </div>
      </div>

      {/* Security Architecture Note */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 space-y-3">
        <h3 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Security Architecture &amp; Credentials Isolation</span>
        </h3>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          In compliance with enterprise security guidelines, zero Firebase secrets or service account keys are stored in the client-side frontend bundle. The local Raspberry Pi edge service acts as the secure, authenticated proxy gateway. When internet disconnects, local POS operations proceed seamlessly with local SQLite, and queued sync mutations replay with collision detection upon reconnect.
        </p>
      </div>
    </div>
  );
};
