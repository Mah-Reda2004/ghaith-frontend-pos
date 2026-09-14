const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], paymentBodies = [];
    let paid = 2000, remaining = 8000, version = 3;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      sessionStorage.setItem('ghaith-access-token', 'supplier-payment-test');
      sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'admin-1', name: 'مدير الاختبار', role: 'admin' }));
    });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      const supplier = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'مورد الأمانة', phone: '01012345678', address: 'القاهرة', status: 'active', total_purchases: 10000, total_paid: paid, balance_due: remaining, version: 1 };
      const due = new Date(); due.setDate(due.getDate() + 3);
      const invoice = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', invoice_number: 'PUR-2026-100', supplier_id: supplier.id, supplier_name: supplier.name, supplier_phone: supplier.phone, invoice_date: new Date().toISOString().slice(0, 10), due_date: due.toISOString().slice(0, 10), payment_method: 'cash', status: remaining ? 'partial' : 'paid', total_amount: 10000, paid_amount: paid, remaining_amount: remaining, discount_amount: 100, shipping_amount: 50, notes: 'توريد أسبوعي', version, items: [{ quantity: 2, unit_cost: 5000, discount_amount: 100, line_total: 9900, product_name: null, category_name: 'عبايات', size: null, color: null, variant_id: '564fb20f-23cd-442c-aefb-6c0a9f92b2c1' }] };
      if (path === '/api/v1/admin/suppliers/summary') return route.fulfill({ json: { total_suppliers: 1, active_suppliers: 1, total_payables: remaining } });
      if (path === '/api/v1/admin/suppliers') return route.fulfill({ json: { items: [supplier], total: 1 } });
      if (path === `/api/v1/admin/suppliers/${supplier.id}`) return route.fulfill({ status: 500, json: { detail: "detail unavailable" } });
      if (path === `/api/v1/admin/suppliers/${supplier.id}/purchase-invoices`) return route.fulfill({ json: { items: [invoice], total: 1 } });
      if (path === `/api/v1/admin/purchase-invoices/${invoice.id}`) return route.fulfill({ json: invoice });
      if (path === `/api/v1/admin/purchase-invoices/${invoice.id}/payments` && request.method() === 'GET') return route.fulfill({ status: 500, json: { detail: 'payments unavailable' } });
      if (path === `/api/v1/admin/purchase-invoices/${invoice.id}/payments` && request.method() === 'POST') { paymentBodies.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] }); paid += 3000; remaining -= 3000; version += 1; return route.fulfill({ status: 201, json: { amount: 3000, invoice: { ...invoice, paid_amount: paid, remaining_amount: remaining, version } } }); }
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#suppliers');
    const invoicesButton = page.getByRole('button', { name: 'فتح فواتير المورد' });
    await invoicesButton.waitFor();
    assert.equal((await page.locator('.suppliers-table thead th').last().textContent()).trim(), 'الإجراءات');
    assert.equal(await invoicesButton.isVisible(), true);
    await invoicesButton.click();
    assert.equal(await page.locator('#supplierDetailView').isVisible(), true);
    assert.equal(await page.locator('#supplierDetailView').evaluate(node => getComputedStyle(node).position), 'fixed');
    const row = page.locator('[data-invoice-id]');
    await row.getByText('PUR-2026-100').waitFor();
    assert.match(await row.textContent(), /01012345678/);
    assert.match(await row.textContent(), /8,000\.00/);
    assert.match(await row.textContent(), /يستحق خلال 5 أيام|متأخرة/);
    await row.click();
    await page.getByText('منتج بدون اسم من الخادم', { exact: true }).waitFor();
    await page.getByText('عبايات', { exact: true }).waitFor();
    await page.getByText('564fb20f-23cd-442c-aefb-6c0a9f92b2c1', { exact: true }).waitFor();
    await page.getByText('سجل الدفعات غير متاح حاليًا', { exact: true }).waitFor();
    assert.equal(await page.locator('#purchaseDetailSummary + .purchase-payments').count(), 1);
    await page.locator('#purchasePaymentAmount').fill('3000');
    await page.locator('#purchasePaymentMethodDetail').selectOption('transfer');
    await page.locator('#purchasePaymentReference').fill('TR-3000');
    await page.locator('#savePurchasePayment').click();
    await page.getByText('تم تسجيل الدفعة وظهرت في سجل الفاتورة.').waitFor();
    assert.match(await page.locator('#purchasePaymentsBody').textContent(), /3,000\.00/);
    assert.match(await page.locator('#purchasePaymentsBody').textContent(), /تحويل/);
    assert.match(await page.locator('#purchasePaymentsBody').textContent(), /TR-3000/);
    assert.deepEqual(paymentBodies[0].body, { expected_version: 3, amount: 3000, method: 'transfer', reference: 'TR-3000', paid_at: paymentBodies[0].body.paid_at });
    assert.match(paymentBodies[0].body.paid_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(paymentBodies[0].key, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(errors, []);
    console.log('PASS: supplier invoice details, due state, line items, payment history, and invoice-specific payment work.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
