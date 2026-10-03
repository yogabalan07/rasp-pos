import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { syncService } from '../services/sync';
import { SyncRecord } from '../types';
import { 
  RefreshCw, 
  Server, 
  Cloud, 
  Wifi, 
  WifiOff, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ArrowRight,
  Database
} from 'lucide-react';

export const SyncCenterPage: React.FC = () => {
  const { systemStatus, toggleSimulateOffline, triggerManualSync, showToast } = useApp();
  const [records, setRecords] = useState<SyncRecord[]>([]);

  useEffect(() => {
    loadRecords();
    const sub = syncService.subscribe(() => {
      loadRecords();
    });
    return sub;
  }, []);

  const loadRecords = async () => {
    const res = await syncService.getRecords();
    setRecords(res.data);
  };

  const pendingCount = records.filter(r => r.status === 'PENDING').length;
  const syncedCount = records.filter(r => r.status === 'SYNCED').length;
  const failedCount = records.filter(r => r.status === 'FAILED').length;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Edge ↔ Cloud Sync Center
          </h1>
          <p className="text-xs text-neutral-500">
            Bi-directional synchronization queue between Raspberry Pi Edge SQLite and Firebase Cloud Firestore
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Offline simulator button */}
          <button
            onClick={toggleSimulateOffline}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors ${
              systemStatus.isSimulatedOffline
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
            }`}
          >
            {systemStatus.isSimulatedOffline ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4 text-emerald-600" />}
            <span>{systemStatus.isSimulatedOffline ? 'Restore Internet & Sync' : 'Simulate Offline Mode'}</span>
          </button>

          <button
            onClick={triggerManualSync}
            disabled={systemStatus.syncState === 'SYNCING' || systemStatus.isSimulatedOffline}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${systemStatus.syncState === 'SYNCING' ? 'animate-spin' : ''}`} />
            <span>Sync Now</span>
          </button>
        </div>
      </div>

      {/* Sync Architecture Pipeline Diagram */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-4">
          Live Data Replication Pipeline
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          {/* Node 1: Local Edge */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 mb-2">
              <Server className="h-5 w-5" />
            </div>
            <h4 className="font-bold text-sm text-neutral-900 dark:text-white">Raspberry Pi Edge</h4>
            <p className="text-xs font-mono text-neutral-500">10.205.100.50 (Port 8080)</p>
            <span className="inline-block mt-2 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
              SQLite WAL Active
            </span>
          </div>

          {/* Sync Engine Status in Center */}
          <div className="flex flex-col items-center justify-center text-center p-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-xs uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                {systemStatus.syncState === 'SYNCING'
                  ? 'Replicating Delta...'
                  : systemStatus.cloudServer === 'OFFLINE'
                  ? 'Queueing Offline'
                  : 'Differential Sync Idle'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-neutral-500">
              <span>Local</span>
              <RefreshCw className={`h-4 w-4 ${systemStatus.syncState === 'SYNCING' ? 'animate-spin text-blue-600' : 'text-neutral-400'}`} />
              <span>Cloud</span>
            </div>
            <span className="text-[11px] text-neutral-400 mt-1">Last Sync: {systemStatus.lastSyncedAt}</span>
          </div>

          {/* Node 2: Firebase Cloud */}
          <div className={`rounded-xl border p-4 text-center ${
            systemStatus.cloudServer === 'ONLINE'
              ? 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50'
              : 'border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20'
          }`}>
            <div className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full mb-2 ${
              systemStatus.cloudServer === 'ONLINE' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' : 'bg-amber-100 text-amber-800'
            }`}>
              <Cloud className="h-5 w-5" />
            </div>
            <h4 className="font-bold text-sm text-neutral-900 dark:text-white">Firebase Cloud</h4>
            <p className="text-xs font-mono text-neutral-500">Cloud Firestore Engine</p>
            <span className={`inline-block mt-2 rounded px-2 py-0.5 text-[10px] font-bold ${
              systemStatus.cloudServer === 'ONLINE'
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-600 text-white'
            }`}>
              {systemStatus.cloudServer === 'ONLINE' ? 'Connected' : 'Offline / Standby'}
            </span>
          </div>
        </div>
      </div>

      {/* Sync Queue Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Synced Transactions</span>
          <p className="text-xl font-extrabold text-emerald-600 font-tabular mt-1">{syncedCount} Records</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Persisted to Cloud Firestore</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Pending Sync Queue</span>
          <p className="text-xl font-extrabold text-amber-600 font-tabular mt-1">{pendingCount} Records</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Cached in local SQLite until cloud sync</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-xs text-neutral-500">Failed / Retrying</span>
          <p className="text-xl font-extrabold text-neutral-900 dark:text-white font-tabular mt-1">{failedCount} Records</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">Auto-retry on reconnect with exponential backoff</p>
        </div>
      </div>

      {/* Queue Transactions Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-800/40">
          <h3 className="text-xs font-bold text-neutral-900 dark:text-white">Replication Queue Log</h3>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Transaction Ref</th>
              <th className="py-3 px-4">Operation Type</th>
              <th className="py-3 px-4">Created Time</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-center">Retry Count</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {records.map(r => (
              <tr key={r.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="py-3 px-4 font-mono font-bold text-neutral-900 dark:text-white">
                  {r.transactionId}
                </td>
                <td className="py-3 px-4">
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    {r.type}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-neutral-500 text-[11px]">
                  {r.createdAt}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={`inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-[10px] font-bold ${
                    r.status === 'SYNCED'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : r.status === 'PENDING'
                      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                      : 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200'
                  }`}>
                    {r.status === 'SYNCED' && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                    {r.status === 'PENDING' && <Clock className="h-3 w-3 text-amber-600" />}
                    <span>{r.status}</span>
                  </span>
                </td>
                <td className="py-3 px-4 text-center font-mono">
                  {r.retryCount}
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    onClick={() => showToast(`Record ${r.transactionId} payload verified`, 'info')}
                    className="text-xs font-semibold text-neutral-700 hover:text-neutral-950 dark:text-neutral-300"
                  >
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
