import { escapeHtml } from "./utils.js";

function rowMarkup(variant = {}, removable = true) {
  return `<div class="product-variant-row"><div class="field"><label>المقاس</label><input class="input product-variant-size" value="${escapeHtml(variant.size || "")}" placeholder="مثال: L" required></div><div class="field"><label>اللون</label><input class="input product-variant-color" value="${escapeHtml(variant.color || "")}" placeholder="مثال: أسود" required></div><div class="field"><label>الكمية</label><input class="input num product-variant-quantity" type="number" min="0" step="1" value="${Number.isFinite(Number(variant.quantity)) ? Number(variant.quantity) : 0}" required></div><button class="btn-icon product-variant-remove" type="button" aria-label="حذف المقاس" ${removable ? "" : "disabled"}>×</button></div>`;
}

export function productVariantsMarkup(idPrefix = "productVariant") {
  return `<section class="product-variants-editor" data-variants-editor><div class="field product-variants-mode"><label>خيارات المقاسات</label><select class="select" data-variants-mode><option value="single">مقاس واحد (افتراضي)</option><option value="multiple">أكثر من مقاس</option></select></div><div class="product-variants-single" data-variants-single><div class="field"><label for="${idPrefix}-size">المقاس</label><input class="input product-single-size" id="${idPrefix}-size" name="size" placeholder="مثال: L" required></div><div class="field"><label for="${idPrefix}-color">اللون</label><input class="input product-single-color" id="${idPrefix}-color" name="color" placeholder="مثال: أسود" required></div></div><div class="product-variants-multiple" data-variants-multiple hidden><div class="product-variants-heading"><div><strong>المقاسات والألوان والكميات</strong><small>أضف نسخة مستقلة لكل مقاس ولون.</small></div><button class="btn btn-outline" type="button" data-add-variant>+ إضافة مقاس</button></div><div class="product-variant-rows" data-variant-rows>${rowMarkup({}, false)}</div></div></section>`;
}

export function setupProductVariants(root, singleQuantityInput, initialVariants = []) {
  const editor = root.querySelector("[data-variants-editor]");
  if (!editor || !singleQuantityInput) return () => {};
  const mode = editor.querySelector("[data-variants-mode]");
  const single = editor.querySelector("[data-variants-single]");
  const multiple = editor.querySelector("[data-variants-multiple]");
  const rows = editor.querySelector("[data-variant-rows]");
  const quantityField = singleQuantityInput.closest(".field");
  const render = variants => { rows.innerHTML = variants.map((variant, index) => rowMarkup(variant, index > 0)).join("") || rowMarkup({}, false); };
  const setMode = value => { mode.value = value; single.hidden = value === "multiple"; multiple.hidden = value !== "multiple"; quantityField.hidden = value === "multiple"; };
  if (initialVariants.length > 1) { render(initialVariants); setMode("multiple"); } else { editor.querySelector(".product-single-size").value = initialVariants[0]?.size || ""; editor.querySelector(".product-single-color").value = initialVariants[0]?.color || ""; setMode("single"); }
  const onChange = event => { if (event.target === mode) setMode(mode.value); };
  const onClick = event => { if (event.target.closest("[data-add-variant]")) { rows.insertAdjacentHTML("beforeend", rowMarkup({}, true)); rows.lastElementChild.querySelector("input").focus(); } const remove = event.target.closest(".product-variant-remove"); if (remove && !remove.disabled) remove.closest(".product-variant-row").remove(); };
  editor.addEventListener("change", onChange); editor.addEventListener("click", onClick);
  return () => { editor.removeEventListener("change", onChange); editor.removeEventListener("click", onClick); };
}

export function readProductVariants(root, singleQuantityInput) {
  const editor = root.querySelector("[data-variants-editor]");
  if (!editor || editor.querySelector("[data-variants-mode]").value === "single") {
    const size = editor?.querySelector(".product-single-size")?.value.trim() || "افتراضي";
    const color = editor?.querySelector(".product-single-color")?.value.trim() || "افتراضي";
    return [{ size, color, quantity: Math.max(0, Number(singleQuantityInput.value) || 0), is_default: true }];
  }
  const variants = [...editor.querySelectorAll(".product-variant-row")].map(row => ({ size: row.querySelector(".product-variant-size").value.trim(), color: row.querySelector(".product-variant-color").value.trim(), quantity: Number(row.querySelector(".product-variant-quantity").value), is_default: false }));
  if (variants.some(item => !item.size || !item.color || !Number.isInteger(item.quantity) || item.quantity < 0)) throw new Error("أكمل المقاس واللون، واجعل الكمية رقمًا صحيحًا لا يقل عن صفر.");
  const keys = variants.map(item => `${item.size.toLocaleLowerCase("ar")}::${item.color.toLocaleLowerCase("ar")}`);
  if (new Set(keys).size !== keys.length) throw new Error("لا يمكن تكرار نفس المقاس واللون أكثر من مرة.");
  return variants;
}
