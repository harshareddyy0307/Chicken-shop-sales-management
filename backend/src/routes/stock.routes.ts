import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { Decimal, toDecimal, formatMoney, formatWeight, add, subtract } from '../utils/decimal';

const router = Router();

// 1. Get stock status for a specific date or date range (calculates previous day's closing stock as opening, supplies received, sales, adjustments)
router.get('/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const startDate = (req.query.startDate as string) || (req.query.date as string) || today;
    const endDate = (req.query.endDate as string) || (req.query.date as string) || startDate;
    const isSingleDay = startDate === endDate;

    let openingStockKg = new Decimal(0);
    let previousDate: string | null = null;
    let existingClosing: any = null;

    if (isSingleDay) {
      // 1. Check if a daily closing already exists for this date
      const closingRes = await query('SELECT * FROM daily_closings WHERE business_date = $1', [startDate]);
      existingClosing = closingRes.rows[0] || null;

      // 2. Find previous verified closing stock
      const prevClosingRes = await query(
        `SELECT closing_stock_kg, business_date 
         FROM daily_closings 
         WHERE business_date < $1 AND status = 'Completed'
         ORDER BY business_date DESC 
         LIMIT 1`,
        [startDate]
      );

      if (prevClosingRes.rows.length > 0) {
        openingStockKg = toDecimal(prevClosingRes.rows[0].closing_stock_kg);
        previousDate = prevClosingRes.rows[0].business_date instanceof Date
          ? prevClosingRes.rows[0].business_date.toISOString().split('T')[0]
          : String(prevClosingRes.rows[0].business_date);
      }

      // If closing already recorded, use the opening stock recorded in closing
      if (existingClosing) {
        openingStockKg = toDecimal(existingClosing.opening_stock_kg);
      }
    } else {
      // Range query (Week / Month)
      // Check if a daily closing exists on the startDate
      const startClosingRes = await query(
        'SELECT opening_stock_kg FROM daily_closings WHERE business_date = $1',
        [startDate]
      );

      if (startClosingRes.rows.length > 0) {
        openingStockKg = toDecimal(startClosingRes.rows[0].opening_stock_kg);
      } else {
        // Find previous verified closing stock before startDate
        const prevClosingRes = await query(
          `SELECT closing_stock_kg, business_date 
           FROM daily_closings 
           WHERE business_date < $1 AND status = 'Completed'
           ORDER BY business_date DESC 
           LIMIT 1`,
          [startDate]
        );

        if (prevClosingRes.rows.length > 0) {
          openingStockKg = toDecimal(prevClosingRes.rows[0].closing_stock_kg);
          previousDate = prevClosingRes.rows[0].business_date instanceof Date
            ? prevClosingRes.rows[0].business_date.toISOString().split('T')[0]
            : String(prevClosingRes.rows[0].business_date);
        } else {
          // If no closing before startDate, check earliest closing in range
          const firstInRangeRes = await query(
            `SELECT opening_stock_kg, business_date 
             FROM daily_closings 
             WHERE business_date >= $1 AND business_date <= $2 
             ORDER BY business_date ASC 
             LIMIT 1`,
            [startDate, endDate]
          );
          if (firstInRangeRes.rows.length > 0) {
            openingStockKg = toDecimal(firstInRangeRes.rows[0].opening_stock_kg);
          }
        }
      }

      // Latest closing in range (if any)
      const latestClosingRes = await query(
        `SELECT * FROM daily_closings 
         WHERE business_date >= $1 AND business_date <= $2 
         ORDER BY business_date DESC 
         LIMIT 1`,
        [startDate, endDate]
      );
      existingClosing = latestClosingRes.rows[0] || null;
    }

    // 3. Calculate new stock received from distributor supplies (supports date range)
    const suppliesRes = await query(
      `SELECT COALESCE(SUM(weight_kg), 0) AS total_weight,
              COALESCE(SUM(total_amount), 0) AS total_amount,
              COUNT(*) AS delivery_count
       FROM distributor_supplies 
       WHERE supply_date >= $1 AND supply_date <= $2`,
      [startDate, endDate]
    );

    const newStockReceivedKg = toDecimal(suppliesRes.rows[0].total_weight);
    const totalPurchaseCost = toDecimal(suppliesRes.rows[0].total_amount);
    const deliveryCount = parseInt(suppliesRes.rows[0].delivery_count, 10);

    // 4. Calculate individual counter sales and bills (supports date range)
    const salesRes = await query(
      `SELECT COALESCE(SUM(weight_sold_kg), 0) AS total_weight_sold,
              COALESCE(SUM(total_amount), 0) AS total_revenue
       FROM chicken_sales
       WHERE sale_date >= $1 AND sale_date <= $2`,
      [startDate, endDate]
    );

    const individualSalesWeightKg = toDecimal(salesRes.rows[0].total_weight_sold);
    const individualSalesRevenue = toDecimal(salesRes.rows[0].total_revenue);

    // 5. Stock adjustments for date range
    const adjustRes = await query(
      `SELECT * FROM inventory_transactions 
       WHERE txn_date >= $1 AND txn_date <= $2 AND txn_type = 'adjustment'
       ORDER BY txn_date DESC, id DESC`,
      [startDate, endDate]
    );

    const adjustmentsKg = adjustRes.rows.reduce((sum, adj) => {
      return sum.plus(toDecimal(adj.weight_kg));
    }, new Decimal(0));

    // 6. Stock transfers for date range
    const transfersRes = await query(
      `SELECT COALESCE(SUM(weight_kg), 0) AS total_transferred_kg,
              COALESCE(SUM(total_cost), 0) AS total_transferred_cost,
              COUNT(*) AS transfer_count
       FROM stock_transfers
       WHERE transfer_date >= $1 AND transfer_date <= $2 AND status = 'Completed'`,
      [startDate, endDate]
    );

    const totalStockTransferredKg = toDecimal(transfersRes.rows[0].total_transferred_kg);
    const totalTransferredCost = toDecimal(transfersRes.rows[0].total_transferred_cost);
    const transferCount = parseInt(transfersRes.rows[0].transfer_count, 10);

    // Total available stock = Opening Stock + New Stock Received
    const totalAvailableStockKg = openingStockKg.plus(newStockReceivedKg);
    const stockAvailableForSaleKg = totalAvailableStockKg.minus(totalStockTransferredKg).gt(0)
      ? totalAvailableStockKg.minus(totalStockTransferredKg)
      : new Decimal(0);

    res.json({
      success: true,
      data: {
        date: startDate,
        startDate,
        endDate,
        openingStockKg: formatWeight(openingStockKg),
        previousVerifiedDate: previousDate,
        newStockReceivedKg: formatWeight(newStockReceivedKg),
        deliveryCount,
        totalPurchaseCost: formatMoney(totalPurchaseCost),
        totalAvailableStockKg: formatWeight(totalAvailableStockKg),
        totalStockTransferredKg: formatWeight(totalStockTransferredKg),
        totalTransferredCost: formatMoney(totalTransferredCost),
        transferCount,
        stockAvailableForSaleKg: formatWeight(stockAvailableForSaleKg),
        individualSalesWeightKg: formatWeight(individualSalesWeightKg),
        individualSalesRevenue: formatMoney(individualSalesRevenue),
        adjustmentsKg: formatWeight(adjustmentsKg),
        adjustments: adjustRes.rows,
        existingClosing: existingClosing
          ? {
              id: existingClosing.id,
              status: existingClosing.status,
              stockTransferredKg: formatWeight(toDecimal(existingClosing.stock_transferred_kg || 0)),
              stockAvailableForSaleKg: formatWeight(toDecimal(existingClosing.stock_available_for_sale_kg || 0)),
              closingStockKg: formatWeight(existingClosing.closing_stock_kg),
              quantitySoldKg: formatWeight(existingClosing.quantity_sold_kg),
              sellingPricePerKg: formatMoney(existingClosing.selling_price_per_kg),
              chickenSalesRevenue: formatMoney(existingClosing.chicken_sales_revenue),
              estimatedGrossProfit: formatMoney(existingClosing.estimated_gross_profit),
              totalCounterCollection: formatMoney(existingClosing.total_counter_collection),
            }
          : null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Historical stock ledger table (date-wise breakdown)
router.get('/ledger', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    let sql = `
      SELECT 
        c.business_date,
        c.status,
        c.opening_stock_kg,
        c.new_stock_kg,
        c.total_available_stock_kg,
        c.stock_transferred_kg,
        c.stock_available_for_sale_kg,
        c.closing_stock_kg,
        c.quantity_sold_kg,
        c.selling_price_per_kg,
        c.chicken_sales_revenue,
        c.distributor_purchase_cost,
        c.cost_of_chicken_sold,
        c.estimated_gross_profit
      FROM daily_closings c
      WHERE 1=1
    `;
    const params: any[] = [];

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

// 3. Record Manual Stock Adjustment (shrinkage, wastage, physical stock count discrepancy)
router.post('/adjust', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { txnDate, weightKg, adjustmentType, reason } = req.body;

    if (!txnDate || weightKg === undefined || !reason || !reason.trim()) {
      res.status(400).json({
        success: false,
        error: 'Date, Weight (kg), and a mandatory Reason are required for stock adjustments.',
      });
      return;
    }

    const weight = toDecimal(weightKg); // positive for found, negative for loss/damage
    const typeDesc = adjustmentType || (weight.isNegative() ? 'Stock Shrinkage / Waste' : 'Stock Surplus Found');

    const result = await withTransaction(async (client) => {
      const insRes = await client.query(
        `INSERT INTO inventory_transactions (
          txn_date, txn_type, weight_kg, reference_module, reason, created_by
        ) VALUES ($1, 'adjustment', $2, 'manual_adjustment', $3, $4)
        RETURNING *`,
        [txnDate, weight.toNumber(), `${typeDesc}: ${reason.trim()}`, req.user!.id]
      );
      const adj = insRes.rows[0];

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'STOCK_ADJUSTMENT_RECORDED',
          module: 'STOCK_MANAGEMENT',
          recordType: 'inventory_adjustment',
          recordId: adj.id,
          newValues: adj,
          reason,
          ipAddress: req.ip,
        },
        client
      );

      return adj;
    });

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Get list of stock transfers with filtering
router.get('/transfers', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, destinationShop, status } = req.query;

    let sql = `
      SELECT 
        t.*,
        t.weight_kg AS transferred_quantity_kg,
        t.total_cost AS total_transfer_cost,
        u.full_name AS created_by_name
      FROM stock_transfers t
      LEFT JOIN users u ON t.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (startDate) {
      params.push(startDate);
      sql += ` AND t.transfer_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      sql += ` AND t.transfer_date <= $${params.length}`;
    }
    if (destinationShop) {
      params.push(`%${String(destinationShop).trim()}%`);
      sql += ` AND t.destination_shop ILIKE $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND t.status = $${params.length}`;
    }

    sql += ' ORDER BY t.transfer_date DESC, t.id DESC';

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Get saved/distinct destination shop names
router.get('/destination-shops', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      "SELECT DISTINCT destination_shop FROM stock_transfers WHERE destination_shop IS NOT NULL AND destination_shop != '' ORDER BY destination_shop ASC"
    );
    res.json({ success: true, data: result.rows.map((r) => r.destination_shop) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Record Standalone Stock Transfer (e.g., from Stock Management)
router.post('/transfers', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { transferDate, destinationShop, weightKg, costPerKg, notes } = req.body;

    if (!transferDate || !destinationShop || !destinationShop.trim() || weightKg === undefined) {
      res.status(400).json({
        success: false,
        error: 'Transfer Date, Destination Shop, and Transferred Weight (kg) are required.',
      });
      return;
    }

    const weight = toDecimal(weightKg);
    if (weight.lte(0)) {
      res.status(400).json({ success: false, error: 'Transferred chicken weight must be greater than 0 kg.' });
      return;
    }

    const cost = toDecimal(costPerKg || 180);
    const totalCost = weight.times(cost);

    const result = await withTransaction(async (client) => {
      const insRes = await client.query(
        `INSERT INTO stock_transfers (
          transfer_date, source_shop, destination_shop, weight_kg, cost_per_kg, total_cost, status, notes, created_by
        ) VALUES ($1, 'Reddy Chicken and Mutton Center', $2, $3, $4, $5, 'Completed', $6, $7)
        RETURNING *`,
        [
          transferDate,
          destinationShop.trim(),
          weight.toNumber(),
          cost.toNumber(),
          totalCost.toNumber(),
          notes || null,
          req.user!.id,
        ]
      );
      const transfer = insRes.rows[0];

      // Insert inventory transaction for transfer_out (deducts exactly once)
      await client.query(
        `INSERT INTO inventory_transactions (
          txn_date, txn_type, weight_kg, cost_per_kg, reference_module, reference_id, reason, created_by
        ) VALUES ($1, 'transfer_out', $2, $3, 'stock_transfer', $4, $5, $6)`,
        [
          transferDate,
          weight.toNumber(),
          cost.toNumber(),
          transfer.id,
          `Stock transferred to ${destinationShop.trim()}`,
          req.user!.id,
        ]
      );

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'STOCK_TRANSFER_RECORDED',
          module: 'STOCK_MANAGEMENT',
          recordType: 'stock_transfer',
          recordId: transfer.id,
          newValues: transfer,
          ipAddress: req.ip,
        },
        client
      );

      return transfer;
    });

    res.status(201).json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Edit Stock Transfer (Owner / Admin only with mandatory reason)
router.put('/transfers/:id', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { destinationShop, weightKg, costPerKg, notes, reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, error: 'A mandatory reason is required to modify a stock transfer.' });
      return;
    }

    const prevRes = await query('SELECT * FROM stock_transfers WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Stock transfer record not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    const weight = weightKg !== undefined ? toDecimal(weightKg) : toDecimal(prev.weight_kg);
    if (weight.lte(0)) {
      res.status(400).json({ success: false, error: 'Transferred weight must be greater than 0 kg.' });
      return;
    }
    const cost = costPerKg !== undefined ? toDecimal(costPerKg) : toDecimal(prev.cost_per_kg);
    const totalCost = weight.times(cost);
    const dest = destinationShop ? destinationShop.trim() : prev.destination_shop;

    const result = await withTransaction(async (client) => {
      const upRes = await client.query(
        `UPDATE stock_transfers
         SET destination_shop = $1, weight_kg = $2, cost_per_kg = $3, total_cost = $4, notes = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *`,
        [dest, weight.toNumber(), cost.toNumber(), totalCost.toNumber(), notes || prev.notes, id]
      );
      const updated = upRes.rows[0];

      // Update inventory transaction
      await client.query(
        `UPDATE inventory_transactions
         SET weight_kg = $1, cost_per_kg = $2, reason = $3
         WHERE reference_module = 'stock_transfer' AND reference_id = $4`,
        [weight.toNumber(), cost.toNumber(), `Stock transferred to ${dest}`, id]
      );

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'STOCK_TRANSFER_MODIFIED',
          module: 'STOCK_MANAGEMENT',
          recordType: 'stock_transfer',
          recordId: id,
          previousValues: prev,
          newValues: updated,
          reason,
          ipAddress: req.ip,
        },
        client
      );

      return updated;
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Cancel Stock Transfer (Owner / Admin only with mandatory reason)
router.delete('/transfers/:id', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, error: 'A mandatory reason is required to cancel a stock transfer.' });
      return;
    }

    const prevRes = await query('SELECT * FROM stock_transfers WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Stock transfer record not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    const result = await withTransaction(async (client) => {
      const upRes = await client.query(
        `UPDATE stock_transfers
         SET status = 'Cancelled', notes = COALESCE(notes, '') || ' [Cancelled: ' || $1 || ']', updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [reason.trim(), id]
      );

      // Remove outbound inventory deduction so stock returns to source shop
      await client.query(
        "DELETE FROM inventory_transactions WHERE reference_module = 'stock_transfer' AND reference_id = $1",
        [id]
      );

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'STOCK_TRANSFER_CANCELLED',
          module: 'STOCK_MANAGEMENT',
          recordType: 'stock_transfer',
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

    res.json({ success: true, data: result, message: 'Stock transfer cancelled successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
