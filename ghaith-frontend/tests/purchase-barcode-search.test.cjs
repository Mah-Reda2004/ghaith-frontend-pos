const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const barcodeRequests = [];
    await page.addInitScript(() => {
      sessionStorage.setItem('ghaith-access-token', 'test');
      sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'admin', name: 'Admin', role: 'admin' }));
    });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/admin/suppliers') return route.fulfill({ json: { items: [] } });
      if (path === '/api/v1/categories') return route.fulfill({ json: { items: [] } });
      if (path === '/api/v1/products/search') {
        const code = new URL(route.request().url()).searchParams.get('barcode');
        barcodeRequests.push(code);
        if (code !== 'PRD100000500') return route.fulfill({ json: { items: [], total: 0 } });
        return route.fulfill({ json: { items: [{ id: 'variant-1', name_ar: 'منتج باركود', barcode: 'PRD100000500', sku: 'SKU-1', purchase_price: 125, version: 1 }], total: 1 } });
      }
      return route.fulfill({ json: { items: [] } });
    });

    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#purchase-invoice');
    await page.locator('#piSearch').fill('١٠٠٠٠٠٥٠٠');
    await page.locator('#piSearch').press('Enter');
    await page.getByText('منتج باركود', { exact: true }).waitFor();
    assert.deepEqual(barcodeRequests, ['100000500', 'PRD100000500']);
    assert.equal(await page.locator('#piSearch').inputValue(), '');
    assert.equal(await page.locator('[data-field="quantity"]').inputValue(), '1');

    await page.locator('#piSearch').fill('100000500');
    await page.locator('#piSearch').press('Enter');
    assert.deepEqual(barcodeRequests, ['100000500', 'PRD100000500'], 'the cached prefixed barcode should match the scanned numeric suffix');
    assert.equal(await page.locator('[data-field="quantity"]').inputValue(), '2');
    await page.locator('#purchaseItemsTitle').click();
    await page.keyboard.type('100000500');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-field="quantity"]').inputValue(), '3', 'scanner input should work without focusing the search field');
    console.log('PASS: purchase product search accepts scanner Enter and Arabic/English barcode digits.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
