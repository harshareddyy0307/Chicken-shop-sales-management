import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  Calendar,
  User,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { auditApi } from '../services/api';
import { AuditLog } from '../types';
import { formatDate } from '../utils/format';
import { DailyClosingCalendar } from '../components/DailyClosingCalendar';

export const AuditLogPage: React.FC = () => {
  const { hasRole } = useAuth();
  const { error } = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [moduleFilter, setModuleFilter] = useState('All');
  const [actionSearch, setActionSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Expand Row for JSON diff
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await auditApi.getAll({
        module: moduleFilter !== 'All' ? moduleFilter : undefined,
        action: actionSearch.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      if (res.data.success) {
        setLogs(res.data.data);
        setTotalCount(res.data.pagination?.total || res.data.data.length);
      }
    } catch {
      error('Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [moduleFilter, startDate, endDate]);

  const toggleExpand = (id: number) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">System Audit Log</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-900 text-white">
              Immutable Server Trail
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Permanent, tamper-proof record of every financial edit, deletion, closing reopen, and user activity.
          </p>
        </div>

        <div className="w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search action keyword..."
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
              className="w-full pl-8 pr-3 py-2 min-h-[38px] bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2 w-full xs:w-auto">
          <span className="text-slate-400 font-medium shrink-0">Module:</span>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="flex-1 xs:flex-none px-3 py-2 min-h-[38px] bg-slate-50 border border-slate-200 rounded-xl font-semibold outline-none"
          >
            <option value="All">All Modules</option>
            <option value="DAILY_CLOSING">Daily Closing</option>
            <option value="CUSTOMER_KATHA">Customer Katha</option>
            <option value="DISTRIBUTORS">Distributors</option>
            <option value="DISTRIBUTOR_SUPPLIES">Distributor Supplies</option>
            <option value="DISTRIBUTOR_PAYMENTS">Distributor Payments</option>
            <option value="CHICKEN_SALES">Chicken Sales</option>
            <option value="OPERATING_EXPENSES">Operating Expenses</option>
            <option value="STOCK_MANAGEMENT">Stock Management</option>
            <option value="AUTH">Authentication</option>
          </select>
        </div>

        <div className="flex items-center gap-2 flex-1 xs:flex-none">
          <span className="text-slate-400 font-medium shrink-0">From:</span>
          <DailyClosingCalendar
            selectedDate={startDate}
            onSelectDate={setStartDate}
            showStatusBadge={false}
          />
        </div>

        <div className="flex items-center gap-2 flex-1 xs:flex-none">
          <span className="text-slate-400 font-medium shrink-0">To:</span>
          <DailyClosingCalendar
            selectedDate={endDate}
            onSelectDate={setEndDate}
            showStatusBadge={false}
          />
        </div>

        {(startDate || endDate || moduleFilter !== 'All' || actionSearch) && (
          <button
            onClick={() => {
              setStartDate('');
              setEndDate('');
              setModuleFilter('All');
              setActionSearch('');
            }}
            className="text-brand-600 hover:underline font-semibold py-1 ml-auto"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Audit Log Content */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Recorded Audit Events</h3>
          <span className="text-xs text-slate-400">{totalCount} total events</span>
        </div>

        {/* Mobile View: Audit Cards */}
        <div className="block md:hidden divide-y divide-slate-100">
          {logs.length > 0 ? (
            logs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const hasDetails = log.previous_values || log.new_values;

              return (
                <div key={log.id} className="p-4 space-y-2.5 hover:bg-slate-50/80 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                          log.action.includes('DELETE') || log.action.includes('REVERS')
                            ? 'bg-rose-100 text-rose-800'
                            : log.action.includes('REOPEN')
                            ? 'bg-amber-100 text-amber-800'
                            : log.action.includes('EDIT') || log.action.includes('UPDATE')
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {log.action}
                      </span>
                      <span className="text-xs font-semibold text-slate-700">{log.module}</span>
                      <span className="text-[10px] font-mono text-slate-400">#{log.record_id}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {log.created_at ? new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold text-slate-900">{log.user_name}</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {log.created_at ? new Date(log.created_at).toLocaleDateString('en-IN') : '-'}
                    </span>
                  </div>

                  {log.reason && (
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Reason</span>
                      <p className="text-slate-800 italic break-words">{log.reason}</p>
                    </div>
                  )}

                  {hasDetails && (
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => toggleExpand(log.id)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-100/80 hover:bg-slate-200/60 rounded-xl text-xs font-semibold text-slate-700 transition min-h-[38px]"
                      >
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-slate-500" />
                          <span>{isExpanded ? 'Hide Changed Values' : 'View Changed Values (Diff)'}</span>
                        </div>
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 space-y-2 text-xs font-mono">
                          {log.previous_values && (
                            <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-200">
                              <p className="text-[10px] font-bold text-rose-700 uppercase mb-1">
                                Previous State (Original)
                              </p>
                              <pre className="text-[11px] text-slate-700 overflow-x-auto whitespace-pre-wrap max-h-48">
                                {JSON.stringify(log.previous_values, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.new_values && (
                            <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200">
                              <p className="text-[10px] font-bold text-emerald-700 uppercase mb-1">
                                New State (Updated)
                              </p>
                              <pre className="text-[11px] text-slate-700 overflow-x-auto whitespace-pre-wrap max-h-48">
                                {JSON.stringify(log.new_values, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              No audit records found matching your filters.
            </div>
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                <th className="py-3 px-3 w-8"></th>
                <th className="py-3 px-3">Timestamp (IST)</th>
                <th className="py-3 px-3">User</th>
                <th className="py-3 px-3">Action</th>
                <th className="py-3 px-3">Module</th>
                <th className="py-3 px-3">Record ID</th>
                <th className="py-3 px-3">Reason for Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length > 0 ? (
                logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const hasDetails = log.previous_values || log.new_values;

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => hasDetails && toggleExpand(log.id)}
                        className={`hover:bg-slate-50/80 transition cursor-pointer ${
                          isExpanded ? 'bg-slate-50 font-medium' : ''
                        }`}
                      >
                        <td className="py-3 px-3 text-slate-400">
                          {hasDetails ? (
                            isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )
                          ) : (
                            <span className="w-3.5 inline-block" />
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-mono whitespace-nowrap">
                          {log.created_at ? new Date(log.created_at).toLocaleString('en-IN') : '-'}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-900">{log.user_name}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                              log.action.includes('DELETE') || log.action.includes('REVERS')
                                ? 'bg-rose-100 text-rose-800'
                                : log.action.includes('REOPEN')
                                ? 'bg-amber-100 text-amber-800'
                                : log.action.includes('EDIT') || log.action.includes('UPDATE')
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-semibold">{log.module}</td>
                        <td className="py-3 px-3 font-mono text-slate-500">#{log.record_id}</td>
                        <td className="py-3 px-3 text-slate-800 italic max-w-xs truncate">
                          {log.reason || '-'}
                        </td>
                      </tr>

                      {/* Expanded View showing JSON Diff of previous vs new values */}
                      {isExpanded && (
                        <tr className="bg-slate-50">
                          <td colSpan={7} className="p-4 border-t border-b border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                              {log.previous_values && (
                                <div className="p-3 bg-white rounded-xl border border-rose-200 shadow-sm">
                                  <p className="text-[11px] font-bold text-rose-700 uppercase mb-1">
                                    Previous State (Original)
                                  </p>
                                  <pre className="text-[11px] text-slate-700 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(log.previous_values, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.new_values && (
                                <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-sm">
                                  <p className="text-[11px] font-bold text-emerald-700 uppercase mb-1">
                                    New State (Updated)
                                  </p>
                                  <pre className="text-[11px] text-slate-700 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(log.new_values, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No audit records found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
