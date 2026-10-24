import React, { useState, useEffect } from 'react';
import {
  Package,
  AlertTriangle,
  Plus,
  Scale,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  CheckCircle2,
  ArrowRightLeft,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { stockApi } from '../services/api';
import { formatCurrency, formatKg, formatDate, getTodayDateString } from '../utils/format';
import { Modal } from '../components/Modal';

type FilterPeriod = 'today' | 'week' | 'month';

export const StockManagement: React.FC = () => {
  const { hasRole } = useAuth();
  const { success, error } = useToast();

  const [filterPeriod, setFilterPeriod] = useState<FilterPeriod>('today');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Adjustment Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjWeight, setAdjWeight] = useState('');
  const [adjType, setAdjType] = useState('Stock Shrinkage / Loss');
  const [adjReason, setAdjReason] = useState('');
  const [savingAdj, setSavingAdj] = useState(false);

  const handleCancelTransfer = async (transferId: number) => {
    const reason = window.prompt('Please enter a reason for cancelling this stock transfer:');
    if (!reason || !reason.trim()) {
      return;
    }
    try {
      const res = await stockApi.cancelTransfer(transferId, { reason: reason.trim() });
      if (res.data.success) {
        success('Stock transfer cancelled successfully.');
        fetchStockData();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to cancel stock transfer.');
    }
  };

  const getPeriodInfo = (period: FilterPeriod) => {
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

    // 'month'
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
  };

  const periodInfo = getPeriodInfo(filterPeriod);

  const fetchStockData = async () => {
    try {
      setLoading(true);
      const info = getPeriodInfo(filterPeriod);
      const [statusRes, ledgerRes, transfersRes] = await Promise.all([
        stockApi.getStatus({ startDate: info.startDate, endDate: info.endDate }),
        stockApi.getLedger(
          showAllHistory ? undefined : { startDate: info.startDate, endDate: info.endDate }
        ),
        stockApi.getTransfers(
          showAllHistory ? undefined : { startDate: info.startDate, endDate: info.endDate }
        ),
      ]);

      if (statusRes.data.success) {
        setStatus(statusRes.data.data);
      }
      if (ledgerRes.data.success) {
        setLedger(ledgerRes.data.data);
      }
      if (transfersRes.data.success) {
        setTransfers(transfersRes.data.data);
      }
    } catch {
      error('Failed to load stock data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockData();
  }, [filterPeriod, showAllHistory]);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(adjWeight);
    if (isNaN(w) || w === 0) {
      error('Please enter a non-zero adjustment weight.');
      return;
    }
    if (!adjReason.trim()) {
      error('A mandatory reason is required for stock adjustments.');
      return;
    }

    try {
      setSavingAdj(true);
      const res = await stockApi.adjust({
        txnDate: getTodayDateString(),
        weightKg: w,
        adjustmentType: adjType,
        reason: adjReason.trim(),
      });

      if (res.data.success) {
        success(`Recorded stock adjustment of ${w > 0 ? '+' : ''}${w} kg.`);
        setIsAdjustModalOpen(false);
        setAdjWeight('');
        setAdjReason('');
        fetchStockData();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to record stock adjustment.');
    } finally {
      setSavingAdj(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Stock Management & Ledger</h1>
          <p className="text-xs text-slate-500 mt-1">
            Opening continuity, deliveries received, and physical stock reconciliation for:{' '}
            <span className="font-semibold text-slate-800">{periodInfo.label} ({periodInfo.dateDisplay})</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Today / This Week / This Month Segmented Buttons */}
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setFilterPeriod('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] ${
                filterPeriod === 'today'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setFilterPeriod('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] ${
                filterPeriod === 'week'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setFilterPeriod('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] ${
                filterPeriod === 'month'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              This Month
            </button>
          </div>

          <button
            onClick={() => setIsAdjustModalOpen(true)}
            className="px-3.5 py-2 min-h-[36px] bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Stock Adjustment</span>
          </button>
        </div>
      </div>

      {/* Live Continuity Flow Cards */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">1. Opening Stock</span>
          <p className="text-xl font-bold text-slate-900 mt-1 truncate">{formatKg(status?.openingStockKg)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            {filterPeriod === 'today'
              ? status?.previousVerifiedDate
                ? `From ${formatDate(status.previousVerifiedDate)} closing`
                : 'Initial opening balance'
              : `At start of ${filterPeriod === 'week' ? 'week' : 'month'}`}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">2. New Stock Received</span>
          <p className="text-xl font-bold text-cyan-800 mt-1 truncate">+{formatKg(status?.newStockReceivedKg)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            {status?.deliveryCount || 0} distributor {status?.deliveryCount === 1 ? 'delivery' : 'deliveries'} ({formatCurrency(status?.totalPurchaseCost)})
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">3. Total Available</span>
          <p className="text-xl font-bold text-brand-900 mt-1 truncate">{formatKg(status?.totalAvailableStockKg)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Opening + Deliveries</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">4. Stock Transferred</span>
          <p className="text-xl font-bold text-amber-800 mt-1 truncate">
            {parseFloat(status?.totalStockTransferredKg) > 0 ? `−${formatKg(status?.totalStockTransferredKg)}` : '0 kg'}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            {status?.transferCount || 0} {status?.transferCount === 1 ? 'transfer' : 'transfers'} to other shops
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">5. Available for Sale</span>
          <p className="text-xl font-bold text-emerald-800 mt-1 truncate">
            {formatKg(status?.stockAvailableForSaleKg ?? status?.totalAvailableStockKg)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Available − Transferred</p>
        </div>
      </div>

      {/* Adjustments for Selected Period */}
      {status?.adjustments && status.adjustments.length > 0 && (
        <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 text-amber-900 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Stock Adjustments for {periodInfo.label}:</span>
          </div>
          <ul className="list-disc list-inside space-y-1">
            {status.adjustments.map((a: any) => (
              <li key={a.id}>
                <span className="font-semibold">{a.weight_kg > 0 ? `+${a.weight_kg}` : a.weight_kg} kg</span> — {a.reason}{' '}
                <span className="text-amber-700/70">({formatDate(a.txn_date)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Historical Stock Continuity Ledger */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Historical Daily Stock Balance Continuity</h3>
            <p className="text-xs text-slate-400 mt-0.5">Verified daily opening and closing stock audit trail</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-medium">
              {ledger.length} verified {ledger.length === 1 ? 'closing' : 'closings'}{' '}
              {!showAllHistory ? `(${periodInfo.label})` : '(All Time)'}
            </span>
            <button
              type="button"
              onClick={() => setShowAllHistory(!showAllHistory)}
              className="text-xs text-brand-600 hover:text-brand-800 underline font-semibold transition py-1"
            >
              {showAllHistory ? 'Show Filtered' : 'Show All'}
            </button>
          </div>
        </div>

        {/* Mobile View: Cards */}
        <div className="block md:hidden divide-y divide-slate-100">
          {ledger.length > 0 ? (
            ledger.map((c) => (
              <div key={c.business_date} className="p-4 hover:bg-slate-50/80 transition-colors space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{formatDate(c.business_date)}</span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      c.status === 'Completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {c.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Opening Stock</span>
                    <span className="font-semibold text-slate-800">{formatKg(c.opening_stock_kg)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Stock Received</span>
                    <span className="font-semibold text-cyan-700">+{formatKg(c.new_stock_kg)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Total Available</span>
                    <span className="font-bold text-slate-900">{formatKg(c.total_available_stock_kg)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Transferred Out</span>
                    <span className="font-semibold text-amber-700">
                      {parseFloat(c.stock_transferred_kg) > 0 ? `−${formatKg(c.stock_transferred_kg)}` : '0 kg'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">For Sale</span>
                    <span className="font-bold text-emerald-900">
                      {formatKg(c.stock_available_for_sale_kg || c.total_available_stock_kg)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Quantity Sold</span>
                    <span className="font-semibold text-amber-700">{formatKg(c.quantity_sold_kg)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Closing Stock</span>
                    <span className="font-black text-emerald-700">{formatKg(c.closing_stock_kg)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Rate / kg</span>
                    <span className="font-medium text-slate-700">{formatCurrency(c.selling_price_per_kg)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-slate-500 text-[11px]">Chicken Sales Revenue:</span>
                  <span className="font-bold text-blue-900 text-sm">{formatCurrency(c.chicken_sales_revenue)}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              No verified historical closings found for {periodInfo.label} ({periodInfo.dateDisplay}).
            </div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Opening (kg)</th>
                <th className="py-3 px-4">+ Received (kg)</th>
                <th className="py-3 px-4">Total Available</th>
                <th className="py-3 px-4">− Transferred (kg)</th>
                <th className="py-3 px-4">For Sale (kg)</th>
                <th className="py-3 px-4">− Sold (kg)</th>
                <th className="py-3 px-4">Closing Stock (kg)</th>
                <th className="py-3 px-4">Rate / kg</th>
                <th className="py-3 px-4">Sales Revenue</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.length > 0 ? (
                ledger.map((c) => (
                  <tr key={c.business_date} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-bold text-slate-900">{formatDate(c.business_date)}</td>
                    <td className="py-3 px-4 text-slate-700">{formatKg(c.opening_stock_kg)}</td>
                    <td className="py-3 px-4 text-cyan-700 font-semibold">+{formatKg(c.new_stock_kg)}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{formatKg(c.total_available_stock_kg)}</td>
                    <td className="py-3 px-4 text-amber-700 font-semibold">
                      {parseFloat(c.stock_transferred_kg) > 0 ? `−${formatKg(c.stock_transferred_kg)}` : '0 kg'}
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-900">
                      {formatKg(c.stock_available_for_sale_kg || c.total_available_stock_kg)}
                    </td>
                    <td className="py-3 px-4 text-amber-700 font-semibold">{formatKg(c.quantity_sold_kg)}</td>
                    <td className="py-3 px-4 font-black text-emerald-800">{formatKg(c.closing_stock_kg)}</td>
                    <td className="py-3 px-4 text-slate-700">{formatCurrency(c.selling_price_per_kg)}</td>
                    <td className="py-3 px-4 font-bold text-blue-900">{formatCurrency(c.chicken_sales_revenue)}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          c.status === 'Completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-400">
                    No verified historical closings found for {periodInfo.label} ({periodInfo.dateDisplay}).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Transfers to Other Shops Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-brand-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Stock Transfers to Other Shops</h3>
              <p className="text-xs text-slate-400 mt-0.5">Outbound chicken stock transfers for {periodInfo.label}</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {transfers.length} {transfers.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {transfers.length > 0 ? (
          <>
            {/* Mobile Cards for Stock Transfers (visible below md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {transfers.map((t) => (
                <div key={t.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase">{formatDate(t.transfer_date)}</span>
                      <h4 className="font-bold text-slate-900 text-sm mt-0.5">{t.destination_shop}</h4>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        t.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 py-2 px-3 bg-slate-50 rounded-xl text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Transferred Weight</span>
                      <span className="font-bold text-amber-700">{formatKg(t.transferred_quantity_kg)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Cost Valuation</span>
                      <span className="font-semibold text-slate-700">{formatCurrency(t.total_transfer_cost)}</span>
                    </div>
                  </div>

                  {t.notes && (
                    <p className="text-[11px] text-slate-500">
                      Reason: <span className="font-medium text-slate-700">{t.notes}</span>
                    </p>
                  )}

                  {hasRole('owner', 'admin') && t.status !== 'cancelled' && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => handleCancelTransfer(t.id)}
                        className="px-3 py-1.5 min-h-[36px] bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold rounded-lg text-xs transition"
                      >
                        Cancel Transfer
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table (hidden below md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                    <th className="py-3 px-4">Transfer Date</th>
                    <th className="py-3 px-4">Destination Shop</th>
                    <th className="py-3 px-4">Transferred Weight</th>
                    <th className="py-3 px-4">Cost Valuation</th>
                    <th className="py-3 px-4">Reason / Notes</th>
                    <th className="py-3 px-4">Status</th>
                    {hasRole('owner', 'admin') && <th className="py-3 px-4 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-bold text-slate-900">{formatDate(t.transfer_date)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{t.destination_shop}</td>
                      <td className="py-3 px-4 font-bold text-amber-700">{formatKg(t.transferred_quantity_kg)}</td>
                      <td className="py-3 px-4 text-slate-700">{formatCurrency(t.total_transfer_cost)}</td>
                      <td className="py-3 px-4 text-slate-500">{t.notes || '—'}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            t.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      {hasRole('owner', 'admin') && (
                        <td className="py-3 px-4 text-right">
                          {t.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => handleCancelTransfer(t.id)}
                              className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline"
                            >
                              Cancel Transfer
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs">
            No stock transfers recorded for {periodInfo.label} ({periodInfo.dateDisplay}).
          </div>
        )}
      </div>

      {/* Manual Stock Adjustment Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Record Stock Adjustment / Discrepancy"
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
            Use this to record physical shrinkage, transit cutting losses, butcher waste, or surplus found on scale.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment Type</label>
            <select
              value={adjType}
              onChange={(e) => setAdjType(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none"
            >
              <option value="Stock Shrinkage / Loss">Stock Shrinkage / Cutting Loss</option>
              <option value="Damaged / Spoiled">Damaged / Spoiled Stock</option>
              <option value="Physical Scale Discrepancy">Physical Scale Discrepancy</option>
              <option value="Surplus Found">Surplus Found (+ kg)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Weight Adjustment (kg) <span className="text-slate-400 font-normal">(negative for loss, positive for surplus)</span>
            </label>
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={adjWeight}
              onChange={(e) => setAdjWeight(e.target.value)}
              placeholder="e.g. -2.5 or 1.2"
              className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason / Explanation <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="e.g. 2.5 kg water loss / cutting shrinkage verified at evening cleanout"
              rows={3}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none resize-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAdjustModalOpen(false)}
              className="px-4 py-2 min-h-[40px] text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingAdj}
              className="px-5 py-2 min-h-[40px] text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow transition"
            >
              {savingAdj ? 'Saving...' : 'Confirm Adjustment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
