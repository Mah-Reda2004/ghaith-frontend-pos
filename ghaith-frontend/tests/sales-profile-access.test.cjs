const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8765';
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const calls = [];
    await page.addInitScript(() => {
      sessionStorage.setItem('ghaith-access-token', 'sales-access-test');
      sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'sales-1', name: 'موظف السيلز', role: 'sales' }));
    });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const url = new URL(route.request().url());
      calls.push(url.pathname);
      if (url.pathname === '/api/v1/commissions/me/dashboard') return route.fulfill({ json: {
        today: { total_sales: 1371, average_basket: 685.5, completed_invoices: 2, estimated_commission: 48.56 },
        performance: {
          today: { commission: 48.56, total_sales: 1371, invoice_count: 2, commission_percent: 3.54 },
          this_week: { commission: 48.56, total_sales: 1371, invoice_count: 2, commission_percent: 3.54 },
          this_month: { commission: 48.56, total_sales: 1371, invoice_count: 2, commission_percent: 3.54 }
        },
        recent_operations: [
          { products: [{ name: 'رتلا', quantity: 1 }, { name: 'جلبيه', quantity: 1 }], commission: 36, created_at: '2026-09-16T15:55:44.659775+00:00', invoice_id: 'invoice-534', total_sales: 720, invoice_number: 'INV100000534' },
          { products: [{ name: 'جلبيه', quantity: 1 }, { name: 'عطر السعودي الراقي', quantity: 1 }], commission: 12.56, created_at: '2026-09-16T15:54:17.472264+00:00', invoice_id: 'invoice-533', total_sales: 651, invoice_number: 'INV100000533' }
        ]
      } });
      if (url.pathname === '/api/v1/commissions/me') return route.fulfill({ json: {
        total_commission: 48.56,
        items: [
          { commission_amount: 13.5, invoices: { invoice_number: 'INV100000534', created_at: '2026-09-16T15:55:44.659775+00:00' } },
          { commission_amount: 22.5, invoices: { invoice_number: 'INV100000534', created_at: '2026-09-16T15:55:44.659775+00:00' } }
        ]
      } });
      return route.fulfill({ json: {} });
    });

    await page.goto(`${baseUrl}/src/pages/cashier/cashier.html#pos`);
    await page.locator('[data-profile-name]').waitFor();
    await page.locator('#profileShowAll').waitFor({ state: 'detached' });

    assert.equal(page.url().endsWith('/src/pages/cashier/cashier.html#profile'), true);
    assert.equal(await page.locator('#cashierNav').isHidden(), true);
    assert.equal(await page.locator('#notificationCenter').isHidden(), true);
    assert.equal(await page.locator('#profileShowAll').count(), 0);
    assert.equal((await page.locator('.pos-topbar__brand span').textContent()).trim(), 'البروفايل');
    assert.equal(calls.some(path => path.includes('/products') || path.includes('/shifts')), false);
    assert.equal(await page.locator('[data-period-card="today"] .profile-stat__value').textContent(), 'EGP 48.56');
    assert.equal(await page.locator('[data-period-card="week"] .profile-stat__value').textContent(), 'EGP 48.56');
    assert.equal(await page.locator('[data-period-card="month"] .profile-stat__value').textContent(), 'EGP 48.56');
    assert.match(await page.locator('[data-period-card="week"] [data-period-details]').textContent(), /EGP 1371(?:\.00)?.*٢ فاتورة/);
    assert.equal(await page.locator('.profile-transactions tbody tr').count(), 2);
    assert.match(await page.locator('.profile-transactions tbody tr').first().textContent(), /INV100000534.*رتلا × 1، جلبيه × 1.*EGP 720(?:\.00)?.*EGP 36(?:\.00)?/s);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 900, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `profile overflows at ${viewport.width}px`);
    }

    await page.evaluate(() => { location.hash = 'invoices'; });
    await page.waitForFunction(() => location.hash === '#profile');
    await page.locator('.profile-body').waitFor();
    assert.equal(await page.locator('.profile-body').count(), 1);
    assert.equal(await page.locator('.inv-body').count(), 0);

    console.log('PASS: sales accounts are restricted to the profile route and profile-only shell.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
