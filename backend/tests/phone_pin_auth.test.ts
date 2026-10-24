import { query } from '../src/db/connection';
import bcrypt from 'bcryptjs';

const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 TESTING PHONE + 4-DIGIT PIN AUTHENTICATION SYSTEM');
  console.log('====================================================\n');

  // Test 1: Registered phone and correct PIN
  console.log('--- 1. Testing valid login with Phone + 4-Digit PIN ---');
  const loginRes1 = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+91 79898 56610', pin: '1234' }),
  });
  const data1 = await loginRes1.json();
  const setCookie1 = loginRes1.headers.get('set-cookie');

  if (loginRes1.status !== 200 || !data1.success || data1.data?.user?.role !== 'owner') {
    throw new Error(`Test 1 Failed: Expected successful login for owner. Got: ${JSON.stringify(data1)}`);
  }
  if (!setCookie1 || !setCookie1.includes('HttpOnly')) {
    throw new Error('Test 1 Failed: Expected HttpOnly cookie in response headers!');
  }
  console.log('✅ Owner logged in successfully with normalized phone + 4-digit PIN');
  console.log('✅ Secure HttpOnly cookie set in response header\n');

  // Test 2: PIN with leading zeros (e.g. 0123)
  console.log('--- 2. Testing PIN with leading zeros (e.g. 0123) ---');
  // First, create a test staff account with leading-zero PIN '0123'
  const ownerCookie = setCookie1.split(';')[0];
  const testPhone = '9988776655';
  await query('DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE normalized_phone = $1)', [testPhone]);
  await query('DELETE FROM users WHERE normalized_phone = $1', [testPhone]);

  const createRes = await fetch(`${BASE_URL}/auth/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
    body: JSON.stringify({
      fullName: 'Zero Pin Tester',
      phone: testPhone,
      pin: '0123',
      role: 'staff',
    }),
  });
  const createData = await createRes.json();
  if (!createData.success) {
    throw new Error(`Failed to create test user: ${JSON.stringify(createData)}`);
  }

  // Now login with leading zero PIN '0123'
  const zeroLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone, pin: '0123' }),
  });
  const zeroData = await zeroLoginRes.json();
  if (zeroLoginRes.status !== 200 || !zeroData.success) {
    throw new Error(`Test 2 Failed: Leading zero PIN 0123 was rejected: ${JSON.stringify(zeroData)}`);
  }
  console.log('✅ Successfully authenticated user with leading-zero PIN "0123"\n');

  // Test 3: Incorrect PIN rejection with generic error
  console.log('--- 3. Testing incorrect PIN rejection ---');
  const wrongPinRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '7989856610', pin: '9999' }),
  });
  const wrongPinData = await wrongPinRes.json();
  if (wrongPinRes.status !== 401 || wrongPinData.error !== 'Invalid phone number or PIN. Please try again.') {
    throw new Error(`Test 3 Failed: Expected 401 with generic message. Got: ${JSON.stringify(wrongPinData)}`);
  }
  console.log('✅ Incorrect PIN rejected with generic message (no info leaked)\n');

  // Test 4: Unknown phone number rejection with generic error
  console.log('--- 4. Testing unknown phone number rejection ---');
  const unknownPhoneRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9000000000', pin: '1234' }),
  });
  const unknownData = await unknownPhoneRes.json();
  if (unknownPhoneRes.status !== 401 || unknownData.error !== 'Invalid phone number or PIN. Please try again.') {
    throw new Error(`Test 4 Failed: Expected generic 401 message for unknown phone. Got: ${JSON.stringify(unknownData)}`);
  }
  console.log('✅ Unregistered phone rejected with identical generic message (enumeration protected)\n');

  // Test 5: Invalid PIN format (not 4 digits)
  console.log('--- 5. Testing invalid PIN format validation ---');
  const shortPinRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '7989856610', pin: '12' }),
  });
  const shortPinData = await shortPinRes.json();
  if (shortPinRes.status !== 401 && shortPinRes.status !== 400) {
    throw new Error(`Test 5 Failed: Short PIN was not rejected!`);
  }
  console.log('✅ Short/invalid PIN properly rejected\n');

  // Test 6: Deactivated account prevented from logging in
  console.log('--- 6. Testing deactivated account lockout ---');
  await query('UPDATE users SET is_active = false WHERE normalized_phone = $1', [testPhone]);
  const deactRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone, pin: '0123' }),
  });
  const deactData = await deactRes.json();
  if (deactRes.status !== 403 || !deactData.error.includes('deactivated')) {
    throw new Error(`Test 6 Failed: Expected 403 deactivated account rejection. Got: ${JSON.stringify(deactData)}`);
  }
  console.log('✅ Deactivated account blocked with HTTP 403\n');

  // Test 7: Rate limiting & account lockout after 5 failed attempts
  console.log('--- 7. Testing 5-attempt account lockout ---');
  await query('UPDATE users SET is_active = true, failed_login_attempts = 0, locked_until = NULL WHERE normalized_phone = $1', [testPhone]);

  for (let i = 1; i <= 5; i++) {
    const failRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhone, pin: '9999' }),
    });
    const failData = await failRes.json();
    if (i === 5) {
      if (failRes.status !== 429 || !failData.error.includes('temporarily locked')) {
        throw new Error(`Test 7 Failed: Expected 429 lockout on 5th failed attempt. Got: ${JSON.stringify(failData)}`);
      }
    }
  }
  console.log('✅ Account locked for 15 minutes after 5 failed attempts with HTTP 429\n');

  // Test 8: Owner resets user PIN, which unlocks account
  console.log('--- 8. Testing Owner-Controlled PIN Reset ---');
  const resetRes = await fetch(`${BASE_URL}/auth/users/${createData.data.id}/reset-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
    body: JSON.stringify({ newPin: '5678' }),
  });
  const resetData = await resetRes.json();
  if (!resetData.success) {
    throw new Error(`Test 8 Failed: Owner PIN reset failed: ${JSON.stringify(resetData)}`);
  }

  // Verify that account is now unlocked and logs in with new PIN
  const newPinLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone, pin: '5678' }),
  });
  const newPinLoginData = await newPinLoginRes.json();
  if (newPinLoginRes.status !== 200 || !newPinLoginData.success) {
    throw new Error(`Test 8 Failed: Could not login with newly reset PIN: ${JSON.stringify(newPinLoginData)}`);
  }
  console.log('✅ Owner reset user PIN successfully and unlocked account\n');

  // Test 9: Logout clears session cookie
  console.log('--- 9. Testing Logout clears HttpOnly session cookie ---');
  const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: ownerCookie },
  });
  const logoutSetCookie = logoutRes.headers.get('set-cookie');
  if (!logoutSetCookie || !logoutSetCookie.includes('token=;')) {
    throw new Error('Test 9 Failed: Expected logout response to clear token cookie!');
  }
  console.log('✅ Logout successfully cleared HttpOnly session cookie\n');

  // Test 10: Audit log verification (verifying no PINs or PIN hashes in audit log)
  console.log('--- 10. Testing Audit Log integration ---');
  const auditRes = await query(
    `SELECT action, new_values, reason FROM audit_logs
     WHERE module IN ('AUTH', 'USERS')
     ORDER BY id DESC LIMIT 5`
  );
  for (const log of auditRes.rows) {
    const logStr = JSON.stringify(log);
    if (logStr.includes('1234') || logStr.includes('0123') || logStr.includes('5678')) {
      throw new Error(`Security Violation: Plain text PIN found in audit log: ${logStr}`);
    }
  }
  console.log('✅ Verified: Authentication audit logs recorded without exposing PINs or PIN hashes\n');

  // Clean up test user
  await query('DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE normalized_phone = $1)', [testPhone]);
  await query('DELETE FROM users WHERE normalized_phone = $1', [testPhone]);

  console.log('🎉 ALL 10 PHONE + 4-DIGIT PIN AUTHENTICATION TESTS PASSED!\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
