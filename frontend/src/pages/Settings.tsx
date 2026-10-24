import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Store, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { settingsApi } from '../services/api';

export const SettingsPage: React.FC = () => {
  const { hasRole } = useAuth();
  const { success, error } = useToast();

  const [shopName, setShopName] = useState('Star Fresh Chicken & Meat Center');
  const [address, setAddress] = useState('Shop #4, Market Yard Road, Hyderabad, Telangana');
  const [phone, setPhone] = useState('+91 98765 43210');
  const [currency, setCurrency] = useState('₹');
  const [dateFormat, setDateFormat] = useState('DD-MM-YYYY');
  const [warnDuplicateCustomer, setWarnDuplicateCustomer] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await settingsApi.get();
        if (res.data.success) {
          const s = res.data.data;
          setShopName(s.shopName || 'Reddy Chicken and Mutton Center');
          setAddress(s.address || '');
          setPhone(s.phone || '');
          setCurrency(s.currency || '₹');
          setDateFormat(s.dateFormat || 'DD-MM-YYYY');
          setWarnDuplicateCustomer(s.warnDuplicateCustomer !== false);
        }
      } catch {
        error('Failed to load shop settings.');
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasRole('owner', 'admin')) {
      error('Only the shop owner or administrator can modify business settings.');
      return;
    }

    try {
      setSaving(true);
      const res = await settingsApi.update({
        shopName,
        address,
        phone,
        currency,
        dateFormat,
        warnDuplicateCustomer,
      });

      if (res.data.success) {
        success('Shop settings updated successfully.');
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to update settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Shop Settings & Configuration</h1>
          <p className="text-xs text-slate-500 mt-1">
            Store identity, currency display symbol, date formatting, and operational rules.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
          <Store className="w-4 h-4 text-brand-600" />
          <span>Business Identification</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Shop Name</label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none"
              required
              disabled={!hasRole('owner', 'admin')}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none"
              required
              disabled={!hasRole('owner', 'admin')}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Shop Address & Market Location</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none"
            required
            disabled={!hasRole('owner', 'admin')}
          />
        </div>

        <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 pt-2 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-brand-600" />
          <span>Localization & Business Rules</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Currency Symbol</label>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none font-bold"
              required
              disabled
            />
            <p className="text-[11px] text-slate-400 mt-1">Locked to Indian Rupee (₹)</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Date Format</label>
            <input
              type="text"
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl outline-none font-bold"
              required
              disabled
            />
            <p className="text-[11px] text-slate-400 mt-1">Locked to Indian Standard (DD-MM-YYYY)</p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="warnDup"
              checked={warnDuplicateCustomer}
              onChange={(e) => setWarnDuplicateCustomer(e.target.checked)}
              className="w-4 h-4 text-brand-600 rounded"
              disabled={!hasRole('owner', 'admin')}
            />
            <label htmlFor="warnDup" className="text-xs font-semibold text-slate-800 cursor-pointer">
              Warn on Duplicate Customer Name or Mobile Number in Katha
            </label>
          </div>
        </div>

        {hasRole('owner', 'admin') && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto justify-center px-6 py-2.5 min-h-[42px] bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-md shadow-brand-600/20 transition flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
