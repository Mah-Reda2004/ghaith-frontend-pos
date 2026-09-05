import { api } from "../../../core/api.js";
import { debounce, escapeHtml } from "../../../core/utils.js";
import { publishNotification } from "../../../components/notifications/notifications.js";

const API_PAGE_SIZE = 100;
const UI_PAGE_SIZE = 20;
let products = [];
let categories = [];
let categoryNames = new Map();
let summary = { total: 0, low: 0, empty: 0, value: 0 };
let currentPage = 1;
let requestSequence = 0;

function addApiFields() {
  if (document.getElementById("productImageUrl")) return;
  const basicGrid = document.querySelector(".products-form-section .products-form-grid");
  basicGrid.insertAdjacentHTML("beforeend", `
    <div class="field"><label for="productImageUrl">رابط صورة المنتج</label><input class="input" id="productImageUrl" type="url" dir="ltr" placeholder="https://example.com/product.jpg"></div>
    <div class="field" id="productStatusField"><label for="productStatus">حالة المنتج</label><select class="select" id="productStatus"><option value="active">نشط</option><option value="inactive">غير نشط</option></select></div>
    <p class="products-api-note">ينشئ الخادم متغير المخزون الافتراضي تلقائيًا. المقاس واللون غير متاحين حاليًا في API إنشاء المنتجات.</p>`);
  const skuLabel = document.querySelector('label[for="productSku"]');
  if (skuLabel) skuLabel.textContent = "الباركود (اختياري)";
  document.getElementById("productSku")?.removeAttribute("required");
}

function getElements() {
  addApiFields();
  return {
    tableBody: document.getElementById("productsTableBody"), empty: document.getElementById("productsEmpty"), search: document.getElementById("productsSearch"),
    categoryFilter: document.getElementById("productsCategoryFilter"), stockFilter: document.getElementById("productsStockFilter"), paginationInfo: document.getElementById("productsPaginationInfo"), pagination: document.querySelector(".products-pagination .pagination__pages"),
    totalStat: document.getElementById("productsTotalStat"), lowStat: document.getElementById("productsLowStat"), emptyStat: document.getElementById("productsEmptyStat"), valueStat: document.getElementById("productsValueStat"),
    modal: document.getElementById("productModal"), modalTitle: document.getElementById("productModalTitle"), form: document.getElementById("productForm"), id: document.getElementById("productId"),
    nameAr: document.getElementById("productNameAr"), nameEn: document.getElementById("productNameEn"), category: document.getElementById("productCategory"), sku: document.getElementById("productSku"), imageUrl: document.getElementById("productImageUrl"), status: document.getElementById("productStatus"), statusField: document.getElementById("productStatusField"),
    salePrice: document.getElementById("productSalePrice"), costPrice: document.getElementById("productCostPrice"), salesPercentage: document.getElementById("productSalesPercentage"), netProfitPercentage: document.getElementById("productNetProfitPercentage"), quantity: document.getElementById("productQuantity"), minimum: document.getElementById("productMinimum"), nameError: document.getElementById("productNameError"), saveButton: document.getElementById("saveProductBtn"),
    successModal: document.getElementById("productSuccessModal"), successTitle: document.getElementById("productSuccessTitle"), successName: document.getElementById("successProductName"), successSku: document.getElementById("successProductSku"), successCategory: document.getElementById("successProductCategory"), successQuantity: document.getElementById("successProductQuantity"), toastStack: document.getElementById("productsToastStack")
  };
}

function listFrom(response) { return Array.isArray(response) ? response : response?.items || response?.data || []; }
function idempotencyKey() { return crypto.randomUUID(); }

