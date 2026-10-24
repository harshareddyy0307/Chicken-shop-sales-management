import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { Decimal, toDecimal, formatMoney, formatWeight } from '../utils/decimal';
import ExcelJS from 'exceljs';

const router = Router();

// 1. Daily Comprehensive Report
router.get('/daily', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];

    // Daily closing data
    const closingRes = await query('SELECT * FROM daily_closings WHERE business_date = $1', [date]);
    const closing = closingRes.rows[0] || null;

    // Distributor supplies today
    const suppliesRes = await query(
      `SELECT s.*, d.name AS distributor_name
       FROM distributor_supplies s
       JOIN distributors d ON s.distributor_id = d.id
       WHERE s.supply_date = $1`,
      [date]
    );

    // Distributor payments today
    const distPayRes = await query(
      `SELECT p.*, d.name AS distributor_name
       FROM distributor_payments p
       JOIN distributors d ON p.distributor_id = d.id
       WHERE p.payment_date = $1`,
      [date]
    );

    // Individual sales today
    const salesRes = await query(
      `SELECT s.*, b.bill_number
       FROM chicken_sales s
       LEFT JOIN customer_bills b ON s.customer_bill_id = b.id
       WHERE s.sale_date = $1`,
      [date]
    );

    // Customer bills today (Credit vs Immediate)
    const billsRes = await query(
      `SELECT b.*, c.name AS customer_name
       FROM customer_bills b
       LEFT JOIN customers c ON b.customer_id = c.id
       WHERE b.bill_date = $1`,
      [date]
    );

    // Customer payments received today
    const custPayRes = await query(
      `SELECT p.*, c.name AS customer_name
       FROM customer_payments p
       JOIN customers c ON p.customer_id = c.id
       WHERE p.payment_date = $1`,
      [date]
    );

    // Operating expenses today
    const expRes = await query('SELECT * FROM operating_expenses WHERE expense_date = $1', [date]);

    // Financial adjustments today
    const adjRes = await query('SELECT * FROM financial_adjustments WHERE business_date = $1', [date]);

    // Stock transfers today
    const transfersRes = await query(
      `SELECT *, weight_kg AS transferred_quantity_kg, total_cost AS total_transfer_cost FROM stock_transfers WHERE transfer_date = $1 ORDER BY created_at ASC`,
      [date]
    );

    // Summary numbers
    const totalCreditBills = billsRes.rows
      .filter((b) => b.payment_type === 'Pay Later')
      .reduce((sum, b) => sum.plus(toDecimal(b.total_amount)), new Decimal(0));

    const totalCustPayments = custPayRes.rows.reduce((sum, p) => sum.plus(toDecimal(p.amount)), new Decimal(0));
    const totalDistPayments = distPayRes.rows.reduce((sum, p) => sum.plus(toDecimal(p.amount)), new Decimal(0));
    const totalExpenses = expRes.rows.reduce((sum, e) => sum.plus(toDecimal(e.amount)), new Decimal(0));
    const totalTransferredKg = transfersRes.rows
      .filter((t) => t.status !== 'cancelled' && t.status !== 'Cancelled')
      .reduce((sum, t) => sum.plus(toDecimal(t.weight_kg || t.transferred_quantity_kg || 0)), new Decimal(0));

    res.json({
      success: true,
      data: {
        date,
        closing,
        supplies: suppliesRes.rows,
        distributorPayments: distPayRes.rows,
        sales: salesRes.rows,
        customerBills: billsRes.rows,
        customerPayments: custPayRes.rows,
        expenses: expRes.rows,
        adjustments: adjRes.rows,
        transfers: transfersRes.rows,
        metrics: {
          totalCreditGenerated: formatMoney(totalCreditBills),
          totalCustomerPaymentsReceived: formatMoney(totalCustPayments),
          totalDistributorPaymentsMade: formatMoney(totalDistPayments),
          totalOperatingExpenses: formatMoney(totalExpenses),
          totalStockTransferredKg: formatWeight(totalTransferredKg),
          totalCounterCollection: closing
            ? formatMoney(closing.total_counter_collection)
            : formatMoney(totalCustPayments),
          chickenSalesRevenue: closing ? formatMoney(closing.chicken_sales_revenue) : 0,
          grossProfit: closing ? formatMoney(closing.estimated_gross_profit) : 0,
          netProfit: closing ? formatMoney(closing.estimated_net_profit) : 0,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Monthly Comprehensive Report
router.get('/monthly', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
    const month = parseInt((req.query.month as string) || String(new Date().getMonth() + 1), 10);

    // Closings in this month
    const closingsRes = await query(
      `SELECT * FROM daily_closings
       WHERE EXTRACT(YEAR FROM business_date) = $1 AND EXTRACT(MONTH FROM business_date) = $2
       ORDER BY business_date ASC`,
      [year, month]
    );

    // Total expenses in month
    const expRes = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_expenses, COUNT(*) AS count
       FROM operating_expenses
       WHERE EXTRACT(YEAR FROM expense_date) = $1 AND EXTRACT(MONTH FROM expense_date) = $2`,
      [year, month]
    );

    // Total distributor purchases in month
    const supRes = await query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total_purchases, COALESCE(SUM(weight_kg), 0) AS total_weight
       FROM distributor_supplies
       WHERE EXTRACT(YEAR FROM supply_date) = $1 AND EXTRACT(MONTH FROM supply_date) = $2`,
      [year, month]
    );

    // Total distributor payments in month
    const distPayRes = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid
       FROM distributor_payments
       WHERE EXTRACT(YEAR FROM payment_date) = $1 AND EXTRACT(MONTH FROM payment_date) = $2`,
      [year, month]
    );

    // Total customer credit generated in month
    const custCreditRes = await query(
      `SELECT COALESCE(SUM(CASE WHEN payment_type = 'Pay Later' THEN total_amount 
                                WHEN payment_type = 'Partial' THEN (total_amount - paid_amount) 
                                ELSE 0 END), 0) AS total_credit
       FROM customer_bills
       WHERE EXTRACT(YEAR FROM bill_date) = $1 AND EXTRACT(MONTH FROM bill_date) = $2`,
      [year, month]
    );

    // Total customer payments in month
    const custPayRes = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_received
       FROM customer_payments
       WHERE EXTRACT(YEAR FROM payment_date) = $1 AND EXTRACT(MONTH FROM payment_date) = $2`,
      [year, month]
    );

    // Total stock transfers in month
    const monthTransfersRes = await query(
      `SELECT COALESCE(SUM(weight_kg), 0) AS total_transferred_kg,
              COALESCE(SUM(total_cost), 0) AS total_transfer_cost,
              COUNT(*) AS count
       FROM stock_transfers
       WHERE EXTRACT(YEAR FROM transfer_date) = $1 AND EXTRACT(MONTH FROM transfer_date) = $2
         AND LOWER(status) != 'cancelled'`,
      [year, month]
    );

    // Aggregate monthly numbers from completed closings
    const agg = closingsRes.rows.reduce(
      (acc, c) => {
        acc.counterCollection = acc.counterCollection.plus(toDecimal(c.total_counter_collection));
        const chickenRev = toDecimal(c.chicken_sales_revenue);
        const eggRev = toDecimal(c.egg_sales_revenue || 0);
        const totalRev = c.total_sales_revenue ? toDecimal(c.total_sales_revenue) : chickenRev.plus(eggRev);
        acc.salesRevenue = acc.salesRevenue.plus(totalRev);
        acc.chickenSalesRevenue = acc.chickenSalesRevenue.plus(chickenRev);
        acc.eggSalesRevenue = acc.eggSalesRevenue.plus(eggRev);
        acc.weightSold = acc.weightSold.plus(toDecimal(c.quantity_sold_kg));
        acc.stockTransferred = acc.stockTransferred.plus(toDecimal(c.stock_transferred_kg || 0));
        acc.purchaseCost = acc.purchaseCost.plus(toDecimal(c.distributor_purchase_cost));
        acc.grossProfit = acc.grossProfit.plus(toDecimal(c.estimated_gross_profit));
        acc.netProfit = acc.netProfit.plus(toDecimal(c.estimated_net_profit));
        return acc;
      },
      {
        counterCollection: new Decimal(0),
        salesRevenue: new Decimal(0),
        chickenSalesRevenue: new Decimal(0),
        eggSalesRevenue: new Decimal(0),
        weightSold: new Decimal(0),
        stockTransferred: new Decimal(0),
        purchaseCost: new Decimal(0),
        grossProfit: new Decimal(0),
        netProfit: new Decimal(0),
      }
    );

    const monthlyExpensesDecimal = toDecimal(expRes.rows[0].total_expenses);
    const monthlyNetProfitDecimal = agg.netProfit;
    const monthlyGrossProfitDecimal = monthlyNetProfitDecimal.minus(monthlyExpensesDecimal);

    res.json({
      success: true,
      data: {
        year,
        month,
        closingsCount: closingsRes.rows.length,
        dailyClosings: closingsRes.rows,
        monthlyTotals: {
          monthlyCounterCollection: formatMoney(agg.counterCollection),
          monthlySalesRevenue: formatMoney(agg.salesRevenue),
          monthlyChickenSalesRevenue: formatMoney(agg.chickenSalesRevenue),
          monthlyEggSalesRevenue: formatMoney(agg.eggSalesRevenue),
          monthlyChickenStockSoldKg: formatWeight(agg.weightSold),
          monthlyStockTransferredKg: formatWeight(toDecimal(monthTransfersRes.rows[0].total_transferred_kg)),
          monthlyStockTransferredCost: formatMoney(toDecimal(monthTransfersRes.rows[0].total_transfer_cost)),
          monthlyPurchaseCost: formatMoney(toDecimal(supRes.rows[0].total_purchases)),
          monthlyPurchaseWeightKg: formatWeight(supRes.rows[0].total_weight),
          monthlyGrossProfit: formatMoney(monthlyGrossProfitDecimal),
          monthlyNetProfit: formatMoney(monthlyNetProfitDecimal),
          monthlyOperatingExpenses: formatMoney(monthlyExpensesDecimal),
          monthlyDistributorPayments: formatMoney(toDecimal(distPayRes.rows[0].total_paid)),
          monthlyCustomerCreditGenerated: formatMoney(toDecimal(custCreditRes.rows[0].total_credit)),
          monthlyCustomerPaymentsReceived: formatMoney(toDecimal(custPayRes.rows[0].total_received)),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Export to Excel
router.get('/export-excel', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const reportType = (req.query.type as string) || 'daily';
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
    const month = parseInt((req.query.month as string) || String(new Date().getMonth() + 1), 10);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Reddy Chicken and Mutton Center';
    workbook.created = new Date();

    if (reportType === 'daily') {
      const sheet = workbook.addWorksheet(`Daily Report ${date}`);

      sheet.columns = [
        { header: 'Category / Metric', key: 'metric', width: 35 },
        { header: 'Value (₹ / kg)', key: 'val', width: 25 },
        { header: 'Details', key: 'notes', width: 30 },
      ];

      const closingRes = await query('SELECT * FROM daily_closings WHERE business_date = $1', [date]);
      const closing = closingRes.rows[0];

      sheet.addRow({ metric: 'Business Date', val: date, notes: '' });
      sheet.addRow({ metric: 'Status', val: closing?.status || 'Pending Closing', notes: '' });
      sheet.addRow({ metric: 'Total Counter Collection', val: `₹${closing?.total_counter_collection || 0}`, notes: 'Cash + UPI + Card + Other' });
      sheet.addRow({ metric: 'Chicken Sales Revenue', val: `₹${closing?.chicken_sales_revenue || 0}`, notes: 'Quantity Sold × Rate' });
      sheet.addRow({ metric: 'Distributor Purchase Cost', val: `₹${closing?.distributor_purchase_cost || 0}`, notes: 'Supplies received' });
      sheet.addRow({ metric: 'Chicken Stock Sold (kg)', val: `${closing?.quantity_sold_kg || 0} kg`, notes: '' });
      sheet.addRow({ metric: 'Stock Transferred to Other Shops (kg)', val: `${closing?.stock_transferred_kg || 0} kg`, notes: 'Transferred out' });
      sheet.addRow({ metric: 'Stock Available for Sale (kg)', val: `${closing?.stock_available_for_sale_kg || 0} kg`, notes: 'Total Available - Transferred' });
      sheet.addRow({ metric: 'Closing Stock (kg)', val: `${closing?.closing_stock_kg || 0} kg`, notes: '' });
      sheet.addRow({ metric: 'Estimated Gross Profit', val: `₹${closing?.estimated_gross_profit || 0}`, notes: 'Sales Revenue - COGS' });
      sheet.addRow({ metric: 'Estimated Net Profit', val: `₹${closing?.estimated_net_profit || 0}`, notes: 'Gross + Adjustments - Expenses' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=Daily_Report_${date}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
      return;
    } else {
      const sheet = workbook.addWorksheet(`Monthly Report ${month}-${year}`);
      sheet.columns = [
        { header: 'Metric / Date', key: 'col1', width: 30 },
        { header: 'Counter Collection (₹)', key: 'col2', width: 25 },
        { header: 'Sales Revenue (₹)', key: 'col3', width: 25 },
        { header: 'Stock Sold (kg)', key: 'col4', width: 20 },
        { header: 'Net Profit (₹)', key: 'col5', width: 25 },
        { header: 'Status', key: 'col6', width: 20 },
      ];

      const closingsRes = await query(
        `SELECT * FROM daily_closings
         WHERE EXTRACT(YEAR FROM business_date) = $1 AND EXTRACT(MONTH FROM business_date) = $2
         ORDER BY business_date ASC`,
        [year, month]
      );

      for (const c of closingsRes.rows) {
        const dStr = c.business_date instanceof Date ? c.business_date.toISOString().split('T')[0] : String(c.business_date);
        const parts = dStr.split('-');
        let isSunday = false;
        if (parts.length === 3) {
          isSunday = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getDay() === 0;
        }
        const row = sheet.addRow({
          col1: isSunday ? `${dStr} (SUNDAY - PEAK)` : dStr,
          col2: `₹${c.total_counter_collection}`,
          col3: `₹${c.total_sales_revenue || c.chicken_sales_revenue}`,
          col4: `${c.quantity_sold_kg} kg`,
          col5: `₹${c.estimated_net_profit}`,
          col6: c.status,
        });
        if (isSunday) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFFBEB' },
            };
            cell.font = { bold: true };
          });
        }
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=Monthly_Report_${month}_${year}.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
      return;
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Export to CSV
router.get('/export-csv', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const reportType = (req.query.type as string) || 'daily';
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
    const month = parseInt((req.query.month as string) || String(new Date().getMonth() + 1), 10);

    let csvContent = 'Metric,Value,Unit\n';

    if (reportType === 'daily') {
      const closingRes = await query('SELECT * FROM daily_closings WHERE business_date = $1', [date]);
      const c = closingRes.rows[0];

      csvContent += `"Business Date","${date}",""\n`;
      csvContent += `"Total Counter Collection","${c?.total_counter_collection || 0}","₹"\n`;
      csvContent += `"Chicken Sales Revenue","${c?.chicken_sales_revenue || 0}","₹"\n`;
      csvContent += `"Quantity Sold","${c?.quantity_sold_kg || 0}","kg"\n`;
      csvContent += `"Stock Transferred","${c?.stock_transferred_kg || 0}","kg"\n`;
      csvContent += `"Stock Available for Sale","${c?.stock_available_for_sale_kg || 0}","kg"\n`;
      csvContent += `"Estimated Gross Profit","${c?.estimated_gross_profit || 0}","₹"\n`;
      csvContent += `"Estimated Net Profit","${c?.estimated_net_profit || 0}","₹"\n`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=Daily_Report_${date}.csv`);
      res.send(csvContent);
      return;
    }

    const closingsRes = await query(
      `SELECT * FROM daily_closings
       WHERE EXTRACT(YEAR FROM business_date) = $1 AND EXTRACT(MONTH FROM business_date) = $2
       ORDER BY business_date ASC`,
      [year, month]
    );

    let monthlyCsv = 'Date,Counter Collection,Sales Revenue,Stock Sold (kg),Gross Profit,Net Profit,Status\n';
    for (const c of closingsRes.rows) {
      const dStr = c.business_date instanceof Date ? c.business_date.toISOString().split('T')[0] : String(c.business_date);
      monthlyCsv += `"${dStr}","${c.total_counter_collection}","${c.total_sales_revenue || c.chicken_sales_revenue}","${c.quantity_sold_kg}","${c.estimated_gross_profit}","${c.estimated_net_profit}","${c.status}"\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=Monthly_Report_${month}_${year}.csv`);
    res.send(monthlyCsv);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Monthly Closing PDF Preview Metadata
router.get('/monthly-pdf-preview', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
    const month = parseInt((req.query.month as string) || String(new Date().getMonth() + 1), 10);

    const MONTH_NAMES = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const daysInMonth = new Date(year, month, 0).getDate();
    const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const closingsRes = await query(
      `SELECT business_date, status
       FROM daily_closings
       WHERE business_date >= $1 AND business_date <= $2`,
      [startDateStr, endDateStr]
    );

    const closingsMap = new Map<string, string>();
    for (const c of closingsRes.rows) {
      const dStr = c.business_date instanceof Date
        ? c.business_date.toISOString().split('T')[0]
        : String(c.business_date).split('T')[0];
      closingsMap.set(dStr, c.status);
    }

    let completedCount = 0;
    let draftCount = 0;
    let missingCount = 0;
    let futureCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const status = closingsMap.get(dayStr);
      const isFuture = dayStr > todayStr;

      if (status === 'Completed') {
        completedCount++;
      } else if (status) {
        draftCount++;
      } else if (isFuture) {
        futureCount++;
      } else {
        missingCount++;
      }
    }

    res.json({
      success: true,
      data: {
        year,
        month,
        monthName: MONTH_NAMES[month - 1],
        daysInMonth,
        completedCount,
        draftCount,
        missingCount,
        futureCount,
        filename: `Chicken_Shop_Closing_Report_${MONTH_NAMES[month - 1]}_${year}.pdf`,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Generate & Download Complete Monthly Daily Business Closing PDF Report
router.get('/monthly-pdf', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
    const month = parseInt((req.query.month as string) || String(new Date().getMonth() + 1), 10);

    const { generateMonthlyClosingPdf } = await import('../services/monthlyPdfService');
    const { buffer, filename } = await generateMonthlyClosingPdf({ year, month });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to generate monthly closing PDF report.' });
  }
});

// 7. Generate & Download Single-Day Daily Business Closing PDF Report
router.get('/daily-pdf', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
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

export default router;

