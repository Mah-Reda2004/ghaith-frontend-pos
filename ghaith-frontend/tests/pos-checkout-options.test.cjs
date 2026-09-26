const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

const ids = {
  product: '11111111-1111-4111-8111-111111111111',
  variant: '22222222-2222-4222-8222-222222222222',
  sales: '33333333-3333-4333-8333-333333333333',
  shift: '44444444-4444-4444-8444-444444444444',
  regularType: '55555555-5555-4555-8555-555555555555',
  vipType: '66666666-6666-4666-8666-666666666666',
  customer: '77777777-7777-4777-8777-777777777777'
};

async function runCheckout(browser, option) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let checkoutBody; let customerBody;
  await page.addInitScript(() => {
    sessionStorage.setItem('ghaith-access-token', 'checkout-options-test');
    sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'cashier-test', name: 'كاشير الاختبار', role: 'cashier' }));
  });
  await page.route('http://127.0.0.1:17891/api/print/receipt', route => route.fulfill({ status: 202, json: { ok: true } }));
  await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path === '/api/v1/products/search') return route.fulfill({ json: { items: [{ id: ids.variant, product_id: ids.product, name_ar: 'منتج اختبار البيع', sku: 'SALE-1', barcode: '6221000099', sale_price: 100, stock_qty: 5, version: 2 }], total: 1 } });
    if (path === `/api/v1/products/barcode/6221000099`) return route.fulfill({ json: { id: ids.variant, product_id: ids.product, name_ar: 'منتج اختبار البيع', sku: 'SALE-1', barcode: '6221000099', sale_price: 100, stock_qty: 5, version: 2 } });
    if (path === '/api/v1/categories' || path === '/api/v1/notifications') return route.fulfill({ json: { items: [] } });
    if (path === '/api/v1/customer-types') return route.fulfill({ json: { items: [{ id: ids.vipType, name: 'خاص', code: 'vip', discount_percent: 10 }, { id: ids.regularType, name: 'عادي', code: 'walk_in', discount_percent: 0 }] } });
    if (path === '/api/v1/admin/users') return route.fulfill({ json: { items: [{ id: ids.sales, name: 'سيلز الاختبار', role: 'sales', is_active: true }], total: 1 } });
    if (path === '/api/v1/shifts/current') return route.fulfill({ json: { id: ids.shift, status: 'open' } });
    if (path === '/api/v1/customers') { customerBody = request.postDataJSON(); return route.fulfill({ status: 201, json: { id: ids.customer } }); }
    if (path === '/api/v1/pos/sales/quote') return route.fulfill({ json: { subtotal: 100, discount_amount: option.useCustomer ? 10 : 0, total_amount: option.useCustomer ? 90 : 100 } });
    if (path === '/api/v1/sales/checkout') { checkoutBody = request.postDataJSON(); return route.fulfill({ json: { id: crypto.randomUUID(), invoice_number: 'INV-OPTION', total_amount: option.useCustomer || option.manualDiscount ? 90 : 100 } }); }
    return route.fulfill({ json: {} });
  });

  await page.goto('http://127.0.0.1:8765/src/pages/cashier/cashier.html#pos');
  await page.getByText('منتج اختبار البيع', { exact: true }).click();
  await page.locator('#checkoutBtn').click();
  await page.locator('#salesSelect').selectOption(ids.sales);
  if (option.useCustomer) {
    await page.locator('#customerTypeSelect').selectOption(ids.vipType);
    await page.locator('#customerName').fill('عميل الاختبار');
  }
  if (option.manualDiscount) await page.locator('#manualDiscountAmount').fill(String(option.manualDiscount));
  await page.locator('.method-btn', { hasText: option.label }).click();
  if (option.apiValue === 'deferred') await page.locator('#paidAmount').fill('25');
  await page.locator('#confirmPaymentBtn').click();
  await page.waitForFunction(() => document.querySelector('#cartCount')?.textContent.includes('0'));
  await page.close();
  return { checkoutBody, customerBody };
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const options = [
      { label: 'نقدي', apiValue: 'cash', paid: '90.00', useCustomer: true },
      { label: 'محفظة', apiValue: 'transfer', paid: '100.00' },
      { label: 'انستا باي', apiValue: 'instapay', paid: '100.00' },
      { label: 'انستا باي', apiValue: 'instapay', paid: '90.00', manualDiscount: 10 },
      { label: 'آجل', apiValue: 'deferred', paid: '25.00' }
    ];
    for (const option of options) {
      const { checkoutBody, customerBody } = await runCheckout(browser, option);
      assert.equal(checkoutBody.payment_method, option.apiValue);
      assert.equal(checkoutBody.paid_amount, option.paid);
      assert.equal(checkoutBody.sales_person_id, ids.sales);
      assert.equal(checkoutBody.shift_id, ids.shift);
      assert.match(checkoutBody.idempotency_key, /^[0-9a-f-]{36}$/i);
      assert.deepEqual(checkoutBody.items, [{ variant_id: ids.variant, qty: 1, expected_version: 2 }]);
      if (option.useCustomer) {
        assert.equal(checkoutBody.customer_id, ids.customer);
        assert.equal(checkoutBody.discount_amount, undefined);
        assert.deepEqual(customerBody, { name: 'عميل الاختبار', phone: null, address: null, customer_type_id: ids.vipType });
      }
      if (option.manualDiscount) assert.equal(checkoutBody.discount_amount, '10.00');
    }
    console.log('PASS: every POS payment choice and related form selection matches the live CheckoutRequest schema.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
