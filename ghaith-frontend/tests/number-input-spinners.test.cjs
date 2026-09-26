const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.resolve(__dirname, "../assets/css/components/forms.css"), "utf8");

test("numeric inputs hide native browser spinner controls", () => {
  assert.match(css, /input\[type="number"\]\s*\{[^}]*appearance:\s*textfield/s);
  assert.match(css, /::-webkit-inner-spin-button/);
  assert.match(css, /::-webkit-outer-spin-button/);
  assert.match(css, /-webkit-appearance:\s*none/);
});
