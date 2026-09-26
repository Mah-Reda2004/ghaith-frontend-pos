const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    let checkoutBody; let quoteBody; let customerBody; let printBody; let checkoutAttempts = 0; let productLoads = 0;
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('ghaith-access-token', 'ui-test-token');
      sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'cashier-test', name: 'كاشير الاختبار', role: 'cashier' }));
    });
    await page.route('http://127.0.0.1:17891/api/print/receipt', async route => {
      printBody = route.request().postDataJSON();
      return route.fulfill({ status: 202, json: { ok: true, queued: true } });
    });
    await page.route('https://test-3f530955.fastapicloud.dev/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/v1/products/search') { productLoads += 1; return route.fulfill({ json: { items: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', product_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name_ar: 'ثوب API', category: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'رجالي' }, sku: 'API-SKU-L', barcode: '62210000', size: 'L', color: 'أبيض', sale_price: 350, stock_qty: 3, version: 7 }, { id: 'abababab-abab-4bab-8bab-abababababab', product_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name_ar: 'ثوب API', category: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'رجالي' }, sku: 'API-SKU-XL', barcode: '62210001', size: 'XL', color: 'أسود', sale_price: 375, stock_qty: 2, version: 4 }], total: 2 } }); }
      if (path === '/api/v1/products/barcode/62210000') return route.fulfill({ json: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', product_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'ثوب API', sku: 'API-SKU-L', barcode: '62210000', size: 'L', color: 'أبيض', sale_price: 350, stock_qty: 3, version: 8 } });
      if (path === '/api/v1/categories') return route.fulfill({ json: { items: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'رجالي' }] } });
      if (path === '/api/v1/customer-types') return route.fulfill({ json: { items: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'عادي', discount_percent: 0 }, { id: '12121212-1212-4121-8121-121212121212', name: 'قريب', discount_percent: 10 }] } });
      if (path === '/api/v1/admin/users') return route.fulfill({ json: { items: [{ id: '11111111-1111-4111-8111-111111111111', name: 'سيلز الاختبار', role: 'sales', is_active: true }], total: 1 } });
      if (path === '/api/v1/shifts/current') return route.fulfill({ json: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'open' } });
      if (path === '/api/v1/customers' && request.method() === 'POST') { customerBody = request.postDataJSON(); return route.fulfill({ status: 201, json: { id: '34343434-3434-4343-8343-343434343434', ...customerBody } }); }
      if (path === '/api/v1/pos/sales/quote') { quoteBody = request.postDataJSON(); return route.fulfill({ json: { subtotal: 700, discount_amount: 70, total_amount: 630 } }); }
      if (path === '/api/v1/sales/checkout') {
        checkoutAttempts += 1;
        checkoutBody = request.postDataJSON();
        if (checkoutAttempts === 1) return route.fulfill({ status: 409, json: { error: { code: 'conflict', message: 'Product stock changed; reload the cart and retry' } } });
        return route.fulfill({ json: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', invoice_number: 'INV-API-1', total_amount: 350 } });
      }
      return route.fulfill({ status: 404, json: { detail: 'not mocked' } });
    });

    await page.goto(`${baseUrl}/src/pages/cashier/cashier.html#pos`);
    await page.getByText('ثوب API').waitFor();
    const card = page.locator('#productGrid .product-card', { hasText: 'ثوب API' });
    assert.equal(await card.locator('.product-card__details span', { hasText: 'أبيض' }).count(), 1);
    assert.equal(await card.locator('.product-card__size-list').count(), 1);
    assert.equal(await page.locator('#productGrid .product-card').count(), 1);
    assert.equal(await card.locator('.product-card__size', { hasText: /^L$/ }).count(), 1);
    assert.equal(await card.locator('.product-card__size', { hasText: /^XL$/ }).count(), 1);
    const cardBox = await card.boundingBox();
    assert.ok(cardBox.height < 230, `product card should stay compact, got ${cardBox.height}px`);
    assert.equal(await card.locator('.product-card__size-list').evaluate(node => getComputedStyle(node).flexWrap), 'nowrap');
    const categoryStyle = await page.locator('#categoryChips').evaluate(node => ({ flexWrap: getComputedStyle(node).flexWrap, overflowX: getComputedStyle(node).overflowX }));
    assert.deepEqual(categoryStyle, { flexWrap: 'nowrap', overflowX: 'auto' });
    await page.getByRole('button', { name: 'رجالي', exact: true }).click();
    assert.equal(await page.locator('#productGrid .product-card').count(), 1);
    await card.click();
    assert.match(await page.locator('#variantPickerGrid').textContent(), /اختر المقاس/);
    assert.match(await page.locator('#variantPickerGrid').textContent(), /اختر اللون/);
    assert.equal(await page.locator('#variantPickerGrid [data-variant-id]').count(), 0);
    await page.locator('#variantPickerGrid [data-variant-size="L"]').click();
    assert.match(await page.locator('#variantPickerGrid [data-variant-id="cccccccc-cccc-4ccc-8ccc-cccccccccccc"]').textContent(), /أبيض/);
    assert.match(await page.locator('#variantPickerGrid [data-variant-id="cccccccc-cccc-4ccc-8ccc-cccccccccccc"]').textContent(), /3\s*قطعة/);
    const roomyScroll = await page.locator('#variantPickerGrid').evaluate(node => ({ overflowX: getComputedStyle(node).overflowX, overflowY: getComputedStyle(node).overflowY, needsY: node.scrollHeight > node.clientHeight }));
    assert.deepEqual(roomyScroll, { overflowX: 'auto', overflowY: 'auto', needsY: false });
    await page.setViewportSize({ width: 480, height: 800 });
    assert.equal(await page.locator('.variant-color-choice').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 2);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#variantPickerGrid [data-variant-id="cccccccc-cccc-4ccc-8ccc-cccccccccccc"]').click();
    assert.match(await page.locator('#cartList').textContent(), /L\s*أبيض/);
    const sizeBadge = page.locator('#cartList .cart-item__size', { hasText: 'L' });
    await sizeBadge.waitFor();
    assert.equal(await sizeBadge.evaluate(node => getComputedStyle(node).fontWeight), '700');
    assert.equal(await sizeBadge.evaluate(node => getComputedStyle(node).borderRadius), '999px');
    await card.click();
    await page.locator('#variantPickerGrid [data-variant-size="L"]').click();
    await page.locator('#variantPickerGrid [data-variant-id="cccccccc-cccc-4ccc-8ccc-cccccccccccc"]').click();
    await page.locator('#checkoutBtn').click();
    await page.locator('#customerTypeSelect').selectOption('12121212-1212-4121-8121-121212121212');
    assert.match(await page.locator('#discountBadge').textContent(), /خصم قريب 10%/);
    assert.doesNotMatch(await page.locator('#discountBadge').textContent(), /12121212/);
    await page.locator('#manualDiscountAmount').fill('70');
    assert.match(await page.locator('#discountBadge').textContent(), /خصم يدوي/);
    await page.locator('#salesSelect').selectOption('11111111-1111-4111-8111-111111111111');
    await page.locator('#confirmPaymentBtn').click();
    await page.getByText('أدخل اسم العميل لتطبيق خصم فئة العميل على الفاتورة.', { exact: true }).waitFor();
    assert.equal(quoteBody, undefined);
    await page.locator('#customerName').fill('عميل قريب');
    await page.locator('#customerPhone').fill('01012345678');
    await page.locator('#customerAddress').fill('القاهرة');
    await page.locator('#confirmPaymentBtn').click();
    await page.getByText(/تم تحديث المخزون والسلة/).waitFor();
    assert.equal(await page.locator('#paymentOverlay').evaluate(node => getComputedStyle(node).display !== 'none'), true);
    await page.locator('.method-btn[data-method="محفظة"]').click();
    await page.locator('#confirmPaymentBtn').click();
    await page.waitForFunction(() => document.querySelector('#cartCount')?.textContent.includes('0'));
    await page.waitForFunction(() => performance.getEntriesByType('resource').length >= 0);

    assert.equal(checkoutBody.items[0].variant_id, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    assert.deepEqual(quoteBody.items, checkoutBody.items);
    assert.equal(checkoutAttempts, 2);
    assert.equal(checkoutBody.items[0].expected_version, 8);
    assert.equal(checkoutBody.items[0].qty, 2);
    assert.equal(checkoutBody.sales_person_id, '11111111-1111-4111-8111-111111111111');
    assert.deepEqual(customerBody, { name: 'عميل قريب', phone: '01012345678', address: 'القاهرة', customer_type_id: '12121212-1212-4121-8121-121212121212' });
    assert.equal(quoteBody.customer_id, '34343434-3434-4343-8343-343434343434');
    assert.equal(quoteBody.discount_amount, undefined);
    assert.equal(quoteBody.discount_type, undefined);
    assert.equal(checkoutBody.customer_id, '34343434-3434-4343-8343-343434343434');
    assert.equal(checkoutBody.discount_amount, '70.00');
    assert.equal(checkoutBody.discount_type, undefined);
    assert.equal(checkoutBody.payment_method, 'transfer');
    assert.equal(checkoutBody.paid_amount, '630.00');
    assert.equal(checkoutBody.shift_id, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    assert.equal(printBody.number, 'INV-API-1');
    assert.equal(printBody.cashier, 'كاشير الاختبار');
    assert.equal(printBody.customer, 'عميل قريب');
    assert.equal(printBody.customer_phone, '01012345678');
    assert.equal(printBody.customer_address, 'القاهرة');
    assert.equal(printBody.payment, 'محفظة');
    assert.equal(printBody.barcode, '1');
    assert.deepEqual(printBody.items.map(({ name, sku, qty, price, size, color }) => ({ name, sku, qty, price, size, color })), [{ name: 'ثوب API', sku: 'API-SKU-L', qty: 2, price: 350, size: 'L', color: 'أبيض' }]);
    assert.deepEqual(printBody.totals.slice(-2).map(({ label, value }) => ({ label, value })), [{ label: 'المدفوع', value: 630 }, { label: 'المتبقي', value: 0 }]);
    assert.deepEqual(pageErrors, []);
    console.log('PASS: POS details, repeated-click quantity, sales users and checkout match the live OpenAPI contract.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
