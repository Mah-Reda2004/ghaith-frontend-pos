const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

function sameRowHeights(boxes) {
  const rows = new Map();
  boxes.forEach(box => {
    const key = Math.round(box.y);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(Math.round(box.height));
  });
  return [...rows.values()].every(heights => new Set(heights).size === 1);
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      sessionStorage.setItem('ghaith-access-token', 'card-layout-test');
      sessionStorage.setItem('ghaith-current-user', JSON.stringify({ id: 'cashier-test', name: 'كاشير الاختبار', role: 'cashier' }));
    });
    await page.route('https://test-3f530955.fastapicloud.dev/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/v1/products/search') return route.fulfill({ json: { items: [
        { id: 'v-1', product_id: 'p-1', name_ar: 'ثوب سادة', sku: 'S-1', barcode: '1001', sale_price: 300, stock_qty: 5 },
        { id: 'v-2', product_id: 'p-2', name_ar: 'عباية مطرزة بتفاصيل طويلة للاختبار', sku: 'S-2', barcode: '1002', size: 'L', color: 'أسود', sale_price: 450, stock_qty: 4 },
        { id: 'v-3', product_id: 'p-3', name_ar: 'قميص كتان', sku: 'S-3', barcode: '1003', size: 'XL', sale_price: 250, stock_qty: 7 },
        { id: 'v-4', product_id: 'p-4', name_ar: 'سديري', sku: 'S-4', barcode: '1004', color: 'بني', sale_price: 275, stock_qty: 3 }
      ], total: 4 } });
      if (path === '/api/v1/categories' || path === '/api/v1/customer-types' || path === '/api/v1/admin/users' || path === '/api/v1/notifications') return route.fulfill({ json: { items: [] } });
      if (path === '/api/v1/shifts/current') return route.fulfill({ json: { id: 'shift-test', status: 'open' } });
      return route.fulfill({ json: {} });
    });

    await page.goto('http://127.0.0.1:8765/src/pages/cashier/cashier.html#pos');
    await page.getByText('عباية مطرزة بتفاصيل طويلة للاختبار', { exact: true }).waitFor();
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 900, height: 1000 }, { width: 480, height: 900 }]) {
      await page.setViewportSize(viewport);
      const boxes = await page.locator('#productGrid .product-card').evaluateAll(cards => cards.map(card => { const box = card.getBoundingClientRect(); return { x: box.x, y: box.y, height: box.height }; }));
      assert.ok(sameRowHeights(boxes), `cards in the same row must share a height at ${viewport.width}px`);
      await page.screenshot({ path: `print-previews/pos-equal-card-heights-${viewport.width}.png`, fullPage: true });
    }
    console.log('PASS: POS product cards have equal heights per row on desktop, tablet and mobile.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
