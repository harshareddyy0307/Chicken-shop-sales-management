import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckCircle2,
  Scale,
  Package,
  Truck,
  BookOpen,
  Users,
  Receipt,
  Wallet,
  FileBarChart,
  ShieldCheck,
  UserCog,
  Settings as SettingsIcon,
  X,
  Store,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ShopLogo } from './ShopLogo';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, hasRole } = useAuth();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Daily Business Closing', path: '/closing', icon: CheckCircle2 },
    { name: 'Chicken Sales', path: '/sales', icon: Scale },
    { name: 'Stock Management', path: '/stock', icon: Package },
    { name: 'Distributor Supply', path: '/distributor-supply', icon: Truck },
    { name: 'Distributor Records', path: '/distributor-records', icon: BookOpen },
    { name: 'Customer Katha', path: '/customer-katha', icon: Users },
    { name: 'Customer Billing', path: '/customer-billing', icon: Receipt },
    { name: 'Operating Expenses', path: '/expenses', icon: Wallet },
    { name: 'Reports & Analytics', path: '/reports', icon: FileBarChart },
    { name: 'Audit Log', path: '/audit-logs', icon: ShieldCheck, ownerOnly: true },
    { name: 'User Management', path: '/users', icon: UserCog, ownerOnly: true },
    { name: 'Settings', path: '/settings', icon: SettingsIcon },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-20 px-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3 min-w-0">
            <ShopLogo size="md" />
            <div className="min-w-0">
              <h1 className="font-black text-white text-sm leading-tight tracking-tight truncate">
                Reddy Chicken & Mutton
              </h1>
              <p className="text-[11px] text-amber-400 font-bold uppercase tracking-wider">
                Center
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center transition"
            aria-label="Close navigation menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1 custom-scrollbar">
          {navItems.map((item) => {
            if (item.ownerOnly && !hasRole('owner', 'admin')) {
              return null;
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => onClose()}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 min-h-[42px] ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-900/30'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer User Info & Mobile Logout */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center justify-between gap-3 px-2 py-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-brand-400 uppercase shrink-0">
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user?.fullName}</p>
                <span className="inline-block px-1.5 py-0.5 mt-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-brand-950 border border-brand-800 text-brand-300">
                  {user?.role}
                </span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
