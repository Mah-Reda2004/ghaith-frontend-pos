const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const printRequests = [], searchRequests = [], stockAdjustments = [], errors = [];
    let patchedProduct, deletedProductId;
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
      const requestUrl = new URL(route.request().url()), path = requestUrl.pathname;
      if (path === '/api/v1/admin/products' && route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        createdProduct = { id: 'product-2', name_ar: body.name_ar, category_id: body.category_id, supplier_id: body.supplier_id, purchase_price: body.purchase_price, sale_price: body.sale_price, low_stock_threshold: body.low_stock_threshold, commission_rate: body.commission_rate, status: 'active', product_variants: body.variants.map((variant, index) => ({ id: `created-${index}`, sku: `NEW-${index + 1}`, barcode: `70000000${index + 1}`, size: variant.size, color: variant.color, sale_price: body.sale_price, stock_qty: variant.quantity })) };
        return route.fulfill({ json: createdProduct });
      }
      if (path === '/api/v1/products/product-1') return route.fulfill({ json: { id: 'product-1', product_variants: [
        { id: 'black-l', version: 1, size: 'L', color: 'أسود', stock_qty: 8 },
        { id: 'black-xl', version: 1, size: 'XL', color: 'أسود', stock_qty: 5 },
        { id: 'white-l', version: 1, size: 'L', color: 'أبيض', stock_qty: 4 }
      ] } });
      if (path === '/api/v1/admin/products/product-1' && route.request().method() === 'PATCH') { patchedProduct = route.request().postDataJSON(); return route.fulfill({ json: { id: 'product-1', ...patchedProduct } }); }
      if (path === '/api/v1/admin/products/product-1/stock-adjustments' && route.request().method() === 'POST') { stockAdjustments.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }); }
      if (path.startsWith('/api/v1/admin/products/') && route.request().method() === 'DELETE') { deletedProductId = path.split('/').pop(); return route.fulfill({ status: 204, body: '' }); }
      if (path === '/api/v1/products/search' && requestUrl.searchParams.get('barcode')) {
        const search = requestUrl.searchParams.get('barcode'); searchRequests.push(search);
        return route.fulfill({ json: { items: search === 'PRD100000500' ? [{ id: 'product-prefix', name_ar: 'منتج بباركود مسبوق', category_id: 'cat-1', supplier_id: 'supplier-1', sale_price: 100, status: 'active', product_variants: [{ id: 'prefix-variant', sku: 'PREFIX-1', barcode: 'PRD100000500', size: 'افتراضي', color: 'افتراضي', stock_qty: 1 }] }] : [], total: search === 'PRD100000500' ? 1 : 0 } });
      }
      if (path === '/api/v1/admin/products') return route.fulfill({ json: { items: [{ id: 'product-1', name_ar: 'عباية اختبار', category: { id: 'cat-1', name: 'عبايات' }, supplier: { id: 'supplier-1', name: 'مورد' }, sale_price: 500, status: 'active', product_variants: [
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
    await page.locator('#productsSearch').fill('100000500');
    await page.locator('#productsSearch').press('Enter');
    await page.getByText('منتج بباركود مسبوق', { exact: true }).waitFor();
    assert.deepEqual(searchRequests.slice(-2), ['100000500', 'PRD100000500']);
    await page.locator('#productsSearch').fill('');
    await page.getByText('عباية اختبار', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'تعديل عباية اختبار' }).click();
    assert.equal(await page.locator('#productCategory').inputValue(), 'cat-1');
    assert.equal(await page.locator('#productSupplier').inputValue(), 'supplier-1');
    let editRows = page.locator('.product-variant-row');
    await editRows.first().locator('.product-variant-quantity').fill('9');
    await page.locator('#productQuantity').fill('18');
    await page.locator('#saveProductBtn').click();
    await page.getByText('تم تحديث المنتج بنجاح', { exact: true }).waitFor();
    assert.equal('variants' in patchedProduct, false);
    assert.deepEqual(stockAdjustments, [{ variant_id: 'black-l', qty_delta: 1, expected_version: 1, reason: 'تعديل يدوي من لوحة الإدارة' }]);
    await page.locator('#backToProducts').click();
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
    assert.equal(await page.locator('#productCostCode').count(), 0);
    await page.locator('#productSalesPercentage').fill('10');
    assert.equal(await page.locator('#productNetProfitPercentage').inputValue(), '240.00');
    await page.locator('#productMinimum').fill('7');
    await page.locator('#productQuantity').fill('5');
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
    await page.locator('#productQuantity').fill('4');
    await page.locator('[data-variants-total-error]:visible').waitFor();
    assert.match(await page.locator('[data-variants-total-error]').textContent(), /\(5\).*\(4\)/);
    await page.locator('#saveProductBtn').click();
    await page.waitForTimeout(100);
    assert.equal(createdProduct, null);
    assert.equal(await page.locator('#productModal').isVisible(), true);
    await page.locator('#productQuantity').fill('5');
    await page.locator('#saveProductBtn').click();
    await page.getByText('تمت إضافة المنتج بنجاح', { exact: true }).waitFor();
    assert.equal(createdProduct.purchase_price, 300);
    assert.deepEqual(createdProduct.product_variants.map(variant => variant.barcode), ['700000001', '700000002']);
    assert.equal(createdProduct.low_stock_threshold, 7);
    assert.equal(createdProduct.commission_rate, 10);
    assert.equal(await page.locator('#productSuccessModal').isVisible(), true);
    await page.locator('#printProductBarcode').click();
    await page.waitForFunction(() => document.getElementById('localPrintToast')?.textContent.includes('5'));
    assert.deepEqual(printRequests.slice(1).map(item => ({ size: item.size, color: item.color, copies: item.copies })), [{ size: 'L', color: 'أسود', copies: 2 }, { size: 'L', color: 'أبيض', copies: 3 }]);
    assert.deepEqual(printRequests.slice(1).map(item => item.barcode), ['700000001', '700000002']);
    await page.locator('#backToProducts').click();
    await page.getByRole('button', { name: 'حذف منتج جديد متعدد' }).click();
    await page.locator('#productDeleteModal').waitFor({ state: 'visible' });
    assert.match(await page.locator('#productDeleteModal').textContent(), /هل تريد حذف المنتج/);
    await page.locator('#confirmProductDelete').click();
    await page.getByText('تم حذف المنتج بنجاح', { exact: true }).waitFor();
    assert.equal(deletedProductId, 'product-2');
    assert.equal(await page.locator('#productsTableBody').getByText('منتج جديد متعدد', { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: admin barcode actions support selective counts and success-screen stock quantities.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
