const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], calls = []; let closeBody; let closeKey;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { if (!location.pathname.includes('/auth/login/')) { sessionStorage.setItem('ghaith-access-token', 'cashier-test'); sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', name: 'الكاشير', role: 'cashier' })); } });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname; calls.push(`${request.method()} ${path}`);
      if (path === '/api/v1/categories') return route.fulfill({ json: { categories: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'رجالي' }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'عطور' }] } });
      if (path === '/api/v1/products' || path === '/api/v1/products/search') {
        const categoryId = new URL(request.url()).searchParams.get('category_id');
        const items = [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', product_id: 'p1', name: 'ثوب API', category: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'رجالي' }, sku: 'THOB', size: 'L', color: 'أبيض', sale_price: 300, stock_qty: 2, version: 1 }, { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', product_id: 'p2', name: 'عطر API', category: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'عطور' }, sku: 'PERFUME', size: 'افتراضي', color: 'افتراضي', sale_price: 100, stock_qty: 3, version: 1 }];
        const filtered = categoryId ? items.filter(item => item.category.id === categoryId) : items;
        return route.fulfill({ json: { items: filtered, total: filtered.length } });
      }
      if (path === '/api/v1/customer-types') return route.fulfill({ json: [] });
      if (path === '/api/v1/admin/users') return route.fulfill({ json: { items: [{ id: '77777777-7777-4777-8777-777777777777', name: 'سيلز النظام', role: 'sales', is_active: true }], total: 1 } });
      if (path === '/api/v1/shifts/current') return route.fulfill({ json: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', version: 4, opened_at: new Date().toISOString() } });
      if (path.endsWith('/summary')) return route.fulfill({ json: { total_sales: 400, invoice_count: 2, cash_total: 300, card_total: 100, returns_total: 0, total_expenses: 20, expense_count: 1, payment_breakdown: { cash: { amount: 300, count: 1 }, card: { amount: 100, count: 1 } } } });
      if (path === '/api/v1/shifts/close' && request.method() === 'POST') { closeBody = request.postDataJSON(); closeKey = request.headers()['idempotency-key']; return route.fulfill({ json: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'closed' } }); }
      if (path === '/api/v1/sales-invoices') return route.fulfill({ json: { items: [{ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', invoice_number: 'INV-API', status: 'completed', payment_method: 'cash', total_amount: 300, created_at: new Date().toISOString() }], total: 1 } });
      if (path === '/api/v1/debts') return route.fulfill({ json: { items: [{ id: '99999999-9999-4999-8999-999999999999', invoice_id: '88888888-8888-4888-8888-888888888888', invoice_number: 'INV-DEBT', customer_name: 'عميل آجل', total_amount: 500, paid_amount: 100, remaining_amount: 400, created_at: new Date().toISOString() }] } });
      return route.fulfill({ json: {} });
    });
    await page.goto('http://127.0.0.1:8765/src/pages/cashier/cashier.html#pos');
    await page.getByText('عطور', { exact: true }).waitFor();
    assert.equal(await page.locator('#salesSelect option', { hasText: 'سيلز النظام' }).count(), 1);
    await page.getByText('عطر API', { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#cartCount')?.textContent.includes('1'));
    await page.getByText('عطور', { exact: true }).click();
    await page.locator('#productGrid').getByText('عطر API', { exact: true }).waitFor();
    assert.equal(await page.getByText('ثوب API', { exact: true }).count(), 0);
    await page.locator('#productGrid').getByText('عطر API', { exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#cartCount')?.textContent.includes('2'));
    assert.equal(await page.locator('#cartList .cart-item').count(), 1);
    await page.setViewportSize({ width: 1024, height: 768 });
    for (const route of ['pos', 'invoices', 'debts', 'shift-close', 'expenses', 'profile']) {
      await page.evaluate(name => { location.hash = name; }, route);
      await page.waitForTimeout(500);
      assert.equal(await page.locator('.cashier-view__error').count(), 0, `${route} failed`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${route} has page-level horizontal overflow at tablet width`);
    }
    await page.evaluate(() => { location.hash = 'debts'; });
    await page.getByText('#INV-DEBT', { exact: true }).waitFor();
    assert.equal(await page.getByText(/#88888888-8888/).count(), 0);
    await page.evaluate(() => { location.hash = 'shift-close'; });
    await page.locator('#closeShiftBtn').waitFor();
    assert.ok(calls.includes('GET /api/v1/sales-invoices'));
    assert.equal(calls.includes('GET /api/v1/admin/notifications'), false);
    assert.ok(calls.includes('GET /api/v1/debts'));
    assert.ok(calls.includes('GET /api/v1/shifts/current/summary'));
    await page.locator('#closeShiftBtn').click();
    await page.locator('#countedCash').fill('295');
    await page.locator('#confirmCloseBtn').click();
    await page.getByText('تم إغلاق الوردية بنجاح').waitFor();
    await page.waitForURL(/\/auth\/login\/login\.html/);
    assert.equal(closeBody.counted_cash, 295);
    assert.match(closeBody.idempotency_key, /^[0-9a-f-]{36}$/i);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('ghaith-access-token')), null);
    assert.deepEqual(errors, []);
    console.log('PASS: backend categories filter POS products; invoices, debts and shift summary are API-backed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
