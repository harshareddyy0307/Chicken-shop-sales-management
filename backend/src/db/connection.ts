import pg, { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';

// Ensure DATE fields (OID 1082) are parsed as exact YYYY-MM-DD strings without timezone conversion
pg.types.setTypeParser(1082, (str: string) => str);

const isRemoteDb =
  config.databaseUrl.includes('supabase.co') ||
  config.databaseUrl.includes('pooler.supabase.com') ||
  process.env.DB_SSL === 'true';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: isRemoteDb ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (process.env.DEBUG_SQL === 'true') {
    console.log('Executed query', { text, duration, rows: res.rowCount });
  }
  return res;
}

export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
