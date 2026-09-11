const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/sw/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const requests = [];
    await page.route('http://127.0.0.1:17891/api/print/barcode', async route => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true, queued: true }) });
    });
    await page.setContent('<!doctype html><html lang="ar"><body></body></html>');
    await page.addScriptTag({ path: path.resolve(__dirname, '../src/components/printing/printing.js') });
    const result = await page.evaluate(() => window.GhaithPrint.printBarcodes([
      { name: 'جلابية', barcode: 'RED-L', size: 'L', color: 'أحمر', price: 300, copies: 1001 },
      { name: 'جلابية', barcode: 'BLACK-XL', size: 'XL', color: 'أسود', price: 320, copies: 3 }
    ]));
    assert.deepEqual(result, { ok: true, labels: 1004, jobs: 3 });
    assert.deepEqual(requests.map(item => item.copies), [1000, 1, 3]);
    assert.deepEqual(requests.map(item => item.barcode), ['RED-L', 'RED-L', 'BLACK-XL']);
    assert.equal(requests[0].size, 'L');
    assert.equal(requests[2].color, 'أسود');
    console.log('PASS: variant barcode jobs preserve barcode, size, color and exact stock quantity.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
