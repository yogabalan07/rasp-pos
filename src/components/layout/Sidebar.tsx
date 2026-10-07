import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Receipt, 
  RotateCcw, 
  Package, 
  Boxes, 
  CalendarClock, 
  Warehouse as WarehouseIcon, 
  ClipboardCheck, 
  Truck, 
  Users, 
  CreditCard, 
  Percent, 
  FileText, 
  Coins, 
  Clock, 
  Tag, 
  DollarSign, 
  BarChart3, 
  TrendingUp, 
  Sparkles, 
  Server, 
  Cloud, 
  RefreshCw, 
  Cpu, 
  History, 
  Database, 
  Settings, 
  Smartphone, 
  ChevronLeft, 
  ChevronRight,
  Globe
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { UserRole } from '../../types';

interface NavItem {
  id: string;
  name: string;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  roles?: UserRole[];
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC = () => {
  const { activeRoute, navigateTo, currentUser, systemStatus } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  const sections: NavSection[] = [
    {
      title: 'POS & Billing',
      items: [
        { id: 'dashboard', name: 'Dashboard', route: '/dashboard', icon: LayoutDashboard },
        { id: 'pos', name: 'POS Billing', route: '/pos', icon: ShoppingCart, shortcut: 'F1', badge: 'FAST' },
        { id: 'bills', name: 'Previous Bills', route: '/bills', icon: Receipt, shortcut: 'F7' },
        { id: 'returns', name: 'Sales Returns', route: '/sales-returns', icon: RotateCcw },
        { id: 'online', name: 'Online Orders', route: '/online-orders', icon: Globe, badge: '2' },
      ],
    },
    {
      title: 'Inventory & Catalog',
      items: [
        { id: 'products', name: 'Products', route: '/products', icon: Package },
        { id: 'inventory', name: 'Stock Inventory', route: '/inventory', icon: Boxes },
        { id: 'batches', name: 'Batch & Expiry', route: '/batches', icon: CalendarClock },
        { id: 'warehouses', name: 'Warehouses', route: '/warehouses', icon: WarehouseIcon },
        { id: 'audit', name: 'Stock Audit', route: '/stock-audit', icon: ClipboardCheck },
      ],
    },
    {
      title: 'Purchases & Parties',
      items: [
        { id: 'purchases', name: 'Purchases (PO)', route: '/purchases', icon: Truck },
        { id: 'suppliers', name: 'Suppliers', route: '/suppliers', icon: Users },
        { id: 'customers', name: 'Customers', route: '/customers', icon: Users, shortcut: 'F3' },
        { id: 'credit', name: 'Khata / Credit', route: '/credit', icon: CreditCard },
      ],
    },
    {
      title: 'Finance & Tax',
      items: [
        { id: 'gst', name: 'GST / Tax', route: '/gst', icon: Percent },
        { id: 'invoices', name: 'Invoice Templates', route: '/invoices', icon: FileText },
        { id: 'cash', name: 'Cash Register', route: '/cash', icon: Coins },
        { id: 'shifts', name: 'Shifts & Z-Report', route: '/shifts', icon: Clock },
      ],
    },
    {
      title: 'Growth & Strategy',
      items: [
        { id: 'offers', name: 'Discounts & Offers', route: '/offers', icon: Tag },
        { id: 'pricing', name: 'Pricing & Slabs', route: '/pricing', icon: DollarSign },
        { id: 'reports', name: 'Reports Center', route: '/reports', icon: BarChart3 },
        { id: 'analytics', name: 'Analytics', route: '/analytics', icon: TrendingUp },
        { id: 'ai', name: 'Smart AI Insights', route: '/ai', icon: Sparkles, badge: 'PREVIEW' },
      ],
    },
    {
      title: 'Edge & Cloud System',
      items: [
        { 
          id: 'server', 
          name: 'Raspberry Pi Server', 
          route: '/server', 
          icon: Server, 
          badge: systemStatus.localServer === 'ONLINE' ? '10.205' : 'OFFLINE' 
        },
        { 
          id: 'sync', 
          name: 'Sync Center', 
          route: '/sync', 
          icon: RefreshCw, 
          badge: systemStatus.pendingSyncCount > 0 ? `${systemStatus.pendingSyncCount}` : undefined 
        },
        { id: 'cloud', name: 'Cloud Server', route: '/cloud', icon: Cloud },
        { id: 'hardware', name: 'Hardware Settings', route: '/hardware', icon: Cpu },
        { id: 'audit-log', name: 'Audit Log', route: '/audit', icon: History },
        { id: 'backups', name: 'Backup & Restore', route: '/backups', icon: Database },
        { id: 'owner-mobile', name: 'Owner Mobile View', route: '/owner', icon: Smartphone },
        { id: 'settings', name: 'Store Settings', route: '/settings', icon: Settings },
      ],
    },
  ];

  // Role filtering
  const isItemVisibleForRole = (item: NavItem): boolean => {
    const role = currentUser?.role;
    if (role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER') {
      return true;
    }
    if (role === 'CASHIER') {
      return ['dashboard', 'pos', 'bills', 'returns', 'customers', 'cash', 'shifts', 'hardware', 'server'].includes(item.id);
    }
    if (role === 'INVENTORY_MANAGER') {
      return ['dashboard', 'products', 'inventory', 'batches', 'warehouses', 'audit', 'purchases', 'suppliers', 'server', 'sync'].includes(item.id);
    }
    if (role === 'ACCOUNTANT') {
      return ['dashboard', 'bills', 'customers', 'credit', 'suppliers', 'gst', 'invoices', 'cash', 'shifts', 'reports', 'analytics'].includes(item.id);
    }
    return true;
  };

  return (
    <aside 
      className={`relative flex flex-col border-r border-neutral-200 bg-white transition-all duration-200 dark:border-neutral-800 dark:bg-neutral-900 select-none ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Collapse Toggle Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-4 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-xs text-neutral-500 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
        title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {sections.map((section, sIdx) => {
          const visibleItems = section.items.filter(isItemVisibleForRole);
          if (visibleItems.length === 0) return null;

          return (
            <div key={sIdx} className="space-y-1">
              {!collapsed && (
                <div className="px-2 pb-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  {section.title}
                </div>
              )}
              {visibleItems.map(item => {
                const Icon = item.icon;
                const isActive = activeRoute === item.route;

                return (
                  <button
                    key={item.id}
                    onClick={() => navigateTo(item.route)}
                    title={collapsed ? `${item.name} ${item.shortcut ? `(${item.shortcut})` : ''}` : undefined}
                    className={`group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                      isActive
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-semibold'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/80 dark:hover:text-neutral-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-white dark:text-neutral-950' : 'text-neutral-500 group-hover:text-neutral-900 dark:text-neutral-400'}`} />
                      {!collapsed && <span className="truncate">{item.name}</span>}
                    </div>

                    {!collapsed && (
                      <div className="flex items-center gap-1.5">
                        {item.shortcut && (
                          <span className={`text-[10px] font-mono px-1 rounded ${isActive ? 'bg-neutral-800 text-neutral-300 dark:bg-neutral-200 dark:text-neutral-800' : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'}`}>
                            {item.shortcut}
                          </span>
                        )}
                        {item.badge && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                            isActive
                              ? 'bg-emerald-500 text-white'
                              : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300'
                          }`}>
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer Edge Status in Sidebar */}
      {!collapsed && (
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500 bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="flex items-center justify-between">
            <span>Edge Node</span>
            <span className="font-mono text-neutral-700 dark:text-neutral-300">Pi-3B+</span>
          </div>
          <div className="flex items-center justify-between mt-1 text-[10px]">
            <span>Active Role</span>
            <span className="font-semibold text-neutral-900 dark:text-white">{currentUser?.role ?? '-'}</span>
          </div>
        </div>
      )}
    </aside>
  );
};
