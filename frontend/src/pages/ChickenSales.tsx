import React, { useState, useEffect } from 'react';
import {
  Scale,
  Plus,
  Trash2,
  Calendar,
  Wallet,
  TrendingUp,
  Receipt,
  Search,
  Filter,
} from 'lucide-react';
import { useBusinessDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { salesApi } from '../services/api';
import { ChickenSale } from '../types';
import { formatCurrency, formatKg, formatDate } from '../utils/format';
import { ReasonModal } from '../components/ReasonModal';
import { DailyClosingCalendar } from '../components/DailyClosingCalendar';

export const ChickenSales: React.FC = () => {
  const { selectedDate, setSelectedDate } = useBusinessDate();
  const { hasRole } = useAuth();
  const { success, error } = useToast();

  const [sales, setSales] = useState<ChickenSale[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Form State
  const [weightKg, setWeightKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('250');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Other'>('Cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Delete State
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchSales = async () => {
    try {
      setLoading(true);
      const res = await salesApi.getAll({ date: selectedDate });
      if (res.data.success) {
        setSales(res.data.data);
        setSummary(res.data.summary);
      }
    } catch {
      error('Failed to load chicken sales records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, [selectedDate]);

  // Fast auto calculation for form
  const numWeight = parseFloat(weightKg) || 0;
  const numPrice = parseFloat(pricePerKg) || 0;
  const calculatedTotal = numWeight * numPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numWeight <= 0) {
      error('Weight sold must be greater than zero.');
      return;
    }
    if (numPrice < 0) {
      error('Price per kg cannot be negative.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await salesApi.create({
        saleDate: selectedDate,
        weightSoldKg: numWeight,
        pricePerKg: numPrice,
        paymentMethod,
        notes: notes.trim() || undefined,
      });

      if (res.data.success) {
        success(`Recorded sale: ${numWeight} kg @ ₹${numPrice}/kg (₹${calculatedTotal.toFixed(2)})`);
        setWeightKg('');
        setNotes('');
        fetchSales();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to record chicken sale.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async (reason: string) => {
    if (!deleteId) return;
    try {
      const res = await salesApi.delete(deleteId, { reason });
      if (res.data.success) {
        success('Chicken sale transaction deleted and logged in audit trail.');
        setDeleteId(null);
        fetchSales();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to delete sale.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Chicken Sales Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Fast counter chicken weight recording and instant billing for:{' '}
            <span className="font-semibold text-slate-800">{formatDate(selectedDate)}</span>
          </p>
        </div>

        <DailyClosingCalendar
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          align="right"
        />
      </div>

      {/* Summary KPI Cards for Selected Date */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">Total Chicken Sold</span>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatKg(summary?.totalWeightKg)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Sum of all sales today</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">Sales Revenue</span>
          <p className="text-xl font-bold text-blue-700 mt-1">{formatCurrency(summary?.totalRevenue)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Gross value of chicken</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">Cash vs Online</span>
          <p className="text-xs font-bold text-slate-800 mt-1">
            Cash: <span className="text-emerald-700">{formatCurrency(summary?.cashRevenue)}</span>
          </p>
          <p className="text-xs font-bold text-slate-800 mt-0.5">
            UPI: <span className="text-blue-700">{formatCurrency(summary?.upiRevenue)}</span>
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">Average Rate / kg</span>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(summary?.averagePricePerKg)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Revenue ÷ Sold weight</p>
        </div>
      </div>

      {/* Fast Counter Sale Entry Form */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-brand-600" />
          <span>Record Counter Chicken Sale</span>
        </h2>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Weight Sold (kg)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              placeholder="e.g. 1.75"
              className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Price / kg (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={pricePerKg}
              onChange={(e) => setPricePerKg(e.target.value)}
              placeholder="e.g. 250"
              className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Calculated Total</label>
            <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-black text-brand-900">
              {formatCurrency(calculatedTotal)}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e: any) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI / QR</option>
              <option value="Card">Card</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="xs:col-span-2 sm:col-span-1">
            <button
              type="submit"
              disabled={submitting || numWeight <= 0}
              className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-bold shadow-md shadow-brand-600/20 transition disabled:opacity-50 min-h-[42px]"
            >
              {submitting ? 'Saving...' : '+ Add Sale'}
            </button>
          </div>
        </form>
      </div>

      {/* Sales Transactions: Desktop Table + Mobile Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Recorded Sales for {formatDate(selectedDate)}</h3>
          <span className="text-xs text-slate-500 font-medium">{sales.length} transactions</span>
        </div>

        {/* Mobile Sales Cards (visible below md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {sales.length > 0 ? (
            sales.map((sale, idx) => (
              <div key={sale.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-400">#{idx + 1}</span>
                    <span className="font-bold text-slate-900 text-sm">{formatKg(sale.weight_sold_kg)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black text-brand-900">{formatCurrency(sale.total_amount)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 py-1.5 px-2.5 bg-slate-50 rounded-xl text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Rate / kg</span>
                    <span className="font-semibold text-slate-700">{formatCurrency(sale.price_per_kg)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Payment</span>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        sale.payment_method === 'Cash'
                          ? 'bg-emerald-100 text-emerald-800'
                          : sale.payment_method === 'UPI'
                          ? 'bg-blue-100 text-blue-800'
                          : sale.payment_method === 'Katha'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {sale.payment_method}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>
                    Source:{' '}
                    {sale.bill_number ? (
                      <span className="font-mono text-blue-600 font-semibold">{sale.bill_number}</span>
                    ) : (
                      sale.notes || 'Counter Retail'
                    )}
                  </span>
                  {hasRole('owner', 'admin') && (
                    <button
                      type="button"
                      onClick={() => setDeleteId(sale.id)}
                      className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              No chicken sales recorded on this date yet.
            </div>
          )}
        </div>

        {/* Desktop Table (hidden below md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Weight (kg)</th>
                <th className="py-3 px-4">Price / kg</th>
                <th className="py-3 px-4">Total Amount</th>
                <th className="py-3 px-4">Payment Method</th>
                <th className="py-3 px-4">Source / Bill</th>
                <th className="py-3 px-4">Recorded By</th>
                {hasRole('owner', 'admin') && <th className="py-3 px-4 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.length > 0 ? (
                sales.map((sale, idx) => (
                  <tr key={sale.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{formatKg(sale.weight_sold_kg)}</td>
                    <td className="py-3 px-4 text-slate-700">{formatCurrency(sale.price_per_kg)}</td>
                    <td className="py-3 px-4 font-black text-brand-900 text-sm">
                      {formatCurrency(sale.total_amount)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          sale.payment_method === 'Cash'
                            ? 'bg-emerald-100 text-emerald-800'
                            : sale.payment_method === 'UPI'
                            ? 'bg-blue-100 text-blue-800'
                            : sale.payment_method === 'Katha'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {sale.payment_method}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {sale.bill_number ? (
                        <span className="font-mono text-blue-600 font-semibold">{sale.bill_number}</span>
                      ) : (
                        sale.notes || 'Counter Retail'
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{sale.created_by_name || 'Staff'}</td>
                    {hasRole('owner', 'admin') && (
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setDeleteId(sale.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition"
                          title="Delete with Reason"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No chicken sales recorded on this date yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reason Modal for Deleting Sale */}
      <ReasonModal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Chicken Sale Transaction"
        description="Deleting a sale will reverse its weight from inventory records and permanently record your reason in the audit log."
        confirmText="Delete Sale"
        isDanger={true}
      />
    </div>
  );
};
