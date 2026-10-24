import { pool, query } from './connection';
import { initializeDatabase } from './init';
import fs from 'fs';
import path from 'path';

export async function clearAllData(keepUsers: boolean = true): Promise<void> {
  console.log('Clearing all chicken shop business records...');

  const tablesToTruncate = [
    'audit_logs',
    'financial_adjustments',
    'daily_closing_purchases',
    'daily_closings',
    'chicken_sales',
    'customer_payments',
    'customer_bills',
    'distributor_payments',
    'distributor_supplies',
    'inventory_transactions',
    'operating_expenses',
    'customers',
    'distributors',
  ];

  if (!keepUsers) {
    tablesToTruncate.push('users');
  }

  const truncateQuery = `TRUNCATE TABLE ${tablesToTruncate.join(', ')} RESTART IDENTITY CASCADE;`;
  await pool.query(truncateQuery);
  console.log(`Successfully truncated tables: ${tablesToTruncate.join(', ')}`);

  // Clean uploaded receipt screenshots if any exist
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    for (const file of files) {
      if (file !== '.gitkeep') {
        try {
          fs.unlinkSync(path.join(uploadsDir, file));
        } catch (e) {
          // ignore error
        }
      }
    }
    console.log('Cleaned uploads directory.');
  }

  // Ensure default admin/staff credentials and categories are present
  await initializeDatabase();
  console.log('Clean slate ready! All data removed.');
}

if (require.main === module) {
  clearAllData(true)
    .then(() => {
      console.log('====================================================');
      console.log(' ALL BUSINESS DATA HAS BEEN REMOVED SUCCESSFULLY!   ');
      console.log(' Database is now completely clean & fresh.           ');
      console.log('====================================================');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error clearing data:', err);
      process.exit(1);
    });
}
