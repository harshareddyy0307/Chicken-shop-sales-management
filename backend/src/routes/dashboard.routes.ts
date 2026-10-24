import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { Decimal, toDecimal, formatMoney, formatWeight, add, subtract } from '../utils/decimal';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const startDate = (req.query.startDate as string) || (req.query.date as string) || today;
    const endDate = (req.query.endDate as string) || (req.query.date as string) || startDate;
    const period = (req.query.period as string) || (startDate === endDate ? 'today' : 'custom');
    const isSingleDay = startDate === endDate;

    let counterCollection = new Decimal(0);
    let chickenPurchaseCost = new Decimal(0);
    let chickenSalesRevenue = new Decimal(0);
    let eggSalesRevenue = new Decimal(0);
    let chickenStockSoldKg = new Decimal(0);
    let newDistributorSupplyKg = new Decimal(0);
    let estimatedGrossProfit = new Decimal(0);
    let estimatedNetProfit = new Decimal(0);
    let periodExpenses = new Decimal(0);

    let openingStockKg = new Decimal(0);
    let closingStockKg = new Decimal(0);
    let isClosingCompleted = false;
    let closingId: number | null = null;
    let statusBadgeText = '';

    if (isSingleDay) {
      // 1. Daily Closing record for selected date (if available)
      const closingRes = await query('SELECT * FROM daily_closings WHERE business_date = $1', [startDate]);
      const closing = closingRes.rows[0] || null;
      isClosingCompleted = closing?.status === 'Completed';
      closingId = closing?.id || null;
      statusBadgeText = isClosingCompleted ? 'Daily Closing Completed' : 'Closing Pending (Live Estimates)';

      // Live Fallback calculations for single date
      const suppliesRes = await query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_cost,
                COALESCE(SUM(weight_kg), 0) AS total_weight,
                COUNT(*) AS count
         FROM distributor_supplies
         WHERE supply_date = $1`,
        [startDate]
      );
      const livePurchaseCost = toDecimal(suppliesRes.rows[0].total_cost);
      const liveNewSupplyKg = toDecimal(suppliesRes.rows[0].total_weight);

      const salesRes = await query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_revenue,
                COALESCE(SUM(weight_sold_kg), 0) AS total_weight
         FROM chicken_sales
         WHERE sale_date = $1`,
        [startDate]
      );
      const liveChickenSalesRevenue = toDecimal(salesRes.rows[0].total_revenue);
      const liveStockSoldKg = toDecimal(salesRes.rows[0].total_weight);

      const expRes = await query(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM operating_expenses WHERE expense_date = $1',
        [startDate]
      );
      periodExpenses = toDecimal(expRes.rows[0].total);

      const billsPaidRes = await query(
        'SELECT COALESCE(SUM(paid_amount), 0) AS total FROM customer_bills WHERE bill_date = $1',
        [startDate]
      );
      const custPayRes = await query(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM customer_payments WHERE payment_date = $1',
        [startDate]
      );
      const instantSalesRes = await query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total 
         FROM chicken_sales 
         WHERE sale_date = $1 AND customer_bill_id IS NULL AND payment_method != 'Katha'`,
        [startDate]
      );
      const liveCounterCollection = toDecimal(billsPaidRes.rows[0].total)
        .plus(toDecimal(custPayRes.rows[0].total))
        .plus(toDecimal(instantSalesRes.rows[0].total));

      counterCollection = closing ? toDecimal(closing.total_counter_collection) : liveCounterCollection;
      chickenPurchaseCost = closing ? toDecimal(closing.distributor_purchase_cost) : livePurchaseCost;
      chickenSalesRevenue = closing ? toDecimal(closing.chicken_sales_revenue) : liveChickenSalesRevenue;
      eggSalesRevenue = closing ? toDecimal(closing.egg_sales_revenue || 0) : new Decimal(0);
      chickenStockSoldKg = closing ? toDecimal(closing.quantity_sold_kg) : liveStockSoldKg;
      newDistributorSupplyKg = closing ? toDecimal(closing.new_stock_kg) : liveNewSupplyKg;

      if (closing) {
        estimatedGrossProfit = toDecimal(closing.estimated_gross_profit);
        estimatedNetProfit = toDecimal(closing.estimated_net_profit);
        openingStockKg = toDecimal(closing.opening_stock_kg);
        closingStockKg = toDecimal(closing.closing_stock_kg);
      } else {
        let avgRate = new Decimal(0);
        if (liveNewSupplyKg.gt(0)) {
          avgRate = livePurchaseCost.dividedBy(liveNewSupplyKg);
        } else {
          const lastRate = await query(
            'SELECT price_per_kg FROM distributor_supplies ORDER BY supply_date DESC, id DESC LIMIT 1'
          );
          if (lastRate.rows.length > 0) avgRate = toDecimal(lastRate.rows[0].price_per_kg);
        }
        const cogs = liveStockSoldKg.times(avgRate);
        estimatedGrossProfit = liveChickenSalesRevenue.minus(cogs);
        estimatedNetProfit = estimatedGrossProfit.minus(periodExpenses);

        const prevClosingRes = await query(
          "SELECT closing_stock_kg FROM daily_closings WHERE business_date < $1 AND status = 'Completed' ORDER BY business_date DESC LIMIT 1",
          [startDate]
        );
        openingStockKg = prevClosingRes.rows.length > 0 ? toDecimal(prevClosingRes.rows[0].closing_stock_kg) : new Decimal(0);
        closingStockKg = openingStockKg.plus(liveNewSupplyKg).minus(liveStockSoldKg);
      }
    } else {
      // Date Range query (Week, Month, Year, Custom)
      const rangeClosingsRes = await query(
        'SELECT * FROM daily_closings WHERE business_date >= $1 AND business_date <= $2 ORDER BY business_date ASC',
        [startDate, endDate]
      );
      const completedClosings = rangeClosingsRes.rows.filter((r) => r.status === 'Completed');
      const completedDaysCount = completedClosings.length;
      isClosingCompleted = completedDaysCount > 0;
      closingId = completedClosings.length > 0 ? completedClosings[completedClosings.length - 1].id : null;
      statusBadgeText = `${completedDaysCount} Verified ${completedDaysCount === 1 ? 'Closing' : 'Closings'}`;

      let closedCounter = new Decimal(0);
      let closedPurchase = new Decimal(0);
      let closedSales = new Decimal(0);
      let closedEggSales = new Decimal(0);
      let closedSoldKg = new Decimal(0);
      let closedNewKg = new Decimal(0);
      let closedGross = new Decimal(0);

      for (const c of completedClosings) {
        closedCounter = closedCounter.plus(toDecimal(c.total_counter_collection));
        closedPurchase = closedPurchase.plus(toDecimal(c.distributor_purchase_cost));
        closedSales = closedSales.plus(toDecimal(c.chicken_sales_revenue));
        closedEggSales = closedEggSales.plus(toDecimal(c.egg_sales_revenue || 0));
        closedSoldKg = closedSoldKg.plus(toDecimal(c.quantity_sold_kg));
        closedNewKg = closedNewKg.plus(toDecimal(c.new_stock_kg));
        closedGross = closedGross.plus(toDecimal(c.estimated_gross_profit));
      }
      eggSalesRevenue = closedEggSales;

      // Unclosed distributor supplies in range
      const unclosedSuppliesRes = await query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_cost,
                COALESCE(SUM(weight_kg), 0) AS total_weight
         FROM distributor_supplies
         WHERE supply_date >= $1 AND supply_date <= $2
           AND supply_date NOT IN (SELECT business_date FROM daily_closings WHERE business_date >= $1 AND business_date <= $2 AND status = 'Completed')`,
        [startDate, endDate]
      );
      const unclosedCost = toDecimal(unclosedSuppliesRes.rows[0].total_cost);
      const unclosedNewKg = toDecimal(unclosedSuppliesRes.rows[0].total_weight);

      // Unclosed sales in range
      const unclosedSalesRes = await query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total_revenue,
                COALESCE(SUM(weight_sold_kg), 0) AS total_weight
         FROM chicken_sales
         WHERE sale_date >= $1 AND sale_date <= $2
           AND sale_date NOT IN (SELECT business_date FROM daily_closings WHERE business_date >= $1 AND business_date <= $2 AND status = 'Completed')`,
        [startDate, endDate]
      );
      const unclosedRevenue = toDecimal(unclosedSalesRes.rows[0].total_revenue);
      const unclosedSoldKg = toDecimal(unclosedSalesRes.rows[0].total_weight);

      // Unclosed counter collections
      const unclosedBillsRes = await query(
        `SELECT COALESCE(SUM(paid_amount), 0) AS total FROM customer_bills
         WHERE bill_date >= $1 AND bill_date <= $2
           AND bill_date NOT IN (SELECT business_date FROM daily_closings WHERE business_date >= $1 AND business_date <= $2 AND status = 'Completed')`,
        [startDate, endDate]
      );
      const unclosedCustPayRes = await query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM customer_payments
         WHERE payment_date >= $1 AND payment_date <= $2
           AND payment_date NOT IN (SELECT business_date FROM daily_closings WHERE business_date >= $1 AND business_date <= $2 AND status = 'Completed')`,
        [startDate, endDate]
      );
      const unclosedCashSalesRes = await query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total FROM chicken_sales
         WHERE sale_date >= $1 AND sale_date <= $2
           AND customer_bill_id IS NULL AND payment_method != 'Katha'
           AND sale_date NOT IN (SELECT business_date FROM daily_closings WHERE business_date >= $1 AND business_date <= $2 AND status = 'Completed')`,
        [startDate, endDate]
      );
      const unclosedCounter = toDecimal(unclosedBillsRes.rows[0].total)
        .plus(toDecimal(unclosedCustPayRes.rows[0].total))
        .plus(toDecimal(unclosedCashSalesRes.rows[0].total));

      // Operating expenses in range
      const expRes = await query(
        'SELECT COALESCE(SUM(amount), 0) AS total FROM operating_expenses WHERE expense_date >= $1 AND expense_date <= $2',
        [startDate, endDate]
      );
      periodExpenses = toDecimal(expRes.rows[0].total);

      counterCollection = closedCounter.plus(unclosedCounter);
      chickenPurchaseCost = closedPurchase.plus(unclosedCost);
      chickenSalesRevenue = closedSales.plus(unclosedRevenue);
      chickenStockSoldKg = closedSoldKg.plus(unclosedSoldKg);
      newDistributorSupplyKg = closedNewKg.plus(unclosedNewKg);

      let unclosedGross = new Decimal(0);
      if (unclosedSoldKg.gt(0)) {
        let avgRate = new Decimal(0);
        if (unclosedNewKg.gt(0)) {
          avgRate = unclosedCost.dividedBy(unclosedNewKg);
        } else {
          const lastRate = await query(
            'SELECT price_per_kg FROM distributor_supplies ORDER BY supply_date DESC, id DESC LIMIT 1'
          );
          if (lastRate.rows.length > 0) avgRate = toDecimal(lastRate.rows[0].price_per_kg);
        }
        unclosedGross = unclosedRevenue.minus(unclosedSoldKg.times(avgRate));
      }
      estimatedGrossProfit = closedGross.plus(unclosedGross);
      estimatedNetProfit = estimatedGrossProfit.minus(periodExpenses);

      // Period Opening stock: at start of range
      const startClosing = rangeClosingsRes.rows.find(
        (r) => (r.business_date instanceof Date ? r.business_date.toISOString().split('T')[0] : String(r.business_date)) === startDate
      );
      if (startClosing) {
        openingStockKg = toDecimal(startClosing.opening_stock_kg);
      } else {
        const prevClosingRes = await query(
          "SELECT closing_stock_kg FROM daily_closings WHERE business_date < $1 AND status = 'Completed' ORDER BY business_date DESC LIMIT 1",
          [startDate]
        );
        if (prevClosingRes.rows.length > 0) {
          openingStockKg = toDecimal(prevClosingRes.rows[0].closing_stock_kg);
        } else if (completedClosings.length > 0) {
          openingStockKg = toDecimal(completedClosings[0].opening_stock_kg);
        }
      }

      // Period Closing stock: latest verified closing in range
      if (completedClosings.length > 0) {
        const lastCompleted = completedClosings[completedClosings.length - 1];
        closingStockKg = toDecimal(lastCompleted.closing_stock_kg).plus(unclosedNewKg).minus(unclosedSoldKg);
      } else {
        closingStockKg = openingStockKg.plus(newDistributorSupplyKg).minus(chickenStockSoldKg);
      }
    }

    // Cumulative Balance Sheet figures (as of today across entire shop)
    const distTotalSupplies = await query('SELECT COALESCE(SUM(total_amount), 0) AS total FROM distributor_supplies');
    const distTotalOpening = await query('SELECT COALESCE(SUM(opening_balance), 0) AS total FROM distributors');
    const distTotalPayments = await query('SELECT COALESCE(SUM(amount), 0) AS total FROM distributor_payments');
    const totalDistributorOutstanding = toDecimal(distTotalOpening.rows[0].total)
      .plus(toDecimal(distTotalSupplies.rows[0].total))
      .minus(toDecimal(distTotalPayments.rows[0].total));

    const custTotalOpening = await query('SELECT COALESCE(SUM(opening_balance), 0) AS total FROM customers');
    const custCreditBills = await query(
      `SELECT COALESCE(SUM(CASE WHEN payment_type = 'Pay Later' THEN total_amount 
                                WHEN payment_type = 'Partial' THEN (total_amount - paid_amount) 
                                ELSE 0 END), 0) AS total 
       FROM customer_bills`
    );
    const custTotalPayments = await query('SELECT COALESCE(SUM(amount), 0) AS total FROM customer_payments');
    const totalCustomerOutstanding = toDecimal(custTotalOpening.rows[0].total)
      .plus(toDecimal(custCreditBills.rows[0].total))
      .minus(toDecimal(custTotalPayments.rows[0].total));

    // Sales Trend Chart (Period-aware: Month shows month days, other periods show 7 days up to endDate)
    let trendStart = startDate;
    let trendEnd = endDate;
    if (period === 'month') {
      trendStart = startDate;
      trendEnd = endDate;
    } else {
      // 7 days ending at endDate
      const endD = new Date(endDate);
      const startD = new Date(endD);
      startD.setDate(endD.getDate() - 6);
      trendStart = startD.toISOString().split('T')[0];
      trendEnd = endDate;
    }

    const trendSql = `
      SELECT 
        d::date AS chart_date,
        COALESCE(c.chicken_sales_revenue, s.total_sales, 0) AS sales_revenue,
        COALESCE(c.total_counter_collection, col.total_collected, 0) AS counter_collection,
        COALESCE(c.estimated_net_profit, 0) AS net_profit,
        COALESCE(c.quantity_sold_kg, s.total_weight, 0) AS weight_sold
      FROM generate_series($1::date, $2::date, '1 day'::interval) d
      LEFT JOIN daily_closings c ON c.business_date = d::date
      LEFT JOIN (
        SELECT sale_date, SUM(total_amount) AS total_sales, SUM(weight_sold_kg) AS total_weight
        FROM chicken_sales
        GROUP BY sale_date
      ) s ON s.sale_date = d::date
      LEFT JOIN (
        SELECT bill_date AS coll_date, SUM(paid_amount) AS total_collected
        FROM customer_bills
        GROUP BY bill_date
      ) col ON col.coll_date = d::date
      ORDER BY d::date ASC
    `;
    const trendRes = await query(trendSql, [trendStart, trendEnd]);

    // Monthly Performance (Current Year - 12 Months)
    const currentYear = new Date(endDate).getFullYear();
    const monthlyTrendSql = `
      SELECT 
        m AS month_num,
        COALESCE(SUM(c.chicken_sales_revenue), 0) AS monthly_sales,
        COALESCE(SUM(c.total_counter_collection), 0) AS monthly_counter_collection,
        COALESCE(SUM(c.estimated_net_profit), 0) AS monthly_net_profit,
        COALESCE(SUM(e.monthly_exp), 0) AS monthly_expenses
      FROM generate_series(1, 12) m
      LEFT JOIN daily_closings c ON EXTRACT(MONTH FROM c.business_date) = m AND EXTRACT(YEAR FROM c.business_date) = $1
      LEFT JOIN (
        SELECT EXTRACT(MONTH FROM expense_date) AS exp_m, SUM(amount) AS monthly_exp
        FROM operating_expenses
        WHERE EXTRACT(YEAR FROM expense_date) = $1
        GROUP BY EXTRACT(MONTH FROM expense_date)
      ) e ON e.exp_m = m
      GROUP BY m
      ORDER BY m ASC
    `;
    const monthlyTrendRes = await query(monthlyTrendSql, [currentYear]);

    // Recent Transactions up to endDate
    const recentTxnsRes = await query(
      `SELECT 'Customer Bill' AS txn_type, bill_number AS ref_id, bill_date AS txn_date, 
              COALESCE(c.name, 'Cash Customer') AS party_name, total_amount, payment_status, payment_type
       FROM customer_bills b
       LEFT JOIN customers c ON b.customer_id = c.id
       WHERE bill_date <= $1
       ORDER BY bill_date DESC, b.id DESC
       LIMIT 5`,
      [endDate]
    );

    // Recent Expenses up to endDate
    const recentExpRes = await query(
      `SELECT id, expense_date, category, description, amount, payment_method
       FROM operating_expenses
       WHERE expense_date <= $1
       ORDER BY expense_date DESC, id DESC
       LIMIT 5`,
      [endDate]
    );

    // Alerts
    const alerts: { type: 'warning' | 'info' | 'danger'; title: string; message: string }[] = [];
    const latestClosingRes = await query(
      "SELECT business_date, closing_stock_kg FROM daily_closings WHERE status = 'Completed' ORDER BY business_date DESC LIMIT 1"
    );
    if (latestClosingRes.rows.length > 0) {
      const remainingKg = toDecimal(latestClosingRes.rows[0].closing_stock_kg);
      if (remainingKg.lt(15)) {
        alerts.push({
          type: 'warning',
          title: 'Low Chicken Stock Alert',
          message: `Last verified closing stock is ${remainingKg.toFixed(1)} kg. Consider scheduling distributor supplies.`,
        });
      }
    }

    if (isSingleDay && !isClosingCompleted) {
      alerts.push({
        type: 'info',
        title: 'Daily Closing Pending',
        message: `Daily business closing for ${startDate} has not been completed yet. Current numbers are live estimates.`,
      });
    }

    res.json({
      success: true,
      data: {
        date: startDate,
        startDate,
        endDate,
        period,
        isClosingCompleted,
        closingId,
        statusBadgeText,
        cards: {
          todayCounterCollection: formatMoney(counterCollection),
          todayChickenPurchaseCost: formatMoney(chickenPurchaseCost),
          todayChickenSalesRevenue: formatMoney(chickenSalesRevenue),
          todayEggSalesRevenue: formatMoney(eggSalesRevenue),
          todayEstimatedGrossProfit: formatMoney(estimatedGrossProfit),
          todayEstimatedNetProfit: formatMoney(estimatedNetProfit),
          todayChickenStockSoldKg: formatWeight(chickenStockSoldKg),
          todayNewDistributorSupplyKg: formatWeight(newDistributorSupplyKg),
          totalOutstandingDistributorPayments: formatMoney(totalDistributorOutstanding),
          totalCustomerKathaOutstanding: formatMoney(totalCustomerOutstanding),
          todayOperatingExpenses: formatMoney(periodExpenses),
        },
        stockOverview: {
          openingStockKg: formatWeight(openingStockKg),
          newStockKg: formatWeight(newDistributorSupplyKg),
          soldKg: formatWeight(chickenStockSoldKg),
          closingStockKg: formatWeight(closingStockKg),
        },
        sevenDaysTrend: trendRes.rows.map((r) => ({
          date: r.chart_date instanceof Date ? r.chart_date.toISOString().split('T')[0] : String(r.chart_date),
          salesRevenue: formatMoney(r.sales_revenue),
          counterCollection: formatMoney(r.counter_collection),
          netProfit: formatMoney(r.net_profit),
          weightSoldKg: formatWeight(r.weight_sold),
        })),
        monthlyTrend: monthlyTrendRes.rows.map((r) => ({
          month: parseInt(r.month_num, 10),
          salesRevenue: formatMoney(r.monthly_sales),
          counterCollection: formatMoney(r.monthly_counter_collection),
          netProfit: formatMoney(r.monthly_net_profit),
          expenses: formatMoney(r.monthly_expenses),
        })),
        recentTransactions: recentTxnsRes.rows,
        recentExpenses: recentExpRes.rows,
        alerts,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
