import { pool, query } from '../src/db/connection';
import { initializeDatabase } from '../src/db/init';
import { getTodayKolkata, isFutureDateKolkata } from '../src/utils/date';

async function runCalendarRestrictionsTest() {
  console.log('----------------------------------------------------');
  console.log('🧪 VERIFYING DAILY CLOSING CALENDAR & DATE RESTRICTIONS');
  console.log('----------------------------------------------------\n');

  await initializeDatabase();

  const today = getTodayKolkata();
  console.log(`Current Business Date (Asia/Kolkata): ${today}`);

  // Calculate yesterday, tomorrow, and a far future date
  const todayDate = new Date(`${today}T00:00:00Z`);
  const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
  const tomorrowDate = new Date(todayDate.getTime() + 24 * 60 * 60 * 1000);
  const farFutureDate = new Date(todayDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  const yesterday = yesterdayDate.toISOString().split('T')[0];
  const tomorrow = tomorrowDate.toISOString().split('T')[0];
  const futureStr = farFutureDate.toISOString().split('T')[0];

  console.log(`   - Yesterday: ${yesterday}`);
  console.log(`   - Today:     ${today}`);
  console.log(`   - Tomorrow:  ${tomorrow}`);
  console.log(`   - Future:    ${futureStr}`);

  // Login
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'admin123' }),
  });
  const loginData = (await loginRes.json()) as any;
  const token = loginData.data?.token || loginData.token;

  // 1. Verify Future Date Prevention on GET /api/closing/prefill
  console.log('\n--- 1. Testing Future Date Prevention on /prefill ---');
  const prefillTomorrow = await fetch(`http://localhost:5000/api/closing/prefill?date=${tomorrow}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const prefillTomorrowData = (await prefillTomorrow.json()) as any;
  if (prefillTomorrow.status !== 400 || !prefillTomorrowData.error?.includes('Future-date closing is not allowed')) {
    throw new Error(`Expected 400 rejection for tomorrow on prefill, got ${prefillTomorrow.status}: ${JSON.stringify(prefillTomorrowData)}`);
  }
  console.log('✅ GET /prefill for tomorrow correctly rejected with:', prefillTomorrowData.error);

  const prefillFuture = await fetch(`http://localhost:5000/api/closing/prefill?date=${futureStr}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const prefillFutureData = (await prefillFuture.json()) as any;
  if (prefillFuture.status !== 400 || !prefillFutureData.error?.includes('Future-date closing is not allowed')) {
    throw new Error(`Expected 400 rejection for future date on prefill, got ${prefillFuture.status}`);
  }
  console.log('✅ GET /prefill for future date correctly rejected with:', prefillFutureData.error);

  // 2. Verify Future Date Prevention on POST /api/closing/save
  console.log('\n--- 2. Testing Future Date Prevention on /save ---');
  const saveTomorrow = await fetch('http://localhost:5000/api/closing/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      businessDate: tomorrow,
      isDraft: true,
      counterCollection: { cash: 1000 },
    }),
  });
  const saveTomorrowData = (await saveTomorrow.json()) as any;
  if (saveTomorrow.status !== 400 || !saveTomorrowData.error?.includes('Future-date closing is not allowed')) {
    throw new Error(`Expected 400 rejection for tomorrow on save, got ${saveTomorrow.status}: ${JSON.stringify(saveTomorrowData)}`);
  }
  console.log('✅ POST /save for tomorrow correctly rejected with:', saveTomorrowData.error);

  // 3. Verify Today and Historical Dates Allowed on GET /prefill
  console.log('\n--- 3. Testing Allowed Dates on /prefill ---');
  const prefillToday = await fetch(`http://localhost:5000/api/closing/prefill?date=${today}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const prefillTodayData = (await prefillToday.json()) as any;
  if (prefillToday.status !== 200 || !prefillTodayData.success) {
    throw new Error(`Expected 200 for today on prefill, got ${prefillToday.status}: ${JSON.stringify(prefillTodayData)}`);
  }
  console.log('✅ GET /prefill for today allowed successfully.');

  const prefillYesterday = await fetch(`http://localhost:5000/api/closing/prefill?date=${yesterday}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const prefillYesterdayData = (await prefillYesterday.json()) as any;
  if (prefillYesterday.status !== 200 || !prefillYesterdayData.success) {
    throw new Error(`Expected 200 for yesterday on prefill, got ${prefillYesterday.status}`);
  }
  console.log('✅ GET /prefill for yesterday allowed successfully.');

  // 4. Verify Calendar Status Endpoint (GET /api/closing/calendar-status)
  console.log('\n--- 4. Testing GET /api/closing/calendar-status ---');
  // Cleanup test dates
  await query('DELETE FROM daily_closings WHERE business_date = $1', [yesterday]);
  await query('DELETE FROM distributor_supplies WHERE supply_date = $1', [yesterday]);

  // Save a completed closing for yesterday
  const saveYesterday = await fetch('http://localhost:5000/api/closing/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      businessDate: yesterday,
      isDraft: false,
      purchases: [{ distributorName: 'SR Poultry', weightKg: 50, pricePerKg: 100 }],
      counterCollection: { cash: 5000, upi: 0, card: 0, other: 0 },
      stockAndSales: {
        openingStockKg: 20,
        openingStockRatePerKg: 100,
        openingStockAmount: 2000,
        newStockKg: 50,
        closingStockKg: 10,
        closingStockRatePerKg: 100,
        closingStockAmount: 1000,
        sellingPricePerKg: 100,
      },
      eggStockAndSales: {
        openingStock: 0,
        openingStockRate: 0,
        openingStockAmount: 0,
        newStock: 0,
        purchaseRate: 0,
        purchaseCost: 0,
        closingStock: 0,
        closingStockRate: 0,
        closingStockAmount: 0,
      },
    }),
  });
  const saveYesterdayData = (await saveYesterday.json()) as any;
  if (!saveYesterdayData.success) {
    throw new Error(`Failed to save completed closing for yesterday: ${JSON.stringify(saveYesterdayData)}`);
  }
  const completedClosingId = saveYesterdayData.data.id;
  console.log(`✅ Completed closing saved for ${yesterday} (ID: ${completedClosingId})`);

  // Query calendar status
  const [yearStr, monthStr] = yesterday.split('-');
  const monthKey = `${yearStr}-${monthStr}`;
  const calStatusRes = await fetch(`http://localhost:5000/api/closing/calendar-status?month=${monthKey}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const calStatusData = (await calStatusRes.json()) as any;
  if (!calStatusData.success || !calStatusData.data[yesterday]) {
    throw new Error(`Calendar status failed to return yesterday closing: ${JSON.stringify(calStatusData)}`);
  }
  const statusRecord = calStatusData.data[yesterday];
  console.log(`✅ Calendar Status for ${yesterday}:`, statusRecord.status);
  if (statusRecord.status !== 'Completed') {
    throw new Error(`Expected Completed status for ${yesterday}, got ${statusRecord.status}`);
  }
  console.log('✅ Date correctly identified as Completed & Locked (Light Green: #DCFCE7)');

  // 5. Test Reopening Updates Status to Reopened (Light Red)
  console.log('\n--- 5. Testing Reopening updates Calendar Status ---');
  const reopenRes = await fetch(`http://localhost:5000/api/closing/${completedClosingId}/reopen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason: 'Owner correction of counter collection' }),
  });
  const reopenData = (await reopenRes.json()) as any;
  if (!reopenData.success) {
    throw new Error(`Failed to reopen closing: ${JSON.stringify(reopenData)}`);
  }
  console.log('✅ Daily closing successfully reopened.');

  // Re-check calendar status
  const calStatusAfterReopen = await fetch(`http://localhost:5000/api/closing/calendar-status?month=${monthKey}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const calStatusAfterData = (await calStatusAfterReopen.json()) as any;
  const reopenedStatus = calStatusAfterData.data[yesterday]?.status;
  console.log(`✅ Calendar Status after reopen for ${yesterday}:`, reopenedStatus);
  if (reopenedStatus !== 'Reopened') {
    throw new Error(`Expected Reopened status for ${yesterday}, got ${reopenedStatus}`);
  }
  console.log('✅ Date correctly identified as Not Completed & Locked (Light Red: #FEE2E2)');

  // 6. Test Duplicate Daily Closing Prevention
  console.log('\n--- 6. Testing Duplicate Daily Closing Prevention ---');
  // Complete it again
  await fetch('http://localhost:5000/api/closing/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      businessDate: yesterday,
      isDraft: false,
      purchases: [{ distributorName: 'SR Poultry', weightKg: 50, pricePerKg: 100 }],
      counterCollection: { cash: 5000, upi: 0, card: 0, other: 0 },
      stockAndSales: {
        openingStockKg: 20,
        openingStockRatePerKg: 100,
        openingStockAmount: 2000,
        newStockKg: 50,
        closingStockKg: 10,
        closingStockRatePerKg: 100,
        closingStockAmount: 1000,
        sellingPricePerKg: 100,
      },
      eggStockAndSales: {
        openingStock: 0,
        openingStockRate: 0,
        openingStockAmount: 0,
        newStock: 0,
        purchaseRate: 0,
        purchaseCost: 0,
        closingStock: 0,
        closingStockRate: 0,
        closingStockAmount: 0,
      },
    }),
  });

  // Attempting another final submission without reopening must fail
  const dupSubmit = await fetch('http://localhost:5000/api/closing/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      businessDate: yesterday,
      isDraft: false,
      counterCollection: { cash: 6000 },
    }),
  });
  const dupSubmitData = (await dupSubmit.json()) as any;
  if (dupSubmit.status !== 400 || !dupSubmitData.error?.includes('already been completed')) {
    throw new Error(`Expected 400 duplicate submission prevention, got ${dupSubmit.status}: ${JSON.stringify(dupSubmitData)}`);
  }
  console.log('✅ Duplicate final submission correctly blocked with:', dupSubmitData.error);

  // Cleanup test dates
  await query('DELETE FROM daily_closings WHERE business_date = $1', [yesterday]);
  await query('DELETE FROM distributor_supplies WHERE supply_date = $1', [yesterday]);
  await pool.end();

  console.log('\n🎉 ALL CALENDAR & DATE RESTRICTION TESTS PASSED SUCCESSFULLY!');
}

runCalendarRestrictionsTest().catch(async (err) => {
  console.error('❌ Test failed:', err);
  await pool.end();
  process.exit(1);
});
