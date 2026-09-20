const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const printRequests = [], errors = [];
    let createdProduct = null;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('ghaith-access-token', 'products-test');
      sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'admin-1', name: 'مدير', role: 'admin' }));
    });
    await page.route('http://127.0.0.1:17891/api/print/barcode', route => {
      printRequests.push(route.request().postDataJSON());
      return route.fulfill({ status: 202, json: { ok: true, queued: true } });
    });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/admin/products' && route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        createdProduct = { id: 'product-2', name_ar: body.name_ar, category_id: body.category_id, supplier_id: body.supplier_id, sale_price: body.sale_price, status: 'active', product_variants: body.variants.map((variant, index) => ({ id: `created-${index}`, sku: `NEW-${index + 1}`, barcode: `70000000${index + 1}`, size: variant.size, color: variant.color, sale_price: body.sale_price, stock_qty: variant.quantity })) };
        return route.fulfill({ json: createdProduct });
      }
      if (path === '/api/v1/admin/products') return route.fulfill({ json: { items: [{ id: 'product-1', name_ar: 'عباية اختبار', category_id: 'cat-1', supplier_id: 'supplier-1', sale_price: 500, status: 'active', product_variants: [
        { id: 'black-l', sku: 'BLACK-L', barcode: '622100001', size: 'L', color: 'أسود', sale_price: 500, stock_qty: 8 },
        { id: 'black-xl', sku: 'BLACK-XL', barcode: '622100002', size: 'XL', color: 'أسود', sale_price: 520, stock_qty: 5 },
        { id: 'white-l', sku: 'WHITE-L', barcode: '622100003', size: 'L', color: 'أبيض', sale_price: 500, stock_qty: 4 }
      ] }, ...(createdProduct ? [createdProduct] : [])], total: createdProduct ? 2 : 1 } });
      if (path === '/api/v1/admin/products/summary') return route.fulfill({ json: { total_product_count: 1 } });
      if (path === '/api/v1/categories') return route.fulfill({ json: { items: [{ id: 'cat-1', name: 'عبايات' }] } });
      if (path === '/api/v1/admin/suppliers') return route.fulfill({ json: { items: [{ id: 'supplier-1', name: 'مورد', status: 'active' }] } });
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#products');
    await page.getByText('عباية اختبار', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'طباعة باركود عباية اختبار' }).click();
    const row = page.getByRole('checkbox', { name: 'اختيار L أسود', exact: true }).locator('..');
    await row.locator('[data-barcode-select]').check();
    await row.locator('[data-barcode-copies]').fill('2');
    await page.locator('#confirmProductBarcode').click();
    await page.waitForFunction(() => document.getElementById('productBarcodeModal')?.hidden === true);
    assert.equal(printRequests.length, 1);
    assert.deepEqual({ barcode: printRequests[0].barcode, size: printRequests[0].size, color: printRequests[0].color, copies: printRequests[0].copies }, { barcode: '622100001', size: 'L', color: 'أسود', copies: 2 });

    await page.locator('#addProductBtn').click();
    await page.locator('#productNameAr').fill('منتج جديد متعدد');
    await page.locator('#productCategory').selectOption('cat-1');
    await page.locator('#productSupplier').selectOption('supplier-1');
    await page.locator('#productSalePrice').fill('600');
    await page.locator('#productCostPrice').fill('300');
    await page.locator('[data-variants-mode]').selectOption('multiple');
    let variantRows = page.locator('.product-variant-row');
    await variantRows.nth(0).locator('.product-variant-size').fill('L');
    await variantRows.nth(0).locator('.product-variant-color').fill('أسود');
    await variantRows.nth(0).locator('.product-variant-quantity').fill('2');
    await page.locator('[data-add-variant]').click();
    variantRows = page.locator('.product-variant-row');
    await variantRows.nth(1).locator('.product-variant-size').fill('L');
    await variantRows.nth(1).locator('.product-variant-color').fill('أبيض');
    await variantRows.nth(1).locator('.product-variant-quantity').fill('3');
    await page.locator('#saveProductBtn').click();
    await page.getByText('تمت إضافة المنتج بنجاح', { exact: true }).waitFor();
    assert.equal(await page.locator('#productSuccessModal').isVisible(), true);
    await page.locator('#printProductBarcode').click();
    await page.waitForFunction(() => document.getElementById('localPrintToast')?.textContent.includes('5'));
    assert.deepEqual(printRequests.slice(1).map(item => ({ size: item.size, color: item.color, copies: item.copies })), [{ size: 'L', color: 'أسود', copies: 2 }, { size: 'L', color: 'أبيض', copies: 3 }]);
    assert.deepEqual(errors, []);
    console.log('PASS: admin barcode actions support selective counts and success-screen stock quantities.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
