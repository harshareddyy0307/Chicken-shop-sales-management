import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone,
  Truck,
  Receipt,
  Warehouse,
  Users,
  Landmark,
  BarChart3,
  Eye,
  EyeOff,
  AlertCircle,
  HelpCircle,
  X,
  PhoneCall,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { authApi } from '../services/api';
import { normalizeIndianPhone, isValidPin } from '../utils/phone';
import { ShopLogo } from '../components/ShopLogo';

export const Login: React.FC = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const [showPin, setShowPin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotStatus, setForgotStatus] = useState<string | null>(null);

  const phoneInputRef = useRef<HTMLInputElement>(null);
  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const { login } = useAuth();
  const { success } = useToast();
  const navigate = useNavigate();

  // Focus phone input on initial mount
  useEffect(() => {
    phoneInputRef.current?.focus();
  }, []);

  const fullPin = pinDigits.join('');

  // Handle phone input changes & auto-focus PIN when 10 digits entered
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const val = e.target.value;
    setPhoneNumber(val);

    const normalized = normalizeIndianPhone(val);
    if (normalized && normalized.length === 10) {
      setTimeout(() => {
        pinInputRefs[0].current?.focus();
      }, 50);
    }
  };

  // Handle individual PIN box digit inputs
  const handlePinDigitChange = (index: number, val: string) => {
    setErrorMessage(null);
    const cleanDigit = val.replace(/\D/g, '').slice(-1);

    const nextDigits = [...pinDigits];
    nextDigits[index] = cleanDigit;
    setPinDigits(nextDigits);

    // If a digit was entered, auto-focus next box
    if (cleanDigit && index < 3) {
      pinInputRefs[index + 1].current?.focus();
    }
  };

  // Handle backspace, paste, and arrow keys on PIN boxes
  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!pinDigits[index] && index > 0) {
        const nextDigits = [...pinDigits];
        nextDigits[index - 1] = '';
        setPinDigits(nextDigits);
        pinInputRefs[index - 1].current?.focus();
      } else {
        const nextDigits = [...pinDigits];
        nextDigits[index] = '';
        setPinDigits(nextDigits);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    } else if (e.key === 'ArrowRight' && index < 3) {
      pinInputRefs[index + 1].current?.focus();
    } else if (e.key === 'Enter') {
      handleLogin();
    }
  };

  // Handle paste of 4 digits directly into any PIN box
  const handlePinPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted) {
      const nextDigits = ['', '', '', ''];
      for (let i = 0; i < pasted.length; i++) {
        nextDigits[i] = pasted[i];
      }
      setPinDigits(nextDigits);
      const focusIndex = Math.min(pasted.length, 3);
      pinInputRefs[focusIndex].current?.focus();
    }
  };

  // Submit Login
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    const normalized = normalizeIndianPhone(phoneNumber);
    if (!normalized) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number.');
      phoneInputRef.current?.focus();
      return;
    }

    if (!isValidPin(fullPin)) {
      setErrorMessage('Please enter your complete 4-digit PIN.');
      pinInputRefs[0].current?.focus();
      return;
    }

    try {
      setIsLoading(true);
      const res = await authApi.login({ phone: normalized, pin: fullPin });
      if (res.data.success) {
        login(res.data.data.user);
        success(`Welcome back, ${res.data.data.user.fullName}!`);
        navigate('/');
      } else {
        setErrorMessage(res.data.error || 'Invalid phone number or PIN. Please try again.');
      }
    } catch (err: any) {
      console.error('Login request failed:', err);
      if (err.response?.data?.error) {
        setErrorMessage(err.response.data.error);
      } else if (err.response?.status === 404) {
        setErrorMessage('Backend API endpoint not found (HTTP 404). Please ensure backend is running and /api is properly routed.');
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        setErrorMessage('Cannot connect to backend server (Network Error). Please check if backend is running.');
      } else {
        setErrorMessage(`Server error (${err.response?.status || 'Unknown'}). Please try again.`);
      }
    } finally {
      setIsLoading(false);
    }
  };


  // Handle Forgot PIN Request
  const handleForgotPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPhone.trim()) return;

    try {
      setForgotSubmitting(true);
      const res = await authApi.forgotPin(forgotPhone.trim());
      if (res.data.success) {
        setForgotStatus(res.data.message);
      }
    } catch (err: any) {
      setForgotStatus(err.response?.data?.error || 'Failed to submit request.');
    } finally {
      setForgotSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f8faf9] selection:bg-emerald-600 selection:text-white">
      {/* ======================================================== */}
      {/* LEFT PANEL: Forest Green Enterprise Showcase Banner      */}
      {/* ======================================================== */}
      <div className="relative hidden lg:flex lg:w-1/2 xl:w-5/12 bg-gradient-to-br from-[#0e3b23] via-[#124429] to-[#0a2e1b] p-10 xl:p-14 text-white flex-col justify-between overflow-hidden shrink-0">
        {/* Background Watermark Shapes */}
        <div className="absolute -top-16 -left-16 w-80 h-80 rounded-full bg-emerald-500/5 blur-2xl pointer-events-none" />
        <div className="absolute bottom-10 -right-20 w-96 h-96 rounded-full bg-emerald-400/5 blur-3xl pointer-events-none" />
        {/* Top Branding */}
        <div className="relative z-10 flex items-center gap-3">
          <ShopLogo size="md" />
          <div>
            <span className="font-black text-white text-base tracking-wider uppercase block leading-none">
              REDDY CHICKEN &amp; MUTTON
            </span>
            <span className="text-[10px] font-bold text-amber-400 tracking-widest uppercase block mt-1">
              CENTER
            </span>
          </div>
        </div>

        {/* Center Hero & Feature Cards */}
        <div className="relative z-10 my-auto py-8">
          <h1 className="text-3xl xl:text-4xl font-black text-white tracking-tight leading-tight mb-3">
            Reddy Chicken and Mutton Center
          </h1>
          <p className="text-emerald-200/90 text-sm xl:text-base font-medium mb-8">
            Smart Poultry &amp; Mutton Management Solution
          </p>

          {/* 6 Feature Badges (2 columns x 3 rows) */}
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            <div className="bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center gap-3 transition">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <Truck className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white/95 truncate">
                Purchase Management
              </span>
            </div>

            <div className="bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center gap-3 transition">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <Receipt className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white/95 truncate">
                Sales Billing &amp; Invoicing
              </span>
            </div>

            <div className="bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center gap-3 transition">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <Warehouse className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white/95 truncate">
                Live Bird Inventory Tracking
              </span>
            </div>

            <div className="bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center gap-3 transition">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white/95 truncate">
                Customer &amp; Supplier Records
              </span>
            </div>

            <div className="bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center gap-3 transition">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <Landmark className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white/95 truncate">
                Ledger Registers &amp; Payments
              </span>
            </div>

            <div className="bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/10 rounded-2xl p-3 flex items-center gap-3 transition">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
                <BarChart3 className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-white/95 truncate">
                Business Reports &amp; Analytics
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Left Footer */}
        <div className="relative z-10 pt-4 border-t border-white/10">
          <p className="text-emerald-400 text-xs xl:text-sm font-semibold">
            Built for Reddy Chicken and Mutton Center.
          </p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* RIGHT PANEL: Modern Clean Login Canvas & Card             */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 lg:p-12 min-h-screen">
        {/* Mobile Header Branding (Visible below lg) */}
        <div className="lg:hidden flex items-center gap-2.5 mb-6 text-slate-800">
          <ShopLogo size="md" />
          <div>
            <span className="font-black text-slate-900 text-sm tracking-wider uppercase block leading-none">
              REDDY CHICKEN &amp; MUTTON
            </span>
            <span className="text-[9px] font-bold text-rose-600 tracking-widest uppercase block mt-0.5">
              CENTER
            </span>
          </div>
        </div>

        {/* Floating Login Card */}
        <div className="w-full max-w-[430px] bg-white rounded-[28px] sm:rounded-[32px] shadow-xl sm:shadow-2xl border border-slate-100 p-6 sm:p-9 space-y-6 animate-in fade-in zoom-in-95 duration-200">
          {/* Card Top Icon Badge */}
          <div className="flex justify-center">
            <ShopLogo size="lg" />
          </div>

          {/* Heading */}
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Welcome Back
            </h2>
            <p className="text-xs text-slate-500">
              Login to continue managing Reddy Chicken and Mutton Center.
            </p>
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-semibold leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Mobile Number Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Mobile Number *
              </label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 text-slate-400 pointer-events-none flex items-center justify-center">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  ref={phoneInputRef}
                  type="tel"
                  inputMode="tel"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  placeholder="Enter your mobile number"
                  maxLength={14}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-2xl text-sm font-semibold tracking-wide text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 shadow-xs transition"
                  required
                  autoComplete="tel-national"
                />
              </div>
            </div>

            {/* 4-Digit Login PIN */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700">
                  4-Digit Login PIN
                </label>
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="text-[11px] font-semibold text-slate-500 hover:text-emerald-700 flex items-center gap-1 transition cursor-pointer"
                >
                  {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPin ? 'Hide' : 'Show'}</span>
                </button>
              </div>

              {/* 4 Discrete Digit Boxes */}
              <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
                {[0, 1, 2, 3].map((idx) => (
                  <input
                    key={idx}
                    ref={pinInputRefs[idx]}
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={pinDigits[idx]}
                    onChange={(e) => handlePinDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(idx, e)}
                    onPaste={handlePinPaste}
                    className="w-full h-14 sm:h-16 text-center text-xl sm:text-2xl font-black bg-white border border-slate-200 hover:border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 text-slate-900 shadow-xs transition"
                    aria-label={`PIN Digit ${idx + 1}`}
                    required
                  />
                ))}
              </div>

              {/* Forgot PIN Link */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setForgotStatus(null);
                    setForgotPhone(phoneNumber);
                    setIsForgotModalOpen(true);
                  }}
                  className="text-xs font-bold text-[#1e6f43] hover:text-emerald-800 transition"
                >
                  Forgot PIN?
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading || !phoneNumber || fullPin.length !== 4}
              className="w-full mt-2 py-3.5 px-4 bg-[#1e6f43] hover:bg-[#185a36] active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-md shadow-emerald-950/10 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>Login to Panel</span>
              )}
            </button>
          </form>

        </div>

        {/* Bottom Page Footer */}
        <div className="text-center text-[11px] text-slate-400 mt-6 space-y-0.5">
          <p>Version 1.0.0 • © 2026 Reddy Chicken and Mutton Center</p>
          <p>Smart Chicken &amp; Mutton Management &amp; Billing System.</p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* Forgot PIN / PIN Reset Assistance Modal                   */}
      {/* ======================================================== */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-emerald-700" />
                <h3 className="font-bold text-base text-slate-900">Forgot / Reset 4-Digit PIN</h3>
              </div>
              <button
                onClick={() => setIsForgotModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
              <p className="font-bold">🔐 Owner-Assisted PIN Reset Workflow</p>
              <p className="text-amber-800 leading-relaxed">
                For security and protection against unauthorized account access, 4-digit PINs are reset directly by the Shop Owner.
              </p>
            </div>

            {/* Owner Contact Information */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Shop Owner:</span>
                <span className="font-bold text-slate-900">Harsha Reddy</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Owner Phone:</span>
                <a
                  href="tel:7989856610"
                  className="font-mono font-bold text-emerald-700 flex items-center gap-1 hover:underline"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>+91 79898 56610</span>
                </a>
              </div>
            </div>

            {/* Optional Request Submission */}
            <form onSubmit={handleForgotPinSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Enter Your Registered Phone Number
                </label>
                <input
                  type="tel"
                  value={forgotPhone}
                  onChange={(e) => setForgotPhone(e.target.value)}
                  placeholder="e.g. 7989856610"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-600"
                  required
                />
              </div>

              {forgotStatus && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 leading-relaxed font-medium">
                  {forgotStatus}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsForgotModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={forgotSubmitting}
                  className="px-4 py-2 min-h-[38px] bg-[#1e6f43] hover:bg-[#185a36] text-white rounded-xl text-xs font-bold shadow-sm transition disabled:opacity-50"
                >
                  {forgotSubmitting ? 'Logging Request...' : 'Log Reset Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
