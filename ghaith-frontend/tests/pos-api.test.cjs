const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    let checkoutBody;
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('ghaith-access-token', 'ui-test-token');
      sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', name: 'سيلز الاختبار', role: 'sales' }));
    });
    await page.route('https://test-3f530955.fastapicloud.dev/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/v1/products') return route.fulfill({ json: { items: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name_ar: 'ثوب API', category: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'رجالي' }, product_variants: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', sku: 'API-SKU', barcode: '62210000', size: 'L', color: 'أبيض', sale_price: 350, stock_qty: 3, version: 7 }] }] } });
      if (path === '/api/v1/products/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') return route.fulfill({ json: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name_ar: 'ثوب API', category: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'رجالي' }, product_variants: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', sku: 'API-SKU', barcode: '62210000', size: 'L', color: 'أبيض', sale_price: 350, stock_qty: 3, version: 7 }] } });
      if (path === '/api/v1/categories') return route.fulfill({ json: { items: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'رجالي' }] } });
      if (path === '/api/v1/customer-types') return route.fulfill({ json: { items: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'عادي', discount_percent: 0 }] } });
      if (path === '/api/v1/pos/sales-users') return route.fulfill({ json: { items: [{ id: '11111111-1111-4111-8111-111111111111', name: 'سيلز الاختبار', role: 'sales', is_active: true }] } });
      if (path === '/api/v1/shifts/current') return route.fulfill({ json: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'open' } });
      if (path === '/api/v1/admin/users') return route.fulfill({ status: 403, json: { detail: 'forbidden' } });
      if (path === '/api/v1/sales/checkout') {
        checkoutBody = request.postDataJSON();
        return route.fulfill({ json: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', invoice_number: 'INV-API-1', total_amount: 350 } });
      }
      return route.fulfill({ status: 404, json: { detail: 'not mocked' } });
    });

    await page.goto('http://127.0.0.1:8765/src/pages/cashier/cashier.html#pos');
    await page.getByText('ثوب API').waitFor();
    await page.getByText('ثوب API').click();
    await page.locator('#checkoutBtn').click();
    await page.locator('#salesSelect').selectOption('11111111-1111-4111-8111-111111111111');
    await page.locator('#confirmPaymentBtn').click();
    await page.waitForFunction(() => document.querySelector('#cartCount')?.textContent.includes('0'));

    assert.equal(checkoutBody.items[0].variant_id, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    assert.equal(checkoutBody.items[0].expected_version, 7);
    assert.equal(checkoutBody.items[0].qty, 1);
    assert.equal(checkoutBody.shift_id, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    assert.equal(checkoutBody.payment_method, 'cash');
    assert.equal(checkoutBody.paid_amount, 350);
    assert.match(checkoutBody.idempotency_key, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(pageErrors, []);
    console.log('PASS: POS catalog, stock metadata, current shift and checkout payload are connected to the API.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
