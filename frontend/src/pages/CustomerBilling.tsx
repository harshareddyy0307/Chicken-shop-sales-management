import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Plus,
  Search,
  Calendar,
  Wallet,
  Printer,
  CheckCircle2,
  Clock,
  ArrowRight,
  Edit2,
  User,
  Scale,
  Trash2,
  ShoppingBag,
  Tag,
} from 'lucide-react';
import { useBusinessDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { kathaApi } from '../services/api';
import { Customer, CustomerBill, BillItem } from '../types';
import { formatCurrency, formatKg, formatDate } from '../utils/format';
import { Modal } from '../components/Modal';
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

// 7 Products requested: Skinless, Dressed, Boneless, Liver, Eggs, Natukodi, Masala
export const AVAILABLE_PRODUCTS = [
  {
    id: 'skinless',
    name: 'Skinless',
    label: 'Skinless Chicken',
    unit: 'kg' as const,
    defaultRate: 260,
    icon: '🍗',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    placeholder: '1.50',
    step: '0.01',
  },
  {
    id: 'dressed',
    name: 'Dressed',
    label: 'Dressed (With Skin)',
    unit: 'kg' as const,
    defaultRate: 220,
    icon: '🍗',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    placeholder: '1.80',
    step: '0.01',
  },
  {
    id: 'boneless',
    name: 'Boneless',
    label: 'Boneless Chicken',
    unit: 'kg' as const,
    defaultRate: 360,
    icon: '🥩',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
    placeholder: '0.75',
    step: '0.01',
  },
  {
    id: 'liver',
    name: 'Liver',
    label: 'Chicken Liver',
    unit: 'kg' as const,
    defaultRate: 200,
    icon: '🫀',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    placeholder: '0.50',
    step: '0.01',
  },
  {
    id: 'eggs',
    name: 'Eggs',
    label: 'Fresh Eggs',
    unit: 'pcs' as const,
    defaultRate: 7,
    icon: '🥚',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    placeholder: '6',
    step: '1',
  },
  {
    id: 'natukodi',
    name: 'Natukodi',
    label: 'Natukodi (Country Bird)',
    unit: 'kg' as const,
    defaultRate: 450,
    icon: '🐓',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-200',
    placeholder: '1.25',
    step: '0.01',
  },
  {
    id: 'masala',
    name: 'Masala',
    label: 'Chicken Masala',
    unit: 'pkt' as const,
    defaultRate: 20,
    icon: '🧂',
    badgeClass: 'bg-red-50 text-red-800 border-red-200',
    placeholder: '1',
    step: '1',
  },
];

export interface BillItemRow {
  rowId: string;
  name: string;
  unit: 'kg' | 'pcs' | 'pkt';
  quantity: string;
  rate: string;
}

export const CustomerBillingPage: React.FC = () => {
  const { selectedDate, setSelectedDate } = useBusinessDate();
  const { hasRole } = useAuth();
  const { success, error } = useToast();

  const [bills, setBills] = useState<CustomerBill[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');

  // Customer & Bill Details
  const [customerId, setCustomerId] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [billDate, setBillDate] = useState(selectedDate);
  const [description, setDescription] = useState('');

  // Multi-item Billing Line Items
  const [billItems, setBillItems] = useState<BillItemRow[]>([
    { rowId: 'row-1', name: 'Skinless', unit: 'kg', quantity: '', rate: '260' },
  ]);

  // Payment Options
  const [paymentType, setPaymentType] = useState<'Pay Now' | 'Pay Later' | 'Partial'>('Pay Now');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [submitting, setSubmitting] = useState(false);

  // Success Receipt Modal
  const [recentGeneratedBill, setRecentGeneratedBill] = useState<CustomerBill | null>(null);

  // Edit Bill Modal
  const [editingBill, setEditingBill] = useState<CustomerBill | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editReason, setEditReason] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete Bill State & Modal
  const [deletingBill, setDeletingBill] = useState<CustomerBill | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [custRes, billRes] = await Promise.all([
        kathaApi.getCustomers(),
        kathaApi.getBills({ date: selectedDate, paymentStatus: statusFilter }),
      ]);

      if (custRes.data.success) {
        setCustomers(custRes.data.data);
      }
      if (billRes.data.success) {
        setBills(billRes.data.data);
      }
    } catch {
      error('Failed to load billing records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setBillDate(selectedDate);
  }, [selectedDate, statusFilter]);

  // Handle Quick Add or Switch Item
  const handleToggleOrAddItem = (prod: (typeof AVAILABLE_PRODUCTS)[0]) => {
    setBillItems((prev) => {
      const existingIdx = prev.findIndex((it) => it.name === prod.name);
      if (existingIdx >= 0) {
        return prev;
      }
      // If there's only 1 row and it is completely empty, replace it with this selected product
      if (prev.length === 1 && (!prev[0].quantity || prev[0].quantity === '0')) {
        return [
          {
            rowId: `item-${Date.now()}`,
            name: prod.name,
            unit: prod.unit,
            quantity: '',
            rate: String(prod.defaultRate),
          },
        ];
      }
      // Otherwise append as a new line item
      return [
        ...prev,
        {
          rowId: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          name: prod.name,
          unit: prod.unit,
          quantity: '',
          rate: String(prod.defaultRate),
        },
      ];
    });
  };

  const handleUpdateItem = (index: number, field: 'name' | 'quantity' | 'rate', value: string) => {
    setBillItems((prev) => {
      const updated = [...prev];
      const curr = { ...updated[index] };
      if (field === 'name') {
        const prod = AVAILABLE_PRODUCTS.find((p) => p.name === value);
        curr.name = value;
        if (prod) {
          curr.unit = prod.unit;
          curr.rate = String(prod.defaultRate);
        }
      } else if (field === 'quantity') {
        curr.quantity = value;
      } else if (field === 'rate') {
        curr.rate = value;
      }
      updated[index] = curr;
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setBillItems((prev) => {
      if (prev.length <= 1) {
        return [
          { rowId: `item-${Date.now()}`, name: 'Skinless', unit: 'kg', quantity: '', rate: '260' },
        ];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleAddNewItem = () => {
    const unusedProd =
      AVAILABLE_PRODUCTS.find((p) => !billItems.some((bi) => bi.name === p.name)) ||
      AVAILABLE_PRODUCTS[0];
    setBillItems((prev) => [
      ...prev,
      {
        rowId: `item-${Date.now()}`,
        name: unusedProd.name,
        unit: unusedProd.unit,
        quantity: '',
        rate: String(unusedProd.defaultRate),
      },
    ]);
  };

  // Calculations
  const parsedValidItems: BillItem[] = billItems
    .map((it) => {
      const q = parseFloat(it.quantity) || 0;
      const r = parseFloat(it.rate) || 0;
      return {
        name: it.name,
        unit: it.unit,
        quantity: q,
        rate: r,
        amount: q * r,
      };
    })
    .filter((it) => it.quantity > 0);

  const totalBillAmount = parsedValidItems.reduce((acc, curr) => acc + curr.amount, 0);
  const totalMeatWeightKg = parsedValidItems
    .filter((it) => it.unit === 'kg' || ['Skinless', 'Dressed', 'Boneless', 'Liver', 'Natukodi'].includes(it.name))
    .reduce((acc, curr) => acc + curr.quantity, 0);
  const totalEggsCount = parsedValidItems
    .filter((it) => it.name === 'Eggs')
    .reduce((acc, curr) => acc + curr.quantity, 0);
  const totalMasalaPackets = parsedValidItems
    .filter((it) => it.name === 'Masala')
    .reduce((acc, curr) => acc + curr.quantity, 0);

  const selectedCustomerObj = customers.find((c) => c.id === parseInt(customerId, 10));

  const sendWhatsAppBill = (billObj?: any) => {
    const custName =
      billObj?.customer_name ||
      (selectedCustomerObj ? selectedCustomerObj.name : 'Walk-in Customer');
    let phone =
      billObj?.customer_phone ||
      customerPhone ||
      (selectedCustomerObj?.phone || '');
    if (!phone) {
      const entered = window.prompt(
        `Enter WhatsApp mobile number for "${custName}" (10 digits):`,
        ''
      );
      if (!entered) return;
      phone = entered.trim();
    }
    const digits = phone.replace(/\D/g, '');
    let fullPhone = digits;
    if (digits.length === 10) fullPhone = '91' + digits;
    else if (digits.length === 12 && digits.startsWith('91')) fullPhone = digits;
    else if (digits.length < 10) {
      error('Please enter a valid 10-digit mobile number.');
      return;
    }

    const billNo = billObj ? billObj.bill_number : (recentGeneratedBill?.bill_number || 'RECEIPT');
    const bDate = billObj ? formatDate(billObj.bill_date) : formatDate(billDate);
    const totalAmt = billObj ? formatCurrency(billObj.total_amount) : formatCurrency(totalBillAmount);
    const payStatus = billObj ? billObj.payment_status : paymentType;

    // Item details list for WhatsApp
    let itemsForMsg: any[] = [];
    if (billObj && billObj.items) {
      itemsForMsg = typeof billObj.items === 'string' ? JSON.parse(billObj.items) : billObj.items;
    } else if (parsedValidItems.length > 0) {
      itemsForMsg = parsedValidItems;
    } else if (billObj) {
      itemsForMsg = [
        {
          name: 'Chicken Fresh Cut',
          quantity: billObj.weight_kg,
          unit: 'kg',
          rate: billObj.price_per_kg,
          amount: billObj.total_amount,
        },
      ];
    }

    let msg = `*REDDY CHICKEN AND MUTTON CENTER*\n`;
    msg += `📍 Old Alwal, Secunderabad\n`;
    msg += `📞 WhatsApp / GPay / PhonePe: *7989856610*\n`;
    msg += `────────────────────────────\n`;
    msg += `🧾 *BILL RECEIPT #${billNo}*\n\n`;
    msg += `👤 *Customer:* ${custName}\n`;
    if (phone) msg += `📱 *Customer Mobile:* ${phone}\n`;
    msg += `📅 *Date:* ${bDate}\n\n`;
    msg += `*ITEM DETAILS:*\n`;
    if (itemsForMsg.length > 0) {
      itemsForMsg.forEach((it) => {
        const qFormatted = it.unit === 'kg' ? `${Number(it.quantity).toFixed(2)} kg` : `${it.quantity} ${it.unit}`;
        msg += `• ${it.name}: ${qFormatted} @ ₹${it.rate} = ₹${Number(it.amount).toFixed(2)}\n`;
      });
    } else {
      msg += `• Chicken Fresh Cut: ${formatKg(billObj?.weight_kg || 0)} @ ${formatCurrency(billObj?.price_per_kg || 0)}\n`;
    }
    msg += `────────────────────────────\n`;
    msg += `💰 *TOTAL AMOUNT: ${totalAmt}*\n`;
    msg += `💳 *Payment Status:* ${payStatus} (${billObj?.payment_method || paymentMethod})\n`;
    msg += `────────────────────────────\n\n`;
    msg += `For any inquiries, contact: *7989856610*\n\n`;
    msg += `Thank you for your visit!\n`;
    msg += `*Reddy Chicken and Mutton Center*`;

    const url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    success(`Opening WhatsApp to send bill to ${custName} (${phone})`);
  };

  const handleBillSubmit = async (e: React.FormEvent, sendWhatsApp: boolean = false) => {
    e.preventDefault();
    if (parsedValidItems.length === 0 || totalBillAmount <= 0) {
      error('Please enter a valid quantity and price for at least one item.');
      return;
    }

    if (paymentType === 'Pay Later' && !customerId) {
      error('Selecting an identified customer is mandatory for Pay Later / Credit bills.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await kathaApi.createBill({
        customerId: customerId ? parseInt(customerId, 10) : undefined,
        billDate,
        paymentType,
        paidAmount: paymentType === 'Partial' ? parseFloat(paidAmount) || 0 : undefined,
        paymentMethod: paymentType !== 'Pay Later' ? paymentMethod : undefined,
        description: description.trim() || undefined,
        items: parsedValidItems,
      });

      if (res.data.success) {
        const created = res.data.data;
        const enhancedBill: CustomerBill = {
          ...created,
          customer_name: selectedCustomerObj?.name || 'Walk-in Retail Customer',
          customer_phone: customerPhone || selectedCustomerObj?.phone || '',
          items: parsedValidItems,
        };
        success(`Generated Bill #${created.bill_number} for ${formatCurrency(created.total_amount)}!`);
        setRecentGeneratedBill(enhancedBill);

        if (sendWhatsApp) {
          sendWhatsAppBill(enhancedBill);
        }

        // Reset items form
        setBillItems([
          { rowId: `item-${Date.now()}`, name: 'Skinless', unit: 'kg', quantity: '', rate: '260' },
        ]);
        setDescription('');
        setPaidAmount('');
        if (!customerId) {
          setCustomerPhone('');
        }
        loadData();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to generate bill.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditBillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBill) return;
    if (!editReason.trim()) {
      error('A mandatory reason is required to edit a bill.');
      return;
    }

    try {
      setSavingEdit(true);
      const res = await kathaApi.updateBill(editingBill.id, {
        weightKg: parseFloat(editWeight),
        pricePerKg: parseFloat(editPrice),
        reason: editReason.trim(),
      });

      if (res.data.success) {
        success('Bill updated and changes logged in audit trail.');
        setEditingBill(null);
        setEditReason('');
        loadData();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to update bill.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingBill) return;

    try {
      setIsDeleting(true);
      const res = await kathaApi.deleteBill(deletingBill.id, {
        reason: deleteReason.trim() || 'Deleted from POS Counter',
      });

      if (res.data.success) {
        success(`Bill #${deletingBill.bill_number} deleted successfully.`);
        if (recentGeneratedBill?.id === deletingBill.id) {
          setRecentGeneratedBill(null);
        }
        setDeletingBill(null);
        setDeleteReason('');
        loadData();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to delete bill.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Customer Billing / POS Counter</h1>
          <p className="text-xs text-slate-500 mt-1">
            Fast counter billing with Skinless, Dressed, Boneless, Liver, Eggs, Natukodi, and Masala.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <DailyClosingCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            align="right"
          />
        </div>
      </div>

      {/* POS Billing Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Billing Entry */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-brand-600" />
            <span>Generate New Customer Bill</span>
          </h2>

          <form onSubmit={handleBillSubmit} className="space-y-4">
            {/* Customer Selection & WhatsApp Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Customer {paymentType === 'Pay Later' && <span className="text-rose-500">* (Mandatory for Credit)</span>}
                  </label>
                  {selectedCustomerObj && (
                    <span className="text-[11px] font-semibold text-orange-700">
                      Katha: {formatCurrency(selectedCustomerObj.outstandingBalance)}
                    </span>
                  )}
                </div>
                <select
                  value={customerId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setCustomerId(id);
                    const sel = customers.find((c) => c.id === parseInt(id, 10));
                    if (sel && sel.phone) {
                      setCustomerPhone(sel.phone);
                    } else if (!id) {
                      setCustomerPhone('');
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Walk-in Retail Customer (No Katha)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Customer Mobile / WhatsApp</label>
                  <span className="text-[10px] text-slate-400">Direct WhatsApp</span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-emerald-600">
                    <WhatsAppIcon className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="e.g. 7989856610 (10 digits)"
                    maxLength={13}
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Bill Date</label>
                <DailyClosingCalendar
                  selectedDate={billDate}
                  onSelectDate={setBillDate}
                  className="w-full"
                  showStatusBadge={false}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Optional Notes</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Extra curry cut pieces; spicy masala"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
                />
              </div>
            </div>

            {/* Quick Product Chips / Pills */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-brand-600" />
                  <span>Quick Add Products</span>
                  <span className="text-[11px] font-normal text-slate-400">(Click to add to bill)</span>
                </label>
                <span className="text-[11px] text-brand-600 font-semibold">{billItems.length} in bill</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                {AVAILABLE_PRODUCTS.map((prod) => {
                  const isAdded = billItems.some((bi) => bi.name === prod.name);
                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => handleToggleOrAddItem(prod)}
                      className={`p-2 rounded-xl border text-left transition flex flex-col justify-between ${
                        isAdded
                          ? 'bg-brand-50 border-brand-500 text-brand-900 ring-2 ring-brand-500/20'
                          : `${prod.badgeClass} hover:opacity-90`
                      }`}
                      title={`Click to add ${prod.label} (Default: ₹${prod.defaultRate}/${prod.unit})`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-base">{prod.icon}</span>
                        <span
                          className={`text-[9px] font-bold px-1 rounded ${
                            isAdded ? 'bg-brand-600 text-white' : 'bg-slate-200/80 text-slate-700'
                          }`}
                        >
                          {prod.unit}
                        </span>
                      </div>
                      <div className="mt-1">
                        <p className="text-xs font-bold truncate leading-tight">{prod.name}</p>
                        <p className="text-[10px] font-medium text-slate-500">
                          ₹{prod.defaultRate}/{prod.unit}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Line Items Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50">
              <div className="p-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                <div className="hidden sm:grid grid-cols-12 w-full gap-2 text-[11px] font-bold text-slate-600 px-2">
                  <span className="col-span-4">Item</span>
                  <span className="col-span-3">Qty / Weight</span>
                  <span className="col-span-3">Rate (₹)</span>
                  <span className="col-span-2 text-right">Subtotal</span>
                </div>
                <div className="sm:hidden flex items-center justify-between w-full px-1 text-xs font-bold text-slate-700">
                  <span>Selected Products</span>
                  <span className="text-[11px] text-brand-600">{billItems.length} item(s)</span>
                </div>
              </div>

              <div className="p-2 space-y-2">
                {billItems.map((item, idx) => {
                  const prodConfig = AVAILABLE_PRODUCTS.find((p) => p.name === item.name) || AVAILABLE_PRODUCTS[0];
                  const q = parseFloat(item.quantity) || 0;
                  const r = parseFloat(item.rate) || 0;
                  const lineTotal = q * r;

                  return (
                    <div
                      key={item.rowId}
                      className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs"
                    >
                      {/* Mobile Layout (Stacked 2-row for < sm) */}
                      <div className="sm:hidden space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <select
                            value={item.name}
                            onChange={(e) => handleUpdateItem(idx, 'name', e.target.value)}
                            className="flex-1 px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-brand-500"
                          >
                            {AVAILABLE_PRODUCTS.map((p) => (
                              <option key={p.name} value={p.name}>
                                {p.icon} {p.name} ({p.unit})
                              </option>
                            ))}
                          </select>
                          {billItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
                              title="Remove item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-2 items-center">
                          <div className="relative">
                            <span className="text-[10px] text-slate-400 block font-medium">Qty ({item.unit})</span>
                            <div className="relative mt-0.5">
                              <input
                                type="number"
                                step={item.unit === 'kg' ? '0.01' : '1'}
                                min="0.01"
                                inputMode={item.unit === 'kg' ? 'decimal' : 'numeric'}
                                placeholder={prodConfig.placeholder}
                                value={item.quantity}
                                onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                                className="w-full pl-2 pr-6 py-1.5 text-xs font-bold border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-brand-500"
                                required
                                autoFocus={idx === 0}
                              />
                              <span className="absolute right-1.5 top-1.5 text-[9px] font-bold text-slate-400 pointer-events-none">
                                {item.unit}
                              </span>
                            </div>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 block font-medium">Rate / {item.unit}</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              inputMode="decimal"
                              value={item.rate}
                              onChange={(e) => handleUpdateItem(idx, 'rate', e.target.value)}
                              placeholder={String(prodConfig.defaultRate)}
                              className="w-full px-2 py-1.5 mt-0.5 text-xs font-bold border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                              required
                            />
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block font-medium">Subtotal</span>
                            <span className="text-xs font-black text-slate-900 font-mono mt-1 block">
                              {formatCurrency(lineTotal)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Desktop Layout (Inline 12-col for >= sm) */}
                      <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                        {/* Product selector */}
                        <div className="col-span-4">
                          <select
                            value={item.name}
                            onChange={(e) => handleUpdateItem(idx, 'name', e.target.value)}
                            className="w-full px-2 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-brand-500"
                          >
                            {AVAILABLE_PRODUCTS.map((p) => (
                              <option key={p.name} value={p.name}>
                                {p.icon} {p.name} ({p.unit})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Qty / Weight input */}
                        <div className="col-span-3 relative">
                          <input
                            type="number"
                            step={item.unit === 'kg' ? '0.01' : '1'}
                            min="0.01"
                            inputMode={item.unit === 'kg' ? 'decimal' : 'numeric'}
                            placeholder={prodConfig.placeholder}
                            value={item.quantity}
                            onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                            className="w-full pl-2 pr-7 py-1.5 text-xs font-bold border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-brand-500"
                            required
                          />
                          <span className="absolute right-2 top-1.5 text-[10px] font-bold text-slate-400 pointer-events-none">
                            {item.unit}
                          </span>
                        </div>

                        {/* Rate input */}
                        <div className="col-span-3 relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            value={item.rate}
                            onChange={(e) => handleUpdateItem(idx, 'rate', e.target.value)}
                            placeholder={String(prodConfig.defaultRate)}
                            className="w-full pl-2 pr-2 py-1.5 text-xs font-bold border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-brand-500 font-mono"
                            required
                          />
                        </div>

                        {/* Subtotal & Delete button */}
                        <div className="col-span-2 flex items-center justify-end gap-1.5 text-right">
                          <span className="text-xs font-black text-slate-800 font-mono">
                            {formatCurrency(lineTotal)}
                          </span>
                          {billItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                              title="Remove item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={handleAddNewItem}
                  className="w-full py-2 border border-dashed border-slate-300 hover:border-brand-500 hover:bg-brand-50/50 text-slate-600 hover:text-brand-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Another Item (Eggs, Masala, Boneless, etc.)</span>
                </button>
              </div>
            </div>

            {/* Total Display & Summary Pills */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500">Calculated Bill Amount</p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                  {totalMeatWeightKg > 0 && (
                    <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                      Meat: {formatKg(totalMeatWeightKg)}
                    </span>
                  )}
                  {totalEggsCount > 0 && (
                    <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                      Eggs: {totalEggsCount} pcs
                    </span>
                  )}
                  {totalMasalaPackets > 0 && (
                    <span className="bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full">
                      Masala: {totalMasalaPackets} pkt
                    </span>
                  )}
                </div>
              </div>
              <p className="text-3xl font-black text-brand-900 font-mono">{formatCurrency(totalBillAmount)}</p>
            </div>

            {/* Payment Choice: Pay Now vs Pay Later */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800">Payment Option</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentType('Pay Now')}
                  className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                    paymentType === 'Pay Now'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>💵 Pay Now</span>
                  <span className="text-[10px] font-normal text-emerald-700">Immediate Payment</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType('Pay Later')}
                  className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                    paymentType === 'Pay Later'
                      ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>📖 Pay Later</span>
                  <span className="text-[10px] font-normal text-amber-700">Add to Katha Debt</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType('Partial')}
                  className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                    paymentType === 'Partial'
                      ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>⚖️ Partial</span>
                  <span className="text-[10px] font-normal text-blue-700">Split Pay & Debt</span>
                </button>
              </div>
            </div>

            {paymentType === 'Pay Now' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash', 'UPI', 'Card'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 text-xs font-semibold rounded-xl border transition ${
                        paymentMethod === m
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {paymentType === 'Partial' && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50/60 rounded-xl border border-blue-200">
                <div>
                  <label className="block text-xs font-semibold text-blue-900 mb-1">Paid Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder="e.g. 200"
                    className="w-full px-3 py-1.5 text-sm font-bold bg-white border border-blue-300 rounded-lg outline-none font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-blue-900 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-blue-300 rounded-lg outline-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                  </select>
                </div>
              </div>
            )}

            {/* Action Buttons: Generate Bill vs Generate & Send WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={submitting || totalBillAmount <= 0}
                onClick={(e) => handleBillSubmit(e, false)}
                className="w-full py-3 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Generating...' : `Generate Bill (${formatCurrency(totalBillAmount)})`}</span>
              </button>

              <button
                type="button"
                disabled={submitting || totalBillAmount <= 0}
                onClick={(e) => handleBillSubmit(e, true)}
                className="w-full py-3 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-emerald-600/25 transition flex items-center justify-center gap-2 disabled:opacity-50"
                title="Save bill and immediately open WhatsApp with the receipt"
              >
                <WhatsAppIcon className="w-4 h-4" />
                <span>{submitting ? 'Sending...' : 'Generate & Send WhatsApp'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right: Bill Preview / Printable Receipt */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="border-b border-dashed border-slate-200 pb-4 text-center">
              <h3 className="font-bold text-slate-900 text-base">Reddy Chicken and Mutton Center</h3>
              <p className="text-[11px] text-slate-500">Retail & Wholesale Meat Center</p>
              <p className="text-[10px] text-slate-400">Old Alwal, Secunderabad | Ph: 7989856610</p>
            </div>

            <div className="py-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Bill Number:</span>
                <span className="font-mono font-bold text-slate-800">
                  {recentGeneratedBill ? recentGeneratedBill.bill_number : 'BILL-PREVIEW'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date:</span>
                <span className="font-medium text-slate-700">{formatDate(billDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Customer:</span>
                <span className="font-bold text-slate-900">
                  {recentGeneratedBill?.customer_name ||
                    (selectedCustomerObj ? selectedCustomerObj.name : 'Walk-in Counter Customer')}
                </span>
              </div>
              {(recentGeneratedBill?.customer_phone || customerPhone) && (
                <div className="flex justify-between">
                  <span className="text-slate-400">WhatsApp:</span>
                  <span className="font-mono font-semibold text-emerald-700">
                    {recentGeneratedBill?.customer_phone || customerPhone}
                  </span>
                </div>
              )}
            </div>

            {/* Itemized Table in Receipt */}
            <div className="border-t border-b border-dashed border-slate-200 py-3 space-y-2 text-xs">
              <div className="grid grid-cols-12 text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100">
                <span className="col-span-5">Item</span>
                <span className="col-span-2 text-center">Qty</span>
                <span className="col-span-2 text-right">Rate</span>
                <span className="col-span-3 text-right">Amount</span>
              </div>

              {(recentGeneratedBill?.items ||
                (parsedValidItems.length > 0
                  ? parsedValidItems
                  : [{ name: 'Skinless', quantity: 0, unit: 'kg', rate: 260, amount: 0 }])
              ).map((it: any, idx: number) => {
                const qDisplay =
                  it.unit === 'kg'
                    ? `${Number(it.quantity || 0).toFixed(2)} kg`
                    : `${it.quantity || 0} ${it.unit || ''}`;
                return (
                  <div key={idx} className="grid grid-cols-12 font-medium text-slate-700 items-center">
                    <span className="col-span-5 truncate text-slate-800 font-bold">{it.name}</span>
                    <span className="col-span-2 text-center text-slate-500 font-mono text-[11px]">
                      {qDisplay}
                    </span>
                    <span className="col-span-2 text-right text-slate-400 font-mono text-[11px]">
                      ₹{Number(it.rate || 0)}
                    </span>
                    <span className="col-span-3 text-right font-bold text-slate-900 font-mono">
                      {formatCurrency(it.amount || 0)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 space-y-1.5 text-xs">
              <div className="flex justify-between text-base font-black text-slate-900">
                <span>Total Amount:</span>
                <span className="font-mono">{formatCurrency(recentGeneratedBill?.total_amount || totalBillAmount)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Payment Mode:</span>
                <span className="font-semibold text-slate-800">
                  {recentGeneratedBill?.payment_status
                    ? `${recentGeneratedBill.payment_type} (${recentGeneratedBill.payment_method || 'Cash'})`
                    : `${paymentType} (${paymentMethod})`}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print Slip</span>
            </button>
            <button
              type="button"
              onClick={() => sendWhatsAppBill(recentGeneratedBill)}
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
              title="Send bill directly to customer on WhatsApp"
            >
              <WhatsAppIcon className="w-4 h-4" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>
      </div>

      {/* Customer Bills History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Customer Bills for {formatDate(selectedDate)}</h3>
            <span className="text-xs text-slate-400">({bills.length} bills)</span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Paid">Paid Only</option>
              <option value="Unpaid">Unpaid (Katha) Only</option>
              <option value="Partially Paid">Partially Paid</option>
            </select>
          </div>
        </div>

        {/* Mobile Record Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {bills.length > 0 ? (
            bills.map((b) => {
              const bItems = b.items
                ? typeof b.items === 'string'
                  ? JSON.parse(b.items)
                  : b.items
                : null;

              return (
                <div key={b.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-blue-600 block">{b.bill_number}</span>
                      <h4 className="font-bold text-slate-900 text-sm">{b.customer_name || 'Walk-in Counter'}</h4>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-black text-slate-900 block font-mono">
                        {formatCurrency(b.total_amount)}
                      </span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          b.payment_status === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : b.payment_status === 'Unpaid'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {b.payment_status} • {b.payment_type}
                      </span>
                    </div>
                  </div>

                  {/* Items purchased */}
                  <div className="py-2 px-3 bg-slate-50 rounded-xl text-xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                      Items Purchased:
                    </span>
                    {bItems && bItems.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {bItems.map((it: any, i: number) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md"
                          >
                            <span>{it.name}:</span>
                            <span className="text-brand-700 font-mono font-bold">
                              {it.quantity} {it.unit}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{formatKg(b.weight_kg)}</span>
                        <span className="text-slate-400">@ {formatCurrency(b.price_per_kg)}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => sendWhatsAppBill(b)}
                      className="py-2 px-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 min-h-[38px] shadow-sm transition"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingBill(b);
                        setEditWeight(String(b.weight_kg));
                        setEditPrice(String(b.price_per_kg));
                        setEditReason('');
                      }}
                      className="py-2 px-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1 min-h-[38px] transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDeletingBill(b);
                        setDeleteReason('');
                      }}
                      className="py-2 px-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1 min-h-[38px] transition border border-rose-200"
                      title="Delete Bill"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">
              No customer bills recorded on this date.
            </div>
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-3 px-4">Bill #</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Items / Breakdown</th>
                <th className="py-3 px-4 font-mono">Total Amount</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bills.length > 0 ? (
                bills.map((b) => {
                  const bItems = b.items
                    ? typeof b.items === 'string'
                      ? JSON.parse(b.items)
                      : b.items
                    : null;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-blue-600">{b.bill_number}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {b.customer_name || 'Walk-in Counter'}
                      </td>
                      <td className="py-3 px-4">
                        {bItems && bItems.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-sm">
                            {bItems.map((it: any, i: number) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md border border-slate-200/60"
                              >
                                <span>{it.name}:</span>
                                <span className="text-brand-700 font-mono font-bold">
                                  {it.quantity} {it.unit}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-slate-800 font-medium">
                            <span className="font-bold">{formatKg(b.weight_kg)}</span>
                            <span className="text-slate-400 text-[11px] ml-1">@ {formatCurrency(b.price_per_kg)}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-black text-slate-900 text-sm font-mono">
                        {formatCurrency(b.total_amount)}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{b.payment_type}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            b.payment_status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : b.payment_status === 'Unpaid'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {b.payment_status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => sendWhatsAppBill(b)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                            title="Send Bill via WhatsApp"
                          >
                            <WhatsAppIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingBill(b);
                              setEditWeight(String(b.weight_kg));
                              setEditPrice(String(b.price_per_kg));
                              setEditReason('');
                            }}
                            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition"
                            title="Edit Bill"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setDeletingBill(b);
                              setDeleteReason('');
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Bill"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    No customer bills recorded on this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Bill Modal */}
      {editingBill && (
        <Modal
          isOpen={true}
          onClose={() => setEditingBill(null)}
          title={`Edit Customer Bill: ${editingBill.bill_number}`}
        >
          <form onSubmit={handleEditBillSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Total Weight (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={editWeight}
                  onChange={(e) => setEditWeight(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Effective Price / kg (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl outline-none"
                  required
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-500">Updated Bill Total:</span>
              <span className="text-base font-bold text-slate-900 font-mono">
                {formatCurrency((parseFloat(editWeight) || 0) * (parseFloat(editPrice) || 0))}
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mandatory Reason for Editing Bill <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g. Corrected chicken weight or price adjustment"
                rows={2}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none resize-none"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingBill(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="px-5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow transition"
              >
                {savingEdit ? 'Updating...' : 'Save & Log Audit'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Bill Modal */}
      {deletingBill && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingBill(null)}
          title={`Delete Customer Bill: ${deletingBill.bill_number}`}
        >
          <form onSubmit={handleDeleteBill} className="space-y-4">
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
              <p className="text-xs font-bold text-rose-900">
                Are you sure you want to permanently delete this customer bill?
              </p>
              <p className="text-xs text-rose-700">
                This will permanently delete <strong>{deletingBill.bill_number}</strong> ({formatCurrency(deletingBill.total_amount)}),
                reverse any linked sales entries, and adjust customer Katha balance if it was a credit bill.
              </p>
              <div className="pt-2 text-[11px] text-slate-600 space-y-0.5 border-t border-rose-200/60 mt-2">
                <p><strong>Customer:</strong> {deletingBill.customer_name || 'Walk-in Counter Customer'}</p>
                <p><strong>Payment Mode:</strong> {deletingBill.payment_type} ({deletingBill.payment_status})</p>
                {deletingBill.description && <p><strong>Items/Notes:</strong> {deletingBill.description}</p>}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Deletion <span className="text-slate-400">(Optional / Audit)</span>
              </label>
              <input
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Customer cancelled order / bill entered by mistake"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingBill(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isDeleting}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
