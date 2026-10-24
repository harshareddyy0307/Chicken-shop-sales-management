import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { Decimal, toDecimal, formatMoney, formatWeight, multiply, add, subtract } from '../utils/decimal';
import { upload } from '../middleware/upload';

const router = Router();

// 1. List all distributors with summarized totals & current outstanding balances
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, activeOnly } = req.query;

    let filterSql = 'WHERE 1=1';
    const params: any[] = [];

    if (activeOnly === 'true') {
      filterSql += ' AND d.is_active = true';
    }

    if (search && typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim()}%`);
      filterSql += ` AND (d.name ILIKE $${params.length} OR d.phone ILIKE $${params.length})`;
    }

    const sql = `
      SELECT 
        d.id, d.name, d.phone, d.address, d.opening_balance, d.notes, d.is_active, d.created_at,
        COALESCE(SUM(s.total_amount), 0) AS total_supplies_amount,
        COALESCE(SUM(s.weight_kg), 0) AS total_weight_purchased,
        COALESCE(p.total_payments, 0) AS total_payments_amount
      FROM distributors d
      LEFT JOIN distributor_supplies s ON d.id = s.distributor_id
      LEFT JOIN (
        SELECT distributor_id, SUM(amount) AS total_payments
        FROM distributor_payments
        GROUP BY distributor_id
      ) p ON d.id = p.distributor_id
      ${filterSql}
      GROUP BY d.id, p.total_payments
      ORDER BY d.name ASC
    `;

    const result = await query(sql, params);

    const distributors = result.rows.map((row) => {
      const opening = toDecimal(row.opening_balance);
      const supplies = toDecimal(row.total_supplies_amount);
      const payments = toDecimal(row.total_payments_amount);
      const outstanding = opening.plus(supplies).minus(payments);

      return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        address: row.address,
        openingBalance: formatMoney(opening),
        totalSuppliesAmount: formatMoney(supplies),
        totalWeightPurchased: formatWeight(row.total_weight_purchased),
        totalPaymentsAmount: formatMoney(payments),
        outstandingBalance: formatMoney(outstanding),
        notes: row.notes,
        isActive: row.is_active,
        createdAt: row.created_at,
      };
    });

    res.json({ success: true, data: distributors });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Add new distributor
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, phone, address, openingBalance, notes } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: 'Distributor name is required.' });
      return;
    }

    const initialBal = openingBalance ? toDecimal(openingBalance).toNumber() : 0;

    const result = await query(
      `INSERT INTO distributors (name, phone, address, opening_balance, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), phone || null, address || null, initialBal, notes || null]
    );

    const dist = result.rows[0];

    await logAudit({
      userId: req.user!.id,
      userName: req.user!.fullName,
      action: 'DISTRIBUTOR_CREATED',
      module: 'DISTRIBUTORS',
      recordType: 'distributor',
      recordId: dist.id,
      newValues: dist,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: dist });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Get single distributor details and complete running ledger
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { startDate, endDate } = req.query;

    const distRes = await query('SELECT * FROM distributors WHERE id = $1', [id]);
    if (distRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Distributor not found.' });
      return;
    }
    const dist = distRes.rows[0];
    const openingBal = toDecimal(dist.opening_balance);

    // Fetch all supplies and payments chronologically
    const suppliesRes = await query(
      'SELECT id, supply_date, weight_kg, price_per_kg, total_amount, invoice_number, notes, created_at FROM distributor_supplies WHERE distributor_id = $1 ORDER BY supply_date ASC, id ASC',
      [id]
    );

    const paymentsRes = await query(
      'SELECT id, payment_date, amount, payment_method, transaction_reference, screenshot_url, notes, is_advance, created_at FROM distributor_payments WHERE distributor_id = $1 ORDER BY payment_date ASC, id ASC',
      [id]
    );

    // Build unified chronological ledger
    interface LedgerItem {
      id: string;
      date: string;
      type: 'supply' | 'payment';
      description: string;
      weightKg?: number;
      pricePerKg?: number;
      debitAmount: number; // supplies increase debt (payable)
      creditAmount: number; // payments decrease debt
      paymentMethod?: string;
      reference?: string;
      screenshotUrl?: string;
      runningBalance: number;
      rawCreatedAt: Date;
    }

    const items: {
      date: string;
      type: 'supply' | 'payment';
      record: any;
      createdAt: Date;
    }[] = [];

    suppliesRes.rows.forEach((s) => {
      items.push({
        date: s.supply_date instanceof Date ? s.supply_date.toISOString().split('T')[0] : String(s.supply_date),
        type: 'supply',
        record: s,
        createdAt: new Date(s.created_at),
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

    // Sort chronologically
    items.sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    let currentBalance = openingBal;
    const ledger: LedgerItem[] = [];

    for (const item of items) {
      if (item.type === 'supply') {
        const amt = toDecimal(item.record.total_amount);
        currentBalance = currentBalance.plus(amt);
        ledger.push({
          id: `SUP-${item.record.id}`,
          date: item.date,
          type: 'supply',
          description: `Chicken Supply: ${item.record.weight_kg} kg @ ₹${item.record.price_per_kg}/kg`,
          weightKg: formatWeight(item.record.weight_kg),
          pricePerKg: formatMoney(item.record.price_per_kg),
          debitAmount: formatMoney(amt),
          creditAmount: 0,
          reference: item.record.invoice_number,
          runningBalance: formatMoney(currentBalance),
          rawCreatedAt: item.createdAt,
        });
      } else {
        const amt = toDecimal(item.record.amount);
        currentBalance = currentBalance.minus(amt);
        ledger.push({
          id: `PAY-${item.record.id}`,
          date: item.date,
          type: 'payment',
          description: `Payment to Distributor (${item.record.payment_method})${item.record.is_advance ? ' [Advance]' : ''}`,
          debitAmount: 0,
          creditAmount: formatMoney(amt),
          paymentMethod: item.record.payment_method,
          reference: item.record.transaction_reference,
          screenshotUrl: item.record.screenshot_url,
          runningBalance: formatMoney(currentBalance),
          rawCreatedAt: item.createdAt,
        });
      }
    }

    // Filter by date if requested
    let filteredLedger = ledger;
    if (startDate && typeof startDate === 'string') {
      filteredLedger = filteredLedger.filter((l) => l.date >= startDate);
    }
    if (endDate && typeof endDate === 'string') {
      filteredLedger = filteredLedger.filter((l) => l.date <= endDate);
    }

    const totalSupplies = suppliesRes.rows.reduce((sum, s) => sum.plus(toDecimal(s.total_amount)), new Decimal(0));
    const totalPayments = paymentsRes.rows.reduce((sum, p) => sum.plus(toDecimal(p.amount)), new Decimal(0));

    res.json({
      success: true,
      data: {
        distributor: {
          id: dist.id,
          name: dist.name,
          phone: dist.phone,
          address: dist.address,
          openingBalance: formatMoney(openingBal),
          notes: dist.notes,
          isActive: dist.is_active,
          createdAt: dist.created_at,
          totalSuppliesAmount: formatMoney(totalSupplies),
          totalPaymentsAmount: formatMoney(totalPayments),
          outstandingBalance: formatMoney(currentBalance),
        },
        ledger: filteredLedger,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Update distributor
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, phone, address, notes, isActive, openingBalance } = req.body;

    const prevRes = await query('SELECT * FROM distributors WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Distributor not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    const updated = await query(
      `UPDATE distributors
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           address = COALESCE($3, address),
           notes = COALESCE($4, notes),
           is_active = COALESCE($5, is_active),
           opening_balance = COALESCE($6, opening_balance),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [
        name !== undefined ? name.trim() : null,
        phone !== undefined ? phone : null,
        address !== undefined ? address : null,
        notes !== undefined ? notes : null,
        isActive !== undefined ? isActive : null,
        openingBalance !== undefined ? toDecimal(openingBalance).toNumber() : null,
        id,
      ]
    );

    await logAudit({
      userId: req.user!.id,
      userName: req.user!.fullName,
      action: 'DISTRIBUTOR_UPDATED',
      module: 'DISTRIBUTORS',
      recordType: 'distributor',
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

// 4b. Permanently Delete Distributor
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body || {};

    const prevRes = await query('SELECT * FROM distributors WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Distributor not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    await withTransaction(async (client) => {
      // 1. Unlink daily_closing_purchases so historic daily closings remain intact with supplier name preserved
      await client.query(
        `UPDATE daily_closing_purchases 
         SET distributor_id = NULL, distributor_supply_id = NULL 
         WHERE distributor_id = $1 OR distributor_supply_id IN (SELECT id FROM distributor_supplies WHERE distributor_id = $1)`,
        [id]
      );

      // 2. Delete distributor's supplies
      await client.query('DELETE FROM distributor_supplies WHERE distributor_id = $1', [id]);

      // 3. Delete distributor's payments
      await client.query('DELETE FROM distributor_payments WHERE distributor_id = $1', [id]);

      // 4. Delete distributor record permanently
      await client.query('DELETE FROM distributors WHERE id = $1', [id]);

      // 5. Log audit
      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'DISTRIBUTOR_DELETED_PERMANENTLY',
          module: 'DISTRIBUTORS',
          recordType: 'distributor',
          recordId: id,
          previousValues: prev,
          reason: String(reason || 'Permanent deletion of distributor profile'),
          ipAddress: req.ip,
        },
        client
      );
    });

    res.json({ success: true, message: `Distributor "${prev.name}" deleted permanently.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. List supplies with optional filters
router.get('/supplies/all', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { distributorId, startDate, endDate, date } = req.query;
    let sql = `
      SELECT s.*, d.name AS distributor_name, d.phone AS distributor_phone, u.full_name AS created_by_name
      FROM distributor_supplies s
      JOIN distributors d ON s.distributor_id = d.id
      LEFT JOIN users u ON s.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (distributorId) {
      params.push(parseInt(String(distributorId), 10));
      sql += ` AND s.distributor_id = $${params.length}`;
    }
    if (date) {
      params.push(date);
      sql += ` AND s.supply_date = $${params.length}`;
    }
    if (startDate) {
      params.push(startDate);
      sql += ` AND s.supply_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      sql += ` AND s.supply_date <= $${params.length}`;
    }

    sql += ' ORDER BY s.supply_date DESC, s.id DESC';

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Record New Distributor Supply (links to inventory & creates financial payable)
router.post('/supplies', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { distributorId, supplyDate, weightKg, pricePerKg, invoiceNumber, notes } = req.body;

    if (!distributorId || !supplyDate || !weightKg || !pricePerKg) {
      res.status(400).json({
        success: false,
        error: 'Distributor ID, Supply Date, Weight (kg), and Price per kg are required.',
      });
      return;
    }

    const weight = toDecimal(weightKg);
    const price = toDecimal(pricePerKg);

    if (weight.lte(0)) {
      res.status(400).json({ success: false, error: 'Weight must be greater than zero.' });
      return;
    }
    if (price.lt(0)) {
      res.status(400).json({ success: false, error: 'Price per kg cannot be negative.' });
      return;
    }

    const totalAmount = multiply(weight, price);

    const supply = await withTransaction(async (client) => {
      // 1. Insert supply record
      const supRes = await client.query(
        `INSERT INTO distributor_supplies (
          distributor_id, supply_date, weight_kg, price_per_kg, total_amount, invoice_number, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          distributorId,
          supplyDate,
          weight.toNumber(),
          price.toNumber(),
          totalAmount.toNumber(),
          invoiceNumber || null,
          notes || null,
          req.user!.id,
        ]
      );
      const newSupply = supRes.rows[0];

      // 2. Insert inventory incoming transaction
      await client.query(
        `INSERT INTO inventory_transactions (
          txn_date, txn_type, weight_kg, cost_per_kg, reference_module, reference_id, reason, created_by
        ) VALUES ($1, 'supply_in', $2, $3, 'distributor_supplies', $4, $5, $6)`,
        [
          supplyDate,
          weight.toNumber(),
          price.toNumber(),
          newSupply.id,
          `Delivery from distributor #${distributorId}`,
          req.user!.id,
        ]
      );

      // 3. Log audit
      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'DISTRIBUTOR_SUPPLY_ADDED',
          module: 'DISTRIBUTOR_SUPPLIES',
          recordType: 'distributor_supply',
          recordId: newSupply.id,
          newValues: newSupply,
          ipAddress: req.ip,
        },
        client
      );

      return newSupply;
    });

    res.status(201).json({ success: true, data: supply });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Edit Distributor Supply
router.put('/supplies/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { weightKg, pricePerKg, supplyDate, invoiceNumber, notes, reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, error: 'A reason for editing the supply is required.' });
      return;
    }

    const prevRes = await query('SELECT * FROM distributor_supplies WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Supply record not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    const weight = weightKg !== undefined ? toDecimal(weightKg) : toDecimal(prev.weight_kg);
    const price = pricePerKg !== undefined ? toDecimal(pricePerKg) : toDecimal(prev.price_per_kg);
    const date = supplyDate || prev.supply_date;
    const totalAmount = multiply(weight, price);

    const updated = await withTransaction(async (client) => {
      const upRes = await client.query(
        `UPDATE distributor_supplies
         SET weight_kg = $1,
             price_per_kg = $2,
             total_amount = $3,
             supply_date = $4,
             invoice_number = COALESCE($5, invoice_number),
             notes = COALESCE($6, notes),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7
         RETURNING *`,
        [
          weight.toNumber(),
          price.toNumber(),
          totalAmount.toNumber(),
          date,
          invoiceNumber !== undefined ? invoiceNumber : null,
          notes !== undefined ? notes : null,
          id,
        ]
      );

      // Update corresponding inventory transaction
      await client.query(
        `UPDATE inventory_transactions
         SET weight_kg = $1,
             cost_per_kg = $2,
             txn_date = $3
         WHERE reference_module = 'distributor_supplies' AND reference_id = $4`,
        [weight.toNumber(), price.toNumber(), date, id]
      );

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'DISTRIBUTOR_SUPPLY_EDITED',
          module: 'DISTRIBUTOR_SUPPLIES',
          recordType: 'distributor_supply',
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

// 8. Delete Distributor Supply (Owner/Admin only)
router.delete('/supplies/:id', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, error: 'A reason for deleting the supply is required.' });
      return;
    }

    const prevRes = await query('SELECT * FROM distributor_supplies WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Supply record not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    await withTransaction(async (client) => {
      // Delete inventory movement
      await client.query(
        "DELETE FROM inventory_transactions WHERE reference_module = 'distributor_supplies' AND reference_id = $1",
        [id]
      );

      // Delete supply
      await client.query('DELETE FROM distributor_supplies WHERE id = $1', [id]);

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'DISTRIBUTOR_SUPPLY_DELETED',
          module: 'DISTRIBUTOR_SUPPLIES',
          recordType: 'distributor_supply',
          recordId: id,
          previousValues: prev,
          reason,
          ipAddress: req.ip,
        },
        client
      );
    });

    res.json({ success: true, message: 'Distributor supply deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. List distributor payments
router.get('/payments/all', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { distributorId, startDate, endDate, date } = req.query;
    let sql = `
      SELECT p.*, d.name AS distributor_name, u.full_name AS created_by_name
      FROM distributor_payments p
      JOIN distributors d ON p.distributor_id = d.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (distributorId) {
      params.push(parseInt(String(distributorId), 10));
      sql += ` AND p.distributor_id = $${params.length}`;
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

// 10. Record Distributor Payment (supports partial, advance, screenshots)
router.post('/payments', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { distributorId, paymentDate, amount, paymentMethod, transactionReference, screenshotUrl, notes, isAdvance } =
      req.body;

    if (!distributorId || !paymentDate || !amount || !paymentMethod) {
      res.status(400).json({
        success: false,
        error: 'Distributor ID, Payment Date, Amount, and Payment Method are required.',
      });
      return;
    }

    const payAmount = toDecimal(amount);
    if (payAmount.lte(0)) {
      res.status(400).json({ success: false, error: 'Payment amount must be greater than zero.' });
      return;
    }

    // Check outstanding balance
    const distRes = await query('SELECT * FROM distributors WHERE id = $1', [distributorId]);
    if (distRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Distributor not found.' });
      return;
    }

    const dist = distRes.rows[0];
    const suppliesRes = await query(
      'SELECT COALESCE(SUM(total_amount), 0) AS total FROM distributor_supplies WHERE distributor_id = $1',
      [distributorId]
    );
    const paymentsRes = await query(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM distributor_payments WHERE distributor_id = $1',
      [distributorId]
    );

    const opening = toDecimal(dist.opening_balance);
    const totalSupplies = toDecimal(suppliesRes.rows[0].total);
    const totalPaid = toDecimal(paymentsRes.rows[0].total);
    const currentOutstanding = opening.plus(totalSupplies).minus(totalPaid);

    const advanceFlag = Boolean(isAdvance);

    // Rule: Do not allow payment greater than outstanding balance unless explicitly recorded as advance!
    if (payAmount.gt(currentOutstanding) && !advanceFlag) {
      res.status(400).json({
        success: false,
        error: `Payment amount (₹${payAmount.toFixed(2)}) exceeds current outstanding balance (₹${currentOutstanding.toFixed(2)}). Please check 'Record as Advance Payment' if paying in advance.`,
      });
      return;
    }

    const newPayment = await withTransaction(async (client) => {
      const pRes = await client.query(
        `INSERT INTO distributor_payments (
          distributor_id, payment_date, amount, payment_method, transaction_reference, screenshot_url, notes, is_advance, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          distributorId,
          paymentDate,
          payAmount.toNumber(),
          paymentMethod,
          transactionReference || null,
          screenshotUrl || null,
          notes || null,
          advanceFlag,
          req.user!.id,
        ]
      );
      const payment = pRes.rows[0];

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'DISTRIBUTOR_PAYMENT_RECORDED',
          module: 'DISTRIBUTOR_PAYMENTS',
          recordType: 'distributor_payment',
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

// 11. Reverse / Delete Distributor Payment (Owner/Admin only)
router.delete('/payments/:id', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, error: 'A reason for reversing the payment is required.' });
      return;
    }

    const prevRes = await query('SELECT * FROM distributor_payments WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Payment record not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    await withTransaction(async (client) => {
      await client.query('DELETE FROM distributor_payments WHERE id = $1', [id]);
      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'DISTRIBUTOR_PAYMENT_REVERSED',
          module: 'DISTRIBUTOR_PAYMENTS',
          recordType: 'distributor_payment',
          recordId: id,
          previousValues: prev,
          reason,
          ipAddress: req.ip,
        },
        client
      );
    });

    res.json({ success: true, message: 'Distributor payment reversed successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. Upload payment screenshot
router.post('/upload-screenshot', authenticate, upload.single('screenshot'), (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No file uploaded.' });
    return;
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, fileUrl });
});

export default router;
