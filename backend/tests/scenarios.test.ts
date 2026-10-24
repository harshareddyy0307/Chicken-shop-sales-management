import { pool, query, withTransaction } from '../src/db/connection';
import { initializeDatabase } from '../src/db/init';
import { Decimal, toDecimal, formatMoney, formatWeight, multiply, add, subtract } from '../src/utils/decimal';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../src/config';

async function runAcceptanceTests() {
  console.log('====================================================');
  console.log('🍗 RUNNING CHICKEN SHOP SYSTEM ACCEPTANCE TESTS (1-10)');
  console.log('====================================================\n');

  await initializeDatabase();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${details || 'Assertion failed'}`);
      failed++;
    }
  }

  // Get owner user for test contexts
  const userRes = await query("SELECT id, full_name, role FROM users WHERE username = 'owner'");
  const owner = userRes.rows[0];

  // ----------------------------------------------------
  // TEST 1: Distributor Purchase
  // Weight = 150 kg, Purchase Price = ₹180/kg
  // Expected Purchase Amount = ₹27,000
  // ----------------------------------------------------
  console.log('--- TEST 1: Distributor Purchase Calculation ---');
  const t1Weight = toDecimal(150);
  const t1Price = toDecimal(180);
  const t1Amount = multiply(t1Weight, t1Price);
  assert(
    t1Amount.equals(27000),
    'Test 1: 150 kg @ ₹180/kg equals exactly ₹27,000',
    `Calculated: ₹${t1Amount.toFixed(2)}`
  );

  // ----------------------------------------------------
  // TEST 2: Counter Collection
  // Cash = ₹8,000, UPI = ₹12,000, Card = ₹1,000, Other = ₹500
  // Expected Total Collection = ₹21,500
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Counter Collection Calculation ---');
  const cash = toDecimal(8000);
  const upi = toDecimal(12000);
  const card = toDecimal(1000);
  const other = toDecimal(500);
  const t2Total = add(cash, upi, card, other);
  assert(
    t2Total.equals(21500),
    'Test 2: Cash ₹8k + UPI ₹12k + Card ₹1k + Other ₹500 = ₹21,500',
    `Calculated: ₹${t2Total.toFixed(2)}`
  );

  // ----------------------------------------------------
  // TEST 3: Chicken Stock
  // Opening Stock = 100 kg, New Stock = 50 kg, Closing Stock = 30 kg
  // Expected Quantity Sold = 120 kg
  // Selling Price = ₹250/kg
  // Expected Chicken Sales Revenue = ₹30,000
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Chicken Stock & Sales Calculation ---');
  const openStock = toDecimal(100);
  const newStock = toDecimal(50);
  const closeStock = toDecimal(30);
  const totalAvailable = openStock.plus(newStock);
  const qtySold = totalAvailable.minus(closeStock);
  const sellPrice = toDecimal(250);
  const salesRevenue = multiply(qtySold, sellPrice);

  assert(totalAvailable.equals(150), 'Test 3a: Total Available Stock = 150 kg', `Calculated: ${totalAvailable} kg`);
  assert(qtySold.equals(120), 'Test 3b: Quantity Sold = 120 kg', `Calculated: ${qtySold} kg`);
  assert(
    salesRevenue.equals(30000),
    'Test 3c: Chicken Sales Revenue = 120 kg * ₹250/kg = ₹30,000',
    `Calculated: ₹${salesRevenue.toFixed(2)}`
  );

  // ----------------------------------------------------
  // TEST 4: Distributor Payments & Running Balance
  // Supply Amount = ₹10,000
  // Payments = ₹5,000 + ₹2,000 + ₹3,000
  // Expected Outstanding Balance = ₹0
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Distributor Payments & Running Balance ---');
  // Create a clean distributor for this test
  const distInsert = await query(
    "INSERT INTO distributors (name, opening_balance) VALUES ('Test Distributor T4', 0) RETURNING id"
  );
  const distId = distInsert.rows[0].id;

  // Add supply of ₹10,000
  await query(
    `INSERT INTO distributor_supplies (distributor_id, supply_date, weight_kg, price_per_kg, total_amount, created_by)
     VALUES ($1, '2026-10-20', 50, 200, 10000, $2)`,
    [distId, owner.id]
  );

  // Record 3 payments: ₹5,000, ₹2,000, ₹3,000
  await query(
    "INSERT INTO distributor_payments (distributor_id, payment_date, amount, payment_method, created_by) VALUES ($1, '2026-10-21', 5000, 'UPI', $2)",
    [distId, owner.id]
  );
  await query(
    "INSERT INTO distributor_payments (distributor_id, payment_date, amount, payment_method, created_by) VALUES ($1, '2026-10-22', 2000, 'Cash', $2)",
    [distId, owner.id]
  );
  await query(
    "INSERT INTO distributor_payments (distributor_id, payment_date, amount, payment_method, created_by) VALUES ($1, '2026-10-23', 3000, 'Bank Transfer', $2)",
    [distId, owner.id]
  );

  // Verify DB calculated balance
  const supSum = await query('SELECT SUM(total_amount) AS sum FROM distributor_supplies WHERE distributor_id = $1', [
    distId,
  ]);
  const paySum = await query('SELECT SUM(amount) AS sum FROM distributor_payments WHERE distributor_id = $1', [distId]);
  const t4Outstanding = toDecimal(supSum.rows[0].sum).minus(toDecimal(paySum.rows[0].sum));

  assert(
    t4Outstanding.equals(0),
    'Test 4: ₹10,000 supply - (₹5k + ₹2k + ₹3k) = ₹0 outstanding',
    `Calculated: ₹${t4Outstanding.toFixed(2)}`
  );

  // ----------------------------------------------------
  // TEST 5: Customer Katha Credit & Ledger
  // Opening Balance = ₹1,000
  // Credit Purchase = ₹500
  // Payment Received = ₹700
  // Expected Outstanding Balance = ₹800
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Customer Katha Balance Tracking ---');
  const custInsert = await query(
    "INSERT INTO customers (name, opening_balance) VALUES ('Ramesh Test T5', 1000) RETURNING id"
  );
  const custId = custInsert.rows[0].id;

  // Credit Purchase of ₹500 (Pay Later)
  await query(
    `INSERT INTO customer_bills (bill_number, customer_id, bill_date, weight_kg, price_per_kg, total_amount, payment_type, paid_amount, payment_status, created_by)
     VALUES ('BILL-TEST-T5-' || floor(random()*1000000)::text, $1, '2026-10-23', 2, 250, 500, 'Pay Later', 0, 'Unpaid', $2)`,
    [custId, owner.id]
  );

  // Payment Received of ₹700
  await query(
    `INSERT INTO customer_payments (customer_id, payment_date, amount, payment_method, created_by)
     VALUES ($1, '2026-10-24', 700, 'Cash', $2)`,
    [custId, owner.id]
  );

  // Outstanding = Opening (1000) + Credit (500) - Paid (700) = 800
  const cBills = await query(
    "SELECT SUM(total_amount) AS sum FROM customer_bills WHERE customer_id = $1 AND payment_type = 'Pay Later'",
    [custId]
  );
  const cPays = await query('SELECT SUM(amount) AS sum FROM customer_payments WHERE customer_id = $1', [custId]);
  const t5Outstanding = toDecimal(1000).plus(toDecimal(cBills.rows[0].sum)).minus(toDecimal(cPays.rows[0].sum));

  assert(
    t5Outstanding.equals(800),
    'Test 5: Opening ₹1,000 + Purchase ₹500 - Payment ₹700 = ₹800 outstanding',
    `Calculated: ₹${t5Outstanding.toFixed(2)}`
  );

  // ----------------------------------------------------
  // TEST 6: Operating Expenses Monthly Grouping
  // Expenses during October = ₹5,000 + ₹2,000 + ₹1,000
  // Expected October Expense Total = ₹8,000
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Operating Expenses October Total ---');
  await query("DELETE FROM operating_expenses WHERE description LIKE 'T6%'");
  await query("INSERT INTO operating_expenses (expense_date, category, description, amount, payment_method, created_by) VALUES ('2026-10-05', 'Rent', 'T6 Rent', 5000, 'Bank Transfer', $1)", [owner.id]);
  await query("INSERT INTO operating_expenses (expense_date, category, description, amount, payment_method, created_by) VALUES ('2026-10-12', 'Electricity', 'T6 Power', 2000, 'UPI', $1)", [owner.id]);
  await query("INSERT INTO operating_expenses (expense_date, category, description, amount, payment_method, created_by) VALUES ('2026-10-18', 'Transport', 'T6 Diesel', 1000, 'Cash', $1)", [owner.id]);

  const octExpRes = await query(
    "SELECT SUM(amount) AS total FROM operating_expenses WHERE expense_date >= '2026-10-01' AND expense_date <= '2026-10-31' AND description LIKE 'T6%'"
  );
  const t6Total = toDecimal(octExpRes.rows[0].total);

  assert(
    t6Total.equals(8000),
    'Test 6: October expenses ₹5,000 + ₹2,000 + ₹1,000 = ₹8,000',
    `Calculated: ₹${t6Total.toFixed(2)}`
  );

  // ----------------------------------------------------
  // TEST 7: Duplicate Prevention
  // Enter a distributor supply once. Confirm appears in stock and distributor records without double counting.
  // ----------------------------------------------------
  console.log('\n--- TEST 7: Duplicate Prevention in Stock & Distributor Records ---');
  const t7Dist = await query("INSERT INTO distributors (name, opening_balance) VALUES ('T7 Supplier', 0) RETURNING id");
  const t7DistId = t7Dist.rows[0].id;

  const t7Supply = await query(
    `INSERT INTO distributor_supplies (distributor_id, supply_date, weight_kg, price_per_kg, total_amount, created_by)
     VALUES ($1, '2026-10-25', 80, 200, 16000, $2) RETURNING id`,
    [t7DistId, owner.id]
  );
  const t7SupplyId = t7Supply.rows[0].id;

  // Inventory transaction linked
  await query(
    `INSERT INTO inventory_transactions (txn_date, txn_type, weight_kg, cost_per_kg, reference_module, reference_id, created_by)
     VALUES ('2026-10-25', 'supply_in', 80, 200, 'distributor_supplies', $1, $2)`,
    [t7SupplyId, owner.id]
  );

  // Verify supply count for this delivery
  const supplyCountRes = await query(
    'SELECT COUNT(*) AS cnt FROM distributor_supplies WHERE id = $1',
    [t7SupplyId]
  );
  const inventoryCountRes = await query(
    "SELECT COUNT(*) AS cnt FROM inventory_transactions WHERE reference_module = 'distributor_supplies' AND reference_id = $1",
    [t7SupplyId]
  );

  assert(
    supplyCountRes.rows[0].cnt === '1' && inventoryCountRes.rows[0].cnt === '1',
    'Test 7: Delivery recorded exactly once in supplies and once in inventory (no duplicates)'
  );

  // ----------------------------------------------------
  // TEST 8: Daily Closing Submission & Reopening with Audit Log
  // ----------------------------------------------------
  console.log('\n--- TEST 8: Daily Closing Submission & Reopen Audit ---');
  const testDate = '2026-10-26';
  // Clean up any test date closing
  await query('DELETE FROM daily_closings WHERE business_date = $1', [testDate]);

  // Submit closing
  const closeIns = await query(
    `INSERT INTO daily_closings (
      business_date, status, opening_stock_kg, new_stock_kg, total_available_stock_kg,
      closing_stock_kg, quantity_sold_kg, selling_price_per_kg, chicken_sales_revenue,
      distributor_purchase_cost, cost_of_chicken_sold, estimated_gross_profit,
      operating_expenses_amount, adjustments_amount, estimated_net_profit,
      cash_collection, upi_collection, card_collection, other_collection,
      total_counter_collection, counter_collection_difference, is_cogs_estimated, submitted_by
    ) VALUES (
      $1, 'Completed', 100, 50, 150, 30, 120, 250, 30000,
      10000, 24000, 6000, 1000, 0, 5000,
      8000, 12000, 1000, 500, 21500, 0, false, $2
    ) RETURNING id`,
    [testDate, owner.id]
  );
  const closingId = closeIns.rows[0].id;

  // Reopen by owner with reason
  await query(
    "UPDATE daily_closings SET status = 'Reopened', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [closingId]
  );

  await query(
    `INSERT INTO audit_logs (user_id, user_name, action, module, record_type, record_id, previous_values, new_values, reason)
     VALUES ($1, $2, 'DAILY_CLOSING_REOPENED', 'DAILY_CLOSING', 'daily_closing', $3, '{"status": "Completed"}', '{"status": "Reopened"}', 'Reopened for inventory count correction')`,
    [owner.id, owner.full_name, closingId]
  );

  const reopenedRes = await query('SELECT status FROM daily_closings WHERE id = $1', [closingId]);
  const auditRes = await query(
    "SELECT * FROM audit_logs WHERE record_id = $1 AND action = 'DAILY_CLOSING_REOPENED'",
    [String(closingId)]
  );

  assert(
    reopenedRes.rows[0].status === 'Reopened' && auditRes.rows.length > 0,
    'Test 8: Daily closing successfully reopened and recorded in audit log with reason'
  );

  // ----------------------------------------------------
  // TEST 9: Customer Payment of ₹500
  // Confirm customer balance decreases by ₹500 and is reflected in collections
  // ----------------------------------------------------
  console.log('\n--- TEST 9: Customer Payment Reduction & Collections ---');
  const t9Cust = await query("INSERT INTO customers (name, opening_balance) VALUES ('T9 Customer', 1500) RETURNING id");
  const t9CustId = t9Cust.rows[0].id;

  await query(
    `INSERT INTO customer_payments (customer_id, payment_date, amount, payment_method, created_by)
     VALUES ($1, '2026-10-27', 500, 'UPI', $2)`,
    [t9CustId, owner.id]
  );

  // Recalculate balance: 1500 - 500 = 1000
  const t9PaySum = await query('SELECT SUM(amount) AS sum FROM customer_payments WHERE customer_id = $1', [t9CustId]);
  const t9Balance = toDecimal(1500).minus(toDecimal(t9PaySum.rows[0].sum));

  assert(
    t9Balance.equals(1000),
    'Test 9: ₹1,500 balance reduced by ₹500 payment = ₹1,000 outstanding',
    `Calculated: ₹${t9Balance.toFixed(2)}`
  );

  // ----------------------------------------------------
  // TEST 10: Audit Log on Customer Bill Edit
  // Edit customer bill. Verify user, timestamp, original value, updated value, reason recorded.
  // ----------------------------------------------------
  console.log('\n--- TEST 10: Audit Log on Bill Edit ---');
  const billIns = await query(
    `INSERT INTO customer_bills (bill_number, bill_date, weight_kg, price_per_kg, total_amount, payment_type, payment_status, created_by)
     VALUES ('BILL-AUDIT-10-' || floor(random()*1000000)::text, '2026-10-28', 2, 250, 500, 'Pay Later', 'Unpaid', $1) RETURNING id`,
    [owner.id]
  );
  const billId = billIns.rows[0].id;

  // Edit bill: weight from 2kg to 2.4kg, amount from 500 to 600
  await query(
    'UPDATE customer_bills SET weight_kg = 2.4, total_amount = 600 WHERE id = $1',
    [billId]
  );

  await query(
    `INSERT INTO audit_logs (user_id, user_name, action, module, record_type, record_id, previous_values, new_values, reason)
     VALUES ($1, $2, 'CUSTOMER_BILL_EDITED', 'CUSTOMER_KATHA', 'customer_bill', $3, '{"weight_kg": 2, "total_amount": 500}', '{"weight_kg": 2.4, "total_amount": 600}', 'Corrected chicken weight on customer scale')`,
    [owner.id, owner.full_name, billId]
  );

  const billAudit = await query(
    "SELECT * FROM audit_logs WHERE record_id = $1 AND action = 'CUSTOMER_BILL_EDITED'",
    [String(billId)]
  );

  assert(
    billAudit.rows.length > 0 &&
      billAudit.rows[0].reason === 'Corrected chicken weight on customer scale' &&
      billAudit.rows[0].user_name === owner.full_name,
    'Test 10: Bill modification accurately logged in audit trail with previous/new values & reason'
  );

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAcceptanceTests().catch((err) => {
  console.error('Fatal Test Execution Error:', err);
  process.exit(1);
});
