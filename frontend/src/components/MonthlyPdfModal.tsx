import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Loader2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  X,
  FileCheck,
} from 'lucide-react';
import { reportsApi } from '../services/api';
import { useToast } from '../context/ToastContext';

interface MonthlyPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMonth?: number;
  initialYear?: number;
}

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

export const MonthlyPdfModal: React.FC<MonthlyPdfModalProps> = ({
  isOpen,
  onClose,
  initialMonth,
  initialYear,
}) => {
  const { success, error } = useToast();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth || now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(initialYear || now.getFullYear());

  const [preview, setPreview] = useState<{
    daysInMonth: number;
    completedCount: number;
    draftCount: number;
    missingCount: number;
    futureCount: number;
    filename: string;
  } | null>(null);

  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);
  const [lastDownloadedFile, setLastDownloadedFile] = useState<string | null>(null);

  useEffect(() => {
    if (initialMonth) setSelectedMonth(initialMonth);
    if (initialYear) setSelectedYear(initialYear);
  }, [initialMonth, initialYear]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchPreview = async () => {
      try {
        setLoadingPreview(true);
        const res = await reportsApi.getMonthlyPdfPreview({
          year: selectedYear,
          month: selectedMonth,
        });
        if (isMounted && res.data?.success) {
          setPreview(res.data.data);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Failed to fetch preview', err);
        }
      } finally {
        if (isMounted) {
          setLoadingPreview(false);
        }
      }
    };

    fetchPreview();

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedMonth, selectedYear]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const res = await reportsApi.downloadMonthlyPdf(selectedYear, selectedMonth);
      setLastDownloadedFile(res.filename);
      success(`Monthly closing PDF generated and downloaded: ${res.filename}`);
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to generate monthly closing PDF.');
    } finally {
      setGenerating(false);
    }
  };

  const monthLabel = MONTH_NAMES[selectedMonth - 1] || 'Selected Month';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 text-white flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-400/30 flex items-center justify-center shrink-0 text-brand-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold leading-tight">
                Monthly Closing Report (PDF)
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Consolidated executive summary & daily closing breakdown
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-slate-700">
          {/* Controls: Month & Year Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
              Select Month & Year
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 font-medium block mb-1">Month</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                  disabled={generating}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 font-medium block mb-1">Year</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                  disabled={generating}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                >
                  {[2024, 2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Month Status & Breakdown Preview */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                {monthLabel} {selectedYear} Status
              </span>
              {loadingPreview ? (
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking days...
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 font-medium">
                  {preview?.daysInMonth || 30} Calendar Days
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 text-center">
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <span className="text-xs font-bold text-emerald-800 block">
                  {preview?.completedCount ?? '—'}
                </span>
                <span className="text-[10px] text-emerald-700 font-medium">Completed</span>
              </div>
              <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="text-xs font-bold text-amber-800 block">
                  {preview?.draftCount ?? '—'}
                </span>
                <span className="text-[10px] text-amber-700 font-medium">Draft / Open</span>
              </div>
              <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg">
                <span className="text-xs font-bold text-rose-800 block">
                  {preview?.missingCount ?? '—'}
                </span>
                <span className="text-[10px] text-rose-700 font-medium">Missing</span>
              </div>
              <div className="p-2 bg-slate-100 border border-slate-200 rounded-lg">
                <span className="text-xs font-bold text-slate-700 block">
                  {preview?.futureCount ?? '—'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Future</span>
              </div>
            </div>
          </div>

          {/* Document Content Details */}
          <div className="space-y-2 text-xs">
            <p className="font-semibold text-slate-800">Report Contents:</p>
            <ul className="space-y-1.5 text-slate-600 text-[11px]">
              <li className="flex items-start gap-2">
                <FileCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Page 1 Executive Summary:</strong> Monthly sales, distributor purchase costs,
                  operating expenses, gross & net profit, and month-end Katha & distributor balances.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <FileCheck className="w-3.5 h-3.5 text-brand-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Pages 2+ Daily Review:</strong> Complete day-by-day record of purchases,
                  counter collections, stock reconciliation, shop transfers, adjustments, and daily profit.
                </span>
              </li>
            </ul>
          </div>

          {/* Last Download Notice if generated */}
          {lastDownloadedFile && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
              <div className="flex items-center gap-2 truncate">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">Downloaded: {lastDownloadedFile}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full sm:w-auto px-5 py-2.5 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-sm disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating Monthly Closing PDF...</span>
              </>
            ) : lastDownloadedFile ? (
              <>
                <Download className="w-4 h-4" />
                <span>Download PDF Again</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Generate Monthly Closing PDF</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
