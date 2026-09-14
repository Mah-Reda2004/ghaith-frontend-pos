const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const calls = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { sessionStorage.setItem('ghaith-access-token', 'test'); sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'user-1', name: 'مستخدم', role: 'cashier' })); });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const request = route.request(), url = new URL(request.url()); calls.push(`${request.method()} ${url.pathname}`);
      if (url.pathname === '/api/v1/users/me') return route.fulfill({ json: { id: 'user-1', name: 'كاشير الباك' } });
      if (url.pathname === '/api/v1/shifts/current') return route.fulfill({ json: { id: 'shift-1' } });
      if (url.pathname === '/api/v1/expenses/available-cash') return route.fulfill({ json: { available_cash: 900 } });
      if (url.pathname === '/api/v1/expenses') return route.fulfill({ json: { items: [{ id: 'expense-1', amount: 100, description: 'اختبار', expense_type_name: 'صيانة', created_at: new Date().toISOString() }] } });
      if (url.pathname === '/api/v1/expense-types') return route.fulfill({ json: { items: [{ id: 'type-1', name: 'صيانة' }] } });
      if (url.pathname === '/api/v1/commissions/me') return route.fulfill({ json: { items: [], summary: { total_commission: 25, total_sales: 500, invoice_count: 2 } } });
      if (url.pathname === '/api/v1/admin/settings/integrations') return route.fulfill({ json: { whatsapp_enabled: true, whatsapp_api_url: 'https://api.example.com', whatsapp_api_key: 'secret', email_enabled: true, manager_whatsapp_phone: '+201000000000', manager_email: 'manager@example.com' } });
      if (url.pathname === '/api/v1/returns') return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto('http://127.0.0.1:8765/src/pages/cashier/cashier.html#expenses');
    await page.getByText('اختبار').waitFor();
    assert.equal(await page.locator('.exp-table thead').getByText('رقم المصروف', { exact: true }).count(), 0);
    assert.equal(await page.locator('#expTableBody').getByText('كاشير الباك', { exact: true }).count(), 1);
    await page.locator('#addExpenseBtn').click();
    assert.equal((await page.locator('#infoCashier').textContent()).trim(), 'كاشير الباك');
    assert.match((await page.locator('#infoShift').textContent()).trim(), /shift-1/);
    await page.locator('#cancelAddExpenseBtn').click();
    assert.ok(calls.includes('GET /api/v1/users/me'));
    await page.evaluate(() => { location.hash = 'profile'; });
    await page.getByText('EGP 25.00').waitFor();
    assert.ok(calls.includes('GET /api/v1/expenses'));
    assert.ok(calls.includes('GET /api/v1/expenses/available-cash'));
    assert.ok(calls.includes('GET /api/v1/commissions/me'));

    await page.addInitScript(() => sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'admin-1', name: 'مدير', role: 'admin' })));
    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#settings');
    await page.locator('#integrationsForm input[name="manager_email"]').waitFor();
    await page.locator('#integrationsForm button[type="submit"]').click();
    await page.getByText('تم حفظ إعدادات التكاملات بنجاح.').waitFor();
    assert.ok(calls.includes('GET /api/v1/admin/settings/integrations'));
    assert.ok(calls.includes('PATCH /api/v1/admin/settings/integrations'));
    assert.deepEqual(errors, []);
    console.log('PASS: expenses, available cash, commissions and integration settings are API-backed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
