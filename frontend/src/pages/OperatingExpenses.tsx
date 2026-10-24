import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Plus,
  Calendar,
  Search,
  Trash2,
  Edit2,
  PieChart as PieIcon,
  Receipt,
  FileText,
  TrendingDown,
  Upload,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { useBusinessDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { expensesApi } from '../services/api';
import { OperatingExpense } from '../types';
import { formatCurrency, formatDate, getTodayDateString } from '../utils/format';
import { Modal } from '../components/Modal';
import { ReasonModal } from '../components/ReasonModal';
import { DailyClosingCalendar } from '../components/DailyClosingCalendar';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const OperatingExpensesPage: React.FC = () => {
  const { selectedDate } = useBusinessDate();
  const { hasRole } = useAuth();
  const { success, error } = useToast();

  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Monthly State - Calculates expenses by Month instead of Day
  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    if (selectedDate) {
      const parts = selectedDate.split('-');
      if (parts.length === 3) return parseInt(parts[1], 10);
    }
    return new Date().getMonth() + 1;
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (selectedDate) {
      const parts = selectedDate.split('-');
      if (parts.length === 3) return parseInt(parts[0], 10);
    }
    return new Date().getFullYear();
  });

  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'expenses' | 'analytics'>('expenses');
  const [monthlyData, setMonthlyData] = useState<any>(null);

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((prev) => prev - 1);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((prev) => prev + 1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  const handleCurrentMonth = () => {
    const now = new Date();
    setSelectedMonth(now.getMonth() + 1);
    setSelectedYear(now.getFullYear());
  };

  // Add Expense Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [expDate, setExpDate] = useState(selectedDate || getTodayDateString());
  const [expCategory, setExpCategory] = useState('Shop Rent');
  const [newCatName, setNewCatName] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expMethod, setExpMethod] = useState<'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Other'>('Cash');
  const [expNotes, setExpNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit / Delete State
  const [editingExp, setEditingExp] = useState<OperatingExpense | null>(null);
  const [editReason, setEditReason] = useState('');
  const [deleteExpId, setDeleteExpId] = useState<number | null>(null);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const [expRes, catRes, analysisRes] = await Promise.all([
        expensesApi.getAll({
          month: selectedMonth,
          year: selectedYear,
          category: filterCategory !== 'All' ? filterCategory : undefined,
        }),
        expensesApi.getCategories(),
        expensesApi.getMonthlyAnalysis({ month: selectedMonth, year: selectedYear }),
      ]);

      if (expRes.data.success) {
        setExpenses(expRes.data.data);
        setTotalExpenses(expRes.data.totalAmount);
      }
      if (catRes.data.success) {
        setCategories(catRes.data.data);
      }
      if (analysisRes.data.success) {
        setMonthlyData(analysisRes.data.data);
      }
    } catch {
      error('Failed to load operating expenses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [selectedMonth, selectedYear, filterCategory]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(expAmount);
    if (isNaN(amt) || amt <= 0) {
      error('Please enter a valid expense amount.');
      return;
    }
    if (!expDesc.trim()) {
      error('Expense description is required.');
      return;
    }

    try {
      setSubmitting(true);
      let receiptUrl: string | undefined = undefined;

      if (receiptFile) {
        const formData = new FormData();
        formData.append('receipt', receiptFile);
        const upRes = await expensesApi.uploadReceipt(formData);
        if (upRes.data.success) {
          receiptUrl = upRes.data.fileUrl;
        }
      }

      // If custom category typed
      let finalCategory = expCategory;
      if (expCategory === 'custom' && newCatName.trim()) {
        await expensesApi.createCategory({ name: newCatName.trim() });
        finalCategory = newCatName.trim();
      }

      const res = await expensesApi.create({
        expenseDate: expDate,
        category: finalCategory,
        description: expDesc.trim(),
        amount: amt,
        paymentMethod: expMethod,
        receiptUrl,
        notes: expNotes.trim() || undefined,
      });

      if (res.data.success) {
        success(`Recorded expense: ₹${amt.toFixed(2)} (${finalCategory})`);
        setIsAddModalOpen(false);
        setExpDesc('');
        setExpAmount('');
        setExpNotes('');
        setReceiptFile(null);
        loadExpenses();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to record expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExp) return;
    if (!editReason.trim()) {
      error('A mandatory reason is required to edit an expense.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await expensesApi.update(editingExp.id, {
        category: editingExp.category,
        description: editingExp.description,
        amount: parseFloat(String(editingExp.amount)),
        paymentMethod: editingExp.payment_method,
        reason: editReason.trim(),
      });

      if (res.data.success) {
        success('Expense updated and logged in audit trail.');
        setEditingExp(null);
        setEditReason('');
        loadExpenses();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to update expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async (reason: string) => {
    if (!deleteExpId) return;
    try {
      const res = await expensesApi.delete(deleteExpId, { reason });
      if (res.data.success) {
        success('Expense deleted and logged in audit trail.');
        setDeleteExpId(null);
        loadExpenses();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to delete expense.');
    }
  };

  const filteredExpenses = expenses.filter((e) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDesc = e.description?.toLowerCase().includes(q);
      const matchCat = e.category?.toLowerCase().includes(q);
      const matchMethod = e.payment_method?.toLowerCase().includes(q);
      const matchStaff = e.created_by_name?.toLowerCase().includes(q);
      if (!matchDesc && !matchCat && !matchMethod && !matchStaff) return false;
    }
    return true;
  });

  const displayedTotal = filteredExpenses.reduce(
    (sum, e) => sum + (parseFloat(String(e.amount)) || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Operating Expenses</h1>
          <p className="text-xs text-slate-500 mt-1">
            Calculate and manage shop maintenance, utilities, wages, and monthly overheads.
          </p>
        </div>

        <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          {/* Tab Selector: Monthly Expenses vs Category Analysis */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold justify-center">
            <button
              onClick={() => setActiveTab('expenses')}
              className={`flex-1 xs:flex-none px-3 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 ${
                activeTab === 'expenses' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Monthly Expenses</span>
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex-1 xs:flex-none px-3 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 ${
                activeTab === 'analytics' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <PieIcon className="w-3.5 h-3.5" />
              <span>Category Breakdown</span>
            </button>
          </div>

          <button
            onClick={() => {
              setExpDate(getTodayDateString());
              setIsAddModalOpen(true);
            }}
            className="w-full xs:w-auto px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-brand-600/20 transition min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Monthly Hero Banner with Month Navigator */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 text-white rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
              Operating Expenses for {MONTH_NAMES[selectedMonth - 1]?.toUpperCase()} {selectedYear}
            </span>
          </div>
          <p className="text-3xl sm:text-4xl font-black mt-2 tracking-tight text-white">
            {formatCurrency(totalExpenses)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'} recorded for the month
          </p>
        </div>

        {/* Month Navigation Controls */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-800/90 p-2 rounded-xl border border-slate-700 w-full md:w-auto justify-between sm:justify-start">
          <button
            onClick={handlePrevMonth}
            className="p-2 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition"
            title="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
            className="bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-lg border border-slate-700 outline-none cursor-pointer hover:border-slate-600 transition"
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx + 1}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="bg-slate-900 text-white text-xs font-bold px-3 py-2 rounded-lg border border-slate-700 outline-none cursor-pointer hover:border-slate-600 transition"
          >
            {[2024, 2025, 2026, 2027].map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>

          <button
            onClick={handleNextMonth}
            className="p-2 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={handleCurrentMonth}
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-lg transition ml-1 shadow-sm"
          >
            This Month
          </button>
        </div>
      </div>

      {/* KPI Cards for the Month */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-rose-50 rounded-xl text-rose-600">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Spent</span>
            <p className="text-lg font-black text-slate-900">{formatCurrency(totalExpenses)}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-sky-50 rounded-xl text-sky-600">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Entries Count</span>
            <p className="text-lg font-black text-slate-900">{expenses.length} Records</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600">
            <PieIcon className="w-5 h-5" />
          </div>
          <div className="truncate">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Top Category</span>
            <p className="text-sm font-black text-slate-900 truncate">
              {monthlyData?.categoryBreakdown?.[0]?.category || 'None'}
            </p>
            {monthlyData?.categoryBreakdown?.[0]?.amount && (
              <span className="text-[11px] text-rose-600 font-bold">
                {formatCurrency(monthlyData.categoryBreakdown[0].amount)}
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
            <Wallet className="w-5 h-5" />
          </div>
          <div className="truncate">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Primary Method</span>
            <p className="text-sm font-black text-slate-900 truncate">
              {monthlyData?.paymentMethodBreakdown?.[0]?.paymentMethod || 'None'}
            </p>
            {monthlyData?.paymentMethodBreakdown?.[0]?.amount && (
              <span className="text-[11px] text-slate-500 font-bold">
                {formatCurrency(monthlyData.paymentMethodBreakdown[0].amount)}
              </span>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'expenses' ? (
        <>
          {/* Filters & Search Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search description, category, staff..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-brand-500"
                />
              </div>

              {/* Category Dropdown (compact for mobile) */}
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-600">Category:</span>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                >
                  <option value="All">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setFilterCategory('All')}
                className={`px-3 py-1 rounded-lg font-semibold transition whitespace-nowrap ${
                  filterCategory === 'All'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All ({expenses.length})
              </button>
              {categories.map((c) => {
                const isSelected = filterCategory === c.name;
                return (
                  <button
                    key={c.id}
                    onClick={() => setFilterCategory(c.name)}
                    className={`px-3 py-1 rounded-lg font-semibold transition whitespace-nowrap ${
                      isSelected
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expenses Table for Selected Month */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Expenses for {MONTH_NAMES[selectedMonth - 1]} {selectedYear} ({filteredExpenses.length})
                </h3>
                {searchQuery && (
                  <p className="text-[11px] text-slate-400">
                    Filtered matching &ldquo;{searchQuery}&rdquo;
                  </p>
                )}
              </div>
              <span className="text-xs text-slate-600 font-bold">
                Total: <span className="text-rose-600">{formatCurrency(displayedTotal)}</span>
              </span>
            </div>

        {/* Mobile Expense Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredExpenses.length > 0 ? (
            filteredExpenses.map((e) => (
              <div key={e.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                        {formatDate(e.expense_date)}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-rose-50 font-bold text-rose-800 text-[10px]">
                        {e.category}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm mt-1">{e.description}</h4>
                    {e.notes && <p className="text-[11px] text-slate-400 mt-0.5">{e.notes}</p>}
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black text-rose-700 block">{formatCurrency(e.amount)}</span>
                    <span className="text-[10px] text-slate-500 font-medium">{e.payment_method}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <div>
                    {e.receipt_url ? (
                      <a
                        href={e.receipt_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-600 font-semibold hover:underline inline-flex items-center gap-1"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>View Receipt</span>
                      </a>
                    ) : (
                      <span>By: {e.created_by_name || 'Staff'}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingExp({ ...e });
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
                        onClick={() => setDeleteExpId(e.id)}
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
              No expenses recorded for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
            </div>
          )}
        </div>

        {/* Desktop Table (hidden below md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Payment Method</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Receipt</th>
                <th className="py-3 px-4">Recorded By</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length > 0 ? (
                filteredExpenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                        {formatDate(e.expense_date)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-1 rounded-lg bg-rose-50 font-bold text-rose-800 text-[11px]">
                        {e.category}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900">{e.description}</span>
                      {e.notes && (
                        <span className="block text-[11px] text-slate-400 mt-0.5">{e.notes}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                        {e.payment_method}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-black text-rose-700 text-sm whitespace-nowrap">
                      {formatCurrency(e.amount)}
                    </td>
                    <td className="py-3 px-4">
                      {e.receipt_url ? (
                        <a
                          href={e.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-600 font-semibold hover:underline inline-flex items-center gap-1"
                        >
                          <Receipt className="w-3.5 h-3.5" />
                          <span>View</span>
                        </a>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {e.created_by_name || 'Staff'}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setEditingExp({ ...e });
                          setEditReason('');
                        }}
                        className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                        title="Edit Expense"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {hasRole('owner', 'admin') && (
                        <button
                          onClick={() => setDeleteExpId(e.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <div className="max-w-xs mx-auto space-y-2">
                      <p className="text-sm font-semibold text-slate-600">
                        No expenses recorded for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                      </p>
                      <p className="text-xs text-slate-400">
                        {filterCategory !== 'All'
                          ? `No expenses found in category "${filterCategory}".`
                          : 'Add shop rent, electricity, maintenance or other operational expenses.'}
                      </p>
                      <button
                        onClick={() => {
                          setExpDate(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`);
                          setIsAddModalOpen(true);
                        }}
                        className="mt-3 px-4 py-1.5 bg-brand-50 text-brand-700 hover:bg-brand-100 font-bold rounded-xl text-xs transition"
                      >
                        + Add Expense for {MONTH_NAMES[selectedMonth - 1]}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      ) : (
        /* MONTHLY ANALYSIS TAB */
        <div className="space-y-6">
          {/* Monthly Grand Total Card */}
          <div className="p-6 bg-gradient-to-r from-rose-950 via-slate-900 to-slate-950 text-white rounded-2xl shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                Total Operating Expenses for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </span>
              <p className="text-3xl font-black mt-1">
                {formatCurrency(monthlyData?.totalMonthlyExpenses || totalExpenses)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Sum of all operational expenses recorded during {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </p>
            </div>
          </div>

          {/* Category Breakdown & Payment Method Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category Breakdown */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center justify-between">
                <span>Category-Wise Breakdown</span>
                <span className="text-xs text-slate-400 font-normal">
                  {monthlyData?.categoryBreakdown?.length || 0} Categories
                </span>
              </h3>
              <div className="space-y-3">
                {monthlyData?.categoryBreakdown && monthlyData.categoryBreakdown.length > 0 ? (
                  monthlyData.categoryBreakdown.map((c: any) => {
                    const totalMonthAmt = parseFloat(monthlyData.totalMonthlyExpenses) || 1;
                    const catAmt = parseFloat(c.amount) || 0;
                    const pct = Math.min(100, Math.round((catAmt / totalMonthAmt) * 100));
                    return (
                      <div key={c.category} className="p-3 bg-slate-50 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-900">{c.category}</span>
                            <span className="text-slate-400 ml-2">({c.count} records)</span>
                          </div>
                          <span className="font-black text-rose-700">{formatCurrency(c.amount)} ({pct}%)</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-rose-500 h-1.5 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No expenses recorded for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
                  </p>
                )}
              </div>
            </div>

            {/* Payment Method Breakdown */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center justify-between">
                <span>Payment Method Breakdown</span>
                <span className="text-xs text-slate-400 font-normal">
                  {monthlyData?.paymentMethodBreakdown?.length || 0} Methods
                </span>
              </h3>
              <div className="space-y-3">
                {monthlyData?.paymentMethodBreakdown && monthlyData.paymentMethodBreakdown.length > 0 ? (
                  monthlyData.paymentMethodBreakdown.map((m: any) => {
                    const totalMonthAmt = parseFloat(monthlyData.totalMonthlyExpenses) || 1;
                    const methodAmt = parseFloat(m.amount) || 0;
                    const pct = Math.min(100, Math.round((methodAmt / totalMonthAmt) * 100));
                    return (
                      <div key={m.paymentMethod} className="p-3 bg-slate-50 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-900">{m.paymentMethod}</span>
                            <span className="text-slate-400 ml-2">({m.count} payments)</span>
                          </div>
                          <span className="font-black text-slate-900">{formatCurrency(m.amount)} ({pct}%)</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-slate-800 h-1.5 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No payment data recorded for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Record Operating Expense">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Date</label>
              <DailyClosingCalendar
                selectedDate={expDate}
                onSelectDate={setExpDate}
                className="w-full"
                showStatusBadge={false}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Category</label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value="custom">+ Add Custom Category</option>
              </select>
            </div>
          </div>

          {expCategory === 'custom' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Category Name</label>
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Pest Control"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Description <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              placeholder="e.g. Deep freezer coolant gas refill"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                inputMode="decimal"
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                placeholder="e.g. 1500"
                className="w-full px-3.5 py-2 text-base font-bold border border-slate-300 rounded-xl outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={expMethod}
                onChange={(e: any) => setExpMethod(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI / GPay / PhonePe</option>
                <option value="Bank Transfer">Bank Transfer / NEFT</option>
                <option value="Card">Card</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Upload Bill / Receipt</label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setReceiptFile(e.target.files ? e.target.files[0] : null)}
              className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
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
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow transition disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Record Expense'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Expense Modal */}
      {editingExp && (
        <Modal isOpen={true} onClose={() => setEditingExp(null)} title="Edit Operating Expense">
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
              <input
                type="text"
                value={editingExp.description}
                onChange={(e) => setEditingExp({ ...editingExp, description: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={editingExp.amount}
                  onChange={(e) => setEditingExp({ ...editingExp, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                <input
                  type="text"
                  value={editingExp.category}
                  onChange={(e) => setEditingExp({ ...editingExp, category: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mandatory Reason for Change <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g. Corrected invoice tax amount"
                rows={2}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none resize-none"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingExp(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow transition"
              >
                {submitting ? 'Updating...' : 'Save & Log Audit'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Expense Modal */}
      <ReasonModal
        isOpen={deleteExpId !== null}
        onClose={() => setDeleteExpId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Operating Expense"
        description="Deleting this expense will recalculate the monthly expense total and gross profit. Reason is permanently logged in the audit trail."
        confirmText="Delete Expense"
        isDanger={true}
      />
    </div>
  );
};
