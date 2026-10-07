import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { OfflineBanner } from './components/layout/OfflineBanner';
import { ToastContainer } from './components/common/ToastContainer';

// Page Imports
import { PosPage } from './pages/PosPage';
import { DashboardPage } from './pages/DashboardPage';
import { BillsPage } from './pages/BillsPage';
import { ProductsPage } from './pages/ProductsPage';
import { InventoryPage } from './pages/InventoryPage';
import { BatchesPage } from './pages/BatchesPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { CustomersPage } from './pages/CustomersPage';
import { CreditPage } from './pages/CreditPage';
import { SalesReturnsPage } from './pages/SalesReturnsPage';
import { WarehousesPage } from './pages/WarehousesPage';
import { BranchesPage } from './pages/BranchesPage';
import { GstPage } from './pages/GstPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { OffersPage } from './pages/OffersPage';
import { PricingPage } from './pages/PricingPage';
import { CashPage } from './pages/CashPage';
import { ShiftsPage } from './pages/ShiftsPage';
import { StockAuditPage } from './pages/StockAuditPage';
import { ReportsPage } from './pages/ReportsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AiInsightsPage } from './pages/AiInsightsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { BackupsPage } from './pages/BackupsPage';
import { SyncCenterPage } from './pages/SyncCenterPage';
import { ServerMonitorPage } from './pages/ServerMonitorPage';
import { CloudServerPage } from './pages/CloudServerPage';
import { HardwarePage } from './pages/HardwarePage';
import { OnlineOrdersPage } from './pages/OnlineOrdersPage';
import { OwnerMobilePage } from './pages/OwnerMobilePage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthPages } from './pages/AuthPages';

const RouterView: React.FC = () => {
  const { activeRoute } = useApp();

  switch (activeRoute) {
    case '/dashboard':
      return <DashboardPage />;
    case '/pos':
      return <PosPage />;
    case '/bills':
      return <BillsPage />;
    case '/products':
      return <ProductsPage />;
    case '/inventory':
      return <InventoryPage />;
    case '/batches':
      return <BatchesPage />;
    case '/purchases':
      return <PurchasesPage />;
    case '/suppliers':
      return <SuppliersPage />;
    case '/customers':
      return <CustomersPage />;
    case '/credit':
      return <CreditPage />;
    case '/sales-returns':
    case '/supplier-returns':
      return <SalesReturnsPage />;
    case '/warehouses':
      return <WarehousesPage />;
    case '/branches':
      return <BranchesPage />;
    case '/gst':
      return <GstPage />;
    case '/invoices':
      return <InvoicesPage />;
    case '/offers':
      return <OffersPage />;
    case '/pricing':
      return <PricingPage />;
    case '/cash':
      return <CashPage />;
    case '/shifts':
      return <ShiftsPage />;
    case '/stock-audit':
      return <StockAuditPage />;
    case '/reports':
      return <ReportsPage />;
    case '/analytics':
      return <AnalyticsPage />;
    case '/ai':
      return <AiInsightsPage />;
    case '/notifications':
      return <NotificationsPage />;
    case '/audit':
      return <AuditLogPage />;
    case '/backups':
      return <BackupsPage />;
    case '/sync':
      return <SyncCenterPage />;
    case '/server':
      return <ServerMonitorPage />;
    case '/cloud':
      return <CloudServerPage />;
    case '/hardware':
      return <HardwarePage />;
    case '/online-orders':
      return <OnlineOrdersPage />;
    case '/owner':
      return <OwnerMobilePage />;
    case '/settings':
      return <SettingsPage />;
    case '/login':
    case '/register':
    case '/pin-login':
    case '/forgot-password':
      return <AuthPages />;
    default:
      return <PosPage />;
  }
};

const MainLayout: React.FC = () => {
  const { activeRoute, currentUser, authLoading } = useApp();
  const isAuthPage = ['/login', '/register', '/pin-login', '/forgot-password'].includes(activeRoute);
  const signedIn = currentUser !== null;

  if (authLoading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-950">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-900 font-black text-sm text-white dark:bg-white dark:text-neutral-950">
          YB
        </div>
        <p className="mt-3 text-xs font-medium text-neutral-500">
          Starting terminal&hellip;
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100 font-sans">
      <TopBar />
      <OfflineBanner />

      <div className="flex flex-1 overflow-hidden">
        {signedIn && !isAuthPage && <Sidebar />}
        <main className="flex-1 overflow-y-auto bg-neutral-50 dark:bg-neutral-950 relative">
          {!signedIn || isAuthPage ? <AuthPages /> : <RouterView />}
        </main>
      </div>

      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
