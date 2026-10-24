import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { Decimal, toDecimal, formatMoney, formatWeight, multiply, add, subtract } from '../utils/decimal';
import { upload } from '../middleware/upload';

const router = Router();

// Helper to generate unique bill numbers: BILL-YYYYMMDD-XXXX
async function generateBillNumber(dateStr: string): Promise<string> {
  const cleanDate = dateStr.replace(/[^0-9]/g, '');
  const prefix = `BILL-${cleanDate}-`;
  const rowsRes = await query(
    `SELECT bill_number FROM customer_bills WHERE bill_number LIKE $1`,
    [`${prefix}%`]
  );
  let maxSeq = 0;
  for (const row of rowsRes.rows) {
    const parts = (row.bill_number as string).split('-');
    const seq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }
  let nextSeq = maxSeq + 1;
  while (true) {
    const candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;
    const check = await query('SELECT 1 FROM customer_bills WHERE bill_number = $1', [candidate]);
    if (check.rows.length === 0) {
      return candidate;
    }
    nextSeq++;
  }
}

// 1. List all customers with current balances and last transaction date
router.get('/customers', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, status, balanceFilter } = req.query;

    let filterSql = 'WHERE 1=1';
    const params: any[] = [];

    if (status && status !== 'All') {
      params.push(status);
      filterSql += ` AND c.account_status = $${params.length}`;
    }

    if (search && typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim()}%`);
      filterSql += ` AND (c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`;
    }

    const sql = `
      SELECT 
        c.id, c.name, c.phone, c.address, c.opening_balance, c.notes, c.account_status, c.created_at,
        COALESCE(b.total_credit_purchases, 0) AS total_credit_purchases,
        COALESCE(p.total_payments, 0) AS total_payments,
        GREATEST(b.last_bill_date, p.last_payment_date) AS last_txn_date
      FROM customers c
      LEFT JOIN (
        SELECT customer_id, 
               SUM(CASE WHEN payment_type = 'Pay Later' THEN total_amount 
                        WHEN payment_type = 'Partial' THEN (total_amount - paid_amount) 
                        ELSE 0 END) AS total_credit_purchases,
               MAX(bill_date) AS last_bill_date
        FROM customer_bills
        GROUP BY customer_id
      ) b ON c.id = b.customer_id
      LEFT JOIN (
        SELECT customer_id, SUM(amount) AS total_payments, MAX(payment_date) AS last_payment_date
        FROM customer_payments
        GROUP BY customer_id
      ) p ON c.id = p.customer_id
      ${filterSql}
      ORDER BY c.name ASC
    `;

    const result = await query(sql, params);

    let customers = result.rows.map((row) => {
      const opening = toDecimal(row.opening_balance);
      const creditPurchases = toDecimal(row.total_credit_purchases);
      const payments = toDecimal(row.total_payments);
      const outstanding = opening.plus(creditPurchases).minus(payments);

      return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        address: row.address,
        openingBalance: formatMoney(opening),
        totalCreditPurchases: formatMoney(creditPurchases),
        totalPaymentsReceived: formatMoney(payments),
        outstandingBalance: formatMoney(outstanding),
        lastTransactionDate: row.last_txn_date,
        accountStatus: row.account_status,
        notes: row.notes,
        createdAt: row.created_at,
      };
    });

    if (balanceFilter === 'has_balance') {
      customers = customers.filter((c) => c.outstandingBalance > 0);
    } else if (balanceFilter === 'settled') {
      customers = customers.filter((c) => c.outstandingBalance <= 0);
    }

    res.json({ success: true, data: customers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Add customer (with duplicate warning check)
router.post('/customers', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, phone, address, openingBalance, notes, checkDuplicateOnly } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: 'Customer name is required.' });
      return;
    }

    const trimmedName = name.trim();
    const trimmedPhone = phone ? phone.trim() : null;

    // Check duplicate
    let duplicateCheckSql = 'SELECT id, name, phone FROM customers WHERE LOWER(name) = LOWER($1)';
    const dupParams: any[] = [trimmedName];

    if (trimmedPhone) {
      dupParams.push(trimmedPhone);
      duplicateCheckSql += ' OR phone = $2';
    }

    const dupRes = await query(duplicateCheckSql, dupParams);

    if (checkDuplicateOnly) {
      res.json({
        success: true,
        isDuplicate: dupRes.rows.length > 0,
        matches: dupRes.rows,
      });
      return;
    }

    const initialBal = openingBalance ? toDecimal(openingBalance).toNumber() : 0;

    const result = await query(
      `INSERT INTO customers (name, phone, address, opening_balance, notes, account_status)
       VALUES ($1, $2, $3, $4, $5, 'Active')
       RETURNING *`,
      [trimmedName, trimmedPhone, address || null, initialBal, notes || null]
    );

    const newCustomer = result.rows[0];

    await logAudit({
      userId: req.user!.id,
      userName: req.user!.fullName,
      action: 'CUSTOMER_CREATED',
      module: 'CUSTOMER_KATHA',
      recordType: 'customer',
      recordId: newCustomer.id,
      newValues: newCustomer,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: newCustomer,
      duplicateWarning: dupRes.rows.length > 0 ? 'Customer with similar name or phone already exists.' : null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Get single customer details with full Katha ledger
router.get('/customers/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { startDate, endDate } = req.query;

    const custRes = await query('SELECT * FROM customers WHERE id = $1', [id]);
    if (custRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Customer not found.' });
      return;
    }
    const customer = custRes.rows[0];
    const openingBal = toDecimal(customer.opening_balance);

    // Fetch customer bills
    const billsRes = await query(
      'SELECT * FROM customer_bills WHERE customer_id = $1 ORDER BY bill_date ASC, id ASC',
      [id]
    );

    // Fetch customer payments
    const paymentsRes = await query(
      'SELECT * FROM customer_payments WHERE customer_id = $1 ORDER BY payment_date ASC, id ASC',
      [id]
    );

    interface KathaLedgerItem {
      id: string;
      date: string;
      description: string;
      type: 'debit' | 'credit';
      weightKg?: number;
      pricePerKg?: number;
      billNumber?: string;
      debitAmount: number; // Debit increases debt (credit purchase)
      creditAmount: number; // Credit decreases debt (payment made)
      paymentMethod?: string;
      reference?: string;
      screenshotUrl?: string;
      runningBalance: number;
      rawCreatedAt: Date;
    }

    const items: {
      date: string;
      type: 'bill' | 'payment';
      record: any;
      createdAt: Date;
    }[] = [];

    billsRes.rows.forEach((b) => {
      items.push({
        date: b.bill_date instanceof Date ? b.bill_date.toISOString().split('T')[0] : String(b.bill_date),
        type: 'bill',
        record: b,
        createdAt: new Date(b.created_at),
      });
    });

    paymentsRes.rows.forEach((p) => {
      items.push({
        date: p.payment_date instanceof Date ? p.payment_date.toISOString().split('T')[0] : String(p.payment_date),
        type: 'payment',
        record: p,
        createdAt: new Date(p.created_at),
      });
    });

    // Chronological sort
    items.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    let currentBalance = openingBal;
    const ledger: KathaLedgerItem[] = [];

    for (const item of items) {
      if (item.type === 'bill') {
        const b = item.record;
        let creditPurchaseAmount = new Decimal(0);

        if (b.payment_type === 'Pay Later') {
          creditPurchaseAmount = toDecimal(b.total_amount);
        } else if (b.payment_type === 'Partial') {
          creditPurchaseAmount = toDecimal(b.total_amount).minus(toDecimal(b.paid_amount));
        }

        // If it was "Pay Now", debt doesn't increase (debit is 0)
        currentBalance = currentBalance.plus(creditPurchaseAmount);

        const itemDetailsDesc = b.description
          ? `Bill #${b.bill_number}: ${b.description} (${b.payment_type})`
          : `Chicken Purchase (${b.weight_kg} kg @ ₹${b.price_per_kg}/kg) - ${b.payment_type}`;

        ledger.push({
          id: `BILL-${b.id}`,
          date: item.date,
          description: itemDetailsDesc,
          type: 'debit',
          weightKg: formatWeight(b.weight_kg),
          pricePerKg: formatMoney(b.price_per_kg),
          billNumber: b.bill_number,
          debitAmount: formatMoney(creditPurchaseAmount),
          creditAmount: 0,
          paymentMethod: b.payment_method,
          runningBalance: formatMoney(currentBalance),
          rawCreatedAt: item.createdAt,
        });
      } else {
        const p = item.record;
        const payAmount = toDecimal(p.amount);
        currentBalance = currentBalance.minus(payAmount);

        ledger.push({
          id: `PAY-${p.id}`,
          date: item.date,
          description: `Customer Payment Received (${p.payment_method})`,
          type: 'credit',
          debitAmount: 0,
          creditAmount: formatMoney(payAmount),
          paymentMethod: p.payment_method,
          reference: p.transaction_reference,
          screenshotUrl: p.screenshot_url,
          runningBalance: formatMoney(currentBalance),
          rawCreatedAt: item.createdAt,
        });
      }
    }

    let filteredLedger = ledger;
    if (startDate && typeof startDate === 'string') {
      filteredLedger = filteredLedger.filter((l) => l.date >= startDate);
    }
    if (endDate && typeof endDate === 'string') {
      filteredLedger = filteredLedger.filter((l) => l.date <= endDate);
    }

    res.json({
      success: true,
      data: {
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          openingBalance: formatMoney(openingBal),
          notes: customer.notes,
          accountStatus: customer.account_status,
          createdAt: customer.created_at,
          outstandingBalance: formatMoney(currentBalance),
        },
        ledger: filteredLedger,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Update customer
router.put('/customers/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, phone, address, notes, accountStatus, openingBalance } = req.body;

    const prevRes = await query('SELECT * FROM customers WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Customer not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    const updated = await query(
      `UPDATE customers
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           address = COALESCE($3, address),
           notes = COALESCE($4, notes),
           account_status = COALESCE($5, account_status),
           opening_balance = COALESCE($6, opening_balance),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        name !== undefined ? name.trim() : null,
        phone !== undefined ? phone : null,
        address !== undefined ? address : null,
        notes !== undefined ? notes : null,
        accountStatus !== undefined ? accountStatus : null,
        openingBalance !== undefined ? toDecimal(openingBalance).toNumber() : null,
        id,
      ]
    );

    await logAudit({
      userId: req.user!.id,
      userName: req.user!.fullName,
      action: 'CUSTOMER_UPDATED',
      module: 'CUSTOMER_KATHA',
      recordType: 'customer',
      recordId: id,
      previousValues: prev,
      newValues: updated.rows[0],
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4.1 Delete customer permanently
router.delete('/customers/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const reason = req.body?.reason || req.query?.reason || 'Permanently deleted by user';

    const prevRes = await query('SELECT * FROM customers WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Customer not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    await withTransaction(async (client) => {
      // 1. Delete linked chicken sales for customer's bills
      await client.query(
        `DELETE FROM chicken_sales 
         WHERE customer_bill_id IN (SELECT id FROM customer_bills WHERE customer_id = $1)`,
        [id]
      );

      // 2. Delete customer's bills
      await client.query('DELETE FROM customer_bills WHERE customer_id = $1', [id]);

      // 3. Delete customer's payments
      await client.query('DELETE FROM customer_payments WHERE customer_id = $1', [id]);

      // 4. Delete customer record permanently
      await client.query('DELETE FROM customers WHERE id = $1', [id]);

      // 5. Log audit
      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'CUSTOMER_DELETED_PERMANENTLY',
          module: 'CUSTOMER_KATHA',
          recordType: 'customer',
          recordId: id,
          previousValues: prev,
          reason: String(reason),
          ipAddress: req.ip,
        },
        client
      );
    });

    res.json({ success: true, message: `Customer "${prev.name}" deleted permanently.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Create Customer Bill (Pay Now or Pay Later)
router.post('/bills', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      customerId,
      billDate,
      weightKg,
      pricePerKg,
      paymentType,
      paidAmount,
      paymentMethod,
      description,
      items,
    } = req.body;

    if (!billDate || !paymentType) {
      res.status(400).json({
        success: false,
        error: 'Bill Date and Payment Type are required.',
      });
      return;
    }

    let parsedItems: {
      name: string;
      unit: string;
      quantity: number;
      rate: number;
      amount: number;
    }[] = [];

    let totalAmount = new Decimal(0);
    let totalMeatWeight = new Decimal(0);
    let totalMeatAmount = new Decimal(0);

    if (Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        const q = toDecimal(it.quantity || 0);
        const r = toDecimal(it.rate || 0);
        if (q.lte(0) || r.lt(0)) continue;
        const lineAmt = multiply(q, r);
        totalAmount = add(totalAmount, lineAmt);

        const name = String(it.name || 'Chicken Fresh Cut').trim();
        const unit = String(it.unit || 'kg').trim();
        const isMeat = unit === 'kg' || ['Skinless', 'Dressed', 'Boneless', 'Liver', 'Natukodi'].includes(name);
        if (isMeat) {
          totalMeatWeight = add(totalMeatWeight, q);
          totalMeatAmount = add(totalMeatAmount, lineAmt);
        }

        parsedItems.push({
          name,
          unit,
          quantity: q.toNumber(),
          rate: r.toNumber(),
          amount: lineAmt.toNumber(),
        });
      }
    } else if (weightKg !== undefined && pricePerKg !== undefined) {
      const weight = toDecimal(weightKg);
      const price = toDecimal(pricePerKg);
      if (weight.gt(0) && price.gte(0)) {
        const lineAmt = multiply(weight, price);
        totalAmount = lineAmt;
        totalMeatWeight = weight;
        totalMeatAmount = lineAmt;
        parsedItems.push({
          name: 'Chicken Fresh Cut',
          unit: 'kg',
          quantity: weight.toNumber(),
          rate: price.toNumber(),
          amount: lineAmt.toNumber(),
        });
      }
    }

    if (parsedItems.length === 0 || totalAmount.lte(0)) {
      res.status(400).json({
        success: false,
        error: 'Please add at least one item with a valid quantity and price.',
      });
      return;
    }

    const effectivePricePerKg = totalMeatWeight.gt(0)
      ? totalMeatAmount.dividedBy(totalMeatWeight).toDecimalPlaces(2)
      : new Decimal(0);

    const itemsSummary = parsedItems
      .map((it) => `${it.name}: ${it.quantity} ${it.unit} @ ₹${it.rate}`)
      .join(', ');
    const finalDescription = description && description.trim()
      ? `${description.trim()} | ${itemsSummary}`
      : itemsSummary;

    let actualPaid = new Decimal(0);
    let paymentStatus: 'Paid' | 'Unpaid' | 'Partially Paid' = 'Unpaid';

    if (paymentType === 'Pay Now') {
      actualPaid = totalAmount;
      paymentStatus = 'Paid';
    } else if (paymentType === 'Partial') {
      actualPaid = toDecimal(paidAmount);
      if (actualPaid.gte(totalAmount)) {
        paymentStatus = 'Paid';
        actualPaid = totalAmount;
      } else if (actualPaid.gt(0)) {
        paymentStatus = 'Partially Paid';
      } else {
        paymentStatus = 'Unpaid';
      }
    } else {
      // Pay Later
      actualPaid = new Decimal(0);
      paymentStatus = 'Unpaid';
      if (!customerId) {
        res.status(400).json({
          success: false,
          error: 'Customer selection is mandatory for Pay Later / Credit bills.',
        });
        return;
      }
    }

    const billNumber = await generateBillNumber(billDate);

    const newBill = await withTransaction(async (client) => {
      // 1. Insert customer bill with items
      const billRes = await client.query(
        `INSERT INTO customer_bills (
          bill_number, customer_id, bill_date, weight_kg, price_per_kg, total_amount,
          payment_type, paid_amount, payment_method, payment_status, description, items, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          billNumber,
          customerId || null,
          billDate,
          totalMeatWeight.toNumber(),
          effectivePricePerKg.toNumber(),
          totalAmount.toNumber(),
          paymentType,
          actualPaid.toNumber(),
          paymentMethod || 'Cash',
          paymentStatus,
          finalDescription,
          JSON.stringify(parsedItems),
          req.user!.id,
        ]
      );
      const bill = billRes.rows[0];

      // 2. Also register individual chicken sale record for sales reconciliation if meat was sold
      if (totalMeatWeight.gt(0)) {
        await client.query(
          `INSERT INTO chicken_sales (
            sale_date, weight_sold_kg, price_per_kg, total_amount, payment_method, notes, customer_bill_id, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            billDate,
            totalMeatWeight.toNumber(),
            effectivePricePerKg.toNumber(),
            totalMeatAmount.toNumber(),
            paymentType === 'Pay Later' ? 'Katha' : paymentMethod || 'Cash',
            `Customer Bill #${billNumber} (${itemsSummary})`,
            bill.id,
            req.user!.id,
          ]
        );
      }

      // 3. Log audit
      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'CUSTOMER_BILL_CREATED',
          module: 'CUSTOMER_KATHA',
          recordType: 'customer_bill',
          recordId: bill.id,
          newValues: bill,
          ipAddress: req.ip,
        },
        client
      );

      return bill;
    });

    res.status(201).json({ success: true, data: newBill });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. List Customer Bills
