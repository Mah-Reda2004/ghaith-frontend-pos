const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const errors = []; let productBody; let categoryBody; let draftBody; let draftKey;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { sessionStorage.setItem('ghaith-access-token', 'test'); sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'admin', name: 'Admin', role: 'admin' })); });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path === '/api/v1/admin/suppliers') return route.fulfill({ json: { items: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'مورد الاختبار' }] } });
      if (path === '/api/v1/categories') return route.fulfill({ json: { items: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'رجالي' }] } });
      if (path === '/api/v1/admin/categories' && request.method() === 'POST') { categoryBody = request.postDataJSON(); return route.fulfill({ json: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: categoryBody.name, status: categoryBody.status } }); }
      if (path === '/api/v1/admin/products' && request.method() === 'GET') return route.fulfill({ json: { items: [] } });
      if (path === '/api/v1/admin/products' && request.method() === 'POST') { productBody = request.postDataJSON(); return route.fulfill({ json: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name_ar: 'منتج جديد', purchase_price: 50, product_variants: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', size: 'L', color: 'أبيض', version: 1 }] } }); }
      if (path === '/api/v1/admin/purchase-invoices/drafts' && request.method() === 'POST') { draftBody = request.postDataJSON(); draftKey = request.headers()['idempotency-key']; return route.fulfill({ status: 201, json: { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', invoice_number: 'PUR-1001', version: 1 } }); }
      return route.fulfill({ json: {} });
    });
    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#purchase-invoice');
    await page.locator('#piAddProduct').click();
    assert.equal(await page.locator('#piProductImageUrl').count(), 0);
    await page.locator('#piQuickProductForm [name="name_ar"]').fill('منتج جديد');
    await page.locator('[data-new-category]').click();
    await page.locator('#piNewCategoryName').fill('فئة جديدة');
    await page.locator('#piNewCategoryDescription').fill('وصف الفئة');
    await page.locator('[data-save-category]').click();
    await page.locator('#piQuickProductForm [name="category_id"]').selectOption('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    await page.locator('#piQuickProductForm [name="purchase_price"]').fill('50');
    await page.locator('#piQuickProductForm [name="sale_price"]').fill('80');
    await page.locator('#piQuickProductForm [name="purchase_quantity"]').fill('4');
    await page.locator('#piQuickProductForm [name="size"]').fill('L');
    await page.locator('#piQuickProductForm [name="color"]').fill('أبيض');
    await page.locator('#piQuickProductForm button[type="submit"]').click();
    await page.getByText('منتج جديد', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, '#purchase-invoice');
    assert.equal(productBody.initial_stock, 0);
    assert.equal(productBody.category_id, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    assert.deepEqual(categoryBody, { name: 'فئة جديدة', description: 'وصف الفئة', status: 'active' });
    assert.equal(await page.locator('[data-field="quantity"]').inputValue(), '4');
    await page.locator('#piSupplier').selectOption('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    await page.locator('#piReference').fill('PAY-202');
    await page.locator('#piSaveDraft').click();
    await page.getByText('تم حفظ المسودة على الخادم.').waitFor();
    assert.equal(draftBody.supplier_invoice_number, null);
    assert.equal(draftBody.payment_reference, 'PAY-202');
    assert.equal(await page.locator('#piInvoiceNumber').textContent(), 'PUR-1001');
    assert.equal(draftBody.items[0].variant_id, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    assert.match(draftKey, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(errors, []);
    console.log('PASS: new product opens in an overlay, is created through API, and is added to the purchase invoice.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
