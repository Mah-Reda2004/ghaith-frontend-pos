const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const printer = fs.readFileSync(path.join(root, "print_agent", "printer.py"), "utf8");
const config = fs.readFileSync(path.join(root, "print_agent", "config.py"), "utf8");
const service = fs.readFileSync(path.join(root, "print_agent", "service.py"), "utf8");

test("receipts use bounded raw ESC/POS instead of the Windows page driver", () => {
  assert.match(printer, /def _escpos_raster\(/);
  assert.match(printer, /bytearray\(b"\\x1b@"\)/);
  assert.match(printer, /0x1D, 0x76, 0x30/);
  assert.match(printer, /_print_receipt_raw\(image, printer_name, document_name\)/);
  assert.doesNotMatch(printer, /else:\s*for copy_number in range\(repeat\):\s*self\._print_image\(image, printer_name, document_name, kind\)/);
});

test("80mm receipt raster width is capped at the mechanism printable width", () => {
  assert.match(config, /"receipt_print_width_dots": 576/);
  assert.match(printer, /max_width = max\(8, config\.receipt_print_width_dots\)/);
});

test("duplicate Windows queues on one USB port produce only one receipt job", () => {
  assert.match(printer, /queues_by_port: dict\[str, list\[str\]\]/);
  assert.match(printer, /max\(names, key=queue_score\)/);
});

test("the dual-mode Q371 queue is reserved for labels and XP-80 for receipts", () => {
  assert.match(printer, /BARCODE_MARKERS = \("370", "q371", "barcode", "label"\)/);
});

test("printer discovery is not mistaken for a protected print endpoint", () => {
  assert.match(service, /startswith\("\/api\/print\/"\)/);
});

test("barcode product names shrink to fit instead of being cut at 24 characters", () => {
  assert.match(printer, /def fitted_rtl_font\(/);
  assert.match(printer, /product_font = fitted_rtl_font\(/);
  assert.match(printer, /draw_rtl\(draw, \(product_area_width \/\/ 2, 3\), product_name, product_font/);
  assert.doesNotMatch(printer, /str\(data\.get\("name"\) or "منتج"\)\[:24\]/);
});

test("raw TSPL barcode labels include the product price", () => {
  assert.match(printer, /price_text = f"\{amount_text\} EGP"/);
  assert.match(printer, /price_command = f'TEXT \{price_x\},162/);
  assert.match(printer, /payload\.get\("price"\), repeat/);
});
