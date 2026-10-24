import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, withTransaction } from '../db/connection';
import { config } from '../config';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit } from '../utils/audit';
import { normalizeIndianPhone, formatIndianPhone, isValidPin } from '../utils/phone';

const router = Router();

// In-memory rate limiting map for login attempts per IP
const ipRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipRateLimitMap.get(ip);
  if (!record || record.resetAt < now) {
    ipRateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 1000 }); // 1-minute window
    return true;
  }
  if (record.count >= 30) {
    return false; // Limit exceeded: max 30 attempts per minute per IP
  }
  record.count++;
  return true;
}

// 1. Phone + 4-Digit PIN Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkIpRateLimit(ip)) {
      res.status(429).json({
        success: false,
        error: 'Too many login attempts. Please wait 1 minute before trying again.',
      });
      return;
    }

    // Support phone + pin (new) or username + password (backward-compatible fallback)
    const rawPhone = req.body.phone || req.body.username;
    const rawPin = req.body.pin || req.body.password;

    if (!rawPhone || !rawPin) {
      res.status(400).json({
        success: false,
        error: 'Phone number and 4-digit PIN are required.',
      });
      return;
    }

    const pinStr = String(rawPin).trim();
    const normalized = normalizeIndianPhone(rawPhone);

    // Look up user by normalized phone, raw phone, or legacy username
    let userResult;
    if (normalized) {
      userResult = await query(
        `SELECT id, username, full_name, role, phone, normalized_phone, password_hash, pin_hash, is_active, failed_login_attempts, locked_until
         FROM users
         WHERE normalized_phone = $1 OR phone = $2 OR username = $3
         LIMIT 1`,
        [normalized, rawPhone.trim(), rawPhone.trim().toLowerCase()]
      );
    } else {
      userResult = await query(
        `SELECT id, username, full_name, role, phone, normalized_phone, password_hash, pin_hash, is_active, failed_login_attempts, locked_until
         FROM users
         WHERE username = $1 OR phone = $2
         LIMIT 1`,
        [rawPhone.trim().toLowerCase(), rawPhone.trim()]
      );
    }

    // Account not found: return generic error to prevent phone enumeration
    if (userResult.rows.length === 0) {
      await logAudit({
        userName: `Unknown (${rawPhone})`,
        action: 'LOGIN_FAILED',
        module: 'AUTH',
        recordType: 'auth',
        details: 'Failed login attempt with unregistered identifier',
        ipAddress: ip,
      });

      res.status(401).json({
        success: false,
        error: 'Invalid phone number or PIN. Please try again.',
      });
      return;
    }

    const user = userResult.rows[0];

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / (60 * 1000));
      await logAudit({
        userId: user.id,
        userName: user.full_name,
        action: 'LOGIN_BLOCKED_LOCKED',
        module: 'AUTH',
        recordType: 'user',
        recordId: user.id,
        details: `Login blocked: account locked for ${remainingMinutes} more minutes`,
        ipAddress: ip,
      });

      res.status(429).json({
        success: false,
        error: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${remainingMinutes} minute(s) or contact the owner.`,
      });
      return;
    }

    // Check account status
    if (!user.is_active) {
      await logAudit({
        userId: user.id,
        userName: user.full_name,
        action: 'LOGIN_BLOCKED_INACTIVE',
        module: 'AUTH',
        recordType: 'user',
        recordId: user.id,
        details: 'Attempted login to deactivated account',
        ipAddress: ip,
      });

      res.status(403).json({
        success: false,
        error: 'This account has been deactivated. Please contact the shop owner.',
      });
      return;
    }

    // Validate PIN / Password (checks pin_hash or legacy password_hash)
    let isMatch = false;
    if (user.pin_hash && (await bcrypt.compare(pinStr, user.pin_hash))) {
      isMatch = true;
    } else if (user.password_hash && (await bcrypt.compare(pinStr, user.password_hash))) {
      isMatch = true;
    }

    if (!isMatch) {
      const failedCount = (user.failed_login_attempts || 0) + 1;

      if (failedCount >= 5) {
        const lockDurationMs = 15 * 60 * 1000; // 15 minutes lockout
        const lockedUntil = new Date(Date.now() + lockDurationMs);

        await query(
          'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
          [failedCount, lockedUntil, user.id]
        );

        await logAudit({
          userId: user.id,
          userName: user.full_name,
          action: 'ACCOUNT_LOCKED',
          module: 'AUTH',
          recordType: 'user',
          recordId: user.id,
          details: 'Account locked for 15 minutes after 5 consecutive failed PIN attempts',
          ipAddress: ip,
        });

        res.status(429).json({
          success: false,
          error: 'Account is temporarily locked due to multiple failed login attempts. Please try again after 15 minutes or contact the owner.',
        });
        return;
      }

      await query(
        'UPDATE users SET failed_login_attempts = $1 WHERE id = $2',
        [failedCount, user.id]
      );

      await logAudit({
        userId: user.id,
        userName: user.full_name,
        action: 'LOGIN_FAILED',
        module: 'AUTH',
        recordType: 'user',
        recordId: user.id,
        details: `Incorrect PIN attempt (${failedCount}/5)`,
        ipAddress: ip,
      });

      res.status(401).json({
        success: false,
        error: 'Invalid phone number or PIN. Please try again.',
      });
      return;
    }

    // Success: Reset failed attempts, update last login
    await query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    const payload = {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
    };

    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });

    // Set secure, HttpOnly session cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    await logAudit({
      userId: user.id,
      userName: user.full_name,
      action: 'USER_LOGIN',
      module: 'AUTH',
      recordType: 'user',
      recordId: user.id,
      details: 'Successful phone & 4-digit PIN authentication',
      ipAddress: ip,
    });

    res.json({
      success: true,
      data: {
        token, // For backward compatibility / API testing
        user: {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role,
          phone: user.phone,
          normalizedPhone: user.normalized_phone,
          lastLoginAt: new Date().toISOString(),
        },
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'An unexpected internal error occurred during login.' });
  }
});

// 2. Logout (clears HttpOnly session cookie)
router.post('/logout', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/',
    });

    if (req.user) {
      await logAudit({
        userId: req.user.id,
        userName: req.user.fullName,
        action: 'USER_LOGOUT',
        module: 'AUTH',
        recordType: 'user',
        recordId: req.user.id,
        details: 'User logged out of session',
        ipAddress: req.ip,
      });
    }

    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Current Authenticated User profile
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const userResult = await query(
      'SELECT id, username, full_name, role, phone, normalized_phone, is_active, created_at, last_login_at FROM users WHERE id = $1',
      [req.user!.id]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'User account not found.' });
      return;
    }

    const user = userResult.rows[0];
    res.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
        phone: user.phone,
        normalizedPhone: user.normalized_phone,
        isActive: user.is_active,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Forgot PIN Assistance Workflow
router.post('/forgot-pin', async (req: Request, res: Response): Promise<void> => {
  try {
    const { phone } = req.body;
    const normalized = normalizeIndianPhone(phone);

    // Audit the request without leaking account existence
    if (normalized) {
      const userRes = await query('SELECT id, full_name FROM users WHERE normalized_phone = $1', [normalized]);
      if (userRes.rows.length > 0) {
        await logAudit({
          userId: userRes.rows[0].id,
          userName: userRes.rows[0].full_name,
          action: 'PIN_RESET_REQUESTED',
          module: 'AUTH',
          recordType: 'user',
          recordId: userRes.rows[0].id,
          details: `PIN reset assistance requested for phone ${normalized}`,
          ipAddress: req.ip,
        });
      }
    }

    // Transparently inform that SMS gateway is not configured and direct to owner
    res.json({
      success: true,
      message:
        'SMS Gateway is not currently configured. For security, please contact the Shop Owner (Harsha Reddy, 7989856610) to reset your 4-digit PIN.',
      ownerContact: {
        name: 'Harsha Reddy (Owner)',
        phone: '7989856610',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. List all users (Owner / Admin only)
router.get('/users', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT id, username, full_name, role, phone, normalized_phone, is_active, failed_login_attempts, locked_until, last_login_at, created_at, updated_at
       FROM users
       ORDER BY id ASC`
    );

    res.json({
      success: true,
      data: result.rows.map((r) => ({
        id: r.id,
        username: r.username,
        fullName: r.full_name,
        role: r.role,
        phone: r.phone,
        normalizedPhone: r.normalized_phone,
        isActive: r.is_active,
        failedLoginAttempts: r.failed_login_attempts || 0,
        lockedUntil: r.locked_until,
        isLocked: !!(r.locked_until && new Date(r.locked_until) > new Date()),
        lastLoginAt: r.last_login_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Create new user with 4-Digit PIN (Owner / Admin only)
router.post('/users', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { fullName, phone, pin, role } = req.body;

    if (!fullName || !phone || !pin || !role) {
      res.status(400).json({ success: false, error: 'Full name, phone number, 4-digit PIN, and role are required.' });
      return;
    }

    const normalized = normalizeIndianPhone(phone);
    if (!normalized) {
      res.status(400).json({
        success: false,
        error: 'Invalid Indian phone number. Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.',
      });
      return;
    }

    if (!isValidPin(pin)) {
      res.status(400).json({
        success: false,
        error: 'PIN must contain exactly 4 numeric digits (e.g. 0123).',
      });
      return;
    }

    const validRoles = ['owner', 'admin', 'manager', 'staff'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      return;
    }

    // Check phone uniqueness
    const existing = await query('SELECT id FROM users WHERE normalized_phone = $1', [normalized]);
    if (existing.rows.length > 0) {
      res.status(400).json({ success: false, error: `Phone number ${normalized} is already registered to another account.` });
      return;
    }

    // Auto-generate username from full name if not supplied
    const usernameSlug = fullName.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || `user${Date.now().toString().slice(-4)}`;
    let finalUsername = usernameSlug;
    const userCheck = await query('SELECT id FROM users WHERE username = $1', [finalUsername]);
    if (userCheck.rows.length > 0) {
      finalUsername = `${usernameSlug}${Date.now().toString().slice(-3)}`;
    }

    const pinHash = await bcrypt.hash(String(pin).trim(), 10);
    const displayPhone = formatIndianPhone(normalized);

    const result = await query(
      `INSERT INTO users (username, password_hash, pin_hash, full_name, role, phone, normalized_phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, full_name, role, phone, normalized_phone, is_active, created_at`,
      [finalUsername, pinHash, pinHash, fullName.trim(), role, displayPhone, normalized]
    );

    const newUser = result.rows[0];
    await logAudit({
      userId: req.user!.id,
      userName: req.user!.fullName,
      action: 'USER_CREATED',
      module: 'USERS',
      recordType: 'user',
      recordId: newUser.id,
      newValues: { fullName: newUser.full_name, phone: newUser.phone, role: newUser.role },
      details: `Created new user ${newUser.full_name} (${newUser.role}) with 4-digit PIN`,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: newUser });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Reset User PIN by Owner (Owner / Admin only)
router.post('/users/:id/reset-pin', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { newPin } = req.body;

    if (!isValidPin(newPin)) {
      res.status(400).json({
        success: false,
        error: 'New PIN must contain exactly 4 numeric digits (e.g. 1234).',
      });
      return;
    }

    const userRes = await query('SELECT id, full_name, role, phone FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'User account not found.' });
      return;
    }

    const targetUser = userRes.rows[0];
    const pinHash = await bcrypt.hash(String(newPin).trim(), 10);

    // Update PIN and reset failed attempts / unlock account
    await query(
      `UPDATE users
       SET pin_hash = $1, password_hash = $1, failed_login_attempts = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [pinHash, userId]
    );

    await logAudit({
      userId: req.user!.id,
      userName: req.user!.fullName,
      action: 'PIN_RESET',
      module: 'USERS',
      recordType: 'user',
      recordId: userId,
      details: `Owner reset 4-digit PIN for user ${targetUser.full_name} (account unlocked)`,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: `4-Digit PIN for ${targetUser.full_name} has been reset successfully.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Update User details / status / role (Owner / Admin only)
router.put('/users/:id', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { fullName, role, phone, isActive, pin } = req.body;

    if (isActive === false && req.user!.id === userId) {
      res.status(400).json({ success: false, error: 'You cannot pause or deactivate your own account.' });
      return;
    }

    const userRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'User account not found.' });
      return;
    }
    const prev = userRes.rows[0];

    let normalized = prev.normalized_phone;
    let formattedPhone = prev.phone;
    if (phone) {
      const clean = normalizeIndianPhone(phone);
      if (!clean) {
        res.status(400).json({ success: false, error: 'Invalid Indian phone number.' });
        return;
      }
      // Check phone uniqueness against other accounts
      const conflict = await query('SELECT id FROM users WHERE normalized_phone = $1 AND id != $2', [clean, userId]);
      if (conflict.rows.length > 0) {
        res.status(400).json({ success: false, error: 'This phone number is already registered to another account.' });
        return;
      }
      normalized = clean;
      formattedPhone = formatIndianPhone(clean);
    }

    let pinHash = prev.pin_hash || prev.password_hash;
    if (pin) {
      if (!isValidPin(pin)) {
        res.status(400).json({ success: false, error: 'PIN must be exactly 4 numeric digits.' });
        return;
      }
      pinHash = await bcrypt.hash(String(pin).trim(), 10);
    }

    const updated = await query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           role = COALESCE($2, role),
           phone = $3,
           normalized_phone = $4,
           is_active = COALESCE($5, is_active),
           pin_hash = $6,
           password_hash = $6,
           failed_login_attempts = CASE WHEN $5 = true THEN 0 ELSE failed_login_attempts END,
           locked_until = CASE WHEN $5 = true THEN NULL ELSE locked_until END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING id, username, full_name, role, phone, normalized_phone, is_active, updated_at`,
      [
        fullName !== undefined ? fullName : null,
        role !== undefined ? role : null,
        formattedPhone,
        normalized,
        isActive !== undefined ? isActive : null,
        pinHash,
        userId,
      ]
    );

    await logAudit({
      userId: req.user!.id,
      userName: req.user!.fullName,
      action: 'USER_UPDATED',
      module: 'USERS',
      recordType: 'user',
      recordId: userId,
      previousValues: { fullName: prev.full_name, role: prev.role, isActive: prev.is_active, phone: prev.phone },
      newValues: updated.rows[0],
      details: `Updated user profile for ${updated.rows[0].full_name}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, data: updated.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Pause or Resume User Account (Owner / Admin only)
router.patch('/users/:id/status', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      res.status(400).json({ success: false, error: 'isActive boolean flag is required.' });
      return;
    }

    if (!isActive && req.user!.id === userId) {
      res.status(400).json({ success: false, error: 'You cannot pause or suspend your own account.' });
      return;
    }

    const userRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'User account not found.' });
      return;
    }
    const targetUser = userRes.rows[0];

    // Prevent pausing the last active owner
    if (!isActive && targetUser.role === 'owner') {
      const activeOwnerRes = await query("SELECT COUNT(*) FROM users WHERE role = 'owner' AND is_active = true");
      if (parseInt(activeOwnerRes.rows[0].count, 10) <= 1) {
        res.status(400).json({ success: false, error: 'Cannot pause the only active Owner account in the system.' });
        return;
      }
    }

    const updated = await query(
      `UPDATE users
       SET is_active = $1,
           failed_login_attempts = CASE WHEN $1 = true THEN 0 ELSE failed_login_attempts END,
           locked_until = CASE WHEN $1 = true THEN NULL ELSE locked_until END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, username, full_name, role, phone, normalized_phone, is_active, updated_at`,
      [isActive, userId]
    );

    const actionName = isActive ? 'USER_RESUMED' : 'USER_PAUSED';
    const desc = isActive
      ? `Owner resumed/activated account for ${targetUser.full_name}`
      : `Owner paused/suspended account for ${targetUser.full_name}`;

    await logAudit({
      userId: req.user!.id,
      userName: req.user!.fullName,
      action: actionName,
      module: 'USERS',
      recordType: 'user',
      recordId: userId,
      previousValues: { isActive: targetUser.is_active },
      newValues: { isActive },
      details: desc,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      message: isActive
        ? `Account for ${targetUser.full_name} has been activated/resumed.`
        : `Account for ${targetUser.full_name} has been paused. They will not be able to log in.`,
      data: updated.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Permanently Delete User Account (Owner / Admin only)
router.delete('/users/:id', authenticate, requireRole('owner', 'admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { reason } = req.body || {};

    if (req.user!.id === userId) {
      res.status(400).json({ success: false, error: 'You cannot delete your own account.' });
      return;
    }

    const userRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'User account not found.' });
      return;
    }
    const targetUser = userRes.rows[0];

    // Prevent deleting the last owner account
    if (targetUser.role === 'owner') {
      const ownerRes = await query("SELECT COUNT(*) FROM users WHERE role = 'owner'");
      if (parseInt(ownerRes.rows[0].count, 10) <= 1) {
        res.status(400).json({ success: false, error: 'Cannot delete the only Owner account in the system.' });
        return;
      }
    }

    await withTransaction(async (client) => {
      // 1. Clear foreign keys to preserve historical accounting and audit records
      await client.query('UPDATE distributor_supplies SET created_by = NULL WHERE created_by = $1', [userId]);
      await client.query('UPDATE distributor_payments SET created_by = NULL WHERE created_by = $1', [userId]);
      await client.query('UPDATE customer_bills SET created_by = NULL WHERE created_by = $1', [userId]);
      await client.query('UPDATE customer_payments SET created_by = NULL WHERE created_by = $1', [userId]);
      await client.query('UPDATE chicken_sales SET created_by = NULL WHERE created_by = $1', [userId]);
      await client.query('UPDATE daily_closings SET submitted_by = NULL WHERE submitted_by = $1', [userId]);
      await client.query('UPDATE financial_adjustments SET created_by = NULL WHERE created_by = $1', [userId]);
      await client.query('UPDATE operating_expenses SET created_by = NULL WHERE created_by = $1', [userId]);
      await client.query('UPDATE inventory_transactions SET created_by = NULL WHERE created_by = $1', [userId]);
      await client.query('UPDATE stock_transfers SET created_by = NULL WHERE created_by = $1', [userId]);
      await client.query('UPDATE audit_logs SET user_id = NULL WHERE user_id = $1', [userId]);

      // 2. Permanently delete user
      await client.query('DELETE FROM users WHERE id = $1', [userId]);

      // 3. Log audit event
      await logAudit(
        {
          userId: req.user!.id,
          userName: req.user!.fullName,
          action: 'USER_DELETED_PERMANENTLY',
          module: 'USERS',
          recordType: 'user',
          recordId: userId,
          previousValues: {
            id: targetUser.id,
            fullName: targetUser.full_name,
            phone: targetUser.phone,
            role: targetUser.role,
          },
          reason: reason || 'Permanently deleted by owner',
          details: `Owner permanently deleted user ${targetUser.full_name} (${targetUser.role})`,
          ipAddress: req.ip,
        },
        client
      );
    });

    res.json({
      success: true,
      message: `Account for ${targetUser.full_name} has been permanently deleted.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
