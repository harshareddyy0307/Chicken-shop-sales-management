import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// List audit logs (Owner / Admin only)
router.get('/', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, module, userId, action, limit, offset } = req.query;

    let sql = `
      SELECT a.*, u.username
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (module && module !== 'All') {
      params.push(module);
      sql += ` AND a.module = $${params.length}`;
    }
    if (userId) {
      params.push(parseInt(String(userId), 10));
      sql += ` AND a.user_id = $${params.length}`;
    }
    if (action) {
      params.push(`%${action}%`);
      sql += ` AND a.action ILIKE $${params.length}`;
    }
    if (startDate) {
      params.push(startDate);
      sql += ` AND a.created_at >= $${params.length}::timestamp`;
    }
    if (endDate) {
      params.push(`${endDate} 23:59:59`);
      sql += ` AND a.created_at <= $${params.length}::timestamp`;
    }

    // Count query
    const countSql = `SELECT COUNT(*) AS total FROM (${sql}) AS sub`;
    const countRes = await query(countSql, params);
    const totalRecords = parseInt(countRes.rows[0].total, 10);

    sql += ' ORDER BY a.created_at DESC, a.id DESC';

    const pageLimit = Math.min(parseInt(String(limit || '50'), 10), 200);
    const pageOffset = parseInt(String(offset || '0'), 10);

    params.push(pageLimit);
    sql += ` LIMIT $${params.length}`;
    params.push(pageOffset);
    sql += ` OFFSET $${params.length}`;

    const result = await query(sql, params);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total: totalRecords,
        limit: pageLimit,
        offset: pageOffset,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Single audit log detail
router.get('/:id', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await query('SELECT * FROM audit_logs WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Audit log entry not found.' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
