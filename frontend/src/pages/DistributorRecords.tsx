import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Upload,
  Calendar,
  Wallet,
  ArrowRight,
  FileText,
  Trash2,
  ExternalLink,
  Printer,
  FileSpreadsheet,
} from 'lucide-react';
import { useBusinessDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { distributorApi } from '../services/api';
import { Distributor, DistributorPayment } from '../types';
import { formatCurrency, formatKg, formatDate } from '../utils/format';
import { Modal } from '../components/Modal';
import { ReasonModal } from '../components/ReasonModal';
import { DailyClosingCalendar } from '../components/DailyClosingCalendar';

export const DistributorRecordsPage: React.FC = () => {
  const { selectedDate } = useBusinessDate();
  const { hasRole } = useAuth();
  const { success, error, warning } = useToast();

  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add Distributor Modal
  const [isAddDistModalOpen, setIsAddDistModalOpen] = useState(false);
  const [newDistName, setNewDistName] = useState('');
  const [newDistPhone, setNewDistPhone] = useState('');
  const [newDistAddress, setNewDistAddress] = useState('');
  const [newDistOpeningBal, setNewDistOpeningBal] = useState('');
  const [newDistNotes, setNewDistNotes] = useState('');

  // Record Payment Modal
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payDistributorId, setPayDistributorId] = useState('');
  const [payDate, setPayDate] = useState(selectedDate);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Other'>('UPI');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [isAdvance, setIsAdvance] = useState(false);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [submittingPay, setSubmittingPay] = useState(false);

  // Selected Distributor Ledger Drawer / Modal
  const [selectedDistForLedger, setSelectedDistForLedger] = useState<number | null>(null);
  const [distLedgerData, setDistLedgerData] = useState<any>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Delete Payment with Reason
  const [deletePayId, setDeletePayId] = useState<number | null>(null);

  // Delete Distributor Permanently
  const [deletingDistributor, setDeletingDistributor] = useState<Distributor | null>(null);
  const [deleteDistReason, setDeleteDistReason] = useState('');
  const [isDeletingDistributor, setIsDeletingDistributor] = useState(false);

  const loadDistributors = async () => {
    try {
      setLoading(true);
      const res = await distributorApi.getAll();
      if (res.data.success) {
        setDistributors(res.data.data);
      }
    } catch {
      error('Failed to load distributor records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDistributors();
  }, []);

  const openLedger = async (id: number) => {
    setSelectedDistForLedger(id);
    try {
      setLedgerLoading(true);
      const res = await distributorApi.getOne(id);
      if (res.data.success) {
        setDistLedgerData(res.data.data);
      }
    } catch {
      error('Failed to load distributor ledger statement.');
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleCreateDistributor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDistName.trim()) {
      error('Distributor name is required.');
      return;
    }
    try {
      const res = await distributorApi.create({
        name: newDistName.trim(),
        phone: newDistPhone.trim() || undefined,
        address: newDistAddress.trim() || undefined,
        openingBalance: parseFloat(newDistOpeningBal) || 0,
        notes: newDistNotes.trim() || undefined,
      });
      if (res.data.success) {
        success(`Distributor "${newDistName}" created successfully.`);
        setIsAddDistModalOpen(false);
        setNewDistName('');
        setNewDistPhone('');
        setNewDistAddress('');
        setNewDistOpeningBal('');
        setNewDistNotes('');
        loadDistributors();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to create distributor.');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(payAmount);
    if (!payDistributorId || isNaN(amt) || amt <= 0) {
      error('Please select a distributor and valid payment amount.');
      return;
    }

    try {
      setSubmittingPay(true);
      let screenshotUrl: string | undefined = undefined;

      if (screenshotFile) {
        const formData = new FormData();
        formData.append('screenshot', screenshotFile);
        const upRes = await distributorApi.uploadScreenshot(formData);
        if (upRes.data.success) {
          screenshotUrl = upRes.data.fileUrl;
        }
      }

      const res = await distributorApi.createPayment({
        distributorId: parseInt(payDistributorId, 10),
        paymentDate: payDate,
        amount: amt,
        paymentMethod: payMethod,
        transactionReference: payRef.trim() || undefined,
        screenshotUrl,
        notes: payNotes.trim() || undefined,
        isAdvance,
      });

      if (res.data.success) {
        success(`Recorded payment of ${formatCurrency(amt)} to distributor.`);
        setIsPayModalOpen(false);
        setPayAmount('');
        setPayRef('');
        setPayNotes('');
        setIsAdvance(false);
        setScreenshotFile(null);
        loadDistributors();
        if (selectedDistForLedger === parseInt(payDistributorId, 10)) {
          openLedger(selectedDistForLedger);
        }
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to record distributor payment.');
    } finally {
      setSubmittingPay(false);
    }
  };

  const handleDeletePaymentConfirm = async (reason: string) => {
    if (!deletePayId) return;
    try {
      const res = await distributorApi.deletePayment(deletePayId, { reason });
      if (res.data.success) {
        success('Payment reversed and outstanding balance recalculated.');
        setDeletePayId(null);
        loadDistributors();
        if (selectedDistForLedger) openLedger(selectedDistForLedger);
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to reverse payment.');
    }
  };

  const handleDeleteDistributor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingDistributor) return;

    try {
      setIsDeletingDistributor(true);
      const res = await distributorApi.deleteDistributor(deletingDistributor.id, {
        reason: deleteDistReason.trim() || undefined,
      });

      if (res.data.success) {
        success(`Distributor "${deletingDistributor.name}" deleted permanently.`);
        setDeletingDistributor(null);
        setDeleteDistReason('');
        loadDistributors();
      } else {
        error(res.data.error || 'Failed to delete distributor.');
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to delete distributor.');
    } finally {
      setIsDeletingDistributor(false);
    }
  };

  // Find distributor for payment form to show current balance
  const activeDistForPayment = distributors.find((d) => d.id === parseInt(payDistributorId, 10));

  const filteredDistributors = distributors.filter(
    (d) =>
      !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.phone?.toLowerCase().includes(search.toLowerCase())
  );

  const totalOutstandingAll = distributors.reduce((sum, d) => sum + d.outstandingBalance, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Distributor Accounts & Ledger</h1>
          <p className="text-xs text-slate-500 mt-1">
            Track poultry supplier balances, payments made, advance credits, and running account statements.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
          <button
            onClick={() => setIsAddDistModalOpen(true)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Supplier</span>
          </button>

          <button
            onClick={() => {
              setPayDate(selectedDate);
              setIsPayModalOpen(true);
            }}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-brand-600/20 transition min-h-[40px]"
          >
            <Wallet className="w-4 h-4" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* Total Balance Card */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-950 text-white p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
            Total Outstanding Distributor Payables
          </span>
          <p className="text-3xl font-black mt-1 text-white">{formatCurrency(totalOutstandingAll)}</p>
          <p className="text-xs text-slate-400 mt-0.5">Across all {distributors.length} active live bird suppliers</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search distributor name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-brand-500 outline-none w-full sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* Distributors List: Desktop Table + Mobile Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Distributor Accounts</h3>
          <span className="text-xs text-slate-400">({filteredDistributors.length} suppliers)</span>
        </div>

        {/* Mobile Supplier Cards (visible below md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredDistributors.length > 0 ? (
            filteredDistributors.map((d) => (
              <div key={d.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{d.name}</h4>
                    {d.phone ? (
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{d.phone}</p>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-0.5">{d.address || 'Local farm'}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Outstanding</span>
                    <span
                      className={`text-base font-black ${
                        d.outstandingBalance > 0
                          ? 'text-rose-700'
                          : d.outstandingBalance < 0
                          ? 'text-blue-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {formatCurrency(d.outstandingBalance)}
                      {d.outstandingBalance < 0 && ' (Advance)'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 px-2.5 bg-slate-50 rounded-xl text-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Opening</span>
                    <span className="font-semibold text-slate-700 text-[11px]">{formatCurrency(d.openingBalance)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Supplies</span>
                    <span className="font-semibold text-slate-900 text-[11px]">{formatCurrency(d.totalSuppliesAmount)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Paid</span>
                    <span className="font-semibold text-emerald-700 text-[11px]">{formatCurrency(d.totalPaymentsAmount)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPayDistributorId(String(d.id));
                      setPayDate(selectedDate);
                      setIsPayModalOpen(true);
                    }}
                    className="col-span-2 py-2.5 px-3 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 min-h-[40px] transition"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Pay Supplier</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openLedger(d.id)}
                    className="col-span-2 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 min-h-[40px] transition"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Ledger</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDeletingDistributor(d);
                      setDeleteDistReason('');
                    }}
                    className="col-span-1 py-2.5 px-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl text-xs flex items-center justify-center min-h-[40px] transition"
                    title={`Delete supplier "${d.name}" permanently`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              No distributors found matching criteria.
            </div>
          )}
        </div>

        {/* Desktop Table (hidden below md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-3 px-4">Supplier Name</th>
                <th className="py-3 px-4">Contact Phone</th>
                <th className="py-3 px-4">Opening Balance</th>
                <th className="py-3 px-4">Total Purchases</th>
                <th className="py-3 px-4">Total Paid</th>
                <th className="py-3 px-4">Current Outstanding</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDistributors.length > 0 ? (
                filteredDistributors.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900 text-sm">{d.name}</p>
                      <p className="text-[11px] text-slate-400 truncate max-w-xs">{d.address || 'Local farm'}</p>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">{d.phone || '-'}</td>
                    <td className="py-3.5 px-4 text-slate-600">{formatCurrency(d.openingBalance)}</td>
                    <td className="py-3.5 px-4 text-slate-900 font-semibold">{formatCurrency(d.totalSuppliesAmount)}</td>
                    <td className="py-3.5 px-4 text-emerald-700 font-semibold">{formatCurrency(d.totalPaymentsAmount)}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-sm font-black ${
                          d.outstandingBalance > 0
                            ? 'text-rose-700'
                            : d.outstandingBalance < 0
                            ? 'text-blue-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatCurrency(d.outstandingBalance)}
                        {d.outstandingBalance < 0 && ' (Advance)'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setPayDistributorId(String(d.id));
                          setPayDate(selectedDate);
                          setIsPayModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 font-bold rounded-lg transition"
                      >
                        Pay
                      </button>

                      <button
                        onClick={() => openLedger(d.id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition"
                      >
                        Ledger
                      </button>

                      <button
                        onClick={() => {
                          setDeletingDistributor(d);
                          setDeleteDistReason('');
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition inline-flex items-center align-middle"
                        title={`Delete supplier "${d.name}" permanently`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    No distributors found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      <Modal isOpen={isPayModalOpen} onClose={() => setIsPayModalOpen(false)} title="Record Payment to Distributor">
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Supplier <span className="text-rose-500">*</span>
            </label>
            <select
              value={payDistributorId}
              onChange={(e) => setPayDistributorId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl outline-none"
              required
            >
              <option value="">-- Choose Distributor --</option>
              {distributors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — Outstanding: {formatCurrency(d.outstandingBalance)}
                </option>
              ))}
            </select>
          </div>

          {activeDistForPayment && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-500">Current Outstanding Balance:</span>
              <span className="font-bold text-slate-900 text-sm">
                {formatCurrency(activeDistForPayment.outstandingBalance)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date</label>
              <DailyClosingCalendar
                selectedDate={payDate}
                onSelectDate={setPayDate}
                className="w-full"
                showStatusBadge={false}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={payMethod}
                onChange={(e: any) => setPayMethod(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none"
              >
                <option value="UPI">UPI / GPay / PhonePe</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer / NEFT</option>
                <option value="Card">Card</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Payment Amount (₹) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="w-full px-3.5 py-2.5 text-base font-bold border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>

          {/* Advance Payment Checkbox */}
          <div className="flex items-center gap-2 p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
            <input
              type="checkbox"
              id="isAdvance"
              checked={isAdvance}
              onChange={(e) => setIsAdvance(e.target.checked)}
              className="w-4 h-4 text-brand-600 rounded"
            />
            <label htmlFor="isAdvance" className="text-xs text-amber-900 font-medium cursor-pointer">
              Record as Advance Payment (Permits paying more than current debt)
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">UPI Ref / UTR / Cheque #</label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="e.g. UPI-92837482"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Upload Receipt / Screenshot</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setScreenshotFile(e.target.files ? e.target.files[0] : null)}
                className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Optional Notes</label>
            <input
              type="text"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="e.g. Paid morning balance via PhonePe"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsPayModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingPay}
              className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow transition disabled:opacity-50"
            >
              {submittingPay ? 'Processing...' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Distributor Modal */}
      <Modal isOpen={isAddDistModalOpen} onClose={() => setIsAddDistModalOpen(false)} title="Add New Poultry Supplier">
        <form onSubmit={handleCreateDistributor} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Distributor / Farm Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={newDistName}
              onChange={(e) => setNewDistName(e.target.value)}
              placeholder="e.g. Sri Venkateshwara Hatcheries"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                inputMode="tel"
                value={newDistPhone}
                onChange={(e) => setNewDistPhone(e.target.value)}
                placeholder="+91 98480 12345"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Opening Outstanding (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={newDistOpeningBal}
                onChange={(e) => setNewDistOpeningBal(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Farm / Warehouse Address</label>
            <input
              type="text"
              value={newDistAddress}
              onChange={(e) => setNewDistAddress(e.target.value)}
              placeholder="e.g. Shamshabad Road, Hyderabad"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={newDistNotes}
              onChange={(e) => setNewDistNotes(e.target.value)}
              placeholder="Payment terms, delivery timings..."
              rows={2}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAddDistModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow transition"
            >
              Save Supplier
            </button>
          </div>
        </form>
      </Modal>

      {/* Distributor Running Balance Ledger Drawer / Modal */}
      {selectedDistForLedger && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedDistForLedger(null)}
          title={`Distributor Statement: ${distLedgerData?.distributor?.name || ''}`}
          maxWidth="2xl"
        >
          {ledgerLoading ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading ledger...</div>
          ) : (
            <div className="space-y-4">
              {/* Supplier Header Box */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">Opening Balance:</span>
                  <p className="font-bold text-slate-800 text-sm mt-0.5">
                    {formatCurrency(distLedgerData?.distributor?.openingBalance)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Total Supplies:</span>
                  <p className="font-bold text-slate-800 text-sm mt-0.5">
                    {formatCurrency(distLedgerData?.distributor?.totalSuppliesAmount)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Total Paid:</span>
                  <p className="font-bold text-emerald-700 text-sm mt-0.5">
                    {formatCurrency(distLedgerData?.distributor?.totalPaymentsAmount)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Closing Outstanding:</span>
                  <p className="font-black text-rose-700 text-base mt-0.5">
                    {formatCurrency(distLedgerData?.distributor?.outstandingBalance)}
                  </p>
                </div>
              </div>

              {/* Ledger Statement Table */}
              <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3 text-right">Debit (Supply)</th>
                      <th className="py-2.5 px-3 text-right">Credit (Payment)</th>
                      <th className="py-2.5 px-3 text-right font-bold">Running Balance</th>
                      {hasRole('owner', 'admin') && <th className="py-2.5 px-2 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Opening Balance Row */}
                    <tr className="bg-slate-50 font-medium">
                      <td className="py-2 px-3 text-slate-500">-</td>
                      <td className="py-2 px-3 text-slate-700">Opening Balance Carried Forward</td>
                      <td className="py-2 px-3 text-right">-</td>
                      <td className="py-2 px-3 text-right">-</td>
                      <td className="py-2 px-3 text-right font-bold">
                        {formatCurrency(distLedgerData?.distributor?.openingBalance)}
                      </td>
                      {hasRole('owner', 'admin') && <td></td>}
                    </tr>

                    {distLedgerData?.ledger && distLedgerData.ledger.length > 0 ? (
                      distLedgerData.ledger.map((item: any) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-slate-600">{formatDate(item.date)}</td>
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-slate-900">{item.description}</p>
                            {item.reference && (
                              <p className="text-[10px] text-slate-400 font-mono">Ref: {item.reference}</p>
                            )}
                            {item.screenshotUrl && (
                              <a
                                href={item.screenshotUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] text-brand-600 hover:underline mt-0.5"
                              >
                                <span>View Receipt</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-rose-700 font-semibold">
                            {item.debitAmount > 0 ? formatCurrency(item.debitAmount) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">
                            {item.creditAmount > 0 ? formatCurrency(item.creditAmount) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-slate-900">
                            {formatCurrency(item.runningBalance)}
                          </td>
                          {hasRole('owner', 'admin') && (
                            <td className="py-2.5 px-2 text-right">
                              {item.type === 'payment' && (
                                <button
                                  onClick={() => setDeletePayId(parseInt(item.id.replace('PAY-', ''), 10))}
                                  className="text-slate-400 hover:text-rose-600"
                                  title="Reverse Payment"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No transactions recorded in this ledger yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Statement</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedDistForLedger(null)}
                  className="px-4 py-1.5 bg-brand-600 text-white rounded-xl text-xs font-bold"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Reverse Payment Modal */}
      <ReasonModal
        isOpen={deletePayId !== null}
        onClose={() => setDeletePayId(null)}
        onConfirm={handleDeletePaymentConfirm}
        title="Reverse Distributor Payment"
        description="Reversing this payment will restore the distributor's outstanding balance. A mandatory reason is recorded in the permanent audit trail."
        confirmText="Reverse Payment"
        isDanger={true}
      />

      {/* Delete Distributor Permanently Modal */}
      {deletingDistributor && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingDistributor(null)}
          title={`Delete Distributor: ${deletingDistributor.name}`}
        >
          <form onSubmit={handleDeleteDistributor} className="space-y-4">
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
              <p className="text-xs font-bold text-rose-900">
                ⚠️ Are you sure you want to permanently delete this supplier?
              </p>
              <p className="text-xs text-rose-700">
                This will permanently delete <strong>{deletingDistributor.name}</strong>, along with their supplier profile, supply purchase history, and payment records. <strong>This action cannot be undone.</strong>
              </p>
              <div className="pt-2 text-[11px] text-slate-600 space-y-0.5 border-t border-rose-200/60 mt-2">
                <p><strong>Contact Phone:</strong> {deletingDistributor.phone || 'None'}</p>
                <p><strong>Opening Balance:</strong> {formatCurrency(deletingDistributor.openingBalance)}</p>
                <p><strong>Total Purchases:</strong> {formatCurrency(deletingDistributor.totalSuppliesAmount)}</p>
                <p><strong>Total Payments Made:</strong> {formatCurrency(deletingDistributor.totalPaymentsAmount)}</p>
                <p className="text-rose-800 font-bold">
                  <strong>Current Outstanding:</strong> {formatCurrency(deletingDistributor.outstandingBalance)}
                  {deletingDistributor.outstandingBalance < 0 && ' (Advance)'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Deletion <span className="text-slate-400">(Optional / Audit)</span>
              </label>
              <input
                type="text"
                value={deleteDistReason}
                onChange={(e) => setDeleteDistReason(e.target.value)}
                placeholder="e.g. Duplicate supplier entry / Test supplier cleanup"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-rose-500"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingDistributor(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isDeletingDistributor}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingDistributor ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
