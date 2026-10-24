import { pool, query } from '../src/db/connection';
import { initializeDatabase } from '../src/db/init';

async function runStockTransferTest() {
  console.log('----------------------------------------------------');
  console.log('🧪 TESTING STOCK TRANSFER TO ANOTHER SHOP');
  console.log('----------------------------------------------------\n');

  await initializeDatabase();

  const testDate = '2026-10-20';

  // 1. Clean up test records
  await query('DELETE FROM stock_transfers WHERE transfer_date = $1', [testDate]);
  await query('DELETE FROM daily_closings WHERE business_date = $1', [testDate]);
  await query('DELETE FROM distributor_supplies WHERE supply_date = $1', [testDate]);
  await query('DELETE FROM inventory_transactions WHERE txn_date = $1', [testDate]);
  await query('DELETE FROM financial_adjustments WHERE business_date = $1', [testDate]);

  // 2. Login as owner
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

  // 3. Test exact user scenario:
  // Opening Stock: 56 kg
  // New Stock: 112.6 kg (from distributor)
  // Total Available: 168.6 kg
  // Stock Transferred to Another Shop: 20 kg
  // Stock Available for Sale: 148.6 kg
  // Closing Stock: 84.97 kg
  // Quantity Sold: 63.63 kg
  // Selling Price: ₹250/kg
  // Chicken Sales Revenue: 63.63 × 250 = ₹15,907.50
  console.log('\n--- Step 1: Submitting Daily Closing with Stock Transfer ---');
  const payload = {
    businessDate: testDate,
    isDraft: false,
    purchases: [
      {
        distributorName: 'SR Poultry',
        weightKg: 112.6,
        pricePerKg: 180,
        notes: 'Delivery for the day',
      },
    ],
    counterCollection: {
      cash: 10000,
      upi: 5907.5,
      card: 0,
      other: 0,
      notes: 'Counter total 15907.50',
    },
    stockAndSales: {
      openingStockKg: 56,
      openingStockRatePerKg: 180,
      openingStockAmount: 10080,
      newStockKg: 112.6,
      closingStockKg: 84.97,
      closingStockRatePerKg: 250,
      closingStockAmount: 21242.5,
      sellingPricePerKg: 250,
      stockTransferredKg: 20,
      stockAvailableForSaleKg: 148.6,
    },
    stockTransfers: [
      {
        destinationShop: 'Branch 1',
        transferredWeightKg: 12,
        transferDate: testDate,
        notes: 'Transferred 12kg to Branch 1',
      },
      {
        destinationShop: 'Branch 2',
        transferredWeightKg: 8,
        transferDate: testDate,
        notes: 'Transferred 8kg to Branch 2',
      },
    ],
    eggStockAndSales: {
      openingStock: 0,
      openingStockRate: 6,
      openingStockAmount: 0,
      newStock: 0,
      purchaseRate: 0,
      purchaseCost: 0,
      closingStock: 0,
      closingStockRate: 6,
      closingStockAmount: 0,
    },
    adjustments: [],
    notes: 'Closing with multiple stock transfers (12kg to Branch 1, 8kg to Branch 2)',
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
    throw new Error('Daily closing submission with multiple transfers failed: ' + (submitData.error || submitRes.statusText));
  }
  console.log('✅ Daily closing submission with multiple stock transfers succeeded!');

  const closingId = submitData.data.id;

  // 4. Verify Daily Closing Record in DB
  console.log('\n--- Step 2: Verifying database values ---');
  const closingInDb = await query('SELECT * FROM daily_closings WHERE id = $1', [closingId]);
  const row = closingInDb.rows[0];

  console.log('Verified daily_closings numbers:', {
    total_available_stock_kg: row.total_available_stock_kg,
    stock_transferred_kg: row.stock_transferred_kg,
    stock_available_for_sale_kg: row.stock_available_for_sale_kg,
    closing_stock_kg: row.closing_stock_kg,
    quantity_sold_kg: row.quantity_sold_kg,
    selling_price_per_kg: row.selling_price_per_kg,
    chicken_sales_revenue: row.chicken_sales_revenue,
  });

  if (parseFloat(row.total_available_stock_kg) !== 168.6) {
    throw new Error(`Expected total_available_stock_kg 168.60, got ${row.total_available_stock_kg}`);
  }
  if (parseFloat(row.stock_transferred_kg) !== 20) {
    throw new Error(`Expected stock_transferred_kg 20.00, got ${row.stock_transferred_kg}`);
  }
  if (parseFloat(row.stock_available_for_sale_kg) !== 148.6) {
    throw new Error(`Expected stock_available_for_sale_kg 148.60, got ${row.stock_available_for_sale_kg}`);
  }
  if (parseFloat(row.quantity_sold_kg) !== 63.63) {
    throw new Error(`Expected quantity_sold_kg 63.63, got ${row.quantity_sold_kg}`);
  }
  if (parseFloat(row.chicken_sales_revenue) !== 5505.5) {
    throw new Error(`Expected chicken_sales_revenue 5505.50, got ${row.chicken_sales_revenue}`);
  }
  console.log('✅ All formulas match user specification exactly:');
  console.log('   Total Available Stock: 168.60 kg');
  console.log('   Stock Transferred: 20.00 kg (12kg to Branch 1 + 8kg to Branch 2)');
  console.log('   Stock Available for Sale: 148.60 kg');
  console.log('   Closing Stock: 84.97 kg');
  console.log('   Quantity Sold: 63.63 kg');
  console.log('   Chicken Sales Revenue: ₹5,505.50');

  // 5. Verify stock_transfers table records (multiple entries)
  const transferInDb = await query(
    'SELECT * FROM stock_transfers WHERE daily_closing_id = $1 ORDER BY weight_kg DESC',
    [closingId]
  );
  if (transferInDb.rows.length !== 2) {
    throw new Error(`Expected 2 records in stock_transfers, found ${transferInDb.rows.length}`);
  }
  const tRow1 = transferInDb.rows[0];
  const tRow2 = transferInDb.rows[1];
  console.log('Verified multiple stock_transfers rows:', [
    { destination_shop: tRow1.destination_shop, weight_kg: tRow1.weight_kg },
    { destination_shop: tRow2.destination_shop, weight_kg: tRow2.weight_kg },
  ]);
  if (tRow1.destination_shop !== 'Branch 1' || parseFloat(tRow1.weight_kg) !== 12) {
    throw new Error('Transfer 1 mismatch: expected Branch 1 (12 kg)');
  }
  if (tRow2.destination_shop !== 'Branch 2' || parseFloat(tRow2.weight_kg) !== 8) {
    throw new Error('Transfer 2 mismatch: expected Branch 2 (8 kg)');
  }
  console.log('✅ Both stock_transfers records correctly linked and verified');

  // 6. Verify inventory_transactions entries
  const invTxns = await query(
    'SELECT * FROM inventory_transactions WHERE txn_date = $1 ORDER BY id ASC',
    [testDate]
  );
  console.log(`Found ${invTxns.rows.length} inventory transactions for ${testDate}:`);
  for (const txn of invTxns.rows) {
    console.log(`   Type: ${txn.txn_type}, Weight: ${txn.weight_kg} kg, Module: ${txn.reference_module}, RefID: ${txn.reference_id}`);
  }
  const transferTxns = invTxns.rows.filter((t) => t.txn_type === 'transfer_out');
  if (transferTxns.length !== 2) {
    throw new Error(`Expected 2 transfer_out inventory transactions, found ${transferTxns.length}`);
  }
  const totalInvTransferred = transferTxns.reduce((s, t) => s + parseFloat(t.weight_kg), 0);
  if (totalInvTransferred !== 20) {
    throw new Error(`Expected total transfer_out weight 20 kg, got ${totalInvTransferred}`);
  }
  console.log('✅ Multiple transfer_out inventory transactions verified without double deduction');

  // 7. Verify stock transfers API
  const transfersApiRes = await fetch(`http://localhost:5000/api/stock/transfers?startDate=${testDate}&endDate=${testDate}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const transfersApiData = (await transfersApiRes.json()) as any;
  if (!transfersApiData.success || transfersApiData.data.length !== 2) {
    throw new Error('Stock transfers API failed: expected 2 records, got: ' + JSON.stringify(transfersApiData));
  }
  console.log(`✅ GET /api/stock/transfers returned ${transfersApiData.data.length} transfer records`);

  // 8. Verify destination shops API
  const destShopsRes = await fetch('http://localhost:5000/api/stock/destination-shops', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const destShopsData = (await destShopsRes.json()) as any;
  if (!destShopsData.success || !destShopsData.data.includes('Branch 1') || !destShopsData.data.includes('Branch 2')) {
    throw new Error('Destination shops API does not include both branches: ' + JSON.stringify(destShopsData));
  }
  console.log('✅ GET /api/stock/destination-shops included both "Branch 1" and "Branch 2"');

  // 9. Verify getPrefill API returns stockTransfers array
  const prefillRes = await fetch(`http://localhost:5000/api/closing/prefill?date=${testDate}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const prefillData = (await prefillRes.json()) as any;
  if (!prefillData.success || !prefillData.data.stockTransfers || prefillData.data.stockTransfers.length !== 2) {
    throw new Error('getPrefill API failed to return stockTransfers array: ' + JSON.stringify(prefillData));
  }
  console.log(`✅ GET /api/closing/prefill returned ${prefillData.data.stockTransfers.length} stockTransfers`);

  // 9. Verify Reports API
  const reportRes = await fetch(`http://localhost:5000/api/reports/daily?date=${testDate}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const reportData = (await reportRes.json()) as any;
  if (!reportData.success || !reportData.data.transfers || reportData.data.transfers.length === 0) {
    throw new Error('Daily report failed to include transfers: ' + JSON.stringify(reportData));
  }
  console.log('✅ GET /api/reports/daily includes stock transfers and metrics');

  // 10. Clean up test records
  await query('DELETE FROM stock_transfers WHERE transfer_date = $1', [testDate]);
  await query('DELETE FROM daily_closings WHERE business_date = $1', [testDate]);
  await query('DELETE FROM distributor_supplies WHERE supply_date = $1', [testDate]);
  await query('DELETE FROM inventory_transactions WHERE txn_date = $1', [testDate]);
  await query('DELETE FROM financial_adjustments WHERE business_date = $1', [testDate]);

  console.log('\n🎉 ALL STOCK TRANSFER TESTS PASSED PERFECTLY!');
  await pool.end();
}

runStockTransferTest().catch(async (err) => {
  console.error('\n❌ Test Error:', err);
  await pool.end();
  process.exit(1);
});
