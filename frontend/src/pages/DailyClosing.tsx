import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  Check,
  ChevronRight,
  ChevronLeft,
  Save,
  Plus,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Scale,
  Wallet,
  ShoppingBag,
  TrendingUp,
  FileCheck,
  Calendar,
  Lock,
  Egg,
  ArrowRightLeft,
  FileText,
  Download,
  Loader2,
} from 'lucide-react';
import { useBusinessDate } from '../context/DateContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { closingApi, distributorApi } from '../services/api';
import { Distributor } from '../types';
import { formatCurrency, formatKg, formatDate, getTodayDateString, isFutureDate } from '../utils/format';
import { ReasonModal } from '../components/ReasonModal';
import { DailyClosingCalendar } from '../components/DailyClosingCalendar';
import { MonthlyPdfModal } from '../components/MonthlyPdfModal';

interface PurchaseEntry {
  distributorId?: number;
  distributorName: string;
  weightKg: number | string;
  pricePerKg: number | string;
  notes?: string;
  distributorSupplyId?: number;
}

interface AdjustmentEntry {
  type: 'Additional Income' | 'Expense';
  amount: number | string;
  reason: string;
  notes?: string;
}

export interface StockTransferEntry {
  id?: number;
  destinationShop: string;
  transferredWeight: number | string;
  transferDate: string;
  notes?: string;
}