function normalizeProduct(item) {
  return {
    id: item.id, nameAr: item.name_ar || item.name || "—", nameEn: item.name_internal || "", sku: item.sku || item.barcode || "—", barcode: item.barcode || "",
    categoryId: item.category_id || "", category: categoryNames.get(item.category_id) || item.category?.name || "—",
    salePrice: Number(item.sale_price ?? item.sell_price ?? 0), costPrice: Number(item.purchase_price ?? item.cost_price ?? 0),
    salesPercentage: Number(item.commission_rate ?? 0), quantity: Number(item.stock_quantity ?? item.stock_qty ?? 0), minimum: Number(item.low_stock_threshold ?? item.min_qty ?? 0),
    stockStatus: item.stock_status || "available", status: item.status || "active", imageUrl: item.image_url || "", version: Number(item.version || 1), variantId: item.variant_id || "", variantVersion: Number(item.variant_version || 0)
  };
}

function stockState(product) {
  if (product.stockStatus === "out_of_stock" || product.quantity <= 0) return "empty";
  if (product.stockStatus === "limited" || product.quantity <= product.minimum) return "low";
  return "available";
}

function stockLabel(product) {
  const state = stockState(product);
  return state === "empty" ? "نفد المخزون" : state === "low" ? `${product.quantity} منخفض` : `${product.quantity} متوفر`;
}

function calculateProfit(sale, cost, commission) {
  return sale > 0 ? ((sale - cost - sale * (commission / 100)) / sale) * 100 : 0;
}

function updateProfit(elements) {
  const value = calculateProfit(Number(elements.salePrice.value) || 0, Number(elements.costPrice.value) || 0, Number(elements.salesPercentage.value) || 0);
  elements.netProfitPercentage.value = value.toFixed(2);
  elements.netProfitPercentage.classList.toggle("is-negative", value < 0);
}

function showToast(elements, message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  elements.toastStack.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function renderSummary(elements) {
  elements.totalStat.textContent = summary.total.toLocaleString("en-US");
  elements.lowStat.textContent = summary.low.toLocaleString("en-US");
  elements.emptyStat.textContent = summary.empty.toLocaleString("en-US");
  elements.valueStat.textContent = summary.value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function renderPagination(elements, total) {
  const totalPages = Math.max(1, Math.ceil(total / UI_PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const pages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])].filter(page => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const previous = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25"><path d="m9 18 6-6-6-6"/></svg>';
  const next = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25"><path d="m15 18-6-6 6-6"/></svg>';
  elements.pagination.innerHTML = `<button class="page-btn products-page-arrow" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} aria-label="السابق">${previous}</button>${pages.map((page, index) => `${index && page - pages[index - 1] > 1 ? '<span class="pagination__ellipsis">…</span>' : ""}<button class="page-btn${page === currentPage ? " is-active" : ""}" data-page="${page}">${page}</button>`).join("")}<button class="page-btn products-page-arrow" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""} aria-label="التالي">${next}</button>`;
}

function renderProducts(elements) {
  const start = (currentPage - 1) * UI_PAGE_SIZE;
  const pageProducts = products.slice(start, start + UI_PAGE_SIZE);
  elements.tableBody.innerHTML = pageProducts.map(product => {
    const state = stockState(product);
    return `<tr data-product-id="${escapeHtml(String(product.id))}"><td><span class="product-name-cell"><strong>${escapeHtml(product.nameAr)}</strong><small>${escapeHtml(product.nameEn)}</small></span></td><td><span class="product-sku-cell num" dir="ltr">${escapeHtml(product.sku)}</span></td><td>${escapeHtml(product.category)}</td><td class="num" dir="ltr">${product.salePrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td><td><span class="product-stock product-stock--${state}">${stockLabel(product)}</span></td><td><div class="products-actions"><button class="products-action products-action--edit" type="button" data-action="edit" aria-label="تعديل ${escapeHtml(product.nameAr)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button><button class="products-action products-action--delete" type="button" data-action="delete" aria-label="أرشفة ${escapeHtml(product.nameAr)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg></button></div></td></tr>`;
  }).join("");
  elements.empty.hidden = pageProducts.length > 0;
  elements.tableBody.hidden = pageProducts.length === 0;
  elements.paginationInfo.textContent = pageProducts.length ? `عرض ${start + 1} إلى ${start + pageProducts.length} من ${products.length} منتج` : "لا توجد نتائج مطابقة";
  renderPagination(elements, products.length);
  renderSummary(elements);
}

function populateCategories(elements) {
  const options = categories.map(category => `<option value="${escapeHtml(String(category.id))}">${escapeHtml(category.name)}</option>`).join("");
  elements.categoryFilter.innerHTML = `<option value="all">جميع التصنيفات</option>${options}`;
  elements.category.innerHTML = `<option value="">اختر الفئة...</option>${options}`;
}

async function fetchAllProducts(query) {
  const first = await api.get("/api/v1/admin/products", { query: { ...query, page: 1, page_size: API_PAGE_SIZE } });
  const pages = Math.ceil(Number(first.total || listFrom(first).length) / API_PAGE_SIZE);
  const rest = pages > 1 ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => api.get("/api/v1/admin/products", { query: { ...query, page: index + 2, page_size: API_PAGE_SIZE } }))) : [];
  return [first, ...rest].flatMap(listFrom);
}

