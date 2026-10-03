import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  Building2, 
  MapPin, 
  Phone, 
  Check, 
  Plus, 
  Monitor, 
  TrendingUp, 
  Boxes 
} from 'lucide-react';

export const BranchesPage: React.FC = () => {
  const { branches, currentBranch, setCurrentBranch, showToast } = useApp();

  const handleSelectBranch = (b: any) => {
    setCurrentBranch(b);
    showToast(`Switched active branch to ${b.name}`, 'info');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Multi-Branch Management
          </h1>
          <p className="text-xs text-neutral-500">
            Control retail outlets, active registers, and localized stock allocation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-neutral-100 px-3 py-1.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            Current Branch: <strong className="text-neutral-950 dark:text-white">{currentBranch.name}</strong>
          </span>
        </div>
      </div>

      {/* Branches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {branches.map(b => {
          const isActive = b.id === currentBranch.id;
          return (
            <div
              key={b.id}
              className={`flex flex-col justify-between rounded-xl border p-5 transition-all ${
                isActive
                  ? 'border-emerald-600 bg-emerald-50/20 shadow-sm dark:border-emerald-500 dark:bg-emerald-950/20'
                  : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-[10px] font-bold text-neutral-400">{b.code}</span>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white mt-0.5">{b.name}</h3>
                  </div>
                  {isActive ? (
                    <span className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      <Check className="h-3 w-3" />
                      Active
                    </span>
                  ) : (
                    b.isMainBranch && (
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        HQ
                      </span>
                    )
                  )}
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                    <span>{b.address}, {b.city}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                    <span className="font-mono text-[11px]">{b.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-500">
                    <span>GSTIN: {b.gstin}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs pt-1 text-neutral-700 dark:text-neutral-300 font-semibold">
                    <Monitor className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
                    <span>{b.activeRegisters} Active POS Terminals</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
                <span className="text-[10px] text-neutral-400 font-mono">Edge Node: Online</span>
                {!isActive ? (
                  <button
                    onClick={() => handleSelectBranch(b)}
                    className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950"
                  >
                    Switch to Branch
                  </button>
                ) : (
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    Currently Selected
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
