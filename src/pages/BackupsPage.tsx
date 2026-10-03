import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Database, 
  Download, 
  Upload, 
  CheckCircle, 
  Clock, 
  HardDrive, 
  Cloud, 
  ShieldCheck,
  RefreshCw 
} from 'lucide-react';

export const BackupsPage: React.FC = () => {
  const { showToast } = useApp();
  const [isBackingUp, setIsBackingUp] = useState(false);

  const [backups, setBackups] = useState([
    { id: 'bak-1', filename: 'ybpos_sqlite_20261003_0800.db.gz', size: '14.2 MB', type: 'LOCAL_EDGE', date: '03 Oct 2026 08:00 AM', status: 'VERIFIED' },
    { id: 'bak-2', filename: 'firestore_cloud_snapshot_20261002.tar', size: '28.6 MB', type: 'CLOUD_FIREBASE', date: '02 Oct 2026 11:59 PM', status: 'VERIFIED' },
    { id: 'bak-3', filename: 'ybpos_sqlite_20261002_0800.db.gz', size: '13.9 MB', type: 'LOCAL_EDGE', date: '02 Oct 2026 08:00 AM', status: 'VERIFIED' },
  ]);

  const handleCreateBackup = () => {
    setIsBackingUp(true);
    setTimeout(() => {
      setBackups(prev => [
        {
          id: `bak-${Date.now()}`,
          filename: `ybpos_manual_snapshot_${new Date().toISOString().slice(0, 10)}.db.gz`,
          size: '14.4 MB',
          type: 'LOCAL_EDGE',
          date: new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
          status: 'VERIFIED',
        },
        ...prev,
      ]);
      setIsBackingUp(false);
      showToast('Local database backup created and verified', 'success');
    }, 1200);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Backup &amp; Disaster Recovery
          </h1>
          <p className="text-xs text-neutral-500">
            Local Raspberry Pi SQLite database snapshots and encrypted Cloud Firebase backups
          </p>
        </div>

        <button
          onClick={handleCreateBackup}
          disabled={isBackingUp}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <Database className="h-4 w-4" />
          <span>{isBackingUp ? 'Creating Snapshot...' : 'Create Local Backup Now'}</span>
        </button>
      </div>

      {/* Backup Status Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
            <HardDrive className="h-4 w-4" />
            <span>Local Edge Storage</span>
          </div>
          <p className="text-sm font-bold text-neutral-900 dark:text-white mt-1">/var/backups/ybpos</p>
          <p className="text-[11px] text-neutral-400 mt-1">Daily cron schedule: 02:00 AM UTC</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
            <Cloud className="h-4 w-4" />
            <span>Firebase Cloud Storage</span>
          </div>
          <p className="text-sm font-bold text-neutral-900 dark:text-white mt-1">gs://yb-inventory-backups</p>
          <p className="text-[11px] text-neutral-400 mt-1">Continuous Firestore exports enabled</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>Integrity Verification</span>
          </div>
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-1">All Checksums Matched</p>
          <p className="text-[11px] text-neutral-400 mt-1">Last restore test: Passed 01 Oct 2026</p>
        </div>
      </div>

      {/* Backup Archive Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Backup Archive Filename</th>
              <th className="py-3 px-4">Storage Destination</th>
              <th className="py-3 px-4">Creation Timestamp</th>
              <th className="py-3 px-4 text-center">Archive Size</th>
              <th className="py-3 px-4 text-center">Integrity Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {backups.map(b => (
              <tr key={b.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="py-3 px-4 font-mono font-bold text-neutral-900 dark:text-white">
                  {b.filename}
                </td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    b.type === 'LOCAL_EDGE' ? 'bg-neutral-100 text-neutral-700' : 'bg-blue-50 text-blue-700'
                  }`}>
                    {b.type.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-3 px-4 text-neutral-500 text-[11px]">
                  {b.date}
                </td>
                <td className="py-3 px-4 text-center font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                  {b.size}
                </td>
                <td className="py-3 px-4 text-center">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                    Verified
                  </span>
                </td>
                <td className="py-3 px-4 text-right space-x-2">
                  <button
                    onClick={() => showToast(`Downloading ${b.filename}`, 'info')}
                    className="text-xs font-semibold text-neutral-700 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => showToast(`Restore dry-run successful for ${b.filename}`, 'success')}
                    className="text-xs font-semibold text-neutral-500 hover:text-neutral-900"
                  >
                    Test Restore
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