async function loadProducts(elements) {
  const sequence = ++requestSequence;
  elements.tableBody.setAttribute("aria-busy", "true");
  elements.paginationInfo.textContent = "جاري تحميل المنتجات...";
  try {
    const stockMap = { low: "limited", empty: "out_of_stock" };
    const query = { search: elements.search.value.trim(), category_id: elements.categoryFilter.value === "all" ? undefined : elements.categoryFilter.value, stock_status: elements.stockFilter.value === "all" ? undefined : stockMap[elements.stockFilter.value] || elements.stockFilter.value, status: "active" };
    const [items, summaryResponse] = await Promise.all([fetchAllProducts(query), api.get("/api/v1/admin/products/summary")]);
    if (sequence !== requestSequence) return;
    products = items.map(normalizeProduct);
    summary = { total: Number(summaryResponse.total_product_count || products.length), low: Number(summaryResponse.low_stock_count || 0), empty: Number(summaryResponse.out_of_stock_count || 0), value: Number(summaryResponse.inventory_value || 0) };
    renderProducts(elements);
  } catch (error) {
    if (sequence !== requestSequence) return;
    products = []; renderProducts(elements); showToast(elements, error.message, true);
  } finally { if (sequence === requestSequence) elements.tableBody.setAttribute("aria-busy", "false"); }
}

async function loadCategories(elements) {
  const response = await api.get("/api/v1/categories");
  categories = listFrom(response).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  categoryNames = new Map(categories.map(category => [category.id, category.name]));
  populateCategories(elements);
}

function setModalTitle(elements, text) {
  const node = [...elements.modalTitle.childNodes].find(item => item.nodeType === Node.TEXT_NODE);
  if (node) node.textContent = text;
  const buttonNode = [...elements.saveButton.childNodes].find(item => item.nodeType === Node.TEXT_NODE);
  if (buttonNode) buttonNode.textContent = text === "تعديل المنتج" ? "حفظ التعديلات" : "حفظ المنتج";
}

async function openProductModal(elements, product = null) {
  elements.form.reset(); elements.nameError.hidden = true;
  elements.id.value = product?.id || ""; elements.nameAr.value = product?.nameAr || ""; elements.nameEn.value = product?.nameEn || ""; elements.category.value = product?.categoryId || "";
  elements.sku.value = product?.barcode || ""; elements.imageUrl.value = product?.imageUrl || ""; elements.status.value = product?.status || "active"; elements.statusField.hidden = !product;
  elements.salePrice.value = product?.salePrice ?? ""; elements.costPrice.value = product?.costPrice ?? ""; elements.salesPercentage.value = product?.salesPercentage ?? 0; elements.quantity.value = product?.quantity ?? 0; elements.minimum.value = product?.minimum ?? 5;
  elements.costPrice.readOnly = Boolean(product); elements.modal.dataset.variantId = ""; elements.modal.dataset.variantVersion = "";
  setModalTitle(elements, product ? "تعديل المنتج" : "إضافة منتج جديد"); elements.modal.hidden = false; updateProfit(elements);
  if (product) {
    try {
      const detail = await api.get(`/api/v1/products/${encodeURIComponent(product.id)}`);
      const variant = detail.product_variants?.[0];
      product.variantId = variant?.id || ""; product.variantVersion = Number(variant?.version || 0); product.quantity = Number(variant?.stock_qty ?? product.quantity);
      elements.quantity.value = product.quantity; elements.modal.dataset.variantId = product.variantId; elements.modal.dataset.variantVersion = String(product.variantVersion);
    } catch (error) { showToast(elements, error.message, true); }
  }
  requestAnimationFrame(() => elements.nameAr.focus());
}

