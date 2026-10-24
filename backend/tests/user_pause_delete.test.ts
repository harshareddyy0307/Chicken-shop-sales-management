import { query } from '../src/db/connection';

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('\n====================================================');
  console.log('🧪 TESTING USER PAUSE/RESUME AND PERMANENT DELETION');
  console.log('====================================================\n');

  try {
    // 1. Owner Login
    console.log('--- 1. Authenticating as Owner ---');
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '7989856610', pin: '1234' }),
    });
    const loginData = await loginRes.json();
    const setCookie = loginRes.headers.get('set-cookie');
    const ownerToken = loginData.data.token;
    const ownerId = loginData.data.user.id;
    const authHeaders = {
      Cookie: setCookie ? setCookie.split(';')[0] : `token=${ownerToken}`,
      Authorization: `Bearer ${ownerToken}`,
      'Content-Type': 'application/json',
    };
    console.log('✅ Owner logged in successfully, ID:', ownerId);

    // Clean up any previous test user with 9999988888
    await query('DELETE FROM users WHERE normalized_phone = $1', ['9999988888']);

    // 2. Create a test staff user
    console.log('\n--- 2. Creating a test staff user ---');
    const createRes = await fetch(`${API_BASE}/auth/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fullName: 'Test Temporary Staff',
        phone: '9999988888',
        pin: '4321',
        role: 'staff',
      }),
    });
    const createData = await createRes.json();
    if (!createData.success) {
      throw new Error(`Failed to create user: ${createData.error}`);
    }
    const testUser = createData.data;
    console.log('✅ Created test staff user:', testUser.full_name, 'ID:', testUser.id);

    // 3. Pause (Deactivate) the test staff user
    console.log('\n--- 3. Testing Pausing the account ---');
    const pauseRes = await fetch(`${API_BASE}/auth/users/${testUser.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    const pauseData = await pauseRes.json();
    console.log('✅ Pause Response:', pauseData.message);
    if (pauseData.data.is_active !== false) {
      throw new Error('Expected is_active to be false after pause');
    }

    // 4. Verify paused user cannot log in
    console.log('\n--- 4. Verifying paused user cannot log in ---');
    const blockedLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '9999988888',
        pin: '4321',
      }),
    });
    const blockedData = await blockedLoginRes.json();
    if (blockedLoginRes.status === 403) {
      console.log('✅ Correctly blocked paused user login with 403:', blockedData.error);
    } else {
      throw new Error(`Expected 403 for paused user, got ${blockedLoginRes.status}`);
    }

    // 5. Resume (Activate) the test staff user
    console.log('\n--- 5. Testing Resuming the account ---');
    const resumeRes = await fetch(`${API_BASE}/auth/users/${testUser.id}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ isActive: true }),
    });
    const resumeData = await resumeRes.json();
    console.log('✅ Resume Response:', resumeData.message);
    if (resumeData.data.is_active !== true) {
      throw new Error('Expected is_active to be true after resume');
    }

    // 6. Verify resumed user can log in
    console.log('\n--- 6. Verifying resumed user can log in ---');
    const staffLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '9999988888',
        pin: '4321',
      }),
    });
    const staffLoginData = await staffLoginRes.json();
    if (staffLoginRes.status === 200 && staffLoginData.success) {
      console.log('✅ Resumed user authenticated successfully, token received');
    } else {
      throw new Error(`Expected 200 for resumed user login, got: ${JSON.stringify(staffLoginData)}`);
    }

    // 7. Testing Self-Pause prevention
    console.log('\n--- 7. Testing Self-Pause prevention ---');
    const selfPauseRes = await fetch(`${API_BASE}/auth/users/${ownerId}/status`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ isActive: false }),
    });
    const selfPauseData = await selfPauseRes.json();
    if (selfPauseRes.status === 400) {
      console.log('✅ Correctly prevented self-pause with 400:', selfPauseData.error);
    } else {
      throw new Error(`Expected 400 for self-pause, got: ${selfPauseRes.status}`);
    }

    // 8. Permanently delete the test staff user
    console.log('\n--- 8. Testing Permanent Deletion of account ---');
    const deleteRes = await fetch(`${API_BASE}/auth/users/${testUser.id}`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ reason: 'Test user cleanup' }),
    });
    const deleteData = await deleteRes.json();
    if (deleteRes.status === 200 && deleteData.success) {
      console.log('✅ Delete Response:', deleteData.message);
    } else {
      throw new Error(`Failed to delete user: ${JSON.stringify(deleteData)}`);
    }

    // 9. Verify deleted user no longer exists
    console.log('\n--- 9. Verifying deleted user no longer exists in users list ---');
    const listRes = await fetch(`${API_BASE}/auth/users`, { headers: authHeaders });
    const listData = await listRes.json();
    const found = listData.data.find((u: any) => u.id === testUser.id);
    if (found) {
      throw new Error('Deleted user was still found in users list!');
    }
    console.log('✅ User successfully removed from database');

    // 10. Testing Self-Delete prevention
    console.log('\n--- 10. Testing Self-Delete prevention ---');
    const selfDeleteRes = await fetch(`${API_BASE}/auth/users/${ownerId}`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ reason: 'Accidental self-delete' }),
    });
    const selfDeleteData = await selfDeleteRes.json();
    if (selfDeleteRes.status === 400) {
      console.log('✅ Correctly prevented self-deletion with 400:', selfDeleteData.error);
    } else {
      throw new Error(`Expected 400 for self-delete, got: ${selfDeleteRes.status}`);
    }

    // 11. Verify Audit Logs
    console.log('\n--- 11. Verifying Audit Logs ---');
    const auditRes = await query(
      `SELECT action, reason, user_name FROM audit_logs WHERE module = 'USERS' ORDER BY id DESC LIMIT 5`
    );
    console.log('✅ Recent User Audit Records:');
    auditRes.rows.forEach((r) => {
      console.log(`  - [${r.action}] by ${r.user_name}: ${r.reason || ''}`);
    });

    console.log('\n🎉 ALL USER PAUSE, RESUME, AND PERMANENT DELETION TESTS PASSED!\n');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

runTests();
