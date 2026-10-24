import { pool, query } from '../src/db/connection';
import { generateDailyClosingPdf } from '../src/services/dailyPdfService';

async function runTest() {
  console.log('====================================================');
  console.log('🧪 TESTING SINGLE-DAY DAILY CLOSING PDF REPORT GENERATION');
  console.log('====================================================\n');

  try {
    // 1. Authenticate / Login to get token
    console.log('--- 1. Authenticating as Owner ---');
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '7989856610', pin: '1234' }),
    });
    const loginData = (await loginRes.json()) as any;
    if (!loginData.success || !loginData.data?.token) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }
    const token = loginData.data.token;
    console.log('✅ Logged in successfully as Owner');

    // 2. Find a completed date in daily_closings
    const closingsRes = await query(
      "SELECT business_date, status FROM daily_closings WHERE status = 'Completed' ORDER BY business_date DESC LIMIT 1"
    );
    if (closingsRes.rows.length === 0) {
      throw new Error('No completed daily closing found in database to test.');
    }
    const testDate = closingsRes.rows[0].business_date instanceof Date
      ? closingsRes.rows[0].business_date.toISOString().split('T')[0]
      : String(closingsRes.rows[0].business_date).split('T')[0];
    console.log(`\n--- 2. Testing generateDailyClosingPdf for date: ${testDate} ---`);

    const { buffer, filename } = await generateDailyClosingPdf({ date: testDate });
    console.log(`✅ Generated PDF size: ${buffer.length} bytes`);
    console.log(`✅ Generated filename: ${filename}`);

    const header = buffer.subarray(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      throw new Error(`Invalid PDF header: ${header}`);
    }
    console.log('✅ PDF Header validated (%PDF)');

    // 3. Test HTTP GET /api/closing/daily-pdf?date=...
    console.log('\n--- 3. Testing HTTP GET /api/closing/daily-pdf ---');
    const apiRes = await fetch(`http://localhost:5000/api/closing/daily-pdf?date=${testDate}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (apiRes.status !== 200) {
      const errText = await apiRes.text();
      throw new Error(`API failed with status ${apiRes.status}: ${errText}`);
    }
    const contentType = apiRes.headers.get('content-type');
    const disposition = apiRes.headers.get('content-disposition');
    console.log(`✅ Content-Type: ${contentType}`);
    console.log(`✅ Content-Disposition: ${disposition}`);

    const apiBuffer = Buffer.from(await apiRes.arrayBuffer());
    console.log(`✅ Downloaded PDF binary size: ${apiBuffer.length} bytes`);

    // 4. Test HTTP GET /api/reports/daily-pdf?date=...
    console.log('\n--- 4. Testing HTTP GET /api/reports/daily-pdf ---');
    const repRes = await fetch(`http://localhost:5000/api/reports/daily-pdf?date=${testDate}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (repRes.status !== 200) {
      throw new Error(`Reports API failed with status ${repRes.status}`);
    }
    console.log('✅ Reports endpoint /api/reports/daily-pdf returned 200 OK');

    console.log('\n🎉 ALL SINGLE-DAY CLOSING PDF TESTS PASSED SUCCESSFULLY!\n');
    await pool.end();
  } catch (err: any) {
    console.error('❌ Test failed with error:', err);
    await pool.end();
    process.exit(1);
  }
}

runTest();
