const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], calls = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { sessionStorage.setItem('ghaith-access-token', 'admin-test'); sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', name: 'مدير الاختبار', role: 'admin' })); });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const path = new URL(route.request().url()).pathname; calls.push(path);
      if (path === '/api/v1/categories') return route.fulfill({ json: { items: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'رجالي' }] } });
      if (path === '/api/v1/customer-types') return route.fulfill({ json: { items: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'عادي', discount_percent: 0 }] } });
      if (path.endsWith('/summary')) return route.fulfill({ json: { total_product_count: 1, total_units: 4, low_stock_count: 0, out_of_stock_count: 0, inventory_value: 400, total_suppliers: 1, active_suppliers: 1, total_payables: 0, total_sales: 100, net_sales: 100, invoice_count: 1 } });
      if (path === '/api/v1/admin/products') return route.fulfill({ json: { items: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name_ar: 'منتج API', category_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', supplier_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', supplier_name: 'مورد API', sell_price: 100, cost_price: 60, min_qty: 5, version: 1, product_variants: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', sku: 'API-L', size: 'L', color: 'أبيض', stock_qty: 4, version: 1 }, { id: 'abababab-abab-4bab-8bab-abababababab', sku: 'API-XL', size: 'XL', color: 'أسود', stock_qty: 0, version: 1 }] }], total: 1 } });
      if (path === '/api/v1/admin/suppliers') return route.fulfill({ json: { items: [{ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', name: 'مورد API', phone: '01000000000', status: 'active', version: 1 }], total: 1 } });
      if (path === '/api/v1/admin/users') return route.fulfill({ json: { items: [{ id: '11111111-1111-4111-8111-111111111111', username: 'admin', phone: '01000000000', role: 'admin', is_active: true }], total: 1 } });
      if (path === '/api/v1/admin/sales') return route.fulfill({ json: { items: [{ id: '99999999-9999-4999-8999-999999999999', invoice_number: 'INV-1', total_amount: 100, created_at: new Date().toISOString() }], total: 1 } });
      if (path.includes('/api/v1/admin/reports/')) return route.fulfill({ json: { items: [{ name: 'بيان API', amount: 100 }], summary: { total: 100 } } });
      if (path.includes('/purchase-invoices')) return route.fulfill({ json: { items: [] } });
      return route.fulfill({ json: { items: [], total: 0 } });
    });
    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#dashboard');
    for (const route of ['dashboard', 'categories', 'products', 'inventory', 'suppliers', 'users', 'discounts', 'sales', 'reports', 'purchase-invoice', 'zakat']) {
      await page.evaluate(name => { location.hash = name; }, route);
      await page.waitForTimeout(350);
      assert.equal(await page.locator('.admin-view__error').count(), 0, `${route} route failed`);
      if (route === 'products') {
        assert.equal(await page.locator('#productsTableBody tr').count(), 1);
        assert.equal(await page.locator('#productsTableBody .product-variant-badge').count(), 2);
        assert.match(await page.locator('#productsTableBody').textContent(), /المقاس:\s*L/);
        assert.match(await page.locator('#productsTableBody').textContent(), /اللون:\s*أبيض/);
        assert.match(await page.locator('#productsTableBody tr').textContent(), /مورد API/);
        await page.locator('#addProductBtn').click();
        assert.equal(await page.locator('#productImageUrl').count(), 0);
        assert.equal(await page.locator('#productSupplier option', { hasText: 'مورد API' }).count(), 1);
        await page.locator('#cancelProductModal').click();
      }
      if (route === 'inventory') {
        const stats = await page.locator('.inventory-stat__body strong').allTextContents();
        assert.deepEqual(stats.map(value => value.trim()), ['4', '400 EGP', '0']);
        assert.equal(await page.locator('#inventoryTableBody tr').count(), 1);
        assert.equal(await page.locator('#inventoryTableBody .inventory-variant').count(), 2);
        assert.match(await page.locator('#inventoryTableBody').textContent(), /المقاس:\s*XL/);
        assert.match(await page.locator('#inventoryTableBody').textContent(), /اللون:\s*أسود/);
        assert.match(await page.locator('#inventoryTableBody tr').textContent(), /مورد API/);
      }
    }
    assert.ok(calls.includes('/api/v1/admin/reports/overview'));
    assert.ok(calls.includes('/api/v1/admin/products'));
    assert.ok(calls.includes('/api/v1/admin/sales'));
    assert.deepEqual(errors, []);
    console.log('PASS: all admin routes load and request the current API without browser errors.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