function closeProductModal(elements) { elements.modal.hidden = true; elements.form.reset(); elements.nameError.hidden = true; }
function closeSuccess(elements) { elements.successModal.hidden = true; }

function showSuccess(elements, product, edited = false) {
  elements.successTitle.textContent = edited ? "تم تحديث المنتج بنجاح" : "تمت إضافة المنتج بنجاح";
  elements.successName.textContent = product.nameAr; elements.successSku.textContent = product.sku; elements.successCategory.textContent = product.category; elements.successQuantity.textContent = product.quantity.toLocaleString("en-US");
  elements.successModal.hidden = false;
}

async function saveProduct(elements) {
  const id = elements.id.value;
  const nameAr = elements.nameAr.value.trim();
  const categoryId = elements.category.value;
  const salePrice = Number(elements.salePrice.value);
  if (!nameAr) { elements.nameError.hidden = false; elements.nameAr.focus(); return; }
  if (!categoryId || !Number.isFinite(salePrice) || salePrice <= 0) { showToast(elements, "اختر الفئة وأدخل سعر بيع أكبر من صفر.", true); return; }
  elements.saveButton.disabled = true;
  try {
    const existing = products.find(product => String(product.id) === id);
    let response;
    if (existing) {
      response = await api.patch(`/api/v1/admin/products/${encodeURIComponent(id)}`, {
        name_ar: nameAr, name_internal: elements.nameEn.value.trim() || null, category_id: categoryId, sale_price: salePrice,
        low_stock_threshold: Math.max(0, Number(elements.minimum.value) || 0), commission_rate: Math.min(100, Math.max(0, Number(elements.salesPercentage.value) || 0)), barcode: elements.sku.value.trim() || null, image_url: elements.imageUrl.value.trim() || null, status: elements.status.value, version: existing.version
      });
      const desiredQuantity = Math.max(0, Number(elements.quantity.value) || 0);
      const delta = desiredQuantity - existing.quantity;
      if (delta && existing.variantId && existing.variantVersion) {
        await api.post(`/api/v1/admin/products/${encodeURIComponent(id)}/stock-adjustments`, { variant_id: existing.variantId, qty_delta: delta, expected_version: existing.variantVersion, reason: "تعديل يدوي من لوحة الإدارة" }, { headers: { "Idempotency-Key": idempotencyKey() } });
      }
    } else {
      response = await api.post("/api/v1/admin/products", {
        name_ar: nameAr, name_internal: elements.nameEn.value.trim() || null, category_id: categoryId,
        purchase_price: Math.max(0, Number(elements.costPrice.value) || 0), sale_price: salePrice, initial_stock: Math.max(0, Number(elements.quantity.value) || 0),
        low_stock_threshold: Math.max(0, Number(elements.minimum.value) || 0), commission_rate: Math.min(100, Math.max(0, Number(elements.salesPercentage.value) || 0)), barcode: elements.sku.value.trim() || null, image_url: elements.imageUrl.value.trim() || null
      }, { headers: { "Idempotency-Key": idempotencyKey() } });
    }
    closeProductModal(elements); currentPage = 1; await loadProducts(elements);
    const saved = products.find(product => product.id === response?.id) || products.find(product => product.nameAr === nameAr) || normalizeProduct(response || { name_ar: nameAr, category_id: categoryId });
    showSuccess(elements, saved, Boolean(existing));
    const state = stockState(saved);
    if (state !== "available") publishNotification({ type: state === "empty" ? "out_of_stock" : "low_stock", priority: state === "empty" ? "critical" : "warning", title: state === "empty" ? "نفد المنتج من المخزون" : "مخزون المنتج منخفض", message: `${saved.nameAr}: الكمية الحالية ${saved.quantity}.`, entityId: `product:${saved.id}` });
  } catch (error) { showToast(elements, error.message, true); }
  finally { elements.saveButton.disabled = false; }
}

