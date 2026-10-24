import { query } from '../src/db/connection';

const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TESTING PERMANENT DISTRIBUTOR DELETION');
  console.log('====================================================\n');

  // 1. Authenticate as Owner
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

  // 2. Create a test distributor
  console.log('--- 2. Creating Test Distributor ---');
  const createRes = await fetch(`${BASE_URL}/distributors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: 'Temp Delete Supplier',
      phone: '9988776655',
      address: 'Test Farm Road',
      openingBalance: 500,
      notes: 'To be permanently deleted',
    }),
  });
  const createData = await createRes.json();
  if (!createData.success) {
    throw new Error(`Failed to create distributor: ${JSON.stringify(createData)}`);
  }
  const dist = createData.data;
  console.log(`✅ Created distributor: ${dist.name} (ID: ${dist.id})\n`);

  // 3. Add a supply record for this distributor
  console.log('--- 3. Creating Distributor Supply Record ---');
  const supplyRes = await fetch(`${BASE_URL}/distributors/supplies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      distributorId: dist.id,
      supplyDate: '2026-10-24',
      weightKg: 50,
      pricePerKg: 120,
      invoiceNumber: 'INV-TEMP-001',
      notes: 'Initial test lot',
    }),
  });
  const supplyData = await supplyRes.json();
  if (!supplyData.success) {
    throw new Error(`Failed to create supply: ${JSON.stringify(supplyData)}`);
  }
  const supply = supplyData.data;
  console.log(`✅ Created supply record: ${supply.weight_kg}kg @ ₹${supply.price_per_kg}/kg (Amount: ₹${supply.total_amount})\n`);

  // 4. Add a payment record for this distributor
  console.log('--- 4. Creating Distributor Payment Record ---');
  const payRes = await fetch(`${BASE_URL}/distributors/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      distributorId: dist.id,
      paymentDate: '2026-10-24',
      amount: 2000,
      paymentMethod: 'UPI',
      notes: 'Advance settlement test',
    }),
  });
  const payData = await payRes.json();
  if (!payData.success) {
    throw new Error(`Failed to create payment: ${JSON.stringify(payData)}`);
  }
  console.log(`✅ Recorded payment: ₹${payData.data.amount}\n`);

  // 5. Test deleting the distributor permanently
  console.log('--- 5. Deleting Distributor via DELETE /api/distributors/:id ---');
  const deleteRes = await fetch(`${BASE_URL}/distributors/${dist.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ reason: 'Unit test deletion of test distributor' }),
  });
  const deleteData = await deleteRes.json();
  if (!deleteData.success) {
    throw new Error(`Failed to delete distributor: ${JSON.stringify(deleteData)}`);
  }
  console.log(`✅ Distributor deleted: ${deleteData.message}\n`);

  // 6. Verify database records
  console.log('--- 6. Verifying Database State ---');
  const checkDist = await query('SELECT id FROM distributors WHERE id = $1', [dist.id]);
  if (checkDist.rows.length !== 0) {
    throw new Error('Distributor still exists in distributors table!');
  }
  console.log('✅ Verified distributor removed from distributors table');

  const checkSupplies = await query('SELECT id FROM distributor_supplies WHERE distributor_id = $1', [dist.id]);
  if (checkSupplies.rows.length !== 0) {
    throw new Error('Distributor supplies still exist!');
  }
  console.log('✅ Verified all linked supplies cascaded and deleted');

  const checkPayments = await query('SELECT id FROM distributor_payments WHERE distributor_id = $1', [dist.id]);
  if (checkPayments.rows.length !== 0) {
    throw new Error('Distributor payments still exist!');
  }
  console.log('✅ Verified all linked payments cascaded and deleted');

  const checkAudit = await query(
    `SELECT action, record_id, reason FROM audit_logs 
     WHERE action = 'DISTRIBUTOR_DELETED_PERMANENTLY' AND record_id = $1`,
    [String(dist.id)]
  );
  if (checkAudit.rows.length === 0) {
    throw new Error('Expected DISTRIBUTOR_DELETED_PERMANENTLY in audit_logs!');
  }
  console.log(`✅ Audit log verified: ${checkAudit.rows[0].action} recorded with reason: "${checkAudit.rows[0].reason}"\n`);

  console.log('🎉 ALL PERMANENT DISTRIBUTOR DELETION TESTS PASSED SUCCESSFULLY!\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
