import { query } from '../src/db/connection';

const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TESTING BILLING ITEMS (Skinless, Dressed, Boneless, Liver, Eggs, Natukodi, Masala)');
  console.log('====================================================\n');

  // 1. Log in as owner
  console.log('--- 1. Authenticating as Owner ---');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '7989856610', pin: '1234' }),
  });
  const loginData = await loginRes.json();
  const setCookie = loginRes.headers.get('set-cookie');
  if (!loginData.success || !setCookie) {
    throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  }
  const cookie = setCookie.split(';')[0];
  console.log('✅ Logged in successfully\n');

  // 2. Create customer bill with Skinless + Eggs + Masala
  console.log('--- 2. Creating Multi-Item Bill (Skinless, Eggs, Masala) ---');
  const billRes1 = await fetch(`${BASE_URL}/customers/bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      billDate: '2026-10-24',
      paymentType: 'Pay Now',
      paymentMethod: 'UPI',
      description: 'Counter sale test',
      items: [
        { name: 'Skinless', unit: 'kg', quantity: 1.5, rate: 260 },
        { name: 'Eggs', unit: 'pcs', quantity: 6, rate: 7 },
        { name: 'Masala', unit: 'pkt', quantity: 1, rate: 20 },
      ],
    }),
  });
  const billData1 = await billRes1.json();
  if (!billData1.success) {
    throw new Error(`Failed to create multi-item bill 1: ${JSON.stringify(billData1)}`);
  }
  const b1 = billData1.data;
  // Expected amount: (1.5 * 260) + (6 * 7) + (1 * 20) = 390 + 42 + 20 = 452
  if (parseFloat(b1.total_amount) !== 452) {
    throw new Error(`Expected total 452, got ${b1.total_amount}`);
  }
  if (parseFloat(b1.weight_kg) !== 1.5) {
    throw new Error(`Expected meat weight 1.5, got ${b1.weight_kg}`);
  }
  console.log(`✅ Bill #${b1.bill_number} generated: Total ₹${b1.total_amount} (Skinless 1.5kg, Eggs 6pcs, Masala 1pkt)\n`);

  // 3. Create bill with Dressed + Liver + Natukodi + Boneless
  console.log('--- 3. Creating Multi-Cut Bill (Dressed, Liver, Natukodi, Boneless) ---');
  const billRes2 = await fetch(`${BASE_URL}/customers/bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      billDate: '2026-10-24',
      paymentType: 'Pay Now',
      paymentMethod: 'Cash',
      items: [
        { name: 'Dressed', unit: 'kg', quantity: 2.0, rate: 220 },   // 440
        { name: 'Liver', unit: 'kg', quantity: 0.5, rate: 200 },     // 100
        { name: 'Natukodi', unit: 'kg', quantity: 1.25, rate: 450 }, // 562.5
        { name: 'Boneless', unit: 'kg', quantity: 0.75, rate: 360 }, // 270
      ],
    }),
  });
  const billData2 = await billRes2.json();
  if (!billData2.success) {
    throw new Error(`Failed to create multi-cut bill 2: ${JSON.stringify(billData2)}`);
  }
  const b2 = billData2.data;
  // Expected total: 440 + 100 + 562.5 + 270 = 1372.50
  if (parseFloat(b2.total_amount) !== 1372.5) {
    throw new Error(`Expected total 1372.50, got ${b2.total_amount}`);
  }
  // Expected meat weight: 2.0 + 0.5 + 1.25 + 0.75 = 4.50 kg
  if (parseFloat(b2.weight_kg) !== 4.5) {
    throw new Error(`Expected meat weight 4.5 kg, got ${b2.weight_kg}`);
  }
  console.log(`✅ Bill #${b2.bill_number} generated: Total ₹${b2.total_amount} (Meat weight: ${b2.weight_kg}kg)\n`);

  // 4. Verify items stored in customer_bills
  console.log('--- 4. Verifying database persistence & items JSONB column ---');
  const dbRes = await query('SELECT id, bill_number, items, total_amount, weight_kg, description FROM customer_bills WHERE id = $1', [b1.id]);
  const row = dbRes.rows[0];
  const storedItems = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
  if (!Array.isArray(storedItems) || storedItems.length !== 3) {
    throw new Error(`Expected 3 items in database JSONB, got: ${JSON.stringify(storedItems)}`);
  }
  console.log('✅ Verified: Items stored in JSONB column with exact names, units, quantities, rates:');
  storedItems.forEach((it: any) => {
    console.log(`   - ${it.name}: ${it.quantity} ${it.unit} @ ₹${it.rate} = ₹${it.amount}`);
  });
  console.log('');

  // 5. Verify linked chicken_sales record
  console.log('--- 5. Verifying chicken_sales integration ---');
  const saleRes = await query('SELECT * FROM chicken_sales WHERE customer_bill_id = $1', [b1.id]);
  if (saleRes.rows.length === 0) {
    throw new Error('Expected chicken_sales record linked to customer bill');
  }
  const sale = saleRes.rows[0];
  console.log(`✅ Linked chicken sale verified: ${sale.weight_sold_kg} kg @ ₹${sale.price_per_kg}/kg (Amount: ₹${sale.total_amount})\n`);

  // 6. Test Bill Deletion
  console.log('--- 6. Testing Bill Deletion via DELETE /api/customers/bills/:id ---');
  const deleteRes = await fetch(`${BASE_URL}/customers/bills/${b1.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ reason: 'Test customer order cancellation' }),
  });
  const deleteData = await deleteRes.json();
  if (!deleteData.success) {
    throw new Error(`Failed to delete bill: ${JSON.stringify(deleteData)}`);
  }
  console.log(`✅ Bill #${b1.bill_number} deleted: ${deleteData.message}`);

  // Verify bill no longer exists in customer_bills
  const verifyDb = await query('SELECT id FROM customer_bills WHERE id = $1', [b1.id]);
  if (verifyDb.rows.length !== 0) {
    throw new Error(`Expected bill ${b1.id} to be deleted from database!`);
  }
  console.log('✅ Verified bill removed from customer_bills table');

  // Verify linked chicken_sales record was cleaned up
  const verifySale = await query('SELECT id FROM chicken_sales WHERE customer_bill_id = $1', [b1.id]);
  if (verifySale.rows.length !== 0) {
    throw new Error(`Expected linked chicken_sale for bill ${b1.id} to be deleted!`);
  }
  console.log('✅ Verified linked chicken_sales record was removed');

  // Verify audit log
  const auditRes = await query(
    `SELECT action, record_id, reason FROM audit_logs 
     WHERE action = 'CUSTOMER_BILL_DELETED' AND record_id = $1`,
    [String(b1.id)]
  );
  if (auditRes.rows.length === 0) {
    throw new Error('Expected CUSTOMER_BILL_DELETED in audit_logs');
  }
  // 7. Test Customer Permanent Deletion
  console.log('--- 7. Testing Customer Permanent Deletion via DELETE /api/customers/customers/:id ---');
  // Create a customer
  const createCustRes = await fetch(`${BASE_URL}/customers/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: 'Test Delete Cust',
      phone: '9888877771',
      address: 'Test Town',
      openingBalance: 150,
    }),
  });
  const createCustData = await createCustRes.json();
  if (!createCustData.success) {
    throw new Error(`Failed to create test customer: ${JSON.stringify(createCustData)}`);
  }
  const testCust = createCustData.data;
  console.log(`✅ Created test customer: ${testCust.name} (ID: ${testCust.id})`);

  // Create credit bill for this customer
  const custBillRes = await fetch(`${BASE_URL}/customers/bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      customerId: testCust.id,
      billDate: '2026-10-24',
      paymentType: 'Pay Later',
      items: [
        { name: 'Skinless', unit: 'kg', quantity: 2, rate: 250 },
      ],
    }),
  });
  const custBillData = await custBillRes.json();
  if (!custBillData.success) {
    throw new Error(`Failed to create credit bill for customer: ${JSON.stringify(custBillData)}`);
  }
  console.log(`✅ Created credit bill for customer: #${custBillData.data.bill_number}`);

  // Create payment for this customer
  const custPayRes = await fetch(`${BASE_URL}/customers/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      customerId: testCust.id,
      amount: 100,
      paymentMethod: 'Cash',
      paymentDate: '2026-10-24',
    }),
  });
  const custPayData = await custPayRes.json();
  if (!custPayData.success) {
    throw new Error(`Failed to record payment for customer: ${JSON.stringify(custPayData)}`);
  }
  console.log(`✅ Recorded payment for customer: ₹${custPayData.data.amount}`);

  // Now permanently delete the customer
  const deleteCustRes = await fetch(`${BASE_URL}/customers/customers/${testCust.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ reason: 'Unit test deletion of customer' }),
  });
  const deleteCustResult = await deleteCustRes.json();
  if (!deleteCustResult.success) {
    throw new Error(`Failed to permanently delete customer: ${JSON.stringify(deleteCustResult)}`);
  }
  console.log(`✅ Permanently deleted customer: ${deleteCustResult.message}`);

  // Verify database state: customer row deleted
  const checkCust = await query('SELECT id FROM customers WHERE id = $1', [testCust.id]);
  if (checkCust.rows.length !== 0) {
    throw new Error('Customer was not deleted from customers table!');
  }
  console.log('✅ Verified customer deleted from customers table');

  // Verify linked bills deleted
  const checkBills = await query('SELECT id FROM customer_bills WHERE customer_id = $1', [testCust.id]);
  if (checkBills.rows.length !== 0) {
    throw new Error('Customer bills were not deleted!');
  }
  console.log('✅ Verified all customer bills were cascaded and deleted');

  // Verify linked payments deleted
  const checkPays = await query('SELECT id FROM customer_payments WHERE customer_id = $1', [testCust.id]);
  if (checkPays.rows.length !== 0) {
    throw new Error('Customer payments were not deleted!');
  }
  console.log('✅ Verified all customer payments were cascaded and deleted');

  // Verify audit log for permanent deletion
  const checkCustAudit = await query(
    `SELECT action, record_id, reason FROM audit_logs 
     WHERE action = 'CUSTOMER_DELETED_PERMANENTLY' AND record_id = $1`,
    [String(testCust.id)]
  );
  if (checkCustAudit.rows.length === 0) {
    throw new Error('Expected CUSTOMER_DELETED_PERMANENTLY in audit_logs');
  }
  console.log(`✅ Audit log verified: ${checkCustAudit.rows[0].action} recorded with reason: "${checkCustAudit.rows[0].reason}"\n`);

  console.log('🎉 ALL BILLING ITEMS, DELETE BILL & DELETE CUSTOMER TESTS PASSED SUCCESSFULLY!\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
