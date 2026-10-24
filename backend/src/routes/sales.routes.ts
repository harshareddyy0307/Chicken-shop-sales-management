import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { Decimal, toDecimal, formatMoney, formatWeight, multiply, add, subtract } from '../utils/decimal';

const router = Router();

// 1. List Chicken Sales transactions
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, startDate, endDate, paymentMethod } = req.query;

    let sql = `
      SELECT s.*, u.full_name AS created_by_name, b.bill_number
      FROM chicken_sales s
      LEFT JOIN users u ON s.created_by = u.id
      LEFT JOIN customer_bills b ON s.customer_bill_id = b.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (date) {
      params.push(date);
      sql += ` AND s.sale_date = $${params.length}`;
    }
    if (startDate) {
      params.push(startDate);
      sql += ` AND s.sale_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      sql += ` AND s.sale_date <= $${params.length}`;
    }
    if (paymentMethod && paymentMethod !== 'All') {
      params.push(paymentMethod);
      sql += ` AND s.payment_method = $${params.length}`;
    }

    sql += ' ORDER BY s.sale_date DESC, s.id DESC';

    const result = await query(sql, params);

    // Calculate aggregated summary
    const summary = result.rows.reduce(
      (acc, row) => {
        const weight = toDecimal(row.weight_sold_kg);
        const amount = toDecimal(row.total_amount);
        acc.totalWeight = acc.totalWeight.plus(weight);
        acc.totalRevenue = acc.totalRevenue.plus(amount);

        if (row.payment_method === 'Cash') acc.cashRevenue = acc.cashRevenue.plus(amount);
        else if (row.payment_method === 'UPI') acc.upiRevenue = acc.upiRevenue.plus(amount);
        else if (row.payment_method === 'Card') acc.cardRevenue = acc.cardRevenue.plus(amount);
        else if (row.payment_method === 'Katha') acc.kathaRevenue = acc.kathaRevenue.plus(amount);
        else acc.otherRevenue = acc.otherRevenue.plus(amount);

        return acc;
      },
      {
        totalWeight: new Decimal(0),
        totalRevenue: new Decimal(0),
        cashRevenue: new Decimal(0),
        upiRevenue: new Decimal(0),
        cardRevenue: new Decimal(0),
        kathaRevenue: new Decimal(0),
        otherRevenue: new Decimal(0),
      }
    );

    res.json({
      success: true,
      data: result.rows,
      summary: {
        totalWeightKg: formatWeight(summary.totalWeight),
        totalRevenue: formatMoney(summary.totalRevenue),
        cashRevenue: formatMoney(summary.cashRevenue),
        upiRevenue: formatMoney(summary.upiRevenue),
        cardRevenue: formatMoney(summary.cardRevenue),
        kathaRevenue: formatMoney(summary.kathaRevenue),
        otherRevenue: formatMoney(summary.otherRevenue),
        averagePricePerKg: summary.totalWeight.isZero()
          ? 0
          : formatMoney(summary.totalRevenue.dividedBy(summary.totalWeight)),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Record New Chicken Sale
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { saleDate, weightSoldKg, pricePerKg, paymentMethod, notes } = req.body;

    if (!saleDate || !weightSoldKg || !pricePerKg) {
      res.status(400).json({
        success: false,
        error: 'Sale Date, Weight Sold (kg), and Price per kg are required.',
      });
      return;
    }

    const weight = toDecimal(weightSoldKg);
    const price = toDecimal(pricePerKg);

    if (weight.lte(0)) {
      res.status(400).json({ success: false, error: 'Weight sold must be greater than zero.' });
      return;
    }
    if (price.lt(0)) {
      res.status(400).json({ success: false, error: 'Price per kg cannot be negative.' });
      return;
    }

    const totalAmount = multiply(weight, price);
    const method = paymentMethod || 'Cash';

    const sale = await withTransaction(async (client) => {
      const sRes = await client.query(
        `INSERT INTO chicken_sales (
          sale_date, weight_sold_kg, price_per_kg, total_amount, payment_method, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          saleDate,
          weight.toNumber(),
          price.toNumber(),
          totalAmount.toNumber(),
          method,
          notes || null,
          req.user!.id,
        ]
      );
      const newSale = sRes.rows[0];

      // Record inventory transaction
      await client.query(
        `INSERT INTO inventory_transactions (
          txn_date, txn_type, weight_kg, cost_per_kg, reference_module, reference_id, reason, created_by
        ) VALUES ($1, 'sales_out', $2, $3, 'chicken_sales', $4, $5, $6)`,
        [
          saleDate,
          weight.toNumber(),
          price.toNumber(),
          newSale.id,
          `Counter Sale: ${weight.toNumber()} kg @ ₹${price.toNumber()}`,
          req.user!.id,
        ]
      );

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'CHICKEN_SALE_RECORDED',
          module: 'CHICKEN_SALES',
          recordType: 'chicken_sale',
          recordId: newSale.id,
          newValues: newSale,
          ipAddress: req.ip,
        },
        client
      );

      return newSale;
    });

    res.status(201).json({ success: true, data: sale });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Delete Chicken Sale (Owner/Admin only, requires reason)
router.delete('/:id', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, error: 'A reason for deleting the sale is required.' });
      return;
    }

    const prevRes = await query('SELECT * FROM chicken_sales WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Sale record not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    await withTransaction(async (client) => {
      // Delete inventory movement
      await client.query(
        "DELETE FROM inventory_transactions WHERE reference_module = 'chicken_sales' AND reference_id = $1",
        [id]
      );

      await client.query('DELETE FROM chicken_sales WHERE id = $1', [id]);

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'CHICKEN_SALE_DELETED',
          module: 'CHICKEN_SALES',
          recordType: 'chicken_sale',
          recordId: id,
          previousValues: prev,
          reason,
          ipAddress: req.ip,
        },
        client
      );
    });

    res.json({ success: true, message: 'Chicken sale deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
