import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: 'owner' | 'admin' | 'manager' | 'staff';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

import { query } from '../db/connection';

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Check HttpOnly session cookie first, then Bearer Authorization header
  let token = req.cookies?.token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthUser;
    
    // Real-time security verification: verify user is not deactivated or deleted
    const userCheck = await query('SELECT id, is_active, role FROM users WHERE id = $1', [decoded.id]);
    if (userCheck.rows.length === 0 || !userCheck.rows[0].is_active) {
      res.status(403).json({ success: false, error: 'Account has been deactivated or removed. Access denied.' });
      return;
    }

    req.user = {
      ...decoded,
      role: userCheck.rows[0].role,
    };
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid or expired session. Please log in again.' });
    return;
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized. Authentication required.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: role '${req.user.role}' is not authorized for this action. Required: ${allowedRoles.join(', ')}`,
      });
      return;
    }

    next();
  };
}
