import PDFDocument from 'pdfkit';
import { query } from '../db/connection';
import { Decimal, toDecimal, formatMoney, formatWeight } from '../utils/decimal';

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

interface MonthlyPdfOptions {
  year: number;
  month: number;
}

export async function generateMonthlyClosingPdf(options: MonthlyPdfOptions): Promise<{ buffer: Buffer; filename: string }> {
  const { year, month } = options;

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    throw new Error('Invalid month or year specified.');
  }

  const monthName = MONTH_NAMES[month - 1];
  const filename = `Chicken_Shop_Closing_Report_${monthName}_${year}.pdf`;

  // Number of days in the month
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  // Current business date (IST)
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  // 1. Fetch Shop Settings
  const shopRes = await query('SELECT * FROM shop_settings WHERE id = 1');
  const shop = shopRes.rows[0] || {
    shop_name: 'Reddy Chicken and Mutton Center',
    address: 'Old Alwal, Secunderabad, Telangana',
    phone: '7989856610',
    currency: 'Rs.',
  };

  // 2. Fetch all daily closings for the month
  const closingsRes = await query(
    `SELECT c.*, u.full_name AS submitted_by_name, u.role AS submitted_by_role
     FROM daily_closings c
     LEFT JOIN users u ON c.submitted_by = u.id
     WHERE c.business_date >= $1 AND c.business_date <= $2
     ORDER BY c.business_date ASC`,
    [startDateStr, endDateStr]
  );
  const closingsMap = new Map<string, any>();
  for (const c of closingsRes.rows) {
    const dStr = c.business_date instanceof Date
      ? c.business_date.toISOString().split('T')[0]
      : String(c.business_date).split('T')[0];
    closingsMap.set(dStr, c);
  }

  // 3. Fetch all daily closing purchases for the month
  const purchasesRes = await query(
    `SELECT p.*, d.name AS distributor_name_actual, c.business_date
     FROM daily_closing_purchases p
     JOIN daily_closings c ON p.daily_closing_id = c.id
     LEFT JOIN distributors d ON p.distributor_id = d.id
     WHERE c.business_date >= $1 AND c.business_date <= $2
     ORDER BY p.id ASC`,
    [startDateStr, endDateStr]
  );
  const purchasesByDate = new Map<string, any[]>();
  for (const p of purchasesRes.rows) {
    const dStr = p.business_date instanceof Date
      ? p.business_date.toISOString().split('T')[0]
      : String(p.business_date).split('T')[0];
    if (!purchasesByDate.has(dStr)) purchasesByDate.set(dStr, []);
    purchasesByDate.get(dStr)!.push(p);
  }

  // Fallback: distributor_supplies for any day that may not have daily_closing_purchases
  const suppliesRes = await query(
    `SELECT s.*, d.name AS distributor_name
     FROM distributor_supplies s
     JOIN distributors d ON s.distributor_id = d.id
     WHERE s.supply_date >= $1 AND s.supply_date <= $2
     ORDER BY s.id ASC`,
    [startDateStr, endDateStr]
  );
  const suppliesByDate = new Map<string, any[]>();
  for (const s of suppliesRes.rows) {
    const dStr = s.supply_date instanceof Date
      ? s.supply_date.toISOString().split('T')[0]
      : String(s.supply_date).split('T')[0];
    if (!suppliesByDate.has(dStr)) suppliesByDate.set(dStr, []);
    suppliesByDate.get(dStr)!.push(s);
  }

  // 4. Fetch stock transfers for the month
  const transfersRes = await query(
    `SELECT *, weight_kg AS transferred_quantity_kg, total_cost AS total_transfer_cost
     FROM stock_transfers
     WHERE transfer_date >= $1 AND transfer_date <= $2
       AND LOWER(status) != 'cancelled'
     ORDER BY transfer_date ASC, id ASC`,
    [startDateStr, endDateStr]
  );
  const transfersByDate = new Map<string, any[]>();
  for (const t of transfersRes.rows) {
    const dStr = t.transfer_date instanceof Date
      ? t.transfer_date.toISOString().split('T')[0]
      : String(t.transfer_date).split('T')[0];
    if (!transfersByDate.has(dStr)) transfersByDate.set(dStr, []);
    transfersByDate.get(dStr)!.push(t);
  }

  // 5. Fetch financial adjustments for the month
  const adjustmentsRes = await query(
    `SELECT *
     FROM financial_adjustments
     WHERE business_date >= $1 AND business_date <= $2
     ORDER BY business_date ASC, id ASC`,
    [startDateStr, endDateStr]
  );
  const adjustmentsByDate = new Map<string, any[]>();
  for (const a of adjustmentsRes.rows) {
    const dStr = a.business_date instanceof Date
      ? a.business_date.toISOString().split('T')[0]
      : String(a.business_date).split('T')[0];
    if (!adjustmentsByDate.has(dStr)) adjustmentsByDate.set(dStr, []);
    adjustmentsByDate.get(dStr)!.push(a);
  }

  // 6. Fetch monthly operating expenses
  const expensesRes = await query(
    `SELECT e.*, u.full_name AS created_by_name
     FROM operating_expenses e
     LEFT JOIN users u ON e.created_by = u.id
     WHERE e.expense_date >= $1 AND e.expense_date <= $2
     ORDER BY e.expense_date ASC, e.id ASC`,
    [startDateStr, endDateStr]
  );

  // Group expenses by category
  const expenseCategoriesMap = new Map<string, { count: number; total: Decimal }>();
  let totalOperatingExpenses = new Decimal(0);
  for (const e of expensesRes.rows) {
    const cat = e.category || 'General';
    const amt = toDecimal(e.amount);
    totalOperatingExpenses = totalOperatingExpenses.plus(amt);
    if (!expenseCategoriesMap.has(cat)) {
      expenseCategoriesMap.set(cat, { count: 0, total: new Decimal(0) });
    }
    const cur = expenseCategoriesMap.get(cat)!;
    cur.count += 1;
    cur.total = cur.total.plus(amt);
  }

  // 7. Month-End Outstanding Balances
  // Customer Katha Month-End Balance
  const custBalanceRes = await query(
    `SELECT 
       COALESCE(SUM(opening_balance), 0) +
       COALESCE((
         SELECT SUM(CASE WHEN payment_type = 'Pay Later' THEN total_amount 
                         WHEN payment_type = 'Partial' THEN (total_amount - paid_amount) 
                         ELSE 0 END)
         FROM customer_bills 
         WHERE bill_date <= $1
       ), 0) -
       COALESCE((
         SELECT SUM(amount) 
         FROM customer_payments 
         WHERE payment_date <= $1
       ), 0) AS month_end_customer_katha
     FROM customers`,
    [endDateStr]
  );
  const monthEndCustomerKathaBalance = toDecimal(custBalanceRes.rows[0]?.month_end_customer_katha || 0);

  // Distributor Month-End Balance
  const distBalanceRes = await query(
    `SELECT 
       COALESCE(SUM(opening_balance), 0) +
       COALESCE((
         SELECT SUM(total_amount) 
         FROM distributor_supplies 
         WHERE supply_date <= $1
       ), 0) -
       COALESCE((
         SELECT SUM(amount) 
         FROM distributor_payments 
         WHERE payment_date <= $1
       ), 0) AS month_end_distributor
     FROM distributors`,
    [endDateStr]
  );
  const monthEndDistributorBalance = toDecimal(distBalanceRes.rows[0]?.month_end_distributor || 0);

  // Customer credit generated during this month
  const custCreditRes = await query(
    `SELECT COALESCE(SUM(CASE WHEN payment_type = 'Pay Later' THEN total_amount 
                              WHEN payment_type = 'Partial' THEN (total_amount - paid_amount) 
                              ELSE 0 END), 0) AS total_credit
     FROM customer_bills
     WHERE bill_date >= $1 AND bill_date <= $2`,
    [startDateStr, endDateStr]
  );
  const monthlyCustomerCreditGenerated = toDecimal(custCreditRes.rows[0]?.total_credit || 0);

  // Customer payments received during this month
  const custPaymentsRes = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total_received
     FROM customer_payments
     WHERE payment_date >= $1 AND payment_date <= $2`,
    [startDateStr, endDateStr]
  );
  const monthlyCustomerPaymentsReceived = toDecimal(custPaymentsRes.rows[0]?.total_received || 0);

  // Distributor payments made during this month
  const distPaymentsRes = await query(
    `SELECT COALESCE(SUM(amount), 0) AS total_paid
     FROM distributor_payments
     WHERE payment_date >= $1 AND payment_date <= $2`,
    [startDateStr, endDateStr]
  );
  const monthlyDistributorPaymentsMade = toDecimal(distPaymentsRes.rows[0]?.total_paid || 0);

  // Total supplies & weight in month
  const suppliesTotalsRes = await query(
    `SELECT COALESCE(SUM(total_amount), 0) AS total_cost, COALESCE(SUM(weight_kg), 0) AS total_weight
     FROM distributor_supplies
     WHERE supply_date >= $1 AND supply_date <= $2`,
    [startDateStr, endDateStr]
  );
  const monthlySuppliesWeightKg = toDecimal(suppliesTotalsRes.rows[0]?.total_weight || 0);
  const monthlySuppliesCost = toDecimal(suppliesTotalsRes.rows[0]?.total_cost || 0);

  // Total stock transfers in month
  const transfersTotalsRes = await query(
    `SELECT COALESCE(SUM(weight_kg), 0) AS total_weight, COALESCE(SUM(total_cost), 0) AS total_cost
     FROM stock_transfers
     WHERE transfer_date >= $1 AND transfer_date <= $2
       AND LOWER(status) != 'cancelled'`,
    [startDateStr, endDateStr]
  );
  const monthlyStockTransferredKg = toDecimal(transfersTotalsRes.rows[0]?.total_weight || 0);
  const monthlyStockTransferredCost = toDecimal(transfersTotalsRes.rows[0]?.total_cost || 0);

  // Aggregate stats from completed closings
  let completedCount = 0;
  let draftCount = 0;
  let missingCount = 0;
  let futureCount = 0;

  let totalCounterCollection = new Decimal(0);
  let totalChickenRevenue = new Decimal(0);
  let totalEggRevenue = new Decimal(0);
  let totalSalesRevenue = new Decimal(0);
  let totalChickenSoldKg = new Decimal(0);
  let totalChickenCOGS = new Decimal(0);
  let totalEggCOGS = new Decimal(0);
  let totalNetProfit = new Decimal(0);

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const closing = closingsMap.get(dayStr);
    const isFuture = dayStr > todayStr;

    if (closing) {
      if (closing.status === 'Completed') {
        completedCount++;
        totalCounterCollection = totalCounterCollection.plus(toDecimal(closing.total_counter_collection));
        const cRev = toDecimal(closing.chicken_sales_revenue);
        const eRev = toDecimal(closing.egg_sales_revenue || 0);
        totalChickenRevenue = totalChickenRevenue.plus(cRev);
        totalEggRevenue = totalEggRevenue.plus(eRev);
        totalSalesRevenue = totalSalesRevenue.plus(closing.total_sales_revenue ? toDecimal(closing.total_sales_revenue) : cRev.plus(eRev));
        totalChickenSoldKg = totalChickenSoldKg.plus(toDecimal(closing.quantity_sold_kg));
        totalChickenCOGS = totalChickenCOGS.plus(toDecimal(closing.cost_of_chicken_sold || 0));
        const eggCogs = toDecimal(closing.egg_total_available_cost || 0).minus(toDecimal(closing.egg_closing_stock_amount || 0));
        totalEggCOGS = totalEggCOGS.plus(eggCogs.gt(0) ? eggCogs : new Decimal(0));
        totalNetProfit = totalNetProfit.plus(toDecimal(closing.estimated_net_profit));
      } else {
        draftCount++;
      }
    } else {
      if (isFuture) {
        futureCount++;
      } else {
        missingCount++;
      }
    }
  }

  const totalCOGS = totalChickenCOGS.plus(totalEggCOGS);
  // Monthly Gross Profit = Monthly Net Profit - Operating Expenses (per project accounting rule)
  const totalGrossProfit = totalNetProfit.minus(totalOperatingExpenses);

  // Helper formatting functions for PDF text
  const fmtCurr = (val: Decimal | number | string | null | undefined): string => {
    const num = typeof val === 'number' ? val : parseFloat(String(val || 0)) || 0;
    return `Rs. ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fmtKg = (val: Decimal | number | string | null | undefined): string => {
    const num = typeof val === 'number' ? val : parseFloat(String(val || 0)) || 0;
    return `${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg`;
  };

  const fmtEggs = (val: Decimal | number | string | null | undefined): string => {
    const num = typeof val === 'number' ? val : parseFloat(String(val || 0)) || 0;
    return `${num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} eggs`;
  };

  // -------------------------------------------------------------
  // BUILD PDF DOCUMENT
  // -------------------------------------------------------------
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    bufferPages: true,
    info: {
      Title: `Monthly Closing Report - ${monthName} ${year}`,
      Author: 'Reddy Chicken and Mutton Center ERP',
      Subject: `Comprehensive Daily Business Closings Review for ${monthName} ${year}`,
      CreationDate: new Date(),
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const leftMargin = 36;
  const rightMargin = pageWidth - 36;
  const contentWidth = rightMargin - leftMargin; // 523.28

  // Helper for drawing horizontal rules
  const drawLine = (y: number, color = '#cbd5e1', width = 0.5) => {
    doc.save().strokeColor(color).lineWidth(width).moveTo(leftMargin, y).lineTo(rightMargin, y).stroke().restore();
  };

  // Helper for check & auto page add
  const ensureSpace = (neededHeight: number) => {
    if (doc.y + neededHeight > pageHeight - 50) {
      doc.addPage();
      doc.y = 50; // top padding on continued page
    }
  };

  // =============================================================
  // PAGE 1: EXECUTIVE MONTHLY SUMMARY & FINANCIAL OVERVIEW
  // =============================================================
  // Main Header Box
  doc.save();
  doc.roundedRect(leftMargin, 36, contentWidth, 70, 8).fill('#0f172a');
  doc.restore();

  doc.fontSize(16).fillColor('#ffffff').font('Helvetica-Bold');
  doc.text('REDDY CHICKEN AND MUTTON CENTER', leftMargin + 16, 48, { width: contentWidth - 32, align: 'left' });

  doc.fontSize(8.5).fillColor('#fbbf24').font('Helvetica-Bold');
  doc.text('FRESH MEAT & POULTRY MANAGEMENT SYSTEM', leftMargin + 16, 68);

  doc.fontSize(8).fillColor('#94a3b8').font('Helvetica');
  doc.text(
    `${shop.address || 'Old Alwal, Secunderabad'} | Phone: ${shop.phone || '7989856610'} | Currency: INR (Rs.)`,
    leftMargin + 16,
    80
  );

  doc.y = 118;

  // Title Bar
  doc.fontSize(13).fillColor('#0f172a').font('Helvetica-Bold');
  doc.text(`MONTHLY BUSINESS CLOSING REPORT - ${monthName.toUpperCase()} ${year}`);
  
  doc.fontSize(8.5).fillColor('#475569').font('Helvetica');
  doc.text(
    `Reporting Period: ${startDateStr} to ${endDateStr}  |  Generated on: ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)`
  );

  doc.moveDown(0.6);
  drawLine(doc.y, '#94a3b8', 1);
  doc.moveDown(0.8);

  // Days Status Overview Cards (4 mini boxes)
  const cardW = (contentWidth - 18) / 4;
  let curY = doc.y;

  const drawStatusCard = (x: number, y: number, w: number, label: string, val: string, bg: string, border: string, textCol: string) => {
    doc.save();
    doc.roundedRect(x, y, w, 40, 5).fillAndStroke(bg, border);
    doc.restore();
    doc.fontSize(7.5).fillColor('#475569').font('Helvetica-Bold').text(label, x + 6, y + 6, { width: w - 12, align: 'center' });
    doc.fontSize(13).fillColor(textCol).font('Helvetica-Bold').text(val, x + 6, y + 18, { width: w - 12, align: 'center' });
  };

  drawStatusCard(leftMargin, curY, cardW, 'DAYS IN MONTH', String(daysInMonth), '#f8fafc', '#cbd5e1', '#0f172a');
  drawStatusCard(leftMargin + cardW + 6, curY, cardW, 'COMPLETED & LOCKED', String(completedCount), '#ecfdf5', '#a7f3d0', '#047857');
  drawStatusCard(leftMargin + (cardW + 6) * 2, curY, cardW, 'DRAFT / IN PROGRESS', String(draftCount), '#fefce8', '#fde047', '#a16207');
  drawStatusCard(leftMargin + (cardW + 6) * 3, curY, cardW, 'MISSING CLOSINGS', String(missingCount), '#fef2f2', '#fecaca', '#b91c1c');

  doc.y = curY + 48;

  // Financial Metrics Grid (Structured 3-column table cards)
  doc.fontSize(10.5).fillColor('#0f172a').font('Helvetica-Bold').text('1. Executive Financial Summary');
  doc.moveDown(0.3);

  const colW = (contentWidth - 12) / 3;
  const drawMetricBox = (x: number, y: number, w: number, h: number, title: string, mainVal: string, subText?: string, isHighlight = false) => {
    doc.save();
    doc.roundedRect(x, y, w, h, 6).fillAndStroke(isHighlight ? '#0f172a' : '#f8fafc', isHighlight ? '#0f172a' : '#e2e8f0');
    doc.restore();

    doc.fontSize(7.5).fillColor(isHighlight ? '#94a3b8' : '#64748b').font('Helvetica-Bold').text(title, x + 8, y + 7, { width: w - 16 });
    doc.fontSize(11.5).fillColor(isHighlight ? '#ffffff' : '#0f172a').font('Helvetica-Bold').text(mainVal, x + 8, y + 20, { width: w - 16 });
    if (subText) {
      doc.fontSize(7).fillColor(isHighlight ? '#fbbf24' : '#475569').font('Helvetica').text(subText, x + 8, y + 36, { width: w - 16 });
    }
  };

  const startGridY = doc.y;
  const boxH = 48;

  // Row 1
  drawMetricBox(leftMargin, startGridY, colW, boxH, "TOTAL COUNTER COLLECTION", fmtCurr(totalCounterCollection), "Sum of cash, UPI & card collections");
  drawMetricBox(leftMargin + colW + 6, startGridY, colW, boxH, "TOTAL SALES REVENUE", fmtCurr(totalSalesRevenue), `Chicken: ${fmtCurr(totalChickenRevenue)} | Eggs: ${fmtCurr(totalEggRevenue)}`);
  drawMetricBox(leftMargin + (colW + 6) * 2, startGridY, colW, boxH, "TOTAL CHICKEN SOLD", fmtKg(totalChickenSoldKg), `Transferred out: ${fmtKg(monthlyStockTransferredKg)}`);

  // Row 2
  const r2Y = startGridY + boxH + 6;
  drawMetricBox(leftMargin, r2Y, colW, boxH, "DISTRIBUTOR PURCHASES", fmtCurr(monthlySuppliesCost), `Live bird received: ${fmtKg(monthlySuppliesWeightKg)}`);
  drawMetricBox(leftMargin + colW + 6, r2Y, colW, boxH, "COST OF GOODS SOLD (COGS)", fmtCurr(totalCOGS), "Inventory cost of sold chicken & eggs");
  drawMetricBox(leftMargin + (colW + 6) * 2, r2Y, colW, boxH, "OPERATING EXPENSES (MONTH)", fmtCurr(totalOperatingExpenses), `${expensesRes.rows.length} expense records recorded`);

  // Row 3 (Highlighted Gross & Net Profit)
  const r3Y = r2Y + boxH + 6;
  drawMetricBox(leftMargin, r3Y, colW, boxH, "ESTIMATED GROSS PROFIT", fmtCurr(totalGrossProfit), "Net Profit - Operating Expenses", false);
  drawMetricBox(leftMargin + colW + 6, r3Y, colW * 2 + 6, boxH, "ESTIMATED NET DAILY PROFIT (SUM)", fmtCurr(totalNetProfit), "Sum of Daily Business Closings Net Profit", true);

  // Row 4: Credit & Payments Reconciliation
  const r4Y = r3Y + boxH + 6;
  drawMetricBox(leftMargin, r4Y, colW, boxH, "CUSTOMER CREDIT GENERATED", fmtCurr(monthlyCustomerCreditGenerated), "Unpaid credit sales during month");
  drawMetricBox(leftMargin + colW + 6, r4Y, colW, boxH, "CUSTOMER PAYMENTS RECEIVED", fmtCurr(monthlyCustomerPaymentsReceived), "Collections applied to Katha debt");
  drawMetricBox(leftMargin + (colW + 6) * 2, r4Y, colW, boxH, "DISTRIBUTOR PAYMENTS MADE", fmtCurr(monthlyDistributorPaymentsMade), "Settlements paid to poultry suppliers");

  // Row 5: Actual Month-End Outstanding Balances
  const r5Y = r4Y + boxH + 6;
  drawMetricBox(leftMargin, r5Y, (contentWidth - 6) / 2, boxH, "MONTH-END DISTRIBUTOR OUTSTANDING", fmtCurr(monthEndDistributorBalance), `As on ${endDateStr} (Net supplier debt balance)`);
  drawMetricBox(leftMargin + (contentWidth - 6) / 2 + 6, r5Y, (contentWidth - 6) / 2, boxH, "MONTH-END CUSTOMER KATHA OUTSTANDING", fmtCurr(monthEndCustomerKathaBalance), `As on ${endDateStr} (Total customer credit receivable)`);

  doc.y = r5Y + boxH + 12;

  // 2. Operating Expenses Category Breakdown Table
  doc.fontSize(10.5).fillColor('#0f172a').font('Helvetica-Bold').text('2. Monthly Operating Expenses by Category');
  doc.moveDown(0.3);

  const expTableY = doc.y;
  doc.save();
  doc.rect(leftMargin, expTableY, contentWidth, 16).fill('#f1f5f9');
  doc.restore();

  doc.fontSize(7.5).fillColor('#334155').font('Helvetica-Bold');
  doc.text('CATEGORY', leftMargin + 8, expTableY + 4, { width: 180 });
  doc.text('ENTRIES', leftMargin + 195, expTableY + 4, { width: 70, align: 'center' });
  doc.text('TOTAL AMOUNT', leftMargin + 270, expTableY + 4, { width: 130, align: 'right' });
  doc.text('% OF TOTAL', leftMargin + 410, expTableY + 4, { width: 100, align: 'right' });

  let rowY = expTableY + 18;
  if (expenseCategoriesMap.size === 0) {
    doc.fontSize(8).fillColor('#64748b').font('Helvetica').text('No operating expenses recorded for this month.', leftMargin + 8, rowY + 4);
    rowY += 18;
  } else {
    for (const [catName, catData] of expenseCategoriesMap.entries()) {
      const pct = totalOperatingExpenses.gt(0)
        ? catData.total.dividedBy(totalOperatingExpenses).times(100).toFixed(1)
        : '0.0';

      doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica-Bold').text(catName, leftMargin + 8, rowY + 3, { width: 180 });
      doc.fontSize(7.5).fillColor('#475569').font('Helvetica').text(`${catData.count}`, leftMargin + 195, rowY + 3, { width: 70, align: 'center' });
      doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica-Bold').text(fmtCurr(catData.total), leftMargin + 270, rowY + 3, { width: 130, align: 'right' });
      doc.fontSize(7.5).fillColor('#475569').font('Helvetica').text(`${pct}%`, leftMargin + 410, rowY + 3, { width: 100, align: 'right' });

      drawLine(rowY + 14, '#f1f5f9', 0.5);
      rowY += 15;
    }

    // Total Row
    doc.save().rect(leftMargin, rowY, contentWidth, 16).fill('#f8fafc').restore();
    doc.fontSize(8).fillColor('#0f172a').font('Helvetica-Bold').text('TOTAL OPERATING EXPENSES', leftMargin + 8, rowY + 4);
    doc.text(`${expensesRes.rows.length}`, leftMargin + 195, rowY + 4, { width: 70, align: 'center' });
    doc.text(fmtCurr(totalOperatingExpenses), leftMargin + 270, rowY + 4, { width: 130, align: 'right' });
    doc.text('100.0%', leftMargin + 410, rowY + 4, { width: 100, align: 'right' });
    rowY += 20;
  }

  doc.y = rowY + 6;

  // Accounting Notes Callout
  doc.save();
  doc.roundedRect(leftMargin, doc.y, contentWidth, 48, 5).fillAndStroke('#f8fafc', '#e2e8f0');
  doc.restore();

  const noteY = doc.y;
  doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica-Bold').text('Note on Calculations & Verification:', leftMargin + 8, noteY + 5);
  doc.fontSize(7).fillColor('#475569').font('Helvetica').text(
    '1. Chicken Sales Revenue is calculated as: Total Available Inventory Cost - Stock Transferred Out - Total Closing Stock Valuation.\n' +
    '2. Estimated Net Daily Profit = Total Counter Collection - Chicken Sales Revenue - Egg Sales Revenue +/- Adjustments.\n' +
    '3. Estimated Gross Profit for the month is reconciled as: Monthly Net Profit - Monthly Operating Expenses (per business formula).',
    leftMargin + 8,
    noteY + 16,
    { width: contentWidth - 16, lineGap: 1.5 }
  );

  // =============================================================
  // PAGE 2+: DETAILED DAILY BUSINESS CLOSINGS FOR EVERY DAY
  // =============================================================
  doc.addPage();
  doc.y = 50;

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.toLocaleDateString('en-IN', { weekday: 'long' });
    const formattedDate = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
    const closing = closingsMap.get(dayStr);
    const isFuture = dayStr > todayStr;

    // Estimate block height
    const hasClosing = !!closing;
    const isCompleted = closing?.status === 'Completed';
    const dayPurchases = purchasesByDate.get(dayStr) || suppliesByDate.get(dayStr) || [];
    const dayTransfers = transfersByDate.get(dayStr) || [];
    const dayAdjustments = adjustmentsByDate.get(dayStr) || [];

    // Height needed:
    let neededH = 50; // header
    if (hasClosing) {
      neededH += 40; // Section A
      if (dayPurchases.length > 0) neededH += dayPurchases.length * 12 + 15;
      neededH += 35; // Section B
      neededH += 60; // Section C
      neededH += 40; // Section D
      neededH += 25; // Section E
      if (dayAdjustments.length > 0) neededH += dayAdjustments.length * 12;
      neededH += 70; // Section F
    } else {
      neededH += 35; // Callout for missing / future
    }

    ensureSpace(neededH);

    // --- DAY HEADER BANNER ---
    const dayHeaderY = doc.y;
    let bannerBg = '#0f172a';
    let statusText = 'COMPLETED & LOCKED';
    let statusBg = '#15803d';
    let statusTextCol = '#ffffff';

    if (!hasClosing) {
      if (isFuture) {
        bannerBg = '#475569';
        statusText = 'FUTURE DATE (CLOSING NOT DUE)';
        statusBg = '#cbd5e1';
        statusTextCol = '#1e293b';
      } else {
        bannerBg = '#7f1d1d';
        statusText = 'MISSING CLOSING RECORD';
        statusBg = '#fecaca';
        statusTextCol = '#991b1b';
      }
    } else if (!isCompleted) {
      bannerBg = '#78350f';
      statusText = closing.status === 'Draft' ? 'DRAFT / IN PROGRESS' : 'REOPENED FOR MODIFICATION';
      statusBg = '#fef08a';
      statusTextCol = '#854d0e';
    }

    const isSunday = dateObj.getDay() === 0;

    doc.save();
    if (isSunday) {
      doc.lineWidth(1.5).roundedRect(leftMargin, dayHeaderY, contentWidth, 24, 4).fillAndStroke(bannerBg, '#f59e0b');
    } else {
      doc.roundedRect(leftMargin, dayHeaderY, contentWidth, 24, 4).fill(bannerBg);
    }
    doc.restore();

    doc.fontSize(9.5).fillColor(isSunday ? '#fde047' : '#ffffff').font('Helvetica-Bold');
    doc.text(`DAY ${day}: ${formattedDate} (${dayOfWeek}${isSunday ? ' - PEAK' : ''})`, leftMargin + 10, dayHeaderY + 6);

    // Status pill
    doc.fontSize(7.5).font('Helvetica-Bold');
    const pillW = doc.widthOfString(statusText) + 14;
    const pillX = rightMargin - pillW - 8;
    doc.save();
    doc.roundedRect(pillX, dayHeaderY + 4, pillW, 16, 8).fill(statusBg);
    doc.restore();
    doc.fillColor(statusTextCol).text(statusText, pillX + 7, dayHeaderY + 7);

    // Sunday peak sales badge pill
    if (isSunday) {
      const sunPillW = 66;
      const sunPillX = pillX - sunPillW - 6;
      doc.save();
      doc.roundedRect(sunPillX, dayHeaderY + 4, sunPillW, 16, 4).fillAndStroke('#fef3c7', '#f59e0b');
      doc.restore();
      doc.fontSize(7).fillColor('#92400e').font('Helvetica-Bold').text('SUNDAY PEAK', sunPillX + 5, dayHeaderY + 7);
    }

    doc.y = dayHeaderY + 28;

    // Submission Metadata
    if (hasClosing) {
      const subUser = closing.submitted_by_name || 'Authorized Staff';
      const subRole = closing.submitted_by_role ? `(${closing.submitted_by_role})` : '';
      const subTime = closing.submitted_at
        ? new Date(closing.submitted_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        : 'Recorded';
      doc.fontSize(7.5).fillColor('#64748b').font('Helvetica');
      doc.text(`Submitted by: ${subUser} ${subRole} on ${subTime}  |  Business Status: ${closing.status}`, leftMargin + 2, doc.y);
      doc.moveDown(0.4);
    }

    // --- DAY BODY ---
    if (!hasClosing) {
      doc.save();
      doc.roundedRect(leftMargin, doc.y, contentWidth, 26, 4).fillAndStroke(isFuture ? '#f8fafc' : '#fef2f2', isFuture ? '#e2e8f0' : '#fecaca');
      doc.restore();
      doc.fontSize(8).fillColor(isFuture ? '#64748b' : '#991b1b').font(isFuture ? 'Helvetica' : 'Helvetica-Bold');
      doc.text(
        isFuture
          ? 'Calendar date is in the future. Business closing operations are not yet due.'
          : 'NOTICE: No Daily Business Closing record exists in the database for this date. Figures omitted to avoid unverified data.',
        leftMargin + 10,
        doc.y + 7
      );
      doc.y += 32;
    } else {
      // Container box for day review
      const boxStartY = doc.y;

      // Section A: Distributor Purchase Summary
      doc.fontSize(8.5).fillColor('#0f172a').font('Helvetica-Bold').text('A. Distributor Purchase Summary');
      doc.moveDown(0.2);

      if (dayPurchases.length > 0) {
        // Purchases mini-table
        const tY = doc.y;
        doc.save().rect(leftMargin, tY, contentWidth, 14).fill('#f1f5f9').restore();
        doc.fontSize(7).fillColor('#334155').font('Helvetica-Bold');
        doc.text('DISTRIBUTOR', leftMargin + 6, tY + 3, { width: 180 });
        doc.text('WEIGHT (KG)', leftMargin + 190, tY + 3, { width: 80, align: 'right' });
        doc.text('RATE / KG', leftMargin + 275, tY + 3, { width: 80, align: 'right' });
        doc.text('TOTAL COST', leftMargin + 360, tY + 3, { width: 80, align: 'right' });
        doc.text('NOTES', leftMargin + 445, tY + 3, { width: 70 });

        let pRowY = tY + 15;
        let sumW = new Decimal(0);
        let sumC = new Decimal(0);

        for (const p of dayPurchases) {
          const distName = p.distributor_name || p.distributor_name_actual || 'Poultry Supplier';
          const pW = toDecimal(p.weight_kg);
          const pR = toDecimal(p.price_per_kg);
          const pC = toDecimal(p.total_cost || p.total_amount || pW.times(pR));
          sumW = sumW.plus(pW);
          sumC = sumC.plus(pC);

          doc.fontSize(7).fillColor('#0f172a').font('Helvetica').text(distName, leftMargin + 6, pRowY + 2, { width: 180 });
          doc.text(fmtKg(pW), leftMargin + 190, pRowY + 2, { width: 80, align: 'right' });
          doc.text(fmtCurr(pR), leftMargin + 275, pRowY + 2, { width: 80, align: 'right' });
          doc.font('Helvetica-Bold').text(fmtCurr(pC), leftMargin + 360, pRowY + 2, { width: 80, align: 'right' });
          doc.font('Helvetica').fillColor('#64748b').text(p.notes || '-', leftMargin + 445, pRowY + 2, { width: 70 });

          pRowY += 12;
        }

        const avgR = sumW.gt(0) ? sumC.dividedBy(sumW) : new Decimal(0);
        doc.fontSize(7).fillColor('#0f172a').font('Helvetica-Bold');
        doc.text(`Total Purchases: ${fmtKg(sumW)}  |  Total Cost: ${fmtCurr(sumC)}  |  Average Rate: ${fmtCurr(avgR)}/kg`, leftMargin + 6, pRowY + 2);
        doc.y = pRowY + 14;
      } else {
        const cost = toDecimal(closing.distributor_purchase_cost);
        const weight = toDecimal(closing.new_stock_kg);
        if (cost.gt(0) || weight.gt(0)) {
          doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica');
          doc.text(`Total Weight: ${fmtKg(weight)}  |  Total Purchase Cost: ${fmtCurr(cost)}  |  Average: ${fmtCurr(weight.gt(0) ? cost.dividedBy(weight) : 0)}/kg`, leftMargin + 6, doc.y);
          doc.moveDown(0.3);
        } else {
          doc.fontSize(7.5).fillColor('#64748b').font('Helvetica-Oblique').text('No distributor purchases recorded for this date.', leftMargin + 6, doc.y);
          doc.moveDown(0.3);
        }
      }

      // Section B: Counter Collection Summary
      doc.moveDown(0.2);
      doc.fontSize(8.5).fillColor('#0f172a').font('Helvetica-Bold').text('B. Counter Collection Summary');
      doc.moveDown(0.2);
      doc.fontSize(7.5).fillColor('#334155').font('Helvetica');
      doc.text(
        `Cash: ${fmtCurr(closing.cash_collection)}   |   ` +
        `UPI / QR: ${fmtCurr(closing.upi_collection)}   |   ` +
        `Card: ${fmtCurr(closing.card_collection)}   |   ` +
        `Other: ${fmtCurr(closing.other_collection)}   |   ` +
        `TOTAL COLLECTED: ${fmtCurr(closing.total_counter_collection)}`,
        leftMargin + 6,
        doc.y
      );
      doc.moveDown(0.5);

      // Section C: Chicken Stock & Sales Summary
      doc.fontSize(8.5).fillColor('#0f172a').font('Helvetica-Bold').text('C. Chicken Stock & Sales Summary');
      doc.moveDown(0.2);

      const opW = toDecimal(closing.opening_stock_kg);
      const opA = toDecimal(closing.opening_stock_amount);
      const opR = toDecimal(closing.opening_stock_rate_per_kg);
      const newW = toDecimal(closing.new_stock_kg);
      const totW = toDecimal(closing.total_available_stock_kg);
      const totC = toDecimal(closing.total_available_stock_cost);
      const trW = toDecimal(closing.stock_transferred_kg);
      const forSaleW = toDecimal(closing.stock_available_for_sale_kg || totW.minus(trW));
      const clW = toDecimal(closing.closing_stock_kg);
      const clA = toDecimal(closing.closing_stock_amount);
      const clR = toDecimal(closing.closing_stock_rate_per_kg);
      const soldW = toDecimal(closing.quantity_sold_kg);
      const sellPrice = toDecimal(closing.selling_price_per_kg);
      const chkRev = toDecimal(closing.chicken_sales_revenue);
      const chkCogs = toDecimal(closing.cost_of_chicken_sold);

      doc.fontSize(7).fillColor('#1e293b').font('Helvetica');
      doc.text(
        `• Opening Stock: ${fmtKg(opW)} ${opA.gt(0) ? `(Valued: ${fmtCurr(opA)} @ ${fmtCurr(opR)}/kg)` : ''}\n` +
        `• New Stock Received: +${fmtKg(newW)}\n` +
        `• Total Available Stock: ${fmtKg(totW)} ${totC.gt(0) ? `(Inventory Cost: ${fmtCurr(totC)})` : ''}\n` +
        (trW.gt(0)
          ? `• Stock Transferred Out: -${fmtKg(trW)} ${
              dayTransfers.length > 0
                ? `(To: ${dayTransfers.map((t) => `${t.destination_shop} [${fmtKg(t.transferred_quantity_kg || t.weight_kg)}]`).join(', ')})`
                : ''
            }\n`
          : '') +
        `• Stock Available for Sale: ${fmtKg(forSaleW)}\n` +
        `• Closing Stock: ${fmtKg(clW)} ${clA.gt(0) ? `(Valued: ${fmtCurr(clA)} @ ${fmtCurr(clR)}/kg)` : ''}\n` +
        `• Quantity Sold: ${fmtKg(soldW)} @ ${fmtCurr(sellPrice)}/kg\n` +
        `• Chicken Sales Revenue: ${fmtCurr(chkRev)} (Formula: Total Inventory Cost - Closing Stock Valuation)\n` +
        `• Cost of Chicken Sold: ${fmtCurr(chkCogs)}`,
        leftMargin + 6,
        doc.y,
        { lineGap: 1 }
      );
      doc.moveDown(0.5);

      // Section D: Egg Stock & Sales Summary
      const eggOp = toDecimal(closing.egg_opening_stock || 0);
      const eggNew = toDecimal(closing.egg_new_stock || 0);
      const eggTot = toDecimal(closing.egg_total_available_stock || 0);
      const eggCl = toDecimal(closing.egg_closing_stock || 0);
      const eggSold = toDecimal(closing.egg_quantity_sold || 0);
      const eggRev = toDecimal(closing.egg_sales_revenue || 0);
      const eggPrice = toDecimal(closing.egg_closing_stock_rate || closing.egg_purchase_rate || 0);

      doc.fontSize(8.5).fillColor('#0f172a').font('Helvetica-Bold').text('D. Egg Stock & Sales Summary');
      doc.moveDown(0.2);

      if (eggOp.gt(0) || eggNew.gt(0) || eggTot.gt(0) || eggSold.gt(0)) {
        doc.fontSize(7).fillColor('#1e293b').font('Helvetica');
        doc.text(
          `• Opening Eggs: ${fmtEggs(eggOp)}  |  • New Eggs: +${fmtEggs(eggNew)}  |  • Total Available: ${fmtEggs(eggTot)}\n` +
          `• Closing Eggs: ${fmtEggs(eggCl)}  |  • Eggs Sold: ${fmtEggs(eggSold)} @ ${fmtCurr(eggPrice)}/egg  |  • Egg Revenue: ${fmtCurr(eggRev)}`,
          leftMargin + 6,
          doc.y,
          { lineGap: 1 }
        );
      } else {
        doc.fontSize(7.5).fillColor('#64748b').font('Helvetica-Oblique').text('No egg stock or sales recorded for this date.', leftMargin + 6, doc.y);
      }
      doc.moveDown(0.5);

      // Section E: Financial Adjustments
      doc.fontSize(8.5).fillColor('#0f172a').font('Helvetica-Bold').text('E. Other Income & Expenses / Adjustments');
      doc.moveDown(0.2);

      if (dayAdjustments.length > 0) {
        for (const adj of dayAdjustments) {
          const isInc = adj.adjustment_type === 'Additional Income';
          doc.fontSize(7).fillColor(isInc ? '#047857' : '#b91c1c').font('Helvetica-Bold');
          doc.text(
            `${isInc ? '+' : '-'} ${adj.adjustment_type}: ${fmtCurr(adj.amount)}  -  Reason: ${adj.reason}`,
            leftMargin + 6,
            doc.y
          );
          doc.moveDown(0.15);
        }
      } else {
        const adjAmt = toDecimal(closing.adjustments_amount);
        if (adjAmt.eq(0)) {
          doc.fontSize(7.5).fillColor('#64748b').font('Helvetica-Oblique').text('No financial adjustments recorded for this closing.', leftMargin + 6, doc.y);
        } else {
          doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica').text(`Net Adjustments Amount: ${fmtCurr(adjAmt)}`, leftMargin + 6, doc.y);
        }
      }
      doc.moveDown(0.5);

      // Section F: Profit Breakdown Box (Redesigned with dedicated badge to prevent overlapping)
      const pBoxY = doc.y;
      const pBoxH = 58;
      doc.save();
      doc.roundedRect(leftMargin, pBoxY, contentWidth, pBoxH, 4).fillAndStroke('#f8fafc', '#cbd5e1');
      doc.restore();

      // Top row: Section Title (left) & NET DAILY PROFIT badge (right)
      doc.fontSize(8.5).fillColor('#0f172a').font('Helvetica-Bold').text('F. Financial Closing & Profit Breakdown', leftMargin + 8, pBoxY + 8);
      
      const totRev = closing.total_sales_revenue ? toDecimal(closing.total_sales_revenue) : chkRev.plus(eggRev);
      const grossP = toDecimal(closing.estimated_gross_profit);
      const netP = toDecimal(closing.estimated_net_profit);

      const netBadgeText = `NET DAILY PROFIT: ${fmtCurr(netP)}`;
      doc.fontSize(8.5).font('Helvetica-Bold');
      const badgeW = doc.widthOfString(netBadgeText) + 16;
      const badgeX = rightMargin - badgeW - 8;
      doc.save();
      doc.roundedRect(badgeX, pBoxY + 5, badgeW, 16, 4).fillAndStroke('#ecfdf5', '#86efac');
      doc.restore();
      doc.fillColor('#166534').text(netBadgeText, badgeX + 8, pBoxY + 9);

      // Subtle divider line inside Section F
      doc.save().strokeColor('#e2e8f0').lineWidth(0.5).moveTo(leftMargin + 6, pBoxY + 25).lineTo(rightMargin - 6, pBoxY + 25).stroke().restore();

      // Middle row: Financial components
      doc.fontSize(7.5).fillColor('#334155').font('Helvetica').text(
        `Counter Collection: ${fmtCurr(closing.total_counter_collection)}   |   ` +
        `Total Sales Revenue: ${fmtCurr(totRev)}   |   ` +
        `Estimated Gross Profit: ${fmtCurr(grossP)}`,
        leftMargin + 8,
        pBoxY + 29
      );

      // Bottom row: Reconciliation Formula (clean ASCII characters)
      doc.fontSize(6.5).fillColor('#64748b').font('Helvetica').text(
        `Reconciliation: Total Counter Collection - Chicken Sales Revenue - Egg Sales Revenue +/- Net Adjustments`,
        leftMargin + 8,
        pBoxY + 43
      );

      doc.y = pBoxY + pBoxH + 8;
      if (closing.notes && closing.notes.trim()) {
        doc.fontSize(7).fillColor('#475569').font('Helvetica-Oblique').text(`Closing Notes: ${closing.notes.trim()}`, leftMargin + 6, doc.y);
        doc.moveDown(0.3);
      }
    }

    doc.moveDown(0.6);
    drawLine(doc.y, '#e2e8f0', 0.5);
    doc.moveDown(0.8);
  }

  // =============================================================
  // RUNNING HEADERS & FOOTERS (All Pages)
  // =============================================================
  const range = doc.bufferedPageRange();
  const totalPages = range.count;

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);

    // Running Header on pages 2+
    if (i > 0) {
      doc.save();
      doc.fontSize(7.5).fillColor('#64748b').font('Helvetica');
      doc.text(
        `Reddy Chicken and Mutton Center  |  Monthly Business Closing Report - ${monthName} ${year}`,
        leftMargin,
        22,
        { width: contentWidth, align: 'left' }
      );
      doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(leftMargin, 32).lineTo(rightMargin, 32).stroke();
      doc.restore();
    }

    // Running Footer on all pages
    doc.save();
    doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(leftMargin, pageHeight - 32).lineTo(rightMargin, pageHeight - 32).stroke();
    doc.fontSize(7.5).fillColor('#64748b').font('Helvetica');
    doc.text(
      `Confidential Business Record  |  Generated on ${now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
      leftMargin,
      pageHeight - 24,
      { width: contentWidth / 2, align: 'left' }
    );
    doc.text(
      `Page ${i + 1} of ${totalPages}`,
      leftMargin + contentWidth / 2,
      pageHeight - 24,
      { width: contentWidth / 2, align: 'right' }
    );
    doc.restore();
  }

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      resolve({ buffer, filename });
    });
    doc.on('error', reject);
  });
}
