import React from 'react';
import { WifiOff, RefreshCw, Server, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const OfflineBanner: React.FC = () => {
  const { systemStatus, toggleSimulateOffline, navigateTo } = useApp();

  if (systemStatus.cloudServer === 'ONLINE') return null;

  return (
    <div className="bg-amber-500 text-neutral-950 px-4 py-2 text-xs font-medium flex flex-wrap items-center justify-between gap-2 shadow-sm border-b border-amber-600/30">
      <div className="flex items-center gap-2">
        <WifiOff className="h-4 w-4 shrink-0 text-neutral-900" />
        <span>
          <strong>Internet connection unavailable.</strong> You are working on the local Raspberry Pi server (10.205.100.50).
          Transactions are stored in local SQLite and will synchronize automatically.
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="bg-amber-600/30 px-2 py-0.5 rounded text-[11px] font-mono">
          Pending Sync: {systemStatus.pendingSyncCount}
        </span>
        <button
          onClick={toggleSimulateOffline}
          className="bg-neutral-950 text-white hover:bg-neutral-800 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors"
        >
          Restore Internet
        </button>
        <button
          onClick={() => navigateTo('/sync')}
          className="underline hover:text-neutral-800 text-[11px] flex items-center gap-1"
        >
          Sync Queue <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};
