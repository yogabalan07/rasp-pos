import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Bell, 
  AlertTriangle, 
  XCircle, 
  Info, 
  Check, 
  Trash2, 
  ArrowRight,
  Filter
} from 'lucide-react';

export const NotificationsPage: React.FC = () => {
  const { notifications, markNotificationAsRead, markAllNotificationsRead, navigateTo, showToast } = useApp();
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'INFO'>('ALL');

  const filtered = notifications.filter(n => filter === 'ALL' || n.priority === filter);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
            System Alerts &amp; Notification Center
          </h1>
          <p className="text-xs text-neutral-500">
            Real-time notifications for out of stock, near expiry, customer dues, and cloud sync events
          </p>
        </div>

        <button
          onClick={markAllNotificationsRead}
          className="rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          Mark All as Read
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 text-xs">
        {['ALL', 'CRITICAL', 'WARNING', 'INFO'].map(p => (
          <button
            key={p}
            onClick={() => setFilter(p as any)}
            className={`rounded-lg px-3 py-1 font-medium transition-colors ${
              filter === p
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="space-y-2">
        {filtered.map(n => (
          <div
            key={n.id}
            onClick={() => {
              markNotificationAsRead(n.id);
              if (n.linkRoute) navigateTo(n.linkRoute);
            }}
            className={`cursor-pointer rounded-xl border p-4 transition-all flex items-start justify-between gap-4 ${
              n.read
                ? 'border-neutral-200 bg-white opacity-70 dark:border-neutral-800 dark:bg-neutral-900'
                : 'border-neutral-300 bg-white shadow-xs dark:border-neutral-700 dark:bg-neutral-900'
            }`}
          >
            <div className="flex items-start gap-3">
              {n.priority === 'CRITICAL' && (
                <div className="p-2 rounded-lg bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 shrink-0">
                  <XCircle className="h-5 w-5" />
                </div>
              )}
              {n.priority === 'WARNING' && (
                <div className="p-2 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              )}
              {n.priority === 'INFO' && (
                <div className="p-2 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 shrink-0">
                  <Info className="h-5 w-5" />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-neutral-900 dark:text-white">{n.title}</h4>
                  <span className="text-[10px] text-neutral-400 font-mono">{n.timestamp}</span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 leading-relaxed">
                  {n.message}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {n.linkRoute && (
                <span className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white font-medium">
                  <span>View</span>
                  <ArrowRight className="h-3 w-3" />
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
