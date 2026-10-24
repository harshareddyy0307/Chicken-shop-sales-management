import { Router, Request, Response } from 'express';
import { query } from '../db/connection';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../utils/audit';

const router = Router();

// Get shop settings
router.get('/', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM shop_settings WHERE id = 1');
    if (result.rows.length === 0) {
      res.json({
        success: true,
        data: {
          shopName: 'Reddy Chicken and Mutton Center',
          address: 'Old Alwal, Secunderabad, Telangana',
          phone: '+91 95503 59925',
          currency: '₹',
          dateFormat: 'DD-MM-YYYY',
        },
      });
      return;
    }
    const s = result.rows[0];
    res.json({
      success: true,
      data: {
        shopName: s.shop_name,
        address: s.address,
        phone: s.phone,
        currency: s.currency,
        dateFormat: s.date_format,
        allowNegativeStock: s.allow_negative_stock,
        warnDuplicateCustomer: s.warn_duplicate_customer,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update shop settings (Owner / Admin only)
router.put('/', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { shopName, address, phone, currency, dateFormat, allowNegativeStock, warnDuplicateCustomer } = req.body;

    const prevRes = await query('SELECT * FROM shop_settings WHERE id = 1');
    const prev = prevRes.rows[0] || {};

    const updated = await query(
      `UPDATE shop_settings
       SET shop_name = COALESCE($1, shop_name),
           address = COALESCE($2, address),
           phone = COALESCE($3, phone),
           currency = COALESCE($4, currency),
           date_format = COALESCE($5, date_format),
           allow_negative_stock = COALESCE($6, allow_negative_stock),
           warn_duplicate_customer = COALESCE($7, warn_duplicate_customer),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1
       RETURNING *`,
      [
        shopName || null,
        address || null,
        phone || null,
        currency || null,
        dateFormat || null,
        allowNegativeStock !== undefined ? allowNegativeStock : null,
        warnDuplicateCustomer !== undefined ? warnDuplicateCustomer : null,
      ]
    );

    await logAudit({
      userId: req.user!.id,
      userName: req.user!.fullName,
      action: 'SHOP_SETTINGS_UPDATED',
      module: 'SETTINGS',
      recordType: 'shop_settings',
      recordId: 1,
      previousValues: prev,
      newValues: updated.rows[0],
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
