import { query, withTransaction } from './connection';
import { initializeDatabase } from './init';
import bcrypt from 'bcryptjs';

export async function seedDatabase() {
  await initializeDatabase();
  console.log('Seeding initial business records...');

  const ownerRes = await query("SELECT id FROM users WHERE username = 'owner'");
  const ownerId = ownerRes.rows[0]?.id || 1;

  // 1. Seed Distributors
  const distributorsData = [
    {
      name: 'Sri Venkateshwara Poultry Farm',
      phone: '+91 98480 12345',
      address: 'Plot 45, Shamshabad Rural, Hyderabad',
      opening_balance: 0,
      notes: 'Primary live bird supplier. Delivers daily around 6:00 AM.',
    },
    {
      name: 'Godavari Broiler Feeds & Birds',
      phone: '+91 94401 56789',
      address: 'Hayathnagar Highway, Hyderabad',
      opening_balance: 15000,
      notes: 'Secondary supplier. Requires net-15 payment terms.',
    },
    {
      name: 'Balaji Broilers Hatcheries',
      phone: '+91 99887 65432',
      address: 'Medchal Industrial Area, Hyderabad',
      opening_balance: 5000,
      notes: 'Backup supplier for weekend bulk orders.',
    },
  ];

  for (const d of distributorsData) {
    const existing = await query('SELECT id FROM distributors WHERE name = $1', [d.name]);
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO distributors (name, phone, address, opening_balance, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [d.name, d.phone, d.address, d.opening_balance, d.notes]
      );
    }
  }

  // 2. Seed Customers for Katha
  const customersData = [
    {
      name: 'Ramesh Kumar (Hotel Green Park)',
      phone: '+91 98765 11111',
      address: 'Shop #18, Main Market Road',
      opening_balance: 1000,
      notes: 'Buys daily 2-5 kg on Katha credit. Settles weekly.',
    },
    {
      name: 'Md. Ismail (Biryani Point)',
      phone: '+91 98765 22222',
      address: 'Beside Clock Tower',
      opening_balance: 2500,
      notes: 'Bulk weekend purchaser.',
    },
    {
      name: 'Suresh Babu',
      phone: '+91 98765 33333',
      address: 'Flat 302, Sai Residency',
      opening_balance: 0,
      notes: 'Regular retail customer.',
    },
    {
      name: 'Anitha Mess & Caterers',
      phone: '+91 98765 44444',
      address: 'Near Old Bus Stand',
      opening_balance: 850,
      notes: 'Weekly credit account.',
    },
  ];

  for (const c of customersData) {
    const existing = await query('SELECT id FROM customers WHERE name = $1', [c.name]);
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO customers (name, phone, address, opening_balance, notes, account_status)
         VALUES ($1, $2, $3, $4, $5, 'Active')`,
        [c.name, c.phone, c.address, c.opening_balance, c.notes]
      );
    }
  }

  // 3. Seed Operating Expenses for current month
  const today = new Date().toISOString().split('T')[0];
  const expensesData = [
    { date: today, category: 'Electricity', desc: 'Shop deep freezer power bill', amount: 3500, method: 'UPI' },
    { date: today, category: 'Labour', desc: 'Daily helper cutting wages', amount: 800, method: 'Cash' },
    { date: today, category: 'Packaging', desc: 'Carry bags and poultry wrapping paper', amount: 450, method: 'Cash' },
    { date: today, category: 'Cleaning', desc: 'Disinfectant phenyl and butcher block wash', amount: 200, method: 'Cash' },
  ];

  for (const exp of expensesData) {
    const existing = await query(
      'SELECT id FROM operating_expenses WHERE expense_date = $1 AND description = $2',
      [exp.date, exp.desc]
    );
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO operating_expenses (expense_date, category, description, amount, payment_method, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [exp.date, exp.category, exp.desc, exp.amount, exp.method, ownerId]
      );
    }
  }

  console.log('Database seeding successfully finished.');
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
