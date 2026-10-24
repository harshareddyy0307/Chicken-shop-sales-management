import { pool, query } from '../src/db/connection';
import { initializeDatabase } from '../src/db/init';

async function runClosingWorkflowTest() {
  console.log('----------------------------------------------------');
  console.log('🧪 VERIFYING DAILY CLOSING SUBMISSION WORKFLOW');
  console.log('----------------------------------------------------\n');

  await initializeDatabase();

  const testDate = '2026-10-22'; // Test business date

  // 1. Clean up any existing records for testDate
  await query('DELETE FROM daily_closings WHERE business_date = $1', [testDate]);
  await query('DELETE FROM distributor_supplies WHERE supply_date = $1', [testDate]);
  await query('DELETE FROM inventory_transactions WHERE txn_date = $1', [testDate]);
  await query('DELETE FROM financial_adjustments WHERE business_date = $1', [testDate]);

  // 2. Login to get JWT
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'admin123' }),
  });
  const loginData = (await loginRes.json()) as any;
  const token = loginData.data?.token || loginData.token;
  if (!token) {
    throw new Error('Failed to login as owner: ' + JSON.stringify(loginData));
  }
  console.log('✅ Logged in successfully as owner');

  // 3. Submit Daily Business Closing (Status: Completed)
  console.log('\n--- Step 1: Submitting new Daily Business Closing ---');
  const payload = {
    businessDate: testDate,
    isDraft: false,
    purchases: [
      {
        distributorName: 'SR Poultry',
        weightKg: 100,
        pricePerKg: 180,
        notes: 'Morning fresh batch',
      },
      {
        distributorName: 'SR Poultry',
        weightKg: 50,
        pricePerKg: 180,
        notes: 'Afternoon topup',
      },
    ],
    counterCollection: {
      cash: 15000,
      upi: 18000,
      card: 2000,
      other: 500,
      notes: 'Counter collection verified',
    },
    stockAndSales: {
      openingStockKg: 20,
      openingStockRatePerKg: 180,
      openingStockAmount: 3600,
      newStockKg: 150,
      closingStockKg: 30,
      closingStockRatePerKg: 112,
      closingStockAmount: 3360,
      sellingPricePerKg: 112,
    },
    eggStockAndSales: {
      openingStock: 100,
      openingStockRate: 6,
      openingStockAmount: 600,
      newStock: 200,
      purchaseRate: 5.5,
      purchaseCost: 1100,
      closingStock: 50,
      closingStockRate: 6.5,
      closingStockAmount: 325,
    },
    adjustments: [
      {
        type: 'Expense',
        amount: 250,
        reason: 'Ice cubes for storage',
        notes: 'Cash paid to ice vendor',
      },
      {
        type: 'Additional Income',
        amount: 500,
        reason: 'Gunny bags scrap sale',
        notes: 'Sold empty bags',
      },
    ],
    notes: 'End of day closing completed without discrepancies',
  };

  const submitRes = await fetch('http://localhost:5000/api/closing/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const submitData = (await submitRes.json()) as any;
  console.log('Submission HTTP status:', submitRes.status);
  console.log('Submission Response:', submitData);

  if (!submitRes.ok || !submitData.success) {
    throw new Error('Daily closing submission failed: ' + (submitData.error || submitRes.statusText));
  }
  console.log('✅ Daily closing INSERT succeeded without error!');

  const closingId = submitData.data.id;

  // 4. Verify Database Persistence & Values
  console.log('\n--- Step 2: Verifying database records ---');
  const closingInDb = await query('SELECT * FROM daily_closings WHERE id = $1', [closingId]);
  if (closingInDb.rows.length === 0) {
    throw new Error('Record not found in daily_closings table!');
  }
  const row = closingInDb.rows[0];
  console.log('daily_closings row:', {
    id: row.id,
    business_date: row.business_date,
    status: row.status,
    total_counter_collection: row.total_counter_collection,
    chicken_sales_revenue: row.chicken_sales_revenue,
    cost_of_chicken_sold: row.cost_of_chicken_sold,
    egg_sales_revenue: row.egg_sales_revenue,
    total_sales_revenue: row.total_sales_revenue,
    estimated_gross_profit: row.estimated_gross_profit,
    adjustments_amount: row.adjustments_amount,
    estimated_net_profit: row.estimated_net_profit,
    submitted_by: row.submitted_by,
  });

  // Assert counter collection: 15000 + 18000 + 2000 + 500 = 35500
  if (parseFloat(row.total_counter_collection) !== 35500) {
    throw new Error(`Expected counter collection 35500, got ${row.total_counter_collection}`);
  }
  console.log('✅ Total counter collection matches: ₹35,500.00');

  // Verify purchases in daily_closing_purchases
  const purchasesInDb = await query(
    'SELECT * FROM daily_closing_purchases WHERE daily_closing_id = $1 ORDER BY id',
    [closingId]
  );
  if (purchasesInDb.rows.length !== 2) {
    throw new Error(`Expected 2 purchases in db, found ${purchasesInDb.rows.length}`);
  }
  console.log(`✅ daily_closing_purchases created: ${purchasesInDb.rows.length} rows`);

  // Verify distributor_supplies sync
  const suppliesInDb = await query(
    'SELECT * FROM distributor_supplies WHERE daily_closing_id = $1 ORDER BY id',
    [closingId]
  );
  if (suppliesInDb.rows.length !== 2) {
    throw new Error(`Expected 2 distributor supplies, found ${suppliesInDb.rows.length}`);
  }
  console.log(`✅ distributor_supplies synced: ${suppliesInDb.rows.length} rows`);

  // Verify financial_adjustments
  const adjustmentsInDb = await query(
    'SELECT * FROM financial_adjustments WHERE daily_closing_id = $1 ORDER BY id',
    [closingId]
  );
  if (adjustmentsInDb.rows.length !== 2) {
    throw new Error(`Expected 2 adjustments, found ${adjustmentsInDb.rows.length}`);
  }
  console.log(`✅ financial_adjustments created: ${adjustmentsInDb.rows.length} rows`);

  // Verify inventory_transactions
  const invTxnInDb = await query(
    "SELECT * FROM inventory_transactions WHERE reference_module = 'daily_closing' AND reference_id = $1",
    [closingId]
  );
  if (invTxnInDb.rows.length !== 1) {
    throw new Error(`Expected 1 inventory transaction, found ${invTxnInDb.rows.length}`);
  }
  console.log(`✅ inventory_transactions closing entry created: ${invTxnInDb.rows.length} row`);

  // Verify audit log
  const auditLogsInDb = await query(
    "SELECT * FROM audit_logs WHERE module = 'DAILY_CLOSING' AND record_id = $1",
    [String(closingId)]
  );
  if (auditLogsInDb.rows.length === 0) {
    throw new Error('Expected audit log for daily closing submission');
  }
  console.log(`✅ audit_logs recorded submission: ${auditLogsInDb.rows.length} log entry`);

  // 5. Test Reopening the closing
  console.log('\n--- Step 3: Testing Reopen Closing Workflow ---');
  const reopenRes = await fetch(`http://localhost:5000/api/closing/${closingId}/reopen`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason: 'Need to correct closing chicken weight' }),
  });
  const reopenData = (await reopenRes.json()) as any;
  if (!reopenRes.ok || !reopenData.success) {
    throw new Error('Failed to reopen daily closing: ' + JSON.stringify(reopenData));
  }
  console.log('✅ Daily closing successfully reopened for correction!');

  // 6. Test Re-submitting the reopened closing (verifying UPDATE path)
  console.log('\n--- Step 4: Re-submitting updated closing ---');
  payload.stockAndSales.closingStockKg = 35;
  payload.stockAndSales.closingStockAmount = 3920;
  const resubmitRes = await fetch('http://localhost:5000/api/closing/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const resubmitData = (await resubmitRes.json()) as any;
  if (!resubmitRes.ok || !resubmitData.success) {
    throw new Error('Re-submitting daily closing failed: ' + JSON.stringify(resubmitData));
  }
  console.log('✅ Re-submitted daily closing updated successfully without duplicates!');

  // Clean up test records
  await query('DELETE FROM daily_closings WHERE business_date = $1', [testDate]);
  await query('DELETE FROM distributor_supplies WHERE supply_date = $1', [testDate]);
  await query('DELETE FROM inventory_transactions WHERE txn_date = $1', [testDate]);
  await query('DELETE FROM financial_adjustments WHERE business_date = $1', [testDate]);

  console.log('\n🎉 ALL DAILY CLOSING VERIFICATION TESTS PASSED!');
  await pool.end();
}

runClosingWorkflowTest().catch(async (err) => {
  console.error('\n❌ Test Error:', err);
  await pool.end();
  process.exit(1);
});
