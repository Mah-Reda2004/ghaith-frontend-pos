const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const calls = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('ghaith-access-token', 'admin-test');
      sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'admin-id', name: 'مدير الاختبار', role: 'admin' }));
    });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const url = new URL(route.request().url());
      calls.push(`${url.pathname}?${url.searchParams}`);
      return route.fulfill({ json: { items: [{ invoice_number: 'INV-API', total_amount: 250, created_at: '2026-09-10T10:00:00Z' }], total: 41, summary: { total_sales: 250, invoice_count: 1 } } });
    });

    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#reports');
    await page.getByText('INV-API').waitFor();
    assert.match(calls[0], /^\/api\/v1\/admin\/reports\/sales\?.*period=this_month/);

    for (const report of ['profits', 'products', 'suppliers', 'inventory', 'debts', 'expenses', 'discounts', 'commissions', 'returns']) {
      await page.locator(`[data-report="${report}"]`).click();
      await page.getByText('INV-API').waitFor();
    }
    for (const endpoint of ['overview', 'products', 'purchases', 'inventory-revaluations', 'debts', 'expenses', 'discounts', 'commissions', 'returns-exchanges']) {
      assert.ok(calls.some(call => call.startsWith(`/api/v1/admin/reports/${endpoint}?`)), `missing ${endpoint}`);
    }

    await page.locator('#reportsPeriod').selectOption('custom');
    await page.locator('#reportsFromDate').fill('2026-09-01');
    await page.locator('#reportsToDate').fill('2026-09-10');
    await page.locator('#reportsApply').click();
    await page.getByText('INV-API').waitFor();
    assert.ok(calls.some(call => call.includes('period=custom') && call.includes('from_date=2026-09-01') && call.includes('to_date=2026-09-10')));
    assert.deepEqual(errors, []);
    console.log('PASS: reports use the documented endpoints, periods and custom date parameters.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
