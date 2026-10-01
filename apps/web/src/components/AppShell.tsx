import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  ShoppingCart,
  Factory,
  Package,
  Warehouse,
  Users,
  Settings as SettingsIcon,
  BarChart3,
  Menu,
  X,
  Search,
  Bell,
  LogOut,
  ChevronLeft,
  Languages,
  Ship,
  Wallet,
  Receipt,
  FileText,
  FileSignature,
  FileCheck2,
  Truck,
  ClipboardCheck,
  UserRound,
  Globe2,
  TrendingUp,
  Contact,
} from 'lucide-react';
import { cn, SyncChip } from './ui';
import { useAuth } from '@/lib/auth';

type Group = 'main' | 'sales' | 'finance' | 'tools';
interface NavItem {
  to: string;
  key: string;
  icon: ReactNode;
  perm?: string;
  group: Group;
}

const NAV: NavItem[] = [
  { to: '/', key: 'dashboard', icon: <LayoutDashboard size={18} />, group: 'main' },
  { to: '/purchases', key: 'purchases', icon: <ShoppingCart size={18} />, perm: 'purchase.read', group: 'main' },
  { to: '/processing', key: 'processing', icon: <Factory size={18} />, perm: 'processing.read', group: 'main' },
  { to: '/inventory', key: 'inventory', icon: <Package size={18} />, perm: 'inventory.read', group: 'main' },
  { to: '/stations', key: 'stations', icon: <Warehouse size={18} />, perm: 'station.read', group: 'main' },
  { to: '/suppliers', key: 'suppliers', icon: <Users size={18} />, perm: 'supplier.read', group: 'main' },
  { to: '/buyers', key: 'buyers', icon: <UserRound size={18} />, perm: 'buyer.read', group: 'sales' },
  { to: '/quotations', key: 'quotations', icon: <FileText size={18} />, perm: 'quotation.read', group: 'sales' },
  { to: '/proformas', key: 'proformas', icon: <FileSignature size={18} />, perm: 'proforma.read', group: 'sales' },
  { to: '/commercial', key: 'commercial', icon: <FileCheck2 size={18} />, perm: 'commercial.read', group: 'sales' },
  { to: '/contracts', key: 'contracts', icon: <FileText size={18} />, perm: 'contract.read', group: 'sales' },
  { to: '/shipments', key: 'shipments', icon: <Truck size={18} />, perm: 'shipment.read', group: 'sales' },
  { to: '/compliance', key: 'compliance', icon: <Globe2 size={18} />, perm: 'compliance.read', group: 'sales' },
  { to: '/market', key: 'market', icon: <TrendingUp size={18} />, perm: 'market.read', group: 'tools' },
  { to: '/employees', key: 'employees', icon: <Contact size={18} />, perm: 'employee.read', group: 'finance' },
  { to: '/payroll', key: 'payroll', icon: <Wallet size={18} />, perm: 'payroll.read', group: 'finance' },
  { to: '/expenses', key: 'expenses', icon: <Receipt size={18} />, perm: 'expense.read', group: 'finance' },
  { to: '/approvals', key: 'approvals', icon: <ClipboardCheck size={18} />, perm: 'dashboard.read', group: 'finance' },
  { to: '/reports', key: 'reports', icon: <BarChart3 size={18} />, perm: 'report.read', group: 'tools' },
  { to: '/users', key: 'users', icon: <Users size={18} />, perm: 'users.manage', group: 'tools' },
  { to: '/settings', key: 'settings', icon: <SettingsIcon size={18} />, perm: 'settings.manage', group: 'tools' },
];

const GROUPS: Group[] = ['main', 'sales', 'finance', 'tools'];
const BOTTOM = ['/', '/purchases', '/proformas', '/inventory'];

const LABELS: Record<Group, string> = {
  main: 'nav.main',
  sales: 'nav.salesGroup',
  finance: 'nav.financeGroup',
  tools: 'nav.tools',
};

