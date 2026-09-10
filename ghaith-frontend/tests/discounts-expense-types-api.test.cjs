const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let patchBody, postBody;
    await page.addInitScript(() => { sessionStorage.setItem('ghaith-access-token', 'admin-test'); sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'admin-1', name: 'مدير', role: 'admin' })); });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === '/api/v1/customer-types') return route.fulfill({ json: { items: [{ id: 'type-1', name: 'عادي', discount_percent: 0 }] } });
      if (url.pathname === '/api/v1/expense-types') return route.fulfill({ json: { items: [{ id: 'expense-1', name: 'صيانة' }] } });
      if (url.pathname === '/api/v1/admin/customer-types/type-1' && request.method() === 'PATCH') { patchBody = request.postDataJSON(); return route.fulfill({ json: { id: 'type-1', ...patchBody } }); }
      if (url.pathname === '/api/v1/admin/expense-types' && request.method() === 'POST') { postBody = request.postDataJSON(); return route.fulfill({ status: 201, json: { id: 'expense-2', ...postBody } }); }
      return route.fulfill({ json: { items: [] } });
    });
    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#discounts');
    await page.locator('tr[data-id="type-1"] .discount-edit').waitFor();
    await page.locator('tr[data-id="type-1"] .discount-edit').click();
    await page.locator('#discountName').fill('عميل مميز');
    await page.locator('#discountValue').fill('15');
    await page.locator('#saveDiscount').click();
    await page.waitForFunction(() => !document.querySelector('#discountSuccess')?.hidden);
    assert.deepEqual(patchBody, { name: 'عميل مميز', discount_percent: 15 });
    await page.locator('#expenseTypeName').fill('شحن');
    await page.locator('#saveExpenseType').click();
    await page.waitForFunction(() => document.querySelector('#expenseTypeName')?.value === '');
    assert.deepEqual(postBody, { name: 'شحن' });
    console.log('PASS: customer type updates and expense type creation use the documented payloads.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