export const DailyClosing: React.FC = () => {
  const { selectedDate, setSelectedDate } = useBusinessDate();
  const { hasRole } = useAuth();
  const { success, error, warning } = useToast();

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [closingRecord, setClosingRecord] = useState<any>(null);
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [calendarRefreshTrigger, setCalendarRefreshTrigger] = useState<number>(0);
  const [isMonthlyPdfModalOpen, setIsMonthlyPdfModalOpen] = useState<boolean>(false);
  const [downloadingDailyPdf, setDownloadingDailyPdf] = useState<boolean>(false);

  const isCompleted = closingRecord?.status === 'Completed';

  const handleDownloadDailyPdf = async () => {
    try {
      setDownloadingDailyPdf(true);
      const res = await closingApi.downloadDailyPdf(selectedDate);
      if (res.success) {
        success(`Daily Closing PDF downloaded: ${res.filename}`);
      }
    } catch (err: any) {
      error(err?.response?.data?.error || err.message || 'Failed to download daily closing PDF.');
    } finally {
      setDownloadingDailyPdf(false);
    }
  };

  const handleSelectCalendarDate = (date: string) => {
    if (isFutureDate(date)) {
      error('Future-date closing is not allowed. Please select today or a previous date.');
      return;
    }
    setSelectedDate(date);
  };

  // Local persistence state & refs (restores values on refresh)
  const isLoadedRef = useRef<boolean>(false);
  const draftDataRef = useRef<any>(null);
  const [isDraftRestored, setIsDraftRestored] = useState<boolean>(false);
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<number | null>(null);

  // Wizard State
  // Step 1: Distributor Purchases
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([
    { distributorName: 'SR Poultry', weightKg: '', pricePerKg: '', notes: '' },
  ]);

  // Step 2: Counter Collection
  const [cash, setCash] = useState<number | string>('');
  const [upi, setUpi] = useState<number | string>('');
  const [card, setCard] = useState<number | string>('');
  const [other, setOther] = useState<number | string>('');
  const [collectionNotes, setCollectionNotes] = useState<string>('');

  // Step 3: Stock and Sales
  const [openingStock, setOpeningStock] = useState<number | string>('');
  const [openingStockRate, setOpeningStockRate] = useState<number | string>('');
  const [openingStockAmount, setOpeningStockAmount] = useState<number | string>('');
  const [includeOpeningAmount, setIncludeOpeningAmount] = useState<boolean>(true);
  const [suggestedPrevRate, setSuggestedPrevRate] = useState<number | null>(null);
  const [suggestedPrevAmount, setSuggestedPrevAmount] = useState<number | null>(null);
  const [suggestedPrevStock, setSuggestedPrevStock] = useState<number | null>(null);
  const [hasPreviousClosing, setHasPreviousClosing] = useState<boolean>(false);
  const [previousDate, setPreviousDate] = useState<string | null>(null);
  const [newStock, setNewStock] = useState<number | string>('');
  const [closingStock, setClosingStock] = useState<number | string>('');
  const [closingStockPrice, setClosingStockPrice] = useState<number | string>('112');
  const [closingStockAmount, setClosingStockAmount] = useState<number | string>('');

  // Stock Transfer to Another Shop (supports multiple destination shops)
  const [hasStockTransfer, setHasStockTransfer] = useState<boolean>(false);
  const [stockTransfers, setStockTransfers] = useState<StockTransferEntry[]>([
    { destinationShop: '', transferredWeight: '', transferDate: '', notes: '' },
  ]);
  const [savedDestinationShops, setSavedDestinationShops] = useState<string[]>([]);

  const addStockTransferRow = () => {
    setStockTransfers((prev) => [
      ...prev,
      { destinationShop: '', transferredWeight: '', transferDate: selectedDate, notes: '' },
    ]);
  };

  const removeStockTransferRow = (index: number) => {
    setStockTransfers((prev) => {
      if (prev.length <= 1) {
        return [{ destinationShop: '', transferredWeight: '', transferDate: selectedDate, notes: '' }];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateStockTransferRow = (index: number, field: keyof StockTransferEntry, value: any) => {
    setStockTransfers((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Synchronized Opening Stock Handlers
  const handleOpeningStockChange = (val: string) => {
    setOpeningStock(val);
    const w = parseFloat(val) || 0;
    let r = parseFloat(String(openingStockRate)) || 0;

    // If rate is currently empty or 0, automatically use suggested previous day closing rate
    if (r === 0 && suggestedPrevRate && suggestedPrevRate > 0) {
      r = suggestedPrevRate;
      setOpeningStockRate(r);
    }

    if (w > 0 && r > 0) {
      setOpeningStockAmount((w * r).toFixed(2));
      setIncludeOpeningAmount(true);
    } else if (w === 0) {
      setOpeningStockAmount('');
    }
  };

  const handleOpeningRateChange = (val: string) => {
    setOpeningStockRate(val);
    const r = parseFloat(val) || 0;
    const w = parseFloat(String(openingStock)) || 0;
    if (w > 0 && r > 0) {
      setOpeningStockAmount((w * r).toFixed(2));
      setIncludeOpeningAmount(true);
    }
  };

  const handleOpeningAmountChange = (val: string) => {
    setOpeningStockAmount(val);
    const amt = parseFloat(val) || 0;
    const w = parseFloat(String(openingStock)) || 0;
    if (w > 0 && amt > 0) {
      setOpeningStockRate((amt / w).toFixed(2));
      setIncludeOpeningAmount(true);
    }
  };

  // Synchronized Closing Stock Handlers
  const handleClosingStockChange = (val: string) => {
    setClosingStock(val);
    const w = parseFloat(val) || 0;
    const pr = parseFloat(String(closingStockPrice)) || 0;
    if (pr > 0) {
      setClosingStockAmount((w * pr).toFixed(2));
    }
  };

  const handleClosingPriceChange = (val: string) => {
    setClosingStockPrice(val);
    const pr = parseFloat(val) || 0;
    const w = parseFloat(String(closingStock)) || 0;
    if (w > 0) {
      setClosingStockAmount((w * pr).toFixed(2));
    }
  };

  const handleClosingAmountChange = (val: string) => {
    setClosingStockAmount(val);
    const amt = parseFloat(val) || 0;
    const w = parseFloat(String(closingStock)) || 0;
    if (w > 0) {
      setClosingStockPrice((amt / w).toFixed(2));
    }
  };

  const applyPreviousClosing = () => {
    if (suggestedPrevStock !== null && suggestedPrevStock >= 0) {
      setOpeningStock(suggestedPrevStock);
    }
    const r = (suggestedPrevRate !== null && suggestedPrevRate > 0)
      ? suggestedPrevRate
      : (parseFloat(String(openingStockRate)) || 112);
    setOpeningStockRate(r);
    const w = (suggestedPrevStock !== null && suggestedPrevStock >= 0)
      ? suggestedPrevStock
      : (parseFloat(String(openingStock)) || 0);
    const amt = (suggestedPrevAmount !== null && suggestedPrevAmount > 0 && suggestedPrevStock === w)
      ? suggestedPrevAmount
      : (w * r);
    setOpeningStockAmount(amt > 0 ? amt.toFixed(2) : '0.00');
    setIncludeOpeningAmount(amt > 0 || (w > 0 && r > 0));
  };

  // Step 4: Egg Stock and Sales State
  const [eggOpeningStock, setEggOpeningStock] = useState<number | string>('');
  const [eggOpeningStockRate, setEggOpeningStockRate] = useState<number | string>('6');
  const [eggOpeningStockAmount, setEggOpeningStockAmount] = useState<number | string>('');
  const [eggIncludeOpeningAmount, setEggIncludeOpeningAmount] = useState<boolean>(true);
  const [suggestedPrevEggRate, setSuggestedPrevEggRate] = useState<number | null>(null);
  const [suggestedPrevEggAmount, setSuggestedPrevEggAmount] = useState<number | null>(null);
  const [suggestedPrevEggStock, setSuggestedPrevEggStock] = useState<number | null>(null);
  const [hasPreviousEggClosing, setHasPreviousEggClosing] = useState<boolean>(false);
  const [eggNewStock, setEggNewStock] = useState<number | string>('');
  const [eggPurchaseRate, setEggPurchaseRate] = useState<number | string>('');
  const [eggPurchaseCost, setEggPurchaseCost] = useState<number | string>('');
  const [eggClosingStock, setEggClosingStock] = useState<number | string>('');
  const [eggClosingStockPrice, setEggClosingStockPrice] = useState<number | string>('6');
  const [eggClosingStockAmount, setEggClosingStockAmount] = useState<number | string>('');

  // Synchronized Egg Handlers
  const handleEggOpeningStockChange = (val: string) => {
    setEggOpeningStock(val);
    const w = parseFloat(val) || 0;
    let r = parseFloat(String(eggOpeningStockRate)) || 0;
    if (r === 0 && suggestedPrevEggRate && suggestedPrevEggRate > 0) {
      r = suggestedPrevEggRate;
      setEggOpeningStockRate(r);
    }
    if (w > 0 && r > 0) {
      setEggOpeningStockAmount((w * r).toFixed(2));
      setEggIncludeOpeningAmount(true);
    } else if (w === 0) {
      setEggOpeningStockAmount('');
    }
  };

  const handleEggOpeningRateChange = (val: string) => {
    setEggOpeningStockRate(val);
    const r = parseFloat(val) || 0;
    const w = parseFloat(String(eggOpeningStock)) || 0;
    if (w > 0 && r > 0) {
      setEggOpeningStockAmount((w * r).toFixed(2));
      setEggIncludeOpeningAmount(true);
    }
  };

  const handleEggOpeningAmountChange = (val: string) => {
    setEggOpeningStockAmount(val);
    const amt = parseFloat(val) || 0;
    const w = parseFloat(String(eggOpeningStock)) || 0;
    if (w > 0 && amt > 0) {
      setEggOpeningStockRate((amt / w).toFixed(2));
      setEggIncludeOpeningAmount(true);
    }
  };

  const handleEggNewStockChange = (val: string) => {
    setEggNewStock(val);
    const qty = parseFloat(val) || 0;
    const rate = parseFloat(String(eggPurchaseRate)) || 0;
    if (qty > 0 && rate > 0) {
      setEggPurchaseCost((qty * rate).toFixed(2));
    } else if (qty === 0) {
      setEggPurchaseCost('');
    }
  };

  const handleEggPurchaseRateChange = (val: string) => {
    setEggPurchaseRate(val);
    const rate = parseFloat(val) || 0;
    const qty = parseFloat(String(eggNewStock)) || 0;
    if (qty > 0 && rate > 0) {
      setEggPurchaseCost((qty * rate).toFixed(2));
    }
  };

  const handleEggPurchaseCostChange = (val: string) => {
    setEggPurchaseCost(val);
    const cost = parseFloat(val) || 0;
    const qty = parseFloat(String(eggNewStock)) || 0;
    if (qty > 0 && cost > 0) {
      setEggPurchaseRate((cost / qty).toFixed(2));
    }
  };

  const handleEggClosingStockChange = (val: string) => {
    setEggClosingStock(val);
    const w = parseFloat(val) || 0;
    const pr = parseFloat(String(eggClosingStockPrice)) || 6;
    if (w > 0 && pr > 0) {
      setEggClosingStockAmount((w * pr).toFixed(2));
    } else if (w === 0) {
      setEggClosingStockAmount('0.00');
    }
  };

  const handleEggClosingPriceChange = (val: string) => {
    setEggClosingStockPrice(val);
    const pr = parseFloat(val) || 0;
    const w = parseFloat(String(eggClosingStock)) || 0;
    if (w > 0) {
      setEggClosingStockAmount((w * pr).toFixed(2));
    }
  };

  const handleEggClosingAmountChange = (val: string) => {
    setEggClosingStockAmount(val);
    const amt = parseFloat(val) || 0;
    const w = parseFloat(String(eggClosingStock)) || 0;
    if (w > 0) {
      setEggClosingStockPrice((amt / w).toFixed(2));
    }
  };

  const applyPreviousEggClosing = () => {
    if (suggestedPrevEggStock !== null && suggestedPrevEggStock >= 0) {
      setEggOpeningStock(suggestedPrevEggStock);
    }
    const r =
      suggestedPrevEggRate !== null && suggestedPrevEggRate > 0
        ? suggestedPrevEggRate
        : parseFloat(String(eggOpeningStockRate)) || 6;
    setEggOpeningStockRate(r);
    const w =
      suggestedPrevEggStock !== null && suggestedPrevEggStock >= 0
        ? suggestedPrevEggStock
        : parseFloat(String(eggOpeningStock)) || 0;
    const amt =
      suggestedPrevEggAmount !== null && suggestedPrevEggAmount > 0 && suggestedPrevEggStock === w
        ? suggestedPrevEggAmount
        : w * r;
    setEggOpeningStockAmount(amt > 0 ? amt.toFixed(2) : '0.00');
    setEggIncludeOpeningAmount(amt > 0 || (w > 0 && r > 0));
  };

  // Step 5: Adjustments & Review
  const [adjustments, setAdjustments] = useState<AdjustmentEntry[]>([]);
  const [closingNotes, setClosingNotes] = useState<string>('');

  // Reopen Modal
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);

  // Load prefill data & distributors
  const loadData = async (preserveStep: boolean = false) => {
    isLoadedRef.current = false;
    if (isFutureDate(selectedDate)) {
      error('Future-date closing is not allowed. Please select today or a previous date.');
      setLoading(false);
      return;
    }
    try {
      if (!preserveStep) {
        setLoading(true);
      }
      const [distRes, prefillRes] = await Promise.all([
        distributorApi.getAll({ activeOnly: 'true' }),
        closingApi.getPrefill(selectedDate),
      ]);

      let loadedDistributors: Distributor[] = [];
      if (distRes.data.success) {
        loadedDistributors = distRes.data.data;
        setDistributors(loadedDistributors);
      }
      const srDist = loadedDistributors.find((d) => d.name.toLowerCase().includes('sr poultry')) || loadedDistributors[0];

      if (prefillRes.data.success) {
        const p = prefillRes.data.data;
        const exist = p.existingClosing;
        const sug = p.suggested;

        const sugRate = parseFloat(sug?.openingStockRatePerKg) || 0;
        const sugAmt = parseFloat(sug?.openingStockAmount) || 0;
        const sugStock = parseFloat(sug?.openingStockKg) || 0;

        setSuggestedPrevRate(sugRate > 0 ? sugRate : null);
        setSuggestedPrevAmount(sugAmt > 0 ? sugAmt : null);
        const prevStockVal =
          sug?.previousClosingStockKg !== undefined
            ? parseFloat(sug.previousClosingStockKg)
            : sugStock > 0
            ? sugStock
            : null;
        setSuggestedPrevStock(Number.isFinite(prevStockVal) ? prevStockVal : null);
        setHasPreviousClosing(Boolean(sug?.hasPreviousClosing || (Number.isFinite(prevStockVal) && prevStockVal !== null)));
        setPreviousDate(sug?.previousDate || null);

        // Egg suggestions
        const sugEggRate = parseFloat(sug?.eggOpeningStockRate) || 6;
        const sugEggAmt = parseFloat(sug?.eggOpeningStockAmount) || 0;
        const sugEggStock = parseFloat(sug?.eggOpeningStock) || 0;

        setSuggestedPrevEggRate(sugEggRate > 0 ? sugEggRate : 6);
        setSuggestedPrevEggAmount(sugEggAmt > 0 ? sugEggAmt : null);
        const prevEggStockVal =
          sug?.previousEggClosingStock !== undefined
            ? parseFloat(sug.previousEggClosingStock)
            : sugEggStock > 0
            ? sugEggStock
            : null;
        setSuggestedPrevEggStock(Number.isFinite(prevEggStockVal) ? prevEggStockVal : null);
        setHasPreviousEggClosing(Boolean(sug?.hasPreviousEggClosing || (Number.isFinite(prevEggStockVal) && prevEggStockVal !== null)));

        if (p?.savedDestinationShops && Array.isArray(p.savedDestinationShops)) {
          setSavedDestinationShops(p.savedDestinationShops);
        }

        // Check for local draft in localStorage for this date
        const localDraftKey = `daily_closing_local_draft_${selectedDate}`;
        let localDraft: any = null;
        try {
          const raw = localStorage.getItem(localDraftKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.selectedDate === selectedDate || !parsed.selectedDate)) {
              localDraft = parsed;
            }
          }
        } catch (e) {
          console.warn('Could not read local draft', e);
        }

        if (exist && exist.status === 'Completed') {
          // Finalized closing is locked and authoritative
          setClosingRecord(exist);
          localStorage.removeItem(localDraftKey);
          setIsDraftRestored(false);
          setLastSavedTimestamp(null);

          // Set wizard from existing
          setOpeningStock(exist.openingStockKg);
          const existOpeningWeight = parseFloat(exist.openingStockKg) || 0;
          const existRate = parseFloat(exist.openingStockRatePerKg) || (sugRate > 0 ? sugRate : 0);
          const existAmt = parseFloat(exist.openingStockAmount) || (existOpeningWeight * existRate);

          setOpeningStockRate(existRate > 0 ? existRate : '');
          setOpeningStockAmount(existAmt > 0 ? existAmt.toFixed(2) : '');
          setIncludeOpeningAmount(existAmt > 0 || (existOpeningWeight > 0 && existRate > 0));
          setNewStock(exist.newStockKg);
          setClosingStock(exist.closingStockKg);
          const existClosingRate = exist.closingStockRatePerKg || exist.sellingPricePerKg || '112';
          setClosingStockPrice(existClosingRate);
          setClosingStockAmount(
            exist.closingStockAmount ||
              (parseFloat(exist.closingStockKg) * parseFloat(existClosingRate)).toFixed(2)
          );

          // Stock transfer existing in completed closing
          const completedHasTransfer = Boolean(
            (p.stockTransfers && p.stockTransfers.length > 0) ||
            p.stockTransfer?.hasTransfer ||
            (exist.stock_transferred_kg && parseFloat(exist.stock_transferred_kg) > 0)
          );
          setHasStockTransfer(completedHasTransfer);
          if (p.stockTransfers && Array.isArray(p.stockTransfers) && p.stockTransfers.length > 0) {
            setStockTransfers(
              p.stockTransfers.map((t: any) => ({
                id: t.id,
                destinationShop: t.destinationShop || '',
                transferredWeight: t.transferredWeightKg !== undefined ? String(t.transferredWeightKg) : '',
                transferDate: t.transferDate || selectedDate,
                notes: t.notes || '',
              }))
            );
          } else if (p.stockTransfer && p.stockTransfer.hasTransfer) {
            setStockTransfers([
              {
                destinationShop: p.stockTransfer.destinationShop || '',
                transferredWeight: p.stockTransfer.transferredWeightKg !== undefined ? String(p.stockTransfer.transferredWeightKg) : '',
                transferDate: p.stockTransfer.transferDate || selectedDate,
                notes: p.stockTransfer.notes || '',
              },
            ]);
          } else if (exist.stock_transferred_kg && parseFloat(exist.stock_transferred_kg) > 0) {
            setStockTransfers([
              {
                destinationShop: 'Branch',
                transferredWeight: String(exist.stock_transferred_kg),
                transferDate: selectedDate,
                notes: '',
              },
            ]);
          } else {
            setStockTransfers([
              { destinationShop: '', transferredWeight: '', transferDate: selectedDate, notes: '' },
            ]);
          }

          // Egg existing data
          setEggOpeningStock(exist.eggOpeningStock || '0');
          const existEggOpening = parseFloat(exist.eggOpeningStock) || 0;
          const existEggRate = parseFloat(exist.eggOpeningStockRate) || (sugEggRate > 0 ? sugEggRate : 6);
          const existEggAmt = parseFloat(exist.eggOpeningStockAmount) || (existEggOpening * existEggRate);
          setEggOpeningStockRate(existEggRate > 0 ? existEggRate : '6');
          setEggOpeningStockAmount(existEggAmt > 0 ? existEggAmt.toFixed(2) : '');
          setEggIncludeOpeningAmount(existEggAmt > 0 || (existEggOpening > 0 && existEggRate > 0));
          setEggNewStock(exist.eggNewStock || '');
          const existEggNew = parseFloat(exist.eggNewStock) || 0;
          const existEggCost = parseFloat(exist.eggPurchaseCost) || 0;
          const existEggPurchaseRate =
            exist.eggPurchaseRate ||
            (existEggNew > 0 && existEggCost > 0 ? (existEggCost / existEggNew).toFixed(2) : '');
          setEggPurchaseRate(existEggPurchaseRate || '');
          setEggPurchaseCost(exist.eggPurchaseCost || '');
          setEggClosingStock(exist.eggClosingStock || '');
          setEggClosingStockPrice(exist.eggClosingStockRate || '6');
          setEggClosingStockAmount(exist.eggClosingStockAmount || '');

          setCash(exist.cashCollection);
          setUpi(exist.upiCollection);
          setCard(exist.cardCollection);
          setOther(exist.otherCollection);
          setClosingNotes(exist.notes || '');

          if (p.purchases && p.purchases.length > 0) {
            setPurchases(
              p.purchases.map((pur: any) => ({
                distributorId: pur.distributor_id,
                distributorName: pur.distributor_name,
                weightKg: pur.weight_kg,
                pricePerKg: pur.price_per_kg,
                notes: pur.notes,
                distributorSupplyId: pur.distributor_supply_id,
              }))
            );
          }

          if (p.adjustments && p.adjustments.length > 0) {
            setAdjustments(
              p.adjustments.map((a: any) => ({
                type: a.adjustment_type,
                amount: a.amount,
                reason: a.reason,
                notes: a.notes,
              }))
            );
          }
        } else if (localDraft) {
          // RESTORE FROM LOCAL DRAFT (Values user wrote before refresh)
          setClosingRecord(exist || null);
          setIsDraftRestored(true);
          setLastSavedTimestamp(localDraft.lastSaved || null);
          if (localDraft.currentStep) {
            setCurrentStep(Math.min(Math.max(localDraft.currentStep, 1), 5));
          }

          // Step 1: Purchases
          if (localDraft.purchases && Array.isArray(localDraft.purchases) && localDraft.purchases.length > 0) {
            setPurchases(
              localDraft.purchases.map((pur: any) => {
                if (!pur.distributorId && (!pur.distributorName || pur.distributorName === '' || pur.distributorName === 'SR Poultry')) {
                  return {
                    ...pur,
                    distributorId: srDist?.id,
                    distributorName: srDist?.name || 'SR Poultry',
                  };
                }
                return pur;
              })
            );
          } else if (p.purchases && p.purchases.length > 0) {
            setPurchases(
              p.purchases.map((pur: any) => ({
                distributorId: pur.distributor_id || (pur.distributor_name?.toLowerCase().includes('sr poultry') ? srDist?.id : undefined),
                distributorName: pur.distributor_name || srDist?.name || 'SR Poultry',
                weightKg: pur.weight_kg,
                pricePerKg: pur.price_per_kg,
                notes: pur.notes,
                distributorSupplyId: pur.distributor_supply_id,
              }))
            );
          } else {
            setPurchases([
              {
                distributorId: srDist?.id,
                distributorName: srDist?.name || 'SR Poultry',
                weightKg: '',
                pricePerKg: '',
                notes: '',
              },
            ]);
          }

          // Step 2: Collections
          setCash(localDraft.cash !== undefined ? localDraft.cash : (exist?.cashCollection ?? sug?.prefilledCash ?? ''));
          setUpi(localDraft.upi !== undefined ? localDraft.upi : (exist?.upiCollection ?? sug?.prefilledUpi ?? ''));
          setCard(localDraft.card !== undefined ? localDraft.card : (exist?.cardCollection ?? sug?.prefilledCard ?? ''));
          setOther(localDraft.other !== undefined ? localDraft.other : (exist?.otherCollection ?? sug?.prefilledOther ?? ''));
          setCollectionNotes(localDraft.collectionNotes !== undefined ? localDraft.collectionNotes : '');

          // Step 3: Stock and Sales
          const draftChicken = localDraft.openingStock;
          const shouldAutoUpdateChicken =
            (draftChicken === undefined || draftChicken === '' || parseFloat(String(draftChicken)) === 0) &&
            sugStock > 0;
          const effectiveChickenOpening = shouldAutoUpdateChicken
            ? sugStock
            : (draftChicken !== undefined && draftChicken !== ''
                ? draftChicken
                : (exist?.openingStockKg && parseFloat(exist.openingStockKg) > 0
                    ? exist.openingStockKg
                    : (sugStock > 0 ? sugStock : (sug?.hasPreviousClosing ? '0' : ''))));

          setOpeningStock(effectiveChickenOpening);
          const effectiveChickenRate =
            localDraft.openingStockRate !== undefined && localDraft.openingStockRate !== ''
              ? localDraft.openingStockRate
              : (exist?.openingStockRatePerKg || (sugRate > 0 ? sugRate : ''));
          setOpeningStockRate(effectiveChickenRate);
          const effectiveChickenAmt =
            localDraft.openingStockAmount !== undefined && localDraft.openingStockAmount !== ''
              ? localDraft.openingStockAmount
              : (exist?.openingStockAmount ||
                  (parseFloat(String(effectiveChickenOpening)) > 0 && parseFloat(String(effectiveChickenRate)) > 0
                    ? (parseFloat(String(effectiveChickenOpening)) * parseFloat(String(effectiveChickenRate))).toFixed(2)
                    : ''));
          setOpeningStockAmount(effectiveChickenAmt);
          setIncludeOpeningAmount(
            localDraft.includeOpeningAmount !== undefined
              ? Boolean(localDraft.includeOpeningAmount)
              : (parseFloat(String(effectiveChickenAmt)) > 0 || (parseFloat(String(effectiveChickenOpening)) > 0 && parseFloat(String(effectiveChickenRate)) > 0))
          );
          setNewStock(
            localDraft.newStock !== undefined
              ? localDraft.newStock
              : (exist?.newStockKg || sug?.newStockReceivedKg || '')
          );
          setClosingStock(
            localDraft.closingStock !== undefined
              ? localDraft.closingStock
              : (exist?.closingStockKg || '')
          );
          setClosingStockPrice(
            localDraft.closingStockPrice !== undefined
              ? localDraft.closingStockPrice
              : (exist?.closingStockRatePerKg || exist?.sellingPricePerKg || '112')
          );
          setClosingStockAmount(
            localDraft.closingStockAmount !== undefined
              ? localDraft.closingStockAmount
              : (exist?.closingStockAmount || '')
          );

          // Stock transfer local draft
          setHasStockTransfer(Boolean(localDraft.hasStockTransfer));
          if (Array.isArray(localDraft.stockTransfers) && localDraft.stockTransfers.length > 0) {
            setStockTransfers(
              localDraft.stockTransfers.map((t: any) => ({
                id: t.id,
                destinationShop: t.destinationShop || '',
                transferredWeight: t.transferredWeight !== undefined ? t.transferredWeight : '',
                transferDate: t.transferDate || selectedDate,
                notes: t.notes || '',
              }))
            );
          } else if (localDraft.transferredWeight !== undefined && localDraft.transferredWeight !== '') {
            setStockTransfers([
              {
                destinationShop: localDraft.destinationShop || '',
                transferredWeight: localDraft.transferredWeight,
                transferDate: localDraft.transferDate || selectedDate,
                notes: localDraft.transferNotes || '',
              },
            ]);
          } else {
            setStockTransfers([
              { destinationShop: '', transferredWeight: '', transferDate: selectedDate, notes: '' },
            ]);
          }

          // Step 4: Egg Stock and Sales
          const draftEgg = localDraft.eggOpeningStock;
          const shouldAutoUpdateEgg =
            (draftEgg === undefined || draftEgg === '' || parseFloat(String(draftEgg)) === 0) &&
            sugEggStock > 0;
          const effectiveEggOpening = shouldAutoUpdateEgg
            ? sugEggStock
            : (draftEgg !== undefined && draftEgg !== ''
                ? draftEgg
                : (exist?.eggOpeningStock && parseFloat(exist.eggOpeningStock) > 0
                    ? exist.eggOpeningStock
                    : (sugEggStock > 0 ? sugEggStock : (sug?.hasPreviousEggClosing ? '0' : ''))));

          setEggOpeningStock(effectiveEggOpening);
          const effectiveEggRate =
            localDraft.eggOpeningStockRate !== undefined && localDraft.eggOpeningStockRate !== ''
              ? localDraft.eggOpeningStockRate
              : (exist?.eggOpeningStockRate || (sugEggRate > 0 ? sugEggRate : '6'));
          setEggOpeningStockRate(effectiveEggRate);
          const effectiveEggAmt =
            localDraft.eggOpeningStockAmount !== undefined && localDraft.eggOpeningStockAmount !== ''
              ? localDraft.eggOpeningStockAmount
              : (exist?.eggOpeningStockAmount ||
                  (parseFloat(String(effectiveEggOpening)) > 0 && parseFloat(String(effectiveEggRate)) > 0
                    ? (parseFloat(String(effectiveEggOpening)) * parseFloat(String(effectiveEggRate))).toFixed(2)
                    : ''));
          setEggOpeningStockAmount(effectiveEggAmt);
          setEggIncludeOpeningAmount(
            localDraft.eggIncludeOpeningAmount !== undefined
              ? Boolean(localDraft.eggIncludeOpeningAmount)
              : (parseFloat(String(effectiveEggAmt)) > 0 || (parseFloat(String(effectiveEggOpening)) > 0 && parseFloat(String(effectiveEggRate)) > 0))
          );
          setEggNewStock(
            localDraft.eggNewStock !== undefined
              ? localDraft.eggNewStock
              : (exist?.eggNewStock || '')
          );
          setEggPurchaseRate(
            localDraft.eggPurchaseRate !== undefined
              ? localDraft.eggPurchaseRate
              : (exist?.eggPurchaseRate || '')
          );
          setEggPurchaseCost(
            localDraft.eggPurchaseCost !== undefined
              ? localDraft.eggPurchaseCost
              : (exist?.eggPurchaseCost || '')
          );
          setEggClosingStock(
            localDraft.eggClosingStock !== undefined
              ? localDraft.eggClosingStock
              : (exist?.eggClosingStock || '')
          );
          setEggClosingStockPrice(
            localDraft.eggClosingStockPrice !== undefined
              ? localDraft.eggClosingStockPrice
              : (exist?.eggClosingStockRate || '6')
          );
          setEggClosingStockAmount(
            localDraft.eggClosingStockAmount !== undefined
              ? localDraft.eggClosingStockAmount
              : (exist?.eggClosingStockAmount || '')
          );

          // Step 5: Adjustments & Notes
          setAdjustments(
            Array.isArray(localDraft.adjustments)
              ? localDraft.adjustments
              : (p.adjustments && p.adjustments.length > 0
                ? p.adjustments.map((a: any) => ({
                    type: a.adjustment_type,
                    amount: a.amount,
                    reason: a.reason,
                    notes: a.notes,
                  }))
                : [])
          );
          setClosingNotes(
            localDraft.closingNotes !== undefined
              ? localDraft.closingNotes
              : (exist?.notes || '')
          );
        } else if (exist) {
          // Existing draft in database (no local draft)
          setClosingRecord(exist);
          setIsDraftRestored(false);
          setLastSavedTimestamp(null);
          if (!preserveStep) {
            setCurrentStep(1);
          }

          // Set wizard from existing
          let currentOpeningStock = exist.openingStockKg;
          let existOpeningWeight = parseFloat(exist.openingStockKg) || 0;
          if (existOpeningWeight === 0 && sugStock > 0) {
            currentOpeningStock = String(sugStock);
            existOpeningWeight = sugStock;
          }
          setOpeningStock(currentOpeningStock);
          const existRate = parseFloat(exist.openingStockRatePerKg) || (sugRate > 0 ? sugRate : 0);
          const existAmt = parseFloat(exist.openingStockAmount) || (existOpeningWeight * existRate);

          setOpeningStockRate(existRate > 0 ? existRate : '');
          setOpeningStockAmount(existAmt > 0 ? existAmt.toFixed(2) : '');
          setIncludeOpeningAmount(existAmt > 0 || (existOpeningWeight > 0 && existRate > 0));
          setNewStock(exist.newStockKg);
          setClosingStock(exist.closingStockKg);
          const existClosingRate = exist.closingStockRatePerKg || exist.sellingPricePerKg || '112';
          setClosingStockPrice(existClosingRate);
          setClosingStockAmount(
            exist.closingStockAmount ||
              (parseFloat(exist.closingStockKg) * parseFloat(existClosingRate)).toFixed(2)
          );

          // Stock transfer from existing DB draft
          const hasExistingTransfers = Boolean(
            (p.stockTransfers && p.stockTransfers.length > 0) ||
            p.stockTransfer?.hasTransfer ||
            (exist.stock_transferred_kg && parseFloat(exist.stock_transferred_kg) > 0)
          );
          setHasStockTransfer(hasExistingTransfers);
          if (p.stockTransfers && Array.isArray(p.stockTransfers) && p.stockTransfers.length > 0) {
            setStockTransfers(
              p.stockTransfers.map((t: any) => ({
                id: t.id,
                destinationShop: t.destinationShop || '',
                transferredWeight: t.transferredWeightKg !== undefined ? String(t.transferredWeightKg) : '',
                transferDate: t.transferDate || selectedDate,
                notes: t.notes || '',
              }))
            );
          } else if (p.stockTransfer && p.stockTransfer.hasTransfer) {
            setStockTransfers([
              {
                destinationShop: p.stockTransfer.destinationShop || '',
                transferredWeight: p.stockTransfer.transferredWeightKg !== undefined ? String(p.stockTransfer.transferredWeightKg) : '',
                transferDate: p.stockTransfer.transferDate || selectedDate,
                notes: p.stockTransfer.notes || '',
              },
            ]);
          } else if (exist.stock_transferred_kg && parseFloat(exist.stock_transferred_kg) > 0) {
            setStockTransfers([
              {
                destinationShop: 'Branch',
                transferredWeight: String(exist.stock_transferred_kg),
                transferDate: selectedDate,
                notes: '',
              },
            ]);
          } else {
            setStockTransfers([
              { destinationShop: '', transferredWeight: '', transferDate: selectedDate, notes: '' },
            ]);
          }

          // Egg existing data
          let currentEggOpening = exist.eggOpeningStock;
          let existEggOpening = parseFloat(exist.eggOpeningStock) || 0;
          if (existEggOpening === 0 && sugEggStock > 0) {
            currentEggOpening = String(sugEggStock);
            existEggOpening = sugEggStock;
          }
          setEggOpeningStock(currentEggOpening || (sugEggStock > 0 ? String(sugEggStock) : '0'));
          const existEggRate = parseFloat(exist.eggOpeningStockRate) || (sugEggRate > 0 ? sugEggRate : 6);
          const existEggAmt = parseFloat(exist.eggOpeningStockAmount) || (existEggOpening * existEggRate);
          setEggOpeningStockRate(existEggRate > 0 ? existEggRate : '6');
          setEggOpeningStockAmount(existEggAmt > 0 ? existEggAmt.toFixed(2) : '');
          setEggIncludeOpeningAmount(existEggAmt > 0 || (existEggOpening > 0 && existEggRate > 0));
          setEggNewStock(exist.eggNewStock || '');
          const existEggNew = parseFloat(exist.eggNewStock) || 0;
          const existEggCost = parseFloat(exist.eggPurchaseCost) || 0;
          const existEggPurchaseRate =
            exist.eggPurchaseRate ||
            (existEggNew > 0 && existEggCost > 0 ? (existEggCost / existEggNew).toFixed(2) : '');
          setEggPurchaseRate(existEggPurchaseRate || '');
          setEggPurchaseCost(exist.eggPurchaseCost || '');
          setEggClosingStock(exist.eggClosingStock || '');
          setEggClosingStockPrice(exist.eggClosingStockRate || '6');
          setEggClosingStockAmount(exist.eggClosingStockAmount || '');

          setCash(exist.cashCollection);
          setUpi(exist.upiCollection);
          setCard(exist.cardCollection);
          setOther(exist.otherCollection);
          setClosingNotes(exist.notes || '');

          if (p.purchases && p.purchases.length > 0) {
            setPurchases(
              p.purchases.map((pur: any) => ({
                distributorId: pur.distributor_id,
                distributorName: pur.distributor_name,
                weightKg: pur.weight_kg,
                pricePerKg: pur.price_per_kg,
                notes: pur.notes,
                distributorSupplyId: pur.distributor_supply_id,
              }))
            );
          }

          if (p.adjustments && p.adjustments.length > 0) {
            setAdjustments(
              p.adjustments.map((a: any) => ({
                type: a.adjustment_type,
                amount: a.amount,
                reason: a.reason,
                notes: a.notes,
              }))
            );
          }
        } else {
          // Fresh form, prefill from suggested
          setClosingRecord(null);
          setIsDraftRestored(false);
          setLastSavedTimestamp(null);
          if (!preserveStep) {
            setCurrentStep(1);
          }

          setOpeningStock(sugStock > 0 ? sugStock : (sug?.hasPreviousClosing ? '0' : ''));
          setOpeningStockRate(sugRate > 0 ? sugRate : '');
          const calculatedAmt = sugAmt > 0 ? sugAmt : (sugStock * sugRate);
          setOpeningStockAmount(calculatedAmt > 0 ? calculatedAmt.toFixed(2) : '');
          setIncludeOpeningAmount(calculatedAmt > 0 || (sugStock > 0 && sugRate > 0));
          setNewStock(sug?.newStockReceivedKg || '');
          setClosingStock('');
          setClosingStockPrice('112');
          setClosingStockAmount('');

          // Reset stock transfer for fresh form
          setHasStockTransfer(false);
          setStockTransfers([
            { destinationShop: '', transferredWeight: '', transferDate: selectedDate, notes: '' },
          ]);

          // Prefill Egg from suggested
          setEggOpeningStock(sugEggStock > 0 ? sugEggStock : (sug?.hasPreviousEggClosing ? '0' : ''));
          setEggOpeningStockRate(sugEggRate > 0 ? sugEggRate : '6');
          const calcEggAmt = sugEggAmt > 0 ? sugEggAmt : (sugEggStock * sugEggRate);
          setEggOpeningStockAmount(calcEggAmt > 0 ? calcEggAmt.toFixed(2) : '');
          setEggIncludeOpeningAmount(calcEggAmt > 0 || (sugEggStock > 0 && sugEggRate > 0));
          setEggNewStock('');
          setEggPurchaseRate('');
          setEggPurchaseCost('');
          setEggClosingStock('');
          setEggClosingStockPrice('6');
          setEggClosingStockAmount('');

          setCash(sug?.prefilledCash || '');
          setUpi(sug?.prefilledUpi || '');
          setCard(sug?.prefilledCard || '');
          setOther(sug?.prefilledOther || '');
          setHasStockTransfer(false);
          setStockTransfers([
            { destinationShop: '', transferredWeight: '', transferDate: selectedDate, notes: '' },
          ]);
          setAdjustments([]);
          setClosingNotes('');

          if (p.purchases && p.purchases.length > 0) {
            setPurchases(
              p.purchases.map((pur: any) => ({
                distributorId: pur.distributor_id || (pur.distributor_name?.toLowerCase().includes('sr poultry') ? srDist?.id : undefined),
                distributorName: pur.distributor_name || srDist?.name || 'SR Poultry',
                weightKg: pur.weight_kg,
                pricePerKg: pur.price_per_kg,
                notes: pur.notes,
                distributorSupplyId: pur.distributor_supply_id,
              }))
            );
          } else {
            setPurchases([
              {
                distributorId: srDist?.id,
                distributorName: srDist?.name || 'SR Poultry',
                weightKg: '',
                pricePerKg: '',
                notes: '',
              },
            ]);
          }
        }
      }
    } catch (err: any) {
      error('Failed to load daily closing wizard data.');
    } finally {
      setLoading(false);
      setTimeout(() => {
        isLoadedRef.current = true;
      }, 150);
    }
  };

  const handleClearLocalDraft = () => {
    if (window.confirm('Reset this daily closing form to default suggested values? Any unsaved edits will be discarded.')) {
      localStorage.removeItem(`daily_closing_local_draft_${selectedDate}`);
      setIsDraftRestored(false);
      setLastSavedTimestamp(null);
      loadData();
      success('Form reset to default suggested values.');
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  // Keep draftDataRef updated with current values
  draftDataRef.current = {
    selectedDate,
    currentStep,
    purchases,
    cash,
    upi,
    card,
    other,
    collectionNotes,
    openingStock,
    openingStockRate,
    openingStockAmount,
    includeOpeningAmount,
    newStock,
    closingStock,
    closingStockPrice,
    closingStockAmount,
    hasStockTransfer,
    stockTransfers,
    eggOpeningStock,
    eggOpeningStockRate,
    eggOpeningStockAmount,
    eggIncludeOpeningAmount,
    eggNewStock,
    eggPurchaseRate,
    eggPurchaseCost,
    eggClosingStock,
    eggClosingStockPrice,
    eggClosingStockAmount,
    adjustments,
    closingNotes,
  };

  // Debounced Autosave to localStorage on any edit
  useEffect(() => {
    if (!isLoadedRef.current || isCompleted) return;

    const handler = setTimeout(() => {
      try {
        const payload = {
          ...draftDataRef.current,
          lastSaved: Date.now(),
        };
        localStorage.setItem(`daily_closing_local_draft_${selectedDate}`, JSON.stringify(payload));
        setLastSavedTimestamp(payload.lastSaved);
      } catch (err) {
        console.warn('Failed to save draft to localStorage', err);
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [
    selectedDate,
    currentStep,
    purchases,
    cash,
    upi,
    card,
    other,
    collectionNotes,
    openingStock,
    openingStockRate,
    openingStockAmount,
    includeOpeningAmount,
    newStock,
    closingStock,
    closingStockPrice,
    closingStockAmount,
    hasStockTransfer,
    stockTransfers,
    eggOpeningStock,
    eggOpeningStockRate,
    eggOpeningStockAmount,
    eggIncludeOpeningAmount,
    eggNewStock,
    eggPurchaseRate,
    eggPurchaseCost,
    eggClosingStock,
    eggClosingStockPrice,
    eggClosingStockAmount,
    adjustments,
    closingNotes,
    isCompleted,
  ]);

  // Emergency Synchronous Save on beforeunload / page reload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isLoadedRef.current && !isCompleted && draftDataRef.current) {
        try {
          localStorage.setItem(
            `daily_closing_local_draft_${selectedDate}`,
            JSON.stringify({ ...draftDataRef.current, lastSaved: Date.now() })
          );
        } catch (e) {
          // ignore
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectedDate, isCompleted]);

  // Derived Calculations
  // Total Purchases Amount
  const totalPurchaseCost = purchases.reduce((sum, p) => {
    const w = parseFloat(String(p.weightKg)) || 0;
    const pr = parseFloat(String(p.pricePerKg)) || 0;
    return sum + w * pr;
  }, 0);

  const totalPurchaseWeight = purchases.reduce((sum, p) => {
    return sum + (parseFloat(String(p.weightKg)) || 0);
  }, 0);

  // Total Counter Collection = Cash + UPI + Card + Other
  const totalCounterCollection =
    (parseFloat(String(cash)) || 0) +
    (parseFloat(String(upi)) || 0) +
    (parseFloat(String(card)) || 0) +
    (parseFloat(String(other)) || 0);

  // Stock Calculations
  const numOpening = parseFloat(String(openingStock)) || 0;
  const numOpeningRate = parseFloat(String(openingStockRate)) || 0;
  const numOpeningAmount = parseFloat(String(openingStockAmount)) || (numOpening * numOpeningRate);
  const effectiveOpeningCost = includeOpeningAmount ? numOpeningAmount : 0;
  const numNew = parseFloat(String(newStock)) || 0;
  const numClosing = parseFloat(String(closingStock)) || 0;
  const numClosingPrice = parseFloat(String(closingStockPrice)) || 0;

  // Stock transfer calculation (sum of all transfers)
  const numTransferred = hasStockTransfer
    ? stockTransfers.reduce((sum, t) => sum + (parseFloat(String(t.transferredWeight)) || 0), 0)
    : 0;
  const totalAvailableStock = numOpening + numNew;
  const stockAvailableForSale = Math.max(0, totalAvailableStock - numTransferred);
  const quantitySold = Math.max(0, stockAvailableForSale - numClosing);

  // Total Closing Amount = Closing Stock (kg) * Closing Stock Price per KG
  const totalClosingAmount =
    closingStockAmount !== ''
      ? parseFloat(String(closingStockAmount)) || (numClosing * numClosingPrice)
      : numClosing * numClosingPrice;

  const totalAvailableCost = effectiveOpeningCost + totalPurchaseCost;

  // Blended cost per kg of available stock
  const blendedCostPerKg =
    totalAvailableStock > 0 && totalAvailableCost > 0
      ? totalAvailableCost / totalAvailableStock
      : totalPurchaseWeight > 0 && totalPurchaseCost > 0
      ? totalPurchaseCost / totalPurchaseWeight
      : numOpeningRate > 0
      ? numOpeningRate
      : 180;

  // USER INSTRUCTION:
  // in Chicken Sales Revenue it shold calculate Total Inventory Cost-Total Closing Stock Amount .dont change in eggs only change in these
  const transferredCost = hasStockTransfer && numTransferred > 0 ? numTransferred * blendedCostPerKg : 0;
  const chickenSalesRevenue = Math.max(0, totalAvailableCost - transferredCost - totalClosingAmount);

  // Net Adjustments
  const netAdjustments = adjustments.reduce((sum, a) => {
    const amt = parseFloat(String(a.amount)) || 0;
    return a.type === 'Additional Income' ? sum + amt : sum - amt;
  }, 0);

  const costOfChickenSold = quantitySold * blendedCostPerKg;

  // Egg Stock Calculations
  const numEggOpening = parseFloat(String(eggOpeningStock)) || 0;
  const numEggOpeningRate = parseFloat(String(eggOpeningStockRate)) || 0;
  const numEggOpeningAmount = parseFloat(String(eggOpeningStockAmount)) || (numEggOpening * numEggOpeningRate);
  const effectiveEggOpeningCost = eggIncludeOpeningAmount ? numEggOpeningAmount : 0;
  const numEggNew = parseFloat(String(eggNewStock)) || 0;
  const numEggPurchaseRate = parseFloat(String(eggPurchaseRate)) || 0;
  const numEggPurchaseCost =
    eggPurchaseCost !== ''
      ? parseFloat(String(eggPurchaseCost)) || (numEggNew * numEggPurchaseRate)
      : numEggNew * numEggPurchaseRate;
  const numEggClosing = parseFloat(String(eggClosingStock)) || 0;
  const numEggClosingPrice = parseFloat(String(eggClosingStockPrice)) || 0;

  const totalAvailableEggStock = numEggOpening + numEggNew;
  const totalAvailableEggCost = effectiveEggOpeningCost + numEggPurchaseCost;
  const eggQuantitySold = Math.max(0, totalAvailableEggStock - numEggClosing);

  const totalEggClosingAmount =
    eggClosingStockAmount !== ''
      ? parseFloat(String(eggClosingStockAmount)) || (numEggClosing * numEggClosingPrice)
      : numEggClosing * numEggClosingPrice;

  // USER INSTRUCTION: in egg sales revenue is quantity sold * Closing Stock Price per Egg (₹)
  const eggSalesRevenue = Math.max(0, eggQuantitySold * numEggClosingPrice);

  const blendedEggCost =
    totalAvailableEggStock > 0 && totalAvailableEggCost > 0
      ? totalAvailableEggCost / totalAvailableEggStock
      : numEggOpeningRate > 0
      ? numEggOpeningRate
      : 6;

  const costOfEggsSold = Math.max(0, totalAvailableEggCost - totalEggClosingAmount);
  const totalSalesRevenue = chickenSalesRevenue + eggSalesRevenue;
  const totalCogs = costOfChickenSold + costOfEggsSold;

  // USER INSTRUCTION:
  // Estimated Net Daily Profit should be calculated Total Counter Collection-Chicken Sales Revenue-Egg Sales Revenue-if Other Income & Expenses / Adjustments are there it should detect it also
  const estimatedGrossProfit = totalCounterCollection - chickenSalesRevenue - eggSalesRevenue;
  const estimatedNetProfit = estimatedGrossProfit + netAdjustments;

  // Step 1: Auto-Sync purchases to Distributor Supply Management
  const syncStep1Purchases = async (silent: boolean = false) => {
    if (saving) return;
    if (isFutureDate(selectedDate)) {
      if (!silent) error('Future-date closing is not allowed. Please select today or a previous date.');
      return;
    }
    const validPurchases = purchases.filter((p) => (parseFloat(String(p.weightKg)) || 0) > 0);
    if (validPurchases.length === 0) {
      if (!silent) error('Please enter at least one purchase with weight greater than 0.');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        businessDate: selectedDate,
        isDraft: true,
        purchases: validPurchases,
        counterCollection: {
          cash: parseFloat(String(cash)) || 0,
          upi: parseFloat(String(upi)) || 0,
          card: parseFloat(String(card)) || 0,
          other: parseFloat(String(other)) || 0,
          notes: collectionNotes,
        },
        stockAndSales: {
          openingStockKg: numOpening,
          openingStockRatePerKg: numOpeningRate,
          openingStockAmount: effectiveOpeningCost,
          newStockKg: totalPurchaseWeight > 0 ? totalPurchaseWeight : numNew,
          closingStockKg: numClosing,
          closingStockRatePerKg: numClosingPrice,
          closingStockAmount: totalClosingAmount,
          sellingPricePerKg: numClosingPrice,
          stockTransferredKg: numTransferred,
          stockAvailableForSaleKg: stockAvailableForSale,
        },
        stockTransfers: stockTransfers
          .filter((t) => (parseFloat(String(t.transferredWeight)) || 0) > 0)
          .map((t) => ({
            destinationShop: t.destinationShop.trim(),
            transferredWeightKg: parseFloat(String(t.transferredWeight)) || 0,
            transferDate: t.transferDate || selectedDate,
            notes: t.notes || '',
          })),
        stockTransfer: {
          hasTransfer: hasStockTransfer && numTransferred > 0,
          destinationShop: stockTransfers.find((t) => (parseFloat(String(t.transferredWeight)) || 0) > 0)?.destinationShop?.trim() || '',
          transferredWeightKg: numTransferred,
          transferDate: stockTransfers.find((t) => (parseFloat(String(t.transferredWeight)) || 0) > 0)?.transferDate || selectedDate,
          notes: stockTransfers.find((t) => (parseFloat(String(t.transferredWeight)) || 0) > 0)?.notes || '',
        },
        eggStockAndSales: {
          openingStock: numEggOpening,
          openingStockRate: numEggOpeningRate,
          openingStockAmount: effectiveEggOpeningCost,
          newStock: numEggNew,
          purchaseRate: numEggPurchaseRate,
          purchaseCost: numEggPurchaseCost,
          closingStock: numEggClosing,
          closingStockRate: numEggClosingPrice,
          closingStockAmount: totalEggClosingAmount,
        },
        adjustments: adjustments.filter((a) => (parseFloat(String(a.amount)) || 0) > 0),
        notes: closingNotes,
      };

      const res = await closingApi.save(payload);
      if (res.data.success) {
        if (!silent) {
          success('Purchases automatically recorded in Distributor Supply Management!');
          loadData(true);
        } else {
          setClosingRecord(res.data.data);
        }
      }
    } catch (err: any) {
      if (!silent) {
        error(err.response?.data?.error || 'Failed to sync purchases to Distributor Supplies.');
      }
    } finally {
      setSaving(false);
    }
  };

  // Step Navigations & Validations
  const handleNext = () => {
    if (isFutureDate(selectedDate)) {
      error('Future-date closing is not allowed. Please select today or a previous date.');
      return;
    }
    if (currentStep === 1) {
      // Validate Step 1
      for (const p of purchases) {
        const w = parseFloat(String(p.weightKg)) || 0;
        const pr = parseFloat(String(p.pricePerKg)) || 0;
        if (w < 0 || pr < 0) {
          error('Purchase weights and prices cannot be negative.');
          return;
        }
      }
      // If purchase weight changed and new stock wasn't manually set, update new stock
      if (totalPurchaseWeight > 0 && (!newStock || parseFloat(String(newStock)) === 0)) {
        setNewStock(totalPurchaseWeight);
      }
    } else if (currentStep === 2) {
      if (
        (parseFloat(String(cash)) || 0) < 0 ||
        (parseFloat(String(upi)) || 0) < 0 ||
        (parseFloat(String(card)) || 0) < 0 ||
        (parseFloat(String(other)) || 0) < 0
      ) {
        error('Collection figures cannot be negative.');
        return;
      }
    } else if (currentStep === 3) {
      if (numOpening < 0 || numNew < 0 || numClosing < 0) {
        error('Stock quantities cannot be negative.');
        return;
      }
      if (hasStockTransfer) {
        if (numTransferred <= 0) {
          error('Please enter a valid transferred chicken weight greater than 0 kg, or turn off the transfer toggle.');
          return;
        }
        for (const [idx, t] of stockTransfers.entries()) {
          const w = parseFloat(String(t.transferredWeight)) || 0;
          if (w > 0) {
            if (!t.destinationShop.trim()) {
              error(`Please enter or select a destination shop name for Transfer #${idx + 1}.`);
              return;
            }
          } else if (stockTransfers.length > 1 && t.destinationShop.trim()) {
            error(`Please enter a transferred weight greater than 0 kg for Transfer #${idx + 1} (${t.destinationShop}).`);
            return;
          }
        }
        if (numTransferred > totalAvailableStock) {
          error(
            `Total transferred quantity (${numTransferred} kg) cannot exceed total available stock (${totalAvailableStock} kg).`
          );
          return;
        }
      }
      if (numClosing > stockAvailableForSale) {
        error(
          `Closing stock (${numClosing} kg) cannot be greater than Stock Available for Sale (${stockAvailableForSale} kg).`
        );
        return;
      }
      if (numClosingPrice < 0) {
        error('Closing stock price cannot be negative.');
        return;
      }
    } else if (currentStep === 4) {
      if (numEggOpening < 0 || numEggNew < 0 || numEggClosing < 0) {
        error('Egg stock quantities cannot be negative.');
        return;
      }
      if (numEggClosing > totalAvailableEggStock) {
        error(
          `Closing egg stock (${numEggClosing}) cannot be greater than Total Available Eggs (${totalAvailableEggStock}).`
        );
        return;
      }
      if (numEggClosingPrice < 0) {
        error('Closing egg price cannot be negative.');
        return;
      }
    }

    setCurrentStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Submit or Save Draft
  const handleSave = async (isDraft: boolean) => {
    if (saving) return;
    if (isFutureDate(selectedDate)) {
      error('Future-date closing is not allowed. Please select today or a previous date.');
      return;
    }
    // Validations
    if (!isDraft) {
      if (hasStockTransfer) {
        if (numTransferred <= 0) {
          error('Please enter a valid transferred chicken weight greater than 0 kg, or turn off the transfer toggle.');
          return;
        }
        for (const [idx, t] of stockTransfers.entries()) {
          const w = parseFloat(String(t.transferredWeight)) || 0;
          if (w > 0 && !t.destinationShop.trim()) {
            error(`Please enter or select a destination shop name for Transfer #${idx + 1}.`);
            return;
          }
        }
        if (numTransferred > totalAvailableStock) {
          error(`Total transferred quantity (${numTransferred} kg) exceeds total available stock (${totalAvailableStock} kg).`);
          return;
        }
      }
      if (numClosing > stockAvailableForSale) {
        error(`Closing chicken stock (${numClosing} kg) exceeds stock available for sale (${stockAvailableForSale} kg). Please correct stock figures.`);
        return;
      }
      if (numEggClosing > totalAvailableEggStock) {
        error('Closing egg stock exceeds total available eggs. Please correct egg figures.');
        return;
      }
      for (const adj of adjustments) {
        if (!adj.reason.trim()) {
          error('All financial adjustments require an explicit reason.');
          return;
        }
      }
    }

    try {
      setSaving(true);
      const payload = {
        businessDate: selectedDate,
        isDraft,
        purchases: purchases.filter((p) => (parseFloat(String(p.weightKg)) || 0) > 0),
        counterCollection: {
          cash: parseFloat(String(cash)) || 0,
          upi: parseFloat(String(upi)) || 0,
          card: parseFloat(String(card)) || 0,
          other: parseFloat(String(other)) || 0,
          notes: collectionNotes,
        },
        stockAndSales: {
          openingStockKg: numOpening,
          openingStockRatePerKg: numOpeningRate,
          openingStockAmount: effectiveOpeningCost,
          newStockKg: numNew,
          closingStockKg: numClosing,
          closingStockRatePerKg: numClosingPrice,
          closingStockAmount: totalClosingAmount,
          sellingPricePerKg: numClosingPrice,
          stockTransferredKg: numTransferred,
          stockAvailableForSaleKg: stockAvailableForSale,
        },
        stockTransfers: stockTransfers
          .filter((t) => (parseFloat(String(t.transferredWeight)) || 0) > 0)
          .map((t) => ({
            destinationShop: t.destinationShop.trim(),
            transferredWeightKg: parseFloat(String(t.transferredWeight)) || 0,
            transferDate: t.transferDate || selectedDate,
            notes: t.notes || '',
          })),
        stockTransfer: {
          hasTransfer: hasStockTransfer && numTransferred > 0,
          destinationShop: stockTransfers.find((t) => (parseFloat(String(t.transferredWeight)) || 0) > 0)?.destinationShop?.trim() || '',
          transferredWeightKg: numTransferred,
          transferDate: stockTransfers.find((t) => (parseFloat(String(t.transferredWeight)) || 0) > 0)?.transferDate || selectedDate,
          notes: stockTransfers.find((t) => (parseFloat(String(t.transferredWeight)) || 0) > 0)?.notes || '',
        },
        eggStockAndSales: {
          openingStock: numEggOpening,
          openingStockRate: numEggOpeningRate,
          openingStockAmount: effectiveEggOpeningCost,
          newStock: numEggNew,
          purchaseRate: numEggPurchaseRate,
          purchaseCost: numEggPurchaseCost,
          closingStock: numEggClosing,
          closingStockRate: numEggClosingPrice,
          closingStockAmount: totalEggClosingAmount,
        },
        adjustments: adjustments.filter((a) => (parseFloat(String(a.amount)) || 0) > 0),
        notes: closingNotes,
      };

      const res = await closingApi.save(payload);
      if (res.data.success) {
        setCalendarRefreshTrigger((prev) => prev + 1);
        success(isDraft ? 'Daily closing saved as draft.' : 'Daily business closing completed successfully!');
        if (!isDraft) {
          localStorage.removeItem(`daily_closing_local_draft_${selectedDate}`);
          setIsDraftRestored(false);
          setLastSavedTimestamp(null);
          loadData(false);
        } else {
          loadData(true);
        }
      } else {
        error(res.data.error || 'Failed to save daily closing.');
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to submit daily closing.');
    } finally {
      setSaving(false);
    }
  };

  // Reopen Closing
  const handleReopenConfirm = async (reason: string) => {
    if (!closingRecord?.id) return;
    try {
      const res = await closingApi.reopen(closingRecord.id, { reason });
      if (res.data.success) {
        setCalendarRefreshTrigger((prev) => prev + 1);
        success('Daily closing reopened. You may now make adjustments and resubmit.');
        setIsReopenModalOpen(false);
        localStorage.removeItem(`daily_closing_local_draft_${selectedDate}`);
        setIsDraftRestored(false);
        setLastSavedTimestamp(null);
        loadData();
      }
    } catch (err: any) {
      error(err.response?.data?.error || 'Failed to reopen daily closing.');
    }
  };

  // Purchase Rows Helper
  const addPurchaseRow = () => {
    const srDist = distributors.find((d) => d.name.toLowerCase().includes('sr poultry')) || distributors[0];
    setPurchases([
      ...purchases,
      {
        distributorId: srDist?.id,
        distributorName: srDist?.name || 'SR Poultry',
        weightKg: '',
        pricePerKg: '',
        notes: '',
      },
    ]);
  };

  const removePurchaseRow = (index: number) => {
    setPurchases(purchases.filter((_, i) => i !== index));
  };

  const updatePurchaseRow = (index: number, field: keyof PurchaseEntry, val: any) => {
    const updated = [...purchases];
    updated[index] = { ...updated[index], [field]: val };

    // If selecting distributor from dropdown
    if (field === 'distributorId') {
      const distIdNum = parseInt(val, 10);
      if (distIdNum) {
        const found = distributors.find((d) => d.id === distIdNum);
        if (found) {
          updated[index].distributorId = found.id;
          updated[index].distributorName = found.name;
        }
      } else {
        updated[index].distributorId = undefined;
        updated[index].distributorName = '';
      }
    }
    setPurchases(updated);
  };

  // Adjustment Rows Helper
  const addAdjustmentRow = () => {
    setAdjustments([...adjustments, { type: 'Additional Income', amount: '', reason: '', notes: '' }]);
  };

  const removeAdjustmentRow = (index: number) => {
    setAdjustments(adjustments.filter((_, i) => i !== index));
  };

  const updateAdjustmentRow = (index: number, field: keyof AdjustmentEntry, val: any) => {
    const updated = [...adjustments];
    updated[index] = { ...updated[index], [field]: val };
    setAdjustments(updated);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-500">Loading daily closing wizard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Daily Business Closing</h1>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                isCompleted
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {isCompleted ? 'Closing Completed & Locked' : 'In Progress (Open)'}
            </span>
            {!isCompleted && lastSavedTimestamp && (
              <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 shadow-xs">
                <Check className="w-3 h-3 text-emerald-600" />
                <span>Auto-saved</span>
              </span>
            )}
            {!isCompleted && isDraftRestored && (
              <button
                type="button"
                onClick={handleClearLocalDraft}
                className="text-[11px] text-slate-400 hover:text-rose-600 underline font-medium transition ml-1"
                title="Discard unsaved changes and reset to default values"
              >
                Reset to defaults
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Reconcile live stock, collections, distributor payables, and net profit for:{' '}
            <span className="font-semibold text-slate-800">{formatDate(selectedDate)}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {isCompleted && (
            <button
              type="button"
              onClick={handleDownloadDailyPdf}
              disabled={downloadingDailyPdf}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
              title="Download single-day Daily Closing PDF report"
            >
              {downloadingDailyPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download Day PDF</span>
                  <span className="sm:hidden">Day PDF</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsMonthlyPdfModalOpen(true)}
            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            title="Generate and download monthly closing PDF report"
          >
            <FileText className="w-3.5 h-3.5 text-rose-600" />
            <span className="hidden sm:inline">Monthly Closing PDF</span>
            <span className="sm:hidden">Monthly PDF</span>
          </button>

          <DailyClosingCalendar
            selectedDate={selectedDate}
            onSelectDate={handleSelectCalendarDate}
            isCompleted={isCompleted}
            refreshTrigger={calendarRefreshTrigger}
          />

          {isCompleted && hasRole('owner', 'admin') && (
            <button
              type="button"
              onClick={() => setIsReopenModalOpen(true)}
              className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reopen Closing for Correction</span>
            </button>
          )}
        </div>
      </div>

      {/* Future Date Alert Banner */}
      {isFutureDate(selectedDate) && (
        <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl flex items-center justify-between gap-4 text-rose-950">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
            <div>
              <p className="text-sm font-bold">Future Date Closing Not Allowed</p>
              <p className="text-xs text-rose-800 mt-0.5">
                Future-date closing is not allowed. Please select today or a previous date.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate(getTodayDateString())}
            className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shrink-0 shadow-sm"
          >
            Switch to Today
          </button>
        </div>
      )}

      {/* Completed State Banner */}
      {isCompleted && (
        <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-emerald-950 shadow-xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold">Daily Closing Completed & Locked</p>
              <p className="text-xs text-emerald-800">
                This record was submitted on {formatDate(closingRecord.submittedAt || selectedDate)}. All financial and
                stock numbers are locked. Reopen with owner permission to make edits.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownloadDailyPdf}
            disabled={downloadingDailyPdf}
            className="w-full sm:w-auto px-4 py-2 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-xs shrink-0 disabled:opacity-50"
            title="Download PDF report for this locked day record"
          >
            {downloadingDailyPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Downloading PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Download Day Record (PDF)</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Progress Stepper Indicator (5 Steps) */}
      <div className="bg-white p-2 sm:p-4 rounded-2xl border border-slate-200 shadow-sm w-full">
        <div className="grid grid-cols-5 gap-1 sm:gap-2 text-center text-xs font-semibold w-full">
          {[
            { step: 1, title: '1. Distributor Purchase', shortTitle: '1. Purchase', miniTitle: '1', icon: ShoppingBag },
            { step: 2, title: '2. Counter Collection', shortTitle: '2. Collection', miniTitle: '2', icon: Wallet },
            { step: 3, title: '3. Chicken Stock & Sales', shortTitle: '3. Chicken', miniTitle: '3', icon: Scale },
            { step: 4, title: '4. Egg Stock & Sales', shortTitle: '4. Eggs', miniTitle: '4', icon: Egg },
            { step: 5, title: '5. Review & Submit', shortTitle: '5. Review', miniTitle: '5', icon: FileCheck },
          ].map((s) => {
            const isActive = currentStep === s.step;
            const isDone = currentStep > s.step;
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => setCurrentStep(s.step)}
                className={`flex items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 px-1 sm:px-2 rounded-xl border transition min-h-[44px] ${
                  isActive
                    ? 'bg-brand-600 text-white border-brand-600 shadow-sm font-bold'
                    : isDone
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold'
                    : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                }`}
                title={s.title}
              >
                <s.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="truncate hidden lg:inline">{s.title}</span>
                <span className="truncate hidden xs:inline lg:hidden text-[11px]">{s.shortTitle}</span>
                <span className="xs:hidden text-xs font-bold">{s.miniTitle}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 1: DISTRIBUTOR CHICKEN PURCHASE */}
      {currentStep === 1 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          {isCompleted && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Closing is completed & locked. Read-only mode active.</span>
              </div>
              {hasRole('owner', 'admin') && (
                <button
                  type="button"
                  onClick={() => setIsReopenModalOpen(true)}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reopen for Correction</span>
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Step 1: Distributor Chicken Purchase</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Record all live chicken deliveries received from suppliers for this business date.
              </p>
            </div>
            {!isCompleted && (
              <button
                type="button"
                onClick={addPurchaseRow}
                className="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Another Purchase</span>
              </button>
            )}
          </div>

          {/* Auto-Sync Indicator & Action */}
          <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                <strong>Auto-Synced:</strong> Purchases entered here automatically record in{' '}
                <span className="font-semibold text-blue-950 underline decoration-blue-300">Distributor Supply Management</span>.
              </span>
            </div>
            {!isCompleted && (
              <button
                type="button"
                onClick={() => syncStep1Purchases(false)}
                disabled={saving}
                className="self-start sm:self-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Syncing...' : 'Sync to Supplies'}</span>
              </button>
            )}
          </div>

          <div className="space-y-4">
            {purchases.map((p, idx) => {
              const rowWeight = parseFloat(String(p.weightKg)) || 0;
              const rowPrice = parseFloat(String(p.pricePerKg)) || 0;
              const rowTotal = rowWeight * rowPrice;

              return (
                <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase">Purchase Entry #{idx + 1}</span>
                    {!isCompleted && purchases.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePurchaseRow(idx)}
                        className="text-xs text-rose-600 hover:text-rose-800 flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Distributor</label>
                      <select
                        value={
                          p.distributorId ||
                          (distributors.find((d) => d.name.toLowerCase() === (p.distributorName || '').toLowerCase())?.id) ||
                          (p.distributorName === 'SR Poultry' ? distributors.find((d) => d.name.toLowerCase().includes('sr poultry'))?.id : undefined) ||
                          ''
                        }
                        onChange={(e) => updatePurchaseRow(idx, 'distributorId', e.target.value)}
                        disabled={isCompleted}
                        className="w-full px-3 py-2 bg-white text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600 cursor-default font-semibold text-slate-800"
                      >
                        <option value="">Select Existing or Enter Name</option>
                        {distributors.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      {!p.distributorId && p.distributorName !== 'SR Poultry' && (
                        <input
                          type="text"
                          value={p.distributorName}
                          onChange={(e) => updatePurchaseRow(idx, 'distributorName', e.target.value)}
                          placeholder="Distributor Name"
                          disabled={isCompleted}
                          className="w-full mt-1.5 px-3 py-2 bg-white text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Total Weight (kg)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={p.weightKg}
                        onChange={(e) => updatePurchaseRow(idx, 'weightKg', e.target.value)}
                        placeholder="e.g. 150"
                        disabled={isCompleted}
                        className="w-full px-3 py-2 bg-white text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Purchase Price / kg</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={p.pricePerKg}
                        onChange={(e) => updatePurchaseRow(idx, 'pricePerKg', e.target.value)}
                        placeholder="e.g. 180"
                        disabled={isCompleted}
                        className="w-full px-3 py-2 bg-white text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Calculated Total</label>
                      <div className="w-full px-3 py-2 bg-slate-200/80 text-xs font-bold text-slate-900 rounded-xl border border-slate-300 flex items-center justify-between">
                        <span>₹</span>
                        <span>{formatCurrency(rowTotal).replace('₹', '')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Step 1 Total Box */}
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-emerald-900">Total Distributor Purchases Today</p>
              <p className="text-xs text-emerald-700">Total Weight: {formatKg(totalPurchaseWeight)}</p>
            </div>
            <p className="text-2xl font-black text-emerald-950">{formatCurrency(totalPurchaseCost)}</p>
          </div>
        </div>
      )}

      {/* STEP 2: DAILY COUNTER COLLECTION */}
      {currentStep === 2 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          {isCompleted && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Closing is completed & locked. Read-only mode active.</span>
              </div>
              {hasRole('owner', 'admin') && (
                <button
                  type="button"
                  onClick={() => setIsReopenModalOpen(true)}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reopen for Correction</span>
                </button>
              )}
            </div>
          )}

          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900">Step 2: Daily Counter Collection</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter total liquid money collected from customers at the shop counter throughout the entire business day.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">💵 Cash Collection (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                placeholder="e.g. 8000"
                disabled={isCompleted}
                className="w-full mt-2 px-3.5 py-2.5 bg-white text-base font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">Currency notes & coins</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">📱 UPI / Online Collection (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={upi}
                onChange={(e) => setUpi(e.target.value)}
                placeholder="e.g. 12000"
                disabled={isCompleted}
                className="w-full mt-2 px-3.5 py-2.5 bg-white text-base font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">GPay, PhonePe, Paytm QR</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">💳 Card Collection (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={card}
                onChange={(e) => setCard(e.target.value)}
                placeholder="e.g. 1000"
                disabled={isCompleted}
                className="w-full mt-2 px-3.5 py-2.5 bg-white text-base font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">POS swipe machine</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 mb-1">🪙 Other Payment Collection (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={other}
                onChange={(e) => setOther(e.target.value)}
                placeholder="e.g. 500"
                disabled={isCompleted}
                className="w-full mt-2 px-3.5 py-2.5 bg-white text-base font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">Coupons or direct transfer</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Optional Collection Notes</label>
            <input
              type="text"
              value={collectionNotes}
              onChange={(e) => setCollectionNotes(e.target.value)}
              placeholder="e.g. ₹500 extra petty cash returned from morning counter register"
              disabled={isCompleted}
              className="w-full px-3 py-2 bg-slate-50 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
            />
          </div>

          {/* Prominent Counter Collection Total */}
          <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl shadow flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-100 uppercase tracking-wider">
                Total Daily Counter Collection
              </p>
              <p className="text-xs text-emerald-100 mt-0.5">Sum of Cash + UPI + Card + Other received today</p>
            </div>
            <p className="text-3xl font-black">{formatCurrency(totalCounterCollection)}</p>
          </div>
        </div>
      )}

      {/* STEP 3: CHICKEN STOCK AND DAILY SALES */}
      {currentStep === 3 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          {isCompleted && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Closing is completed & locked. Read-only mode active.</span>
              </div>
              {hasRole('owner', 'admin') && (
                <button
                  type="button"
                  onClick={() => setIsReopenModalOpen(true)}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reopen for Correction</span>
                </button>
              )}
            </div>
          )}

          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900">Step 3: Chicken Stock & Daily Sales</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verify opening stock, incoming deliveries, remaining evening stock, and the selling price.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 1. Opening Stock with Previous Day Valuation */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">Opening Stock (kg)</label>
                  {!isCompleted && (hasPreviousClosing || suggestedPrevStock !== null || (suggestedPrevRate !== null && suggestedPrevRate > 0)) && (
                    <button
                      type="button"
                      onClick={applyPreviousClosing}
                      className="text-[11px] font-semibold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded-lg border border-brand-200 flex items-center gap-1 transition cursor-pointer"
                      title="Click to apply previous day closing stock weight and rate"
                    >
                      <span>⚡ Sync Prev Closing: {suggestedPrevStock !== null ? `${suggestedPrevStock}kg @ ` : ''}₹{suggestedPrevRate || openingStockRate || 112}/kg</span>
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={openingStock}
                  onChange={(e) => handleOpeningStockChange(e.target.value)}
                  placeholder="e.g. 39"
                  disabled={isCompleted}
                  className="w-full mt-1.5 px-3 py-2 bg-white text-base font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                />
                {hasPreviousClosing || suggestedPrevStock !== null ? (
                  <p className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center gap-1">
                    <span>✓ Carried from previous closing ({suggestedPrevStock !== null ? suggestedPrevStock : openingStock} kg @ ₹{suggestedPrevRate || openingStockRate || 112}/kg)</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">Carried from previous day closing or enter opening stock</p>
                )}
              </div>

              {/* Previous Day Valuation / Amount Option */}
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Previous Day Amount
                  </span>
                  <label className={`flex items-center gap-1.5 text-[11px] text-slate-600 ${isCompleted ? 'cursor-default' : 'cursor-pointer'} select-none`}>
                    <input
                      type="checkbox"
                      checked={includeOpeningAmount}
                      disabled={isCompleted}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIncludeOpeningAmount(checked);
                        if (checked && (!openingStockAmount || parseFloat(String(openingStockAmount)) === 0)) {
                          const w = parseFloat(String(openingStock)) || 0;
                          const r = parseFloat(String(openingStockRate)) || suggestedPrevRate || 0;
                          if (r > 0) {
                            setOpeningStockRate(r);
                            if (w > 0) setOpeningStockAmount((w * r).toFixed(2));
                          }
                        }
                      }}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-3.5 h-3.5"
                    />
                    <span className="font-semibold text-slate-700">Include in Cost</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Rate / KG (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={openingStockRate}
                      onChange={(e) => handleOpeningRateChange(e.target.value)}
                      placeholder={suggestedPrevRate ? `e.g. ${suggestedPrevRate}` : 'e.g. 112'}
                      disabled={isCompleted}
                      className="w-full px-2.5 py-1.5 bg-white text-xs font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Opening Value (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={openingStockAmount}
                      onChange={(e) => handleOpeningAmountChange(e.target.value)}
                      placeholder={
                        suggestedPrevRate && openingStock
                          ? `e.g. ${(parseFloat(String(openingStock)) * suggestedPrevRate).toFixed(0)}`
                          : 'e.g. 4368'
                      }
                      disabled={isCompleted}
                      className="w-full px-2.5 py-1.5 bg-white text-xs font-bold text-brand-700 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                </div>

                {includeOpeningAmount && numOpeningAmount > 0 && (
                  <p className="text-[10px] text-emerald-700 font-medium mt-1.5 flex items-center justify-between">
                    <span>Valued @ {numOpeningRate > 0 ? `₹${numOpeningRate.toFixed(2)}/kg` : 'custom'}</span>
                    <span className="font-bold">{formatCurrency(numOpeningAmount)}</span>
                  </p>
                )}
              </div>
            </div>

            {/* 2. New Stock Received Card */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">+ New Stock Received (kg)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                  placeholder="e.g. 113.1"
                  disabled={isCompleted}
                  className="w-full mt-1.5 px-3 py-2 bg-white text-base font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                />
                <p className="text-[11px] text-slate-400 mt-1">From distributor deliveries</p>
              </div>

              <div className="pt-3 border-t border-slate-200">
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Today's Purchases (Step 1)
                </p>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-slate-500">Purchases Cost:</span>
                  <span className="font-bold text-slate-800">{formatCurrency(totalPurchaseCost)}</span>
                </div>
                {totalPurchaseWeight > 0 && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Weight: {formatKg(totalPurchaseWeight)} @ ₹{(totalPurchaseCost / totalPurchaseWeight).toFixed(2)}/kg
                  </p>
                )}
              </div>
            </div>

            {/* 3. Total Available Stock Card */}
            <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <label className="block text-xs font-bold text-emerald-950">= Total Available Stock (kg)</label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none bg-emerald-100/70 hover:bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-300/80 transition">
                    <input
                      type="checkbox"
                      checked={hasStockTransfer}
                      disabled={isCompleted}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setHasStockTransfer(checked);
                        if (checked && stockTransfers.length === 0) {
                          setStockTransfers([
                            { destinationShop: '', transferredWeight: '', transferDate: selectedDate, notes: '' },
                          ]);
                        }
                      }}
                      className="rounded border-emerald-400 text-brand-600 focus:ring-brand-500 w-3.5 h-3.5"
                    />
                    <span className="text-[11px] font-bold text-emerald-900">
                      Stock Transferred to Another Shop?
                    </span>
                  </label>
                </div>

                {/* Stock Breakdown */}
                <div className="mt-2 space-y-1.5 bg-emerald-100/90 p-3 rounded-xl border border-emerald-200/80">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-800 font-semibold">Total Available Stock:</span>
                    <span className="font-bold text-emerald-950 text-base">{formatKg(totalAvailableStock)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-800 font-semibold">Stock Transferred:</span>
                    <span className={`font-bold ${numTransferred > 0 ? 'text-amber-800' : 'text-emerald-950'}`}>
                      {formatKg(numTransferred)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-emerald-200">
                    <span className="text-emerald-950 font-black">Stock Available for Sale:</span>
                    <span className="font-black text-emerald-950 text-lg">{formatKg(stockAvailableForSale)}</span>
                  </div>
                </div>
                <p className="text-[11px] text-emerald-700 mt-1">
                  Opening ({formatKg(numOpening)}) + New ({formatKg(numNew)})
                </p>
              </div>

              <div className="pt-3 border-t border-emerald-200/80">
                <p className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-1">
                  Total Available Valuation
                </p>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-emerald-800 font-medium">Total Inventory Cost:</span>
                  <span className="font-bold text-emerald-950 text-sm">{formatCurrency(totalAvailableCost)}</span>
                </div>
                {totalAvailableStock > 0 && totalAvailableCost > 0 && (
                  <p className="text-[10px] text-emerald-700 mt-0.5 font-medium">
                    Blended Cost: ₹{blendedCostPerKg.toFixed(2)}/kg
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Stock Transfer Section (visible when toggle is ON) */}
          {hasStockTransfer && (
            <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-2xl shadow-sm space-y-3 transition-all animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-amber-700 shrink-0" />
                  <div>
                    <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                      Stock Transfers to Other Shops
                    </h3>
                    <p className="text-[11px] text-amber-800">
                      Record all outbound chicken stock transfers to branches or external shops
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-amber-800 font-medium bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                    Deducted from Stock Available for Sale
                  </span>
                  {!isCompleted && (
                    <button
                      type="button"
                      onClick={addStockTransferRow}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Another Transfer</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Multiple Transfer Cards / Rows */}
              <div className="space-y-3">
                {stockTransfers.map((t, idx) => {
                  const rowWeight = parseFloat(String(t.transferredWeight)) || 0;
                  return (
                    <div
                      key={idx}
                      className="p-3.5 bg-white rounded-xl border border-amber-200/90 shadow-sm relative space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-xs border-b border-amber-100 pb-1.5">
                        <span className="font-bold text-amber-950 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-black flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span>Transfer Record {stockTransfers.length > 1 ? `#${idx + 1}` : ''}</span>
                        </span>

                        <div className="flex items-center gap-2">
                          {rowWeight > 0 && (
                            <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                              Valuation: {formatCurrency(rowWeight * blendedCostPerKg)} (@ ₹{blendedCostPerKg.toFixed(2)}/kg)
                            </span>
                          )}
                          {!isCompleted && stockTransfers.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeStockTransferRow(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition"
                              title="Remove this transfer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* Transfer Date */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Transfer Date <span className="text-rose-500">*</span>
                          </label>
                          <DailyClosingCalendar
                            selectedDate={t.transferDate || selectedDate}
                            onSelectDate={(d) => updateStockTransferRow(idx, 'transferDate', d)}
                            disabled={isCompleted}
                            className="w-full"
                            showStatusBadge={false}
                          />
                        </div>

                        {/* Destination Shop Name */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Destination Shop Name <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            list="destination-shops-datalist"
                            value={t.destinationShop}
                            onChange={(e) => updateStockTransferRow(idx, 'destinationShop', e.target.value)}
                            placeholder="e.g. Branch 2"
                            disabled={isCompleted}
                            className="w-full px-3 py-2 bg-white text-xs font-semibold border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                            required
                          />
                        </div>

                        {/* Transferred Chicken Weight (kg) */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Transferred Chicken Weight (kg) <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            inputMode="decimal"
                            value={t.transferredWeight}
                            onChange={(e) => updateStockTransferRow(idx, 'transferredWeight', e.target.value)}
                            placeholder="e.g. 20 or 5.5"
                            disabled={isCompleted}
                            className="w-full px-3 py-2 bg-white text-base font-bold border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                            required
                          />
                        </div>

                        {/* Optional Reason / Notes */}
                        <div>
                          <label className="block text-[11px] font-medium text-slate-700 mb-1">
                            Optional Reason / Notes
                          </label>
                          <input
                            type="text"
                            value={t.notes || ''}
                            onChange={(e) => updateStockTransferRow(idx, 'notes', e.target.value)}
                            placeholder="e.g. Branch replenishment"
                            disabled={isCompleted}
                            className="w-full px-3 py-2 bg-white text-xs border border-amber-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <datalist id="destination-shops-datalist">
                {savedDestinationShops.map((shop, i) => (
                  <option key={i} value={shop} />
                ))}
              </datalist>

              {/* Validation alert */}
              {numTransferred > totalAvailableStock && (
                <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    <strong>Warning:</strong> Total transferred quantity ({formatKg(numTransferred)}) cannot exceed available stock ({formatKg(totalAvailableStock)}).
                  </span>
                </div>
              )}

              {/* Bottom Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 bg-amber-100/80 p-3 rounded-xl border border-amber-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-amber-950">
                    Total Transferred: {formatKg(numTransferred)}
                  </span>
                  <span className="text-amber-700 font-medium">
                    across {stockTransfers.filter((t) => (parseFloat(String(t.transferredWeight)) || 0) > 0).length} destination shop(s)
                  </span>
                  <span className="text-slate-500 text-[11px]">(not counted as chicken sold)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-amber-950">
                    Total Valuation: {formatCurrency(numTransferred * blendedCostPerKg)} (@ ₹{blendedCostPerKg.toFixed(2)}/kg)
                  </span>
                  {!isCompleted && (
                    <button
                      type="button"
                      onClick={addStockTransferRow}
                      className="text-xs font-bold text-amber-800 hover:text-amber-950 underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add More
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Closing Stock Weight */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  − Closing Stock / Remaining Stock (kg) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={closingStock}
                  onChange={(e) => handleClosingStockChange(e.target.value)}
                  placeholder="e.g. 66"
                  disabled={isCompleted}
                  className="w-full mt-1.5 px-3.5 py-2.5 bg-white text-base font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">Weighed physical stock at shop closing</p>
              </div>
            </div>

            {/* Closing Stock Price per KG */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Closing Stock Price per KG (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={closingStockPrice}
                  onChange={(e) => handleClosingPriceChange(e.target.value)}
                  placeholder="e.g. 112"
                  disabled={isCompleted}
                  className="w-full mt-1.5 px-3.5 py-2.5 bg-white text-base font-bold border border-emerald-500 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">Evening stock valuation rate per kg</p>
              </div>
            </div>

            {/* Total Closing Stock Amount */}
            <div className="p-4 bg-violet-50/70 rounded-2xl border border-violet-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-violet-950">
                    = Total Closing Stock Amount
                  </label>
                  <span className="text-[10px] font-semibold text-violet-700 uppercase bg-violet-100/80 px-2 py-0.5 rounded">
                    Calculated
                  </span>
                </div>
                <div className="mt-1.5 py-2 px-3 bg-violet-100/90 rounded-xl text-2xl font-black text-violet-950">
                  {formatCurrency(totalClosingAmount)}
                </div>
                <p className="text-[11px] text-violet-700 mt-1.5 font-medium">
                  {formatKg(numClosing)} × ₹{numClosingPrice.toFixed(2)}/kg
                </p>
              </div>
            </div>
          </div>

          {/* Automatic Calculation Highlight */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Quantity Sold</p>
                <p className="text-xs text-amber-700 font-semibold mt-0.5">Stock Available for Sale − Closing Stock</p>
                <p className="text-[11px] text-amber-600 mt-1 font-mono">
                  {formatKg(stockAvailableForSale)} − {formatKg(numClosing)}
                </p>
              </div>
              <p className="text-3xl font-black text-amber-950">{formatKg(quantitySold)}</p>
            </div>

            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-blue-900 uppercase tracking-wider">Chicken Sales Revenue</p>
                <p className="text-xs text-blue-700 font-semibold mt-0.5">Total Inventory Cost − Total Closing Stock Amount</p>
                <p className="text-[11px] text-blue-600 mt-1 font-mono">
                  {formatCurrency(totalAvailableCost)} − {hasStockTransfer && numTransferred > 0 ? `${formatCurrency(transferredCost)} (Transfer) − ` : ''}{formatCurrency(totalClosingAmount)}
                </p>
              </div>
              <p className="text-3xl font-black text-blue-950">{formatCurrency(chickenSalesRevenue)}</p>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: EGG STOCK & DAILY SALES */}
      {currentStep === 4 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          {isCompleted && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Closing is completed & locked. Read-only mode active.</span>
              </div>
              {hasRole('owner', 'admin') && (
                <button
                  type="button"
                  onClick={() => setIsReopenModalOpen(true)}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reopen for Correction</span>
                </button>
              )}
            </div>
          )}

          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900">Step 4: Egg Stock & Daily Sales</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Verify opening egg stock, new egg trays/crates received, remaining evening stock, and the selling price per egg.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 1. Opening Stock with Previous Day Valuation */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">Opening Stock (eggs)</label>
                  {!isCompleted && (hasPreviousEggClosing || suggestedPrevEggStock !== null || (suggestedPrevEggRate !== null && suggestedPrevEggRate > 0)) && (
                    <button
                      type="button"
                      onClick={applyPreviousEggClosing}
                      className="text-[11px] font-semibold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded-lg border border-brand-200 flex items-center gap-1 transition cursor-pointer"
                      title="Click to apply previous day closing egg stock and rate"
                    >
                      <span>⚡ Sync Prev Closing: {suggestedPrevEggStock !== null ? `${suggestedPrevEggStock} eggs @ ` : ''}₹{suggestedPrevEggRate || eggOpeningStockRate || 6}/egg</span>
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="1"
                  min="0"
                  inputMode="numeric"
                  value={eggOpeningStock}
                  onChange={(e) => handleEggOpeningStockChange(e.target.value)}
                  placeholder="e.g. 150"
                  disabled={isCompleted}
                  className="w-full mt-1.5 px-3 py-2 bg-white text-base font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                />
                {hasPreviousEggClosing || suggestedPrevEggStock !== null ? (
                  <p className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center gap-1">
                    <span>✓ Carried from previous closing ({suggestedPrevEggStock !== null ? suggestedPrevEggStock : eggOpeningStock} eggs @ ₹{suggestedPrevEggRate || eggOpeningStockRate || 6}/egg)</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">Carried from previous day closing or enter opening eggs</p>
                )}
              </div>

              {/* Previous Day Valuation / Amount Option */}
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Previous Day Amount
                  </span>
                  <label className={`flex items-center gap-1.5 text-[11px] text-slate-600 ${isCompleted ? 'cursor-default' : 'cursor-pointer'} select-none`}>
                    <input
                      type="checkbox"
                      checked={eggIncludeOpeningAmount}
                      disabled={isCompleted}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEggIncludeOpeningAmount(checked);
                        if (checked && (!eggOpeningStockAmount || parseFloat(String(eggOpeningStockAmount)) === 0)) {
                          const w = parseFloat(String(eggOpeningStock)) || 0;
                          const r = parseFloat(String(eggOpeningStockRate)) || suggestedPrevEggRate || 6;
                          if (r > 0) {
                            setEggOpeningStockRate(r);
                            if (w > 0) setEggOpeningStockAmount((w * r).toFixed(2));
                          }
                        }
                      }}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-3.5 h-3.5"
                    />
                    <span className="font-semibold text-slate-700">Include in Cost</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Rate / Egg (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={eggOpeningStockRate}
                      onChange={(e) => handleEggOpeningRateChange(e.target.value)}
                      placeholder={suggestedPrevEggRate ? `e.g. ${suggestedPrevEggRate}` : 'e.g. 6'}
                      disabled={isCompleted}
                      className="w-full px-2.5 py-1.5 bg-white text-xs font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Opening Value (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={eggOpeningStockAmount}
                      onChange={(e) => handleEggOpeningAmountChange(e.target.value)}
                      placeholder={
                        suggestedPrevEggRate && eggOpeningStock
                          ? `e.g. ${(parseFloat(String(eggOpeningStock)) * suggestedPrevEggRate).toFixed(0)}`
                          : 'e.g. 900'
                      }
                      disabled={isCompleted}
                      className="w-full px-2.5 py-1.5 bg-white text-xs font-bold text-brand-700 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                </div>

                {eggIncludeOpeningAmount && numEggOpeningAmount > 0 && (
                  <p className="text-[10px] text-emerald-700 font-medium mt-1.5 flex items-center justify-between">
                    <span>Valued @ {numEggOpeningRate > 0 ? `₹${numEggOpeningRate.toFixed(2)}/egg` : 'custom'}</span>
                    <span className="font-bold">{formatCurrency(numEggOpeningAmount)}</span>
                  </p>
                )}
              </div>
            </div>

            {/* 2. New Stock Received Card */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">+ New Stock Received (eggs)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  inputMode="numeric"
                  value={eggNewStock}
                  onChange={(e) => handleEggNewStockChange(e.target.value)}
                  placeholder="e.g. 300"
                  disabled={isCompleted}
                  className="w-full mt-1.5 px-3 py-2 bg-white text-base font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                />
                <p className="text-[11px] text-slate-400 mt-1">From egg suppliers / trays delivered</p>
              </div>

              <div className="pt-3 border-t border-slate-200">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Rate / Egg (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={eggPurchaseRate}
                      onChange={(e) => handleEggPurchaseRateChange(e.target.value)}
                      placeholder="e.g. 5.50"
                      disabled={isCompleted}
                      className="w-full px-2.5 py-1.5 bg-white text-xs font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Purchase Cost (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={eggPurchaseCost}
                      onChange={(e) => handleEggPurchaseCostChange(e.target.value)}
                      placeholder="e.g. 1650"
                      disabled={isCompleted}
                      className="w-full px-2.5 py-1.5 bg-white text-xs font-bold text-brand-700 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                    />
                  </div>
                </div>
                {numEggNew > 0 && numEggPurchaseCost > 0 && (
                  <p className="text-[10px] text-emerald-700 font-medium mt-1.5 flex items-center justify-between">
                    <span>{numEggNew} eggs @ ₹{(numEggPurchaseCost / numEggNew).toFixed(2)}/egg</span>
                    <span className="font-bold">{formatCurrency(numEggPurchaseCost)}</span>
                  </p>
                )}
              </div>
            </div>

            {/* 3. Total Available Stock Card */}
            <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200 flex flex-col justify-between space-y-3">
              <div>
                <label className="block text-xs font-bold text-emerald-950 mb-1">= Total Available Stock (eggs)</label>
                <div className="mt-1.5 py-2 px-3 bg-emerald-100/90 rounded-xl text-xl font-black text-emerald-950">
                  {totalAvailableEggStock} eggs
                </div>
                <p className="text-[11px] text-emerald-700 mt-1">
                  Opening ({numEggOpening}) + New ({numEggNew})
                </p>
              </div>

              <div className="pt-3 border-t border-emerald-200/80">
                <p className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-1">
                  Total Available Valuation
                </p>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-emerald-800 font-medium">Total Inventory Cost:</span>
                  <span className="font-bold text-emerald-950 text-sm">{formatCurrency(totalAvailableEggCost)}</span>
                </div>
                {totalAvailableEggStock > 0 && totalAvailableEggCost > 0 && (
                  <p className="text-[10px] text-emerald-700 mt-0.5 font-medium">
                    Blended Cost: ₹{blendedEggCost.toFixed(2)}/egg
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Closing Stock */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  − Closing Stock / Remaining Stock (eggs) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  inputMode="numeric"
                  value={eggClosingStock}
                  onChange={(e) => handleEggClosingStockChange(e.target.value)}
                  placeholder="e.g. 50"
                  disabled={isCompleted}
                  className="w-full mt-1.5 px-3.5 py-2.5 bg-white text-base font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">Counted physical eggs at shop closing</p>
              </div>
            </div>

            {/* Closing Stock Price per Egg */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Closing Stock Price per Egg (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={eggClosingStockPrice}
                  onChange={(e) => handleEggClosingPriceChange(e.target.value)}
                  placeholder="e.g. 6.00"
                  disabled={isCompleted}
                  className="w-full mt-1.5 px-3.5 py-2.5 bg-white text-base font-bold border border-emerald-500 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100 disabled:text-slate-600"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">Evening egg valuation rate per egg</p>
              </div>
            </div>

            {/* Total Closing Stock Amount */}
            <div className="p-4 bg-violet-50/70 rounded-2xl border border-violet-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-violet-950">
                    = Total Closing Stock Amount
                  </label>
                  <span className="text-[10px] font-semibold text-violet-700 uppercase bg-violet-100/80 px-2 py-0.5 rounded">
                    Calculated
                  </span>
                </div>
                <div className="mt-1.5 py-2 px-3 bg-violet-100/90 rounded-xl text-2xl font-black text-violet-950">
                  {formatCurrency(totalEggClosingAmount)}
                </div>
                <p className="text-[11px] text-violet-700 mt-1.5 font-medium">
                  {numEggClosing} eggs × ₹{numEggClosingPrice.toFixed(2)}/egg
                </p>
              </div>
            </div>
          </div>

          {/* Automatic Calculation Highlight */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Quantity Sold</p>
                <p className="text-xs text-amber-700 font-semibold mt-0.5">Total Available − Closing Stock</p>
                <p className="text-[11px] text-amber-600 mt-1 font-mono">
                  {totalAvailableEggStock} eggs − {numEggClosing} eggs
                </p>
              </div>
              <p className="text-3xl font-black text-amber-950">{eggQuantitySold} <span className="text-sm font-normal text-amber-800">eggs</span></p>
            </div>

            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-blue-900 uppercase tracking-wider">Egg Sales Revenue</p>
                <p className="text-xs text-blue-700 font-semibold mt-0.5">Quantity Sold × Closing Stock Price per Egg</p>
                <p className="text-[11px] text-blue-600 mt-1 font-mono">
                  {eggQuantitySold} eggs × ₹{numEggClosingPrice.toFixed(2)}/egg
                </p>
              </div>
              <p className="text-3xl font-black text-blue-950">{formatCurrency(eggSalesRevenue)}</p>
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: REVIEW, ADJUSTMENTS AND CONFIRMATION */}
      {currentStep === 5 && (
        <div className="space-y-6">
          {/* Section A: Distributor Purchase Summary */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>A. Distributor Purchase Summary</span>
                <span className="text-xs font-normal text-slate-500">({purchases.length} entry)</span>
              </h3>
              {!isCompleted && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  Edit Step 1
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-400">Total Weight Purchased:</span>
                <p className="font-bold text-slate-800 text-sm mt-0.5">{formatKg(totalPurchaseWeight)}</p>
              </div>
              <div>
                <span className="text-slate-400">Total Purchase Cost:</span>
                <p className="font-bold text-slate-800 text-sm mt-0.5">{formatCurrency(totalPurchaseCost)}</p>
              </div>
              <div>
                <span className="text-slate-400">Purchases Avg Cost/kg:</span>
                <p className="font-bold text-slate-800 text-sm mt-0.5">
                  {formatCurrency(totalPurchaseWeight > 0 ? totalPurchaseCost / totalPurchaseWeight : 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Section B: Counter Collection Summary */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">B. Counter Collection Summary</h3>
              {!isCompleted && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  Edit Step 2
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div>
                <span className="text-slate-400">Cash:</span>
                <p className="font-bold text-slate-800 mt-0.5">{formatCurrency(parseFloat(String(cash)) || 0)}</p>
              </div>
              <div>
                <span className="text-slate-400">UPI / QR:</span>
                <p className="font-bold text-slate-800 mt-0.5">{formatCurrency(parseFloat(String(upi)) || 0)}</p>
              </div>
              <div>
                <span className="text-slate-400">Card:</span>
                <p className="font-bold text-slate-800 mt-0.5">{formatCurrency(parseFloat(String(card)) || 0)}</p>
              </div>
              <div>
                <span className="text-slate-400">Other:</span>
                <p className="font-bold text-slate-800 mt-0.5">{formatCurrency(parseFloat(String(other)) || 0)}</p>
              </div>
              <div>
                <span className="text-emerald-700 font-bold">Total Collected:</span>
                <p className="font-black text-emerald-900 text-sm mt-0.5">{formatCurrency(totalCounterCollection)}</p>
              </div>
            </div>
          </div>

          {/* Section C: Chicken Stock & Sales Summary */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">C. Chicken Stock & Sales Summary</h3>
              {!isCompleted && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  Edit Step 3
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400">Opening Stock (Previous Day):</span>
                <p className="font-bold text-slate-800 mt-0.5">
                  {formatKg(numOpening)}
                  {includeOpeningAmount && numOpeningAmount > 0 && (
                    <span className="block text-[11px] text-emerald-700 font-medium">
                      Valued: {formatCurrency(numOpeningAmount)} (@ ₹{numOpeningRate.toFixed(2)}/kg)
                    </span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Total Available Stock:</span>
                <p className="font-bold text-slate-800 mt-0.5">
                  {formatKg(totalAvailableStock)}
                  <span className="block text-[11px] text-slate-500 font-normal">
                    Total Value: {formatCurrency(totalAvailableCost)}
                  </span>
                </p>
              </div>
              {hasStockTransfer && numTransferred > 0 && (
                <div>
                  <span className="text-amber-700 font-bold">Stock Transferred:</span>
                  <p className="font-bold text-amber-900 mt-0.5">
                    {formatKg(numTransferred)}
                    <span
                      className="block text-[11px] text-amber-700 font-medium truncate"
                      title={stockTransfers
                        .filter((t) => (parseFloat(String(t.transferredWeight)) || 0) > 0)
                        .map((t) => `${t.destinationShop || 'Shop'}: ${formatKg(t.transferredWeight)}`)
                        .join(', ')}
                    >
                      To:{' '}
                      {stockTransfers
                        .filter((t) => (parseFloat(String(t.transferredWeight)) || 0) > 0)
                        .map((t) => `${t.destinationShop || 'Shop'} (${formatKg(t.transferredWeight)})`)
                        .join(', ')}
                    </span>
                  </p>
                </div>
              )}
              <div>
                <span className="text-slate-400">Stock Available for Sale:</span>
                <p className="font-bold text-slate-800 mt-0.5">
                  {formatKg(stockAvailableForSale)}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Closing Stock:</span>
                <p className="font-bold text-slate-800 mt-0.5">
                  {formatKg(numClosing)}
                  {totalClosingAmount > 0 && (
                    <span className="block text-[11px] text-violet-700 font-medium">
                      Valued: {formatCurrency(totalClosingAmount)} (@ ₹{numClosingPrice.toFixed(2)}/kg)
                    </span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Quantity Sold:</span>
                <p className="font-bold text-slate-800 mt-0.5">{formatKg(quantitySold)}</p>
              </div>
              <div>
                <span className="text-blue-700 font-bold">Chicken Sales Revenue:</span>
                <p className="font-black text-blue-900 text-sm mt-0.5">{formatCurrency(chickenSalesRevenue)}</p>
                <span className="text-[10px] text-slate-500">Total Inventory Cost − Total Closing Stock Amount</span>
              </div>
              <div>
                <span className="text-rose-700 font-bold">Cost of Chicken Sold:</span>
                <p className="font-black text-rose-900 text-sm mt-0.5">{formatCurrency(costOfChickenSold)}</p>
                <span className="text-[10px] text-slate-500">Blended: ₹{blendedCostPerKg.toFixed(2)}/kg</span>
              </div>
            </div>
          </div>

          {/* Section D: Egg Stock & Sales Summary */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900">D. Egg Stock & Sales Summary</h3>
              {!isCompleted && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  Edit Step 4
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400">Opening Stock (Previous Day):</span>
                <p className="font-bold text-slate-800 mt-0.5">
                  {numEggOpening} eggs
                  {eggIncludeOpeningAmount && numEggOpeningAmount > 0 && (
                    <span className="block text-[11px] text-emerald-700 font-medium">
                      Valued: {formatCurrency(numEggOpeningAmount)} (@ ₹{numEggOpeningRate.toFixed(2)}/egg)
                    </span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-slate-400">New Eggs Received:</span>
                <p className="font-bold text-slate-800 mt-0.5">
                  {numEggNew} eggs
                  {numEggPurchaseCost > 0 && (
                    <span className="block text-[11px] text-slate-500 font-normal">
                      Cost: {formatCurrency(numEggPurchaseCost)} {numEggNew > 0 ? `(@ ₹${(numEggPurchaseCost / numEggNew).toFixed(2)}/egg)` : ''}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Total Available Stock:</span>
                <p className="font-bold text-slate-800 mt-0.5">
                  {totalAvailableEggStock} eggs
                  <span className="block text-[11px] text-slate-500 font-normal">
                    Total Value: {formatCurrency(totalAvailableEggCost)}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-slate-400">Closing Stock:</span>
                <p className="font-bold text-slate-800 mt-0.5">
                  {numEggClosing} eggs
                  {totalEggClosingAmount > 0 && (
                    <span className="block text-[11px] text-violet-700 font-medium">
                      Valued: {formatCurrency(totalEggClosingAmount)} (@ ₹{numEggClosingPrice.toFixed(2)}/egg)
                    </span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-slate-400">Quantity Sold:</span>
                <p className="font-bold text-slate-800 mt-0.5">{eggQuantitySold} eggs</p>
              </div>
              <div>
                <span className="text-blue-700 font-bold">Egg Sales Revenue:</span>
                <p className="font-black text-blue-900 text-sm mt-0.5">{formatCurrency(eggSalesRevenue)}</p>
                <span className="text-[10px] text-slate-500">Quantity Sold × Closing Price/egg</span>
              </div>
              <div>
                <span className="text-rose-700 font-bold">Cost of Eggs Sold:</span>
                <p className="font-black text-rose-900 text-sm mt-0.5">{formatCurrency(costOfEggsSold)}</p>
                <span className="text-[10px] text-slate-500">Blended: ₹{blendedEggCost.toFixed(2)}/egg</span>
              </div>
            </div>
          </div>

          {/* Section E: Adjustments */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">E. Other Income & Expenses / Adjustments</h3>
                <p className="text-[11px] text-slate-500">Record miscellaneous adjustments with a mandatory explanation</p>
              </div>
              {!isCompleted && (
                <button
                  type="button"
                  onClick={addAdjustmentRow}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Adjustment</span>
                </button>
              )}
            </div>

            {adjustments.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No financial adjustments added for this closing.</p>
            ) : (
              <div className="space-y-3">
                {adjustments.map((adj, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <div className="sm:col-span-3">
                      <select
                        value={adj.type}
                        onChange={(e) => updateAdjustmentRow(idx, 'type', e.target.value)}
                        disabled={isCompleted}
                        className="w-full px-2.5 py-1.5 bg-white text-xs border border-slate-300 rounded-lg outline-none disabled:bg-slate-100 disabled:text-slate-600"
                      >
                        <option value="Additional Income">+ Additional Income</option>
                        <option value="Expense">− Shop Expense / Deduction</option>
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={adj.amount}
                        onChange={(e) => updateAdjustmentRow(idx, 'amount', e.target.value)}
                        placeholder="Amount (₹)"
                        disabled={isCompleted}
                        className="w-full px-2.5 py-1.5 bg-white text-xs border border-slate-300 rounded-lg outline-none font-semibold disabled:bg-slate-100 disabled:text-slate-600"
                        required
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        value={adj.reason}
                        onChange={(e) => updateAdjustmentRow(idx, 'reason', e.target.value)}
                        placeholder="Mandatory Reason (e.g. Ice transport cost)"
                        disabled={isCompleted}
                        className="w-full px-2.5 py-1.5 bg-white text-xs border border-slate-300 rounded-lg outline-none disabled:bg-slate-100 disabled:text-slate-600"
                        required
                      />
                    </div>

                    {!isCompleted && (
                      <div className="sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeAdjustmentRow(idx)}
                          className="p-1 text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section F: Final Estimated Profit Summary Box */}
          <div className="p-4 sm:p-6 bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-2">
              Financial Closing & Profit Breakdown
            </h3>

            <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-4 text-xs">
              <div>
                <span className="text-slate-400">Total Counter Collection:</span>
                <p className="text-base sm:text-lg font-bold text-white mt-1 truncate">{formatCurrency(totalCounterCollection)}</p>
              </div>

              <div>
                <span className="text-slate-400">Chicken Sales Revenue:</span>
                <p className="text-base sm:text-lg font-bold text-blue-400 mt-1 truncate">{formatCurrency(chickenSalesRevenue)}</p>
              </div>

              <div>
                <span className="text-slate-400">Egg Sales Revenue:</span>
                <p className="text-base sm:text-lg font-bold text-amber-400 mt-1 truncate">{formatCurrency(eggSalesRevenue)}</p>
              </div>

              <div>
                <span className="text-slate-400">Total Sales Revenue:</span>
                <p className="text-base sm:text-lg font-bold text-emerald-400 mt-1 truncate">{formatCurrency(totalSalesRevenue)}</p>
                <p className="text-[10px] text-slate-500">Chicken + Eggs</p>
              </div>

              <div>
                <span className="text-slate-400">Total COGS:</span>
                <p className="text-base sm:text-lg font-bold text-rose-400 mt-1 truncate">{formatCurrency(totalCogs)}</p>
                <p className="text-[10px] text-slate-500">Unsold stock preserved</p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex flex-col xs:flex-row xs:items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-brand-400 uppercase">Estimated Net Daily Profit</p>
                <p className="text-[11px] text-slate-400">
                  Total Counter Collection ({formatCurrency(totalCounterCollection)}) − Chicken Revenue ({formatCurrency(chickenSalesRevenue)}) − Egg Revenue ({formatCurrency(eggSalesRevenue)})
                  {netAdjustments !== 0 && (
                    <span className={netAdjustments > 0 ? 'text-emerald-400 font-medium ml-1' : 'text-rose-400 font-medium ml-1'}>
                      {netAdjustments > 0 ? `+ Other Income (${formatCurrency(netAdjustments)})` : `− Expenses (${formatCurrency(Math.abs(netAdjustments))})`}
                    </span>
                  )}
                </p>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-white">{formatCurrency(estimatedNetProfit)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Wizard Footer Controls */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col-reverse xs:flex-row xs:items-center justify-between gap-3">
        <div>
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="w-full xs:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition min-h-[44px]"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          )}
        </div>

        {isCompleted ? (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full xs:w-auto">
            <button
              type="button"
              onClick={handleDownloadDailyPdf}
              disabled={downloadingDailyPdf}
              className="w-full xs:w-auto px-4 sm:px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow transition min-h-[44px] disabled:opacity-50"
            >
              {downloadingDailyPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download Day PDF</span>
                </>
              )}
            </button>

            {currentStep < 5 && (
              <button
                type="button"
                onClick={handleNext}
                className="w-full xs:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition min-h-[44px]"
              >
                <span>View Next Step</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {hasRole('owner', 'admin') ? (
              <button
                type="button"
                onClick={() => setIsReopenModalOpen(true)}
                className="w-full xs:w-auto px-4 sm:px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow transition min-h-[44px]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reopen Closing for Correction</span>
              </button>
            ) : (
              <span className="text-xs text-slate-400 italic">Contact shop owner to reopen</span>
            )}
          </div>
        ) : (
          <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 sm:gap-3 w-full xs:w-auto">
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving || isFutureDate(selectedDate)}
              className="w-full xs:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50 min-h-[44px]"
            >
              <Save className="w-4 h-4" />
              <span>Save Draft</span>
            </button>

            {currentStep < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={isFutureDate(selectedDate)}
                className="w-full xs:w-auto px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow transition disabled:opacity-50 min-h-[44px]"
              >
                <span>Next Step</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={saving || isFutureDate(selectedDate)}
                className="w-full xs:w-auto px-5 sm:px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-700/20 transition disabled:opacity-50 min-h-[44px]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span><span className="hidden sm:inline">Confirm & </span>Submit Daily Closing</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mandatory Reason Modal for Reopening */}
      <ReasonModal
        isOpen={isReopenModalOpen}
        onClose={() => setIsReopenModalOpen(false)}
        onConfirm={handleReopenConfirm}
        title="Reopen Daily Business Closing"
        description="Reopening a locked daily closing unlocks it for editing and logs your user account, timestamp, and explanation in the permanent audit trail."
        confirmText="Reopen for Correction"
        isDanger={true}
      />

      {/* Monthly Closing Report PDF Modal */}
      <MonthlyPdfModal
        isOpen={isMonthlyPdfModalOpen}
        onClose={() => setIsMonthlyPdfModalOpen(false)}
        initialMonth={selectedDate ? parseInt(selectedDate.split('-')[1], 10) : undefined}
        initialYear={selectedDate ? parseInt(selectedDate.split('-')[0], 10) : undefined}
      />
    </div>
  );
};
