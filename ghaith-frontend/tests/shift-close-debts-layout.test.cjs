const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; let closeBody, closeKey;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { sessionStorage.setItem('ghaith-access-token', 'shift-test'); sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'cashier-1', name: 'كاشير', role: 'cashier' })); });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path === '/api/v1/shifts/current') return route.fulfill({ json: { id: 'shift-1', version: 4, opened_at: '2026-09-13T08:00:00Z' } });
      if (path === '/api/v1/shifts/current/summary') return route.fulfill({ json: { data: { shift_summary: { sales: { total: 7000, count: 18 }, payments: { cash: { amount: 4000, count: 10 }, wallet: { amount: 1800, count: 5 }, instapay: { amount: 1200, count: 3 } }, returns: { total: 200 }, expenses: { total: 650, count: 3 }, drawer: { expected_cash: 4850 } } } } });
      if (path === '/api/v1/shifts/shift-1/summary') return route.fulfill({ json: { data: { summary: { total_sales: 7000, invoice_count: 18, cash_sales: 4000, card_sales: 3000, returns_total: 200, expenses_total: 650, expense_count: 3, expected_cash: 4850, payment_distribution: [{ method: 'cash', amount: 4000, count: 10 }, { method: 'card', amount: 3000, count: 8 }] } } } });
      if (path === '/api/v1/shifts/close') { closeBody = request.postDataJSON(); closeKey = request.headers()['idempotency-key']; return route.fulfill({ json: { id: 'shift-1', status: 'closed' } }); }
      if (path === '/api/v1/debts') return route.fulfill({ json: { items: [{ id: 'debt-1', invoice_id: 'invoice-1', invoice_number: 'INV-1', customer_name: 'عميل آجل', total_amount: 500, paid_amount: 100, remaining_amount: 400, created_at: new Date().toISOString() }], total: 1 } });
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto('http://127.0.0.1:8765/src/pages/cashier/cashier.html#shift-close');
    await page.getByText(/7,?000(?:\.00)?/, { exact: false }).waitFor();
    const metrics = await page.locator('.sc-overview .sc-metric strong').allTextContents();
    assert.match(metrics[2], /4,?000(?:\.00)?/);
    assert.match(metrics[3], /3,?000(?:\.00)?/);
    await page.locator('.sc-pay-table').getByText('رصيد العميل', { exact: true }).waitFor();
    await page.locator('.sc-pay-table').getByText('إنستا باي', { exact: true }).waitFor();
    assert.equal(await page.locator('#countedCash').inputValue(), '4850.00');
    await page.goto('http://127.0.0.1:8765/src/pages/cashier/cashier.html#debts');
    await page.locator('#debtsList').waitFor();
    assert.equal(await page.locator('#debtsList').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 3);
    await page.goto('http://127.0.0.1:8765/src/pages/cashier/cashier.html#shift-close');
    await page.getByText(/7,?000(?:\.00)?/, { exact: false }).waitFor();
    await page.locator('#closeShiftBtn').click();
    await page.locator('#confirmCloseBtn').click();
    await page.waitForFunction(() => document.querySelector('#successOverlay')?.style.display === 'flex');
    assert.equal(closeBody.counted_cash, 4850);
    assert.match(closeBody.idempotency_key, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(errors, []);
    console.log('PASS: shift-close API values and close payload work; debts use three desktop columns.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
