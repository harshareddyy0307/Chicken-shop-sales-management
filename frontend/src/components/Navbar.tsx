import React, { useState, useEffect } from 'react';
import { Menu, Calendar, Clock, LogOut, Scale, Receipt, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBusinessDate } from '../context/DateContext';
import { useToast } from '../context/ToastContext';
import { formatDate, getTodayDateString, isFutureDate } from '../utils/format';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShopLogo } from './ShopLogo';
import { DailyClosingCalendar } from './DailyClosingCalendar';

interface NavbarProps {
  onMenuToggle: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/closing': 'Daily Closing',
  '/sales': 'Chicken Sales',
  '/stock': 'Stock Management',
  '/distributor-supply': 'Distributor Supply',
  '/distributor-records': 'Distributor Records',
  '/customer-katha': 'Customer Katha',
  '/customer-billing': 'Customer Billing',
  '/expenses': 'Operating Expenses',
  '/reports': 'Reports & Analytics',
  '/audit-logs': 'Audit Log',
  '/users': 'User Management',
  '/settings': 'Settings',
};

export const Navbar: React.FC<NavbarProps> = ({ onMenuToggle }) => {
  const { user, logout } = useAuth();
  const { selectedDate, setSelectedDate, resetToToday, isToday } = useBusinessDate();
  const { error: toastError } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const handleDateChange = (val: string) => {
    if (isFutureDate(val)) {
      toastError('Future-date closing is not allowed. Please select today or a previous date.');
      return;
    }
    setSelectedDate(val);
  };

  const [currentTime, setCurrentTime] = useState<string>('');

  const currentTitle = PAGE_TITLES[location.pathname] || 'Reddy Meat Center';

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-3 sm:px-6 w-full">
      {/* Left: Mobile Toggle & Page Title / Brand */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 transition"
          aria-label="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile App Title / Breadcrumb */}
        <div className="flex items-center gap-2 min-w-0 lg:hidden">
          <ShopLogo size="sm" />
          <div className="min-w-0">
            <span className="font-extrabold text-slate-900 text-xs sm:text-sm tracking-tight block truncate">
              {currentTitle}
            </span>
          </div>
        </div>

        {/* Business Date Picker (Desktop & Tablet) */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <DailyClosingCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            label="Business Date:"
            align="left"
            buttonVariant="subtle"
          />
          {!isToday && (
            <button
              onClick={resetToToday}
              className="text-[11px] font-semibold text-brand-700 bg-brand-100 px-2 py-1 rounded-xl hover:bg-brand-200 transition min-h-[32px]"
              title="Switch to Today's Date"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Center: Live Clock (Desktop only) */}
      <div className="hidden xl:flex items-center gap-2 text-slate-500 text-xs font-mono bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
        <Clock className="w-3.5 h-3.5 text-slate-400" />
        <span>{currentTime} IST</span>
      </div>

      {/* Right: Quick Actions & User Profile */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Mobile Business Date Calendar Quick Trigger */}
        <div className="lg:hidden flex items-center shrink-0">
          <DailyClosingCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            buttonVariant="subtle"
            showStatusBadge={false}
          />
        </div>

        {/* Quick Action: New Sale */}
        <button
          onClick={() => navigate('/sales')}
          className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition min-h-[38px]"
        >
          <Scale className="w-3.5 h-3.5 text-emerald-600" />
          <span>New Sale</span>
        </button>

        {/* Quick Action: New Bill */}
        <button
          onClick={() => navigate('/customer-billing')}
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition min-h-[38px]"
        >
          <Receipt className="w-3.5 h-3.5 text-blue-600" />
          <span>Add Bill</span>
        </button>

        {/* Quick Action: Daily Closing */}
        <button
          onClick={() => navigate('/closing')}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-sm transition min-h-[38px]"
          title="Daily Business Closing"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Daily Closing</span>
        </button>

        <div className="h-6 w-px bg-slate-200 mx-0.5 sm:mx-1 hidden xs:block" />

        {/* User Role Badge & Logout */}
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden md:block text-right">
            <p className="text-xs font-semibold text-slate-900 leading-none">{user?.fullName}</p>
            <p className="text-[10px] text-brand-600 font-medium capitalize mt-0.5">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
