const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const calls = [], bodies = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('ghaith-access-token', 'cashier-test');
      sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'cashier-1', name: 'كاشير', role: 'cashier' }));
    });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      calls.push(`${request.method()} ${path}`);
      if (request.method() !== 'GET') bodies.push({ path, body: request.postDataJSON() });
      if (path === '/api/v1/notifications') return route.fulfill({ json: { items: [{ id: 'cashier-notice-1', title: 'تنبيه وردية', message: 'راجع الوردية الحالية', type: 'shift', priority: 'warning', created_at: '2026-09-20T08:00:00Z', is_read: false }] } });
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto('http://127.0.0.1:8765/src/pages/cashier/cashier.html#pos');
    await page.locator('#notificationTrigger').click();
    await page.getByText('تنبيه وردية', { exact: true }).waitFor();
    await page.locator('.notification-item[data-id="cashier-notice-1"] [data-read]').click();
    await page.locator('#notificationMarkAll').click();
    assert.ok(calls.includes('GET /api/v1/notifications'));
    assert.ok(calls.includes('PATCH /api/v1/notifications/cashier-notice-1'));
    assert.ok(calls.includes('POST /api/v1/notifications/read-all'));
    assert.deepEqual(bodies.find(entry => entry.path.endsWith('/notifications/cashier-notice-1')).body, { read: true });
    assert.deepEqual(errors, []);
    console.log('PASS: cashier notifications are loaded and read state is persisted to the API.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
