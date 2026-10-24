import { PoolClient } from 'pg';
import { query } from '../db/connection';

export interface AuditLogEntry {
  userId?: number | null;
  userName: string;
  action: string;
  module: string;
  recordType: string;
  recordId?: string | number;
  previousValues?: any;
  newValues?: any;
  reason?: string;
  details?: string;
  ipAddress?: string;
}

export async function logAudit(
  entry: AuditLogEntry,
  client?: PoolClient
): Promise<void> {
  const sql = `
    INSERT INTO audit_logs (
      user_id, user_name, action, module, record_type, record_id,
      previous_values, new_values, reason, ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `;
  const params = [
    entry.userId || null,
    entry.userName || 'System',
    entry.action,
    entry.module,
    entry.recordType,
    entry.recordId !== undefined && entry.recordId !== null ? String(entry.recordId) : '0',
    entry.previousValues ? JSON.stringify(entry.previousValues) : null,
    entry.newValues ? JSON.stringify(entry.newValues) : null,
    entry.details || entry.reason || null,
    entry.ipAddress || null,
  ];

  if (client) {
    await client.query(sql, params);
  } else {
    await query(sql, params);
  }
}
