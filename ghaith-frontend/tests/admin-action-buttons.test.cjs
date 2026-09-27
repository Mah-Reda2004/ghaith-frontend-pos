const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const calls = [];
    await page.addInitScript(() => {
      sessionStorage.setItem('ghaith-access-token', 'admin-test');
      sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'admin-1', name: 'مدير', role: 'admin' }));
    });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      if (request.method() !== 'GET') calls.push({ method: request.method(), path, query: Object.fromEntries(url.searchParams), body: request.postDataJSON?.() });
      if (path === '/api/v1/admin/categories' && request.method() === 'GET') return route.fulfill({ json: { items: [{ id: 'cat-1', name: 'عبايات', description: 'قديم', product_count: 0, status: 'active', version: 7 }], total: 1 } });
      if (path === '/api/v1/admin/categories/summary') return route.fulfill({ json: { total: 1, active: 1, products: 0 } });
      if (path === '/api/v1/admin/users' && request.method() === 'GET') return route.fulfill({ json: { items: [{ id: 'user-1', username: 'cashier', phone: '01000000000', role: 'cashier', role_id: 'role-cashier', is_active: true, version: 4 }], total: 1 } });
      if (path === '/api/v1/admin/roles') return route.fulfill({ json: { items: [{ id: 'role-admin', name: 'admin' }, { id: 'role-cashier', name: 'cashier' }, { id: 'role-sales', name: 'sales' }] } });
      if (path === '/api/v1/admin/suppliers' && request.method() === 'GET') return route.fulfill({ json: { items: [{ id: 'supplier-1', name: 'مورد أول', phone: '01011111111', address: 'القاهرة', status: 'active', version: 5 }], total: 1 } });
      if (path === '/api/v1/admin/suppliers/summary') return route.fulfill({ json: { total_suppliers: 1, active_suppliers: 1, total_payables: 0 } });
      if (path === '/api/v1/admin/suppliers/supplier-1/purchase-invoices') return route.fulfill({ json: { items: [], total: 0 } });
      return route.fulfill({ status: request.method() === 'DELETE' ? 204 : 200, body: request.method() === 'DELETE' ? '' : JSON.stringify({}) , contentType: 'application/json' });
    });

    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#categories');
    await page.getByRole('button', { name: 'تعديل عبايات' }).click();
    await page.locator('#categoryDescription').fill('محدث');
    await page.locator('#saveCategoryBtn').click();
    await page.waitForFunction(() => !document.querySelector('#categorySuccessModal')?.hidden);
    assert.deepEqual(calls.find(call => call.method === 'PATCH' && call.path.endsWith('/categories/cat-1')).body, { name: 'عبايات', description: 'محدث', status: 'active', version: 7 });
    await page.locator('#closeCategorySuccess').click();
    await page.getByRole('button', { name: 'حذف عبايات' }).click();
    await page.locator('#confirmCategoryDelete').click();
    await page.waitForFunction(() => !document.querySelector('#categorySuccessModal')?.hidden);
    assert.deepEqual(calls.find(call => call.method === 'DELETE' && call.path.endsWith('/categories/cat-1')).query, { version: '7' });

    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#users');
    await page.locator('[data-action="edit"][data-id="user-1"]').click();
    await page.locator('#userPhone').fill('01022222222');
    await page.locator('#saveUserBtn').click();
    await page.waitForFunction(() => !document.querySelector('#userSuccessModal')?.hidden);
    assert.deepEqual(calls.find(call => call.method === 'PATCH' && call.path.endsWith('/users/user-1')).body, { phone: '01022222222', role_id: 'role-cashier', is_active: true, version: 4 });
    await page.locator('#backToUsers').click();
    await page.locator('[data-action="delete"][data-id="user-1"]').click();
    await page.locator('#confirmUserDeactivate').click();
    await page.waitForFunction(() => document.querySelector('#usersToastStack')?.textContent.includes('تم تعطيل المستخدم'));
    assert.deepEqual(calls.find(call => call.method === 'DELETE' && call.path.endsWith('/users/user-1')).query, { version: '4' });

    await page.goto('http://127.0.0.1:8765/src/pages/admin/admin.html#suppliers');
    await page.locator('[data-supplier-id="supplier-1"] [data-action="edit"]').click();
    await page.locator('#supplierAddress').fill('الجيزة');
    await page.locator('#saveSupplierBtn').click();
    await page.waitForFunction(() => document.querySelector('#suppliersToastStack')?.textContent.includes('تم تحديث المورد'));
    assert.equal(calls.find(call => call.method === 'PATCH' && call.path.endsWith('/suppliers/supplier-1')).body.version, 5);
    await page.locator('[data-supplier-id="supplier-1"] [data-action="deactivate"]').click();
    await page.locator('#confirmSupplierDeactivate').click();
    await page.waitForFunction(() => document.querySelector('#suppliersToastStack')?.textContent.includes('تمت أرشفة المورد'));
    assert.deepEqual(calls.find(call => call.method === 'DELETE' && call.path.endsWith('/suppliers/supplier-1')).query, { version: '5' });
    console.log('PASS: category, user, and supplier edit/delete buttons call version-safe APIs.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
