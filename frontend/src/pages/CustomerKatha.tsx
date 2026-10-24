import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Search,
  Wallet,
  Phone,
  Calendar,
  AlertTriangle,
  Printer,
  Trash2,
  ExternalLink,
  Receipt,
  ArrowRight,
} from 'lucide-react';
import { useBusinessDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { kathaApi, distributorApi } from '../services/api';
import { Customer } from '../types';
import { formatCurrency, formatKg, formatDate } from '../utils/format';
import { Modal } from '../components/Modal';
import { ReasonModal } from '../components/ReasonModal';
import { DailyClosingCalendar } from '../components/DailyClosingCalendar';

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    stroke="currentColor"
    strokeWidth="0"
    fill="currentColor"
    className={className}
  >
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm0 18.06c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.107 8.107 0 0 1-1.25-4.29c0-4.51 3.67-8.18 8.18-8.18 2.19 0 4.24.85 5.79 2.4 1.54 1.55 2.4 3.6 2.4 5.79 0 4.51-3.67 8.18-8.18 8.18zm4.48-6.13c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.53.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.12-.22-.19-.47-.31z" />
  </svg>
);

export const CustomerKathaPage: React.FC = () => {
  const { selectedDate } = useBusinessDate();
  const { hasRole } = useAuth();
  const { success, error, warning } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'has_balance' | 'settled'>('all');

  // Add Customer Modal
  const [isAddCustModalOpen, setIsAddCustModalOpen] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custOpeningBal, setCustOpeningBal] = useState('');
  const [custNotes, setCustNotes] = useState('');
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  // Record Payment Modal
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payCustomerId, setPayCustomerId] = useState('');
  const [payDate, setPayDate] = useState(selectedDate);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'Cash' | 'UPI' | 'Card' | 'Other'>('Cash');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [submittingPay, setSubmittingPay] = useState(false);

  // Customer Ledger Statement Modal
  const [selectedCustId, setSelectedCustId] = useState<number | null>(null);
  const [custLedgerData, setCustLedgerData] = useState<any>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Reverse Payment State
  const [deletePayId, setDeletePayId] = useState<number | null>(null);

  // Delete Customer State & Modal
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [deleteCustReason, setDeleteCustReason] = useState('');
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await kathaApi.getCustomers({ balanceFilter });
      if (res.data.success) {
        setCustomers(res.data.data);
      }
    } catch {
      error('Failed to load customer Katha records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [balanceFilter]);

  const openLedger = async (id: number) => {
    setSelectedCustId(id);
    try {
      setLedgerLoading(true);
      const res = await kathaApi.getCustomer(id);
      if (res.data.success) {
        setCustLedgerData(res.data.data);
      }
    } catch {
      error('Failed to load customer statement.');
    } finally {
      setLedgerLoading(false);
    }
  };

  const sendWhatsAppLedger = (
    customerName: string,
    rawPhone: string | undefined | null,
    openingBal: number | string,
    totalPurchases: number | string,
    totalPayments: number | string,
    outstandingBal: number | string,
    transactions?: any[]
  ) => {
    let phone = rawPhone ? rawPhone.trim() : '';

    if (!phone) {
      const entered = window.prompt(
        `Enter WhatsApp mobile number for "${customerName}" (10 digits):`,
        ''
      );
      if (!entered) return;
      phone = entered.trim();
    }

    const digits = phone.replace(/\D/g, '');
    let fullPhone = digits;
    if (digits.length === 10) {
      fullPhone = '91' + digits;
    } else if (digits.length === 12 && digits.startsWith('91')) {
      fullPhone = digits;
    } else if (digits.length < 10) {
      error('Please enter a valid 10-digit mobile number.');
      return;
    }

    const numOpening = parseFloat(String(openingBal)) || 0;
    const numPurchases = parseFloat(String(totalPurchases)) || 0;
    const numPayments = parseFloat(String(totalPayments)) || 0;
    const numDue = parseFloat(String(outstandingBal)) || 0;

    let msg = `*REDDY CHICKEN AND MUTTON CENTER*\n`;
    msg += `📍 Old Alwal, Secunderabad\n`;
    msg += `📞 WhatsApp / GPay / PhonePe: *7989856610*\n`;
    msg += `────────────────────────────\n`;
    msg += `📋 *CUSTOMER KATHA STATEMENT*\n\n`;
    msg += `👤 *Customer:* ${customerName}\n`;
    if (phone) msg += `📱 *Customer Mobile:* ${phone}\n`;
    msg += `📅 *Date:* ${formatDate(new Date())}\n\n`;
    msg += `*ACCOUNT SUMMARY:*\n`;
    msg += `• Opening Balance: ${formatCurrency(numOpening)}\n`;
    msg += `• Total Purchases: ${formatCurrency(numPurchases)}\n`;
    msg += `• Total Payments: ${formatCurrency(numPayments)}\n`;
    msg += `────────────────────────────\n`;

    if (numDue > 0) {
      msg += `🚨 *TOTAL AMOUNT DUE: ${formatCurrency(numDue)}*\n`;
      msg += `────────────────────────────\n\n`;
      msg += `Kindly clear the balance at your earliest convenience.\n`;
      msg += `💳 *Pay via UPI / GPay / PhonePe to:* *7989856610*\n\n`;
    } else if (numDue < 0) {
      msg += `✅ *ADVANCE CREDIT: ${formatCurrency(Math.abs(numDue))}*\n`;
      msg += `────────────────────────────\n\n`;
    } else {
      msg += `✅ *ACCOUNT FULLY SETTLED (Balance: ₹0.00)*\n`;
      msg += `────────────────────────────\n\n`;
    }

    if (transactions && transactions.length > 0) {
      msg += `*RECENT TRANSACTIONS:*\n`;
      const recent = transactions.slice(-5);
      recent.forEach((item) => {
        const dt = formatDate(item.date);
        if (item.debitAmount > 0) {
          msg += `• ${dt}: Purchase - ${formatCurrency(item.debitAmount)}\n`;
        } else if (item.creditAmount > 0) {
          msg += `• ${dt}: Payment Received - ${formatCurrency(item.creditAmount)}\n`;
        }
      });
      msg += `────────────────────────────\n\n`;
    }

    msg += `For any billing queries, please contact:\n`;
    msg += `📞 *7989856610*\n\n`;
    msg += `Thank you for your business!\n`;
    msg += `*Reddy Chicken and Mutton Center*`;

    const url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    success(`Opening WhatsApp to send statement to ${customerName} (${phone})`);
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      error('Customer name is required.');
      return;
    }

    try {
      const res = await kathaApi.createCustomer({
        name: custName.trim(),
        phone: custPhone.trim() || undefined,
        address: custAddress.trim() || undefined,
        openingBalance: parseFloat(custOpeningBal) || 0,
        notes: custNotes.trim() || undefined,
      });

      if (res.data.success) {
        if (res.data.duplicateWarning) {
          warning(res.data.duplicateWarning);
        } else {
          success(`Customer account created for "${custName}".`);
        }
        setIsAddCustModalOpen(false);
        setCustName('');
        setCustPhone('');
        setCustAddress('');
        setCustOpeningBal('');
        setCustNotes('');
        setDupWarning(null);
        loadCustomers();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to create customer.');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(payAmount);
    if (!payCustomerId || isNaN(amt) || amt <= 0) {
      error('Please select customer and valid payment amount.');
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

      const res = await kathaApi.createPayment({
        customerId: parseInt(payCustomerId, 10),
        paymentDate: payDate,
        amount: amt,
        paymentMethod: payMethod,
        transactionReference: payRef.trim() || undefined,
        screenshotUrl,
        notes: payNotes.trim() || undefined,
      });

      if (res.data.success) {
        success(`Recorded payment of ${formatCurrency(amt)} received from customer.`);
        setIsPayModalOpen(false);
        setPayAmount('');
        setPayRef('');
        setPayNotes('');
        setScreenshotFile(null);
        loadCustomers();
        if (selectedCustId === parseInt(payCustomerId, 10)) {
          openLedger(selectedCustId);
        }
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to record customer payment.');
    } finally {
      setSubmittingPay(false);
    }
  };

  const handleDeletePaymentConfirm = async (reason: string) => {
    if (!deletePayId) return;
    try {
      const res = await kathaApi.deletePayment(deletePayId, { reason });
      if (res.data.success) {
        success('Customer payment reversed and Katha ledger balance restored.');
        setDeletePayId(null);
        loadCustomers();
        if (selectedCustId) openLedger(selectedCustId);
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to reverse payment.');
    }
  };

  const handleDeleteCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingCustomer) return;

    try {
      setIsDeletingCustomer(true);
      const res = await kathaApi.deleteCustomer(deletingCustomer.id, {
        reason: deleteCustReason.trim() || 'Customer permanently deleted by user',
      });

      if (res.data.success) {
        success(`Customer "${deletingCustomer.name}" permanently deleted.`);
        setDeletingCustomer(null);
        setDeleteCustReason('');
        loadCustomers();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to delete customer.');
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  const activeCustForPayment = customers.find((c) => c.id === parseInt(payCustomerId, 10));

  const filteredCustomers = customers.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.toLowerCase().includes(search.toLowerCase())
  );

  const totalOutstandingAll = customers.reduce((sum, c) => sum + c.outstandingBalance, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Customer Katha / Credit Accounts</h1>
          <p className="text-xs text-slate-500 mt-1">
            Track credit sales, partial customer payments, and debit/credit account statements.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
          <button
            onClick={() => setIsAddCustModalOpen(true)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition min-h-[40px]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>

          <button
            onClick={() => {
              setPayDate(selectedDate);
              setIsPayModalOpen(true);
            }}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-brand-600/20 transition min-h-[40px]"
          >
            <Wallet className="w-4 h-4" />
            <span>Receive Payment</span>
          </button>
        </div>
      </div>

      {/* Katha Balance Summary Card */}
      <div className="bg-gradient-to-r from-orange-950 via-slate-900 to-slate-950 text-white p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
            Total Customer Credit Outstanding (Katha)
          </span>
          <p className="text-3xl font-black mt-1 text-white">{formatCurrency(totalOutstandingAll)}</p>
          <p className="text-xs text-slate-400 mt-0.5">Total uncollected receivables from customers</p>
        </div>

        <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 w-full sm:w-auto">
          {/* Filter Pill */}
          <div className="flex bg-slate-800 p-1 rounded-xl text-xs justify-center">
            <button
              onClick={() => setBalanceFilter('all')}
              className={`flex-1 xs:flex-none px-3 py-1.5 rounded-lg font-medium transition ${
                balanceFilter === 'all' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setBalanceFilter('has_balance')}
              className={`flex-1 xs:flex-none px-3 py-1.5 rounded-lg font-medium transition ${
                balanceFilter === 'has_balance' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Has Debt
            </button>
            <button
              onClick={() => setBalanceFilter('settled')}
              className={`flex-1 xs:flex-none px-3 py-1.5 rounded-lg font-medium transition ${
                balanceFilter === 'settled' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Settled
            </button>
          </div>

          <div className="relative flex-1 xs:flex-initial">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white focus:ring-2 focus:ring-brand-500 outline-none w-full sm:w-52"
            />
          </div>
        </div>
      </div>

      {/* Customer List: Desktop Table + Mobile Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Registered Katha Accounts</h3>
          <span className="text-xs text-slate-400">({filteredCustomers.length} accounts)</span>
        </div>

        {/* Mobile Cards (visible below md) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredCustomers.length > 0 ? (
            filteredCustomers.map((c) => (
              <div key={c.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{c.name}</h4>
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="text-xs text-brand-600 font-mono flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        <span>{c.phone}</span>
                      </a>
                    ) : (
                      <p className="text-[11px] text-slate-400 mt-0.5">{c.address || 'Retail customer'}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Outstanding</span>
                    <span
                      className={`text-base font-black ${
                        c.outstandingBalance > 0
                          ? 'text-orange-700'
                          : c.outstandingBalance < 0
                          ? 'text-blue-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {formatCurrency(c.outstandingBalance)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 px-2.5 bg-slate-50 rounded-xl text-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Opening</span>
                    <span className="font-semibold text-slate-700 text-[11px]">{formatCurrency(c.openingBalance)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Credit</span>
                    <span className="font-semibold text-slate-900 text-[11px]">{formatCurrency(c.totalCreditPurchases)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Paid</span>
                    <span className="font-semibold text-emerald-700 text-[11px]">{formatCurrency(c.totalPaymentsReceived)}</span>
                  </div>
                </div>

                {c.lastTransactionDate && (
                  <p className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>Last activity: {formatDate(c.lastTransactionDate)}</span>
                  </p>
                )}

                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPayCustomerId(String(c.id));
                      setPayDate(selectedDate);
                      setIsPayModalOpen(true);
                    }}
                    className="py-2 px-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1 min-h-[38px] transition"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Receive</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openLedger(c.id)}
                    className="py-2 px-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1 min-h-[38px] transition"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Ledger</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      sendWhatsAppLedger(
                        c.name,
                        c.phone,
                        c.openingBalance,
                        c.totalCreditPurchases,
                        c.totalPaymentsReceived,
                        c.outstandingBalance
                      )
                    }
                    className="py-2 px-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 min-h-[38px] shadow-sm transition"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDeletingCustomer(c);
                      setDeleteCustReason('');
                    }}
                    className="py-2 px-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1 min-h-[38px] transition border border-rose-200"
                    title="Delete Customer Permanently"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              No customer Katha records found matching criteria.
            </div>
          )}
        </div>

        {/* Desktop Table (hidden below md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-3 px-4">Customer Name</th>
                <th className="py-3 px-4">Mobile Number</th>
                <th className="py-3 px-4">Opening Balance</th>
                <th className="py-3 px-4">Total Credit Purchases</th>
                <th className="py-3 px-4">Total Payments</th>
                <th className="py-3 px-4">Current Outstanding</th>
                <th className="py-3 px-4">Last Activity</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900 text-sm">{c.name}</p>
                      <p className="text-[11px] text-slate-400 truncate max-w-xs">{c.address || 'Retail customer'}</p>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">{c.phone || '-'}</td>
                    <td className="py-3.5 px-4 text-slate-600">{formatCurrency(c.openingBalance)}</td>
                    <td className="py-3.5 px-4 text-slate-900 font-semibold">
                      {formatCurrency(c.totalCreditPurchases)}
                    </td>
                    <td className="py-3.5 px-4 text-emerald-700 font-semibold">
                      {formatCurrency(c.totalPaymentsReceived)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-sm font-black ${
                          c.outstandingBalance > 0
                            ? 'text-orange-700'
                            : c.outstandingBalance < 0
                            ? 'text-blue-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatCurrency(c.outstandingBalance)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {c.lastTransactionDate ? formatDate(c.lastTransactionDate) : '-'}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => {
                          setPayCustomerId(String(c.id));
                          setPayDate(selectedDate);
                          setIsPayModalOpen(true);
                        }}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg transition"
                      >
                        Receive
                      </button>

                      <button
                        onClick={() => openLedger(c.id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition"
                      >
                        Ledger
                      </button>

                      <button
                        onClick={() =>
                          sendWhatsAppLedger(
                            c.name,
                            c.phone,
                            c.openingBalance,
                            c.totalCreditPurchases,
                            c.totalPaymentsReceived,
                            c.outstandingBalance
                          )
                        }
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition inline-flex items-center gap-1 shadow-sm"
                        title={`Send Katha Statement to ${c.name} on WhatsApp`}
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </button>

                      <button
                        onClick={() => {
                          setDeletingCustomer(c);
                          setDeleteCustReason('');
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition inline-flex items-center align-middle"
                        title={`Delete customer "${c.name}" permanently`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    No customer Katha records found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Customer Payment Modal */}
      <Modal isOpen={isPayModalOpen} onClose={() => setIsPayModalOpen(false)} title="Record Customer Katha Payment">
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Customer <span className="text-rose-500">*</span>
            </label>
            <select
              value={payCustomerId}
              onChange={(e) => setPayCustomerId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl outline-none"
              required
            >
              <option value="">-- Choose Customer --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — Debt: {formatCurrency(c.outstandingBalance)}
                </option>
              ))}
            </select>
          </div>

          {activeCustForPayment && (
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between text-xs">
              <span className="text-orange-900 font-medium">Current Katha Balance:</span>
              <span className="font-bold text-orange-950 text-sm">
                {formatCurrency(activeCustForPayment.outstandingBalance)}
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
                <option value="Cash">Cash Counter</option>
                <option value="UPI">UPI / GPay / PhonePe</option>
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
              placeholder="e.g. 500"
              className="w-full px-3.5 py-2.5 text-base font-bold border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">UPI Ref / Notes</label>
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="e.g. UPI-12938472"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Upload Receipt</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setScreenshotFile(e.target.files ? e.target.files[0] : null)}
                className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
              />
            </div>
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

      {/* Add Customer Modal */}
      <Modal isOpen={isAddCustModalOpen} onClose={() => setIsAddCustModalOpen(false)} title="Register Customer for Katha">
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Customer Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              placeholder="e.g. Ramesh Kumar (Hotel Green Park)"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mobile Number (Optional)</label>
              <input
                type="tel"
                inputMode="tel"
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Opening Debt Balance (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={custOpeningBal}
                onChange={(e) => setCustOpeningBal(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Address / Landmark</label>
            <input
              type="text"
              value={custAddress}
              onChange={(e) => setCustAddress(e.target.value)}
              placeholder="e.g. Shop #12, Market Complex"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea
              value={custNotes}
              onChange={(e) => setCustNotes(e.target.value)}
              placeholder="Weekly hotel order, credit limit..."
              rows={2}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAddCustModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow transition"
            >
              Save Customer
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer Katha Statement / Ledger Modal */}
      {selectedCustId && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedCustId(null)}
          title={`Customer Katha Statement: ${custLedgerData?.customer?.name || ''}`}
          maxWidth="2xl"
        >
          {ledgerLoading ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading ledger statement...</div>
          ) : (
            <div className="space-y-4">
              {/* Account Header */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">Mobile Phone:</span>
                  <p className="font-bold text-slate-800 text-sm mt-0.5">{custLedgerData?.customer?.phone || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Opening Balance:</span>
                  <p className="font-bold text-slate-800 text-sm mt-0.5">
                    {formatCurrency(custLedgerData?.customer?.openingBalance)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Address:</span>
                  <p className="font-medium text-slate-700 text-xs mt-0.5 truncate">
                    {custLedgerData?.customer?.address || '-'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Outstanding Debt:</span>
                  <p className="font-black text-orange-700 text-base mt-0.5">
                    {formatCurrency(custLedgerData?.customer?.outstandingBalance)}
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
                      <th className="py-2.5 px-3 text-right">Debit (Purchase)</th>
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
                        {formatCurrency(custLedgerData?.customer?.openingBalance)}
                      </td>
                      {hasRole('owner', 'admin') && <td></td>}
                    </tr>

                    {custLedgerData?.ledger && custLedgerData.ledger.length > 0 ? (
                      custLedgerData.ledger.map((item: any) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-slate-600">{formatDate(item.date)}</td>
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-slate-900">{item.description}</p>
                            {item.billNumber && (
                              <p className="text-[10px] text-blue-600 font-mono">Bill #{item.billNumber}</p>
                            )}
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
                                <span>Receipt</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-orange-700 font-semibold">
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
                              {item.id.startsWith('PAY-') && (
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
                          No transactions found in customer ledger.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Katha Statement</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      sendWhatsAppLedger(
                        custLedgerData?.customer?.name || '',
                        custLedgerData?.customer?.phone || '',
                        custLedgerData?.customer?.openingBalance || 0,
                        custLedgerData?.customer?.totalCreditPurchases || 0,
                        custLedgerData?.customer?.totalPaymentsReceived || 0,
                        custLedgerData?.customer?.outstandingBalance || 0,
                        custLedgerData?.ledger || []
                      )
                    }
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                    title="Send statement directly to customer on WhatsApp"
                  >
                    <WhatsAppIcon className="w-3.5 h-3.5" />
                    <span>Send on WhatsApp</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedCustId(null)}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition"
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
        title="Reverse Customer Payment"
        description="Reversing this payment will restore the customer's outstanding balance. Reason will be permanently recorded in the audit trail."
        confirmText="Reverse Payment"
        isDanger={true}
      />

      {/* Delete Customer Permanently Modal */}
      {deletingCustomer && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingCustomer(null)}
          title={`Delete Customer: ${deletingCustomer.name}`}
        >
          <form onSubmit={handleDeleteCustomer} className="space-y-4">
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
              <p className="text-xs font-bold text-rose-900">
                ⚠️ Are you sure you want to permanently delete this customer?
              </p>
              <p className="text-xs text-rose-700">
                This will permanently delete <strong>{deletingCustomer.name}</strong>, along with their Katha account,
                credit bills, and payment records. <strong>This action cannot be undone.</strong>
              </p>
              <div className="pt-2 text-[11px] text-slate-600 space-y-0.5 border-t border-rose-200/60 mt-2">
                <p><strong>Mobile:</strong> {deletingCustomer.phone || 'None'}</p>
                <p><strong>Opening Balance:</strong> {formatCurrency(deletingCustomer.openingBalance)}</p>
                <p><strong>Credit Purchases:</strong> {formatCurrency(deletingCustomer.totalCreditPurchases)}</p>
                <p><strong>Payments Received:</strong> {formatCurrency(deletingCustomer.totalPaymentsReceived)}</p>
                <p className="text-rose-800 font-bold">
                  <strong>Current Outstanding Debt:</strong> {formatCurrency(deletingCustomer.outstandingBalance)}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Deletion <span className="text-slate-400">(Optional / Audit)</span>
              </label>
              <input
                type="text"
                value={deleteCustReason}
                onChange={(e) => setDeleteCustReason(e.target.value)}
                placeholder="e.g. Duplicate account / Test customer cleanup"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-rose-500"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCustomer(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isDeletingCustomer}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingCustomer ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
