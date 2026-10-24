import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  ShoppingBag,
  TrendingUp,
  Percent,
  Scale,
  Truck,
  Users,
  AlertTriangle,
  Receipt,
  ArrowRight,
  Info,
  Calendar,
  RefreshCw,
  Clock,
  CheckCircle2,
  Egg,
  X,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useBusinessDate } from '../context/DateContext';
import { useToast } from '../context/ToastContext';
import { dashboardApi } from '../services/api';
import { DashboardData } from '../types';
import { formatCurrency, formatKg, formatDate, getTodayDateString } from '../utils/format';
import { DailyClosingCalendar } from '../components/DailyClosingCalendar';

type DashboardPeriod = 'today' | 'week' | 'month' | 'year' | 'custom';

export const Dashboard: React.FC = () => {
  const { selectedDate, setSelectedDate, resetToToday, isToday } = useBusinessDate();
  const { error } = useToast();
  const navigate = useNavigate();

  const [activePeriod, setActivePeriod] = useState<DashboardPeriod>('today');
  const [customDate, setCustomDate] = useState<string>(selectedDate || getTodayDateString());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Dismissed Notice & Alerts State ("Remove after we read")
  const [isNoticeDismissed, setIsNoticeDismissed] = useState<boolean>(() => {
    return localStorage.getItem('hide_accounting_metric_notice') === 'true';
  });

  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`dismissed_dashboard_alerts_${selectedDate}`);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`dismissed_dashboard_alerts_${selectedDate}`);
      setDismissedAlerts(saved ? new Set(JSON.parse(saved)) : new Set());
    } catch {
      setDismissedAlerts(new Set());
    }
  }, [selectedDate]);

  const handleDismissNotice = () => {
    setIsNoticeDismissed(true);
    localStorage.setItem('hide_accounting_metric_notice', 'true');
  };

  const handleDismissAlert = (alertKey: string) => {
    setDismissedAlerts((prev) => {
      const next = new Set(prev);
      next.add(alertKey);
      try {
        localStorage.setItem(
          `dismissed_dashboard_alerts_${selectedDate}`,
          JSON.stringify(Array.from(next))
        );
      } catch {}
      return next;
    });
  };

  const getPeriodInfo = (period: DashboardPeriod, cDate?: string) => {
    const todayStr = getTodayDateString();
    const now = new Date();

    if (period === 'today') {
      return {
        startDate: todayStr,
        endDate: todayStr,
        label: 'Today',
        dateDisplay: formatDate(todayStr),
      };
    }

    if (period === 'week') {
      const day = now.getDay();
      const diffToMon = (day === 0 ? -6 : 1) - day;
      const mon = new Date(now);
      mon.setDate(now.getDate() + diffToMon);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);

      const sStr = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
      const eStr = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`;
      return {
        startDate: sStr,
        endDate: eStr,
        label: 'This Week',
        dateDisplay: `${formatDate(sStr)} to ${formatDate(eStr)}`,
      };
    }

    if (period === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const sStr = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`;
      const eStr = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
      const monthName = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

      return {
        startDate: sStr,
        endDate: eStr,
        label: 'This Month',
        dateDisplay: `${monthName} (${formatDate(sStr)} to ${formatDate(eStr)})`,
      };
    }

    if (period === 'year') {
      const year = now.getFullYear();
      const sStr = `${year}-01-01`;
      const eStr = `${year}-12-31`;

      return {
        startDate: sStr,
        endDate: eStr,
        label: 'This Year',
        dateDisplay: `${year} (01-01-${year} to 31-12-${year})`,
      };
    }

    // custom
    const d = cDate || todayStr;
    return {
      startDate: d,
      endDate: d,
      label: 'Custom Date',
      dateDisplay: formatDate(d),
    };
  };

  const periodInfo = getPeriodInfo(activePeriod, customDate);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const info = getPeriodInfo(activePeriod, customDate);
      const res = await dashboardApi.getDashboard({
        startDate: info.startDate,
        endDate: info.endDate,
        period: activePeriod,
        date: info.startDate,
      });
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch (err: any) {
      error('Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [activePeriod, customDate]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-500">Loading business performance data...</p>
      </div>
    );
  }

  const cards = data?.cards;

  return (
    <div className="space-y-6">
      {/* Top Header & Date Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Business Overview</h1>
            <span
              className={`text-[11px] sm:text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                data?.isClosingCompleted
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {data?.statusBadgeText || (data?.isClosingCompleted ? 'Daily Closing Completed' : 'Closing Pending (Live Estimates)')}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Displaying live metrics for:{' '}
            <span className="font-semibold text-slate-800">{periodInfo.label} ({periodInfo.dateDisplay})</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Today / This Week / This Month / This Year Buttons */}
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setActivePeriod('today')}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activePeriod === 'today'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setActivePeriod('week')}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activePeriod === 'week'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setActivePeriod('month')}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activePeriod === 'month'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => setActivePeriod('year')}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activePeriod === 'year'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              This Year
            </button>
          </div>

          {/* Date Picker for Custom Dates */}
          <DailyClosingCalendar
            selectedDate={customDate || selectedDate}
            onSelectDate={(date) => {
              setCustomDate(date);
              setSelectedDate(date);
              setActivePeriod('custom');
            }}
            align="right"
          />

          {isNoticeDismissed && (
            <button
              onClick={() => {
                setIsNoticeDismissed(false);
                localStorage.removeItem('hide_accounting_metric_notice');
              }}
              className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
              title="Show Accounting Metric Distinction Note"
            >
              <Info className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={fetchDashboard}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="Refresh Metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Critical Business Notice: Counter Collection vs Sales Revenue */}
      {!isNoticeDismissed && (
        <div className="flex items-start justify-between gap-3 p-4 bg-blue-50/70 border border-blue-200 rounded-2xl text-blue-900 text-xs shadow-xs transition-all animate-in fade-in duration-150">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-blue-950">Accounting Metric Distinction:</span> Counter Collection (
              {formatCurrency(cards?.todayCounterCollection)}) represents liquid money actually received today across Cash,
              UPI, Card, and Other payment methods. Chicken Sales Revenue ({formatCurrency(cards?.todayChickenSalesRevenue)}
              ) represents the value of chicken sold calculated from stock movement. These are distinct metrics and are
              never double-counted.
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissNotice}
            className="p-1 text-blue-400 hover:text-blue-700 hover:bg-blue-100/70 rounded-lg transition shrink-0 cursor-pointer"
            title="Remove after reading"
            aria-label="Remove after reading"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Alerts (Low stock, Discrepancies) */}
      {data?.alerts && data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts
            .filter((alert) => !dismissedAlerts.has(`${alert.title}-${alert.message}`))
            .map((alert, idx) => {
              const alertKey = `${alert.title}-${alert.message}`;
              return (
                <div
                  key={idx}
                  className={`flex items-start justify-between gap-3 p-4 rounded-2xl border text-xs shadow-xs transition-all animate-in fade-in duration-150 ${
                    alert.type === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : alert.type === 'danger'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <span className="font-bold">{alert.title}: </span>
                      <span>{alert.message}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDismissAlert(alertKey)}
                    className="p-1 rounded-lg text-amber-500 hover:text-amber-800 hover:bg-amber-100/70 transition shrink-0 cursor-pointer"
                    title="Remove after reading"
                    aria-label="Remove after reading"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {/* SUMMARY METRIC CARDS (Responsive: 1 col on <400px mobile, 2 col on mobile/tablet, 4 on desktop) */}
      <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. Counter Collection */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold truncate pr-1">1. Counter Collection</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{formatCurrency(cards?.todayCounterCollection)}</h3>
          <p className="text-[11px] text-slate-400 mt-1 truncate">Cash + UPI + Card + Other</p>
        </div>

        {/* 2. Chicken Purchase Cost */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold truncate pr-1">2. Chicken Purchase Cost</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{formatCurrency(cards?.todayChickenPurchaseCost)}</h3>
          <p className="text-[11px] text-slate-400 mt-1 truncate">
            {activePeriod === 'today' ? "Today's" : `${periodInfo.label}'s`} distributor supplies
          </p>
        </div>

        {/* 3. Chicken Sales Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold truncate pr-1">3. Chicken Sales Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{formatCurrency(cards?.todayChickenSalesRevenue)}</h3>
          <p className="text-[11px] text-slate-400 mt-1 truncate">From quantity sold × rate</p>
        </div>

        {/* 3b. Egg Sales Revenue (if available) */}
        {cards?.todayEggSalesRevenue !== undefined && Number(cards.todayEggSalesRevenue) > 0 && (
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition min-w-0">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold truncate pr-1">Egg Sales Revenue</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Egg className="w-4 h-4" />
              </div>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-amber-900 truncate">{formatCurrency(cards.todayEggSalesRevenue)}</h3>
            <p className="text-[11px] text-slate-400 mt-1 truncate">From eggs sold × price</p>
          </div>
        )}

        {/* 4. Estimated Gross Profit */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold truncate pr-1">4. Estimated Gross Profit</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-indigo-950 truncate">{formatCurrency(cards?.todayEstimatedGrossProfit)}</h3>
          <p className="text-[11px] text-slate-400 mt-1 truncate">Sales Revenue − COGS</p>
        </div>

        {/* 5. Net Profit Estimate */}
        <div className="bg-gradient-to-br from-brand-600 to-emerald-700 text-white p-4 rounded-2xl shadow-md hover:shadow-lg transition min-w-0">
          <div className="flex items-center justify-between text-emerald-100 mb-2">
            <span className="text-xs font-semibold truncate pr-1">5. Net Profit Estimate</span>
            <div className="w-8 h-8 rounded-lg bg-white/20 text-white flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold truncate">{formatCurrency(cards?.todayEstimatedNetProfit)}</h3>
          <p className="text-[11px] text-emerald-100 mt-1 truncate">Gross + Adj − Expenses</p>
        </div>

        {/* 6. Chicken Stock Sold (kg) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold truncate pr-1">6. Stock Sold {activePeriod === 'today' ? 'Today' : `(${periodInfo.label})`}</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{formatKg(cards?.todayChickenStockSoldKg)}</h3>
          <p className="text-[11px] text-slate-400 mt-1 truncate">Available − Closing Stock</p>
        </div>

        {/* 7. New Distributor Supply (kg) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold truncate pr-1">7. New Supply Received</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{formatKg(cards?.todayNewDistributorSupplyKg)}</h3>
          <p className="text-[11px] text-slate-400 mt-1 truncate">Incoming live bird weight</p>
        </div>

        {/* 8. Total Outstanding Distributor Payments */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold truncate pr-1">8. Distributor Payables</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-rose-700 truncate">
            {formatCurrency(cards?.totalOutstandingDistributorPayments)}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1 truncate">Total owed to suppliers</p>
        </div>

        {/* 9. Total Customer Katha Outstanding */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold truncate pr-1">9. Customer Katha Credit</span>
            <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-orange-700 truncate">
            {formatCurrency(cards?.totalCustomerKathaOutstanding)}
          </h3>
          <p className="text-[11px] text-slate-400 mt-1 truncate">Total credit receivables</p>
        </div>

        {/* 10. Today's Operating Expenses */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition min-w-0">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold truncate pr-1">10. Expenses {activePeriod === 'today' ? 'Today' : `(${periodInfo.label})`}</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{formatCurrency(cards?.todayOperatingExpenses)}</h3>
          <p className="text-[11px] text-slate-400 mt-1 truncate">Power, wages, transport...</p>
        </div>
      </div>

      {/* Stock Overview Widget & Quick Daily Closing Launcher */}
      {/* Stock Overview Widget & Quick Daily Closing Launcher */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 min-w-0">
        <div className="lg:col-span-2 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm min-w-0">
          <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Chicken Stock Overview</h2>
              <p className="text-xs text-slate-500">Inventory balance for {periodInfo.label} ({periodInfo.dateDisplay})</p>
            </div>
            <button
              onClick={() => navigate('/stock')}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 self-start xs:self-auto"
            >
              <span>View Stock Ledger</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 min-w-0">
              <p className="text-[11px] text-slate-500 font-medium truncate">Opening Stock</p>
              <p className="text-base sm:text-lg font-bold text-slate-800 mt-1 truncate">{formatKg(data?.stockOverview?.openingStockKg)}</p>
              <p className="text-[10px] text-slate-400 truncate">{activePeriod === 'today' ? 'From prev day closing' : 'At start of period'}</p>
            </div>
            <div className="p-3 bg-cyan-50/60 rounded-xl border border-cyan-100 min-w-0">
              <p className="text-[11px] text-cyan-700 font-medium truncate">+ New Received</p>
              <p className="text-base sm:text-lg font-bold text-cyan-900 mt-1 truncate">{formatKg(data?.stockOverview?.newStockKg)}</p>
              <p className="text-[10px] text-cyan-600 truncate">From supplies</p>
            </div>
            <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-100 min-w-0">
              <p className="text-[11px] text-amber-700 font-medium truncate">− Stock Sold</p>
              <p className="text-base sm:text-lg font-bold text-amber-900 mt-1 truncate">{formatKg(data?.stockOverview?.soldKg)}</p>
              <p className="text-[10px] text-amber-600 truncate">Quantity dispensed</p>
            </div>
            <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 min-w-0">
              <p className="text-[11px] text-emerald-700 font-medium truncate">Closing Stock</p>
              <p className="text-base sm:text-lg font-bold text-emerald-900 mt-1 truncate">
                {formatKg(data?.stockOverview?.closingStockKg)}
              </p>
              <p className="text-[10px] text-emerald-600 truncate">{activePeriod === 'today' ? 'Remaining inventory' : 'At end of period'}</p>
            </div>
          </div>
        </div>

        {/* Daily Closing Progress / Action Widget */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white p-4 sm:p-5 rounded-2xl shadow-sm flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-brand-400">Daily Closing Wizard</span>
              <CheckCircle2 className="w-4 h-4 text-brand-400" />
            </div>
            <h3 className="text-base font-bold text-white">End-of-Day Balancing</h3>
            <p className="text-xs text-slate-400 mt-1">
              {activePeriod === 'today'
                ? data?.isClosingCompleted
                  ? `Closing record for ${formatDate(periodInfo.startDate)} is submitted & locked.`
                  : `Closing for ${formatDate(periodInfo.startDate)} is pending. Run the 4-step wizard to reconcile collections and profit.`
                : `${data?.statusBadgeText || 'Period Overview'}. Verified daily closings ensure complete audit continuity.`}
            </p>
          </div>

          <button
            onClick={() => navigate('/closing')}
            className="mt-4 w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-brand-900/40 min-h-[42px]"
          >
            <span>{data?.isClosingCompleted ? 'View / Reopen Closing' : 'Start Daily Closing Wizard'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Charts Section: 7-Day Sales Trend & Monthly Profit Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 min-w-0">
        {/* Daily Sales & Counter Collection Trend (7 Days) */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {activePeriod === 'month' ? 'Monthly Daily Trend' : activePeriod === 'week' ? 'Weekly Daily Trend' : '7-Day Sales & Collection Trend'}
              </h2>
              <p className="text-xs text-slate-500">Comparison of chicken sales revenue vs actual counter cashflow</p>
            </div>
          </div>
          <div className="h-64 sm:h-72 w-full min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.sevenDaysTrend || []} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${v}`} />
                <Tooltip
                  formatter={(val: any) => formatCurrency(val)}
                  labelFormatter={(lbl) => formatDate(String(lbl))}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="salesRevenue"
                  name="Sales Revenue"
                  stroke="#3b82f6"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="counterCollection"
                  name="Counter Collection"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Net Profit Trend (12 Months) */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Annual Monthly Performance ({new Date().getFullYear()})</h2>
              <p className="text-xs text-slate-500">Monthly sales revenue, operating expenses, and net profit</p>
            </div>
          </div>
          <div className="h-64 sm:h-72 w-full min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.monthlyTrend || []} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(m) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₹${v}`} />
                <Tooltip formatter={(val: any) => formatCurrency(val)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="salesRevenue" name="Sales Revenue" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#fca5a5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="netProfit" name="Net Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Transactions & Recent Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Customer Bills</h2>
              <p className="text-xs text-slate-500">Latest counter & credit customer transactions</p>
            </div>
            <button
              onClick={() => navigate('/customer-billing')}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Bills Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {data?.recentTransactions && data.recentTransactions.length > 0 ? (
              data.recentTransactions.map((t, idx) => (
                <div key={idx} className="py-3 flex items-start justify-between gap-2 text-xs">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-slate-800">{t.ref_id}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          t.payment_type === 'Pay Later'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {t.payment_type}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900 mt-1">{t.party_name}</p>
                    <span className="text-[11px] text-slate-400">{formatDate(t.txn_date)}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-black text-slate-900 block">{formatCurrency(t.total_amount)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                No recent customer bills found.
              </div>
            )}
          </div>

          {/* Desktop Bills Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400">
                  <th className="pb-2 font-medium">Bill #</th>
                  <th className="pb-2 font-medium">Customer</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.recentTransactions && data.recentTransactions.length > 0 ? (
                  data.recentTransactions.map((t, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 font-mono text-slate-700 font-semibold">{t.ref_id}</td>
                      <td className="py-2.5 font-medium text-slate-900">{t.party_name}</td>
                      <td className="py-2.5 text-slate-500">{formatDate(t.txn_date)}</td>
                      <td className="py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            t.payment_type === 'Pay Later'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {t.payment_type}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-bold text-slate-900">
                        {formatCurrency(t.total_amount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No recent customer bills found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent Operating Expenses</h2>
              <p className="text-xs text-slate-500">Recently recorded shop maintenance & overheads</p>
            </div>
            <button
              onClick={() => navigate('/expenses')}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Expenses Cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {data?.recentExpenses && data.recentExpenses.length > 0 ? (
              data.recentExpenses.map((exp, idx) => (
                <div key={idx} className="py-3 flex items-start justify-between gap-2 text-xs">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-100 font-semibold text-slate-700 text-[10px]">
                        {exp.category}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">({exp.payment_method})</span>
                    </div>
                    <p className="font-semibold text-slate-900 mt-1">{exp.description}</p>
                    <span className="text-[11px] text-slate-400">{formatDate(exp.expense_date)}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-black text-rose-700 block">{formatCurrency(exp.amount)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                No operating expenses recorded yet.
              </div>
            )}
          </div>

          {/* Desktop Expenses Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400">
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Method</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.recentExpenses && data.recentExpenses.length > 0 ? (
                  data.recentExpenses.map((exp, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 font-semibold text-slate-700 text-[10px]">
                          {exp.category}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-800 font-medium truncate max-w-[140px]">{exp.description}</td>
                      <td className="py-2.5 text-slate-500">{formatDate(exp.expense_date)}</td>
                      <td className="py-2.5 text-slate-600">{exp.payment_method}</td>
                      <td className="py-2.5 text-right font-bold text-rose-700">{formatCurrency(exp.amount)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No operating expenses recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
