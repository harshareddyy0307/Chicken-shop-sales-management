import { Router, Request, Response } from 'express';
import { query, withTransaction } from '../db/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { Decimal, toDecimal, formatMoney } from '../utils/decimal';
import { upload } from '../middleware/upload';

const router = Router();

// 1. List expenses with date, month, category filters
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, category, paymentMethod, month, year, date } = req.query;

    let sql = `
      SELECT e.*, u.full_name AS created_by_name
      FROM operating_expenses e
      LEFT JOIN users u ON e.created_by = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (date) {
      params.push(date);
      sql += ` AND e.expense_date = $${params.length}`;
    }
    if (startDate) {
      params.push(startDate);
      sql += ` AND e.expense_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      sql += ` AND e.expense_date <= $${params.length}`;
    }
    if (month && year) {
      params.push(parseInt(String(month), 10));
      params.push(parseInt(String(year), 10));
      sql += ` AND EXTRACT(MONTH FROM e.expense_date) = $${params.length - 1} AND EXTRACT(YEAR FROM e.expense_date) = $${params.length}`;
    }
    if (category && category !== 'All') {
      params.push(category);
      sql += ` AND e.category = $${params.length}`;
    }
    if (paymentMethod && paymentMethod !== 'All') {
      params.push(paymentMethod);
      sql += ` AND e.payment_method = $${params.length}`;
    }

    sql += ' ORDER BY e.expense_date DESC, e.id DESC';

    const result = await query(sql, params);

    // Calculate total
    const totalAmount = result.rows.reduce(
      (sum, r) => sum.plus(toDecimal(r.amount)),
      new Decimal(0)
    );

    res.json({
      success: true,
      data: result.rows,
      totalAmount: formatMoney(totalAmount),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Add New Operating Expense
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { expenseDate, category, description, amount, paymentMethod, receiptUrl, notes } = req.body;

    if (!expenseDate || !category || !description || !amount || !paymentMethod) {
      res.status(400).json({
        success: false,
        error: 'Expense Date, Category, Description, Amount, and Payment Method are required.',
      });
      return;
    }

    const expAmount = toDecimal(amount);
    if (expAmount.lte(0)) {
      res.status(400).json({ success: false, error: 'Expense amount must be greater than zero.' });
      return;
    }

    const newExpense = await withTransaction(async (client) => {
      const insRes = await client.query(
        `INSERT INTO operating_expenses (
          expense_date, category, description, amount, payment_method, receipt_url, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          expenseDate,
          category.trim(),
          description.trim(),
          expAmount.toNumber(),
          paymentMethod,
          receiptUrl || null,
          notes || null,
          req.user!.id,
        ]
      );
      const expense = insRes.rows[0];

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'OPERATING_EXPENSE_RECORDED',
          module: 'OPERATING_EXPENSES',
          recordType: 'operating_expense',
          recordId: expense.id,
          newValues: expense,
          ipAddress: req.ip,
        },
        client
      );

      return expense;
    });

    res.status(201).json({ success: true, data: newExpense });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Edit Operating Expense
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { expenseDate, category, description, amount, paymentMethod, receiptUrl, notes, reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, error: 'A mandatory reason is required to edit an expense.' });
      return;
    }

    const prevRes = await query('SELECT * FROM operating_expenses WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Expense not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    const expAmount = amount !== undefined ? toDecimal(amount).toNumber() : prev.amount;

    const updated = await withTransaction(async (client) => {
      const upRes = await client.query(
        `UPDATE operating_expenses
         SET expense_date = COALESCE($1, expense_date),
             category = COALESCE($2, category),
             description = COALESCE($3, description),
             amount = $4,
             payment_method = COALESCE($5, payment_method),
             receipt_url = COALESCE($6, receipt_url),
             notes = COALESCE($7, notes),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $8
         RETURNING *`,
        [
          expenseDate || null,
          category !== undefined ? category.trim() : null,
          description !== undefined ? description.trim() : null,
          expAmount,
          paymentMethod || null,
          receiptUrl !== undefined ? receiptUrl : null,
          notes !== undefined ? notes : null,
          id,
        ]
      );

      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'OPERATING_EXPENSE_EDITED',
          module: 'OPERATING_EXPENSES',
          recordType: 'operating_expense',
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

// 4. Delete Operating Expense (Owner / Admin only)
router.delete('/:id', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ success: false, error: 'A mandatory reason is required to delete an expense.' });
      return;
    }

    const prevRes = await query('SELECT * FROM operating_expenses WHERE id = $1', [id]);
    if (prevRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Expense not found.' });
      return;
    }
    const prev = prevRes.rows[0];

    await withTransaction(async (client) => {
      await client.query('DELETE FROM operating_expenses WHERE id = $1', [id]);
      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'OPERATING_EXPENSE_DELETED',
          module: 'OPERATING_EXPENSES',
          recordType: 'operating_expense',
          recordId: id,
          previousValues: prev,
          reason,
          ipAddress: req.ip,
        },
        client
      );
    });

    res.json({ success: true, message: 'Expense deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Monthly Expense Analytics
router.get('/monthly-analysis', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const year = parseInt((req.query.year as string) || String(new Date().getFullYear()), 10);
    const month = parseInt((req.query.month as string) || String(new Date().getMonth() + 1), 10);

    // Total monthly expenses
    const totalRes = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total_monthly
       FROM operating_expenses
       WHERE EXTRACT(YEAR FROM expense_date) = $1 AND EXTRACT(MONTH FROM expense_date) = $2`,
      [year, month]
    );

    // Category breakdown
    const catRes = await query(
      `SELECT category, SUM(amount) AS amount, COUNT(*) AS count
       FROM operating_expenses
       WHERE EXTRACT(YEAR FROM expense_date) = $1 AND EXTRACT(MONTH FROM expense_date) = $2
       GROUP BY category
       ORDER BY amount DESC`,
      [year, month]
    );

    // Payment method breakdown
    const methodRes = await query(
      `SELECT payment_method, SUM(amount) AS amount, COUNT(*) AS count
       FROM operating_expenses
       WHERE EXTRACT(YEAR FROM expense_date) = $1 AND EXTRACT(MONTH FROM expense_date) = $2
       GROUP BY payment_method
       ORDER BY amount DESC`,
      [year, month]
    );

    // Daily expense trend
    const dailyRes = await query(
      `SELECT expense_date, SUM(amount) AS amount, COUNT(*) AS count
       FROM operating_expenses
       WHERE EXTRACT(YEAR FROM expense_date) = $1 AND EXTRACT(MONTH FROM expense_date) = $2
       GROUP BY expense_date
       ORDER BY expense_date ASC`,
      [year, month]
    );

    // Monthly comparison across the year (12 months)
    const yearTrendRes = await query(
      `SELECT EXTRACT(MONTH FROM expense_date) AS month, SUM(amount) AS total
       FROM operating_expenses
       WHERE EXTRACT(YEAR FROM expense_date) = $1
       GROUP BY EXTRACT(MONTH FROM expense_date)
       ORDER BY month ASC`,
      [year]
    );

    res.json({
      success: true,
      data: {
        year,
        month,
        totalMonthlyExpenses: formatMoney(totalRes.rows[0].total_monthly),
        categoryBreakdown: catRes.rows.map((c) => ({
          category: c.category,
          amount: formatMoney(c.amount),
          count: parseInt(c.count, 10),
        })),
        paymentMethodBreakdown: methodRes.rows.map((m) => ({
          paymentMethod: m.payment_method,
          amount: formatMoney(m.amount),
          count: parseInt(m.count, 10),
        })),
        dailyTrend: dailyRes.rows.map((d) => ({
          date: d.expense_date instanceof Date ? d.expense_date.toISOString().split('T')[0] : String(d.expense_date),
          amount: formatMoney(d.amount),
          count: parseInt(d.count, 10),
        })),
        yearlyTrend: yearTrendRes.rows.map((y) => ({
          month: parseInt(y.month, 10),
          total: formatMoney(y.total),
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Expense Categories list & create
router.get('/categories/all', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM expense_categories ORDER BY is_default DESC, name ASC');
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/categories', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: 'Category name is required.' });
      return;
    }
    const result = await query(
      'INSERT INTO expense_categories (name, is_default) VALUES ($1, false) ON CONFLICT (name) DO NOTHING RETURNING *',
      [name.trim()]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Upload expense receipt
router.post('/upload-receipt', authenticate, upload.single('receipt'), (req: Request, res: Response): void => {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No receipt file uploaded.' });
    return;
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, fileUrl });
});

export default router;
