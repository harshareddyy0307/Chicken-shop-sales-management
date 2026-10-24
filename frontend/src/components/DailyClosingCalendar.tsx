import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ChevronDown, AlertCircle, X } from 'lucide-react';
import { closingApi } from '../services/api';
import { formatDate, getTodayDateString, isFutureDate } from '../utils/format';
import { useToast } from '../context/ToastContext';

interface DailyClosingCalendarProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  isCompleted?: boolean;
  refreshTrigger?: number;
  className?: string;
  label?: string;
  showStatusBadge?: boolean;
  align?: 'left' | 'right';
  buttonVariant?: 'default' | 'subtle';
  disabled?: boolean;
}

interface DateStatus {
  status: string;
  id: number;
  submittedAt: string | null;
}

export const DailyClosingCalendar: React.FC<DailyClosingCalendarProps> = ({
  selectedDate,
  onSelectDate,
  isCompleted,
  refreshTrigger = 0,
  className = '',
  label,
  showStatusBadge = true,
  align = 'left',
  buttonVariant = 'default',
  disabled = false,
}) => {
  const { error: toastError } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const todayStr = getTodayDateString();

  // Selected date components or default to today
  const initDate = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date(`${todayStr}T00:00:00`);
  const [viewYear, setViewYear] = useState<number>(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initDate.getMonth()); // 0-indexed

  const [statuses, setStatuses] = useState<Record<string, DateStatus>>({});
  const [loading, setLoading] = useState<boolean>(false);

  // Sync view month when selectedDate changes from outside
  useEffect(() => {
    if (selectedDate) {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m)) {
          setViewYear(y);
          setViewMonth(m);
        }
      }
    }
  }, [selectedDate]);

  // Fetch month closing statuses from database
  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  useEffect(() => {
    let isMounted = true;
    const fetchStatuses = async () => {
      try {
        setLoading(true);
        const res = await closingApi.getCalendarStatus(monthKey);
        if (isMounted && res.data?.success) {
          setStatuses(res.data.data || {});
        }
      } catch (err) {
        console.error('Failed to fetch calendar closing statuses:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchStatuses();
    return () => {
      isMounted = false;
    };
  }, [monthKey, refreshTrigger]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleJumpToToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const [y, m] = todayStr.split('-').map((v) => parseInt(v, 10));
    setViewYear(y);
    setViewMonth(m - 1);
    onSelectDate(todayStr);
    setIsOpen(false);
  };

  const handleDateClick = (dateStr: string) => {
    if (isFutureDate(dateStr)) {
      toastError('Future-date closing is not allowed. Please select today or a previous date.');
      return;
    }
    onSelectDate(dateStr);
    setIsOpen(false);
  };

  // Month info
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sunday

  // Mon-Sun format: convert 0 (Sun) to 6, 1 (Mon) to 0, etc.
  const startOffset = (firstDayOfWeek + 6) % 7;

  // Build grid days
  const calendarCells: (string | null)[] = [];
  // Empty leading cells
  for (let i = 0; i < startOffset; i++) {
    calendarCells.push(null);
  }
  // Days of current month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    calendarCells.push(dateStr);
  }

  // Active status of selectedDate
  const currentStatusObj = statuses[selectedDate];
  const isSelectedDateCompleted = isCompleted !== undefined ? isCompleted : currentStatusObj?.status === 'Completed';

  const btnBg = buttonVariant === 'subtle' 
    ? 'bg-slate-100 hover:bg-slate-200/80 border-slate-200' 
    : 'bg-white hover:bg-slate-50 border-slate-200 shadow-xs';

  const [computedAlign, setComputedAlign] = useState<'left' | 'right'>(align);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const popoverWidth = 320;
      if (rect.left + popoverWidth > window.innerWidth - 16) {
        setComputedAlign('right');
      } else if (rect.right - popoverWidth < 16) {
        setComputedAlign('left');
      } else {
        setComputedAlign(align);
      }
    }
  }, [isOpen, align]);

  const popoverAlignClass = computedAlign === 'right' 
    ? 'right-0' 
    : 'left-0';

  const isFullWidth = className.includes('w-full');

  const renderCalendarContent = (isMobileModal: boolean = false) => (
    <div className="space-y-3">
      {/* Calendar Header with Month Navigation */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition min-w-[32px] min-h-[32px] flex items-center justify-center"
          title="Previous Month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="text-center">
          <span className="text-xs font-bold text-slate-900 block">
            {monthNames[viewMonth]} {viewYear}
          </span>
          {loading && <span className="text-[10px] text-slate-400">Loading statuses...</span>}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition min-w-[32px] min-h-[32px] flex items-center justify-center"
            title="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {isMobileModal && (
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition min-w-[32px] min-h-[32px] flex items-center justify-center ml-1 border border-slate-200"
              title="Close Calendar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Day of Week Headers (Mon - Sun) */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] sm:text-[11px] font-bold text-slate-400">
        <span>Mo</span>
        <span>Tu</span>
        <span>We</span>
        <span>Th</span>
        <span>Fr</span>
        <span>Sa</span>
        <span className="text-amber-600 font-extrabold bg-amber-50/80 rounded py-0.5">Su</span>
      </div>

      {/* Month Days Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center">
        {calendarCells.map((dateStr, idx) => {
          if (!dateStr) {
            return <div key={`empty-${idx}`} className="h-8 w-8 sm:h-8.5 sm:w-8.5" />;
          }

          const dayNumber = parseInt(dateStr.split('-')[2], 10);
          const isSunday = idx % 7 === 6;
          const isFuture = isFutureDate(dateStr);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const dayStatus = statuses[dateStr]?.status;
          const isCompletedLocked = dayStatus === 'Completed';

          // Styling per requirements
          let cellClasses =
            'h-8 w-8 sm:h-8.5 sm:w-8.5 mx-auto rounded-lg text-xs flex flex-col items-center justify-center transition font-semibold relative ';

          if (isFuture) {
            // Future date: Disabled & visually distinct
            cellClasses += 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed opacity-60 ';
          } else if (isCompletedLocked) {
            // Light Green: #DCFCE7, text: #166534
            cellClasses += 'bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] hover:ring-1 hover:ring-[#166534] cursor-pointer ';
          } else {
            // Light Red: #FEE2E2, text: #991B1B (Draft, in progress, no record, reopened)
            cellClasses += 'bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] hover:ring-1 hover:ring-[#991B1B] cursor-pointer ';
          }

          if (isSelected) {
            cellClasses += 'ring-2 ring-slate-900 ring-offset-1 font-black shadow-sm ';
          }

          return (
            <button
              key={dateStr}
              type="button"
              disabled={isFuture}
              onClick={() => handleDateClick(dateStr)}
              className={cellClasses}
              title={
                isFuture
                  ? 'Future Date (Disabled)'
                  : isCompletedLocked
                  ? `${formatDate(dateStr)}${isSunday ? ' (Sunday - Peak)' : ''}: Completed & Locked`
                  : `${formatDate(dateStr)}${isSunday ? ' (Sunday - Peak)' : ''}: Not Completed`
              }
            >
              <span>{dayNumber}</span>
              {isSunday && !isFuture && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 absolute top-0.5 right-0.5" title="Sunday Peak Day" />
              )}
              {isToday && <span className="w-1 h-1 rounded-full bg-current absolute bottom-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Legend Section */}
      <div className="pt-2.5 border-t border-slate-100 space-y-1.5 text-[10px] sm:text-[11px]">
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-3.5 h-3.5 rounded bg-[#DCFCE7] border border-[#86EFAC] shrink-0" />
            <span className="text-[#166534] font-medium truncate">Completed & Locked</span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-3.5 h-3.5 rounded bg-[#FEE2E2] border border-[#FCA5A5] shrink-0" />
            <span className="text-[#991B1B] font-medium truncate">Not Completed</span>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-3.5 h-3.5 rounded bg-slate-100 border border-slate-200 shrink-0" />
            <span className="text-slate-400 font-medium truncate">Future (Disabled)</span>
          </div>
          <button
            type="button"
            onClick={handleJumpToToday}
            className="text-[11px] font-bold text-brand-700 hover:text-brand-800 hover:underline shrink-0"
          >
            Jump to Today
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`relative ${isFullWidth ? 'block w-full' : 'inline-block'} ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center justify-between ${isFullWidth ? 'w-full' : ''} gap-2 ${btnBg} px-3 py-1.5 rounded-xl border transition text-left ${
          disabled ? 'opacity-60 cursor-not-allowed bg-slate-100 text-slate-500' : 'cursor-pointer'
        }`}
        aria-label="Select Date"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          <CalendarIcon className="w-4 h-4 text-emerald-600 shrink-0" />
          {label && <span className="text-xs font-medium text-slate-500 hidden sm:inline truncate">{label}</span>}
          <span className="text-xs font-bold text-slate-800 truncate">{formatDate(selectedDate)}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {showStatusBadge && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 transition-colors ${
                isSelectedDateCompleted
                  ? 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]'
                  : 'bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]'
              }`}
            >
              <span className="hidden sm:inline">
                {isSelectedDateCompleted ? 'Completed & Locked' : 'Not Completed'}
              </span>
              <span className="sm:hidden">
                {isSelectedDateCompleted ? 'Completed' : 'Not Completed'}
              </span>
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Popover / Modal Calendar */}
      {isOpen && (
        <>
          {/* Mobile: Centered Modal with Backdrop (< sm) */}
          <div
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs sm:hidden flex items-center justify-center p-2 xs:p-3 animate-in fade-in duration-150"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="w-full max-w-[calc(100vw-1rem)] xs:max-w-[320px] bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 xs:p-3.5 animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {renderCalendarContent(true)}
            </div>
          </div>

          {/* Desktop: Floating Popover Dropdown (>= sm) */}
          <div
            className={`hidden sm:block absolute ${popoverAlignClass} mt-2 z-50 w-[310px] sm:w-[320px] bg-white rounded-2xl shadow-2xl border border-slate-200 p-3.5 animate-in fade-in zoom-in-95 duration-150`}
          >
            {renderCalendarContent(false)}
          </div>
        </>
      )}
    </div>
  );
};
