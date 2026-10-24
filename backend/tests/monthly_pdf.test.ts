import { pool, query } from '../src/db/connection';
import { initializeDatabase } from '../src/db/init';
import { generateMonthlyClosingPdf } from '../src/services/monthlyPdfService';

async function runMonthlyPdfTest() {
  console.log('====================================================');
  console.log('🧪 TESTING MONTHLY DAILY CLOSING PDF REPORT GENERATION');
  console.log('====================================================\n');

  await initializeDatabase();

  // 1. Authenticate as Owner
  console.log('--- 1. Authenticating as Owner ---');
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '7989856610', pin: '1234' }),
  });
  const loginData = (await loginRes.json()) as any;
  if (!loginData.success) {
    throw new Error('Owner login failed: ' + JSON.stringify(loginData));
  }
  const token = loginData.data.token;
  const cookie = loginRes.headers.get('set-cookie') || '';
  console.log('✅ Logged in successfully as Owner');

  // 2. Test Preview Metadata endpoint for October 2026
  console.log('\n--- 2. Testing GET /api/reports/monthly-pdf-preview ---');
  const prevRes = await fetch('http://localhost:5000/api/reports/monthly-pdf-preview?year=2026&month=10', {
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: cookie,
    },
  });
  const prevData = (await prevRes.json()) as any;
  if (!prevData.success) {
    throw new Error('Preview request failed: ' + JSON.stringify(prevData));
  }
  console.log('✅ Preview Metadata returned:', prevData.data);
  if (prevData.data.daysInMonth !== 31) {
    throw new Error(`Expected 31 days for October, got ${prevData.data.daysInMonth}`);
  }
  if (!prevData.data.filename.includes('October_2026.pdf')) {
    throw new Error(`Filename unexpected: ${prevData.data.filename}`);
  }

  // 3. Test Service directly for October 2026 (31 days)
  console.log('\n--- 3. Testing generateMonthlyClosingPdf service directly ---');
  const { buffer, filename } = await generateMonthlyClosingPdf({ year: 2026, month: 10 });
  console.log(`✅ Generated PDF size: ${buffer.length} bytes`);
  console.log(`✅ Generated filename: ${filename}`);

  if (buffer.length < 5000) {
    throw new Error(`Generated PDF buffer suspiciously small (${buffer.length} bytes)`);
  }
  // Check PDF signature '%PDF'
  const pdfHeader = buffer.slice(0, 5).toString('ascii');
  if (!pdfHeader.startsWith('%PDF')) {
    throw new Error(`Invalid PDF header signature: ${pdfHeader}`);
  }
  console.log('✅ PDF Header validated (%PDF)');

  // 4. Test Service directly for February in leap year (2028: 29 days) and non-leap year (2027: 28 days)
  console.log('\n--- 4. Testing February Days (Leap & Non-Leap Years) ---');
  const febLeap = await generateMonthlyClosingPdf({ year: 2028, month: 2 });
  console.log(`✅ February 2028 (Leap Year) generated: ${febLeap.buffer.length} bytes`);
  const febNonLeap = await generateMonthlyClosingPdf({ year: 2027, month: 2 });
  console.log(`✅ February 2027 (Non-Leap Year) generated: ${febNonLeap.buffer.length} bytes`);

  // 5. Test Download via HTTP GET /api/reports/monthly-pdf
  console.log('\n--- 5. Testing HTTP GET /api/reports/monthly-pdf ---');
  const pdfHttpRes = await fetch('http://localhost:5000/api/reports/monthly-pdf?year=2026&month=10', {
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: cookie,
    },
  });
  if (pdfHttpRes.status !== 200) {
    throw new Error(`HTTP PDF download failed with status ${pdfHttpRes.status}`);
  }
  const contentType = pdfHttpRes.headers.get('content-type');
  const contentDisp = pdfHttpRes.headers.get('content-disposition');
  console.log('✅ Content-Type:', contentType);
  console.log('✅ Content-Disposition:', contentDisp);

  if (contentType !== 'application/pdf') {
    throw new Error(`Expected content-type application/pdf, got ${contentType}`);
  }
  if (!contentDisp?.includes('Chicken_Shop_Closing_Report_October_2026.pdf')) {
    throw new Error(`Expected filename in content-disposition, got ${contentDisp}`);
  }
  const httpBuffer = Buffer.from(await pdfHttpRes.arrayBuffer());
  console.log(`✅ Downloaded PDF binary size: ${httpBuffer.length} bytes`);

  console.log('\n🎉 ALL MONTHLY CLOSING PDF TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runMonthlyPdfTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
