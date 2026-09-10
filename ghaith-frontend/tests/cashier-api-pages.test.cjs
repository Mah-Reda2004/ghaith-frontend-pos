const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], calls = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { sessionStorage.setItem('ghaith-access-token', 'cashier-test'); sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', name: 'الكاشير', role: 'cashier' })); });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname; calls.push(`${request.method()} ${path}`);
      if (path === '/api/v1/categories') return route.fulfill({ json: { categories: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'رجالي' }, { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'عطور' }] } });
      if (path === '/api/v1/products/search') return route.fulfill({ json: { items: [{ id: 'p2', name_ar: 'عطر API', sale_price: 100, product_variants: [{ id: 'abababab-abab-4bab-8bab-abababababab', sku: 'PERFUME', stock_qty: 3, version: 1 }] }] } });
      if (path === '/api/v1/products') return route.fulfill({ json: { products: [{ id: 'p1', name_ar: 'ثوب API', category_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sale_price: 300, product_variants: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', sku: 'THOB', stock_qty: 2, version: 1 }] }, { id: 'p2', name_ar: 'عطر API', categories: [{ category_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name_ar: 'عطور' }], sale_price: 100, product_variants: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', sku: 'PERFUME', stock_qty: 3, version: 1 }] }] } });
      if (path === '/api/v1/customer-types') return route.fulfill({ json: [] });
      if (path === '/api/v1/admin/users') return route.fulfill({ json: { items: [{ id: '77777777-7777-4777-8777-777777777777', name: 'سيلز النظام', roles: [{ name: 'sales' }], is_active: true }, { id: '88888888-8888-4888-8888-888888888888', name: 'مدير النظام', role: 'admin', is_active: true }], total: 2 } });
      if (path === '/api/v1/shifts/current') return route.fulfill({ json: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', opened_at: new Date().toISOString() } });
      if (path.endsWith('/summary')) return route.fulfill({ json: { total_sales: 400, invoice_count: 2, cash_total: 300, card_total: 100, returns_total: 0, total_expenses: 20, payment_breakdown: { cash: { amount: 300, count: 1 }, card: { amount: 100, count: 1 } } } });
      if (path === '/api/v1/invoices') return route.fulfill({ json: { items: [{ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', invoice_number: 'INV-API', status: 'completed', payment_method: 'cash', total_amount: 300, created_at: new Date().toISOString() }] } });
      if (path === '/api/v1/debts') return route.fulfill({ json: { items: [{ id: '99999999-9999-4999-8999-999999999999', invoice_number: 'INV-DEBT', customer_name: 'عميل آجل', total_amount: 500, paid_amount: 100, remaining_amount: 400, created_at: new Date().toISOString() }] } });
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
    for (const route of ['invoices', 'debts', 'shift-close']) { await page.evaluate(name => { location.hash = name; }, route); await page.waitForTimeout(500); assert.equal(await page.locator('.cashier-view__error').count(), 0, `${route} failed`); }
    assert.ok(calls.includes('GET /api/v1/invoices'));
    assert.ok(calls.includes('GET /api/v1/debts'));
    assert.ok(calls.includes('GET /api/v1/shifts/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/summary'));
    assert.deepEqual(errors, []);
    console.log('PASS: backend categories filter POS products; invoices, debts and shift summary are API-backed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
