// ==========================================================================
// نقطة البيع — منطق كامل: سلة، فلاتر تصنيف، بحث/سكانر باركود، مودال دفع.
// سكريبت عادي (مش ES module) عشان الصفحة تشتغل بالدبل كليك من غير سيرفر.
// لو حبيت تدمجها في راوتر المشروع الكامل، فكّها لـ modules واستخدم core/api.js
// بدل الـ MOCK_PRODUCTS ده.
// ==========================================================================

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
  /* 2) بيانات المنتجات (Mock) — في المشروع الحقيقي دي بترجع من api.js  */
  /*    /products?category=&search=  مع pagination، هنا مبسّطة للعرض   */
  /* ------------------------------------------------------------------ */
  const MOCK_PRODUCTS = [
    { id: "p1", sku: "THB-SUM-W-42", barcode: "6221031451427", name: "ثوب صيفي أبيض فاخر", price: 350, category: "رجالي", badge: "مقاس L" },
    { id: "p2", sku: "SHM-GTH-R-58", barcode: "6221031451434", name: "جلابية بيضاء فاخرة", price: 450, category: "رجالي", badge: "مقاس XL" },
    { id: "p3", sku: "GH-WNT-045", barcode: "6221031451441", name: "جلابية ملكي مطرز", price: 450, category: "رجالي", badge: "مقاس M" },
    { id: "p4", sku: "GH-BSH-B01", barcode: "6221031451458", name: "بشت حساوي فاخر أسود", price: 1200, category: "رجالي", badge: "مقاس XXL" },
    { id: "p5", sku: "ABY-001", barcode: "6221031451465", name: "عباية كلاسيك سوداء", price: 620, category: "حريمي", badge: "مقاس M" },
    { id: "p6", sku: "HJB-042", barcode: "6221031451472", name: "طرحة حرير بيج", price: 450, category: "حريمي", badge: "لون بيج" },
    { id: "p7", sku: "ISD-103", barcode: "6221031451489", name: "إسدال صلاة قطن", price: 320, category: "حريمي", badge: "مقاس فري" },
    { id: "p8", sku: "NQB-005", barcode: "6221031451496", name: "نقاب سعودي فاخر", price: 180, category: "حريمي", badge: "لون أسود" },
    { id: "p9", sku: "KID-JLB-3", barcode: "6221031451502", name: "جلابية أطفال قطن (3 قطع)", price: 280, category: "أطفال", badge: "مقاس 4-6" },
    { id: "p10", sku: "KID-ABY-9", barcode: "6221031451519", name: "عباية بنات مطرزة", price: 320, category: "أطفال", badge: "مقاس 8-10" },
    { id: "p11", sku: "PRF-MSK-01", barcode: "6221031451526", name: "عطر مسك ملكي 12مل", price: 210, category: "عطور", badge: "12 مل" },
    { id: "p12", sku: "PRF-OUD-07", barcode: "6221031451533", name: "بخور عود كمبودي", price: 380, category: "عطور", badge: "50 جم" },
  ];

  const CATEGORIES = ["الكل", "رجالي", "حريمي", "أطفال", "عطور"];
  const SALES_USERS = ["محمد أحمد", "محمود حسن", "سارة علي", "أسماء خالد"];

  /* ------------------------------------------------------------------ */
  /* 3) الحالة (State)                                                  */
  /* ------------------------------------------------------------------ */
  const state = {
    cart: [], // { id, name, price, qty }
    activeCategory: "الكل",
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

  function renderSalesUsers() {
    if (!els.salesSelect) return;
    const options = SALES_USERS.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
    els.salesSelect.insertAdjacentHTML("beforeend", options);
  }

  /* ------------------------------------------------------------------ */
  /* 6) السلة: إضافة / تعديل كمية / حذف                                 */
  /* ------------------------------------------------------------------ */
  function addToCart(product) {
    const existing = state.cart.find((item) => item.id === product.id);
    if (existing) {
      existing.qty += 1;
    } else {
      state.cart.push({ id: product.id, name: product.name, price: product.price, qty: 1 });
    }
    renderCart();
    showToast(`أُضيف "${product.name}" للسلة`);
  }

  function changeQty(id, delta) {
    const item = state.cart.find((i) => i.id === id);
    if (!item) return;
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
    els.categoryChips.innerHTML = CATEGORIES.map(
      (cat) => `<button class="chip-filter${cat === state.activeCategory ? " is-active" : ""}" data-cat="${cat}">${cat}</button>`
    ).join("");
  }

  els.categoryChips.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    state.activeCategory = btn.dataset.cat;
    renderCategoryChips();
    renderProductGrid();
  });

  function getFilteredProducts() {
    const q = state.searchQuery.trim().toLowerCase();
    return MOCK_PRODUCTS.filter((p) => {
      const matchesCategory = state.activeCategory === "الكل" || p.category === state.activeCategory;
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
          <span class="product-card__badge-stock">مخزون: ${p.stock || 12}</span>
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

  els.productGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".product-card");
    if (!card) return;
    const product = MOCK_PRODUCTS.find((p) => p.id === card.dataset.id);
    if (product) addToCart(product);
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
    return MOCK_PRODUCTS.find(product =>
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

  function submitScanInput(rawValue, reportMissing = false) {
    const value = normalizeScannedCode(rawValue);
    if (!value) return;

    const exactProduct = findProductByCode(value);
    if (exactProduct) {
      addToCart(exactProduct);
      resetScanField();
      return;
    }

    const query = value.toLowerCase();
    const matches = MOCK_PRODUCTS.filter(product =>
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
      showToast(`لم يتم العثور على منتج بالكود: ${value}`, "error");
      resetScanField();
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

  function handleBarcodeScan(code) {
    const normalizedCode = normalizeScannedCode(code);
    const product = findProductByCode(normalizedCode);
    if (product) {
      addToCart(product);
    } else {
      showToast(`لم يتم العثور على منتج بالكود: ${normalizedCode}`, "error");
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

  els.confirmPaymentBtn.addEventListener("click", () => {
    if (!els.salesSelect?.value) {
      showToast("اختر اسم السيلز قبل تأكيد الدفع", "error");
      els.salesSelect?.focus();
      return;
    }
    printReceipt();
    showToast("تم تسجيل عملية البيع بنجاح ✓");
    state.cart = [];
    selectedDiscountPct = 0;
    renderCart();
    closePaymentModal();
  });

  function printReceipt() {
    const printArea = document.getElementById("printArea");
    if (!printArea) return;
    const { subtotal, discountValue, total } = getCartTotals();
    const now = new Date();
    const date = now.toLocaleDateString("ar-EG");
    const time = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    const invoiceNo = `INV-${Date.now().toString().slice(-6)}`;
    const salesName = els.salesSelect?.value || "—";

    if (window.GhaithPrint) {
      window.GhaithPrint.printReceipt({
        title: "فاتورة مبيعات",
        number: invoiceNo,
        date,
        time,
        cashier: "كاشير نقطة البيع",
        sales: salesName,
        payment: document.querySelector('input[name="paymentMethod"]:checked')?.value || "نقدي",
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
  els.scanInput.focus();
})();
