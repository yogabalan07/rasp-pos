import React, { useState } from 'react';
import { 
  Server, 
  Cloud, 
  RefreshCw, 
  Bell, 
  Wifi, 
  WifiOff, 
  ChevronDown, 
  Building2, 
  Shield, 
  Check, 
  AlertTriangle,
  User as UserIcon,
  LogOut,
  Smartphone
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const TopBar: React.FC = () => {
  const { 
    currentUser, 
    logout,
    systemStatus, 
    toggleSimulateOffline, 
    triggerManualSync,
    branches,
    currentBranch,
    setCurrentBranch,
    notifications,
    unreadNotificationCount,
    markNotificationAsRead,
    markAllNotificationsRead,
    navigateTo
  } = useApp();

  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);

  const handleSignOut = async () => {
    setRoleDropdownOpen(false);
    await logout();
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-neutral-200 bg-white px-4 text-neutral-800 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center gap-3">
        <button 
          onClick={() => navigateTo('/dashboard')}
          className="flex items-center gap-2 font-bold tracking-tight text-neutral-950 dark:text-white text-base hover:opacity-80 transition-opacity"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-black text-xs">
            YB
          </div>
          <span className="font-semibold text-sm sm:text-base">INVENTORY &amp; POS</span>
        </button>

        {/* Branch Selector */}
        <div className="relative hidden md:block">
          <button 
            onClick={() => { setBranchDropdownOpen(!branchDropdownOpen); setRoleDropdownOpen(false); setNotifDropdownOpen(false); }}
            className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <Building2 className="h-3.5 w-3.5 text-neutral-500" />
            <span className="max-w-[130px] truncate">{currentBranch.name}</span>
            <ChevronDown className="h-3 w-3 text-neutral-400" />
          </button>

          {branchDropdownOpen && (
            <div className="absolute left-0 mt-1 w-64 rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
              <div className="px-2 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Select Store Branch
              </div>
              {branches.map(b => (
                <button
                  key={b.id}
                  onClick={() => {
                    setCurrentBranch(b);
                    setBranchDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs text-left transition-colors ${b.id === currentBranch.id ? 'bg-neutral-100 font-semibold text-neutral-900 dark:bg-neutral-700 dark:text-white' : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700/50'}`}
                >
                  <div>
                    <p className="font-medium">{b.name}</p>
                    <p className="text-[10px] text-neutral-400">{b.city} · {b.code}</p>
                  </div>
                  {b.id === currentBranch.id && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Zone 2: System Telemetry & Network Status */}
      <div className="hidden lg:flex items-center gap-3 text-xs">
        {/* Local Server Indicator */}
        <div 
          onClick={() => navigateTo('/server')}
          className="flex items-center gap-1.5 cursor-pointer rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 hover:bg-neutral-200/80 dark:bg-neutral-800 dark:text-neutral-300"
          title="Raspberry Pi 3B+ Edge Server"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <Server className="h-3.5 w-3.5 text-neutral-500" />
          <span className="font-medium">Local: <strong className="font-semibold text-emerald-700 dark:text-emerald-400">10.205.100.50</strong></span>
        </div>

        {/* Cloud Firebase Indicator */}
        <div 
          onClick={() => navigateTo('/cloud')}
          className={`flex items-center gap-1.5 cursor-pointer rounded-full px-2.5 py-1 transition-colors ${
            systemStatus.cloudServer === 'ONLINE'
              ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200/80 dark:bg-neutral-800 dark:text-neutral-300'
              : 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
          }`}
          title="Firebase Cloud Database"
        >
          <span className={`h-2 w-2 rounded-full ${systemStatus.cloudServer === 'ONLINE' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <Cloud className="h-3.5 w-3.5 text-neutral-500" />
          <span>Cloud: <strong>{systemStatus.cloudServer === 'ONLINE' ? 'Connected' : 'Offline'}</strong></span>
        </div>

        {/* Sync Status Indicator */}
        <div 
          onClick={() => navigateTo('/sync')}
          className="flex items-center gap-1.5 cursor-pointer rounded-full bg-neutral-100 px-2.5 py-1 text-neutral-700 hover:bg-neutral-200/80 dark:bg-neutral-800 dark:text-neutral-300"
          title="Click to open Sync Center"
        >
          {systemStatus.syncState === 'SYNCING' ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />
          ) : systemStatus.pendingSyncCount > 0 ? (
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
          )}
          <span>
            {systemStatus.syncState === 'SYNCING'
              ? 'Syncing...'
              : systemStatus.pendingSyncCount > 0
              ? `${systemStatus.pendingSyncCount} Pending Sync`
              : 'Synced'}
          </span>
        </div>
      </div>

      {/* Zone 3: Actions & Profile */}
      <div className="flex items-center gap-2">
        {/* Offline Simulation Button */}
        <button
          onClick={toggleSimulateOffline}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            systemStatus.isSimulatedOffline
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
          }`}
          title={systemStatus.isSimulatedOffline ? 'Click to restore internet & sync queue' : 'Click to test local offline edge resilience'}
        >
          {systemStatus.isSimulatedOffline ? (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              <span>Simulating Offline</span>
            </>
          ) : (
            <>
              <Wifi className="h-3.5 w-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Simulate Offline</span>
            </>
          )}
        </button>

        {/* Quick Manual Sync */}
        <button
          onClick={triggerManualSync}
          disabled={systemStatus.syncState === 'SYNCING' || systemStatus.isSimulatedOffline}
          className="p-1.5 rounded-md text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800"
          title="Trigger instant sync with Firebase Cloud"
        >
          <RefreshCw className={`h-4 w-4 ${systemStatus.syncState === 'SYNCING' ? 'animate-spin' : ''}`} />
        </button>

        {/* Mobile View Switcher */}
        <button
          onClick={() => navigateTo('/owner')}
          className="hidden sm:flex items-center gap-1 rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 text-xs"
          title="Owner Mobile Executive View"
        >
          <Smartphone className="h-4 w-4" />
        </button>

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => { setNotifDropdownOpen(!notifDropdownOpen); setRoleDropdownOpen(false); setBranchDropdownOpen(false); }}
            className="relative p-1.5 rounded-md text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Bell className="h-4 w-4" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                {unreadNotificationCount}
              </span>
            )}
          </button>

          {notifDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-lg border border-neutral-200 bg-white p-2 shadow-xl dark:border-neutral-700 dark:bg-neutral-900 z-50">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-2 px-1 dark:border-neutral-800">
                <span className="text-xs font-bold text-neutral-900 dark:text-white">Notifications</span>
                {unreadNotificationCount > 0 && (
                  <button 
                    onClick={markAllNotificationsRead}
                    className="text-[11px] text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => {
                      markNotificationAsRead(n.id);
                      if (n.linkRoute) navigateTo(n.linkRoute);
                      setNotifDropdownOpen(false);
                    }}
                    className={`p-2 cursor-pointer transition-colors text-xs ${n.read ? 'opacity-60' : 'bg-neutral-50 dark:bg-neutral-800/40'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-neutral-800 dark:text-neutral-200">{n.title}</span>
                      <span className="text-[10px] text-neutral-400">{n.timestamp}</span>
                    </div>
                    <p className="text-neutral-600 dark:text-neutral-400 text-[11px] leading-relaxed">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => { setRoleDropdownOpen(!roleDropdownOpen); setBranchDropdownOpen(false); setNotifDropdownOpen(false); }}
            className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          >
            {currentUser?.avatarUrl ? (
              <img 
                src={currentUser.avatarUrl} 
                alt={currentUser.name} 
                className="h-5 w-5 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-700 text-[10px] text-white">
                {(currentUser?.name || '?').charAt(0)}
              </div>
            )}
            <div className="text-left hidden sm:block">
              <span className="block text-[11px] font-bold leading-none">
                {currentUser?.name || 'Not signed in'}
              </span>
              <span className="block text-[9px] text-neutral-500 uppercase tracking-wider">
                {currentUser?.role || ''}
              </span>
            </div>
            <ChevronDown className="h-3 w-3 text-neutral-400" />
          </button>

          {roleDropdownOpen && (
            <div className="absolute right-0 mt-1 w-56 rounded-md border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 z-50">
              <div className="px-2 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Signed in as
              </div>
              <div className="px-2 py-1.5">
                <p className="text-xs font-bold text-neutral-900 dark:text-white">
                  {currentUser?.name || 'Guest'}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {currentUser?.email || 'No account'}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  {currentUser?.role || ''} &middot; {currentUser?.branchName || ''}
                </p>
              </div>

              <div className="border-t border-neutral-100 my-1 dark:border-neutral-700" />
              <button
                onClick={() => {
                  navigateTo('/settings');
                  setRoleDropdownOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                <Shield className="h-3.5 w-3.5" />
                <span>Account &amp; Security</span>
              </button>
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
