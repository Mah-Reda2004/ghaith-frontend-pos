const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const calls = [], bodies = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { sessionStorage.setItem('ghaith-access-token', 'admin-test'); sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'admin-1', name: 'مدير', role: 'admin' })); });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname; calls.push(`${request.method()} ${path}`); if (request.method() !== 'GET') bodies.push({ path, body: request.postDataJSON() });
      if (path === '/api/v1/admin/notifications') return route.fulfill({ json: { items: [{ id: 'notice-1', title: 'تنبيه زكاة', message: 'اقترب موعد دورة الزكاة', priority: 'warning', created_at: '2026-09-16T08:00:00Z', is_read: false }] } });
      if (path === '/api/v1/admin/zakat/inventory') return route.fulfill({ json: { cycle_id: '11111111-1111-4111-8111-111111111111', gold_price_per_gram: 5000, summary: { eligible_inventory_value: 10000, zakat_rate: 2.5, zakat_due: 250, stale_items_count: 1 }, items: [{ product_name: 'عباية راكدة', category_name: 'حريمي', quantity: 2, unit_cost: 5000, total_value: 10000, days_in_stock: 370, zakat_due: 250, arrival_date: '2025-09-01' }] } });
      if (path === '/api/v1/admin/zakat/settings') return route.fulfill({ json: { ok: true } });
      if (path === '/api/v1/admin/zakat/calculate') return route.fulfill({ json: { summary: { eligible_inventory_value: 10000, zakat_rate: 2.5, zakat_due: 250 } } });
      if (path === '/api/v1/admin/zakat/reports/11111111-1111-4111-8111-111111111111') return route.fulfill({ json: { summary: { total_zakat: 250 } } });
      if (path === '/api/v1/admin/zakat/reminders/run') return route.fulfill({ json: { message: 'تم إرسال التذكيرات' } });
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#zakat');
    await page.getByText('عباية راكدة', { exact: true }).waitFor();
    assert.match(await page.locator('#zakatDueValue').textContent(), /250\.00/);
    await page.locator('#notificationTrigger').click();
    await page.getByText('تنبيه زكاة', { exact: true }).waitFor();
    await page.locator('.notification-item[data-id="notice-1"] [data-read]').click();
    await page.locator('#notificationMarkAll').click();
    await page.locator('#zakatGoldPrice').fill('5200'); await page.locator('#zakatSaveSettings').click();
    await page.locator('#zakatCalculate').click(); await page.locator('#zakatOpenReport').click(); await page.locator('#zakatReminders').click();
    await page.getByText('تم إرسال التذكيرات', { exact: true }).waitFor();
    const settings = bodies.find(entry => entry.path.endsWith('/settings')).body, calculate = bodies.find(entry => entry.path.endsWith('/calculate')).body;
    assert.deepEqual(settings, { cycle_id: '11111111-1111-4111-8111-111111111111', gold_price_per_gram: 5200 });
    assert.equal(calculate.cycle_id, '11111111-1111-4111-8111-111111111111'); assert.match(calculate.idempotency_key, /^[0-9a-f-]{36}$/i);
    for (const expected of ['GET /api/v1/admin/zakat/inventory', 'GET /api/v1/admin/zakat/reports/11111111-1111-4111-8111-111111111111', 'POST /api/v1/admin/zakat/reminders/run']) assert.ok(calls.includes(expected));
    assert.ok(calls.includes('PATCH /api/v1/admin/notifications/notice-1'));
    assert.ok(calls.includes('POST /api/v1/admin/notifications/read-all'));
    assert.deepEqual(bodies.find(entry => entry.path.endsWith('/notifications/notice-1')).body, { read: true });
    assert.deepEqual(errors, []);
    console.log('PASS: zakat endpoints and server notifications are connected.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
