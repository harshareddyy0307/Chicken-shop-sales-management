import React, { useState, useEffect } from 'react';
import {
  Truck,
  Plus,
  Calendar,
  Search,
  Trash2,
  Edit2,
  FileText,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { useBusinessDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { distributorApi } from '../services/api';
import { Distributor, DistributorSupply } from '../types';
import { formatCurrency, formatKg, formatDate } from '../utils/format';
import { Modal } from '../components/Modal';
import { ReasonModal } from '../components/ReasonModal';
import { DailyClosingCalendar } from '../components/DailyClosingCalendar';

export const DistributorSupplyPage: React.FC = () => {
  const { selectedDate, setSelectedDate } = useBusinessDate();
  const { hasRole } = useAuth();
  const { success, error } = useToast();

  const [supplies, setSupplies] = useState<DistributorSupply[]>([]);
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Supply Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [distributorId, setDistributorId] = useState('');
  const [supplyDate, setSupplyDate] = useState(selectedDate);
  const [weightKg, setWeightKg] = useState('');
  const [pricePerKg, setPricePerKg] = useState('180');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit / Delete State
  const [editingSupply, setEditingSupply] = useState<DistributorSupply | null>(null);
  const [editReason, setEditReason] = useState('');
  const [deleteSupplyId, setDeleteSupplyId] = useState<number | null>(null);

  // Search & Filter
  const [searchDist, setSearchDist] = useState('');
  const [activePeriod, setActivePeriod] = useState<'today' | 'week' | 'month' | 'year'>('today');

  const getDateRange = (period: string, refDateStr: string) => {
    const parts = refDateStr.split('-').map(Number);
    const y = parts[0];
    const m = parts[1] - 1;
    const d = parts[2];

    const toIso = (dt: Date) => {
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      return `${dt.getFullYear()}-${mm}-${dd}`;
    };

    if (period === 'today') {
      return { startDate: refDateStr, endDate: refDateStr };
    }
    if (period === 'week') {
      const ref = new Date(y, m, d);
      const day = ref.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(y, m, d + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        startDate: toIso(monday),
        endDate: toIso(sunday),
      };
    }
    if (period === 'month') {
      const first = new Date(y, m, 1);
      const last = new Date(y, m + 1, 0);
      return {
        startDate: toIso(first),
        endDate: toIso(last),
      };
    }
    if (period === 'year') {
      const first = new Date(y, 0, 1);
      const last = new Date(y, 11, 31);
      return {
        startDate: toIso(first),
        endDate: toIso(last),
      };
    }
    return { startDate: refDateStr, endDate: refDateStr };
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange(activePeriod, selectedDate);
      const [distRes, supRes] = await Promise.all([
        distributorApi.getAll({ activeOnly: 'true' }),
        distributorApi.getSupplies(
          activePeriod === 'today'
            ? { date: selectedDate }
            : { startDate, endDate }
        ),
      ]);

      if (distRes.data.success) {
        setDistributors(distRes.data.data);
        const sr = distRes.data.data.find((d: any) => d.name.toLowerCase().includes('sr poultry')) || distRes.data.data[0];
        if (sr) {
          setDistributorId((prev) => prev || String(sr.id));
        }
      }
      if (supRes.data.success) {
        setSupplies(supRes.data.data);
      }
    } catch {
      error('Failed to load distributor supply records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setSupplyDate(selectedDate);
  }, [selectedDate, activePeriod]);

  const numWeight = parseFloat(weightKg) || 0;
  const numPrice = parseFloat(pricePerKg) || 0;
  const totalAmount = numWeight * numPrice;

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!distributorId) {
      error('Please select a distributor.');
      return;
    }
    if (numWeight <= 0) {
      error('Weight received must be greater than zero.');
      return;
    }
    if (numPrice < 0) {
      error('Price per kg cannot be negative.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await distributorApi.createSupply({
        distributorId: parseInt(distributorId, 10),
        supplyDate,
        weightKg: numWeight,
        pricePerKg: numPrice,
        invoiceNumber: invoiceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      if (res.data.success) {
        success(`Distributor supply of ${formatKg(numWeight)} recorded successfully.`);
        setIsAddModalOpen(false);
        setWeightKg('');
        setInvoiceNumber('');
        setNotes('');
        loadData();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to record distributor supply.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupply) return;
    if (!editReason.trim()) {
      error('A mandatory reason is required to edit a supply record.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await distributorApi.updateSupply(editingSupply.id, {
        weightKg: parseFloat(String(editingSupply.weight_kg)),
        pricePerKg: parseFloat(String(editingSupply.price_per_kg)),
        supplyDate: editingSupply.supply_date,
        invoiceNumber: editingSupply.invoice_number,
        notes: editingSupply.notes,
        reason: editReason.trim(),
      });

      if (res.data.success) {
        success('Supply record updated and audit trail logged.');
        setEditingSupply(null);
        setEditReason('');
        loadData();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to update supply record.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async (reason: string) => {
    if (!deleteSupplyId) return;
    try {
      const res = await distributorApi.deleteSupply(deleteSupplyId, { reason });
      if (res.data.success) {
        success('Supply record deleted and inventory reversed.');
        setDeleteSupplyId(null);
        loadData();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to delete supply record.');
    }
  };

  // Calculations for KPI Cards
  const totalWeightToday = supplies.reduce((sum, s) => sum + parseFloat(String(s.weight_kg)), 0);
  const totalAmountToday = supplies.reduce((sum, s) => sum + parseFloat(String(s.total_amount)), 0);

  const filteredSupplies = supplies.filter(
    (s) =>
      !searchDist ||
      s.distributor_name?.toLowerCase().includes(searchDist.toLowerCase()) ||
      s.invoice_number?.toLowerCase().includes(searchDist.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Distributor Supply Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Incoming live bird batches and automated inventory lot tracking for:{' '}
            <span className="font-semibold text-slate-800">
              {activePeriod === 'today'
                ? formatDate(selectedDate)
                : activePeriod === 'week'
                ? 'This Week'
                : activePeriod === 'month'
                ? 'This Month'
                : 'This Year'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          {/* Today / This Week / This Month / This Year Buttons */}
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setActivePeriod('today')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
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
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
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
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
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
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activePeriod === 'year'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              This Year
            </button>
          </div>

          <DailyClosingCalendar
            selectedDate={selectedDate}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setActivePeriod('today');
            }}
            align="right"
          />

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-brand-600/20 transition min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Supply</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 xs:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">
            Total Deliveries ({activePeriod === 'today' ? 'Today' : activePeriod === 'week' ? 'This Week' : activePeriod === 'month' ? 'This Month' : 'This Year'})
          </span>
          <p className="text-2xl font-bold text-slate-900 mt-1">{supplies.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Separate drops</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">
            Total Live Weight ({activePeriod === 'today' ? 'Today' : activePeriod === 'week' ? 'This Week' : activePeriod === 'month' ? 'This Month' : 'This Year'})
          </span>
          <p className="text-2xl font-bold text-cyan-800 mt-1">{formatKg(totalWeightToday)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Added to inventory</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500">
            Total Purchase Value ({activePeriod === 'today' ? 'Today' : activePeriod === 'week' ? 'This Week' : activePeriod === 'month' ? 'This Month' : 'This Year'})
          </span>
          <p className="text-2xl font-bold text-emerald-800 mt-1">{formatCurrency(totalAmountToday)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Accounts payable</p>
        </div>
      </div>

      {/* Supplies: Desktop Table + Mobile Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Recorded Deliveries</h3>
            <span className="text-xs text-slate-400">({filteredSupplies.length} records)</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search supplier or invoice..."
                value={searchDist}
                onChange={(e) => setSearchDist(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500 outline-none w-full sm:w-64"
              />
            </div>
          </div>
        </div>

        {/* Mobile Cards (visible below md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredSupplies.length > 0 ? (
            filteredSupplies.map((s) => (
              <div key={s.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase">{formatDate(s.supply_date)}</span>
                    <h4 className="font-bold text-slate-900 text-sm mt-0.5">{s.distributor_name}</h4>
                    {s.daily_closing_id && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 mt-1">
                        ⚡ Daily Closing
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Total Cost</span>
                    <span className="text-base font-black text-emerald-800">{formatCurrency(s.total_amount)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 py-2 px-3 bg-slate-50 rounded-xl text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Weight Received</span>
                    <span className="font-black text-cyan-900">{formatKg(s.weight_kg)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Rate / kg</span>
                    <span className="font-bold text-slate-700">{formatCurrency(s.price_per_kg)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Ref: <strong className="font-mono text-slate-700">{s.invoice_number || 'N/A'}</strong></span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSupply({ ...s });
                        setEditReason('');
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1 transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    {hasRole('owner', 'admin') && (
                      <button
                        type="button"
                        onClick={() => setDeleteSupplyId(s.id)}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold rounded-lg text-xs flex items-center gap-1 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              No distributor supplies recorded for this date.
            </div>
          )}
        </div>

        {/* Desktop Table (hidden below md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Distributor</th>
                <th className="py-3 px-4">Weight (kg)</th>
                <th className="py-3 px-4">Rate / kg</th>
                <th className="py-3 px-4">Total Amount</th>
                <th className="py-3 px-4">Invoice / Ref #</th>
                <th className="py-3 px-4">Recorded By</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSupplies.length > 0 ? (
                filteredSupplies.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-semibold text-slate-700">{formatDate(s.supply_date)}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{s.distributor_name}</span>
                        {s.daily_closing_id && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            ⚡ Daily Closing
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-black text-cyan-900">{formatKg(s.weight_kg)}</td>
                    <td className="py-3 px-4 text-slate-700">{formatCurrency(s.price_per_kg)}</td>
                    <td className="py-3 px-4 font-bold text-emerald-900 text-sm">
                      {formatCurrency(s.total_amount)}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">{s.invoice_number || '-'}</td>
                    <td className="py-3 px-4 text-slate-500">{s.created_by_name || 'Staff'}</td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <button
                        onClick={() => {
                          setEditingSupply({ ...s });
                          setEditReason('');
                        }}
                        className="p-1 text-slate-400 hover:text-brand-600 transition"
                        title="Edit Supply"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {hasRole('owner', 'admin') && (
                        <button
                          onClick={() => setDeleteSupplyId(s.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition"
                          title="Delete with Reason"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No distributor supplies recorded for this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Supply Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Record New Distributor Delivery">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Distributor <span className="text-rose-500">*</span>
            </label>
            <select
              value={distributorId}
              onChange={(e) => setDistributorId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
              required
            >
              <option value="">-- Choose Distributor --</option>
              {distributors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.phone ? `(${d.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Supply Date</label>
              <DailyClosingCalendar
                selectedDate={supplyDate}
                onSelectDate={setSupplyDate}
                className="w-full"
                showStatusBadge={false}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice / DC Ref #</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-1049"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Weight Received (kg) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="e.g. 150"
                className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Purchase Price / kg (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={pricePerKg}
                onChange={(e) => setPricePerKg(e.target.value)}
                placeholder="e.g. 180"
                className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl outline-none"
                required
              />
            </div>
          </div>

          <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-900">Total Purchase Payable:</span>
            <span className="text-lg font-black text-emerald-950">{formatCurrency(totalAmount)}</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes / Delivery Remarks</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Healthy birds; 1 crate dead on arrival compensated"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || numWeight <= 0}
              className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Confirm Delivery'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Supply Modal */}
      {editingSupply && (
        <Modal isOpen={true} onClose={() => setEditingSupply(null)} title="Edit Distributor Supply Record">
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  value={editingSupply.weight_kg}
                  onChange={(e) => setEditingSupply({ ...editingSupply, weight_kg: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Price / kg (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={editingSupply.price_per_kg}
                  onChange={(e) => setEditingSupply({ ...editingSupply, price_per_kg: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mandatory Reason for Edit <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g. Corrected weight after tare recalculation"
                rows={2}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none resize-none"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingSupply(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow transition"
              >
                {submitting ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Reason Modal */}
      <ReasonModal
        isOpen={deleteSupplyId !== null}
        onClose={() => setDeleteSupplyId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Distributor Supply Record"
        description="Deleting this supply record will reverse the inventory batch and the accounts payable balance. Reason is recorded in the permanent audit trail."
        confirmText="Delete Supply"
        isDanger={true}
      />
    </div>
  );
};
