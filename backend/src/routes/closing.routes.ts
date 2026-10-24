import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { Decimal, toDecimal, formatMoney, formatWeight, multiply, add, subtract, divide } from '../utils/decimal';
import { getTodayKolkata, isFutureDateKolkata } from '../utils/date';

const router = Router();

// Download single-day Daily Business Closing PDF Report
router.get('/daily-pdf', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const date = (req.query.date as string) || getTodayKolkata();
    const { generateDailyClosingPdf } = await import('../services/dailyPdfService');
    const { buffer, filename } = await generateDailyClosingPdf({ date });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to generate daily closing PDF report.' });
  }
});

// 1. Get prefilled data / suggestions for daily closing wizard on a specific date
router.get('/prefill', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const date = (req.query.date as string) || getTodayKolkata();

    if (isFutureDateKolkata(date)) {
      res.status(400).json({
        success: false,
        error: 'Future-date closing is not allowed. Please select today or a previous date.',
      });
      return;
    }

    // Check if an existing daily closing exists (Draft or Completed)
    const existingRes = await query('SELECT * FROM daily_closings WHERE business_date = $1', [date]);
    const existing = existingRes.rows[0] || null;

    let purchases: any[] = [];
    let adjustments: any[] = [];

    if (existing) {
      const pRes = await query(
        'SELECT * FROM daily_closing_purchases WHERE daily_closing_id = $1 ORDER BY id ASC',
        [existing.id]
      );
      purchases = pRes.rows;

      const aRes = await query(
        'SELECT * FROM financial_adjustments WHERE daily_closing_id = $1 ORDER BY id ASC',
        [existing.id]
      );
      adjustments = aRes.rows;
    } else {
      // If not yet saved, prefill purchases from existing distributor_supplies on this date
      const supRes = await query(
        `SELECT s.id AS distributor_supply_id, s.distributor_id, d.name AS distributor_name,
                s.weight_kg, s.price_per_kg, s.total_amount, s.notes
         FROM distributor_supplies s
         JOIN distributors d ON s.distributor_id = d.id
         WHERE s.supply_date = $1`,
        [date]
      );
      purchases = supRes.rows;
    }

    // Previous closing stock (for opening stock) - prioritize Completed, then Draft
    let prevClosingRes = await query(
      `SELECT *
       FROM daily_closings
       WHERE business_date < $1
       ORDER BY business_date DESC, (CASE WHEN status = 'Completed' THEN 1 ELSE 2 END)
       LIMIT 1`,
      [date]
    );

    // If the closest earlier record is an uncompleted Draft with 0 closing stock, check for the latest Completed closing
    if (
      prevClosingRes.rows.length > 0 &&
      prevClosingRes.rows[0].status !== 'Completed' &&
      toDecimal(prevClosingRes.rows[0].closing_stock_kg || 0).isZero() &&
      toDecimal(prevClosingRes.rows[0].egg_closing_stock || 0).isZero()
    ) {
      const prevCompletedRes = await query(
        `SELECT *
         FROM daily_closings
         WHERE business_date < $1 AND status = 'Completed'
         ORDER BY business_date DESC
         LIMIT 1`,
        [date]
      );
      if (prevCompletedRes.rows.length > 0) {
        prevClosingRes = prevCompletedRes;
      }
    }

    let openingStockKg = new Decimal(0);
    let openingStockRatePerKg = new Decimal(0);
    let openingStockAmount = new Decimal(0);
    let previousDate: string | null = null;

    let eggOpeningStock = new Decimal(0);
    let eggOpeningStockRate = new Decimal(6);
    let eggOpeningStockAmount = new Decimal(0);
    let hasPreviousEggClosing = false;
    let previousEggClosingStock = new Decimal(0);
    let previousEggClosingRate = new Decimal(6);

    if (prevClosingRes.rows.length > 0) {
      const prev = prevClosingRes.rows[0];
      openingStockKg = toDecimal(prev.closing_stock_kg);
      previousDate = String(prev.business_date).split('T')[0];

      // 1. If previous day closing recorded closing stock rate/amount, directly carry forward!
      if (toDecimal(prev.closing_stock_rate_per_kg).gt(0)) {
        openingStockRatePerKg = toDecimal(prev.closing_stock_rate_per_kg);
        openingStockAmount = toDecimal(prev.closing_stock_amount).gt(0)
          ? toDecimal(prev.closing_stock_amount)
          : openingStockKg.times(openingStockRatePerKg);
      } else if (toDecimal(prev.selling_price_per_kg).gt(0)) {
        // Fallback to previous recorded selling/closing price
        openingStockRatePerKg = toDecimal(prev.selling_price_per_kg);
        openingStockAmount = openingStockKg.times(openingStockRatePerKg);
      } else {
        // 2. Check previous day supplies to get the exact previous purchase price/rate
        const prevSupRes = await query(
          'SELECT COALESCE(SUM(total_amount), 0) AS total_amount, COALESCE(SUM(weight_kg), 0) AS total_weight FROM distributor_supplies WHERE supply_date = $1',
          [previousDate]
        );
        const pWeight = toDecimal(prevSupRes.rows[0]?.total_weight || 0);
        const pAmount = toDecimal(prevSupRes.rows[0]?.total_amount || 0);

        if (pWeight.gt(0)) {
          openingStockRatePerKg = pAmount.dividedBy(pWeight);
        } else if (toDecimal(prev.cost_of_chicken_sold).gt(0) && toDecimal(prev.quantity_sold_kg).gt(0)) {
          openingStockRatePerKg = toDecimal(prev.cost_of_chicken_sold).dividedBy(toDecimal(prev.quantity_sold_kg));
        } else if (toDecimal(prev.opening_stock_rate_per_kg).gt(0)) {
          openingStockRatePerKg = toDecimal(prev.opening_stock_rate_per_kg);
        } else {
          const latestSup = await query(
            'SELECT price_per_kg FROM distributor_supplies WHERE supply_date <= $1 ORDER BY supply_date DESC, id DESC LIMIT 1',
            [date]
          );
          if (latestSup.rows.length > 0) {
            openingStockRatePerKg = toDecimal(latestSup.rows[0].price_per_kg);
          } else {
            openingStockRatePerKg = new Decimal(112);
          }
        }

        openingStockAmount = openingStockKg.times(openingStockRatePerKg);
      }

      // Egg carry forward from previous day
      if (prev.egg_closing_stock !== null && prev.egg_closing_stock !== undefined) {
        eggOpeningStock = toDecimal(prev.egg_closing_stock);
        previousEggClosingStock = eggOpeningStock;
        hasPreviousEggClosing = true;
        if (toDecimal(prev.egg_closing_stock_rate).gt(0)) {
          eggOpeningStockRate = toDecimal(prev.egg_closing_stock_rate);
          previousEggClosingRate = eggOpeningStockRate;
          eggOpeningStockAmount = toDecimal(prev.egg_closing_stock_amount).gt(0)
            ? toDecimal(prev.egg_closing_stock_amount)
            : eggOpeningStock.times(eggOpeningStockRate);
        } else {
          eggOpeningStockRate = new Decimal(6);
          previousEggClosingRate = eggOpeningStockRate;
          eggOpeningStockAmount = eggOpeningStock.times(eggOpeningStockRate);
        }
      }
    } else {
      const latestSup = await query(
        'SELECT price_per_kg FROM distributor_supplies WHERE supply_date <= $1 ORDER BY supply_date DESC, id DESC LIMIT 1',
        [date]
      );
      if (latestSup.rows.length > 0) {
        openingStockRatePerKg = toDecimal(latestSup.rows[0].price_per_kg);
      } else {
        openingStockRatePerKg = new Decimal(112);
      }
    }

    if (openingStockKg.gt(0) && openingStockAmount.isZero() && openingStockRatePerKg.gt(0)) {
      openingStockAmount = openingStockKg.times(openingStockRatePerKg);
    }

    // Total new stock received from distributor supplies on this date
    const suppliesRes = await query(
      'SELECT COALESCE(SUM(weight_kg), 0) AS total_weight, COALESCE(SUM(total_amount), 0) AS total_amount FROM distributor_supplies WHERE supply_date = $1',
      [date]
    );
    const newStockReceivedKg = toDecimal(suppliesRes.rows[0].total_weight);
    const distributorPurchasesCost = toDecimal(suppliesRes.rows[0].total_amount);

    // Sum of collections recorded on this date from customer bills & payments
    const cashBillsRes = await query(
      `SELECT payment_method, SUM(paid_amount) AS total_paid
       FROM customer_bills
       WHERE bill_date = $1 AND paid_amount > 0
       GROUP BY payment_method`,
      [date]
    );

    const custPaymentsRes = await query(
      `SELECT payment_method, SUM(amount) AS total_paid
       FROM customer_payments
       WHERE payment_date = $1
       GROUP BY payment_method`,
      [date]
    );

    // Also counter chicken sales
    const salesRes = await query(
      `SELECT payment_method, SUM(total_amount) AS total_amount, SUM(weight_sold_kg) AS total_weight
       FROM chicken_sales
       WHERE sale_date = $1 AND customer_bill_id IS NULL
       GROUP BY payment_method`,
      [date]
    );

    // Operating expenses recorded on this date
    const expRes = await query(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM operating_expenses WHERE expense_date = $1',
      [date]
    );
    const operatingExpenses = toDecimal(expRes.rows[0].total);

    // Sum up payments by method
    let prefilledCash = new Decimal(0);
    let prefilledUpi = new Decimal(0);
    let prefilledCard = new Decimal(0);
    let prefilledOther = new Decimal(0);

    const accumulate = (method: string, amt: Decimal) => {
      if (method === 'Cash') prefilledCash = prefilledCash.plus(amt);
      else if (method === 'UPI') prefilledUpi = prefilledUpi.plus(amt);
      else if (method === 'Card') prefilledCard = prefilledCard.plus(amt);
      else prefilledOther = prefilledOther.plus(amt);
    };

    cashBillsRes.rows.forEach((r) => accumulate(r.payment_method, toDecimal(r.total_paid)));
    custPaymentsRes.rows.forEach((r) => accumulate(r.payment_method, toDecimal(r.total_paid)));
    salesRes.rows.forEach((r) => accumulate(r.payment_method, toDecimal(r.total_amount)));

    const transferRes = await query(
      `SELECT * FROM stock_transfers 
       WHERE (daily_closing_id = $1 OR (transfer_date = $2 AND daily_closing_id IS NULL)) 
         AND status = 'Completed' 
       ORDER BY id ASC`,
      [existing?.id || -1, date]
    );
    const existingTransfers = transferRes.rows.map((t: any) => ({
      id: t.id,
      destinationShop: t.destination_shop,
      transferredWeightKg: t.weight_kg,
      transferDate: t.transfer_date instanceof Date
        ? t.transfer_date.toISOString().split('T')[0]
        : String(t.transfer_date),
      notes: t.notes || '',
      costPerKg: t.cost_per_kg,
      totalCost: t.total_cost,
    }));
    const existingTransfer = existingTransfers[0] || null;

    const destShopsRes = await query(
      "SELECT DISTINCT destination_shop FROM stock_transfers WHERE destination_shop IS NOT NULL AND destination_shop != '' ORDER BY destination_shop ASC"
    );

    res.json({
      success: true,
      data: {
        date,
        existingClosing: existing
          ? {
              id: existing.id,
              status: existing.status,
              openingStockKg: formatWeight(
                toDecimal(existing.opening_stock_kg).gt(0)
                  ? existing.opening_stock_kg
                  : (existing.status !== 'Completed' && openingStockKg.gt(0)
                      ? openingStockKg
                      : existing.opening_stock_kg)
              ),
              openingStockRatePerKg: formatMoney(
                toDecimal(existing.opening_stock_rate_per_kg).gt(0)
                  ? existing.opening_stock_rate_per_kg
                  : openingStockRatePerKg
              ),
              openingStockAmount: formatMoney(
                toDecimal(existing.opening_stock_amount).gt(0)
                  ? existing.opening_stock_amount
                  : (toDecimal(existing.opening_stock_kg).gt(0)
                      ? toDecimal(existing.opening_stock_kg).times(
                          toDecimal(existing.opening_stock_rate_per_kg).gt(0)
                            ? existing.opening_stock_rate_per_kg
                            : openingStockRatePerKg
                        )
                      : (existing.status !== 'Completed' && openingStockKg.gt(0)
                          ? openingStockAmount
                          : existing.opening_stock_amount))
              ),
              newStockKg: formatWeight(existing.new_stock_kg),
              totalAvailableStockKg: formatWeight(existing.total_available_stock_kg),
              totalAvailableStockCost: formatMoney(existing.total_available_stock_cost || 0),
              stockTransferredKg: existing.stock_transferred_kg !== null ? String(existing.stock_transferred_kg) : '0',
              stockAvailableForSaleKg: existing.stock_available_for_sale_kg !== null ? String(existing.stock_available_for_sale_kg) : '0',
              closingStockKg: formatWeight(existing.closing_stock_kg),
              closingStockRatePerKg: formatMoney(existing.closing_stock_rate_per_kg || existing.selling_price_per_kg || 0),
              closingStockAmount: formatMoney(existing.closing_stock_amount || 0),
              quantitySoldKg: formatWeight(existing.quantity_sold_kg),
              sellingPricePerKg: formatMoney(existing.selling_price_per_kg),
              chickenSalesRevenue: formatMoney(existing.chicken_sales_revenue),
              distributorPurchaseCost: formatMoney(existing.distributor_purchase_cost),
              costOfChickenSold: formatMoney(existing.cost_of_chicken_sold),
              eggOpeningStock: toDecimal(existing.egg_opening_stock).gt(0)
                ? String(existing.egg_opening_stock)
                : (existing.status !== 'Completed' && eggOpeningStock.gt(0)
                    ? String(eggOpeningStock)
                    : (existing.egg_opening_stock !== null ? String(existing.egg_opening_stock) : '0')),
              eggOpeningStockRate: formatMoney(
                toDecimal(existing.egg_opening_stock_rate).gt(0)
                  ? existing.egg_opening_stock_rate
                  : (eggOpeningStockRate.gt(0) ? eggOpeningStockRate : 6)
              ),
              eggOpeningStockAmount: formatMoney(
                toDecimal(existing.egg_opening_stock_amount).gt(0)
                  ? existing.egg_opening_stock_amount
                  : (existing.status !== 'Completed' && eggOpeningStock.gt(0)
                      ? eggOpeningStockAmount
                      : 0)
              ),
              eggNewStock: existing.egg_new_stock !== null ? String(existing.egg_new_stock) : '0',
              eggPurchaseRate: formatMoney(
                existing.egg_purchase_rate ||
                  (Number(existing.egg_new_stock) > 0 && Number(existing.egg_purchase_cost) > 0
                    ? Number(existing.egg_purchase_cost) / Number(existing.egg_new_stock)
                    : 0)
              ),
              eggPurchaseCost: formatMoney(existing.egg_purchase_cost || 0),
              eggTotalAvailableStock: existing.egg_total_available_stock !== null ? String(existing.egg_total_available_stock) : '0',
              eggTotalAvailableCost: formatMoney(existing.egg_total_available_cost || 0),
              eggClosingStock: existing.egg_closing_stock !== null ? String(existing.egg_closing_stock) : '0',
              eggClosingStockRate: formatMoney(existing.egg_closing_stock_rate || 6),
              eggClosingStockAmount: formatMoney(existing.egg_closing_stock_amount || 0),
              eggQuantitySold: existing.egg_quantity_sold !== null ? String(existing.egg_quantity_sold) : '0',
              eggSalesRevenue: formatMoney(existing.egg_sales_revenue || 0),
              totalSalesRevenue: formatMoney(existing.total_sales_revenue || existing.chicken_sales_revenue || 0),
              estimatedGrossProfit: formatMoney(existing.estimated_gross_profit),
              operatingExpensesAmount: formatMoney(existing.operating_expenses_amount),
              adjustmentsAmount: formatMoney(existing.adjustments_amount),
              estimatedNetProfit: formatMoney(existing.estimated_net_profit),
              cashCollection: formatMoney(existing.cash_collection),
              upiCollection: formatMoney(existing.upi_collection),
              cardCollection: formatMoney(existing.card_collection),
              otherCollection: formatMoney(existing.other_collection),
              totalCounterCollection: formatMoney(existing.total_counter_collection),
              counterCollectionDifference: formatMoney(existing.counter_collection_difference),
              notes: existing.notes,
              submittedAt: existing.submitted_at,
            }
          : null,
        stockTransfers: existingTransfers,
        stockTransfer: existingTransfer
          ? {
              hasTransfer: true,
              destinationShop: existingTransfer.destinationShop,
              transferredWeightKg: existingTransfer.transferredWeightKg,
              transferDate: existingTransfer.transferDate,
              notes: existingTransfer.notes || '',
              costPerKg: existingTransfer.costPerKg,
              totalCost: existingTransfer.totalCost,
            }
          : existing && Number(existing.stock_transferred_kg) > 0
          ? {
              hasTransfer: true,
              destinationShop: 'Branch',
              transferredWeightKg: existing.stock_transferred_kg,
              transferDate: date,
              notes: '',
            }
          : null,
        savedDestinationShops: destShopsRes.rows.map((r: any) => r.destination_shop),
        suggested: {
          openingStockKg: formatWeight(openingStockKg),
          openingStockRatePerKg: formatMoney(openingStockRatePerKg),
          openingStockAmount: formatMoney(openingStockAmount),
          previousDate,
          hasPreviousClosing: prevClosingRes.rows.length > 0,
          previousClosingStockKg: formatWeight(openingStockKg),
          previousClosingRatePerKg: formatMoney(openingStockRatePerKg),
          previousClosingAmount: formatMoney(openingStockAmount),
          eggOpeningStock: eggOpeningStock.toNumber(),
          eggOpeningStockRate: eggOpeningStockRate.toNumber(),
          eggOpeningStockAmount: eggOpeningStockAmount.toNumber(),
          hasPreviousEggClosing,
          previousEggClosingStock: previousEggClosingStock.toNumber(),
          previousEggClosingRate: previousEggClosingRate.toNumber(),
          newStockReceivedKg: formatWeight(newStockReceivedKg),
          distributorPurchasesCost: formatMoney(distributorPurchasesCost),
          totalAvailableStockKg: formatWeight(openingStockKg.plus(newStockReceivedKg)),
          totalAvailableStockCost: formatMoney(openingStockAmount.plus(distributorPurchasesCost)),
          prefilledCash: formatMoney(prefilledCash),
          prefilledUpi: formatMoney(prefilledUpi),
          prefilledCard: formatMoney(prefilledCard),
          prefilledOther: formatMoney(prefilledOther),
          prefilledTotalCollection: formatMoney(
            prefilledCash.plus(prefilledUpi).plus(prefilledCard).plus(prefilledOther)
          ),
          operatingExpenses: formatMoney(operatingExpenses),
        },
        purchases,
        adjustments,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Submit or Save Draft Daily Closing
router.post('/save', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      businessDate,
      isDraft,
      purchases, // Array of { distributorId, distributorName, weightKg, pricePerKg, notes }
      counterCollection, // { cash, upi, card, other, notes }
      stockAndSales, // { openingStockKg, newStockKg, closingStockKg, sellingPricePerKg, ... }
      stockTransfer, // { hasTransfer, destinationShop, transferredWeightKg, transferDate, notes }
      stockTransfers, // Array of { destinationShop, transferredWeightKg, transferDate, notes }
      eggStockAndSales, // { openingStock, openingStockRate, openingStockAmount, newStock, purchaseCost, closingStock, closingStockRate, closingStockAmount }
      adjustments, // Array of { type: 'Additional Income' | 'Expense', amount, reason, notes }
      notes,
    } = req.body;

    if (!businessDate) {
      res.status(400).json({ success: false, error: 'Business Date is required.' });
      return;
    }

    if (isFutureDateKolkata(businessDate)) {
      res.status(400).json({
        success: false,
        error: 'Future-date closing is not allowed. Please select today or a previous date.',
      });
      return;
    }

    // Check existing
    const existingRes = await query('SELECT * FROM daily_closings WHERE business_date = $1', [businessDate]);
    const existing = existingRes.rows[0];

    // Prevent duplicate submission if already completed
    if (existing && existing.status === 'Completed' && !isDraft) {
      res.status(400).json({
        success: false,
        error: `Daily closing for date ${businessDate} has already been completed. Reopen closing first with owner permission to modify.`,
      });
      return;
    }

    // Chicken Stock Values parsing using Decimal
    let openingStock = toDecimal(stockAndSales?.openingStockKg || 0);
    let openingRate = toDecimal(stockAndSales?.openingStockRatePerKg || 0);
    let openingAmount = toDecimal(stockAndSales?.openingStockAmount || 0);

    // If opening stock wasn't supplied or is 0, auto-carry forward from previous closing
    if (openingStock.isZero()) {
      const prevClosingForSave = await query(
        `SELECT closing_stock_kg, closing_stock_rate_per_kg, closing_stock_amount, selling_price_per_kg
         FROM daily_closings
         WHERE business_date < $1
         ORDER BY business_date DESC, (CASE WHEN status = 'Completed' THEN 1 ELSE 2 END)
         LIMIT 1`,
        [businessDate]
      );
      if (prevClosingForSave.rows.length > 0 && toDecimal(prevClosingForSave.rows[0].closing_stock_kg).gt(0)) {
        openingStock = toDecimal(prevClosingForSave.rows[0].closing_stock_kg);
        if (openingRate.isZero()) {
          openingRate = toDecimal(prevClosingForSave.rows[0].closing_stock_rate_per_kg).gt(0)
            ? toDecimal(prevClosingForSave.rows[0].closing_stock_rate_per_kg)
            : toDecimal(prevClosingForSave.rows[0].selling_price_per_kg);
        }
        if (openingAmount.isZero() && openingRate.gt(0)) {
          openingAmount = openingStock.times(openingRate);
        }
      }
    }

    if (openingAmount.gt(0) && openingRate.isZero() && openingStock.gt(0)) {
      openingRate = openingAmount.dividedBy(openingStock);
    } else if (openingRate.gt(0) && openingAmount.isZero() && openingStock.gt(0)) {
      openingAmount = openingStock.times(openingRate);
    }

    const newStock = toDecimal(stockAndSales?.newStockKg || 0);
    const closingStock = toDecimal(stockAndSales?.closingStockKg || 0);
    let closingRate = toDecimal(stockAndSales?.closingStockRatePerKg || stockAndSales?.sellingPricePerKg || 0);
    let closingAmount = toDecimal(stockAndSales?.closingStockAmount || 0);

    if (closingAmount.gt(0) && closingRate.isZero() && closingStock.gt(0)) {
      closingRate = closingAmount.dividedBy(closingStock);
    } else if (closingRate.gt(0) && closingAmount.isZero() && closingStock.gt(0)) {
      closingAmount = closingStock.times(closingRate);
    }

    // Stock Transfer parsing (supports both multiple transfers array and single transfer object)
    let rawTransfersList: any[] = [];
    if (Array.isArray(stockTransfers)) {
      rawTransfersList = stockTransfers;
    } else if (stockTransfer && (stockTransfer.hasTransfer || toDecimal(stockTransfer.transferredWeightKg || 0).gt(0))) {
      rawTransfersList = [stockTransfer];
    }

    const parsedTransfers: Array<{
      destinationShop: string;
      transferredWeightKg: Decimal;
      transferDate: string;
      notes: string;
    }> = [];

    let transferredWeight = new Decimal(0);
    for (const t of rawTransfersList) {
      const w = toDecimal(t.transferredWeightKg ?? t.weightKg ?? 0);
      if (w.gt(0)) {
        parsedTransfers.push({
          destinationShop: (t.destinationShop || t.destination_shop || '').trim(),
          transferredWeightKg: w,
          transferDate: (t.transferDate || t.transfer_date || businessDate).trim(),
          notes: (t.notes || '').trim(),
        });
        transferredWeight = transferredWeight.plus(w);
      }
    }

    const hasTransfer = parsedTransfers.length > 0 || Boolean(stockTransfer?.hasTransfer);
    const destinationShop = parsedTransfers.length > 0
      ? parsedTransfers.map((t) => t.destinationShop).filter(Boolean).join(', ')
      : (stockTransfer?.destinationShop || '').trim();
    const transferDate = parsedTransfers[0]?.transferDate || (stockTransfer?.transferDate || businessDate).trim();
    const transferNotes = parsedTransfers[0]?.notes || (stockTransfer?.notes || '').trim();

    // Total Available Stock = Opening Stock + New Stock Received
    const totalAvailable = openingStock.plus(newStock);

    // Stock Available for Sale = Total Available Stock − Stock Transferred
    const stockAvailableForSale = totalAvailable.minus(transferredWeight).gt(0)
      ? totalAvailable.minus(transferredWeight)
      : new Decimal(0);

    // Quantity Sold = Stock Available for Sale − Closing Stock
    let quantitySold = stockAvailableForSale.minus(closingStock);
    if (quantitySold.lt(0)) {
      quantitySold = new Decimal(0);
    }

    // Egg Stock & Sales Values parsing
    let eggOpeningStock = toDecimal(eggStockAndSales?.openingStock || 0);
    let eggOpeningRate = toDecimal(eggStockAndSales?.openingStockRate || 0);
    let eggOpeningAmount = toDecimal(eggStockAndSales?.openingStockAmount || 0);

    // If egg opening stock wasn't supplied or is 0, auto-carry forward from previous closing
    if (eggOpeningStock.isZero()) {
      const prevEggClosingForSave = await query(
        `SELECT egg_closing_stock, egg_closing_stock_rate, egg_closing_stock_amount
         FROM daily_closings
         WHERE business_date < $1
         ORDER BY business_date DESC, (CASE WHEN status = 'Completed' THEN 1 ELSE 2 END)
         LIMIT 1`,
        [businessDate]
      );
      if (prevEggClosingForSave.rows.length > 0 && toDecimal(prevEggClosingForSave.rows[0].egg_closing_stock).gt(0)) {
        eggOpeningStock = toDecimal(prevEggClosingForSave.rows[0].egg_closing_stock);
        if (eggOpeningRate.isZero()) {
          eggOpeningRate = toDecimal(prevEggClosingForSave.rows[0].egg_closing_stock_rate).gt(0)
            ? toDecimal(prevEggClosingForSave.rows[0].egg_closing_stock_rate)
            : new Decimal(6);
        }
        if (eggOpeningAmount.isZero() && eggOpeningRate.gt(0)) {
          eggOpeningAmount = eggOpeningStock.times(eggOpeningRate);
        }
      }
    }

    if (eggOpeningAmount.gt(0) && eggOpeningRate.isZero() && eggOpeningStock.gt(0)) {
      eggOpeningRate = eggOpeningAmount.dividedBy(eggOpeningStock);
    } else if (eggOpeningRate.gt(0) && eggOpeningAmount.isZero() && eggOpeningStock.gt(0)) {
      eggOpeningAmount = eggOpeningStock.times(eggOpeningRate);
    }

    const eggNewStock = toDecimal(eggStockAndSales?.newStock || 0);
    let eggPurchaseRate = toDecimal(eggStockAndSales?.purchaseRate || 0);
    let eggPurchaseCost = toDecimal(eggStockAndSales?.purchaseCost || 0);
    if (eggPurchaseCost.gt(0) && eggPurchaseRate.isZero() && eggNewStock.gt(0)) {
      eggPurchaseRate = eggPurchaseCost.dividedBy(eggNewStock);
    } else if (eggPurchaseRate.gt(0) && eggPurchaseCost.isZero() && eggNewStock.gt(0)) {
      eggPurchaseCost = eggNewStock.times(eggPurchaseRate);
    }
    const eggTotalAvailable = eggOpeningStock.plus(eggNewStock);
    const eggTotalAvailableCost = eggOpeningAmount.plus(eggPurchaseCost);

    const eggClosingStock = toDecimal(eggStockAndSales?.closingStock || 0);
    let eggClosingRate = toDecimal(eggStockAndSales?.closingStockRate || 0);
    let eggClosingAmount = toDecimal(eggStockAndSales?.closingStockAmount || 0);
    if (eggClosingAmount.gt(0) && eggClosingRate.isZero() && eggClosingStock.gt(0)) {
      eggClosingRate = eggClosingAmount.dividedBy(eggClosingStock);
    } else if (eggClosingRate.gt(0) && eggClosingAmount.isZero() && eggClosingStock.gt(0)) {
      eggClosingAmount = eggClosingStock.times(eggClosingRate);
    }

    const eggQuantitySold = eggTotalAvailable.minus(eggClosingStock).gt(0)
      ? eggTotalAvailable.minus(eggClosingStock)
      : new Decimal(0);

    // USER INSTRUCTION: in egg sales revenue is quantity sold * Closing Stock Price per Egg (₹)
    let eggSalesRevenue = eggQuantitySold.times(eggClosingRate);
    if (eggSalesRevenue.lt(0)) {
      eggSalesRevenue = new Decimal(0);
    }

    // Counter collection
    const cash = toDecimal(counterCollection?.cash || 0);
    const upi = toDecimal(counterCollection?.upi || 0);
    const card = toDecimal(counterCollection?.card || 0);
    const other = toDecimal(counterCollection?.other || 0);
    const totalCounterCollection = cash.plus(upi).plus(card).plus(other);

    // Purchases calculation
    let totalPurchasesCost = new Decimal(0);
    let totalPurchasesWeight = new Decimal(0);
    if (Array.isArray(purchases)) {
      purchases.forEach((p) => {
        const w = toDecimal(p.weightKg || 0);
        const pr = toDecimal(p.pricePerKg || 0);
        const cost = w.times(pr);
        totalPurchasesCost = totalPurchasesCost.plus(cost);
        totalPurchasesWeight = totalPurchasesWeight.plus(w);
      });
    }

    // Validation for final submission (if not draft)
    if (!isDraft) {
      if (openingStock.lt(0)) {
        res.status(400).json({ success: false, error: 'Opening stock cannot be negative.' });
        return;
      }
      if (openingRate.lt(0) || openingAmount.lt(0)) {
        res.status(400).json({ success: false, error: 'Opening stock rate and amount cannot be negative.' });
        return;
      }
      if (newStock.lt(0)) {
        res.status(400).json({ success: false, error: 'New stock cannot be negative.' });
        return;
      }
      if (closingStock.lt(0)) {
        res.status(400).json({ success: false, error: 'Closing stock cannot be negative.' });
        return;
      }
      if (closingRate.lt(0) || closingAmount.lt(0)) {
        res.status(400).json({ success: false, error: 'Closing stock price and amount cannot be negative.' });
        return;
      }
      if (hasTransfer) {
        if (transferredWeight.lte(0)) {
          res.status(400).json({ success: false, error: 'Transferred chicken weight must be greater than 0 kg, or turn off the transfer toggle.' });
          return;
        }
        for (const t of parsedTransfers) {
          if (!t.destinationShop) {
            res.status(400).json({ success: false, error: 'Destination shop name is required for each recorded stock transfer.' });
            return;
          }
          if (t.transferredWeightKg.lte(0)) {
            res.status(400).json({ success: false, error: 'Each transferred chicken weight must be greater than 0 kg.' });
            return;
          }
        }
        if (transferredWeight.gt(totalAvailable)) {
          res.status(400).json({
            success: false,
            error: `Total transferred quantity (${transferredWeight.toFixed(2)} kg) cannot exceed the available stock of ${totalAvailable.toFixed(2)} kg.`,
          });
          return;
        }
      }
      if (closingStock.gt(stockAvailableForSale)) {
        res.status(400).json({
          success: false,
          error: `Closing stock (${closingStock.toFixed(2)} kg) cannot exceed stock available for sale (${stockAvailableForSale.toFixed(2)} kg).`,
        });
        return;
      }
      if (quantitySold.lt(0)) {
        res.status(400).json({ success: false, error: 'Quantity sold cannot be negative.' });
        return;
      }
      if (cash.lt(0) || upi.lt(0) || card.lt(0) || other.lt(0)) {
        res.status(400).json({ success: false, error: 'Counter collection values cannot be negative.' });
        return;
      }
      if (eggClosingStock.gt(eggTotalAvailable)) {
        res.status(400).json({
          success: false,
          error: `Egg closing stock (${eggClosingStock.toString()}) cannot exceed total available eggs (${eggTotalAvailable.toString()}).`,
        });
        return;
      }
    }

    // Adjustments sum
    let netAdjustments = new Decimal(0);
    if (Array.isArray(adjustments)) {
      for (const adj of adjustments) {
        if (!isDraft && (!adj.reason || !adj.reason.trim())) {
          res.status(400).json({ success: false, error: 'All financial adjustments require an explicit reason.' });
          return;
        }
        const amt = toDecimal(adj.amount || 0);
        if (adj.type === 'Additional Income') {
          netAdjustments = netAdjustments.plus(amt);
        } else {
          // Expense / Deduction
          netAdjustments = netAdjustments.minus(amt);
        }
      }
    }

    // Operating expenses are calculated by month rather than single calendar day
    const operatingExpenses = new Decimal(0);

    // Total Inventory Cost = Opening Stock Amount (previous day valuation) + Purchases Cost Today
    const totalAvailableStockCost = openingAmount.plus(totalPurchasesCost);

    // Blended cost per kg of total available stock
    const blendedCostPerKg =
      totalAvailable.gt(0) && totalAvailableStockCost.gt(0)
        ? totalAvailableStockCost.dividedBy(totalAvailable)
        : openingRate.gt(0)
        ? openingRate
        : new Decimal(180);

    const transferredCost = transferredWeight.times(blendedCostPerKg);

    // USER INSTRUCTION:
    // in Chicken Sales Revenue it shold calculate Total Inventory Cost-Total Closing Stock Amount .dont change in eggs only change in these
    const transferredDeduction = hasTransfer && transferredWeight.gt(0) ? transferredCost : new Decimal(0);
    let chickenSalesRevenue = totalAvailableStockCost.minus(transferredDeduction).minus(closingAmount);
    if (chickenSalesRevenue.lt(0)) {
      chickenSalesRevenue = new Decimal(0);
    }
    const costOfChickenSold = quantitySold.times(blendedCostPerKg);
    const isCogsEstimated = false;

    // Cost of eggs sold (inventory cost of sold eggs)
    const costOfEggsSold = eggTotalAvailableCost.minus(eggClosingAmount).gt(0)
      ? eggTotalAvailableCost.minus(eggClosingAmount)
      : new Decimal(0);

    // Combined Totals
    const totalSalesRevenue = chickenSalesRevenue.plus(eggSalesRevenue);
    const totalCogs = costOfChickenSold.plus(costOfEggsSold);

    // USER INSTRUCTION:
    // Estimated Net Daily Profit should be calculated Total Counter Collection - Chicken Sales Revenue - Egg Sales Revenue - if Other Income & Expenses / Adjustments are there it should detect it also
    const estimatedGrossProfit = totalCounterCollection.minus(chickenSalesRevenue).minus(eggSalesRevenue);
    // Net profit for daily closing = Gross profit + Net adjustments (operating expenses calculated monthly)
    const estimatedNetProfit = estimatedGrossProfit.plus(netAdjustments);

    // Difference between recorded counter collection and recorded cash/instant sales
    const instantSalesRes = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total 
       FROM chicken_sales 
       WHERE sale_date = $1 AND payment_method != 'Katha'`,
      [businessDate]
    );
    const recordedSalesTotal = toDecimal(instantSalesRes.rows[0].total);
    const counterDiff = totalCounterCollection.minus(recordedSalesTotal);

    const status = isDraft ? 'Draft' : 'Completed';

    const savedClosing = await withTransaction(async (client) => {
      let closingId = existing?.id;

      if (existing) {
        const upRes = await client.query(
          `UPDATE daily_closings
           SET status = $1,
               opening_stock_kg = $2,
               opening_stock_rate_per_kg = $3,
               opening_stock_amount = $4,
               new_stock_kg = $5,
               total_available_stock_kg = $6,
               total_available_stock_cost = $7,
               closing_stock_kg = $8,
               closing_stock_rate_per_kg = $9,
               closing_stock_amount = $10,
               quantity_sold_kg = $11,
               selling_price_per_kg = $12,
               chicken_sales_revenue = $13,
               distributor_purchase_cost = $14,
               cost_of_chicken_sold = $15,
               egg_opening_stock = $16,
               egg_opening_stock_rate = $17,
               egg_opening_stock_amount = $18,
               egg_new_stock = $19,
               egg_purchase_rate = $20,
               egg_purchase_cost = $21,
               egg_total_available_stock = $22,
               egg_total_available_cost = $23,
               egg_closing_stock = $24,
               egg_closing_stock_rate = $25,
               egg_closing_stock_amount = $26,
               egg_quantity_sold = $27,
               egg_sales_revenue = $28,
               total_sales_revenue = $29,
               estimated_gross_profit = $30,
               operating_expenses_amount = $31,
               adjustments_amount = $32,
               estimated_net_profit = $33,
               cash_collection = $34,
               upi_collection = $35,
               card_collection = $36,
               other_collection = $37,
               total_counter_collection = $38,
               counter_collection_difference = $39,
               stock_transferred_kg = $40,
               stock_available_for_sale_kg = $41,
               is_cogs_estimated = $42,
               notes = $43,
               submitted_by = $44,
               submitted_at = ${isDraft ? 'NULL' : 'CURRENT_TIMESTAMP'},
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $45
           RETURNING *`,
          [
            status,
            openingStock.toNumber(),
            openingRate.toNumber(),
            openingAmount.toNumber(),
            newStock.toNumber(),
            totalAvailable.toNumber(),
            totalAvailableStockCost.toNumber(),
            closingStock.toNumber(),
            closingRate.toNumber(),
            closingAmount.toNumber(),
            quantitySold.toNumber(),
            closingRate.toNumber(),
            chickenSalesRevenue.toNumber(),
            totalPurchasesCost.toNumber(),
            costOfChickenSold.toNumber(),
            eggOpeningStock.toNumber(),
            eggOpeningRate.toNumber(),
            eggOpeningAmount.toNumber(),
            eggNewStock.toNumber(),
            eggPurchaseRate.toNumber(),
            eggPurchaseCost.toNumber(),
            eggTotalAvailable.toNumber(),
            eggTotalAvailableCost.toNumber(),
            eggClosingStock.toNumber(),
            eggClosingRate.toNumber(),
            eggClosingAmount.toNumber(),
            eggQuantitySold.toNumber(),
            eggSalesRevenue.toNumber(),
            totalSalesRevenue.toNumber(),
            estimatedGrossProfit.toNumber(),
            operatingExpenses.toNumber(),
            netAdjustments.toNumber(),
            estimatedNetProfit.toNumber(),
            cash.toNumber(),
            upi.toNumber(),
            card.toNumber(),
            other.toNumber(),
            totalCounterCollection.toNumber(),
            counterDiff.toNumber(),
            transferredWeight.toNumber(),
            stockAvailableForSale.toNumber(),
            isCogsEstimated,
            notes || null,
            req.user!.id,
            closingId,
          ]
        );
        closingId = upRes.rows[0].id;
      } else {
        const insRes = await client.query(
          `INSERT INTO daily_closings (
            business_date, status, opening_stock_kg, opening_stock_rate_per_kg, opening_stock_amount,
            new_stock_kg, total_available_stock_kg, total_available_stock_cost,
            closing_stock_kg, closing_stock_rate_per_kg, closing_stock_amount,
            quantity_sold_kg, selling_price_per_kg, chicken_sales_revenue,
            distributor_purchase_cost, cost_of_chicken_sold,
            egg_opening_stock, egg_opening_stock_rate, egg_opening_stock_amount,
            egg_new_stock, egg_purchase_rate, egg_purchase_cost, egg_total_available_stock, egg_total_available_cost,
            egg_closing_stock, egg_closing_stock_rate, egg_closing_stock_amount,
            egg_quantity_sold, egg_sales_revenue, total_sales_revenue,
            estimated_gross_profit, operating_expenses_amount, adjustments_amount, estimated_net_profit,
            cash_collection, upi_collection, card_collection, other_collection,
            total_counter_collection, counter_collection_difference,
            stock_transferred_kg, stock_available_for_sale_kg, is_cogs_estimated,
            notes, submitted_by, submitted_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29,
            $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, ${isDraft ? 'NULL' : 'CURRENT_TIMESTAMP'}
          ) RETURNING *`,
          [
            businessDate,
            status,
            openingStock.toNumber(),
            openingRate.toNumber(),
            openingAmount.toNumber(),
            newStock.toNumber(),
            totalAvailable.toNumber(),
            totalAvailableStockCost.toNumber(),
            closingStock.toNumber(),
            closingRate.toNumber(),
            closingAmount.toNumber(),
            quantitySold.toNumber(),
            closingRate.toNumber(),
            chickenSalesRevenue.toNumber(),
            totalPurchasesCost.toNumber(),
            costOfChickenSold.toNumber(),
            eggOpeningStock.toNumber(),
            eggOpeningRate.toNumber(),
            eggOpeningAmount.toNumber(),
            eggNewStock.toNumber(),
            eggPurchaseRate.toNumber(),
            eggPurchaseCost.toNumber(),
            eggTotalAvailable.toNumber(),
            eggTotalAvailableCost.toNumber(),
            eggClosingStock.toNumber(),
            eggClosingRate.toNumber(),
            eggClosingAmount.toNumber(),
            eggQuantitySold.toNumber(),
            eggSalesRevenue.toNumber(),
            totalSalesRevenue.toNumber(),
            estimatedGrossProfit.toNumber(),
            operatingExpenses.toNumber(),
            netAdjustments.toNumber(),
            estimatedNetProfit.toNumber(),
            cash.toNumber(),
            upi.toNumber(),
            card.toNumber(),
            other.toNumber(),
            totalCounterCollection.toNumber(),
            counterDiff.toNumber(),
            transferredWeight.toNumber(),
            stockAvailableForSale.toNumber(),
            isCogsEstimated,
            notes || null,
            req.user!.id,
          ]
        );
        closingId = insRes.rows[0].id;
      }

      // Manage stock transfer records linked to closing
      const existTrans = await client.query(
        'SELECT id FROM stock_transfers WHERE daily_closing_id = $1',
        [closingId]
      );
      for (const t of existTrans.rows) {
        await client.query(
          "DELETE FROM inventory_transactions WHERE reference_module = 'stock_transfer' AND reference_id = $1",
          [t.id]
        );
      }
      await client.query('DELETE FROM stock_transfers WHERE daily_closing_id = $1', [closingId]);

      if (hasTransfer && parsedTransfers.length > 0) {
        for (const t of parsedTransfers) {
          const tWeight = t.transferredWeightKg;
          const tDest = t.destinationShop;
          const tDate = t.transferDate || businessDate;
          const tNotes = t.notes || 'Recorded via Daily Closing';
          const tCost = tWeight.times(blendedCostPerKg);

          const insTrans = await client.query(
            `INSERT INTO stock_transfers (
               transfer_date, source_shop, destination_shop, weight_kg, cost_per_kg, total_cost, daily_closing_id, status, notes, created_by
             ) VALUES ($1, 'Reddy Chicken and Mutton Center', $2, $3, $4, $5, $6, 'Completed', $7, $8)
             RETURNING id`,
            [
              tDate,
              tDest,
              tWeight.toNumber(),
              blendedCostPerKg.toNumber(),
              tCost.toNumber(),
              closingId,
              tNotes,
              req.user!.id,
            ]
          );
          const transferId = insTrans.rows[0].id;

          if (!isDraft) {
            await client.query(
              `INSERT INTO inventory_transactions (
                 txn_date, txn_type, weight_kg, cost_per_kg, reference_module, reference_id, reason, created_by
               ) VALUES ($1, 'transfer_out', $2, $3, 'stock_transfer', $4, $5, $6)`,
              [
                tDate,
                tWeight.toNumber(),
                blendedCostPerKg.toNumber(),
                transferId,
                `Stock transferred to ${tDest}`,
                req.user!.id,
              ]
            );
          }
        }
      }

      // Re-create purchases linked to closing and sync into distributor_supplies
      await client.query('DELETE FROM daily_closing_purchases WHERE daily_closing_id = $1', [closingId]);

      const savedSupplyIds: number[] = [];

      if (Array.isArray(purchases)) {
        for (const p of purchases) {
          const w = toDecimal(p.weightKg || 0);
          const pr = toDecimal(p.pricePerKg || 0);
          const tot = w.times(pr);

          let supplyId = p.distributorSupplyId ? parseInt(String(p.distributorSupplyId), 10) : null;
          let distId = p.distributorId ? parseInt(String(p.distributorId), 10) : null;
          let distName = (p.distributorName || '').trim();

          // Resolve or automatically create distributor in distributors table
          if (!distId) {
            if (!distName) {
              distName = 'Supplier';
            }
            const existingDist = await client.query(
              'SELECT id, name FROM distributors WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1',
              [distName]
            );
            if (existingDist.rows.length > 0) {
              distId = existingDist.rows[0].id;
              distName = existingDist.rows[0].name;
            } else {
              const newDist = await client.query(
                `INSERT INTO distributors (name, opening_balance, is_active)
                 VALUES ($1, 0, true)
                 RETURNING id, name`,
                [distName]
              );
              distId = newDist.rows[0].id;
              distName = newDist.rows[0].name;
            }
          }

          if (w.gt(0)) {
            // Check if existing supply record exists
            if (supplyId) {
              const existSup = await client.query('SELECT id FROM distributor_supplies WHERE id = $1', [supplyId]);
              if (existSup.rows.length > 0) {
                await client.query(
                  `UPDATE distributor_supplies 
                   SET distributor_id = $1, supply_date = $2, weight_kg = $3, price_per_kg = $4,
                       total_amount = $5, notes = $6, daily_closing_id = $7, updated_at = CURRENT_TIMESTAMP
                   WHERE id = $8`,
                  [
                    distId,
                    businessDate,
                    w.toNumber(),
                    pr.toNumber(),
                    tot.toNumber(),
                    p.notes || 'Recorded via Daily Closing',
                    closingId,
                    supplyId,
                  ]
                );
              } else {
                supplyId = null;
              }
            }

            if (!supplyId) {
              // Check if an unclaimed supply for this closing and distributor already exists
              const existClosingSup = await client.query(
                savedSupplyIds.length > 0
                  ? 'SELECT id FROM distributor_supplies WHERE daily_closing_id = $1 AND distributor_id = $2 AND supply_date = $3 AND id NOT IN (' +
                    savedSupplyIds.map((_, i) => `$${i + 4}`).join(',') +
                    ') LIMIT 1'
                  : 'SELECT id FROM distributor_supplies WHERE daily_closing_id = $1 AND distributor_id = $2 AND supply_date = $3 LIMIT 1',
                savedSupplyIds.length > 0
                  ? [closingId, distId, businessDate, ...savedSupplyIds]
                  : [closingId, distId, businessDate]
              );
              if (existClosingSup.rows.length > 0) {
                supplyId = existClosingSup.rows[0].id;
                await client.query(
                  `UPDATE distributor_supplies
                   SET weight_kg = $1, price_per_kg = $2, total_amount = $3, notes = $4, updated_at = CURRENT_TIMESTAMP
                   WHERE id = $5`,
                  [
                    w.toNumber(),
                    pr.toNumber(),
                    tot.toNumber(),
                    p.notes || 'Recorded via Daily Closing',
                    supplyId,
                  ]
                );
              } else {
                // Insert new distributor supply!
                const supRes = await client.query(
                  `INSERT INTO distributor_supplies (
                    distributor_id, supply_date, weight_kg, price_per_kg, total_amount, notes, daily_closing_id, created_by
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                  RETURNING id`,
                  [
                    distId,
                    businessDate,
                    w.toNumber(),
                    pr.toNumber(),
                    tot.toNumber(),
                    p.notes || 'Recorded via Daily Closing',
                    closingId,
                    req.user!.id,
                  ]
                );
                supplyId = supRes.rows[0].id;
              }
            }

            if (supplyId !== null) {
              savedSupplyIds.push(supplyId);
            }
          }

          // Insert into daily_closing_purchases
          await client.query(
            `INSERT INTO daily_closing_purchases (
              daily_closing_id, distributor_id, distributor_name, weight_kg, price_per_kg, total_amount, notes, distributor_supply_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              closingId,
              distId,
              distName,
              w.toNumber(),
              pr.toNumber(),
              tot.toNumber(),
              p.notes || null,
              supplyId,
            ]
          );
        }

        // Clean up any deleted supplies for this closing
        if (closingId) {
          if (savedSupplyIds.length > 0) {
            await client.query(
              'DELETE FROM distributor_supplies WHERE daily_closing_id = $1 AND id NOT IN (' +
                savedSupplyIds.map((_, i) => `$${i + 2}`).join(',') +
                ')',
              [closingId, ...savedSupplyIds]
            );
          } else {
            await client.query('DELETE FROM distributor_supplies WHERE daily_closing_id = $1', [closingId]);
          }
        }
      }

      // Re-create adjustments
      await client.query('DELETE FROM financial_adjustments WHERE daily_closing_id = $1', [closingId]);
      if (Array.isArray(adjustments)) {
        for (const adj of adjustments) {
          await client.query(
            `INSERT INTO financial_adjustments (
              business_date, adjustment_type, amount, reason, daily_closing_id, notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              businessDate,
              adj.type,
              toDecimal(adj.amount || 0).toNumber(),
              adj.reason.trim(),
              closingId,
              adj.notes || null,
              req.user!.id,
            ]
          );
        }
      }

      // If completing, record inventory closing transaction
      if (!isDraft) {
        await client.query(
          "DELETE FROM inventory_transactions WHERE reference_module = 'daily_closing' AND reference_id = $1",
          [closingId]
        );
        await client.query(
          `INSERT INTO inventory_transactions (
            txn_date, txn_type, weight_kg, cost_per_kg, reference_module, reference_id, reason, created_by
          ) VALUES ($1, 'closing', $2, $3, 'daily_closing', $4, $5, $6)`,
          [
            businessDate,
            closingStock.toNumber(),
            closingRate.toNumber(),
            closingId,
            `Daily Closing verification for ${businessDate}`,
            req.user!.id,
          ]
        );
      }

      // Audit log
      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: isDraft ? 'DAILY_CLOSING_SAVED_DRAFT' : 'DAILY_CLOSING_SUBMITTED',
          module: 'DAILY_CLOSING',
          recordType: 'daily_closing',
          recordId: closingId,
          newValues: {
            businessDate,
            status,
            totalCounterCollection: totalCounterCollection.toNumber(),
            chickenSalesRevenue: chickenSalesRevenue.toNumber(),
            stockTransferredKg: transferredWeight.toNumber(),
            stockAvailableForSaleKg: stockAvailableForSale.toNumber(),
            destinationShop: hasTransfer ? destinationShop : null,
            estimatedGrossProfit: estimatedGrossProfit.toNumber(),
            estimatedNetProfit: estimatedNetProfit.toNumber(),
            closingStockKg: closingStock.toNumber(),
          },
          ipAddress: req.ip,
        },
        client
      );

      const finalRecord = await client.query('SELECT * FROM daily_closings WHERE id = $1', [closingId]);
      return finalRecord.rows[0];
    });

    res.json({ success: true, data: savedClosing });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Reopen completed daily closing (Owner / Admin only with mandatory reason)
router.post('/:id/reopen', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, error: 'A mandatory reason is required to reopen a submitted daily closing.' });
      return;
    }

    const prevRes = await query('SELECT * FROM daily_closings WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Daily closing record not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    const updated = await withTransaction(async (client) => {
      const upRes = await client.query(
        `UPDATE daily_closings
         SET status = 'Reopened',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'DAILY_CLOSING_REOPENED',
          module: 'DAILY_CLOSING',
          recordType: 'daily_closing',
          recordId: id,
          previousValues: { status: prev.status },
          newValues: { status: 'Reopened' },
          reason,
          ipAddress: req.ip,
        },
        client
      );

      return upRes.rows[0];
    });

    res.json({ success: true, data: updated, message: 'Daily closing reopened for editing.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. List historical daily closings
router.get('/history', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, status } = req.query;

    let sql = `
      SELECT c.*, u.full_name AS submitted_by_name
      FROM daily_closings c
      LEFT JOIN users u ON c.submitted_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status && status !== 'All') {
      params.push(status);
      sql += ` AND c.status = $${params.length}`;
    }
    if (startDate) {
      params.push(startDate);
      sql += ` AND c.business_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      sql += ` AND c.business_date <= $${params.length}`;
    }

    sql += ' ORDER BY c.business_date DESC';

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Get closing status by date range / month for calendar display
router.get('/calendar-status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { month, startDate, endDate } = req.query;

    let start = startDate as string;
    let end = endDate as string;

    if (month && typeof month === 'string') {
      const [yearStr, monthStr] = month.split('-');
      const y = parseInt(yearStr, 10);
      const m = parseInt(monthStr, 10);
      if (!isNaN(y) && !isNaN(m)) {
        start = `${yearStr}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        end = `${yearStr}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      }
    }

    if (!start || !end) {
      const today = getTodayKolkata();
      const [y, m] = today.split('-');
      start = `${y}-${m}-01`;
      const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
      end = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    }

    const result = await query(
      `SELECT business_date::text AS business_date, status, id, submitted_at 
       FROM daily_closings 
       WHERE business_date >= $1 AND business_date <= $2 
       ORDER BY business_date ASC`,
      [start, end]
    );

    const statusMap: Record<string, { status: string; id: number; submittedAt: string | null }> = {};
    for (const row of result.rows) {
      const bDate = row.business_date.split('T')[0];
      statusMap[bDate] = {
        status: row.status,
        id: row.id,
        submittedAt: row.submitted_at,
      };
    }

    res.json({
      success: true,
      data: statusMap,
      today: getTodayKolkata(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
