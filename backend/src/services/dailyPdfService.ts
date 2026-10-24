import PDFDocument from 'pdfkit';
import { query } from '../db/connection';
import { Decimal, toDecimal, formatMoney, formatWeight } from '../utils/decimal';

interface DailyPdfOptions {
  date: string; // YYYY-MM-DD
}

export async function generateDailyClosingPdf(options: DailyPdfOptions): Promise<{ buffer: Buffer; filename: string }> {
  const { date } = options;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid business date specified. Format must be YYYY-MM-DD.');
  }

  const parts = date.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  const dateObj = new Date(year, month - 1, day);
  const dayOfWeek = dateObj.toLocaleDateString('en-IN', { weekday: 'long' });
  const isSunday = dateObj.getDay() === 0;
  const formattedDate = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
  const filename = `Daily_Closing_Report_${formattedDate}.pdf`;

  const now = new Date();

  // 1. Fetch Shop Settings
  const shopRes = await query('SELECT * FROM shop_settings WHERE id = 1');
  const shop = shopRes.rows[0] || {
    shop_name: 'Reddy Chicken and Mutton Center',
    address: 'Old Alwal, Secunderabad, Telangana',
    phone: '7989856610',
    currency: 'Rs.',
  };

  // 2. Fetch Daily Closing record for this date
  const closingRes = await query(
    `SELECT c.*, u.full_name AS submitted_by_name, u.role AS submitted_by_role
     FROM daily_closings c
     LEFT JOIN users u ON c.submitted_by = u.id
     WHERE c.business_date = $1`,
    [date]
  );

  const closing = closingRes.rows[0];
  if (!closing) {
    throw new Error(`No daily closing record found in database for ${formattedDate}.`);
  }

  // 3. Fetch Distributor purchases for this closing
  const purchasesRes = await query(
    `SELECT p.*, d.name AS distributor_name_actual
     FROM daily_closing_purchases p
     LEFT JOIN distributors d ON p.distributor_id = d.id
     WHERE p.daily_closing_id = $1
     ORDER BY p.id ASC`,
    [closing.id]
  );
  let purchases = purchasesRes.rows;

  // Fallback: distributor_supplies on this date if closing purchases table is empty
  if (purchases.length === 0) {
    const supRes = await query(
      `SELECT s.*, d.name AS distributor_name, s.notes
       FROM distributor_supplies s
       JOIN distributors d ON s.distributor_id = d.id
       WHERE s.supply_date = $1
       ORDER BY s.id ASC`,
      [date]
    );
    purchases = supRes.rows;
  }

  // 4. Fetch Stock transfers for this date
  const transfersRes = await query(
    `SELECT *, weight_kg AS transferred_quantity_kg, total_cost AS total_transfer_cost
     FROM stock_transfers
     WHERE transfer_date = $1 AND LOWER(status) != 'cancelled'
     ORDER BY id ASC`,
    [date]
  );
  const transfers = transfersRes.rows;

  // 5. Fetch Financial adjustments for this closing/date
  const adjustmentsRes = await query(
    `SELECT *
     FROM financial_adjustments
     WHERE daily_closing_id = $1 OR (business_date = $2 AND daily_closing_id IS NULL)
     ORDER BY id ASC`,
    [closing.id, date]
  );
  const adjustments = adjustmentsRes.rows;

  // Formatting helpers
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

  // Build PDF Document
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    bufferPages: true,
    info: {
      Title: `Daily Business Closing Report - ${formattedDate}`,
      Author: 'Reddy Chicken and Mutton Center ERP',
      Subject: `Official Daily Business Closing Record for ${formattedDate}`,
      CreationDate: new Date(),
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const leftMargin = 36;
  const rightMargin = pageWidth - 36;
  const contentWidth = rightMargin - leftMargin;

  const drawLine = (y: number, color = '#cbd5e1', width = 0.5) => {
    doc.save().strokeColor(color).lineWidth(width).moveTo(leftMargin, y).lineTo(rightMargin, y).stroke().restore();
  };

  const ensureSpace = (neededHeight: number) => {
    if (doc.y + neededHeight > pageHeight - 50) {
      doc.addPage();
      doc.y = 50;
    }
  };

  // =============================================================
  // MAIN HEADER BOX
  // =============================================================
  doc.save();
  doc.roundedRect(leftMargin, 36, contentWidth, 68, 8).fill('#0f172a');
  doc.restore();

  doc.fontSize(15).fillColor('#ffffff').font('Helvetica-Bold');
  doc.text('REDDY CHICKEN AND MUTTON CENTER', leftMargin + 16, 46, { width: contentWidth - 32 });

  doc.fontSize(8.5).fillColor('#fbbf24').font('Helvetica-Bold');
  doc.text('FRESH MEAT & POULTRY MANAGEMENT SYSTEM', leftMargin + 16, 66);

  doc.fontSize(8).fillColor('#94a3b8').font('Helvetica');
  doc.text(
    `${shop.address || 'Old Alwal, Secunderabad'} | Phone: ${shop.phone || '7989856610'} | Currency: INR (Rs.)`,
    leftMargin + 16,
    78
  );

  doc.y = 114;

  // Title Bar & Sunday Highlight
  doc.fontSize(13).fillColor('#0f172a').font('Helvetica-Bold');
  doc.text(`DAILY BUSINESS CLOSING REPORT - ${formattedDate} (${dayOfWeek.toUpperCase()})`);

  doc.fontSize(8.5).fillColor('#475569').font('Helvetica');
  const subUser = closing.submitted_by_name || 'Authorized Staff';
  const subRole = closing.submitted_by_role ? `(${closing.submitted_by_role})` : '';
  const subTime = closing.submitted_at
    ? new Date(closing.submitted_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : 'Recorded';
  doc.text(
    `Status: ${closing.status.toUpperCase()}  |  Submitted by: ${subUser} ${subRole} on ${subTime}  |  Generated: ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)`
  );

  doc.moveDown(0.5);
  drawLine(doc.y, '#94a3b8', 1);
  doc.moveDown(0.6);

  // Status & Key Highlights Cards
  const cardW = (contentWidth - 18) / 4;
  const curY = doc.y;

  const drawStatusCard = (x: number, y: number, w: number, label: string, val: string, bg: string, border: string, textCol: string) => {
    doc.save();
    doc.roundedRect(x, y, w, 40, 5).fillAndStroke(bg, border);
    doc.restore();
    doc.fontSize(7).fillColor('#475569').font('Helvetica-Bold').text(label, x + 6, y + 6, { width: w - 12, align: 'center' });
    doc.fontSize(11).fillColor(textCol).font('Helvetica-Bold').text(val, x + 6, y + 18, { width: w - 12, align: 'center' });
  };

  const isCompleted = closing.status === 'Completed';
  drawStatusCard(leftMargin, curY, cardW, 'CLOSING STATUS', isCompleted ? 'LOCKED' : closing.status.toUpperCase(), isCompleted ? '#ecfdf5' : '#fefce8', isCompleted ? '#a7f3d0' : '#fde047', isCompleted ? '#047857' : '#a16207');
  drawStatusCard(leftMargin + cardW + 6, curY, cardW, 'COUNTER COLLECTION', fmtCurr(closing.total_counter_collection), '#f8fafc', '#cbd5e1', '#0f172a');
  drawStatusCard(leftMargin + (cardW + 6) * 2, curY, cardW, 'CHICKEN SOLD', fmtKg(closing.quantity_sold_kg), '#f8fafc', '#cbd5e1', '#0284c7');
  drawStatusCard(leftMargin + (cardW + 6) * 3, curY, cardW, 'NET DAILY PROFIT', fmtCurr(closing.estimated_net_profit), isSunday ? '#fef3c7' : '#ecfdf5', isSunday ? '#f59e0b' : '#86efac', isSunday ? '#92400e' : '#166534');

  doc.y = curY + 48;

  if (isSunday) {
    doc.save();
    doc.roundedRect(leftMargin, doc.y, contentWidth, 20, 4).fillAndStroke('#fffbeb', '#fde68a');
    doc.restore();
    doc.fontSize(8).fillColor('#b45309').font('Helvetica-Bold').text('SUNDAY PEAK SALES DAY — Highest Volume Business Operations', leftMargin + 8, doc.y + 5);
    doc.y += 26;
  }

  // =============================================================
  // SECTION A: DISTRIBUTOR PURCHASE SUMMARY
  // =============================================================
  ensureSpace(60);
  doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold').text('A. Distributor Purchase Summary');
  doc.moveDown(0.2);

  if (purchases.length > 0) {
    const tY = doc.y;
    doc.save().rect(leftMargin, tY, contentWidth, 15).fill('#f1f5f9').restore();
    doc.fontSize(7).fillColor('#334155').font('Helvetica-Bold');
    doc.text('DISTRIBUTOR', leftMargin + 8, tY + 3.5, { width: 180 });
    doc.text('WEIGHT (KG)', leftMargin + 195, tY + 3.5, { width: 80, align: 'right' });
    doc.text('RATE / KG', leftMargin + 280, tY + 3.5, { width: 80, align: 'right' });
    doc.text('TOTAL COST', leftMargin + 365, tY + 3.5, { width: 80, align: 'right' });
    doc.text('NOTES', leftMargin + 450, tY + 3.5, { width: 65 });

    let pRowY = tY + 16;
    let sumW = new Decimal(0);
    let sumC = new Decimal(0);

    for (const p of purchases) {
      const distName = p.distributor_name || p.distributor_name_actual || 'Poultry Supplier';
      const pW = toDecimal(p.weight_kg);
      const pR = toDecimal(p.price_per_kg);
      const pC = toDecimal(p.total_cost || p.total_amount || pW.times(pR));
      sumW = sumW.plus(pW);
      sumC = sumC.plus(pC);

      doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica').text(distName, leftMargin + 8, pRowY + 2, { width: 180 });
      doc.text(fmtKg(pW), leftMargin + 195, pRowY + 2, { width: 80, align: 'right' });
      doc.text(fmtCurr(pR), leftMargin + 280, pRowY + 2, { width: 80, align: 'right' });
      doc.font('Helvetica-Bold').text(fmtCurr(pC), leftMargin + 365, pRowY + 2, { width: 80, align: 'right' });
      doc.font('Helvetica').fillColor('#64748b').text(p.notes || '-', leftMargin + 450, pRowY + 2, { width: 65 });

      pRowY += 13;
    }

    const avgR = sumW.gt(0) ? sumC.dividedBy(sumW) : new Decimal(0);
    doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica-Bold');
    doc.text(`Total Purchases: ${fmtKg(sumW)}   |   Total Cost: ${fmtCurr(sumC)}   |   Average Rate: ${fmtCurr(avgR)}/kg`, leftMargin + 8, pRowY + 3);
    doc.y = pRowY + 18;
  } else {
    const cost = toDecimal(closing.distributor_purchase_cost);
    const weight = toDecimal(closing.new_stock_kg);
    if (cost.gt(0) || weight.gt(0)) {
      doc.fontSize(8).fillColor('#0f172a').font('Helvetica');
      doc.text(`Total Weight: ${fmtKg(weight)}  |  Total Purchase Cost: ${fmtCurr(cost)}  |  Average Rate: ${fmtCurr(weight.gt(0) ? cost.dividedBy(weight) : 0)}/kg`, leftMargin + 8, doc.y);
      doc.moveDown(0.3);
    } else {
      doc.fontSize(8).fillColor('#64748b').font('Helvetica-Oblique').text('No distributor purchases recorded for this date.', leftMargin + 8, doc.y);
      doc.moveDown(0.3);
    }
  }

  // =============================================================
  // SECTION B: COUNTER COLLECTION SUMMARY
  // =============================================================
  ensureSpace(45);
  doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold').text('B. Counter Collection Summary');
  doc.moveDown(0.2);

  doc.save();
  doc.roundedRect(leftMargin, doc.y, contentWidth, 24, 4).fillAndStroke('#f8fafc', '#e2e8f0');
  doc.restore();

  const bY = doc.y;
  doc.fontSize(7.5).fillColor('#334155').font('Helvetica');
  doc.text(
    `Cash: ${fmtCurr(closing.cash_collection)}    |    ` +
    `UPI / QR: ${fmtCurr(closing.upi_collection)}    |    ` +
    `Card: ${fmtCurr(closing.card_collection)}    |    ` +
    `Other: ${fmtCurr(closing.other_collection)}    |    ` +
    `TOTAL COLLECTED: ${fmtCurr(closing.total_counter_collection)}`,
    leftMargin + 8,
    bY + 7
  );
  doc.y = bY + 32;

  // =============================================================
  // SECTION C: CHICKEN STOCK & SALES SUMMARY
  // =============================================================
  ensureSpace(85);
  doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold').text('C. Chicken Stock & Sales Summary');
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

  doc.fontSize(7.5).fillColor('#1e293b').font('Helvetica');
  doc.text(
    `• Opening Stock: ${fmtKg(opW)} ${opA.gt(0) ? `(Valued: ${fmtCurr(opA)} @ ${fmtCurr(opR)}/kg)` : ''}\n` +
    `• New Stock Received: +${fmtKg(newW)}\n` +
    `• Total Available Stock: ${fmtKg(totW)} ${totC.gt(0) ? `(Inventory Cost: ${fmtCurr(totC)})` : ''}\n` +
    (trW.gt(0)
      ? `• Stock Transferred Out: -${fmtKg(trW)} ${
          transfers.length > 0
            ? `(To: ${transfers.map((t) => `${t.destination_shop} [${fmtKg(t.transferred_quantity_kg || t.weight_kg)}]`).join(', ')})`
            : ''
        }\n`
      : '') +
    `• Stock Available for Sale: ${fmtKg(forSaleW)}\n` +
    `• Closing Stock: ${fmtKg(clW)} ${clA.gt(0) ? `(Valued: ${fmtCurr(clA)} @ ${fmtCurr(clR)}/kg)` : ''}\n` +
    `• Quantity Sold: ${fmtKg(soldW)} @ ${fmtCurr(sellPrice)}/kg\n` +
    `• Chicken Sales Revenue: ${fmtCurr(chkRev)} (Formula: Total Inventory Cost - Closing Stock Valuation)\n` +
    `• Cost of Chicken Sold (COGS): ${fmtCurr(chkCogs)}`,
    leftMargin + 8,
    doc.y,
    { lineGap: 1.5 }
  );
  doc.moveDown(0.6);

  // =============================================================
  // SECTION D: EGG STOCK & SALES SUMMARY
  // =============================================================
  const eggOp = toDecimal(closing.egg_opening_stock || 0);
  const eggNew = toDecimal(closing.egg_new_stock || 0);
  const eggTot = toDecimal(closing.egg_total_available_stock || 0);
  const eggCl = toDecimal(closing.egg_closing_stock || 0);
  const eggSold = toDecimal(closing.egg_quantity_sold || 0);
  const eggRev = toDecimal(closing.egg_sales_revenue || 0);
  const eggPrice = toDecimal(closing.egg_closing_stock_rate || closing.egg_purchase_rate || 0);

  ensureSpace(45);
  doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold').text('D. Egg Stock & Sales Summary');
  doc.moveDown(0.2);

  if (eggOp.gt(0) || eggNew.gt(0) || eggTot.gt(0) || eggSold.gt(0)) {
    doc.fontSize(7.5).fillColor('#1e293b').font('Helvetica');
    doc.text(
      `• Opening Eggs: ${fmtEggs(eggOp)}   |   • New Eggs Received: +${fmtEggs(eggNew)}   |   • Total Available Eggs: ${fmtEggs(eggTot)}\n` +
      `• Closing Egg Stock: ${fmtEggs(eggCl)}   |   • Eggs Sold: ${fmtEggs(eggSold)} @ ${fmtCurr(eggPrice)}/egg   |   • Egg Sales Revenue: ${fmtCurr(eggRev)}`,
      leftMargin + 8,
      doc.y,
      { lineGap: 1.5 }
    );
  } else {
    doc.fontSize(8).fillColor('#64748b').font('Helvetica-Oblique').text('No egg stock or sales recorded for this date.', leftMargin + 8, doc.y);
  }
  doc.moveDown(0.6);

  // =============================================================
  // SECTION E: FINANCIAL ADJUSTMENTS
  // =============================================================
  ensureSpace(45);
  doc.fontSize(9).fillColor('#0f172a').font('Helvetica-Bold').text('E. Other Income & Expenses / Adjustments');
  doc.moveDown(0.2);

  if (adjustments.length > 0) {
    for (const adj of adjustments) {
      const isInc = adj.adjustment_type === 'Additional Income';
      doc.fontSize(7.5).fillColor(isInc ? '#047857' : '#b91c1c').font('Helvetica-Bold');
      doc.text(
        `${isInc ? '+' : '-'} ${adj.adjustment_type}: ${fmtCurr(adj.amount)}  -  Reason: ${adj.reason}`,
        leftMargin + 8,
        doc.y
      );
      doc.moveDown(0.2);
    }
  } else {
    const adjAmt = toDecimal(closing.adjustments_amount);
    if (adjAmt.eq(0)) {
      doc.fontSize(8).fillColor('#64748b').font('Helvetica-Oblique').text('No financial adjustments recorded for this daily closing.', leftMargin + 8, doc.y);
    } else {
      doc.fontSize(8).fillColor('#0f172a').font('Helvetica').text(`Net Adjustments Amount: ${fmtCurr(adjAmt)}`, leftMargin + 8, doc.y);
    }
  }
  doc.moveDown(0.6);

  // =============================================================
  // SECTION F: FINANCIAL CLOSING & PROFIT BREAKDOWN BOX
  // =============================================================
  ensureSpace(75);
  const pBoxY = doc.y;
  const pBoxH = 60;
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

  // Subtle divider inside Section F
  doc.save().strokeColor('#e2e8f0').lineWidth(0.5).moveTo(leftMargin + 6, pBoxY + 25).lineTo(rightMargin - 6, pBoxY + 25).stroke().restore();

  // Middle row: Financial components
  doc.fontSize(7.5).fillColor('#334155').font('Helvetica').text(
    `Counter Collection: ${fmtCurr(closing.total_counter_collection)}   |   ` +
    `Total Sales Revenue: ${fmtCurr(totRev)}   |   ` +
    `Estimated Gross Profit: ${fmtCurr(grossP)}`,
    leftMargin + 8,
    pBoxY + 30
  );

  // Bottom row: Reconciliation Formula (clean ASCII characters)
  doc.fontSize(6.5).fillColor('#64748b').font('Helvetica').text(
    `Reconciliation: Total Counter Collection - Chicken Sales Revenue - Egg Sales Revenue +/- Net Adjustments`,
    leftMargin + 8,
    pBoxY + 44
  );

  doc.y = pBoxY + pBoxH + 10;

  if (closing.notes && closing.notes.trim()) {
    doc.fontSize(7.5).fillColor('#475569').font('Helvetica-Oblique').text(`Closing Notes: ${closing.notes.trim()}`, leftMargin + 8, doc.y);
    doc.moveDown(0.4);
  }

  // =============================================================
  // SECTION G: STORE VERIFICATION & CERTIFICATION STAMP
  // =============================================================
  ensureSpace(70);
  const certY = doc.y + 4;
  doc.save();
  doc.roundedRect(leftMargin, certY, contentWidth, 54, 4).fillAndStroke('#f8fafc', '#e2e8f0');
  doc.restore();

  doc.fontSize(7.5).fillColor('#0f172a').font('Helvetica-Bold').text('STORE VERIFICATION & CERTIFICATION SIGN-OFF', leftMargin + 8, certY + 6);
  doc.fontSize(7).fillColor('#475569').font('Helvetica').text(
    'I hereby verify and certify that the daily business closing figures recorded above for poultry stock, counter cash/UPI receipts, and supplier payments accurately reflect daily shop operations and physical registers.',
    leftMargin + 8,
    certY + 18,
    { width: contentWidth - 180, lineGap: 1 }
  );

  doc.fontSize(7.5).fillColor('#334155').font('Helvetica-Bold');
  doc.text('Authorized Signature:', rightMargin - 165, certY + 12);
  drawLine(certY + 38, '#94a3b8', 0.5);
  doc.fontSize(6.5).fillColor('#64748b').font('Helvetica').text('Store Manager / Shop Owner', rightMargin - 165, certY + 42);

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
        `Reddy Chicken and Mutton Center  |  Daily Business Closing Report - ${formattedDate}`,
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
      `Confidential Official Business Record  |  Generated on ${now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
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
