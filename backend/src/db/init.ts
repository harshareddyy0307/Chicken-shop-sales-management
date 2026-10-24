import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { pool, query } from './connection';

export async function initializeDatabase(): Promise<void> {
  console.log('Initializing database schema...');
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Execute schema
  try {
    const checkRes = await pool.query(
      "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'daily_closings')"
    );
    const existingCount = parseInt(checkRes.rows[0]?.count || '0', 10);
    if (existingCount < 2) {
      await pool.query(schemaSql);
    } else {
      console.log('Database tables already initialized.');
    }
  } catch (err: any) {
    if (err.code === '42501' || err.message?.includes('must be owner')) {
      console.log('Notice: Tables already created by superuser; schema structure preserved.');
    } else {
      console.warn('Notice during schema verification:', err.message);
    }
  }

  // Column migrations for daily_closings
  try {
    await pool.query(`
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS opening_stock_rate_per_kg NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS opening_stock_amount NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS total_available_stock_cost NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS closing_stock_rate_per_kg NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS closing_stock_amount NUMERIC(12, 2) DEFAULT 0;

      -- Egg stock and daily sales columns
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_opening_stock NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_opening_stock_rate NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_opening_stock_amount NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_new_stock NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_purchase_rate NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_purchase_cost NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_total_available_stock NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_total_available_cost NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_closing_stock NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_closing_stock_rate NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_closing_stock_amount NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_quantity_sold NUMERIC(10, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS egg_sales_revenue NUMERIC(12, 2) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS total_sales_revenue NUMERIC(12, 2) DEFAULT 0;

      -- Stock transfer columns
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS stock_transferred_kg NUMERIC(10, 3) DEFAULT 0;
      ALTER TABLE daily_closings ADD COLUMN IF NOT EXISTS stock_available_for_sale_kg NUMERIC(10, 3) DEFAULT 0;

      -- Stock transfers table
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id SERIAL PRIMARY KEY,
        transfer_date DATE NOT NULL,
        source_shop VARCHAR(100) NOT NULL DEFAULT 'Reddy Chicken and Mutton Center',
        destination_shop VARCHAR(100) NOT NULL,
        weight_kg NUMERIC(10, 3) NOT NULL CHECK (weight_kg > 0),
        cost_per_kg NUMERIC(12, 2) DEFAULT 0 CHECK (cost_per_kg >= 0),
        total_cost NUMERIC(12, 2) DEFAULT 0 CHECK (total_cost >= 0),
        daily_closing_id INTEGER REFERENCES daily_closings(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Completed' CHECK (status IN ('Completed', 'Cancelled')),
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_stock_transfers_date ON stock_transfers(transfer_date);
      CREATE INDEX IF NOT EXISTS idx_stock_transfers_dest ON stock_transfers(destination_shop);

      -- Ensure inventory_transactions supports transfer_out and transfer_in
      DO $$ 
      BEGIN
        ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_txn_type_check;
        ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_txn_type_check 
          CHECK (txn_type IN ('opening', 'supply_in', 'sales_out', 'adjustment', 'closing', 'transfer_out', 'transfer_in'));
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $$;

      -- Users schema enhancements for Phone + 4-digit PIN authentication
      ALTER TABLE users ADD COLUMN IF NOT EXISTS normalized_phone VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INT DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_normalized_phone ON users(normalized_phone) WHERE normalized_phone IS NOT NULL;

      -- Customer bills enhancements for multiple item types (Skinless, Dressed, Boneless, Liver, Eggs, Natukodi, Masala)
      ALTER TABLE customer_bills ADD COLUMN IF NOT EXISTS items JSONB;
      DO $$
      BEGIN
        ALTER TABLE customer_bills DROP CONSTRAINT IF EXISTS customer_bills_weight_kg_check;
        ALTER TABLE customer_bills ADD CONSTRAINT customer_bills_weight_kg_check CHECK (weight_kg >= 0);
        ALTER TABLE customer_bills ALTER COLUMN weight_kg SET DEFAULT 0;

        ALTER TABLE chicken_sales DROP CONSTRAINT IF EXISTS chicken_sales_weight_sold_kg_check;
        ALTER TABLE chicken_sales ADD CONSTRAINT chicken_sales_weight_sold_kg_check CHECK (weight_sold_kg >= 0);
        ALTER TABLE chicken_sales ALTER COLUMN weight_sold_kg SET DEFAULT 0;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $$;
    `);
  } catch (err: any) {
    if (err.code === '42501' || err.message?.includes('must be owner')) {
      console.log('Notice: Alter migrations skipped (columns already present).');
    } else {
      console.warn('Notice running migrations:', err.message);
    }
  }

  console.log('Schema tables and indices ensured.');

  // Default expense categories
  const categories = [
    'Shop Rent',
    'Electricity',
    'Water',
    'Transport',
    'Labour',
    'Packaging',
    'Cleaning',
    'Repairs',
    'Maintenance',
    'Miscellaneous',
  ];

  for (const cat of categories) {
    await query(
      `INSERT INTO expense_categories (name, is_default)
       VALUES ($1, true)
       ON CONFLICT (name) DO NOTHING`,
      [cat]
    );
  }

  // Ensure default shop settings
  await query(
    `INSERT INTO shop_settings (id, shop_name, address, phone, currency, date_format)
     VALUES (1, 'Reddy Chicken and Mutton Center', 'old alwal secenderabad', '7989856610', '₹', 'DD-MM-YYYY')
     ON CONFLICT (id) DO NOTHING`
  );

  // Default Users: Owner, Manager, Staff with 4-Digit PINs
  const defaultUsers = [
    {
      username: 'owner',
      fullName: 'Harsha Reddy (Owner)',
      role: 'owner',
      phone: '+91 7989856610',
      normalizedPhone: '7989856610',
      pin: '1234',
    },
    {
      username: 'manager',
      fullName: 'Raju (Shop Manager)',
      role: 'manager',
      phone: '+91 98765 43211',
      normalizedPhone: '9876543211',
      pin: '2345',
    },
    {
      username: 'staff',
      fullName: 'Kiran (Counter Staff)',
      role: 'staff',
      phone: '+91 98765 43212',
      normalizedPhone: '9876543212',
      pin: '3456',
    },
  ];

  for (const u of defaultUsers) {
    const pinHash = await bcrypt.hash(u.pin, 10);
    const existing = await query('SELECT * FROM users WHERE username = $1 OR normalized_phone = $2', [u.username, u.normalizedPhone]);

    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO users (username, password_hash, pin_hash, full_name, role, phone, normalized_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [u.username, pinHash, pinHash, u.fullName, u.role, u.phone, u.normalizedPhone]
      );
      console.log(`Created default user: ${u.fullName} (Phone: ${u.phone}, PIN: ${u.pin})`);
    } else {
      const row = existing.rows[0];
      // Update normalized_phone and pin_hash if not set
      await query(
        `UPDATE users
         SET normalized_phone = COALESCE(normalized_phone, $1),
             phone = COALESCE(phone, $2),
             pin_hash = COALESCE(pin_hash, $3)
         WHERE id = $4`,
        [u.normalizedPhone, u.phone, pinHash, row.id]
      );
      // For owner, ensure Harsha Reddy's phone is set to 7989856610
      if (u.username === 'owner' && row.normalized_phone !== '7989856610') {
        await query(
          `UPDATE users SET normalized_phone = $1, phone = $2, pin_hash = $3 WHERE id = $4`,
          [u.normalizedPhone, u.phone, pinHash, row.id]
        );
      }
    }
  }

  // Ensure default distributor SR Poultry is always present
  const distCheck = await query('SELECT id FROM distributors WHERE LOWER(name) = LOWER($1)', ['SR Poultry']);
  if (distCheck.rows.length === 0) {
    await query(
      `INSERT INTO distributors (name, opening_balance, is_active)
       VALUES ('SR Poultry', 0, true)`
    );
    console.log('Ensured default distributor: SR Poultry');
  }

  console.log('Database initialization complete.');

  // Sync historical closing purchases into distributor supplies
  await syncHistoricalClosingPurchases();
}

