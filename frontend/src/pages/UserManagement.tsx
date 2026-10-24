import React, { useState, useEffect } from 'react';
import {
  UserCog,
  Plus,
  ShieldCheck,
  UserCheck,
  UserX,
  Lock,
  KeyRound,
  AlertTriangle,
  Phone,
  Clock,
  Pause,
  Play,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { authApi } from '../services/api';
import { User } from '../types';
import { formatDate } from '../utils/format';
import { Modal } from '../components/Modal';
import { ReasonModal } from '../components/ReasonModal';
import { normalizeIndianPhone, formatIndianPhone, isValidPin } from '../utils/phone';

export const UserManagementPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { success, error } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Add User Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'owner' | 'admin' | 'manager' | 'staff'>('staff');
  const [submitting, setSubmitting] = useState(false);

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Reset PIN Modal State
  const [pinResetUser, setPinResetUser] = useState<User | null>(null);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [resettingPin, setResettingPin] = useState(false);
  const [showResetPin, setShowResetPin] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await authApi.getUsers();
      if (res.data.success) {
        setUsers(res.data.data);
      }
    } catch {
      error('Failed to load user accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !pin) {
      error('Full name, phone number, and 4-digit PIN are required.');
      return;
    }

    const normalized = normalizeIndianPhone(phone);
    if (!normalized) {
      error('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (!isValidPin(pin)) {
      error('PIN must be exactly 4 numeric digits (e.g. 0123).');
      return;
    }

    try {
      setSubmitting(true);
      const res = await authApi.createUser({
        fullName: fullName.trim(),
        phone: normalized,
        pin: pin.trim(),
        role,
      });

      if (res.data.success) {
        success(`User "${fullName}" created successfully with phone ${formatIndianPhone(normalized)}.`);
        setIsAddModalOpen(false);
        setFullName('');
        setPhone('');
        setPin('');
        setRole('staff');
        fetchUsers();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to create user account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      setSubmitting(true);
      const res = await authApi.updateUser(editingUser.id, {
        fullName: editingUser.fullName,
        role: editingUser.role,
        phone: editingUser.phone,
        isActive: editingUser.isActive,
      });

      if (res.data.success) {
        success(`User "${editingUser.fullName}" updated successfully.`);
        setEditingUser(null);
        fetchUsers();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to update user account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinResetUser) return;

    if (!isValidPin(newPin)) {
      error('PIN must contain exactly 4 numeric digits (e.g. 1234).');
      return;
    }

    if (newPin !== confirmPin) {
      error('The two PIN entries do not match.');
      return;
    }

    try {
      setResettingPin(true);
      const res = await authApi.resetPin(pinResetUser.id, newPin.trim());
      if (res.data.success) {
        success(res.data.message || `PIN reset successfully for ${pinResetUser.fullName}.`);
        setPinResetUser(null);
        setNewPin('');
        setConfirmPin('');
        setShowResetPin(false);
        fetchUsers();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to reset PIN.');
    } finally {
      setResettingPin(false);
    }
  };

  // Pause / Resume Toggle
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const handleToggleStatus = async (targetUser: User, newStatus: boolean) => {
    if (targetUser.id === currentUser?.id && !newStatus) {
      error('You cannot pause your own account.');
      return;
    }
    try {
      setTogglingId(targetUser.id);
      const res = await authApi.toggleUserStatus(targetUser.id, newStatus);
      if (res.data.success) {
        success(res.data.message || (newStatus ? 'Account resumed successfully.' : 'Account paused successfully.'));
        fetchUsers();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to update account status.');
    } finally {
      setTogglingId(null);
    }
  };

  // Delete User State & Handler
  const [deleteTargetUser, setDeleteTargetUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteUserConfirm = async (reason: string) => {
    if (!deleteTargetUser) return;
    try {
      setDeleting(true);
      const res = await authApi.deleteUser(deleteTargetUser.id, reason);
      if (res.data.success) {
        success(res.data.message || `Account for ${deleteTargetUser.fullName} has been deleted.`);
        setDeleteTargetUser(null);
        fetchUsers();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to delete user account.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Staff & User Accounts</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-brand-50 text-brand-700 border border-brand-200">
              Phone + 4-Digit PIN
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Owner-controlled user management with Indian mobile numbers, 4-digit PINs, and role permissions.
          </p>
        </div>

        <button
          onClick={() => {
            setFullName('');
            setPhone('');
            setPin('');
            setRole('staff');
            setIsAddModalOpen(true);
          }}
          className="w-full sm:w-auto justify-center px-4 py-2.5 min-h-[40px] bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-brand-600/20 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Account</span>
        </button>
      </div>

      {/* Role Definitions Info Box */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 text-xs">
        <div className="p-4 bg-purple-50 rounded-2xl border border-purple-200 space-y-1">
          <p className="font-bold text-purple-900">👑 Owner / Administrator</p>
          <p className="text-purple-700">Full business access, PIN resets, user creation, reopening closings, and audit logs.</p>
        </div>
        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 space-y-1">
          <p className="font-bold text-blue-900">👔 Shop Manager</p>
          <p className="text-blue-700">Daily business closing wizard, inventory receipt, stock transfers, and customer bills.</p>
        </div>
        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-1">
          <p className="font-bold text-emerald-900">🧑 Counter Staff</p>
          <p className="text-emerald-700">Fast retail chicken sales and bill creation. Restricted from deletions and closing lockouts.</p>
        </div>
      </div>

      {/* Accounts List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Registered Accounts ({users.length})</h3>
        </div>

        {/* Mobile View: Cards */}
        <div className="block md:hidden divide-y divide-slate-100">
          {users.map((u) => (
            <div key={u.id} className="p-4 space-y-3 hover:bg-slate-50/80 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{u.fullName}</h4>
                  <p className="text-xs font-mono text-slate-600 flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>{formatIndianPhone(u.normalizedPhone || u.phone)}</span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                      u.role === 'owner' || u.role === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : u.role === 'manager'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {u.role}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      u.isLocked
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : u.isActive !== false
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {u.isLocked ? (
                      <>
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        <span>Locked</span>
                      </>
                    ) : u.isActive !== false ? (
                      <>
                        <UserCheck className="w-3 h-3 text-emerald-600" />
                        <span>Active</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-3 h-3 text-amber-700" />
                        <span>Paused</span>
                      </>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 block">Last Login</span>
                  <span className="font-medium text-slate-700">
                    {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">Created</span>
                  <span className="text-slate-600">{u.createdAt ? formatDate(u.createdAt) : '-'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPinResetUser(u);
                    setNewPin('');
                    setConfirmPin('');
                    setShowResetPin(false);
                  }}
                  className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                  <span>Reset PIN</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingUser({ ...u })}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <span>Edit Profile</span>
                </button>

                {/* Pause / Resume Mobile */}
                {u.id === currentUser?.id ? (
                  <button
                    type="button"
                    disabled
                    className="px-3 py-2 bg-slate-50 text-slate-400 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 opacity-50 cursor-not-allowed"
                    title="You cannot pause your own account"
                  >
                    <Pause className="w-3.5 h-3.5 text-slate-400" />
                    <span>Pause</span>
                  </button>
                ) : u.isActive !== false ? (
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(u, false)}
                    disabled={togglingId === u.id}
                    className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    {togglingId === u.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                    ) : (
                      <Pause className="w-3.5 h-3.5 text-amber-700" />
                    )}
                    <span>Pause Account</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(u, true)}
                    disabled={togglingId === u.id}
                    className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    {togglingId === u.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                    )}
                    <span>Resume Account</span>
                  </button>
                )}

                {/* Delete Mobile */}
                {u.id === currentUser?.id ? (
                  <button
                    type="button"
                    disabled
                    className="px-3 py-2 bg-slate-50 text-slate-400 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 opacity-50 cursor-not-allowed"
                    title="You cannot delete your own account"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Delete</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteTargetUser(u)}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Delete Account</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-4">Phone Number</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last Login</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-900">{u.fullName}</td>
                  <td className="py-3.5 px-4 font-mono font-semibold text-slate-800">
                    {formatIndianPhone(u.normalizedPhone || u.phone)}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase ${
                        u.role === 'owner' || u.role === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : u.role === 'manager'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        u.isLocked
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : u.isActive !== false
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                    >
                      {u.isLocked ? (
                        <>
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>Locked</span>
                        </>
                      ) : u.isActive !== false ? (
                        <>
                          <UserCheck className="w-3 h-3 text-emerald-600" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-3 h-3 text-amber-700" />
                          <span>Paused</span>
                        </>
                      )}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500">
                    {u.createdAt ? formatDate(u.createdAt) : '-'}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setPinResetUser(u);
                          setNewPin('');
                          setConfirmPin('');
                          setShowResetPin(false);
                        }}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                        title="Reset 4-Digit PIN"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                        <span>Reset PIN</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingUser({ ...u })}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                        title="Edit User Profile"
                      >
                        Edit
                      </button>

                      {/* Pause or Resume */}
                      {u.id === currentUser?.id ? (
                        <button
                          type="button"
                          disabled
                          className="px-2.5 py-1.5 bg-slate-50 text-slate-400 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-not-allowed opacity-50"
                          title="You cannot pause your own account"
                        >
                          <Pause className="w-3.5 h-3.5 text-slate-400" />
                          <span>Pause</span>
                        </button>
                      ) : u.isActive !== false ? (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(u, false)}
                          disabled={togglingId === u.id}
                          className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                          title="Pause account (temporarily stop login access)"
                        >
                          {togglingId === u.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                          ) : (
                            <Pause className="w-3.5 h-3.5 text-amber-700" />
                          )}
                          <span>Pause</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(u, true)}
                          disabled={togglingId === u.id}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                          title="Resume account (allow login access)"
                        >
                          {togglingId === u.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                          ) : (
                            <Play className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                          )}
                          <span>Resume</span>
                        </button>
                      )}

                      {/* Delete */}
                      {u.id === currentUser?.id ? (
                        <button
                          type="button"
                          disabled
                          className="px-2.5 py-1.5 bg-slate-50 text-slate-400 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-not-allowed opacity-50"
                          title="You cannot delete your own account"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Delete</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeleteTargetUser(u)}
                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                          title="Permanently delete account"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New User Modal */}
      {isAddModalOpen && (
        <Modal isOpen={true} onClose={() => setIsAddModalOpen(false)} title="Create New User Account" maxWidth="md">
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Indian Mobile Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-slate-400 font-semibold text-xs border-r border-slate-200 pr-2">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210 (10 digits)"
                  maxLength={14}
                  className="w-full pl-14 pr-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  4-Digit PIN <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="e.g. 1234"
                  className="w-full px-3 py-2 text-center text-sm font-bold tracking-widest border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Numeric (0-9)</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">User Role</label>
                <select
                  value={role}
                  onChange={(e: any) => setRole(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="staff">Staff (Counter Sales)</option>
                  <option value="manager">Manager (Daily Wizard)</option>
                  <option value="owner">Owner / Admin</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 min-h-[40px] text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 min-h-[40px] text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow transition disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reset PIN Modal */}
      {pinResetUser && (
        <Modal
          isOpen={true}
          onClose={() => {
            setPinResetUser(null);
            setShowResetPin(false);
          }}
          title={`Reset 4-Digit PIN: ${pinResetUser.fullName}`}
          maxWidth="md"
        >
          <form onSubmit={handleResetPinSubmit} className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-600" /> Owner PIN Reset
              </p>
              <p className="text-amber-800 leading-relaxed">
                Enter a new 4-digit PIN for <span className="font-bold">{pinResetUser.fullName}</span> ({formatIndianPhone(pinResetUser.phone)}). This will also unfreeze the account if it was locked.
              </p>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pb-0.5">
              <span className="font-medium">Enter 4 numeric digits:</span>
              <button
                type="button"
                onClick={() => setShowResetPin(!showResetPin)}
                className="text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1 transition text-xs"
              >
                {showResetPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showResetPin ? 'Hide PIN' : 'Show PIN'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  New 4-Digit PIN <span className="text-rose-500">*</span>
                </label>
                <input
                  type={showResetPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="● ● ● ●"
                  className="w-full px-3 py-2.5 text-center text-base font-bold tracking-widest border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-mono bg-slate-50/50 focus:bg-white transition"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Confirm PIN <span className="text-rose-500">*</span>
                </label>
                <input
                  type={showResetPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="● ● ● ●"
                  className="w-full px-3 py-2.5 text-center text-base font-bold tracking-widest border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 font-mono bg-slate-50/50 focus:bg-white transition"
                  required
                />
              </div>
            </div>

            {/* Validation match helper */}
            {confirmPin.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                {newPin === confirmPin ? (
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> PINs match
                  </span>
                ) : (
                  <span className="text-rose-500 font-medium">
                    ✕ PINs do not match
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setPinResetUser(null);
                  setShowResetPin(false);
                }}
                className="px-4 py-2 min-h-[40px] text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resettingPin || newPin.length !== 4 || newPin !== confirmPin}
                className="px-5 py-2 min-h-[40px] text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow transition disabled:opacity-50"
              >
                {resettingPin ? 'Updating PIN...' : 'Save New PIN'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <Modal isOpen={true} onClose={() => setEditingUser(null)} title={`Edit Account: ${editingUser.fullName}`} maxWidth="md">
          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={editingUser.fullName}
                onChange={(e) => setEditingUser({ ...editingUser, fullName: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
                <select
                  value={editingUser.role}
                  onChange={(e: any) => setEditingUser({ ...editingUser, role: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="owner">Owner / Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={editingUser.phone || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <input
                type="checkbox"
                id="isActiveCheck"
                checked={editingUser.isActive !== false}
                disabled={editingUser.id === currentUser?.id}
                onChange={(e) => setEditingUser({ ...editingUser, isActive: e.target.checked })}
                className="w-4 h-4 text-brand-600 rounded disabled:opacity-50"
              />
              <label htmlFor="isActiveCheck" className={`text-xs font-semibold text-slate-800 ${editingUser.id === currentUser?.id ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                Account Active (Uncheck to pause login access)
                {editingUser.id === currentUser?.id && (
                  <span className="block text-[11px] text-slate-400 font-normal">You cannot pause your own account</span>
                )}
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 min-h-[40px] text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 min-h-[40px] text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow transition"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Mandatory Confirmation Modal for User Deletion */}
      {deleteTargetUser && (
        <ReasonModal
          isOpen={true}
          onClose={() => setDeleteTargetUser(null)}
          onConfirm={handleDeleteUserConfirm}
          title={`Permanently Delete User: ${deleteTargetUser.fullName}`}
          description={`Are you sure you want to permanently delete the account for "${deleteTargetUser.fullName}" (${deleteTargetUser.role.toUpperCase()}, Phone: ${formatIndianPhone(deleteTargetUser.normalizedPhone || deleteTargetUser.phone)})? This user will immediately be barred from logging in. All historical sales, closings, bills, and payment records created in the ledger will remain safely preserved.`}
          confirmText={deleting ? 'Deleting...' : 'Permanently Delete Account'}
          isDanger={true}
        />
      )}
    </div>
  );
};
