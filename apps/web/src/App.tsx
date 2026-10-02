import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/pages/Login';

// Route-level code splitting keeps the initial phone load small.
const named = (loader: () => Promise<any>, name: string) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const DashboardPage = named(() => import('@/pages/Dashboard'), 'DashboardPage');
const PurchasesPage = named(() => import('@/pages/Purchases'), 'PurchasesPage');
const ProcessingPage = named(() => import('@/pages/Processing'), 'ProcessingPage');
const InventoryPage = named(() => import('@/pages/Inventory'), 'InventoryPage');
const StationsPage = named(() => import('@/pages/Stations'), 'StationsPage');
const SuppliersPage = named(() => import('@/pages/Suppliers'), 'SuppliersPage');
const UsersPage = named(() => import('@/pages/Users'), 'UsersPage');
const SettingsPage = named(() => import('@/pages/Settings'), 'SettingsPage');

const BuyersPage = named(() => import('@/pages/sales'), 'BuyersPage');
const QuotationsPage = named(() => import('@/pages/sales'), 'QuotationsPage');
const ProformasPage = named(() => import('@/pages/sales'), 'ProformasPage');
const ContractsPage = named(() => import('@/pages/sales'), 'ContractsPage');
const CommercialPage = named(() => import('@/pages/sales'), 'CommercialPage');
const ShipmentsPage = named(() => import('@/pages/sales'), 'ShipmentsPage');
const CompliancePage = named(() => import('@/pages/Compliance'), 'CompliancePage');
const MarketPage = named(() => import('@/pages/Market'), 'MarketPage');
const EmployeesPage = named(() => import('@/pages/Employees'), 'EmployeesPage');
const PayrollPage = named(() => import('@/pages/Payroll'), 'PayrollPage');
const PayrollDetailPage = named(() => import('@/pages/Payroll'), 'PayrollDetailPage');
const ProformaDetailPage = named(() => import('@/pages/sales-detail'), 'ProformaDetailPage');
const CommercialDetailPage = named(() => import('@/pages/sales-detail'), 'CommercialDetailPage');
const ShipmentDetailPage = named(() => import('@/pages/sales-detail'), 'ShipmentDetailPage');

const ExpensesPage = named(() => import('@/pages/finance'), 'ExpensesPage');
const ApprovalsPage = named(() => import('@/pages/approvals'), 'ApprovalsPage');
const ReportsPage = named(() => import('@/pages/reports'), 'ReportsPage');

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function Loading() {
  return <div className="grid min-h-[40vh] place-items-center text-sm text-slate-400">Loading…</div>;
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return <div className="grid min-h-screen place-items-center text-sm text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

const P = (el: React.ReactNode) => <Protected><Suspense fallback={<Loading />}>{el}</Suspense></Protected>;

/**
 * Landing page.
 *
 * The dashboard is a management view. Anyone without it lands on the first
 * screen they can actually use rather than being bounced to a forbidden page,
 * which is what a plain redirect to "/" would do for a station user.
 */
function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  const perms = user?.permissions ?? [];
  if (perms.includes('dashboard.read')) return <DashboardPage />;
  if (perms.includes('purchase.read')) return <Navigate to="/purchases" replace />;
  if (perms.includes('processing.read')) return <Navigate to="/processing" replace />;
  if (perms.includes('inventory.read')) return <Navigate to="/inventory" replace />;
  if (perms.includes('shipment.read')) return <Navigate to="/shipments" replace />;
  if (perms.includes('expense.read')) return <Navigate to="/expenses" replace />;
  return <Navigate to="/settings" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={P(<Home />)} />
            <Route path="/purchases" element={P(<PurchasesPage />)} />
            <Route path="/processing" element={P(<ProcessingPage />)} />
            <Route path="/inventory" element={P(<InventoryPage />)} />
            <Route path="/stations" element={P(<StationsPage />)} />
            <Route path="/suppliers" element={P(<SuppliersPage />)} />
            <Route path="/buyers" element={P(<BuyersPage />)} />
            <Route path="/quotations" element={P(<QuotationsPage />)} />
            <Route path="/proformas" element={P(<ProformasPage />)} />
            <Route path="/proformas/:id" element={P(<ProformaDetailPage />)} />
            <Route path="/commercial" element={P(<CommercialPage />)} />
            <Route path="/commercial/:id" element={P(<CommercialDetailPage />)} />
            <Route path="/contracts" element={P(<ContractsPage />)} />
            <Route path="/shipments" element={P(<ShipmentsPage />)} />
            <Route path="/shipments/:id" element={P(<ShipmentDetailPage />)} />
            <Route path="/compliance" element={P(<CompliancePage />)} />
            <Route path="/market" element={P(<MarketPage />)} />
            <Route path="/employees" element={P(<EmployeesPage />)} />
            <Route path="/payroll" element={P(<PayrollPage />)} />
            <Route path="/payroll/:id" element={P(<PayrollDetailPage />)} />
            <Route path="/expenses" element={P(<ExpensesPage />)} />
            <Route path="/approvals" element={P(<ApprovalsPage />)} />
            <Route path="/reports" element={P(<ReportsPage />)} />
            <Route path="/users" element={P(<UsersPage />)} />
            <Route path="/settings" element={P(<SettingsPage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
