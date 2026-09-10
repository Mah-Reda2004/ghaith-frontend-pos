// ==========================================================================
// نقطة البيع — منطق كامل: سلة، فلاتر تصنيف، بحث/سكانر باركود، مودال دفع.
// يعتمد على API الحقيقي للكتالوج وإتمام البيع.
// ==========================================================================

import { api } from "../../../core/api.js";
import { getCurrentUser, getUserRole } from "../../../core/auth.js";

(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* 1) الثيم (فاتح/غامق) — نفس منطق core/theme.js بس بدون import/export */
  /* ------------------------------------------------------------------ */
  const THEME_KEY = "ghaith-theme";
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved || "dark";
    document.documentElement.setAttribute("data-theme", theme);
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  }
  if (document.documentElement.dataset.cashierSpa !== "true") {
    initTheme();
    document.getElementById("themeToggleBtn").addEventListener("click", toggleTheme);
  }

  /* ------------------------------------------------------------------ */
  /* 2) بيانات الكتالوج القادمة من الـ API                              */
  /* ------------------------------------------------------------------ */
  let products = [];
  let categories = [];
  let categoryProducts = null;
  let salesUsers = [];
  let currentShift = null;

  /* ------------------------------------------------------------------ */
  /* 3) الحالة (State)                                                  */
  /* ------------------------------------------------------------------ */
  const state = {
    cart: [], // { id, name, price, qty }
    activeCategory: "",
    searchQuery: "",
  };

  /* ------------------------------------------------------------------ */
  /* 4) عناصر DOM                                                        */
  /* ------------------------------------------------------------------ */
  const els = {
    categoryChips: document.getElementById("categoryChips"),
    productGrid: document.getElementById("productGrid"),
    scanInput: document.getElementById("scanInput"),
    cartList: document.getElementById("cartList"),
    cartCount: document.getElementById("cartCount"),
    sumSubtotal: document.getElementById("sumSubtotal"),
    sumTotal: document.getElementById("sumTotal"),
    checkoutBtn: document.getElementById("checkoutBtn"),
    posCart: document.getElementById("posCart"),
    cartFab: document.getElementById("cartFab"),
    fabCount: document.getElementById("fabCount"),
    toastStack: document.getElementById("toastStack"),
    // مودال الدفع
    paymentOverlay: document.getElementById("paymentOverlay"),
    closePaymentBtn: document.getElementById("closePaymentBtn"),
    cancelPaymentBtn: document.getElementById("cancelPaymentBtn"),
    confirmPaymentBtn: document.getElementById("confirmPaymentBtn"),
    confirmTotalLabel: document.getElementById("confirmTotalLabel"),
    customerTypeSelect: document.getElementById("customerTypeSelect"),
    salesSelect: document.getElementById("salesSelect"),
    paymentMethodGroup: document.getElementById("paymentMethodGroup"),
    // عناصر الملخص الجديدة
    modalSubtotal: document.getElementById("modalSubtotal"),
    modalTotalVal: document.getElementById("modalTotalVal"),
    modalCartItems: document.getElementById("modalCartItems"),
    discountHintRow: document.getElementById("discountHintRow"),
    discountBadge: document.getElementById("discountBadge"),
    discountValue: document.getElementById("discountValue"),
    // حقول الكاش
    cashInputsSection: document.getElementById("cashInputsSection"),
    paidAmount: document.getElementById("paidAmount"),
    remainingAmount: document.getElementById("remainingAmount"),
    customerName: document.getElementById("customerName"),
    customerPhone: document.getElementById("customerPhone"),
    customerAddress: document.getElementById("customerAddress"),
  };

  let selectedDiscountPct = 0;

  /* ------------------------------------------------------------------ */
  /* 5) أدوات مساعدة                                                     */
  /* ------------------------------------------------------------------ */
  function formatMoney(n) {
    return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function escapeHtml(str = "") {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = "toast" + (type === "error" ? " is-error" : "");
    toast.textContent = message;
    els.toastStack.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  function listFrom(response) {
    if (Array.isArray(response)) return response;
    return response?.items || response?.data?.items || response?.products || response?.categories || response?.users || response?.sales_users || response?.results || (Array.isArray(response?.data) ? response.data : []);
  }

  async function loadAllCategories() {
    return listFrom(await api.get("/api/v1/categories"));
  }

  async function loadAllProducts() {
    const first = await api.get("/api/v1/products", { query: { page: 1, page_size: 100 } });
    const pageCount = Math.ceil(Number(first?.total || listFrom(first).length) / 100);
    const pages = [first];
    for (let page = 2; page <= pageCount; page += 1) {
      pages.push(await api.get("/api/v1/products", { query: { page, page_size: 100 } }));
    }
    return pages.flatMap(listFrom);
  }

  function firstRecord(value) {
    const record = Array.isArray(value) ? value[0] : value;
    if (!record || typeof record !== "object") return {};
    const nested = record.data || record.item;
    return nested && nested !== record ? firstRecord(nested) : record;
  }

  function categoryKey(value) {
    return String(value ?? "").trim().toLocaleLowerCase("ar");
  }

  function normalizeProduct(item) {
    const productSource = item.product || item.products;
    const product = productSource ? firstRecord(productSource) : item;
    const categorySource = product.category || item.category || product.categories || item.categories;
    const category = firstRecord(categorySource);
    const categoryId = category.id ?? category.uuid ?? category.category_id ?? category.categoryId ?? product.category_id ?? product.categoryId ?? item.category_id ?? item.categoryId ?? "";
    const categoryName = category.name || category.name_ar || category.category_name || product.category_name || product.categoryName || item.category_name || item.categoryName || (typeof categorySource === "string" ? categorySource : "");
    const stock = Number(item.stock_qty ?? item.stock_quantity ?? item.quantity ?? product.stock_qty ?? product.stock_quantity ?? 0);
    return {
      id: String(item.variant_id || item.id),
      productId: product.id || item.product_id,
      sku: String(item.sku || product.sku || ""),
      barcode: String(item.barcode || product.barcode || ""),
      name: product.name_ar || product.name || item.name_ar || item.name || "منتج",
      price: Number(item.sale_price ?? product.sale_price ?? item.price ?? 0),
      categoryId: String(categoryId).trim(),
      category: categoryName || "بدون تصنيف",
      badge: [item.size, item.color].filter(Boolean).join(" · ") || "افتراضي",
      stock,
      version: Number(item.version || 1)
    };
  }

  function normalizeProducts(response) {
    return listFrom(response).flatMap(item => {
      const variants = item.product_variants || item.variants;
      return Array.isArray(variants) && variants.length
        ? variants.map(variant => normalizeProduct({ ...variant, product: item }))
        : [normalizeProduct(item)];
    }).filter(item => item.id && item.stock > 0);
  }

  function reconcileProductCategories() {
    products.forEach(product => {
      const productId = categoryKey(product.categoryId);
      const productCategory = categoryKey(product.category);
      const category = categories.find(item => categoryKey(item.id) === productId
        || categoryKey(item.id) === productCategory
        || categoryKey(item.name) === productCategory);
      if (!category) return;
      product.categoryId = category.id;
      product.category = category.name;
    });
  }

  function renderSalesUsers() {
    if (!els.salesSelect) return;
    els.salesSelect.innerHTML = '<option value="">اختر اسم السيلز...</option>' + salesUsers
      .map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name || user.username)}</option>`).join("");
  }

  async function loadPosData() {
    categoryProducts = null;
    els.productGrid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>جاري تحميل المنتجات...</p></div>';
    const currentUser = getCurrentUser();
    salesUsers = getUserRole(currentUser) === "sales" && currentUser?.id ? [{ id: String(currentUser.id), name: currentUser.name || currentUser.username }] : [];
    try {
      // Keep startup requests sequential so cashier accounts do not exceed the
      // API's stricter per-user rate limit when a large catalogue is present.
      const productResponse = await loadAllProducts();
      const categoryResponse = await loadAllCategories();
      products = normalizeProducts(productResponse);
      categories = categoryResponse.filter(item => item.status !== "inactive" && item.is_active !== false).map(item => {
        const category = firstRecord(item);
        return { id: String(category.id || category.uuid || category.category_id || category.categoryId || "").trim(), name: category.name || category.name_ar || category.category_name };
      }).filter(item => item.id && item.name);
      reconcileProductCategories();
      if (state.activeCategory && !categories.some(item => item.id === state.activeCategory)) state.activeCategory = "";
      renderCategoryChips();
      renderProductGrid();

      try {
        const salesResponse = await api.get("/api/v1/pos/sales-users", { query: { status: "active" } });
        salesUsers = listFrom(salesResponse)
          .filter(user => user.is_active !== false && user.status !== "inactive")
          .map(user => ({ id: String(user.id || user.user_id), name: user.name || user.username || user.full_name }))
          .filter(user => user.id && user.name);
      } catch { /* يظل مستخدم السيلز الحالي متاحًا كحل احتياطي. */ }
      renderSalesUsers();

      try {
        const shiftResponse = await api.get("/api/v1/shifts/current");
        currentShift = shiftResponse?.shift || shiftResponse?.data || shiftResponse;
      } catch {
        currentShift = null;
        showToast("تم تحميل المنتجات، لكن تعذّر تحميل الوردية الحالية. سجّل الدخول مجددًا أو راجع صلاحية الكاشير.", "error");
      }

      let customerTypes = [];
      try { customerTypes = listFrom(await api.get("/api/v1/customer-types")); }
      catch { /* أنواع العملاء لا تمنع عرض الكتالوج */ }
      if (els.customerTypeSelect && customerTypes.length) {
        els.customerTypeSelect.innerHTML = customerTypes.map(type => {
          const discount = Number(type.discount_percent ?? type.discount_rate ?? type.discount ?? 0);
          return `<option value="${escapeHtml(type.id)}" data-discount="${discount}">${escapeHtml(type.name)}</option>`;
        }).join("");
        selectedDiscountPct = Number(els.customerTypeSelect.selectedOptions[0]?.dataset.discount || 0);
      }
    } catch (error) {
      products = [];
      renderProductGrid();
      showToast(error.message, "error");
    }
  }

  /* ------------------------------------------------------------------ */
  /* 6) السلة: إضافة / تعديل كمية / حذف                                 */
  /* ------------------------------------------------------------------ */
  function addToCart(product) {
    const existing = state.cart.find((item) => item.id === product.id);
    if (existing) {
      if (existing.qty >= product.stock) {
        showToast("الكمية المطلوبة أكبر من المخزون المتاح", "error");
        return;
      }
      existing.qty += 1;
    } else {
      state.cart.push({ ...product, qty: 1 });
    }
    renderCart();
    showToast(`أُضيف "${product.name}" للسلة`);
  }

  function changeQty(id, delta) {
    const item = state.cart.find((i) => i.id === id);
    if (!item) return;
    if (delta > 0 && item.qty >= item.stock) {
      showToast("لا توجد كمية إضافية في المخزون", "error");
      return;
    }
    item.qty += delta;
    if (item.qty <= 0) {
      state.cart = state.cart.filter((i) => i.id !== id);
    }
    renderCart();
  }

  function removeFromCart(id) {
    state.cart = state.cart.filter((i) => i.id !== id);
    renderCart();
  }

  function getCartTotals() {
    const subtotal = state.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    const discountValue = (subtotal * selectedDiscountPct) / 100;
    const total = subtotal - discountValue;
    return { subtotal, discountValue, total };
  }

  function renderCart() {
    const count = state.cart.reduce((sum, i) => sum + i.qty, 0);
    els.cartCount.textContent = `${count} عناصر`;
    els.fabCount.textContent = `السلة (${count})`;

    if (state.cart.length === 0) {
      els.cartList.innerHTML = `
        <div class="pos-cart__empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
          <p>السلة فاضية.<br/>ابحث أو امسح باركود منتج للإضافة.</p>
        </div>`;
    } else {
      els.cartList.innerHTML = state.cart
        .map(
          (item) => `
        <div class="cart-item" data-id="${item.id}">
          <div class="cart-item__top">
            <button class="cart-item__remove" type="button" data-action="remove" aria-label="حذف">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
            <div class="cart-item__name">${escapeHtml(item.name)}</div>
          </div>
          <div class="cart-item__bottom">
            <div class="qty-stepper">
              <button type="button" data-action="dec">-</button>
              <span class="qty-value num">${item.qty}</span>
              <button type="button" data-action="inc">+</button>
            </div>
            <div class="cart-item__price num">${formatMoney(item.price * item.qty)} <small>ج.م</small></div>
          </div>
        </div>`
        )
        .join("");
    }

    const { subtotal, total } = getCartTotals();
    if (els.sumSubtotal) els.sumSubtotal.textContent = formatMoney(subtotal) + " ج.م";
    if (els.sumTotal) els.sumTotal.textContent = formatMoney(total) + " ج.م";
    els.checkoutBtn.disabled = state.cart.length === 0;
  }

  els.cartList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.closest(".cart-item").dataset.id;
    if (btn.dataset.action === "inc") changeQty(id, 1);
    if (btn.dataset.action === "dec") changeQty(id, -1);
    if (btn.dataset.action === "remove") removeFromCart(id);
  });

  /* ------------------------------------------------------------------ */
  /* 7) فلاتر التصنيف + شبكة المنتجات                                   */
  /* ------------------------------------------------------------------ */
  function renderCategoryChips() {
    const options = [{ id: "", name: "الكل" }, ...categories];
    els.categoryChips.innerHTML = options.map(
      category => `<button class="chip-filter${category.id === state.activeCategory ? " is-active" : ""}" data-cat="${escapeHtml(category.id)}">${escapeHtml(category.name)}</button>`
    ).join("");
  }

  els.categoryChips.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    state.activeCategory = btn.dataset.cat;
    categoryProducts = null;
    renderCategoryChips();
    renderProductGrid();
    if (!state.activeCategory) return;
    try {
      const response = await api.get("/api/v1/products/search", { query: { category_id: state.activeCategory, in_stock: true, page: 1, page_size: 100 } });
      if (state.activeCategory !== btn.dataset.cat) return;
      const selectedCategory = categories.find(category => category.id === state.activeCategory);
      categoryProducts = normalizeProducts(response).map(product => ({
        ...product,
        categoryId: state.activeCategory,
        category: selectedCategory?.name || product.category
      }));
      renderProductGrid();
    } catch {
      // تظل الفلترة المحلية متاحة إذا كان مسار البحث غير مدعوم في الخادم.
    }
  });

  function getFilteredProducts() {
    const q = state.searchQuery.trim().toLowerCase();
    const activeCategory = categories.find(category => category.id === state.activeCategory);
    const activeCategoryId = categoryKey(state.activeCategory);
    const activeCategoryName = categoryKey(activeCategory?.name);
    return (categoryProducts || products).filter((p) => {
      const matchesCategory = !state.activeCategory
        || categoryKey(p.categoryId) === activeCategoryId
        || (activeCategoryName && categoryKey(p.category) === activeCategoryName);
      const matchesQuery =
        !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q);
      return matchesCategory && matchesQuery;
    });
  }

  function renderProductGrid() {
    const products = getFilteredProducts();
    if (products.length === 0) {
      els.productGrid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <p>مفيش منتجات مطابقة للبحث.</p>
        </div>`;
      return;
    }
    els.productGrid.innerHTML = products
      .map(
        (p) => `
      <div class="product-card" data-id="${p.id}">
        <div class="product-card__badges">
          <span class="product-card__badge-stock">مخزون: ${p.stock}</span>
          <span class="product-card__badge-size">${escapeHtml(p.badge)}</span>
        </div>
        <div class="product-card__name">${escapeHtml(p.name)}</div>
        <div class="product-card__footer">
          <span class="product-card__price num">${formatMoney(p.price)} <small>ج.م</small></span>
        </div>
      </div>`
      )
      .join("");
  }

  els.productGrid.addEventListener("click", async (e) => {
    const card = e.target.closest(".product-card");
    if (!card) return;
    let product = getFilteredProducts().find((p) => p.id === card.dataset.id);
    if (!product) return;
    if (product.productId) {
      card.setAttribute("aria-busy", "true");
      try {
        const response = await api.get(`/api/v1/products/${encodeURIComponent(product.productId)}`);
        const detailed = normalizeProducts([response?.product || response?.data || response]);
        product = detailed.find(item => item.id === product.id) || product;
        products = products.map(item => item.id === product.id ? product : item);
        if (categoryProducts) categoryProducts = categoryProducts.map(item => item.id === product.id ? product : item);
      } catch (error) { showToast(error.message, "error"); }
      finally { card.removeAttribute("aria-busy"); }
    }
    addToCart(product);
  });

  /* ------------------------------------------------------------------ */
  /* 8) خانة البحث/السكانر — دي أهم جزء:                                 */
  /*    - الكتابة العادية: بتفلتر الشبكة live (debounce بسيط)            */
  /*    - يدعم أجهزة الـ USB التي تعمل كلوحة مفاتيح وترسل Enter أو Tab.   */
  /*    - التطابق الدقيق للباركود/SKU له الأولوية ولا يعتمد على السرعة.  */
  /*    - يلتقط المسح السريع حتى لو التركيز خارج خانة البحث.              */
  /* ------------------------------------------------------------------ */
  const SCAN_MIN_LEN = 4; // أقل طول متوقع لباركود/SKU
  const GLOBAL_SCAN_GAP_MS = 120;
  const SCAN_TERMINATORS = new Set(["Enter", "Tab"]);

  let searchDebounceTimer = null;
  let globalScanBuffer = "";
  let globalScanLastKeyAt = 0;
  let globalScanResetTimer = null;

  function normalizeScannedCode(value) {
    return String(value || "").replace(/[\r\n\t]/g, "").trim();
  }

  function findProductByCode(code) {
    const normalizedCode = normalizeScannedCode(code).toLowerCase();
    return products.find(product =>
      product.barcode.toLowerCase() === normalizedCode ||
      product.sku.toLowerCase() === normalizedCode
    );
  }

  function resetScanField() {
    clearTimeout(searchDebounceTimer);
    els.scanInput.value = "";
    state.searchQuery = "";
    renderProductGrid();
    els.scanInput.focus();
  }

  async function submitScanInput(rawValue, reportMissing = false) {
    const value = normalizeScannedCode(rawValue);
    if (!value) return;

    const exactProduct = findProductByCode(value);
    if (exactProduct) {
      addToCart(exactProduct);
      resetScanField();
      return;
    }

    const query = value.toLowerCase();
    const matches = products.filter(product =>
      product.name.toLowerCase().includes(query) ||
      product.sku.toLowerCase().includes(query) ||
      product.barcode.includes(query)
    );

    if (matches.length === 1) {
      addToCart(matches[0]);
      resetScanField();
      return;
    }

    if (reportMissing) {
      try {
        const response = await api.get(`/api/v1/products/barcode/${encodeURIComponent(value)}`);
        const product = normalizeProduct(response?.item || response?.data || response);
        if (!products.some(item => item.id === product.id)) products.push(product);
        addToCart(product);
        resetScanField();
      } catch {
        showToast(`لم يتم العثور على منتج بالكود: ${value}`, "error");
        resetScanField();
      }
      return;
    }

    state.searchQuery = value;
    renderProductGrid();
  }

  els.scanInput.addEventListener("keydown", (e) => {
    if (!SCAN_TERMINATORS.has(e.key)) return;
    e.preventDefault();
    clearTimeout(searchDebounceTimer);
    const value = normalizeScannedCode(els.scanInput.value);
    submitScanInput(value, e.key === "Tab" || value.length >= SCAN_MIN_LEN);
  });

  els.scanInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      state.searchQuery = els.scanInput.value;
      renderProductGrid();
    }, 250);
  });

  async function handleBarcodeScan(code) {
    const normalizedCode = normalizeScannedCode(code);
    const product = findProductByCode(normalizedCode);
    if (product) {
      addToCart(product);
    } else {
      try {
        const response = await api.get(`/api/v1/products/barcode/${encodeURIComponent(normalizedCode)}`);
        const remoteProduct = normalizeProduct(response?.item || response?.data || response);
        if (!products.some(item => item.id === remoteProduct.id)) products.push(remoteProduct);
        addToCart(remoteProduct);
      } catch {
        showToast(`لم يتم العثور على منتج بالكود: ${normalizedCode}`, "error");
      }
    }
    resetScanField();
  }

  document.addEventListener("keydown", event => {
    const target = event.target;
    const isEditable = target instanceof HTMLElement && (
      target.matches("input, textarea, select") || target.isContentEditable
    );
    const paymentIsOpen = els.paymentOverlay.style.display === "flex";
    if (isEditable || paymentIsOpen || event.ctrlKey || event.altKey || event.metaKey) return;

    const now = performance.now();
    if (SCAN_TERMINATORS.has(event.key)) {
      const isFreshScan = globalScanBuffer.length >= SCAN_MIN_LEN && now - globalScanLastKeyAt <= GLOBAL_SCAN_GAP_MS;
      if (isFreshScan) {
        event.preventDefault();
        handleBarcodeScan(globalScanBuffer);
      }
      globalScanBuffer = "";
      clearTimeout(globalScanResetTimer);
      return;
    }

    if (event.key.length !== 1 || event.repeat) return;
    if (now - globalScanLastKeyAt > GLOBAL_SCAN_GAP_MS) globalScanBuffer = "";
    globalScanBuffer += event.key;
    globalScanLastKeyAt = now;
    clearTimeout(globalScanResetTimer);
    globalScanResetTimer = setTimeout(() => { globalScanBuffer = ""; }, GLOBAL_SCAN_GAP_MS * 2);
  });

  /* ------------------------------------------------------------------ */
  /* 9) مودال إتمام الدفع                                                */
  /* ------------------------------------------------------------------ */
  function openPaymentModal() {
    if (state.cart.length === 0) return;
    updatePaymentTotals();
    renderModalCartItems();
    // ريست حقول الدفع
    if (els.paidAmount) els.paidAmount.value = "";
    if (els.remainingAmount) els.remainingAmount.value = "";
    // عرض section الكاش افتراضي لو الطريقة نقدي
    const activeMethod = els.paymentMethodGroup.querySelector(".method-btn.is-active");
    toggleCashInputs(activeMethod ? activeMethod.dataset.method : "نقدي");
    els.paymentOverlay.style.display = "flex";
  }

  function renderModalCartItems() {
    if (!els.modalCartItems) return;
    els.modalCartItems.innerHTML = state.cart.map(item => `
      <div class="modal-cart-item">
        <div class="mci-info">
          <span class="mci-name">${escapeHtml(item.name)}</span>
          <span class="mci-qty">${item.qty} قطعة</span>
        </div>
        <div class="mci-price-act">
          <span class="mci-price num">${formatMoney(item.price * item.qty)}</span>
          <button type="button" class="btn-remove-modal" data-id="${item.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
    `).join("");
  }

  function closePaymentModal() {
    els.paymentOverlay.style.display = "none";
    els.scanInput.focus();
  }

  function toggleCashInputs(method) {
    if (!els.cashInputsSection) return;
    // أظهر حقول المبلغ فقط للأجل
    if (method === "آجل") {
      els.cashInputsSection.classList.add("is-visible");
      const { total } = getCartTotals();
      if (els.paidAmount) els.paidAmount.value = "0";
      if (els.remainingAmount) els.remainingAmount.value = total.toFixed(2);
    } else {
      els.cashInputsSection.classList.remove("is-visible");
    }
  }

  function updatePaymentTotals() {
    const { subtotal, discountValue, total } = getCartTotals();
    // عمود الملخص
    if (els.modalSubtotal) els.modalSubtotal.textContent = formatMoney(subtotal) + " ج.م";
    if (els.modalTotalVal) els.modalTotalVal.textContent = formatMoney(total);
    // زرار التأكيد
    if (els.confirmTotalLabel) els.confirmTotalLabel.textContent = formatMoney(total);
    // صف الخصم
    if (els.discountHintRow) {
      if (selectedDiscountPct > 0) {
        els.discountHintRow.style.display = "flex";
        if (els.discountBadge) {
          const selectedOption = els.customerTypeSelect ? els.customerTypeSelect.options[els.customerTypeSelect.selectedIndex] : null;
          const typeName = selectedOption ? selectedOption.value : "";
          els.discountBadge.querySelector ? 
            (els.discountBadge.lastChild.textContent = ` خصم ${typeName} ${selectedDiscountPct}%`) :
            null;
        }
        if (els.discountValue) els.discountValue.textContent = `-${formatMoney(discountValue)} ج.م`;
      } else {
        els.discountHintRow.style.display = "none";
      }
    }
  }

  els.checkoutBtn.addEventListener("click", openPaymentModal);
  els.closePaymentBtn.addEventListener("click", closePaymentModal);
  els.cancelPaymentBtn.addEventListener("click", closePaymentModal);
  els.paymentOverlay.addEventListener("click", (e) => {
    if (e.target === els.paymentOverlay) closePaymentModal();
  });

  if (els.modalCartItems) {
    els.modalCartItems.addEventListener("click", e => {
      const btn = e.target.closest(".btn-remove-modal");
      if (!btn) return;
      removeFromCart(btn.dataset.id);
      renderModalCartItems();
      updatePaymentTotals();
      if (state.cart.length === 0) closePaymentModal();
    });
  }

  if (els.customerTypeSelect) {
    els.customerTypeSelect.addEventListener("change", (e) => {
      const selectedOption = els.customerTypeSelect.options[els.customerTypeSelect.selectedIndex];
      selectedDiscountPct = Number(selectedOption.dataset.discount) || 0;
      renderCart();
      updatePaymentTotals();
    });
  }

  els.paymentMethodGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".method-btn");
    if (!btn) return;
    els.paymentMethodGroup.querySelectorAll(".method-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    toggleCashInputs(btn.dataset.method);
    // ريست الحقول عند تغيير الطريقة
    if (els.paidAmount) els.paidAmount.value = "";
    if (els.remainingAmount) els.remainingAmount.value = "";
    if (btn.dataset.method === "آجل") {
      const { total } = getCartTotals();
      if (els.paidAmount) els.paidAmount.value = "0";
      if (els.remainingAmount) els.remainingAmount.value = total.toFixed(2);
    }
  });

  // حساب المتبقي تلقائياً عند إدخال المدفوع
  if (els.paidAmount) {
    els.paidAmount.addEventListener("input", () => {
      const { total } = getCartTotals();
      const paid = parseFloat(els.paidAmount.value) || 0;
      const remaining = total - paid;
      if (els.remainingAmount) {
        els.remainingAmount.value = remaining.toFixed(2);
        // لون أحمر لو المدفوع أقل من الإجمال
        els.remainingAmount.style.color = remaining > 0 ? "#ef4444" : "#10b981";
      }
    });
  }

  const PAYMENT_METHODS = { "نقدي": "cash", "محفظة": "wallet", "انستا باي": "instapay", "آجل": "deferred" };

  async function resolveCustomerId() {
    const name = els.customerName?.value.trim();
    const phone = els.customerPhone?.value.trim();
    const address = els.customerAddress?.value.trim();
    if (!name && !phone && !address) return null;
    if (!name) throw new Error("اسم العميل مطلوب عند تسجيل بيانات العميل.");
    const customer = await api.post("/api/v1/customers", {
      name,
      phone: phone || null,
      address: address || null,
      customer_type_id: els.customerTypeSelect?.value || null
    });
    return customer?.id || customer?.customer?.id || customer?.data?.id;
  }

  els.confirmPaymentBtn.addEventListener("click", async () => {
    if (!els.salesSelect?.value) {
      showToast("اختر اسم السيلز قبل تأكيد الدفع", "error");
      els.salesSelect?.focus();
      return;
    }
    const shiftId = currentShift?.id || currentShift?.shift_id;
    if (!shiftId) {
      showToast("لا توجد وردية مفتوحة. افتح وردية قبل إتمام البيع.", "error");
      return;
    }
    const activeMethod = els.paymentMethodGroup.querySelector(".method-btn.is-active")?.dataset.method || "نقدي";
    const paymentMethod = PAYMENT_METHODS[activeMethod] || "cash";
    const { total } = getCartTotals();
    const paidAmount = paymentMethod === "deferred" ? Number(els.paidAmount?.value || 0) : total;
    const originalLabel = els.confirmPaymentBtn.innerHTML;
    els.confirmPaymentBtn.disabled = true;
    els.confirmPaymentBtn.textContent = "جاري تسجيل البيع...";
    try {
      const customerId = await resolveCustomerId();
      const sale = await api.post("/api/v1/sales/checkout", {
        items: state.cart.map(item => ({ variant_id: item.id, qty: item.qty, expected_version: item.version })),
        customer_id: customerId,
        sales_person_id: els.salesSelect.value,
        payment_method: paymentMethod,
        paid_amount: paidAmount,
        shift_id: shiftId,
        idempotency_key: crypto.randomUUID()
      });
      printReceipt(sale);
      showToast("تم تسجيل عملية البيع بنجاح ✓");
      state.cart = [];
      selectedDiscountPct = 0;
      renderCart();
      closePaymentModal();
      await loadPosData();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      els.confirmPaymentBtn.disabled = false;
      els.confirmPaymentBtn.innerHTML = originalLabel;
      updatePaymentTotals();
    }
  });

  function printReceipt(sale = {}) {
    const printArea = document.getElementById("printArea");
    if (!printArea) return;
    const { subtotal, discountValue, total } = getCartTotals();
    const now = new Date();
    const date = now.toLocaleDateString("ar-EG");
    const time = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    const invoiceNo = sale.invoice_number || sale.invoice?.invoice_number || `INV-${Date.now().toString().slice(-6)}`;
    const salesName = els.salesSelect?.selectedOptions[0]?.textContent || "—";

    if (window.GhaithPrint) {
      window.GhaithPrint.printReceipt({
        title: "فاتورة مبيعات",
        number: invoiceNo,
        date,
        time,
        cashier: "كاشير نقطة البيع",
        sales: salesName,
        payment: els.paymentMethodGroup.querySelector(".method-btn.is-active")?.dataset.method || "نقدي",
        items: state.cart.map(item => ({ name: item.name, sku: item.sku, qty: item.qty, price: item.price })),
        totals: [
          { label: "الإجمالي الفرعي", value: subtotal },
          ...(discountValue > 0 ? [{ label: "الخصم", value: discountValue, negative: true }] : []),
          { label: "الإجمالي النهائي", value: total, final: true }
        ]
      });
      return;
    }

    const html = `
      <div class="receipt">
        <div class="r-header">
          <h2>غيث للزي الاسلامي الراقي</h2>
          <p class="r-sub">فاتورة مبيعات</p>
          <p class="r-date">${date} — ${time} | رقم: ${invoiceNo}</p>
          <p class="r-date">السيلز: ${escapeHtml(salesName)}</p>
        </div>

        <table class="r-table">
          <thead>
            <tr>
              <th>الصنف</th>
              <th style="text-align:center">كمية</th>
              <th style="text-align:left">السعر</th>
            </tr>
          </thead>
          <tbody>
            ${state.cart.map(item => `
              <tr>
                <td class="item-name">${escapeHtml(item.name)}</td>
                <td class="item-qty">${item.qty}</td>
                <td class="item-price">${formatMoney(item.price * item.qty)} ج</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="r-totals">
          <div class="r-row"><span>إجمالي المنتجات:</span><span>${formatMoney(subtotal)} ج.م</span></div>
          ${discountValue > 0 ? `<div class="r-row"><span>الخصم:</span><span>- ${formatMoney(discountValue)} ج.م</span></div>` : ''}
          <div class="r-row r-final"><span>الصافي:</span><span>${formatMoney(total)} ج.م</span></div>
        </div>

        <div class="r-footer">
          <p>شكراً لزيارتكم ❤</p>
          <p>نتمنى لكم تجربة ممتازة</p>
        </div>
      </div>
    `;
    printArea.innerHTML = html;
    window.print();
  }

  /* ------------------------------------------------------------------ */
  /* 10) السلة على الموبايل (drawer)                                     */
  /* ------------------------------------------------------------------ */
  els.cartFab.addEventListener("click", () => {
    els.posCart.classList.add("is-open");
  });

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */
  renderCategoryChips();
  renderSalesUsers();
  renderProductGrid();
  renderCart();
  loadPosData();
  els.scanInput.focus();
})();
