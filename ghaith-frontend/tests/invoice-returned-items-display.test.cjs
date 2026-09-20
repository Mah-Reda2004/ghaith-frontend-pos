const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let printPayload;
    await page.addInitScript(() => {
      sessionStorage.setItem('ghaith-access-token', 'returned-items-test');
      sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'cashier-1', name: 'كاشير', role: 'cashier' }));
    });
    await page.route('http://127.0.0.1:17891/**', async route => {
      printPayload = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const path = new URL(route.request().url()).pathname;
      const invoice = { id: 'invoice-returned', invoice_number: 'INV-RETURNED', status: 'partially_exchanged', subtotal: 300, total: 300, paid_amount: 300, customer: { name: 'عميل' }, created_at: '2026-09-17T10:00:00Z', items: [
        { id: 'line-returned', product_variant_id: 'variant-old', product_name: 'عباية أصلية', quantity: 1, returnable_quantity: 0, unit_price: 100 },
        { id: 'line-open', product_variant_id: 'variant-open', product_name: 'طرحة', quantity: 2, returnable_quantity: 1, returned_quantity: 1, unit_price: 100 }
      ] };
      if (path === '/api/v1/sales-invoices') return route.fulfill({ json: { items: [invoice], total: 1 } });
      if (path === '/api/v1/sales-invoices/invoice-returned') return route.fulfill({ json: invoice });
      if (path === '/api/v1/sales-invoices/invoice-returned/operations') return route.fulfill({ json: { operations: [{ id: 'exchange-1', type: 'exchange' }] } });
      if (path === '/api/v1/exchanges/exchange-1') return route.fulfill({ json: { id: 'exchange-1', exchange_number: 'EXC-1', return_items: [{ invoice_item_id: 'line-returned', quantity: 1 }], replacement_items: [{ variant_id: 'variant-new', product_name: 'عباية بديلة', sku: 'NEW-1', quantity: 1, unit_price: 120 }] } });
      if (path === '/api/v1/pos/catalog') return route.fulfill({ json: { items: [{ id: 'product-new', name_ar: 'عباية بديلة', variants: [{ id: 'variant-new', sku: 'NEW-1' }] }], total: 1 } });
      if (path === '/api/v1/admin/users' || path === '/api/v1/customers' || path === '/api/v1/customer-types' || path === '/api/v1/categories' || path === '/api/v1/products/search') return route.fulfill({ json: { items: [], total: 0 } });
      return route.fulfill({ json: {} });
    });

    await page.goto('http://127.0.0.1:8765/src/pages/cashier/cashier.html#invoices');
    await page.getByText('#INV-RETURNED', { exact: true }).waitFor();
    await page.locator('[data-action="return-flow"]').click();
    const returnedRow = page.locator('[data-return-id="line-returned"]');
    await returnedRow.getByText('تم الارتجاع', { exact: true }).waitFor();
    assert.equal(await returnedRow.locator('[data-flow-action="toggle-return"]').isDisabled(), true);
    const partialRow = page.locator('[data-return-id="line-open"]');
    await partialRow.getByText(/تم ارتجاع 1 من 2/).waitFor();
    assert.equal(await partialRow.locator('[data-flow-action="toggle-return"]').isEnabled(), true);
    await page.locator('#closeReturnFlowBtn').click();

    await page.locator('[data-action="view"]').click();
    await page.getByText('البديل: عباية بديلة × 1', { exact: true }).waitFor();
    await page.locator('#closeDetailBtn').click();
    await page.locator('[data-action="print"]').click();
    await page.waitForFunction(() => document.getElementById('localPrintToast')?.textContent.includes('بنجاح'));
    assert.ok(printPayload.items.some(item => item.name === 'عباية أصلية' && item.status === 'تم الارتجاع'));
    assert.ok(printPayload.items.some(item => item.name === 'عباية بديلة' && item.status === 'منتج بديل'));
    console.log('PASS: returned items are disabled and replacement names reach details and print payloads.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
