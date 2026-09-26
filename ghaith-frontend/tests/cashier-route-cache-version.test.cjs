const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const shell = fs.readFileSync(path.join(root, "src/pages/cashier/cashier.js"), "utf8");
const html = fs.readFileSync(path.join(root, "src/pages/cashier/cashier.html"), "utf8");

test("cashier shell propagates its cache version to dynamically loaded POS assets", () => {
  assert.match(shell, /new URL\(import\.meta\.url\)\.searchParams\.get\("v"\)/);
  assert.match(shell, /url\.searchParams\.set\("v", assetVersion\)/);
  assert.match(html, /cashier\.js\?v=20260926-3/);
});
