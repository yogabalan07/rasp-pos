import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole, SystemStatus, Branch, AppNotification } from '../types';
import { authService } from '../services/auth';
import { syncService } from '../services/sync';
import { INITIAL_BRANCHES, INITIAL_NOTIFICATIONS } from '../data/mockData';

interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface AppContextType {
  currentUser: User;
  switchRole: (role: UserRole) => void;
  systemStatus: SystemStatus;
  toggleSimulateOffline: () => Promise<void>;
  triggerManualSync: () => Promise<void>;
  branches: Branch[];
  currentBranch: Branch;
  setCurrentBranch: (branch: Branch) => void;
  notifications: AppNotification[];
  unreadNotificationCount: number;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  activeRoute: string;
  navigateTo: (route: string) => void;
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastItem['type']) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User>(() => authService.getCurrentUser());
  const [systemStatus, setSystemStatus] = useState<SystemStatus>(() => syncService.getStatus());
  const [branches] = useState<Branch[]>(INITIAL_BRANCHES);
  const [currentBranch, setCurrentBranch] = useState<Branch>(INITIAL_BRANCHES[0]);
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [activeRoute, setActiveRoute] = useState<string>('/pos');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsubscribe = syncService.subscribe((status) => {
      setSystemStatus(status);
    });
    return unsubscribe;
  }, []);

  const switchRole = (role: UserRole) => {
    const newUser = authService.switchRole(role);
    setCurrentUser(newUser);
    showToast(`Role switched to ${role}`, 'info');
  };

  const toggleSimulateOffline = async () => {
    if (systemStatus.isSimulatedOffline) {
      showToast('Internet restored. Syncing pending data to Firebase Cloud...', 'info');
      await syncService.restoreInternet();
      showToast('All local sales & inventory synchronized with Cloud!', 'success');
    } else {
      syncService.simulateOffline();
      showToast('Offline mode simulated. Local Raspberry Pi server operational.', 'warning');
    }
  };

  const triggerManualSync = async () => {
    try {
      const res = await syncService.triggerManualSync();
      showToast(res.message || 'Sync complete', 'success');
    } catch (err: any) {
      showToast(err.message || 'Sync failed', 'error');
    }
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    showToast('All notifications marked as read', 'info');
  };

  const navigateTo = (route: string) => {
    setActiveRoute(route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showToast = (message: string, type: ToastItem['type'] = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => {
      dismissToast(id);
    }, 3800);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const unreadNotificationCount = notifications.filter(n => !n.read).length;

  return (
    <AppContext.Provider
      value={{
        currentUser,
        switchRole,
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
        activeRoute,
        navigateTo,
        toasts,
        showToast,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