export function AppShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const visible = NAV.filter((n) => !n.perm || user?.permissions?.includes(n.perm));

  const toggleLang = () => {
    const next = i18n.language === 'en' ? 'om' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('madda.lang', next);
  };

  const NavItems = ({ items }: { items: NavItem[] }) => (
    <div className="space-y-0.5">
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/'}
          onClick={() => setDrawer(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
              isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
              collapsed && 'lg:justify-center lg:px-0',
            )
          }
        >
          <span className="shrink-0">{n.icon}</span>
          {!collapsed && <span>{t(`nav.${n.key}`)}</span>}
        </NavLink>
      ))}
    </div>
  );

  const Sections = ({ compact }: { compact?: boolean }) =>
    GROUPS.map((g) => {
      const items = visible.filter((n) => n.group === g);
      if (!items.length) return null;
      return (
        <div key={g} className={compact ? 'mt-6' : 'space-y-6'}>
          {!collapsed && <p className="px-3 pb-2 text-[11px] font-semibold uppercase text-slate-400">{t(LABELS[g])}</p>}
          <NavItems items={items} />
        </div>
      );
    });

  return (
    <div className="min-h-screen">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 bg-white lg:flex',
          collapsed ? 'w-[76px]' : 'w-64',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-copper-500 text-sm font-bold text-white">M</div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold">{t('app.name')}</div>
              <div className="text-[11px] text-slate-400">{t('app.subtitle')}</div>
            </div>
          )}
        </div>
        <nav className="flex-1 space-y-3 overflow-y-auto p-3">
          <Sections compact />
        </nav>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="m-3 flex items-center justify-center rounded-lg border border-slate-200 py-2 text-slate-400 hover:bg-slate-50"
        >
          <ChevronLeft size={16} className={cn('transition', collapsed && 'rotate-180')} />
        </button>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-copper-500 text-sm font-bold text-white">M</div>
                <span className="text-sm font-semibold">{t('app.name')}</span>
              </div>
              <button onClick={() => setDrawer(false)} className="p-1 text-slate-400"><X size={18} /></button>
            </div>
            <Sections compact />
          </div>
        </div>
      )}

      <div className={cn('flex min-h-screen flex-col transition-all', collapsed ? 'lg:pl-[76px]' : 'lg:pl-64')}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
          <button onClick={() => setDrawer(true)} className="p-1.5 text-slate-500 lg:hidden"><Menu size={20} /></button>
          <div className="relative hidden flex-1 max-w-md sm:block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input placeholder={t('common.search')} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:bg-white focus:ring-2 focus:ring-brand-100" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block"><SyncChip /></div>
            <button onClick={toggleLang} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <Languages size={14} />{i18n.language === 'en' ? 'EN' : 'OM'}
            </button>
            <button className="relative hidden rounded-full p-2 text-slate-500 hover:bg-slate-100 sm:block"><Bell size={18} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500" /></button>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{user?.name?.charAt(0)?.toUpperCase() ?? 'U'}</div>
              <span className="hidden text-xs font-medium text-slate-600 sm:block">{user?.name?.split(' ')[0]}</span>
            </div>
            <button onClick={() => { logout(); navigate('/login'); }} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" title="Sign out"><LogOut size={17} /></button>
          </div>
        </header>
        <main className="flex-1 p-4 pb-24 sm:p-6 lg:pb-8">{children}</main>
      </div>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white lg:hidden">
        {visible.filter((n) => BOTTOM.includes(n.to)).map((n) => {
          const active = location.pathname === n.to;
          return (
            <NavLink key={n.to} to={n.to} className={cn('flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium', active ? 'text-brand-600' : 'text-slate-500')}>
              {n.icon}{t(`nav.${n.key}`)}
            </NavLink>
          );
        })}
        <button onClick={() => setDrawer(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium text-slate-500">
          <Menu size={18} />{t('nav.more')}
        </button>
      </nav>
    </div>
  );
}