export function initProducts() {
  const elements = getElements();
  window.bindAdminThemeToggle?.(document.getElementById("productsThemeToggle"));
  loadCategories(elements).then(() => loadProducts(elements)).catch(error => showToast(elements, error.message, true));
  const refresh = debounce(() => { currentPage = 1; loadProducts(elements); }, 300);
  const handleTable = async event => {
    const action = event.target.closest("[data-action]"); const row = action?.closest("[data-product-id]"); if (!action || !row) return;
    const product = products.find(item => String(item.id) === row.dataset.productId); if (!product) return;
    if (action.dataset.action === "edit") await openProductModal(elements, product);
    if (action.dataset.action === "delete" && window.confirm(`هل تريد أرشفة المنتج «${product.nameAr}»؟`)) {
      try { await api.delete(`/api/v1/admin/products/${encodeURIComponent(product.id)}`); showToast(elements, "تمت أرشفة المنتج"); await loadProducts(elements); }
      catch (error) { showToast(elements, error.message, true); }
    }
  };
  const handleSubmit = event => { event.preventDefault(); saveProduct(elements); };
  const handlePagination = event => { const button = event.target.closest("[data-page]"); if (!button || button.disabled) return; currentPage = Number(button.dataset.page); renderProducts(elements); };
  const handleEscape = event => { if (event.key !== "Escape") return; if (!elements.successModal.hidden) closeSuccess(elements); else if (!elements.modal.hidden) closeProductModal(elements); };
  document.getElementById("addProductBtn").addEventListener("click", () => openProductModal(elements));
  document.getElementById("closeProductModal").addEventListener("click", () => closeProductModal(elements)); document.getElementById("cancelProductModal").addEventListener("click", () => closeProductModal(elements));
  document.getElementById("addAnotherProduct").addEventListener("click", () => { closeSuccess(elements); openProductModal(elements); }); document.getElementById("backToProducts").addEventListener("click", () => closeSuccess(elements));
  document.getElementById("printProductBarcode").addEventListener("click", () => window.GhaithPrint?.printBarcode({ name: elements.successName.textContent, sku: elements.successSku.textContent, copies: 1 }));
  elements.form.addEventListener("submit", handleSubmit); elements.tableBody.addEventListener("click", handleTable); elements.pagination.addEventListener("click", handlePagination);
  elements.search.addEventListener("input", refresh); elements.categoryFilter.addEventListener("change", refresh); elements.stockFilter.addEventListener("change", refresh);
  [elements.salePrice, elements.costPrice, elements.salesPercentage].forEach(input => input.addEventListener("input", () => updateProfit(elements)));
  elements.modal.addEventListener("click", event => { if (event.target === elements.modal) closeProductModal(elements); }); elements.successModal.addEventListener("click", event => { if (event.target === elements.successModal) closeSuccess(elements); }); document.addEventListener("keydown", handleEscape);
  return () => { requestSequence += 1; refresh.cancel?.(); elements.form.removeEventListener("submit", handleSubmit); elements.tableBody.removeEventListener("click", handleTable); elements.pagination.removeEventListener("click", handlePagination); document.removeEventListener("keydown", handleEscape); };
}
