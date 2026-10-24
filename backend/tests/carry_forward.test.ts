import { pool, query } from '../src/db/connection';
import { initializeDatabase } from '../src/db/init';

async function runCarryForwardTest() {
  console.log('----------------------------------------------------');
  console.log('🧪 TESTING AUTOMATIC PREVIOUS CLOSING CARRY-FORWARD');
  console.log('----------------------------------------------------\n');

  await initializeDatabase();

  const day1 = '2026-11-01';
  const day2 = '2026-11-02';

  // Cleanup test dates
  await query('DELETE FROM daily_closings WHERE business_date IN ($1, $2)', [day1, day2]);
  await query('DELETE FROM distributor_supplies WHERE supply_date IN ($1, $2)', [day1, day2]);
  await query('DELETE FROM inventory_transactions WHERE txn_date IN ($1, $2)', [day1, day2]);

  // Login as owner
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'admin123' }),
  });
  const loginData = (await loginRes.json()) as any;
  const token = loginData.data?.token || loginData.token;
  if (!token) throw new Error('Login failed: ' + JSON.stringify(loginData));

  // 1. Submit Day 1 Closing with Chicken Closing Stock = 84.97 kg, Egg Closing Stock = 120 eggs
  console.log('--- Step 1: Submitting Day 1 Closing (2026-11-01) ---');
  const day1Payload = {
    businessDate: day1,
    isDraft: false,
    purchases: [
      {
        distributorName: 'SR Poultry',
        weightKg: 100,
        pricePerKg: 180,
        notes: 'Day 1 delivery',
      },
    ],
    counterCollection: {
      cash: 10000,
      upi: 5000,
      card: 0,
      other: 0,
    },
    stockAndSales: {
      openingStockKg: 10,
      openingStockRatePerKg: 180,
      openingStockAmount: 1800,
      newStockKg: 100,
      closingStockKg: 84.97,
      closingStockRatePerKg: 180,
      closingStockAmount: 15294.6,
      sellingPricePerKg: 240,
    },
    eggStockAndSales: {
      openingStock: 50,
      openingStockRate: 6,
      openingStockAmount: 300,
      newStock: 200,
      purchaseRate: 5.5,
      purchaseCost: 1100,
      closingStock: 120,
      closingStockRate: 6.5,
      closingStockAmount: 780,
    },
    notes: 'Day 1 Finalized',
  };

  const day1Res = await fetch('http://localhost:5000/api/closing/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(day1Payload),
  });
  const day1Data = (await day1Res.json()) as any;
  if (!day1Data.success) {
    throw new Error('Day 1 submission failed: ' + JSON.stringify(day1Data));
  }
  console.log('✅ Day 1 Closing completed:');
  console.log('   - Chicken Closing Stock:', day1Data.data.closing_stock_kg, 'kg');
  console.log('   - Egg Closing Stock:', day1Data.data.egg_closing_stock, 'eggs');

  // 2. Fetch Day 2 Prefill
  console.log('\n--- Step 2: Fetching Day 2 (2026-11-02) Prefill ---');
  const day2PrefillRes = await fetch(`http://localhost:5000/api/closing/prefill?date=${day2}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const day2Prefill = (await day2PrefillRes.json()) as any;
  if (!day2Prefill.success) {
    throw new Error('Day 2 prefill failed: ' + JSON.stringify(day2Prefill));
  }

  const sug = day2Prefill.data.suggested;
  console.log('Day 2 Prefill Suggested:');
  console.log('   - suggested.openingStockKg:', sug.openingStockKg, 'kg');
  console.log('   - suggested.previousClosingStockKg:', sug.previousClosingStockKg, 'kg');
  console.log('   - suggested.hasPreviousClosing:', sug.hasPreviousClosing);
  console.log('   - suggested.eggOpeningStock:', sug.eggOpeningStock, 'eggs');
  console.log('   - suggested.previousEggClosingStock:', sug.previousEggClosingStock, 'eggs');
  console.log('   - suggested.hasPreviousEggClosing:', sug.hasPreviousEggClosing);
  console.log('   - suggested.eggOpeningStockRate: ₹' + sug.eggOpeningStockRate + '/egg');

  if (parseFloat(sug.openingStockKg) !== 84.97) {
    throw new Error(`Expected Chicken Opening Stock 84.97 but got ${sug.openingStockKg}`);
  }
  if (Number(sug.eggOpeningStock) !== 120) {
    throw new Error(`Expected Egg Opening Stock 120 but got ${sug.eggOpeningStock}`);
  }
  if (!sug.hasPreviousEggClosing) {
    throw new Error('Expected hasPreviousEggClosing to be true');
  }
  console.log('✅ Day 2 Prefill correctly suggests Day 1 closing stock for BOTH Chicken and Eggs!');

  // 3. Submit Day 2 Closing WITHOUT passing openingStock (auto-carry forward in backend /save)
  console.log('\n--- Step 3: Submitting Day 2 Closing with auto carry-forward ---');
  const day2Payload = {
    businessDate: day2,
    isDraft: false,
    purchases: [],
    counterCollection: { cash: 5000, upi: 2000, card: 0, other: 0 },
    stockAndSales: {
      // openingStock omitted/0 -> backend auto-carries forward Day 1's 84.97 kg
      newStockKg: 0,
      closingStockKg: 40,
      sellingPricePerKg: 240,
    },
    eggStockAndSales: {
      // openingStock omitted/0 -> backend auto-carries forward Day 1's 120 eggs
      newStock: 0,
      closingStock: 50,
      closingStockRate: 6.5,
    },
    notes: 'Day 2 Finalized',
  };

  const day2Res = await fetch('http://localhost:5000/api/closing/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(day2Payload),
  });
  const day2Data = (await day2Res.json()) as any;
  if (!day2Data.success) {
    throw new Error('Day 2 submission failed: ' + JSON.stringify(day2Data));
  }

  console.log('✅ Day 2 Saved Record:');
  console.log('   - opening_stock_kg:', day2Data.data.opening_stock_kg, 'kg (Expected: 84.970)');
  console.log('   - egg_opening_stock:', day2Data.data.egg_opening_stock, 'eggs (Expected: 120.00)');

  if (parseFloat(day2Data.data.opening_stock_kg) !== 84.97) {
    throw new Error(`Expected Day 2 opening stock 84.970 but got ${day2Data.data.opening_stock_kg}`);
  }
  if (parseFloat(day2Data.data.egg_opening_stock) !== 120) {
    throw new Error(`Expected Day 2 egg opening stock 120.00 but got ${day2Data.data.egg_opening_stock}`);
  }

  // Cleanup test dates
  await query('DELETE FROM daily_closings WHERE business_date IN ($1, $2)', [day1, day2]);
  await query('DELETE FROM distributor_supplies WHERE supply_date IN ($1, $2)', [day1, day2]);
  await query('DELETE FROM inventory_transactions WHERE txn_date IN ($1, $2)', [day1, day2]);

  await pool.end();
  console.log('\n🎉 ALL AUTOMATIC CARRY-FORWARD TESTS PASSED SUCCESSFULLY!');
}

runCarryForwardTest().catch(async (err) => {
  console.error('❌ Test failed:', err);
  await pool.end();
  process.exit(1);
});
