const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('ghaith-access-token', 'admin-test');
      sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'admin-1', name: 'مدير', role: 'admin' }));
    });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/admin/notifications') return route.fulfill({ json: { items: [] } });
      if (url.pathname === '/api/v1/admin/products') {
        const stockStatus = url.searchParams.get('stock_status');
        if (stockStatus === 'limited') return route.fulfill({ json: { items: [{ id: 'product-low', name_ar: 'عباية كتان', low_stock_threshold: 5, product_variants: [{ id: 'variant-low', size: 'L', color: 'أسود', stock_qty: 2, stock_status: 'limited' }] }], total: 1 } });
        if (stockStatus === 'out_of_stock') return route.fulfill({ json: { items: [{ id: 'product-empty', name_ar: 'ثوب أبيض', low_stock_threshold: 3, product_variants: [{ id: 'variant-empty', size: 'XL', color: 'أبيض', stock_qty: 0, stock_status: 'out_of_stock' }] }], total: 1 } });
      }
      return route.fulfill({ json: { items: [] } });
    });

    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#dashboard');
    await page.locator('#notificationTrigger').click();
    await page.getByText('مخزون منتج أوشك على النفاد', { exact: true }).waitFor();
    const panelText = await page.locator('#notificationList').textContent();
    assert.match(panelText, /عباية كتان/);
    assert.match(panelText, /المقاس L/);
    assert.match(panelText, /متبقي 2 فقط/);
    assert.match(panelText, /ثوب أبيض/);
    assert.match(panelText, /نفد من المخزون/);
    assert.equal(await page.locator('.notification-item').count(), 2);
    assert.deepEqual(errors, []);
    console.log('PASS: admin stock alerts include product and variant names for low and empty inventory.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
