import { pool, query } from '../src/db/connection';
import { initializeDatabase } from '../src/db/init';

async function runProfitTest() {
  console.log('----------------------------------------------------');
  console.log('🧪 VERIFYING ESTIMATED NET DAILY PROFIT FORMULA');
  console.log('   Profit = Total Counter Collection − Chicken Sales Revenue − Egg Sales Revenue ± Adjustments');
  console.log('----------------------------------------------------\n');

  await initializeDatabase();

  const testDate = '2026-10-18';

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

  // Scenario 1: Exactly matching user screenshot numbers
  // Total Counter Collection: 16,155.00
  // Chicken Sales Revenue: 9,681.80 (e.g. Inventory Cost 17,073.80 - Closing Amount 7,392.00)
  // Egg Sales Revenue: 2,052.00 (e.g. 342 eggs @ 6)
  // No adjustments
  // Expected Profit = 16,155.00 - 9,681.80 - 2,052.00 = 4,421.20
  const payload1 = {
    businessDate: testDate,
    isDraft: false,
    purchases: [
      {
        distributorName: 'SR Poultry',
        weightKg: 100,
        pricePerKg: 120,
        notes: 'Delivery',
      },
    ],
    counterCollection: { cash: 16155.0, upi: 0, card: 0, other: 0 },
    stockAndSales: {
      openingStockKg: 42.28,
      openingStockRatePerKg: 120,
      openingStockAmount: 5073.8, // 5073.8 + 12000 = 17,073.80
      newStockKg: 100,
      closingStockKg: 61.6,
      closingStockRatePerKg: 120,
      closingStockAmount: 7392.0, // 17,073.80 - 7,392.00 = 9,681.80 chicken sales revenue
      sellingPricePerKg: 120,
    },
    eggStockAndSales: {
      openingStock: 500,
      openingStockRate: 6,
      openingStockAmount: 3000,
      newStock: 0,
      purchaseCost: 0,
      closingStock: 158,
      closingStockRate: 6,
      closingStockAmount: 948, // 342 eggs sold * 6 = 2,052.00 egg sales revenue
    },
    adjustments: [],
    notes: 'Testing Net Daily Profit without adjustments',
  };

  const res1 = await fetch('http://localhost:5000/api/closing/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload1),
  });
  const data1 = (await res1.json()) as any;
  if (!data1.success) {
    throw new Error('Save 1 failed: ' + JSON.stringify(data1));
  }

  const c1 = data1.data;
  console.log('Scenario 1 Server Saved Record:');
  console.log('   - total_counter_collection:', c1.total_counter_collection);
  console.log('   - chicken_sales_revenue:', c1.chicken_sales_revenue);
  console.log('   - egg_sales_revenue:', c1.egg_sales_revenue);
  console.log('   - estimated_gross_profit:', c1.estimated_gross_profit);
  console.log('   - estimated_net_profit:', c1.estimated_net_profit);

  const expectedProfit1 = 16155.0 - 9681.8 - 2052.0; // 4421.20
  if (Math.abs(parseFloat(c1.estimated_net_profit) - expectedProfit1) > 0.01) {
    throw new Error(`Expected Profit ${expectedProfit1} but got ${c1.estimated_net_profit}`);
  }
  console.log(`✅ Scenario 1: ₹16,155.00 − ₹9,681.80 − ₹2,052.00 = ₹${c1.estimated_net_profit}`);

  // Scenario 2: With Other Income & Expenses / Adjustments
  const testDate2 = '2026-10-19';
  await query('DELETE FROM daily_closings WHERE business_date = $1', [testDate2]);
  await query('DELETE FROM distributor_supplies WHERE supply_date = $1', [testDate2]);

  // Additional Income: ₹500 (Gunny bags sale)
  // Expense: ₹200 (Ice transport)
  // Net Adjustments = +₹300
  // Expected Profit = 4,421.20 + 300 = 4,721.20
  const payload2 = {
    ...payload1,
    businessDate: testDate2,
    adjustments: [
      { type: 'Additional Income', amount: 500, reason: 'Scrap bags sold' },
      { type: 'Expense', amount: 200, reason: 'Ice transport' },
    ],
    notes: 'Testing Net Daily Profit with adjustments',
  };

  const res2 = await fetch('http://localhost:5000/api/closing/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload2),
  });
  const data2 = (await res2.json()) as any;
  if (!data2.success) {
    throw new Error('Save 2 failed: ' + JSON.stringify(data2));
  }

  const c2 = data2.data;
  console.log('\nScenario 2 (With Adjustments) Server Saved Record:');
  console.log('   - total_counter_collection:', c2.total_counter_collection);
  console.log('   - chicken_sales_revenue:', c2.chicken_sales_revenue);
  console.log('   - egg_sales_revenue:', c2.egg_sales_revenue);
  console.log('   - adjustments_amount:', c2.adjustments_amount);
  console.log('   - estimated_gross_profit:', c2.estimated_gross_profit);
  console.log('   - estimated_net_profit:', c2.estimated_net_profit);

  const expectedProfit2 = 4421.2 + 300.0; // 4721.20
  if (Math.abs(parseFloat(c2.estimated_net_profit) - expectedProfit2) > 0.01) {
    throw new Error(`Expected Profit ${expectedProfit2} but got ${c2.estimated_net_profit}`);
  }
  console.log(`✅ Scenario 2: ₹16,155.00 − ₹9,681.80 − ₹2,052.00 + ₹300.00 = ₹${c2.estimated_net_profit}`);

  // Cleanup
  await query('DELETE FROM daily_closings WHERE business_date = $1', [testDate]);
  await query('DELETE FROM distributor_supplies WHERE supply_date = $1', [testDate]);
  await query('DELETE FROM daily_closings WHERE business_date = $1', [testDate2]);
  await query('DELETE FROM distributor_supplies WHERE supply_date = $1', [testDate2]);
  await pool.end();
  console.log('\n🎉 ALL PROFIT FORMULA TESTS PASSED SUCCESSFULLY!');
}

runProfitTest().catch(async (err) => {
  console.error('❌ Test failed:', err);
  await pool.end();
  process.exit(1);
});