export async function syncHistoricalClosingPurchases(): Promise<void> {
  try {
    const unlinked = await pool.query(`
      SELECT p.id as purchase_id, p.daily_closing_id, p.distributor_id, p.distributor_name, 
             p.weight_kg, p.price_per_kg, p.total_amount, p.notes,
             c.business_date, c.submitted_by
      FROM daily_closing_purchases p
      JOIN daily_closings c ON p.daily_closing_id = c.id
      WHERE (p.distributor_supply_id IS NULL OR p.distributor_id IS NULL) AND p.weight_kg > 0
    `);

    for (const row of unlinked.rows) {
      let distId = row.distributor_id;
      let distName = (row.distributor_name || '').trim();
      if (!distId) {
        if (!distName) distName = 'Supplier';
        const dRes = await pool.query(
          'SELECT id, name FROM distributors WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1',
          [distName]
        );
        if (dRes.rows.length > 0) {
          distId = dRes.rows[0].id;
        } else {
          const insD = await pool.query(
            'INSERT INTO distributors (name, opening_balance, is_active) VALUES ($1, 0, true) RETURNING id',
            [distName]
          );
          distId = insD.rows[0].id;
        }
      }

      // Check if distributor_supplies already has a matching entry for this closing and distributor
      const existSup = await pool.query(
        'SELECT id FROM distributor_supplies WHERE daily_closing_id = $1 AND distributor_id = $2 AND supply_date = $3 LIMIT 1',
        [row.daily_closing_id, distId, row.business_date]
      );
      let supplyId: number;
      if (existSup.rows.length > 0) {
        supplyId = existSup.rows[0].id;
      } else {
        const insSup = await pool.query(
          `INSERT INTO distributor_supplies (
            distributor_id, supply_date, weight_kg, price_per_kg, total_amount, notes, daily_closing_id, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id`,
          [
            distId,
            row.business_date,
            row.weight_kg,
            row.price_per_kg,
            row.total_amount,
            row.notes || 'Recorded via Daily Closing',
            row.daily_closing_id,
            row.submitted_by || 1,
          ]
        );
        supplyId = insSup.rows[0].id;
      }

      await pool.query(
        'UPDATE daily_closing_purchases SET distributor_id = $1, distributor_supply_id = $2 WHERE id = $3',
        [distId, supplyId, row.purchase_id]
      );
      console.log(`Synced closing purchase #${row.purchase_id} to distributor_supply #${supplyId}`);
    }
  } catch (err) {
    console.error('Error syncing historical closing purchases:', err);
  }
}

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('Database setup successful.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Database setup failed:', err);
      process.exit(1);
    });
}
