import React, { useState } from 'react';
import { INITIAL_AUDIT_LOGS } from '../data/mockData';
import { AuditLog } from '../types';
import { 
  History, 
  Search, 
  User, 
  Monitor, 
  Filter, 
  ArrowRight,
  ShieldCheck 
} from 'lucide-react';

export const AuditLogPage: React.FC = () => {
  const [logs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('ALL');

  const filtered = logs.filter(l => {
    const matchesModule = filterModule === 'ALL' || l.module === filterModule;
    const matchesSearch = 
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.userName.toLowerCase().includes(search.toLowerCase()) ||
      l.recordIdentifier.toLowerCase().includes(search.toLowerCase());
    return matchesModule && matchesSearch;
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
          System Audit Trail &amp; Activity Log
        </h1>
        <p className="text-xs text-neutral-500">
          Immutable audit records of user actions, price modifications, stock write-offs, and cashier shift events
        </p>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search audit trail by user, action, or record identifier..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 py-1.5 text-xs focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Filter className="h-3.5 w-3.5 text-neutral-400" />
          {['ALL', 'POS', 'INVENTORY', 'PRICING', 'CUSTOMERS'].map(m => (
            <button
              key={m}
              onClick={() => setFilterModule(m)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filterModule === m
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50">
            <tr>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Staff Member</th>
              <th className="py-3 px-4">Module</th>
              <th className="py-3 px-4">Action Event</th>
              <th className="py-3 px-4">Target Record</th>
              <th className="py-3 px-4">State Change (Before → After)</th>
              <th className="py-3 px-4">Device Node</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.map(l => (
              <tr key={l.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <td className="py-3 px-4 font-mono text-[11px] text-neutral-500 whitespace-nowrap">
                  {l.timestamp}
                </td>
                <td className="py-3 px-4 font-bold text-neutral-900 dark:text-white">
                  {l.userName}
                </td>
                <td className="py-3 px-4">
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    {l.module}
                  </span>
                </td>
                <td className="py-3 px-4 font-semibold text-neutral-800 dark:text-neutral-200">
                  {l.action}
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                  {l.recordIdentifier}
                </td>
                <td className="py-3 px-4">
                  {l.beforeState || l.afterState ? (
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      {l.beforeState && <span className="text-red-500 line-through">{l.beforeState}</span>}
                      {l.beforeState && l.afterState && <ArrowRight className="h-3 w-3 text-neutral-400" />}
                      {l.afterState && <span className="text-emerald-600 font-bold">{l.afterState}</span>}
                    </div>
                  ) : (
                    <span className="text-neutral-400 text-[10px]">Logged</span>
                  )}
                </td>
                <td className="py-3 px-4 text-neutral-500 text-[11px]">
                  {l.device}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
