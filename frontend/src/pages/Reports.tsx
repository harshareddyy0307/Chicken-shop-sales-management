import React, { useState, useEffect } from 'react';
import {
  FileBarChart,
  Calendar,
  Download,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  TrendingUp,
  Wallet,
  Scale,
  ShoppingBag,
  ArrowRightLeft,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useBusinessDate } from '../context/DateContext';
import { useToast } from '../context/ToastContext';
import { reportsApi } from '../services/api';
import { formatCurrency, formatKg, formatDate, isSundayDate, getDayOfWeekName } from '../utils/format';
import { DailyClosingCalendar } from '../components/DailyClosingCalendar';
import { MonthlyPdfModal } from '../components/MonthlyPdfModal';

export const ReportsPage: React.FC = () => {
  const { selectedDate, setSelectedDate } = useBusinessDate();
  const { success, error } = useToast();

  const [reportType, setReportType] = useState<'daily' | 'monthly'>('daily');
  const [loading, setLoading] = useState(true);

  // Daily Data
  const [dailyData, setDailyData] = useState<any>(null);

  // Monthly Data
  const dateParts = selectedDate ? selectedDate.split('-') : [];
  const initYear = dateParts.length === 3 ? parseInt(dateParts[0], 10) : new Date().getFullYear();
  const initMonth = dateParts.length === 3 ? parseInt(dateParts[1], 10) : new Date().getMonth() + 1;

  const [selectedMonth, setSelectedMonth] = useState(initMonth);
  const [selectedYear, setSelectedYear] = useState(initYear);
  const [monthlyData, setMonthlyData] = useState<any>(null);

  const fetchReports = async () => {
    try {
      setLoading(true);
      if (reportType === 'daily') {
        const res = await reportsApi.getDaily(selectedDate);
        if (res.data.success) {
          setDailyData(res.data.data);
        }
      } else {
        const res = await reportsApi.getMonthly({ year: selectedYear, month: selectedMonth });
        if (res.data.success) {
          setMonthlyData(res.data.data);
        }
      }
    } catch {
      error('Failed to load report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [reportType, selectedDate, selectedMonth, selectedYear]);

  const handleExportExcel = () => {
    const url = `/api/reports/export-excel?type=${reportType}&date=${selectedDate}&year=${selectedYear}&month=${selectedMonth}`;
    window.open(url, '_blank');
    success('Generating Excel spreadsheet download...');
  };

  const handleExportCsv = () => {
    const url = `/api/reports/export-csv?type=${reportType}&date=${selectedDate}&year=${selectedYear}&month=${selectedMonth}`;
    window.open(url, '_blank');
    success('Generating CSV download...');
  };

  // Monthly Closing PDF
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [lastDownloadedPdf, setLastDownloadedPdf] = useState<string | null>(null);
  const [generatingDailyPdf, setGeneratingDailyPdf] = useState(false);

  const handleDownloadPdf = async (year: number, month: number) => {
    try {
      setGeneratingPdf(true);
      const res = await reportsApi.downloadMonthlyPdf(year, month);
      setLastDownloadedPdf(res.filename);
      success(`Monthly closing PDF generated and downloaded: ${res.filename}`);
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to generate monthly closing PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadDailyPdf = async (dateStr: string) => {
    try {
      setGeneratingDailyPdf(true);
      const res = await reportsApi.downloadDailyPdf(dateStr);
      if (res.success) {
        success(`Daily Closing PDF downloaded: ${res.filename}`);
      }
    } catch (err: any) {
      error(err?.response?.data?.error || err.message || 'Failed to download daily closing PDF.');
    } finally {
      setGeneratingDailyPdf(false);
    }
  };

  const dMetrics = dailyData?.metrics;
  const mTotals = monthlyData?.monthlyTotals;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Financial Reports & Statements</h1>
          <p className="text-xs text-slate-500 mt-1">
            Audited daily balancing summaries, monthly P&L statements, and data exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Daily PDF Button (when viewing Daily report) */}
          {reportType === 'daily' && (
            <button
              type="button"
              onClick={() => handleDownloadDailyPdf(selectedDate)}
              disabled={generatingDailyPdf}
              className="flex-1 sm:flex-none justify-center px-3.5 py-2 min-h-[38px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
              title="Download single-day Daily Closing PDF report"
            >
              {generatingDailyPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Day PDF</span>
                </>
              )}
            </button>
          )}

          {/* Export Buttons */}
          <button
            onClick={() => setIsPdfModalOpen(true)}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 min-h-[38px] bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            title="Download complete Monthly Daily Business Closing PDF"
          >
            <FileText className="w-3.5 h-3.5 text-rose-600" />
            <span>Monthly Closing PDF</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex-1 sm:flex-none justify-center px-3 py-2 min-h-[38px] bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 min-h-[38px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel (.xlsx)</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 min-h-[38px] bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold w-full sm:w-auto">
          <button
            onClick={() => setReportType('daily')}
            className={`flex-1 sm:flex-none text-center px-3 sm:px-4 py-2 min-h-[38px] rounded-lg transition ${
              reportType === 'daily' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Daily Operations Report
          </button>
          <button
            onClick={() => setReportType('monthly')}
            className={`flex-1 sm:flex-none text-center px-3 sm:px-4 py-2 min-h-[38px] rounded-lg transition ${
              reportType === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Monthly P&L Summary
          </button>
        </div>

        {reportType === 'daily' ? (
          <DailyClosingCalendar
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            align="right"
          />
        ) : (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className="flex-1 sm:flex-none px-3 py-2 min-h-[38px] bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
            >
              {[
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
              ].map((m, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="px-3 py-2 min-h-[38px] bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-xs text-slate-500">Generating financial statement...</div>
      ) : reportType === 'daily' ? (
        /* DAILY REPORT VIEW */
        <div className="space-y-6">
          {/* Key Metrics Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 text-white p-6 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div>
                <span className="text-xs text-brand-400 font-semibold uppercase">Daily Business Closing Report</span>
                <h2 className="text-xl font-bold mt-0.5">{formatDate(selectedDate)}</h2>
              </div>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                  dailyData?.closing?.status === 'Completed'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}
              >
                {dailyData?.closing?.status || 'Closing Not Finalized'}
              </span>
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400">Total Counter Collection:</span>
                <p className="text-xl font-bold text-white mt-1 truncate">{formatCurrency(dMetrics?.totalCounterCollection)}</p>
                <p className="text-[10px] text-slate-400">Cash + UPI + Card received</p>
              </div>

              <div>
                <span className="text-slate-400">Chicken Sales Revenue:</span>
                <p className="text-xl font-bold text-blue-400 mt-1 truncate">{formatCurrency(dMetrics?.chickenSalesRevenue)}</p>
                <p className="text-[10px] text-slate-400">From stock sold × rate</p>
              </div>

              <div>
                <span className="text-slate-400">Estimated Gross Profit:</span>
                <p className="text-xl font-bold text-indigo-400 mt-1 truncate">{formatCurrency(dMetrics?.grossProfit)}</p>
                <p className="text-[10px] text-slate-400">Sales Revenue − COGS</p>
              </div>

              <div>
                <span className="text-slate-400">Estimated Net Profit:</span>
                <p className="text-2xl font-black text-emerald-400 mt-1 truncate">{formatCurrency(dMetrics?.netProfit)}</p>
                <p className="text-[10px] text-slate-400">Gross + Adj − Expenses</p>
              </div>
            </div>
          </div>

          {/* Breakdown Sections: Credit vs Cash Collections & Stock Movement */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Credit & Collections Summary
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-600">New Customer Credit Generated (Katha):</span>
                  <span className="font-bold text-amber-800">{formatCurrency(dMetrics?.totalCreditGenerated)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-600">Collections on Katha Accounts:</span>
                  <span className="font-bold text-emerald-800">
                    {formatCurrency(dMetrics?.totalCustomerPaymentsReceived)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-600">Payments to Poultry Distributors:</span>
                  <span className="font-bold text-rose-800">
                    {formatCurrency(dMetrics?.totalDistributorPaymentsMade)}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">Operating Expenses Paid Today:</span>
                  <span className="font-bold text-slate-900">{formatCurrency(dMetrics?.totalOperatingExpenses)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Stock Reconciliation
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-600">Opening Stock:</span>
                  <span className="font-bold text-slate-800">{formatKg(dailyData?.closing?.opening_stock_kg)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-600">+ New Deliveries Received:</span>
                  <span className="font-bold text-cyan-800">+{formatKg(dailyData?.closing?.new_stock_kg)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-600">Total Available Stock:</span>
                  <span className="font-bold text-slate-900">{formatKg(dailyData?.closing?.total_available_stock_kg)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-600">− Stock Transferred to Other Shops:</span>
                  <span className="font-bold text-amber-800">
                    {parseFloat(dailyData?.closing?.stock_transferred_kg || dMetrics?.totalStockTransferredKg) > 0
                      ? `−${formatKg(dailyData?.closing?.stock_transferred_kg || dMetrics?.totalStockTransferredKg)}`
                      : '0 kg'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-600 font-semibold text-emerald-900">Stock Available for Sale:</span>
                  <span className="font-black text-emerald-950">
                    {formatKg(dailyData?.closing?.stock_available_for_sale_kg ?? dailyData?.closing?.total_available_stock_kg)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-600">− Chicken Sold:</span>
                  <span className="font-bold text-amber-800">−{formatKg(dailyData?.closing?.quantity_sold_kg)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">Closing Stock Balance:</span>
                  <span className="font-black text-emerald-800">
                    {formatKg(dailyData?.closing?.closing_stock_kg)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Daily Stock Transfers Table (if any) */}
          {dailyData?.transfers && dailyData.transfers.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <ArrowRightLeft className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Stock Transfers to Other Shops ({dailyData.transfers.length})
                </h3>
              </div>
              {/* Mobile Transfers Cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {dailyData.transfers.map((t: any) => (
                  <div key={t.id} className="py-3 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-900 text-sm">{t.destination_shop}</span>
                        {t.notes && <p className="text-[11px] text-slate-400 mt-0.5">{t.notes}</p>}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          t.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Weight</span>
                        <span className="font-bold text-amber-800">{formatKg(t.transferred_quantity_kg)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Valuation Cost</span>
                        <span className="font-bold text-slate-800">{formatCurrency(t.total_transfer_cost)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                      <th className="py-2.5 px-3">Destination Shop</th>
                      <th className="py-2.5 px-3">Transferred Weight</th>
                      <th className="py-2.5 px-3">Valuation Cost</th>
                      <th className="py-2.5 px-3">Notes</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailyData.transfers.map((t: any) => (
                      <tr key={t.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{t.destination_shop}</td>
                        <td className="py-2.5 px-3 font-bold text-amber-700">{formatKg(t.transferred_quantity_kg)}</td>
                        <td className="py-2.5 px-3 text-slate-700">{formatCurrency(t.total_transfer_cost)}</td>
                        <td className="py-2.5 px-3 text-slate-500">{t.notes || '—'}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              t.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* MONTHLY REPORT VIEW */
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-slate-900 to-slate-950 text-white p-6 rounded-2xl shadow-sm">
            <div className="border-b border-slate-800 pb-3 mb-4">
              <span className="text-xs text-brand-400 font-semibold uppercase">Monthly Comprehensive Statement</span>
              <h2 className="text-xl font-bold mt-0.5">
                {[
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
                ][selectedMonth - 1]}{' '}
                {selectedYear}
              </h2>
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-400">Total Counter Collection:</span>
                <p className="text-xl font-bold text-white mt-1 truncate">
                  {formatCurrency(mTotals?.monthlyCounterCollection)}
                </p>
              </div>

              <div>
                <span className="text-slate-400">Total Sales Revenue:</span>
                <p className="text-xl font-bold text-blue-400 mt-1 truncate">
                  {formatCurrency(mTotals?.monthlySalesRevenue || mTotals?.monthlyChickenSalesRevenue)}
                </p>
                {mTotals?.monthlyEggSalesRevenue > 0 && (
                  <p className="text-[10px] text-blue-300">
                    Chicken: {formatCurrency(mTotals?.monthlyChickenSalesRevenue)} + Eggs: {formatCurrency(mTotals?.monthlyEggSalesRevenue)}
                  </p>
                )}
              </div>

              <div>
                <span className="text-slate-400">Total Chicken Sold:</span>
                <p className="text-xl font-bold text-amber-400 mt-1 truncate">
                  {formatKg(mTotals?.monthlyChickenStockSoldKg)}
                </p>
              </div>

              <div>
                <span className="text-slate-400">Monthly Net Profit:</span>
                <p className="text-2xl font-black text-emerald-400 mt-1 truncate">
                  {formatCurrency(mTotals?.monthlyNetProfit)}
                </p>
              </div>
            </div>
          </div>

          {/* Monthly Closing Report (PDF) Card */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-rose-600" />
                <h3 className="text-sm font-bold text-slate-900">Monthly Closing Report (PDF)</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  Audit Ready
                </span>
              </div>
              <p className="text-xs text-slate-500 max-w-2xl">
                Download a single consolidated PDF containing the Page 1 Executive Summary and complete Daily Business Closing review & submit details for every day of the month.
              </p>
              {lastDownloadedPdf && (
                <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 mt-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Downloaded: {lastDownloadedPdf}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleDownloadPdf(selectedYear, selectedMonth)}
                disabled={generatingPdf}
                className="w-full sm:w-auto px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-sm disabled:opacity-50"
              >
                {generatingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating Monthly Closing PDF...</span>
                  </>
                ) : lastDownloadedPdf ? (
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

          {/* Monthly Detailed Accounts Table */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Monthly Financial Summary Breakdown
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl flex flex-col xs:flex-row xs:items-center justify-between gap-1">
                <span className="text-slate-600">Total Distributor Purchases Cost:</span>
                <span className="font-bold text-rose-700">{formatCurrency(mTotals?.monthlyPurchaseCost)}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl flex flex-col xs:flex-row xs:items-center justify-between gap-1">
                <span className="text-slate-600">Total Distributor Payments Disbursed:</span>
                <span className="font-bold text-slate-900">
                  {formatCurrency(mTotals?.monthlyDistributorPayments)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl flex flex-col xs:flex-row xs:items-center justify-between gap-1">
                <span className="text-slate-600">Total Stock Transferred to Other Shops:</span>
                <span className="font-bold text-amber-800">
                  {formatKg(mTotals?.monthlyStockTransferredKg || 0)} ({formatCurrency(mTotals?.monthlyStockTransferredCost || 0)})
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl flex flex-col xs:flex-row xs:items-center justify-between gap-1">
                <span className="text-slate-600">Total Customer Credit Generated:</span>
                <span className="font-bold text-amber-800">
                  {formatCurrency(mTotals?.monthlyCustomerCreditGenerated)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl flex flex-col xs:flex-row xs:items-center justify-between gap-1">
                <span className="text-slate-600">Customer Debt Payments Received:</span>
                <span className="font-bold text-emerald-800">
                  {formatCurrency(mTotals?.monthlyCustomerPaymentsReceived)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl flex flex-col xs:flex-row xs:items-center justify-between gap-1">
                <span className="text-slate-600">Operating Expenses for Month:</span>
                <span className="font-bold text-rose-700">{formatCurrency(mTotals?.monthlyOperatingExpenses)}</span>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl flex flex-col xs:flex-row xs:items-center justify-between gap-1 sm:col-span-2">
                <div>
                  <span className="font-bold text-emerald-900">Estimated Gross Profit:</span>
                  <p className="text-[10px] text-emerald-700 font-medium">Monthly Net Profit − Operating Expenses for Month</p>
                </div>
                <span className="font-black text-emerald-950 text-sm">
                  {formatCurrency(
                    mTotals?.monthlyGrossProfit !== undefined
                      ? mTotals.monthlyGrossProfit
                      : (Number(mTotals?.monthlyNetProfit || 0) - Number(mTotals?.monthlyOperatingExpenses || 0))
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Daily Closings Breakdown for the Month */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">
                Daily Closings Breakdown ({monthlyData?.dailyClosings?.length || 0} Records)
              </h3>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span>Sundays Highlighted (Peak Sales)</span>
              </div>
            </div>

            {monthlyData?.dailyClosings && monthlyData.dailyClosings.length > 0 ? (
              <>
                {/* Mobile Daily Closings Cards */}
                <div className="md:hidden space-y-3">
                  {monthlyData.dailyClosings.map((c: any) => {
                    const isSunday = isSundayDate(c.business_date);
                    return (
                      <div
                        key={c.id}
                        className={`space-y-2.5 text-xs rounded-xl transition ${
                          isSunday
                            ? 'bg-amber-50/80 p-3.5 border-2 border-amber-400 shadow-xs'
                            : 'p-3 bg-white border border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-sm text-slate-900">{formatDate(c.business_date)}</span>
                            {isSunday ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-950 border border-amber-400 shadow-2xs">
                                <Sparkles className="w-2.5 h-2.5 text-amber-700" />
                                SUN (PEAK)
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-slate-400">
                                ({getDayOfWeekName(c.business_date)})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                c.status === 'Completed'
                                  ? 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]'
                                  : 'bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]'
                              }`}
                            >
                              {c.status}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDownloadDailyPdf(c.business_date)}
                              disabled={generatingDailyPdf}
                              className="px-2 py-0.5 bg-white hover:bg-emerald-50 active:bg-emerald-100 border border-slate-200 text-slate-700 hover:text-emerald-800 rounded-md text-[10px] font-bold flex items-center gap-1 transition shadow-2xs disabled:opacity-50"
                              title={`Download ${formatDate(c.business_date)} Closing PDF`}
                            >
                              <Download className="w-3 h-3 text-emerald-600" />
                              <span>PDF</span>
                            </button>
                          </div>
                        </div>
                        <div className={`grid grid-cols-2 gap-2 p-2.5 rounded-xl text-xs ${isSunday ? 'bg-white/90 border border-amber-200' : 'bg-slate-50'}`}>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Counter Collection</span>
                            <span className="font-bold text-slate-900">{formatCurrency(c.total_counter_collection)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Chicken Sales</span>
                            <span className="font-bold text-blue-700">{formatCurrency(c.chicken_sales_revenue)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Chicken Sold</span>
                            <span className="font-semibold text-slate-700">{formatKg(c.quantity_sold_kg)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Closing Stock</span>
                            <span className="font-semibold text-emerald-700">{formatKg(c.closing_stock_kg)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-1 text-xs">
                          <span className="text-slate-500 font-medium">Estimated Net Profit:</span>
                          <span className="text-sm font-black text-emerald-800">{formatCurrency(c.estimated_net_profit)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Counter Collection</th>
                        <th className="py-2.5 px-3">Chicken Sales Rev</th>
                        <th className="py-2.5 px-3">Egg Sales Rev</th>
                        <th className="py-2.5 px-3">Chicken Sold</th>
                        <th className="py-2.5 px-3">Closing Stock</th>
                        <th className="py-2.5 px-3">Net Profit</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {monthlyData.dailyClosings.map((c: any) => {
                        const isSunday = isSundayDate(c.business_date);
                        return (
                          <tr
                            key={c.id}
                            className={`transition-colors ${
                              isSunday
                                ? 'bg-amber-50/80 hover:bg-amber-100/90 font-semibold text-slate-900'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className={`py-2.5 px-3 font-bold ${isSunday ? 'border-l-4 border-l-amber-500' : 'text-slate-800'}`}>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={isSunday ? 'text-amber-950 font-black' : 'text-slate-900'}>
                                  {formatDate(c.business_date)}
                                </span>
                                {isSunday ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-950 border border-amber-400 shadow-2xs">
                                    <Sparkles className="w-2.5 h-2.5 text-amber-700" />
                                    SUN (PEAK)
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-medium text-slate-400">
                                    ({getDayOfWeekName(c.business_date)})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-900">{formatCurrency(c.total_counter_collection)}</td>
                            <td className="py-2.5 px-3 text-blue-700 font-semibold">{formatCurrency(c.chicken_sales_revenue)}</td>
                            <td className="py-2.5 px-3 text-amber-700 font-semibold">{formatCurrency(c.egg_sales_revenue || 0)}</td>
                            <td className="py-2.5 px-3 text-slate-700">{formatKg(c.quantity_sold_kg)}</td>
                            <td className="py-2.5 px-3 text-emerald-700">{formatKg(c.closing_stock_kg)}</td>
                            <td className="py-2.5 px-3 font-bold text-emerald-800">{formatCurrency(c.estimated_net_profit)}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  c.status === 'Completed'
                                    ? 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]'
                                    : 'bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]'
                                }`}
                              >
                                {c.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDownloadDailyPdf(c.business_date)}
                                disabled={generatingDailyPdf}
                                className="px-2.5 py-1 bg-white hover:bg-emerald-50 active:bg-emerald-100 text-slate-700 hover:text-emerald-800 border border-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition shadow-2xs disabled:opacity-50"
                                title={`Download ${formatDate(c.business_date)} Closing PDF`}
                              >
                                <Download className="w-3.5 h-3.5 text-emerald-600" />
                                <span>PDF</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No daily closings recorded for this month.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Monthly Closing Report PDF Modal */}
      <MonthlyPdfModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        initialMonth={selectedMonth}
        initialYear={selectedYear}
      />
    </div>
  );
};