router.get('/bills/all', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { customerId, startDate, endDate, date, paymentStatus } = req.query;

    let sql = `
      SELECT b.*, c.name AS customer_name, c.phone AS customer_phone, u.full_name AS created_by_name
      FROM customer_bills b
      LEFT JOIN customers c ON b.customer_id = c.id
      LEFT JOIN users u ON b.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (customerId) {
      params.push(parseInt(String(customerId), 10));
      sql += ` AND b.customer_id = $${params.length}`;
    }
    if (date) {
      params.push(date);
      sql += ` AND b.bill_date = $${params.length}`;
    }
    if (startDate) {
      params.push(startDate);
      sql += ` AND b.bill_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      sql += ` AND b.bill_date <= $${params.length}`;
    }
    if (paymentStatus && paymentStatus !== 'All') {
      params.push(paymentStatus);
      sql += ` AND b.payment_status = $${params.length}`;
    }

    sql += ' ORDER BY b.bill_date DESC, b.id DESC';

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Edit Customer Bill (with mandatory reason and audit log)
router.put('/bills/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { weightKg, pricePerKg, reason, description, items } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, error: 'A mandatory reason is required to edit a customer bill.' });
      return;
    }

    const prevRes = await query('SELECT * FROM customer_bills WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Bill not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    let newTotal = toDecimal(prev.total_amount);
    let newWeight = toDecimal(prev.weight_kg);
    let newPrice = toDecimal(prev.price_per_kg);
    let updatedItemsJson = prev.items;

    if (Array.isArray(items) && items.length > 0) {
      let sumAmt = new Decimal(0);
      let sumMeat = new Decimal(0);
      let sumMeatAmt = new Decimal(0);
      const cleanItems: any[] = [];
      for (const it of items) {
        const q = toDecimal(it.quantity || 0);
        const r = toDecimal(it.rate || 0);
        if (q.lte(0) || r.lt(0)) continue;
        const line = multiply(q, r);
        sumAmt = add(sumAmt, line);
        const unit = String(it.unit || 'kg').trim();
        const name = String(it.name || '').trim();
        if (unit === 'kg' || ['Skinless', 'Dressed', 'Boneless', 'Liver', 'Natukodi'].includes(name)) {
          sumMeat = add(sumMeat, q);
          sumMeatAmt = add(sumMeatAmt, line);
        }
        cleanItems.push({
          name,
          unit,
          quantity: q.toNumber(),
          rate: r.toNumber(),
          amount: line.toNumber(),
        });
      }
      if (cleanItems.length > 0) {
        newTotal = sumAmt;
        newWeight = sumMeat;
        newPrice = sumMeat.gt(0) ? sumMeatAmt.dividedBy(sumMeat).toDecimalPlaces(2) : new Decimal(0);
        updatedItemsJson = JSON.stringify(cleanItems);
      }
    } else {
      if (weightKg !== undefined) newWeight = toDecimal(weightKg);
      if (pricePerKg !== undefined) newPrice = toDecimal(pricePerKg);
      newTotal = multiply(newWeight, newPrice);
    }

    const updated = await withTransaction(async (client) => {
      const upRes = await client.query(
        `UPDATE customer_bills
         SET weight_kg = $1,
             price_per_kg = $2,
             total_amount = $3,
             description = COALESCE($4, description),
             items = COALESCE($5, items),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [newWeight.toNumber(), newPrice.toNumber(), newTotal.toNumber(), description !== undefined ? description : null, updatedItemsJson, id]
      );

      // Also update linked chicken sale
      await client.query(
        `UPDATE chicken_sales
         SET weight_sold_kg = $1,
             price_per_kg = $2,
             total_amount = $3
         WHERE customer_bill_id = $4`,
        [newWeight.toNumber(), newPrice.toNumber(), newTotal.toNumber(), id]
      );

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'CUSTOMER_BILL_EDITED',
          module: 'CUSTOMER_KATHA',
          recordType: 'customer_bill',
          recordId: id,
          previousValues: prev,
          newValues: upRes.rows[0],
          reason,
          ipAddress: req.ip,
        },
        client
      );

      return upRes.rows[0];
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7.1 Delete Customer Bill (with audit logging and linked chicken sale cleanup)
router.delete('/bills/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const reason = req.body?.reason || req.query?.reason || 'Deleted by user from POS Counter';

    const prevRes = await query('SELECT * FROM customer_bills WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Customer bill not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    await withTransaction(async (client) => {
      // 1. Delete linked chicken sales record
      await client.query('DELETE FROM chicken_sales WHERE customer_bill_id = $1', [id]);

      // 2. Delete customer bill
      await client.query('DELETE FROM customer_bills WHERE id = $1', [id]);

      // 3. Log audit
      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'CUSTOMER_BILL_DELETED',
          module: 'CUSTOMER_KATHA',
          recordType: 'customer_bill',
          recordId: id,
          previousValues: prev,
          reason: String(reason),
          ipAddress: req.ip,
        },
        client
      );
    });

    res.json({ success: true, message: `Bill #${prev.bill_number} deleted successfully.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Record Customer Payment against Katha
router.post('/payments', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { customerId, paymentDate, amount, paymentMethod, transactionReference, screenshotUrl, notes } = req.body;

    if (!customerId || !paymentDate || !amount || !paymentMethod) {
      res.status(400).json({
        success: false,
        error: 'Customer ID, Payment Date, Amount, and Payment Method are required.',
      });
      return;
    }

    const payAmount = toDecimal(amount);
    if (payAmount.lte(0)) {
      res.status(400).json({ success: false, error: 'Payment amount must be greater than zero.' });
      return;
    }

    const custRes = await query('SELECT * FROM customers WHERE id = $1', [customerId]);
    if (custRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Customer not found.' });
      return;
    }

    const newPayment = await withTransaction(async (client) => {
      const pRes = await client.query(
        `INSERT INTO customer_payments (
          customer_id, payment_date, amount, payment_method, transaction_reference, screenshot_url, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          customerId,
          paymentDate,
          payAmount.toNumber(),
          paymentMethod,
          transactionReference || null,
          screenshotUrl || null,
          notes || null,
          req.user!.id,
        ]
      );
      const payment = pRes.rows[0];

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'CUSTOMER_PAYMENT_RECORDED',
          module: 'CUSTOMER_KATHA',
          recordType: 'customer_payment',
          recordId: payment.id,
          newValues: payment,
          ipAddress: req.ip,
        },
        client
      );

      return payment;
    });

    res.status(201).json({ success: true, data: newPayment });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Reverse / Delete Customer Payment (Owner/Admin only)
router.delete('/payments/:id', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, error: 'A mandatory reason is required to reverse a customer payment.' });
      return;
    }

    const prevRes = await query('SELECT * FROM customer_payments WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Payment record not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    await withTransaction(async (client) => {
      await client.query('DELETE FROM customer_payments WHERE id = $1', [id]);
      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'CUSTOMER_PAYMENT_REVERSED',
          module: 'CUSTOMER_KATHA',
          recordType: 'customer_payment',
          recordId: id,
          previousValues: prev,
          reason,
          ipAddress: req.ip,
        },
        client
      );
    });

    res.json({ success: true, message: 'Customer payment reversed successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. List customer payments
router.get('/payments/all', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { customerId, startDate, endDate, date } = req.query;

    let sql = `
      SELECT p.*, c.name AS customer_name, c.phone AS customer_phone, u.full_name AS created_by_name
      FROM customer_payments p
      JOIN customers c ON p.customer_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (customerId) {
      params.push(parseInt(String(customerId), 10));
      sql += ` AND p.customer_id = $${params.length}`;
    }
    if (date) {
      params.push(date);
      sql += ` AND p.payment_date = $${params.length}`;
    }
    if (startDate) {
      params.push(startDate);
      sql += ` AND p.payment_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      sql += ` AND p.payment_date <= $${params.length}`;
    }

    sql += ' ORDER BY p.payment_date DESC, p.id DESC';

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
