const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
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
      if (url.pathname === '/api/v1/shifts/current') return route.fulfill({ json: { id: '11111111-1111-4111-8111-111111111111' } });
      if (url.pathname === '/api/v1/admin/reports/daily') return route.fulfill({ json: { items: [{ name: 'مبيعات اليوم', amount: 300 }], summary: { total_sales: 300, invoice_count: 2, total_expenses: 50, net_total: 250 } } });
      if (url.pathname === '/api/v1/admin/reports/shifts/11111111-1111-4111-8111-111111111111') return route.fulfill({ json: { items: [{ method: 'cash', amount: 300 }], summary: { total_sales: 300, invoice_count: 2, total_expenses: 50, expected_cash: 250 } } });
      if (url.pathname === '/api/v1/admin/reports/overview') return route.fulfill({ json: { data: { kpis: { total_sales: 900, total_cost: 400, total_expenses: 100, net_profit: 400 }, sales_series: [{ date: '2026-09-09', total_sales: 350 }, { date: '2026-09-10', total_sales: 550 }], cost_series: [{ date: '2026-09-09', total_cost: 200 }, { date: '2026-09-10', total_cost: 200 }], expense_series: [{ date: '2026-09-09', total_expenses: 0 }, { date: '2026-09-10', total_expenses: 100 }], profit_series: [{ date: '2026-09-09', net_profit: 150 }, { date: '2026-09-10', net_profit: 250 }] } } });
      if (url.pathname === '/api/v1/admin/reports/commissions') return route.fulfill({ json: { commissions: [{ sales_person_name: 'سيلز العمولات', invoice_count: 3, total_sales: 1500, commission_rate: 2, commission_amount: 30 }], summary: { total_commissions: 30, sales_people_count: 1 } } });
      return route.fulfill({ json: { items: [{ invoice_number: 'INV-API', total_amount: 250, created_at: '2026-09-10T10:00:00Z' }], total: 41, summary: { total_sales: 250, invoice_count: 1 } } });
    });

    await page.goto(`${baseUrl}/src/pages/admin/admin.html#reports`);
    await page.getByText('INV-API').waitFor();
    assert.ok(calls.some(call => /^\/api\/v1\/admin\/reports\/sales\?.*period=this_month/.test(call)));

    for (const report of ['shifts', 'profits', 'products', 'suppliers', 'inventory', 'debts', 'expenses', 'discounts', 'commissions', 'returns']) {
      await page.locator(`[data-report="${report}"]`).click();
      await page.locator('.reports-chart-card').waitFor();
      assert.equal(await page.locator('.reports-chart-card').count(), 1, `${report} chart area is missing`);
      assert.equal(await page.locator('.reports-chart svg').count(), 1, `${report} chart should be rendered`);
      if (report === 'shifts') {
        assert.equal(await page.locator('#reportsShiftId').count(), 0, 'shift id must not be entered manually');
        assert.equal(await page.locator('#reportsPeriod').inputValue(), 'this_month');
        assert.match(await page.locator('.reports-table').textContent(), /الكاشير/);
      } else if (report === 'inventory') {
        assert.match(await page.locator('.reports-chart-card h3').textContent(), /قيمة المخزون|الزيادات/);
      } else if (report === 'profits') {
        assert.deepEqual((await page.locator('.reports-stat__value').allTextContents()).map(value => value.replace(/\s+/g, ' ').trim()), ['٩٠٠EGP', '٤٠٠EGP', '١٠٠EGP', '٤٠٠EGP']);
        assert.equal(await page.locator('.reports-chart svg').count(), 1);
        assert.equal(await page.locator('#reportsTableBody tr').count(), 2);
        assert.match(await page.locator('#reportsTableBody').textContent(), /٥٥٠/);
      } else if (report === 'commissions') {
        await page.locator('#reportsTableBody').getByText('سيلز العمولات').waitFor();
        assert.match(await page.locator('#reportsTableBody').textContent(), /٣٠/);
      } else if (report !== 'shifts') await page.getByText('INV-API').waitFor();
    }
    for (const endpoint of ['overview', 'products', 'purchases', 'inventory-revaluations', 'debts', 'expenses', 'discounts', 'commissions', 'returns-exchanges']) {
      assert.ok(calls.some(call => call.startsWith(`/api/v1/admin/reports/${endpoint}?`)), `missing ${endpoint}`);
    }

    const salesCallsBeforeCachedVisit = calls.filter(call => call.startsWith('/api/v1/admin/reports/sales?')).length;
    await page.locator('[data-report="sales"]').click();
    await page.getByText('INV-API').waitFor();
    await page.locator('[data-report="products"]').click();
    await page.getByText('INV-API').waitFor();
    await page.locator('[data-report="sales"]').click();
    await page.getByText('INV-API').waitFor();
    assert.equal(calls.filter(call => call.startsWith('/api/v1/admin/reports/sales?')).length, salesCallsBeforeCachedVisit, 'cached tab visits should not repeat API requests');

    await page.locator('[data-report="returns"]').click();
    await page.getByText('INV-API').waitFor();
    await page.locator('#reportsPeriod').selectOption('custom');
    await page.locator('#reportsFromDate').fill('2026-09-01');
    await page.locator('#reportsToDate').fill('2026-09-10');
    await page.locator('#reportsApply').click();
    await page.getByText('INV-API').waitFor();
    assert.ok(calls.some(call => call.includes('period=custom') && call.includes('from_date=2026-09-01') && call.includes('to_date=2026-09-10')));
    await page.locator('#reportsPrint').click();
    await page.waitForTimeout(200);
    assert.ok(calls.some(call => call.startsWith('/api/v1/admin/reports/returns-exchanges/print?')));
    assert.deepEqual(errors, []);
    console.log('PASS: reports use the documented endpoints, periods and custom date parameters.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
