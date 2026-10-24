import { pool, query } from '../src/db/connection';
import { initializeDatabase } from '../src/db/init';

async function runRevenueTest() {
  console.log('----------------------------------------------------');
  console.log('🧪 VERIFYING CHICKEN SALES REVENUE FORMULA');
  console.log('   Chicken Sales Revenue = Total Inventory Cost − Total Closing Stock Amount');
  console.log('----------------------------------------------------\n');

  await initializeDatabase();

  const testDate = '2026-10-17';

  // Cleanup
  await query('DELETE FROM daily_closings WHERE business_date = $1', [testDate]);
  await query('DELETE FROM distributor_supplies WHERE supply_date = $1', [testDate]);

  // Login
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'admin123' }),
  });
  const loginData = (await loginRes.json()) as any;
  const token = loginData.data?.token || loginData.token;

  // Exact scenario from user screenshot:
  // Total Inventory Cost: ₹17,230.20
  // Opening: 39.00 kg @ ~₹117 = ₹4,563.00
  // Purchases: 113.10 kg @ ₹112 = ₹12,667.20
  // Total Inventory Cost = 4563 + 12667.20 = ₹17,230.20
  // Closing Stock: 66.00 kg @ ₹112 = ₹7,392.00
  // Expected Chicken Sales Revenue = 17,230.20 - 7,392.00 = ₹9,838.20!

  const payload = {
    businessDate: testDate,
    isDraft: false,
    purchases: [
      {
        distributorName: 'SR Poultry',
        weightKg: 113.1,
        pricePerKg: 112,
        notes: 'Delivery',
      },
    ],
    counterCollection: { cash: 9838.2, upi: 0, card: 0, other: 0 },
    stockAndSales: {
      openingStockKg: 39.0,
      openingStockRatePerKg: 117,
      openingStockAmount: 4563.0,
      newStockKg: 113.1,
      closingStockKg: 66.0,
      closingStockRatePerKg: 112,
      closingStockAmount: 7392.0,
      sellingPricePerKg: 112,
    },
    eggStockAndSales: {
      openingStock: 100,
      openingStockRate: 6,
      openingStockAmount: 600,
      newStock: 0,
      purchaseCost: 0,
      closingStock: 40,
      closingStockRate: 7,
      closingStockAmount: 280,
    },
    notes: 'Testing chicken sales revenue = inventory cost - closing amount',
  };

  const res = await fetch('http://localhost:5000/api/closing/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as any;
  if (!data.success) {
    throw new Error('Save failed: ' + JSON.stringify(data));
  }

  const c = data.data;
  console.log('Server Saved Record:');
  console.log('   - total_available_stock_cost:', c.total_available_stock_cost);
  console.log('   - closing_stock_amount:', c.closing_stock_amount);
  console.log('   - chicken_sales_revenue:', c.chicken_sales_revenue);
  console.log('   - egg_sales_revenue:', c.egg_sales_revenue);

  const expectedChickenRevenue = 17230.2 - 7392.0; // 9838.20
  if (Math.abs(parseFloat(c.chicken_sales_revenue) - expectedChickenRevenue) > 0.01) {
    throw new Error(`Expected Chicken Sales Revenue ${expectedChickenRevenue} but got ${c.chicken_sales_revenue}`);
  }
  console.log(`✅ Chicken Sales Revenue correctly calculated as: ₹17,230.20 − ₹7,392.00 = ₹${c.chicken_sales_revenue}`);

  // Eggs: 100 available - 40 closing = 60 sold * 7/egg = 420.00
  const expectedEggRevenue = 60 * 7;
  if (Math.abs(parseFloat(c.egg_sales_revenue) - expectedEggRevenue) > 0.01) {
    throw new Error(`Egg calculation was altered! Expected ${expectedEggRevenue} but got ${c.egg_sales_revenue}`);
  }
  console.log(`✅ Egg Sales Revenue remains untouched: 60 eggs sold × ₹7/egg = ₹${c.egg_sales_revenue}`);

  // Cleanup
  await query('DELETE FROM daily_closings WHERE business_date = $1', [testDate]);
  await query('DELETE FROM distributor_supplies WHERE supply_date = $1', [testDate]);
  await pool.end();
  console.log('\n🎉 ALL REVENUE FORMULA TESTS PASSED!');
}

runRevenueTest().catch(async (err) => {
  console.error('❌ Test failed:', err);
  await pool.end();
  process.exit(1);
});
